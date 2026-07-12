#!/usr/bin/env node
// check-irreversible-paths.mjs — autonomy §2 Layer2 deterministic high-risk path override (zero-dep)
//
// 変更 path を不可逆 path リストと照合し、該当する mutating 変更があれば human-floor 必須を signal。
// LLM の可逆性分類 (Layer1) が config-downstream 境界で取り逃がす不可逆性を機構的に塞ぐ
// (W3 pilot: 非決定的 FN を deterministic override で 0 に)。registry: layer2-irreversible-path-override。
//
// 用途: (a) CLI gate、(b) PreToolUse hook の backend、(c) executor の second-pass 補助。
// exit 1 = 不可逆 path に該当 (= human floor 必須)、exit 0 = 該当なし (Layer1 へ委譲可)。
//
// usage:
//   node scripts/check-irreversible-paths.mjs <path...>   # 明示 path
//   node scripts/check-irreversible-paths.mjs             # git diff (uncommitted+staged) を自動取得
//   echo "a\nb" | node scripts/check-irreversible-paths.mjs --stdin

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// 不可逆 path カテゴリ (autonomy.md §2 Layer2 と一致)
const RULES = [
  { cat: 'ci-cd',        re: /(^|\/)\.github\/workflows\//i },
  { cat: 'ci-cd',        re: /(^|\/)\.gitlab-ci|(^|\/)\.circleci\/|(^|\/)buildkite\//i },
  { cat: 'deploy-infra', re: /(^|\/)(deploy|deployment|k8s|helm|terraform|infra)\//i },
  { cat: 'env-config',   re: /(^|\/)\.env(\.|$)|\.env$|(^|\/)config\/.*prod/i },
  { cat: 'secret',       re: /(secret|credential|password|api[_-]?key|token|private[_-]?key)/i },
  { cat: 'observability',re: /(sentry|datadog|newrelic|otel|opentelemetry|prometheus|grafana|(^|\/)logging\/|(^|\/)alert)/i },
  { cat: 'db-migration', re: /(^|\/)(migrations|db\/migrate)\/|prisma\/migrations\//i },
]

// R' 除外 (comment/docs/test-only/local-dev-only の純加算は Layer1 に戻す)
const EXEMPT = [
  /\.md$/i,
  /(^|\/)(test|tests|__tests__|__mocks__|e2e|fixtures?)\//i,
  /\.(test|spec)\.[a-z]+$/i,
  /(^|\/)docs?\//i,
  /(^|\/)\.takumi\//i,
]

export function classify(paths) {
  const flagged = []
  for (const p of paths) {
    if (EXEMPT.some(re => re.test(p))) continue // R' (Layer1 委譲)
    for (const r of RULES) {
      if (r.re.test(p)) { flagged.push({ path: p, cat: r.cat }); break }
    }
  }
  return flagged
}

function changedPaths() {
  try {
    const out = execSync('git diff --name-only HEAD; git diff --name-only --cached', { encoding: 'utf8' })
    return [...new Set(out.split('\n').map(s => s.trim()).filter(Boolean))]
  } catch {
    return []
  }
}

// --- CLI (直接実行時のみ。import 時は classify だけ使う) ---
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('usage: check-irreversible-paths.mjs [<path>... | --stdin]\n  exit 1 = human-floor 必須 (不可逆 path 該当)')
  process.exit(0)
}
let paths
if (args.includes('--stdin')) {
  paths = readFileSync(0, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
} else if (args.filter(a => !a.startsWith('--')).length) {
  paths = args.filter(a => !a.startsWith('--'))
} else {
  paths = changedPaths()
}

const flagged = classify(paths)

console.log(`check-irreversible-paths: ${paths.length} path 検査`)
if (flagged.length) {
  console.error('\n🛑 HUMAN-FLOOR 必須 (不可逆 path、autonomy §2 Layer2):')
  for (const f of flagged) console.error(`  ✗ ${f.path}  [${f.cat}]`)
  console.error(`\n${flagged.length} 件の不可逆 path 変更 → autonomous proceed 禁止、human sign-off 必須`)
  process.exit(1)
}
console.log('PASS: 不可逆 path 該当なし (Layer1 可逆性分類へ委譲可)')
} // end CLI
