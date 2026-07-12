#!/usr/bin/env node
// check-plan-contract.mjs — 「薄い計画 = 誤実装リスク」の決定的検出 (BL-008、check-md-refs.mjs 兄弟、zero-dep)
//
// 目的: 職人(実装 subagent)が誤実装する確率を下げる。語彙数や行数は測らない。
//       「falsifiable な委譲契約情報の有無」だけを決定的に検査する。
// 設計根拠: .takumi/drafts/bl008-direction-decision.md §2 (軍師 codex gpt-5.5 反証反映)
//
// 各 plan の各 TODO タスク (`- [ ] ...` ブロック) について HARD fail 条件:
//   B1 scope     : file_scope/scope 空 or 曖昧語のみ (全体/関連/必要に応じて)。具体列挙があれば pass
//   B2 hint      : implementation_hint に 5 種(既存シンボル/新規予定名/パス/データ形状/状態遷移名)が 1 つも無い
//   B3 verify    : verification がコマンド/テスト名/期待結果を欠き「確認する/動作確認」だけ
//   B4 constraints: constraints(やらない) 空 (特に守る既存挙動なし)
//   B5 acceptance: acceptance(ac_ids/derived_from/明示条件) 空
//
// plan gate 行 (P3、dilution-100、`plan-gate-lines` rule の mechanism。plan-template.md「plan gate 行」節参照):
//   schema [GATE: rule-id | mechanism-ref | 観測可能な期待値] を検査 (ref-only、任意・後方互換)。
//   gate 行が 1 本も無い plan は従来通り pass。あれば以下を HARD 違反として検査 (--strict 無関係、常時 exit 1):
//     schema     : 3 要素揃わない/空要素
//     forward-orphan : rule-id が enforcement/registry.yaml に無い
//     reverse-orphan : mechanism-ref が registry 当該 rule の mechanism と不一致
//                      (`#fragment` 有りの registry mechanism に対し、gate 行が fragment 無し base path 一致なら pass。
//                       fragment 有り同士で不一致・base path 自体が違う場合は violation)
//     prose-expected : 期待値に英数字/`=` が 1 つも無い (機械照合不能な自由散文の近似判定。迷ったら pass 側に倒す)
//     limit      : task あたり >3 行 / plan 全体 >30 行
//
// usage:
//   node scripts/check-plan-contract.mjs [file ...]   # 既定: .takumi/plans/*.md 全件
//   node scripts/check-plan-contract.mjs --json        # 集計用 JSON 出力 (pilot retro)
//   node scripts/check-plan-contract.mjs --strict       # advisory も exit 1
//   node scripts/check-plan-contract.mjs --quiet        # per-task 明細を抑制、サマリのみ

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLANS_DIR = join(REPO, '.takumi', 'plans')
const REGISTRY_PATH = join(REPO, 'skills', 'takumi', 'enforcement', 'registry.yaml')

const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const STRICT = argv.includes('--strict')
const QUIET = argv.includes('--quiet')
const fileArgs = argv.filter((a) => !a.startsWith('--'))

// --- 対象ファイル解決 ---
function resolvePlans() {
  if (fileArgs.length) return fileArgs.map((f) => resolve(f))
  if (!existsSync(PLANS_DIR)) return []
  return readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(PLANS_DIR, f))
}

// --- 曖昧語 (これ単独なら情報ゼロ) ---
const VAGUE = ['全体', '全般', '関連ファイル', '関連', '必要に応じて', '適宜', 'いろいろ', '各種', 'など', 'TBD', '未定', '後で', 'あとで']

