#!/usr/bin/env node
// check-enforcement-coverage.mjs — enforcement-coverage gate (check-md-refs.mjs 兄弟、zero-dep)
//
// 全 RULE anchor が registry に live mechanism を持つことを双方向で検証 (M9 orphan-zero 同型)。
// 設計: skills/takumi/enforcement/README.md / registry.yaml
//
// HARD (exit 1):
//   - forward orphan : md の <!-- RULE: id ... --> で registry に無い id
//   - source 不在    : registry entry の source ファイルが disk に無い
//   - dead mechanism : evidence_required:true なのに mechanism path が disk に無い
// ADVISORY (warn、informational のみ — strict でも hard にしない、軍師 Q4-2 / W0 realism):
//   - enforced vs provisional 内訳 (KPI = enforced rule 数、網羅率でない)
//   - section anchor census (全 section anchor は NON-GOAL、registry coverage_policy)
// HARD under --strict (配布前、唯一の昇格 gate):
//   - safety-without-mechanism = safety!=none ∧ evidence_required:false (enforced と誤認禁止)
//
// usage: node scripts/check-enforcement-coverage.mjs [--strict]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL = join(ROOT, 'skills/takumi')
const REGISTRY = join(SKILL, 'enforcement/registry.yaml')
const STRICT = process.argv.includes('--strict')

// --- minimal YAML-subset parser (registry.yaml の rules: list 専用) ---
function parseRegistry(text) {
  const lines = text.split('\n')
  const rules = []
  let inRules = false
  let cur = null
  for (const raw of lines) {
    if (/^rules:\s*$/.test(raw)) { inRules = true; continue }
    if (!inRules) continue
    if (/^\S/.test(raw)) break // top-level key after rules ends the list
    const item = raw.match(/^\s+-\s+([a-z_]+):\s*(.*)$/i)
    if (item && item[1] === 'id') {
      cur = {}
      rules.push(cur)
      cur.id = stripVal(item[2])
      continue
    }
    const kv = raw.match(/^\s+([a-z_]+):\s*(.*)$/i)
    if (kv && cur) cur[kv[1]] = stripVal(kv[2])
  }
  return rules
}
function stripVal(v) {
  let s = v.replace(/\s+#.*$/, '').trim()          // 行末コメント除去
  s = s.replace(/^["']|["']$/g, '')                 // クォート除去
  if (s === 'true') return true
  if (s === 'false') return false
  return s
}

// --- md walk ---
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules') walk(p, acc) }
    else if (name.endsWith('.md')) acc.push(p)
  }
  return acc
}

const ANCHOR_RE = /<!--\s*RULE:\s*([a-z0-9-]+)\s+T(\d):(\S+?)\s*-->/gi
const HEADING_RE = /^#{2,3}\s/

function scanMd(files) {
  const anchors = new Map()  // id -> {file, tier, mechanism}
  let sections = 0, anchoredSections = 0
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    let inFence = false
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
      if (inFence) continue // fenced code (ドキュメント例) は anchor/heading に数えない
      if (HEADING_RE.test(line)) {
        sections++
        if (/<!--\s*RULE:/.test(line)) anchoredSections++
      }
      let m
      ANCHOR_RE.lastIndex = 0
      while ((m = ANCHOR_RE.exec(line))) {
        anchors.set(m[1], { file: f, tier: Number(m[2]), mechanism: m[3] })
      }
    }
  }
  return { anchors, sections, anchoredSections }
}

// mechanism が path 形式なら disk 存在を解決
function mechanismLive(mech) {
  if (!mech || !mech.includes('/')) return true // abstract (kernel-reanchor 等) は skip
  const path = mech.split('#')[0]
  const candidates = [join(ROOT, path), join(SKILL, path)]
  return candidates.some(existsSync)
}
function sourceFile(src) {
  return (src || '').split('#')[0]
}

// --- main ---
const registry = parseRegistry(readFileSync(REGISTRY, 'utf8'))
const ids = new Set(registry.map(r => r.id))
const mdFiles = walk(SKILL)
const { anchors, sections, anchoredSections } = scanMd(mdFiles)

