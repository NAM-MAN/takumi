#!/usr/bin/env node
// check-toishi-snapshot.mjs — G1.5 fail-closed (snapshot 不在時の defer) を決定的に監査 (zero-dep、T1)
//
// registry: toishi-g15-fail-closed (safety: irreversible)。仕様 source は skills/takumi/toishi-integration.md
// §G1.5 gate の fail-closed ルール (「snapshot 取得失敗 + 既存 snapshot も無い」時、G1.5 は当該 Cycle の
// 全 toishi-紐づき task を defer しなければならない = proceed を絶対許さない)。
// 本 script はこの不変条件を「requirements.source == toishi」の project に対して静的に検査する:
//
//   requirements.source == toishi
//   ∧ snapshot が 1 つも存在しない (.takumi/agreements/toishi-snapshot-*.json 皆無)
//   ∧ fail-closed defer が telemetry に記録されていない (toishi-events.jsonl に g1_5_fail_closed:true なし)
//   ∧ Wave 1 実装が進行した痕跡がある (active plan の "## Wave 1" section 内に "- [x]" checked task)
//   ⇒ FAIL (defer せず Wave 1 に着手した = fail-closed 違反)
//
// 検査対象外 (静的に判定不能なため、限界として明記。README 節も参照):
//   - Cycle ID の正しさ (sprint/normal どちらの cycle に snapshot が紐づくか) は検査しない。
//     snapshot ファイルが project 内に 1 つでも存在すれば「実在」とみなす (最小不変条件に絞る)。
//   - task 単位の approval_state (pending_approval/draft/rejected) 別の defer/halt 分岐は検査しない。
//     本 script は「snapshot 不在」ケースの fail-closed のみを見る (registry の rule 名と一致)。
//   - G1.5 escape hatch (`toishi_gate_override: spike`) は task 単位の宣言であり、静的 regex では
//     「どの task が override 対象か」を安全に特定できない。plan 内に override 宣言が 1 件でもあれば
//     判定不能として skip (false positive を避ける、fail-open ではなく「検査対象外」として exit 0)。
//   - plan file の特定は state.json.plan_file を優先し、無ければ .takumi/plans/*.md をファイル名順で
//     最後のものを採用する (mtime ではない、複数 plan 併存時は限界)。
//
// usage: node scripts/check-toishi-snapshot.mjs [project-root]   (default .)
// exit 0 = no-op (source != toishi) or 違反なし。exit 1 = fail-closed 違反。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function printHelp() {
  console.log(`check-toishi-snapshot.mjs — G1.5 fail-closed (snapshot 不在時の defer) を決定的に監査

usage: node scripts/check-toishi-snapshot.mjs [project-root]

  project-root   .takumi/ を含む project の root (default: .)

exit 0: requirements.source != toishi (no-op) / 違反なし
exit 1: toishi mode かつ snapshot 不在かつ fail-closed defer 未記録かつ Wave 1 進行痕跡あり

詳細仕様: skills/takumi/toishi-integration.md #G1.5 の fail-closed ルール`)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp()
  process.exit(0)
}

const root = process.argv[2] || '.'
const projectYamlPath = join(root, '.takumi/project.yaml')

if (!existsSync(projectYamlPath)) {
  console.log(`check-toishi-snapshot: ${projectYamlPath} なし → no-op PASS`)
  process.exit(0)
}