// --- 具体名トークン: 既存シンボル/新規予定名/パス/データ形状/状態遷移名のいずれか ---
//   backtick `...` / path a/b / 拡張子 .ts .mjs / CamelCase / snake_case / func() / 型注釈
const CONCRETE = [
  /`[^`\n]+`/,                 // backtick 引用 (識別子/コマンド/パス)
  /[\w.-]+\/[\w./-]+/,         // パス a/b/c
  /\.\w{1,5}\b/,               // 拡張子 .ts .mjs .yaml
  /[a-z][a-zA-Z]*[A-Z][a-zA-Z]*/, // camelCase / CamelCase
  /\w+_\w+/,                   // snake_case
  /\w+\(/,                     // 関数呼出 foo(
  /[A-Z]{2,}[-_]?\d*/,         // 定数/ID (AC-XXX, DA-0)
]
const hasConcrete = (s) => CONCRETE.some((re) => re.test(s))

// --- verification が「観測可能」か: コマンド/テスト名/期待結果 ---
const VERIFY_SIGNAL = [
  /`[^`\n]+`/,                                   // コマンド/テスト名
  /\b(pnpm|npm|yarn|node|cargo|go|pytest|jest|vitest|stryker)\b/,
  /\b\w+\.(test|spec)\b/,
  /(exit|=\s*0|dead\s*=|orphan|pass率|score|≤|≥|<=|>=|期待|想定結果|return|戻り値)/,
  /\d+\s*(行|件|%|本|回)/,                       // 数値基準
]
const hasVerifySignal = (s) => VERIFY_SIGNAL.some((re) => re.test(s))
// 「確認する/動作確認/テストする」だけの空 verify
const VERIFY_EMPTY_ONLY = /^(.*(確認する|動作確認|テストする|テスト通過|既存テスト|チェックする)[、。\s]*)+$/
// 期待結果シグナル (acceptance の代替証拠: 「done の定義」が verify に明示されている)
const EXPECTED_RESULT = /(exit|=\s*0|dead\s*=|orphan|≤|≥|<=|>=|期待|想定結果|pass率|score|不変|=0|\bpass\b|\d+\s*(行|件|%|本|回))/i
const hasExpectedResult = (s) => s != null && EXPECTED_RESULT.test(s)

// --- フィールド抽出 (新 7 field + 旧日本語 alias 両対応) ---
// 各キーは「そのタスクブロック内で `**alias**` の後ろに続くテキスト」を結合して返す
const FIELD_ALIASES = {
  goal:     ['goal', '目的', 'ゴール'],
  scope:    ['file_scope', 'scope', 'resource_scope', 'ファイルスコープ'],
  accept:   ['acceptance', 'ac_ids', 'derived_from', '完了条件', '受け入れ'],
  constr:   ['constraints', 'やらない', 'ガードレール', '禁止'],
  hint:     ['implementation_hint', '何を', 'アプローチ', '実装方針', '方針'],
  verify:   ['verification', '検証', '検証項目', '確認手順'],
  data:     ['data_access', 'data', 'データアクセス'],
}

// gate 対象外の section 見出し (完了条件・最終検証・スコープ等は委譲タスクでない)
const NON_TASK_HEADING = /完了条件|やらないこと|スコープ|最終検証|検証観点|停止点|背景|リスク|概要|self-multiplying|自己増殖|決定事項|候補|アンチパターン|Track/i
// gate 対象の section 見出し (実装タスク)
const TASK_HEADING = /wave|todo|タスク|sprint/i

// タスクブロックを抽出: トップレベル `- [ ]`/`- [x]`/`- [~]` から次の箇条 or 見出しまで。
// gateable = Wave/TODO section 配下 or 構造化サブフィールドを持つ or 番号付き、かつ非タスク section でない。
// (完了条件チェックリスト・最終検証ステップ等を委譲タスクと誤認しない — 軍師指摘の FP 制御)
function extractTasks(text) {
  const lines = text.split('\n')
  const tasks = []
  let cur = null
  let inFence = false
  let heading = ''
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) inFence = !inFence
    if (inFence) { if (cur) cur.body.push(raw); continue }
    const isHeading = /^#{1,6}\s/.test(raw)
    if (isHeading) { if (cur) { tasks.push(cur); cur = null } heading = raw }
    const isTopTask = /^- \[[ x~]\]\s+/.test(raw)
    const isTopBullet = /^[-*] /.test(raw) && !raw.startsWith('  ')
    if (isTopTask) {
      if (cur) tasks.push(cur)
      cur = { title: raw.replace(/^- \[[ x~]\]\s+/, '').trim(), body: [raw], heading }
    } else if (cur && (isHeading || isTopBullet)) {
      tasks.push(cur); cur = null
    } else if (cur) {
      cur.body.push(raw)
    }
  }
  if (cur) tasks.push(cur)
  // gateable 判定
  return tasks.filter((t) => {
    if (NON_TASK_HEADING.test(t.heading)) return false
    const hasSubField = /\n\s+[-*]\s*\*\*/.test(t.body.join('\n'))
    const numbered = /^\d+\.\s/.test(t.title)
    return TASK_HEADING.test(t.heading) || hasSubField || numbered
  })
}

