#!/usr/bin/env node
// validate-telemetry.mjs — telemetry jsonl の event schema を検証 (zero-dep、T1)
//
// census surprise#3: telemetry-spec.md は 9/9 T1 (純 event schema) → 機械検証可能。
// 各 .takumi/telemetry/*.jsonl の行が valid JSON かつ event 種別ごとの必須 field を持つか検査。
// registry: telemetry-event-schema。enforcement/README.md 参照。
//
// usage: node scripts/validate-telemetry.mjs [glob-dir]   (default .takumi/telemetry)
// exit 1 = schema 違反あり。

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] || '.takumi/telemetry'

// event 種別ごとの必須 field (discriminator + 主要 key)。enforcement-coverage-schema.md と整合
const SCHEMAS = {
  coverage_check:   ['unanchored', 'orphan_rule', 'exit'],
  reviewer_seeded:  ['rule_id', 'seeded_pass_rate', 'live'],
  reviewer_verdict: ['rule_id', 'quorum_met'],
  violation:        ['rule_id', 'tier'],
  wave_boundary:    ['wave', 'asked_continue'],
  // profile-usage 系 (既存)
  gate_passed:      [],
  gate_failed:      [],
}
// autonomy-decision.jsonl は `event` でなく `gate` discriminator
const AUTONOMY_REQUIRED = ['gate', 'verdict']

function validateLine(obj, file) {
  const errs = []
  if (file.includes('autonomy-decision')) {
    for (const k of AUTONOMY_REQUIRED) if (!(k in obj)) errs.push(`missing "${k}"`)
    return errs
  }
  const ev = obj.event
  if (!ev) return ['missing "event"']
  const req = SCHEMAS[ev]
  if (!req) return [`unknown event "${ev}"`]
  for (const k of req) if (!(k in obj)) errs.push(`event=${ev} missing "${k}"`)
  return errs
}

if (!existsSync(dir)) { console.log(`validate-telemetry: ${dir} なし → skip`); process.exit(0) }

const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'))
let total = 0, bad = 0
const problems = []

for (const f of files) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(l => l.trim())
  lines.forEach((line, i) => {
    total++
    let obj
    try { obj = JSON.parse(line) } catch { bad++; problems.push(`${f}:${i + 1} invalid JSON`); return }
    const errs = validateLine(obj, f)
    if (errs.length) { bad++; problems.push(`${f}:${i + 1} ${errs.join(', ')}`) }
  })
}

console.log(`validate-telemetry: ${files.length} file / ${total} event`)
if (problems.length) {
  console.error('\nschema 違反:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error(`\nFAIL: ${bad}/${total}`)
  process.exit(1)
}
console.log(`PASS: ${total} event 全 schema 適合`)
