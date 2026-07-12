#!/usr/bin/env node
// replay-harness.mjs — paired replay corpus の validate + run manifest 生成 (P0/W1.2 足場)
// spec: skills/takumi/enforcement/replay/README.md
// 現段階の責務は (1) corpus schema 検証 (2) blind 裁定用 run manifest 生成 のみ。
// arm 実行 (fresh/diluted spawn) と裁定 subagent 起動は formal pilot 実走時に拡張する
// (別 repo corpus、docs/CONTRIBUTING/pilot-driven-development.md 準拠)。
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const args = process.argv.slice(2)
if (args.includes('--help') || args.length === 0) {
  console.log(`usage: replay-harness.mjs <corpus-dir> [--manifest-out <path>]
  corpus-dir 内の *.json を paired-case schema で検証し、blind 裁定用の
  run manifest (case_id → arm 割当をシャッフルした対応表) を生成する。
  schema 違反が 1 件でもあれば exit 1 (fail-closed)。`)
  process.exit(0)
}

const REQUIRED = ['case_id', 'task_prompt', 'context_source', 'dilution_prefix_tokens', 'rules_in_scope', 'rubric', 'authored_by', 'authored_at']
const corpusDir = args[0]
const outIdx = args.indexOf('--manifest-out')
const manifestOut = outIdx >= 0 ? args[outIdx + 1] : join(corpusDir, 'run-manifest.json')

if (!existsSync(corpusDir)) { console.error(`✗ corpus dir not found: ${corpusDir}`); process.exit(1) }
const files = readdirSync(corpusDir).filter(f => f.endsWith('.json') && f !== 'run-manifest.json')
if (files.length === 0) { console.error('✗ corpus is empty (no *.json cases)'); process.exit(1) }

const errors = []
const cases = files.flatMap(f => {
  try {
    const c = JSON.parse(readFileSync(join(corpusDir, f), 'utf8'))
    const missing = REQUIRED.filter(k => c[k] === undefined || c[k] === null || c[k] === '')
    if (missing.length) errors.push(`${f}: missing field(s) ${missing.join(', ')}`)
    if (Array.isArray(c.rubric) && !c.rubric.some(r => r.kind === 'continuous'))
      errors.push(`${f}: rubric に continuous 項目が無い (離散のみ = 品質連続量に盲目、README 参照)`)
    if (Array.isArray(c.rubric) && c.rubric.some(r => !r.item || !['discrete', 'continuous'].includes(r.kind)))
      errors.push(`${f}: rubric item は {item, kind: discrete|continuous} 必須`)
    return missing.length ? [] : [c]
  } catch (e) {
    errors.push(`${f}: JSON parse error (${e.message})`)
    return []
  }
})

const dup = cases.map(c => c.case_id).filter((id, i, a) => a.indexOf(id) !== i)
if (dup.length) errors.push(`duplicate case_id: ${[...new Set(dup)].join(', ')}`)

if (errors.length) {
  console.error(`✗ corpus validation FAILED (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

// blind 裁定用 manifest: arm 割当 (A/B ↔ fresh/diluted) を case ごとに決定的シャッフル
// (Math.random 不使用 — case_id の hash で決定的に割り当て、再現可能にする)
const hash = s => [...s].reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0)
const manifest = {
  generated_by: 'replay-harness.mjs v0.1 (skeleton)',
  corpus_dir: basename(corpusDir),
  cases: cases.map(c => ({
    case_id: c.case_id,
    arm_a: Math.abs(hash(c.case_id)) % 2 === 0 ? 'fresh' : 'diluted',
    arm_b: Math.abs(hash(c.case_id)) % 2 === 0 ? 'diluted' : 'fresh',
    note: 'judge には arm_a/arm_b 名のみ開示 (fresh/diluted ラベル非開示)'
  })),
  next_steps: 'arm 実行 + blind 裁定 spawn は formal pilot 実走時に拡張 (README)'
}
mkdirSync(join(corpusDir), { recursive: true })
writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n')
console.log(`✓ corpus valid: ${cases.length} paired case(s), manifest → ${manifestOut}`)