// ブロックから field 値を取り出す。`- **alias**: 値` / `- **a** / **b**: v / w` の両形を許容
function getField(body, aliases) {
  const joined = body.join('\n')
  for (const alias of aliases) {
    // **alias** ... : 値   (同一行 or 複合 `**a** / **b**: x / y`)
    const re = new RegExp('\\*\\*' + alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\*\\*([^\\n]*)', 'g')
    const m = joined.match(re)
    if (m) {
      // alias 直後〜行末を値とみなす (`: ` 以降があればそれ、なければ全体)
      return m.map((s) => {
        const idx = s.indexOf(':')
        return (idx >= 0 ? s.slice(idx + 1) : s.replace(/\*\*/g, '')).trim()
      }).join(' ')
    }
  }
  return null
}

const isEmpty = (v) => v == null || v === '' || /^(\[\s*\]|なし|none|n\/a|-|–|—)$/i.test(v.trim())

function stripVague(v) {
  let s = v
  for (const w of VAGUE) s = s.split(w).join(' ')
  return s.trim()
}

function checkTask(task) {
  const fail = []
  const f = {}
  for (const key of Object.keys(FIELD_ALIASES)) f[key] = getField(task.body, FIELD_ALIASES[key])

  // B1 scope — file_scope 専用フィールドが無くても、title や hint に具体パスがあれば職人は scope を読める
  // (軍師 #2 緩和: 「scope はフィールドでなく具体パスの存在で判定」。retro で title 内パスが FP 主因と判明)
  const PATH_TOKEN = /([\w@.-]+\/[\w./-]+|\b[\w-]+\.(ts|tsx|js|mjs|cjs|jsx|md|ya?ml|json|py|rs|go|css|scss|sql|sh|toml|csv)\b)/
  const scopeText = [f.scope, task.title, f.hint].filter(Boolean).join('  ')
  const scopeFieldOk = !isEmpty(f.scope) && hasConcrete(stripVague(f.scope))
  if (!scopeFieldOk && !PATH_TOKEN.test(scopeText)) fail.push('B1:scope不明 (file_scope/title/hint に具体パスなし)')

  // B2 implementation_hint — hint 単独が無ければ title+goal も見る (探索フェーズ救済)
  const hintSrc = [f.hint, f.goal, task.title].filter(Boolean).join(' ')
  if (isEmpty(f.hint) && isEmpty(f.goal)) fail.push('B2:hint欠落')
  else if (!hasConcrete(hintSrc)) fail.push('B2:hint具体名ゼロ')

  // B3 verification
  const vr = f.verify
  if (isEmpty(vr)) fail.push('B3:verify欠落')
  else if (!hasVerifySignal(vr) && VERIFY_EMPTY_ONLY.test(vr.trim())) fail.push('B3:verify観測不能')
  else if (!hasVerifySignal(vr)) fail.push('B3:verifyコマンド/期待結果なし')

  // B4 constraints
  if (isEmpty(f.constr)) fail.push('B4:constraints欠落')

  // B5 acceptance — ac_ids/derived_from/完了条件 のいずれか、または verify に期待結果が明示されていれば pass
  // (no-AC な skill-strategy plan でも「done の定義」が verify にあれば誤実装は防げる、軍師の acceptance 独立化の趣旨を満たす)
  if (isEmpty(f.accept) && !hasExpectedResult(vr)) fail.push('B5:acceptance/期待結果なし')

  return { title: task.title.slice(0, 70), fail, fields: f }
}

// --- plan gate 行 (P3、dilution-100、rule `plan-gate-lines` の mechanism) ---
// schema: [GATE: rule-id | mechanism-ref | 観測可能な期待値]。plan-template.md「plan gate 行」節が canonical。

// enforcement/registry.yaml から id -> mechanism を読む最小 YAML-subset parser
// (check-enforcement-coverage.mjs の parseRegistry と同型、registry.yaml は read-only)
function stripYamlVal(v) {
  let s = v.replace(/\s+#.*$/, '').trim()
  s = s.replace(/^["']|["']$/g, '')
  return s
}
function loadRegistryMechanisms() {
  const map = new Map()
  if (!existsSync(REGISTRY_PATH)) return map // registry 不在は forward/reverse-orphan 判定を skip (schema/limit は継続)
  const lines = readFileSync(REGISTRY_PATH, 'utf8').split('\n')
  let inRules = false
  let curId = null
  for (const raw of lines) {
    if (/^rules:\s*$/.test(raw)) { inRules = true; continue }
    if (!inRules) continue
    if (/^\S/.test(raw)) break // top-level key で rules: リスト終了
    const item = raw.match(/^\s+-\s+([a-z_]+):\s*(.*)$/i)
    if (item && item[1] === 'id') { curId = stripYamlVal(item[2]); continue }
    const kv = raw.match(/^\s+([a-z_]+):\s*(.*)$/i)
    if (kv && curId && kv[1] === 'mechanism') map.set(curId, stripYamlVal(kv[2]))
  }
  return map
}

// gate 行を全文から 1 パスで抽出。所属 task は「直近に見た `- [ ] ...` 行のタイトル」で近似
// (extractTasks の gateable フィルタとは独立 — gate 行は完了条件/最終検証等の非タスク section には出現しない想定だが、
//  出現しても機械的に拾う。task 単位 ≤3 の判定はこの近似単位で行う)
//
// **gates** field 行 (`- **gates**: [GATE: ...]`、plan-template.md の schema) のみを対象とする。
// 単なる bracket 出現 (schema 自体を説明・引用する散文、例: 本 dilution plan の "W3.1 ... `[GATE: rule-id | ...]`"
// という task title の記述) を gate 行と誤認すると実在しない違反を作る (false positive) ため、
// **gates** ラベル付き行に限定して ref-only の実運用行だけを機械強制する。
const GATE_FIELD_LINE = /\*\*gates\*\*/
function scanGateLines(text) {
  const lines = text.split('\n')
  const gates = []
  let inFence = false
  let taskId = '(no task)'
  const GATE_RE = /\[GATE:([^\]]*)\]/g
  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) { inFence = !inFence; return }
    if (inFence) return
    if (/^- \[[ x~]\]\s+/.test(raw)) taskId = raw.replace(/^- \[[ x~]\]\s+/, '').trim().slice(0, 60)
    if (!GATE_FIELD_LINE.test(raw)) return
    let m
    GATE_RE.lastIndex = 0
    while ((m = GATE_RE.exec(raw))) gates.push({ line: i + 1, taskId, content: m[1] })
  })
  return gates
}

