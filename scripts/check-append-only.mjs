#!/usr/bin/env node
// check-append-only.mjs — 監査証跡 jsonl が append-only (改竄/切詰なし) を決定的に検証 (zero-dep、T1)
//
// autonomy-decision.jsonl 等は「なぜ proceed/stop したか」を後から追える監査証跡。
// 既存行の書換え・削除・切詰は監査の信頼性を破壊する (safety: irreversible)。
// baseline (既定 git HEAD) が current の prefix である (= 末尾追加のみ) ことを検査。
// registry: autonomy-decision-append-only の mechanism。
//
// usage:
//   node scripts/check-append-only.mjs <file>                  # baseline = git HEAD:<file>
//   node scripts/check-append-only.mjs <file> --baseline <f2>  # baseline を明示 (テスト用)
// exit 1 = append-only 違反 (既存行が変更/削除された)。

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--') && a !== args[args.indexOf('--baseline') + 1])
const baselineIdx = args.indexOf('--baseline')
const baselineFile = baselineIdx >= 0 ? args[baselineIdx + 1] : null

if (!file || !existsSync(file)) { console.log(`check-append-only: ${file || '(no file)'} なし → skip`); process.exit(0) }

const current = readFileSync(file, 'utf8').split('\n')

let baseline
if (baselineFile) {
  baseline = readFileSync(baselineFile, 'utf8').split('\n')
} else {
  try {
    baseline = execSync(`git show HEAD:"${file}" 2>/dev/null`, { encoding: 'utf8' }).split('\n')
  } catch {
    console.log(`check-append-only: ${file} は git 未追跡/初出 → skip (baseline なし)`); process.exit(0)
  }
}

// baseline が current の prefix か (末尾の空行差は無視)
const trim = arr => { const a = [...arr]; while (a.length && a[a.length - 1] === '') a.pop(); return a }
const b = trim(baseline), c = trim(current)

const errs = []
if (c.length < b.length) errs.push(`行数が減少 (baseline ${b.length} → current ${c.length}) = 切詰/削除`)
for (let i = 0; i < Math.min(b.length, c.length); i++) {
  if (b[i] !== c[i]) { errs.push(`行 ${i + 1} が変更された (既存監査行の書換え)`); break }
}

console.log(`check-append-only: ${file} (baseline ${b.length}行 → current ${c.length}行)`)
if (errs.length) {
  console.error('\nappend-only 違反:')
  for (const e of errs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`PASS: append-only (末尾 +${c.length - b.length} 行のみ)`)