const hard = []
const warn = []

// 1. forward orphan: md anchor が registry に無い
for (const [id, a] of anchors) {
  if (!ids.has(id)) hard.push(`forward-orphan: anchor "${id}" (${a.file.replace(ROOT + '/', '')}) が registry に無い`)
}
// 2. source 不在 + 3. dead mechanism (evidence:true)
for (const r of registry) {
  const srcRel = sourceFile(r.source)
  if (srcRel && !existsSync(join(SKILL, srcRel)) && !existsSync(join(ROOT, srcRel))) {
    hard.push(`source-missing: rule "${r.id}" の source "${srcRel}" が disk に無い`)
  }
  if (r.evidence_required === true && !mechanismLive(r.mechanism)) {
    hard.push(`dead-mechanism: rule "${r.id}" (evidence_required:true) の mechanism "${r.mechanism}" が disk に無い`)
  }
}
// 4. enforced vs provisional 内訳 (W0 realism、軍師 Q4-2)。KPI は enforced 数、網羅率でない。
const liveEnforced = registry.filter(r => r.evidence_required === true && mechanismLive(r.mechanism)).length
const provisional = registry.filter(r => r.evidence_required === false).length
const ratio = registry.length ? provisional / registry.length : 0
// 5. section anchor census (W0: 全 section anchor は NON-GOAL、informational のみ)
const kpiMsg = `KPI enforced rule 数 ${liveEnforced} (evidence:true ∧ mechanism live) ← 網羅率でなくこれを増やす`
const provMsg = `provisional ${provisional}/${registry.length} (${(ratio * 100).toFixed(0)}%、placeholder=未実装、enforced と別カウント・段階実装 backlog)`
const censusMsg = `section census ${anchoredSections}/${sections} anchored (全 section anchor は NON-GOAL、registry coverage_policy 参照)`
// W0: provisional 比率と section 網羅率は **非目標**なので strict でも hard にしない (軍師 Q4-2)。
// 配布前 hard gate は safety-without-mechanism のみ (下) = 「enforced と誤認」させない 1 点に絞る。
warn.push(provMsg)
warn.push(censusMsg)

// 軍師裁定 (2026-06-03 ADOPT-narrow #3): safety rule で mechanism 未実装 (evidence_required:false) は
// 「enforced と誤認」させてはならない最大リスク。これらは自動的に human floor / manual へ落とす扱い。
// capability matrix を機械化: 必ず prominent に列挙し、enforced 扱いを禁止する。
const safetyGaps = registry.filter(r => r.safety && r.safety !== 'none' && r.evidence_required === false)
if (safetyGaps.length) {
  // bootstrap 中は WARN (loud)、--strict (配布前) は HARD = mechanism 実装 or human-fallback 明示まで配布不可
  ;(STRICT ? hard : warn).push(`safety-without-mechanism (${safetyGaps.length}) → **enforced と誤認禁止・human floor 必須**: ` +
    safetyGaps.map(r => `${r.id}(${r.safety})`).join(', '))
}

// --- report ---
console.log(`enforcement-coverage: registry ${registry.length} rules (enforced ${liveEnforced} / provisional ${provisional}) / md ${mdFiles.length} files / anchors ${anchors.size}`)
console.log(`  ${kpiMsg}`)
console.log(`  ${provMsg}`)
console.log(`  ${censusMsg}`)
if (warn.length) { console.log('\nADVISORY (informational・非目標 — strict でも hard にしない):'); for (const w of warn) console.log(`  ⚠ ${w}`) }
if (hard.length) {
  console.error('\nHARD violations:')
  for (const h of hard) console.error(`  ✗ ${h}`)
  console.error(`\nFAIL: ${hard.length} hard violation(s)`) // exit 1
  process.exit(1)
}
console.log(`\nPASS${STRICT ? ' (strict)' : ''}: hard violation 0`)