// 期待値の機械照合可能性 (近似・保守的): 英数字か `=` が 1 つでもあれば pass 側
const hasMachineSignal = (s) => /[A-Za-z0-9=]/.test(s)

function evaluateGateLine(g, registryMechanisms) {
  const errs = []
  const rawParts = g.content.split('|')
  const parts = rawParts.map((p) => p.trim())
  if (parts.length !== 3 || parts.some((p) => p === '')) {
    errs.push(`schema: [GATE: rule-id | mechanism-ref | 期待値] の 3 要素必須 (got ${parts.length} field, empty含む) — "${g.content.trim()}"`)
    return { ...g, ruleId: parts[0] || null, mechRef: parts[1] || null, expected: parts[2] || null, errs }
  }
  const [ruleId, mechRef, expected] = parts
  if (registryMechanisms.size > 0) {
    if (!registryMechanisms.has(ruleId)) {
      errs.push(`forward-orphan: rule-id "${ruleId}" が enforcement/registry.yaml に無い`)
    } else {
      const regMech = registryMechanisms.get(ruleId)
      const baseOfReg = regMech.split('#')[0]
      const exact = mechRef === regMech
      const baseOnly = regMech.includes('#') && mechRef === baseOfReg // fragment 無し base path 一致は許容
      if (!exact && !baseOnly) {
        errs.push(`reverse-orphan: mechanism-ref "${mechRef}" が registry の rule "${ruleId}" の mechanism "${regMech}" と不一致`)
      }
    }
  }
  if (!hasMachineSignal(expected)) {
    errs.push(`prose-expected: 期待値 "${expected}" が機械照合形でない (英数字/= を含まない自由散文、例: findings=0)`)
  }
  return { ...g, ruleId, mechRef, expected, errs }
}

