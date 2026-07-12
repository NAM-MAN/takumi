#!/usr/bin/env node
// check-reviewer-seeded.mjs — T2 reviewer の go-live 前提条件を決定的に検査 (zero-dep、T1)
//
// W3 (2026-06-27): 「seeded スイートを pass して初めて live (未pass = orphan)」(軍師 1b) の
// **前提条件 (precondition)** を機械化する。本 script は LLM を起動できないので pass率は測れない —
// 代わりに「live を主張する (evidence_required:true) T2 reviewer は、両極性 (bad∧clean) を含む
// well-formed な seeded スイートと verdict 契約を持つ」ことを deterministic に強制する。
// 実際の LLM seeded-pass 実行は takumi runtime (executor が reviewer subagent を各 case に起動) の責務。
// これにより「seeded 無し / clean だけ (gaming) / verdict 契約欠落」の reviewer は live になれない。
// 設計: enforcement/reviewers/README.md「go-live ゲート」/ registry.yaml#thresholds。
//
// usage: node scripts/check-reviewer-seeded.mjs [--strict]
// exit 1 = live T2 reviewer が前提条件を満たさない。

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL = join(ROOT, 'skills/takumi')
const REGISTRY = join(SKILL, 'enforcement/registry.yaml')
const MIN_CASES = 5            // 両極性込みの最小 case 数 (oracle/plan-contract は 7)

// registry の rules: list から T2 entry を雑に抽出 (check-enforcement-coverage と同じ部分集合 parser)
function parseRules(text) {
  const rules = []; let inRules = false, cur = null
  for (const raw of text.split('\n')) {
    if (/^rules:\s*$/.test(raw)) { inRules = true; continue }
    if (!inRules) continue
    if (/^\S/.test(raw)) break
    const id = raw.match(/^\s+-\s+id:\s*(.*)$/)
    if (id) { cur = { id: strip(id[1]) }; rules.push(cur); continue }
    const kv = raw.match(/^\s+([a-z_]+):\s*(.*)$/i)
    if (kv && cur) cur[kv[1]] = strip(kv[2])
  }
  return rules
}
const strip = v => { let s = v.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, ''); return s === 'true' ? true : s === 'false' ? false : s }

function seededPathFor(mechRel) {
  // enforcement/reviewers/oracle.md → enforcement/reviewers/_seeded/oracle.jsonl
  const dir = dirname(mechRel)
  const name = basename(mechRel).replace(/\.md$/, '')
  return join(SKILL, dir, '_seeded', `${name}.jsonl`)
}

function auditSeeded(seededPath, errs, label) {
  if (!existsSync(seededPath)) { errs.push(`${label}: seeded スイート無し (${seededPath.replace(ROOT + '/', '')}) = live 不可`); return }
  const lines = readFileSync(seededPath, 'utf8').split('\n').filter(l => l.trim())
  let bad = 0, clean = 0
  lines.forEach((line, i) => {
    let o; try { o = JSON.parse(line) } catch { errs.push(`${label}:${i + 1} invalid JSON`); return }
    const loc = `${label}:${i + 1}`
    if (!o.id) errs.push(`${loc} id 欠落`)
    if (!['bad', 'clean'].includes(o.kind)) errs.push(`${loc} kind 不正 (${o.kind})`)
    if (!['catch', 'pass'].includes(o.must)) errs.push(`${loc} must 不正 (${o.must})`)
    if (o.kind === 'bad' && o.must !== 'catch') errs.push(`${loc} bad なのに must!=catch`)
    if (o.kind === 'clean' && o.must !== 'pass') errs.push(`${loc} clean なのに must!=pass`)
    if (!o.diff && !o.task) errs.push(`${loc} payload (diff|task) 欠落`)
    if (o.kind === 'bad') bad++; else if (o.kind === 'clean') clean++
  })
  // 両極性の強制 (clean だけ / bad だけ では gaming できる)
  if (bad < 1) errs.push(`${label}: bad(must:catch) case が 0 (検出力を検証できない)`)
  if (clean < 1) errs.push(`${label}: clean(must:pass) case が 0 (false-positive を検証できない)`)
  if (lines.length < MIN_CASES) errs.push(`${label}: case 数 ${lines.length} < ${MIN_CASES} (両極性の被覆不足)`)
}

function auditVerdictContract(mechRel, errs, label) {
  const p = join(SKILL, mechRel)
  if (!existsSync(p)) { errs.push(`${label}: reviewer prompt 無し (${mechRel})`); return }
  const text = readFileSync(p, 'utf8')
  if (!/verdict/.test(text)) errs.push(`${label}: reviewer に verdict 契約が無い`)
  // pass + (block|fix|escalate) + (uncertain|low) の語彙が揃うか (verdict 専用契約)
  if (!/pass/.test(text)) errs.push(`${label}: verdict に pass が無い`)
  if (!/(fix|block)/.test(text)) errs.push(`${label}: verdict に fix/block が無い`)
  if (!/(escalate|uncertain)/.test(text)) errs.push(`${label}: verdict に escalate/uncertain が無い`)
}

const rules = parseRules(readFileSync(REGISTRY, 'utf8'))
const t2 = rules.filter(r => r.tier == 2 && r.mechanism && r.mechanism.includes('/'))
const liveReviewers = new Map()   // reviewer mechanism → claiming rule ids
for (const r of t2) {
  if (r.evidence_required === true) {
    if (!liveReviewers.has(r.mechanism)) liveReviewers.set(r.mechanism, [])
    liveReviewers.get(r.mechanism).push(r.id)
  }
}

const errs = []
const provisional = t2.filter(r => r.evidence_required === false)
for (const [mech, ids] of liveReviewers) {
  const label = basename(mech).replace(/\.md$/, '')
  auditVerdictContract(mech, errs, label)
  auditSeeded(seededPathFor(mech), errs, label)
}

console.log(`check-reviewer-seeded: live T2 reviewer ${liveReviewers.size} / provisional T2 rule ${provisional.length}`)
for (const [mech, ids] of liveReviewers) console.log(`  live: ${basename(mech)} ← ${ids.join(', ')}`)
if (provisional.length) console.log(`  provisional (未 live、seeded 不要): ${provisional.map(r => r.id).join(', ')}`)
if (errs.length) {
  console.error('\ngo-live 前提条件 違反:')
  for (const e of errs) console.error(`  ✗ ${e}`)
  console.error(`\nFAIL: ${errs.length} 件 (live 主張 reviewer が seeded/verdict 契約を欠く = orphan)`)
  process.exit(1)
}
console.log('PASS: 全 live T2 reviewer が両極性 seeded + verdict 契約を保持')
