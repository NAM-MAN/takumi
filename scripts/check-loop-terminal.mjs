#!/usr/bin/env node
// check-loop-terminal.mjs — self-paced loop の終端状態述語を決定的に検証 (zero-dep、T1)
//
// WS-C: 継続/停止を state.json の機械述語で決める。本 script は state.json と plan checkbox の
// 整合を静的検査し、「completed なのに残タスクあり」「paused_human なのに stop_reason 無し」等の
// 不整合 (= 踏み潰し/誤完了の温床) を捕える。
// registry: loop-stop-predicate / supervised-completion-loop / paused-human-before-wakeup の mechanism。
//
// usage: node scripts/check-loop-terminal.mjs [state.json path]   (default .takumi/state.json)
// exit 1 = 終端状態の不整合。

import { readFileSync, existsSync } from 'node:fs'

const statePath = process.argv[2] || '.takumi/state.json'
if (!existsSync(statePath)) { console.log(`check-loop-terminal: ${statePath} なし → skip`); process.exit(0) }

const TERMINAL = ['in_progress', 'completed', 'paused_human', 'paused_context', 'paused_stalled']

let state
try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch (e) {
  console.error(`✗ state.json が invalid JSON: ${e.message}`); process.exit(1)
}

const errs = []
const status = String(state.status || '').split(/\s/)[0] // "in_progress" 等 (注記付きも先頭語で判定)

// 1. status は終端集合
if (!TERMINAL.some(t => status.startsWith(t))) errs.push(`status "${state.status}" が終端集合外 (${TERMINAL.join('/')})`)

// 2. plan checkbox との整合
const planFile = state.plan_file
let remaining = null
if (planFile && existsSync(planFile)) {
  const plan = readFileSync(planFile, 'utf8')
  remaining = (plan.match(/^\s*-\s*\[ \]/gm) || []).length
  if (status.startsWith('completed') && remaining > 0)
    errs.push(`completed なのに残 - [ ] が ${remaining} 件 (誤完了)`)
  if (status === 'in_progress' && remaining === 0)
    errs.push(`in_progress なのに残 - [ ] が 0 (completed にすべき)`)
}

// 3. 停止系は stop_reason 必須 (踏み潰し防止 = 理由を surface してから止まる)
if ((status.startsWith('paused_human') || status.startsWith('paused_stalled')) && !state.stop_reason)
  errs.push(`${status} なのに stop_reason 無し (WS-B: 理由を surface せず停止 = 不可)`)

console.log(`check-loop-terminal: status=${status}, remaining=${remaining ?? 'n/a'}`)
if (errs.length) {
  console.error('\n終端状態の不整合:')
  for (const e of errs) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('PASS: 終端状態 整合')
