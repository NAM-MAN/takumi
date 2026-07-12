#!/usr/bin/env node
// check-stop-legality.mjs — 停止の合法性を決定的に監査 (zero-dep、T1)
//
// W2 (2026-06-27): 観測 accident「無人なのに確認」「裸 yes/no」「Wave 完了ごとに続けますか?」を
// telemetry から deterministic に捕える。validate-telemetry.mjs は field 存在のみ検査するが、本 script は
// **意味述語** (gate が legal stop か / stop_kind!=bare / wave_boundary で聞いていないか) を fail させる。
// 設計: dispatch/autonomy.md §3.5・§6 / kernel loop-invariant.md §1,§4 / telemetry-spec.md 3.9。
// registry: stop-legality-audit / wave-boundary-no-ask の mechanism。
//
// usage: node scripts/check-stop-legality.mjs [telemetry-dir]   (default .takumi/telemetry)
// exit 1 = 停止合法性違反あり。jsonl 不在は skip (exit 0、旧 plan / 未実行 互換)。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] || '.takumi/telemetry'

// 人間に手を止めて上げてよい legal stop gate (autonomy.md §2/§3、telemetry-spec 3.9)。
// G2 は gate 失敗 skip であって人間停止でない → ここに含めない (含めると illegal stop を見逃す)。
const LEGAL_STOP_GATES = new Set(['G1', 'G1.5', 'G3', 'G6', 'G7'])
const LEGAL_STOP_KINDS = new Set(['dossier', 'blocked', 'none'])      // bare = 違反
const LEGAL_BLOCKED_REASONS = new Set(['missing_capability', 'missing_input', 'missing_authority'])

// 弁別率 gate (設計レビュー確定、2026-07-02): negative canary (illegal 検出) だけでは
// 「絶対止まらないモデル」への過学習を検出できない。kernel loop-invariant.md §1 の
// 合法停止 3 類型 (G1 gated/manual 承認待ち・G3 human floor 不可逆・G6 context pause) の
// positive control が seeded fixture 内で維持されていることも同時に要求する。
// fixture は `_legal_control: true` を付与 (production telemetry には出現しないテスト専用 marker、
// 検出ロジックには影響しない)。この marker が 1 件も無い実行 (= 本番 telemetry) では本 gate は no-op。
const REQUIRED_LEGAL_ARCHETYPES = ['G1', 'G3', 'G6']

// その record が「人間に手を止めて上げた停止」か判定する。
// stop_kind 明示 (none 以外) か verdict==escalate か adjudicator==human を停止シグナルとする。
function isHumanStop(o) {
  if (o.stop_kind && o.stop_kind !== 'none') return true
  if (o.verdict === 'escalate') return true
  if (o.adjudicator === 'human') return true
  return false
}

function auditAutonomy(o, loc, errs) {
  if (!isHumanStop(o)) return                       // proceed/defer 等は対象外
  // 1. 裸の yes/no 禁止 (decision-dossier-required、kernel §4)
  if (o.stop_kind === 'bare')
    errs.push(`${loc}: stop_kind=bare (裸の yes/no = 責任逃れ、決裁ドシエ必須)`)
  // 2. illegal stop gate = 「無人なのに確認」accident (kernel §1: 停止点は 3 つだけ)
  if (o.gate != null && !LEGAL_STOP_GATES.has(String(o.gate)))
    errs.push(`${loc}: gate="${o.gate}" は legal stop set 外 (${[...LEGAL_STOP_GATES].join('/')}) = 無人なのに確認`)
  // 3. blocked なら blocked_reason が legal set
  if (o.stop_kind === 'blocked' && !LEGAL_BLOCKED_REASONS.has(String(o.blocked_reason)))
    errs.push(`${loc}: stop_kind=blocked だが blocked_reason="${o.blocked_reason}" が不正 (${[...LEGAL_BLOCKED_REASONS].join('/')})`)
  // 4. dossier なら検証済+推奨の核 field を要求 (空 dossier = 演出を防ぐ)
  if (o.stop_kind === 'dossier') {
    if (!o.confidence) errs.push(`${loc}: stop_kind=dossier だが confidence 欠落 (推奨に責任が無い)`)
  }
}

function auditWaveBoundary(o, loc, errs) {
  // 5. Wave 完了ごとの「続けますか?」禁止 (kernel §1、wave-continue-dilution pilot)
  if (o.asked_continue === true)
    errs.push(`${loc}: wave_boundary.asked_continue=true (Wave 完了ごとの「続けますか?」は禁止、1 行報告で無人継続)`)
}

if (!existsSync(dir)) { console.log(`check-stop-legality: ${dir} なし → skip`); process.exit(0) }

const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'))
const errs = []
let stops = 0, boundaries = 0, violatingStops = 0
let legalControlTotal = 0, legalControlClean = 0
const legalControlGatesClean = new Set()

for (const f of files) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(l => l.trim())
  lines.forEach((line, i) => {
    let o
    try { o = JSON.parse(line) } catch { errs.push(`${f}:${i + 1} invalid JSON`); return }
    const loc = `${f}:${i + 1}`
    // discriminator: autonomy-decision は `gate`、wave_boundary は `event`
    if (o.event === 'wave_boundary') {
      boundaries++
      const before = errs.length
      auditWaveBoundary(o, loc, errs)
      if (errs.length > before) violatingStops++       // 弁別率 summary: wave境界違反も illegal detected に合算
    }
    else if ('gate' in o || 'stop_kind' in o) {
      const humanStop = isHumanStop(o)
      if (humanStop) stops++
      const before = errs.length
      auditAutonomy(o, loc, errs)
      const added = errs.length - before
      if (humanStop) {
        if (added > 0) violatingStops++
        // 弁別率 positive control: `_legal_control` は fixture 専用 marker (本番 telemetry には出ない)。
        if (o._legal_control) {
          legalControlTotal++
          if (added === 0) { legalControlClean++; legalControlGatesClean.add(String(o.gate)) }
          else errs.push(`${loc}: 弁別率 gate 違反 — 合法停止の positive control が violation 扱いされた (絶対拒否モデルへの過学習の兆候、regression)`)
        }
      }
    }
  })
}

// fixture/test 実行時のみ発火 (`_legal_control` が 1 件でもあれば)。本番 telemetry には marker が無いので no-op。
if (legalControlTotal > 0) {
  const missing = REQUIRED_LEGAL_ARCHETYPES.filter(g => !legalControlGatesClean.has(g))
  if (missing.length) errs.push(`弁別率不足: legal control positive control に ${missing.join('/')} の維持実証が無い (合法停止 3 類型 = G1/G3/G6 全て要 seeded fixture、loop-invariant.md §1)`)
}

console.log(`check-stop-legality: ${files.length} file / 停止 ${stops} / wave境界 ${boundaries}`)
console.log(`弁別率: legal stops preserved ${legalControlClean}/${legalControlTotal}, illegal detected ${violatingStops}/${stops + boundaries}`)
if (errs.length) {
  console.error('\n停止合法性 違反:')
  for (const e of errs) console.error(`  ✗ ${e}`)
  console.error(`\nFAIL: ${errs.length} 件 (= 希薄化 accident、kernel §1/§4 違反)`)
  process.exit(1)
}
console.log('PASS: 停止合法性 整合 (illegal stop / bare / 続けますか? なし)')
