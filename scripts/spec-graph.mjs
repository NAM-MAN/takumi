#!/usr/bin/env node
// spec-graph.mjs — M9 orphan-zero + AC-coverage を graph reachability で決定的に検証 (zero-dep)
//
// LLM 静的推論だった M9 (contract-spine.md) を pure graph に promote。
// `.takumi/specs/{surface}.md` の frontmatter (top_contract I1-I6/T1-T4) と
// 本文 AC エントリ (derived_from / covered_by / status / ac_class) を読み、双方向 orphan を洗う。
//
// 検出:
//   - orphan AC      : derived_from 空 (源なき成果物)                      → WARN (executor F0 で risk-gating)
//   - orphan 要素    : top_contract の I/T 項がどの AC からも未参照 (未実装要件) → WARN
//   - coverage gap   : executable AC で covered_by 空                       → HARD (AC-coverage gate ADOPT-narrow)
//     executable ≈ status=active ∧ ac_class≠metamorphic (commitment 近似、契約は contract-spine.md F0)
//
// usage: node scripts/spec-graph.mjs [specsDir]   (default .takumi/specs)
// exit 1 = coverage gap あり。orphan は WARN (出力のみ、止めない)。
//
// --- tier0-guard (enforcement registry: tier0-contract-immutable, safety: irreversible) ---
// contract-spine.md 「仕様ライフサイクル」節: TopContract の I1-I6/T1-T4 (Tier-0 保護核) は
// サイクル内不変。変更は「再組み込み」でなく契約改訂 (semver major 相当、human/軍師 ゲート必須)。
// このゲートを機械的に代替する: 各 spec の top_contract I/T フィールド値を baseline と比較し、
// 無承認の値変更を検出したら exit 1。新規 spec (baseline 不在) は追加なので pass。
//
// 承認 marker: 仕様 (contract-spine.md) はゲートの主体 (human/軍師) のみ定義し、機械可読な
// frontmatter field 名までは規定していない。本実装は frontmatter `tier0_change_approved_by:
// <承認者>` を独自規約として採用する (spec 由来ではない、tier0-guard 実装者の取り決め)。
// このフィールドが非空なら、その spec 内の Tier0 変更は承認済みとして pass する。
//
// usage:
//   node scripts/spec-graph.mjs --tier0-guard [specsDir]              (baseline = git show HEAD:<path>)
//   node scripts/spec-graph.mjs --tier0-guard [specsDir] --baseline <dir>  (git 不要、fixture 用ファイル比較)
// exit 1 = 無承認 Tier0 変更あり。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const TC_KEY = /^\s{2}(I[1-6]|T[1-4]):\s*(.*)$/

function extractFrontmatter(text) {
  const fmEnd = text.indexOf('\n---', 4)
  return text.slice(0, fmEnd > 0 ? fmEnd : 0)
}

function parseTopContractValues(fm) {
  const map = new Map()
  let inTC = false
  for (const line of fm.split('\n')) {
    if (/^top_contract:\s*$/.test(line)) { inTC = true; continue }
    if (inTC && /^\S/.test(line)) inTC = false
    if (inTC) {
      const m = line.match(TC_KEY)
      if (m) map.set(m[1], m[2].trim())
    }
  }
  return map
}

function parseApprovedBy(fm) {
  const m = fm.match(/^tier0_change_approved_by:\s*(.+)$/m)
  return m ? m[1].trim() : ''
}

