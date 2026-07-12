#!/usr/bin/env node
// hook-irreversible-guard.mjs — PreToolUse hook backend (autonomy §2 Layer2 を harness gate 化)
//
// Edit/Write/MultiEdit の対象 file_path が不可逆 path に該当したら permissionDecision: "ask"
// (= human-floor、autonomous でも人間 sign-off へ)。それ以外は素通り (allow)。
// 希釈不可能: LLM が規則を覚えているかに依らず harness が機構的に発火する。
//
// fail-open 方針: stdin parse 失敗・想定外 schema は exit 0 (allow) で稼働セッションを妨げない。
//   不可逆の最終 fail-closed は standalone gate (check-irreversible-paths.mjs) + autonomy second-pass。
// registry: layer2-irreversible-path-override の hook 機構。

import { classify } from './check-irreversible-paths.mjs'

let input = ''
try {
  const { readFileSync } = await import('node:fs')
  input = readFileSync(0, 'utf8')
} catch { process.exit(0) } // stdin 無 → allow

let payload
try { payload = JSON.parse(input) } catch { process.exit(0) }

const tool = payload.tool_name || payload.toolName || ''
const ti = payload.tool_input || payload.toolInput || {}
if (!/^(Edit|Write|MultiEdit)$/.test(tool)) process.exit(0) // 対象外 tool は allow

const path = ti.file_path || ti.path || ''
if (!path) process.exit(0)

const flagged = classify([path])
if (flagged.length) {
  // human-floor: ask (deny でなく、人間に判断を上げる)
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        `🛑 不可逆 path (${flagged[0].cat}, autonomy §2 Layer2): ${path}\n` +
        `autonomous でも human sign-off 必須。検証済+推奨を添えて承認を求めてください (WS-B 決裁ドシエ)。`,
    },
  }))
  process.exit(0)
}
process.exit(0) // allow