// requirements.source を行 regex で取得 (YAML parser 不使用、規約踏襲)。
// "requirements:" ブロック配下の "source:" のみを見る (無関係な source: との混同防止)。
function readRequirementsSource(yamlText) {
  const blockMatch = yamlText.match(/^requirements:\s*\n((?:[ \t]+.*\n?)*)/m)
  if (!blockMatch) return 'unset'
  const srcMatch = blockMatch[1].match(/^\s*source:\s*(\S+)/m)
  if (!srcMatch) return 'unset'
  return srcMatch[1].replace(/^["']|["']$/g, '')
}

const yamlText = readFileSync(projectYamlPath, 'utf8')
const source = readRequirementsSource(yamlText)

if (source !== 'toishi') {
  console.log(`check-toishi-snapshot: requirements.source="${source}" (toishi以外) → no-op PASS`)
  process.exit(0)
}

// 1. snapshot 実在チェック
const agreementsDir = join(root, '.takumi/agreements')
const hasSnapshot =
  existsSync(agreementsDir) &&
  readdirSync(agreementsDir).some((f) => /^toishi-snapshot-.*\.json$/.test(f))

if (hasSnapshot) {
  console.log('check-toishi-snapshot: requirements.source=toishi、snapshot 実在 → PASS')
  process.exit(0)
}

// 2. snapshot 不在 → fail-closed defer が telemetry に記録済みか確認
const telemetryPath = join(root, '.takumi/telemetry/toishi-events.jsonl')
let hasFailClosedDefer = false
if (existsSync(telemetryPath)) {
  const lines = readFileSync(telemetryPath, 'utf8').split('\n').filter((l) => l.trim())
  for (const line of lines) {
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue // invalid JSON 行は本 script の対象外 (validate-telemetry.mjs の役割)
    }
    if (o.g1_5_fail_closed === true) {
      hasFailClosedDefer = true
      break
    }
  }
}

if (hasFailClosedDefer) {
  console.log('check-toishi-snapshot: snapshot 不在だが fail-closed defer 記録あり (g1_5_fail_closed:true) → PASS')
  process.exit(0)
}

// 3. defer 記録も無い → Wave 1 進行痕跡を確認 (静的判定可能な最小シグナルのみ)
function resolvePlanFile() {
  const statePath = join(root, '.takumi/state.json')
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'))
      if (state.plan_file) {
        const p = join(root, state.plan_file)
        if (existsSync(p)) return p
      }
    } catch {
      // invalid state.json は本 script の対象外、fallback へ
    }
  }
  const plansDir = join(root, '.takumi/plans')
  if (existsSync(plansDir)) {
    const mdFiles = readdirSync(plansDir).filter((f) => f.endsWith('.md')).sort()
    if (mdFiles.length) return join(plansDir, mdFiles.at(-1))
  }
  return null
}

const planFile = resolvePlanFile()

if (!planFile) {
  console.log('check-toishi-snapshot: plan file 不明 → Wave 1 進行痕跡を判定不能、skip PASS')
  process.exit(0)
}

const planText = readFileSync(planFile, 'utf8')

// escape hatch override 宣言があると task 単位の判定が静的 regex では不能 → 検査対象外
if (/toishi_gate_override\s*:/.test(planText)) {
  console.log('check-toishi-snapshot: plan 内に toishi_gate_override 宣言あり → task単位判定不能、検査対象外 skip PASS')
  process.exit(0)
}

// "## Wave 1" ~ 次の "## Wave N" 見出し (or EOF) の範囲を抽出
function extractWaveOneSection(text) {
  const lines = text.split('\n')
  let capturing = false
  const collected = []
  for (const line of lines) {
    const heading = line.match(/^#+\s*Wave\s*(\d+)\b/i)
    if (heading) {
      if (heading[1] === '1') {
        capturing = true
        collected.push(line)
        continue
      }
      if (capturing) break // 次の Wave 見出しに到達、Wave 1 section 終了
      capturing = false
      continue
    }
    if (capturing) collected.push(line)
  }
  return collected.length ? collected.join('\n') : null
}

const wave1Section = extractWaveOneSection(planText)

if (!wave1Section) {
  console.log(`check-toishi-snapshot: ${planFile} に "## Wave 1" section なし → 進行痕跡なしと判定、PASS`)
  process.exit(0)
}

const wave1HasProgress = /^\s*-\s*\[x\]/mi.test(wave1Section)

if (wave1HasProgress) {
  console.error(
    'FAIL: requirements.source=toishi ∧ snapshot 不在 ∧ fail-closed defer 記録なし ∧ Wave 1 task 着手済み (checked box 検出) ' +
      '— G1.5 fail-closed 違反 (skills/takumi/toishi-integration.md #G1.5 fail-closed ルール)'
  )
  process.exit(1)
}

console.log('check-toishi-snapshot: snapshot 不在だが Wave 1 進行痕跡なし (defer 待ち状態として整合) → PASS')