function loadBaselineText(curPath, f, baselineDir) {
  if (baselineDir) {
    const bp = join(baselineDir, f)
    return existsSync(bp) ? readFileSync(bp, 'utf8') : null
  }
  try {
    return execSync(`git show HEAD:${curPath}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null // 未 track (新規追加) or git 不在
  }
}

function runTier0Guard(dir, baselineDir) {
  if (!existsSync(dir)) {
    console.log(`tier0-guard: ${dir} なし → skip (specs は project 側 artifact)`)
    return 0
  }
  const files = readdirSync(dir).filter(f => f.endsWith('.md'))
  const violations = []
  let checked = 0, added = 0, approved = 0
  for (const f of files) {
    const curPath = join(dir, f)
    const curFm = extractFrontmatter(readFileSync(curPath, 'utf8'))
    const baseText = loadBaselineText(curPath, f, baselineDir)
    if (baseText === null) {
      added++
      console.log(`  + ${f}: baseline なし → 新規追加 (pass)`)
      continue
    }
    checked++
    const baseTC = parseTopContractValues(extractFrontmatter(baseText))
    const curTC = parseTopContractValues(curFm)
    const keys = new Set([...baseTC.keys(), ...curTC.keys()])
    const changed = [...keys].filter(k => baseTC.get(k) !== curTC.get(k)).sort()
    if (changed.length === 0) {
      console.log(`  = ${f}: Tier0 変更なし`)
      continue
    }
    const approvedBy = parseApprovedBy(curFm)
    if (approvedBy) {
      approved++
      console.log(`  ✓ ${f}: Tier0 変更 [${changed.join(', ')}] 承認済み (tier0_change_approved_by: ${approvedBy})`)
    } else {
      violations.push(`${f}: 無承認 Tier0 変更 [${changed.join(', ')}]`)
    }
  }
  console.log(`\ntier0-guard: ${files.length} spec (baseline比較 ${checked} / 新規 ${added} / 承認済み変更 ${approved})`)
  if (violations.length) {
    console.error('\nHARD (tier0-contract-immutable):')
    for (const v of violations) console.error(`  ✗ ${v}`)
    console.error(`\nFAIL: ${violations.length} 無承認 Tier0 変更 (frontmatter に tier0_change_approved_by: <承認者> を追加するか変更を差し戻す)`)
    return 1
  }
  console.log(`\nPASS: 無承認 Tier0 変更 0`)
  return 0
}

const rawArgs = process.argv.slice(2)
if (rawArgs.includes('--tier0-guard')) {
  const bIdx = rawArgs.indexOf('--baseline')
  const baselineDir = bIdx >= 0 ? rawArgs[bIdx + 1] : null
  const positional = rawArgs.filter((a, i) => a !== '--tier0-guard' && !(bIdx >= 0 && (i === bIdx || i === bIdx + 1)))
  process.exit(runTier0Guard(positional[0] || '.takumi/specs', baselineDir))
}

const specsDir = process.argv[2] || '.takumi/specs'

if (!existsSync(specsDir)) {
  console.log(`spec-graph: ${specsDir} なし → skip (specs は project 側 artifact)`)
  process.exit(0)
}

const listVals = s => {
  const m = (s || '').match(/\[([^\]]*)\]/)
  return m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : []
}

function parseSpec(text, file) {
  // frontmatter (最初の --- ... ---)
  const fmEnd = text.indexOf('\n---', 4)
  const fm = text.slice(0, fmEnd > 0 ? fmEnd : 0)
  const tcDefined = new Set()
  let inTC = false
  for (const line of fm.split('\n')) {
    if (/^top_contract:\s*$/.test(line)) { inTC = true; continue }
    if (inTC && /^\S/.test(line)) inTC = false
    if (inTC) {
      const m = line.match(TC_KEY)
      if (m && m[2].trim() && m[2].trim() !== 'null') tcDefined.add(m[1])
    }
  }
  // 本文 AC エントリ
  const acs = []
  const lines = text.split('\n')
  let cur = null
  for (const raw of lines) {
    const idm = raw.match(/^\s*-\s+id:\s*(AC-[A-Z0-9-]+)/)
    if (idm) { cur = { id: idm[1], file, derived_from: [], covered_by: [], status: '', ac_class: '' }; acs.push(cur); continue }
    if (!cur) continue
    let m
    if ((m = raw.match(/^\s+derived_from:\s*(.*)$/))) cur.derived_from = listVals(m[1])
    else if ((m = raw.match(/^\s+covered_by:\s*(.*)$/))) cur.covered_by = listVals(m[1])
    else if ((m = raw.match(/^\s+status:\s*(\S+)/))) cur.status = m[1]
    else if ((m = raw.match(/^\s+ac_class:\s*(\S+)/))) cur.ac_class = m[1]
  }
  return { tcDefined, acs }
}

const files = readdirSync(specsDir).filter(f => f.endsWith('.md'))
const warn = [], hard = []
let totalAc = 0

for (const f of files) {
  const { tcDefined, acs } = parseSpec(readFileSync(join(specsDir, f), 'utf8'), f)
  totalAc += acs.length
  const referenced = new Set()
  for (const ac of acs) {
    for (const d of ac.derived_from) referenced.add(d)
    // orphan AC
    if (ac.derived_from.length === 0) warn.push(`orphan-AC: ${ac.id} (${f}) derived_from 空 = 源なき成果物`)
    // coverage gap (executable ∧ covered_by 空)
    const executable = ac.status === 'active' && ac.ac_class !== 'metamorphic'
    if (executable && ac.covered_by.length === 0) hard.push(`coverage-gap: ${ac.id} (${f}) executable なのに covered_by 空`)
  }
  // orphan TopContract 要素 (定義済 I/T で未参照)
  for (const k of tcDefined) if (!referenced.has(k)) warn.push(`orphan-element: ${k} (${f}) どの AC からも未参照 = 未実装要件`)
}

console.log(`spec-graph: ${files.length} spec / ${totalAc} AC`)
if (warn.length) { console.log('\nWARN (orphan、executor F0 で risk-gating):'); for (const w of warn) console.log(`  ⚠ ${w}`) }
if (hard.length) {
  console.error('\nHARD (AC-coverage gate):')
  for (const h of hard) console.error(`  ✗ ${h}`)
  console.error(`\nFAIL: ${hard.length} coverage gap`)
  process.exit(1)
}
console.log(`\nPASS: coverage gap 0 (orphan WARN ${warn.length})`)