const GATE_TASK_LIMIT = 3
const GATE_PLAN_LIMIT = 30

function checkGateLines(text, registryMechanisms) {
  const rawGates = scanGateLines(text)
  const evaluated = rawGates.map((g) => evaluateGateLine(g, registryMechanisms))
  const violations = []
  for (const g of evaluated) {
    for (const e of g.errs) violations.push(`L${g.line} [${g.taskId}]: ${e}`)
  }
  const byTask = new Map()
  for (const g of evaluated) byTask.set(g.taskId, (byTask.get(g.taskId) || 0) + 1)
  for (const [taskId, count] of byTask) {
    if (count > GATE_TASK_LIMIT) violations.push(`limit: task "${taskId}" に gate 行 ${count} 行 (上限 ${GATE_TASK_LIMIT}/task)`)
  }
  if (evaluated.length > GATE_PLAN_LIMIT) violations.push(`limit: plan 全体で gate 行 ${evaluated.length} 行 (上限 ${GATE_PLAN_LIMIT}/plan)`)
  return { count: evaluated.length, violations }
}

// --- 実行 ---
const registryMechanisms = loadRegistryMechanisms()
const plans = resolvePlans()
const report = []
for (const file of plans) {
  if (!existsSync(file)) { report.push({ file, error: 'not found' }); continue }
  const text = readFileSync(file, 'utf8')
  const tasks = extractTasks(text)
  const taskResults = tasks.map(checkTask)
  const failing = taskResults.filter((t) => t.fail.length > 0)
  const gate = checkGateLines(text, registryMechanisms)
  report.push({
    file: relative(REPO, file),
    tasks: tasks.length,
    failing: failing.length,
    thin_ratio: tasks.length ? +(failing.length / tasks.length).toFixed(3) : 0,
    details: taskResults,
    gate_lines: gate.count,
    gate_violations: gate.violations,
  })
}

if (JSON_OUT) {
  // pilot retro 用: details は要約 (fail reason のみ)
  const compact = report.map((r) => ({
    file: r.file, tasks: r.tasks, failing: r.failing, thin_ratio: r.thin_ratio,
    fail_tasks: (r.details || []).filter((t) => t.fail.length).map((t) => ({ title: t.title, fail: t.fail })),
    gate_lines: r.gate_lines || 0, gate_violations: r.gate_violations || [],
  }))
  process.stdout.write(JSON.stringify(compact, null, 2) + '\n')
} else {
  let totalTasks = 0, totalFail = 0, totalGateLines = 0, totalGateViolations = 0
  for (const r of report) {
    if (r.error) { console.log(`✗ ${r.file}: ${r.error}`); continue }
    totalTasks += r.tasks; totalFail += r.failing
    totalGateLines += r.gate_lines || 0; totalGateViolations += (r.gate_violations || []).length
    const mark = r.failing === 0 && !(r.gate_violations || []).length ? '✓' : '✗'
    console.log(`${mark} ${r.file}  (${r.failing}/${r.tasks} thin, ratio ${r.thin_ratio})`)
    if (!QUIET && r.failing) {
      for (const t of r.details.filter((d) => d.fail.length)) {
        console.log(`    - ${t.title}  → ${t.fail.join(', ')}`)
      }
    }
    if (r.gate_violations && r.gate_violations.length) {
      for (const v of r.gate_violations) console.log(`    - [GATE] ${v}`)
    }
  }
  console.log(`\nplans=${report.length}  tasks=${totalTasks}  thin=${totalFail}  (${totalTasks ? Math.round(100 * totalFail / totalTasks) : 0}%)`)
  console.log(`gate_lines=${totalGateLines}  gate_violations=${totalGateViolations}`)
}

// exit code: 既定は集計のみ exit 0 (retro 観測用)。--strict で thin>0 を exit 1 (CI/Wave gate 用)。
// gate 行 schema/orphan/limit 違反は「形式が壊れた gate = 安心の演出」防止のため --strict 無関係に常時 exit 1 (HARD)。
const anyThin = report.some((r) => r.failing > 0)
const anyGateViolation = report.some((r) => (r.gate_violations || []).length > 0)
process.exitCode = (STRICT && anyThin) || anyGateViolation ? 1 : 0
