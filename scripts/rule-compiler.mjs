#!/usr/bin/env node
// rule-compiler.mjs — RULE anchor → binding card compiler (P5, dilution-100, zero-dep)
//
// 目的: 「思想 file を読ませる」から「機械生成された binding card を消費させる」への転換。
// card は LLM 要約禁止・anchor 5字段 (scope/shall/not/applicability/evidence) の機械抽出のみ
// (忠実性保証)。既存 parse 規約 (RULE anchor / 5字段 comment) は check-enforcement-coverage.mjs
// を踏襲する。applicability は enforcement/dsl.md の凍結文法で parse する。
//
// 仕様: skills/takumi/enforcement/dsl.md (applicability DSL) / registry.yaml (rule 一覧)
//
// fail 二分 (dsl.md 準拠、厳守):
//   exit 1: shall/not 字段欠落・RULE id 重複・anchor 構文破壊・registry 未登録 id・(--verify) hash drift
//   exit 0 + warning: applicability parse 不能 (always 降格)・applicability 字段欠落・予算切捨て・未anchor normative section
//
// usage:
//   node scripts/rule-compiler.mjs [file ...]                 # 既定: dispatch/executor.md + dispatch/loop-invariant.md
//   node scripts/rule-compiler.mjs --verify [file ...]         # 既存 card と source hash を突合、drift で exit 1
//   node scripts/rule-compiler.mjs --report <path>             # レポートを JSON でも書き出す (常に stdout にも出す)
//   node scripts/rule-compiler.mjs --out-dir <dir>              # card 出力先 (既定 skills/takumi/enforcement/cards、test seam)
//   node scripts/rule-compiler.mjs --now <iso>                  # generated_at を固定 (fixture の byte-一致テスト用)
//   node scripts/rule-compiler.mjs --help

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL = join(ROOT, 'skills/takumi')
const REGISTRY_PATH = join(SKILL, 'enforcement/registry.yaml')
const DEFAULT_CARDS_DIR = join(SKILL, 'enforcement/cards')
const MODE_CARD_NAME = 'mode-executor.md'
const COMPILER_VERSION = '1.0.0'
const MODE_CARD_BUDGET_LINES = 20
const DEFAULT_TARGETS = [
  'skills/takumi/dispatch/executor.md',
  'skills/takumi/dispatch/loop-invariant.md',
]

function printHelp() {
  console.log(`rule-compiler.mjs — RULE anchor → binding card compiler (zero-dep)

usage:
  node scripts/rule-compiler.mjs [file ...]
  node scripts/rule-compiler.mjs --verify [file ...]
  node scripts/rule-compiler.mjs --report <path>
  node scripts/rule-compiler.mjs --out-dir <dir>
  node scripts/rule-compiler.mjs --now <iso8601>
  node scripts/rule-compiler.mjs --help

対象 md file 群 (省略時は既定 2 file):
  ${DEFAULT_TARGETS.join('\n  ')}

出力:
  <out-dir>/{rule-id}.md      per-rule card (frontmatter provenance + 5字段の機械的再整形のみ)
  <out-dir>/${MODE_CARD_NAME}  対象 file 群を集約した ≤20行 (本文) の再アンカー用 1 枚

exit 1 (hard): shall/not 字段欠落 / RULE id 重複 / anchor 構文破壊 / registry 未登録 id / (--verify) hash drift
exit 0 + warning: applicability parse 不能 (always 降格) / applicability 字段欠落 / 予算切捨て / 未anchor normative section

詳細仕様: skills/takumi/enforcement/dsl.md / skills/takumi/enforcement/registry.yaml`)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
if (argv.includes('--help') || argv.includes('-h')) {
  printHelp()
  process.exit(0)
}
const VERIFY = argv.includes('--verify')

function flagValue(name) {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}
const reportPath = flagValue('--report')
const outDirArg = flagValue('--out-dir')
const nowArg = flagValue('--now')
const CARDS_DIR = outDirArg ? resolve(outDirArg) : DEFAULT_CARDS_DIR
const NOW_DEFAULT = nowArg || new Date().toISOString()

const consumedValues = new Set([reportPath, outDirArg, nowArg].filter(Boolean))
const fileArgs = argv.filter((a) => !a.startsWith('--') && !consumedValues.has(a))
const targetRel = fileArgs.length ? fileArgs : DEFAULT_TARGETS

function resolveTarget(f) {
  const direct = resolve(f)
  if (existsSync(direct)) return direct
  const viaRoot = join(ROOT, f)
  if (existsSync(viaRoot)) return viaRoot
  console.error(`rule-compiler: target file not found: ${f}`)
  process.exit(1)
}
const targets = targetRel.map(resolveTarget)

// ---------------------------------------------------------------------------
// registry.yaml minimal parser (check-enforcement-coverage.mjs と同型、意図的複製・zero-dep)
// ---------------------------------------------------------------------------
function parseRegistry(text) {
  const lines = text.split('\n')
  const rules = []
  let inRules = false
  let cur = null
  for (const raw of lines) {
    if (/^rules:\s*$/.test(raw)) { inRules = true; continue }
    if (!inRules) continue
    if (/^\S/.test(raw)) break
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
  let s = v.replace(/\s+#.*$/, '').trim()
  s = s.replace(/^["']|["']$/g, '')
  if (s === 'true') return true
  if (s === 'false') return false
  return s
}

const registryRules = existsSync(REGISTRY_PATH) ? parseRegistry(readFileSync(REGISTRY_PATH, 'utf8')) : []
const registryById = new Map(registryRules.map((r) => [r.id, r]))

// ---------------------------------------------------------------------------
// applicability DSL parser (enforcement/dsl.md 凍結文法)
// ---------------------------------------------------------------------------
const DSL_CONTEXTS = new Set(['task', 'plan', 'surface', 'diff', 'loop', 'autonomy', 'requirements'])
const LITERAL_RE = /^[A-Za-z0-9_-]+$/

function parseApplicability(raw) {
  const trimmed = raw.trim()
  if (trimmed === 'always') return { ok: true, normalized: 'always' }
  // 歴史的表記 ∧ は AND の別名 (dsl.md)
  const parts = trimmed.split(/\s+(?:AND|∧)\s+/)
  const clauses = []
  for (const part of parts) {
    // path SP? op SP? value — 5字段 comment は空白省略で書かれる実例があるため空白は寛容に扱う
    // (dsl.md の SP は区切りの意図であり、字句の空白厳密数を compiler が壊れとして扱うのは
    //  実運用の anchor 記法と衝突するための工学判断。文法の意味 (AND-only/context/op/value 形) は変えない)
    const m = part.trim().match(/^([A-Za-z][\w-]*(?:\.[\w-]+)*)\s*(==|!=|in)\s*(.+)$/)
    if (!m) return { ok: false, reason: `clause 構文不能: "${part.trim()}"` }
    const [, path, op, valueRaw] = m
    const contextHead = path.split('.')[0]
    if (!DSL_CONTEXTS.has(contextHead)) return { ok: false, reason: `未知 context: "${contextHead}"` }
    const value = valueRaw.trim()
    if (op === 'in') {
      const listM = value.match(/^\[\s*([^\]]*)\s*\]$/)
      if (!listM) return { ok: false, reason: `in の右辺が list literal でない: "${value}"` }
      const items = listM[1].length ? listM[1].split(',').map((s) => s.trim()) : []
      if (!items.length) return { ok: false, reason: `in の右辺 list が空: "${value}"` }
      for (const it of items) {
        if (!LITERAL_RE.test(it)) return { ok: false, reason: `list literal 不正: "${it}"` }
      }
      clauses.push(`${path} in [${items.join(', ')}]`)
    } else {
      if (value !== 'null' && !LITERAL_RE.test(value)) {
        return { ok: false, reason: `literal 不正: "${value}"` }
      }
      clauses.push(`${path} ${op} ${value}`)
    }
  }
  return { ok: true, normalized: clauses.join(' AND ') }
}

// ---------------------------------------------------------------------------
// md 走査: RULE anchor + 5字段 comment + section 本文 の抽出 (check-enforcement-coverage.mjs 準拠)
// ---------------------------------------------------------------------------
const ANCHOR_RE = /<!--\s*RULE:\s*([a-z0-9-]+)\s+T(\d):(\S+?)\s*-->/i
const FUZZY_RULE_RE = /<!--\s*RULE\s*:/i
const ANY_HEADING_RE = /^#{1,6}\s/
const FIELD_LINE_RE = /^<!--\s*(.+?)\s*-->\s*$/
const FIELD_KV_RE = /^([a-zA-Z]+)\s*:\s*(.*)$/

function parseFields(inner) {
  const parts = inner.split(' / ')
  const map = {}
  let any = false
  for (const part of parts) {
    const m = part.match(FIELD_KV_RE)
    if (!m) continue
    map[m[1].toLowerCase()] = m[2].trim()
    any = true
  }
  return any ? map : null
}

// 全 skill tree の md file 一覧 (provisional_cardability の全域 anchor 検索用)
function walkMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules') walkMd(p, acc) }
    else if (name.endsWith('.md')) acc.push(p)
  }
  return acc
}

// filePath 内の RULE anchor block を抽出する。hardErrors に構造的エラーを積む
// (呼び出し側は「target file の構造検証」と「skill 全域の census (lenient)」の両方でこれを使う)
function extractRuleBlocks(filePath, hardErrors) {
  const text = readFileSync(filePath, 'utf8')
  const lines = text.split('\n')
  const blocks = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    if (!ANY_HEADING_RE.test(line)) continue
    const anchorMatch = line.match(ANCHOR_RE)
    if (!anchorMatch) {
      if (FUZZY_RULE_RE.test(line)) {
        hardErrors.push(`anchor-malformed: ${filePath}:${i + 1} が RULE anchor 構文に一致しない: "${line.trim()}"`)
      }
      continue
    }
    const [, id, tierStr, mechanism] = anchorMatch
    const headingLine = line
    const fieldLineRaw = lines[i + 1] ?? ''
    const fieldMatch = fieldLineRaw.match(FIELD_LINE_RE)
    const fields = fieldMatch ? parseFields(fieldMatch[1]) : null
    if (!fields) {
      hardErrors.push(`fields-missing: rule "${id}" (${filePath}:${i + 1}) の直後行に 5字段 comment が無い`)
    }
    const bodyStart = fieldMatch ? i + 2 : i + 1
    const bodyLines = []
    let fenceState = false
    let j = bodyStart
    for (; j < lines.length; j++) {
      const l = lines[j]
      if (/^\s*(```|~~~)/.test(l)) { fenceState = !fenceState; bodyLines.push(l); continue }
      if (!fenceState && ANY_HEADING_RE.test(l)) break
      bodyLines.push(l)
    }
    blocks.push({
      id,
      anchorTier: Number(tierStr),
      anchorMechanism: mechanism,
      filePath,
      lineNo: i + 1,
      headingLine,
      fieldLine: fieldMatch ? fieldMatch[0] : '',
      fields: fields || {},
      hasFields: !!fields,
      bodyText: bodyLines.join('\n').replace(/\s+$/, ''),
    })
  }
  return blocks
}

// ---------------------------------------------------------------------------
// target file 抽出 + 構造 hard-fail 収集
// ---------------------------------------------------------------------------
const hardErrors = []
const structWarnings = []
let allBlocks = []
for (const t of targets) {
  const blocks = extractRuleBlocks(t, hardErrors)
  allBlocks = allBlocks.concat(blocks)
}

// shall/not 欠落 + registry 未登録
for (const b of allBlocks) {
  if (!b.hasFields) continue // fields-missing は既に hardErrors に積んである (shall/not 欠落として二重計上しない)
  const shallOk = b.fields.shall && b.fields.shall.trim().length > 0
  const notOk = b.fields.not && b.fields.not.trim().length > 0
  if (!shallOk) hardErrors.push(`shall-missing: rule "${b.id}" (${relative(ROOT, b.filePath)}:${b.lineNo}) の shall 字段が空/欠落`)
  if (!notOk) hardErrors.push(`not-missing: rule "${b.id}" (${relative(ROOT, b.filePath)}:${b.lineNo}) の not 字段が空/欠落`)
  if (!registryById.has(b.id)) hardErrors.push(`registry-missing: rule "${b.id}" (${relative(ROOT, b.filePath)}:${b.lineNo}) が registry.yaml に無い`)
}

// RULE id 重複 (target file 群を跨いで)
const idLocations = new Map()
for (const b of allBlocks) {
  const rel = `${relative(ROOT, b.filePath)}:${b.lineNo}`
  if (!idLocations.has(b.id)) idLocations.set(b.id, [])
  idLocations.get(b.id).push(rel)
}
for (const [id, locs] of idLocations) {
  if (locs.length > 1) hardErrors.push(`duplicate-id: rule "${id}" が複数箇所に存在: ${locs.join(', ')}`)
}

if (hardErrors.length) {
  console.error('rule-compiler: HARD violations (exit 1):')
  for (const e of hardErrors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// per-rule compiled record (applicability parse + hash + tier/safety mismatch 監査)
// ---------------------------------------------------------------------------
function computeSourceHash(b) {
  const material = [b.headingLine, b.fieldLine, b.bodyText].join('\n')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

const warnings = []
const compiled = []
for (const b of allBlocks) {
  const reg = registryById.get(b.id)
  const applicRaw = b.fields.applicability
  let applicResult
  let missingField = false
  if (applicRaw === undefined || applicRaw.trim() === '') {
    missingField = true
    applicResult = { ok: false, reason: 'applicability 字段が欠落' }
  } else {
    applicResult = parseApplicability(applicRaw)
  }
  const degraded = !applicResult.ok
  const appliesFinal = applicResult.ok ? applicResult.normalized : 'always'
  if (degraded) {
    const msg = missingField
      ? `applicability-missing: rule "${b.id}" の applicability 字段が欠落 → always 降格`
      : `applicability-degraded: rule "${b.id}" の applicability "${applicRaw}" が parse 不能 (${applicResult.reason}) → always 降格`
    warnings.push(msg)
  }
  if (reg && Number(reg.tier) !== b.anchorTier) {
    warnings.push(`tier-mismatch: rule "${b.id}" anchor 記載 T${b.anchorTier} ≠ registry tier ${reg.tier} (registry を採用)`)
  }
  if (!b.fields.scope || !b.fields.scope.trim()) warnings.push(`scope-missing: rule "${b.id}" の scope 字段が空/欠落`)
  if (!b.fields.evidence || !b.fields.evidence.trim()) warnings.push(`evidence-missing: rule "${b.id}" の evidence 字段が空/欠落`)

  compiled.push({
    ...b,
    reg,
    hash: computeSourceHash(b),
    appliesFinal,
    degraded,
    sourcePath: relative(ROOT, b.filePath),
  })
}

// ---------------------------------------------------------------------------
// per-rule card 本文生成
// ---------------------------------------------------------------------------
function buildCardText(c, now) {
  const fm = [
    '---',
    `source_rule_id: ${c.id}`,
    `source_path: ${c.sourcePath}`,
    `source_hash: sha256:${c.hash}`,
    `generated_at: ${now}`,
    `compiler_version: ${COMPILER_VERSION}`,
    `tier: ${c.reg.tier}`,
    `safety: ${c.reg.safety}`,
    `applies: ${c.appliesFinal}`,
    `applicability_degraded: ${c.degraded}`,
    '---',
    '',
  ].join('\n')
  const body = [
    '## scope',
    c.fields.scope || '',
    '',
    '## shall',
    c.fields.shall || '',
    '',
    '## not',
    c.fields.not || '',
    '',
    '## applicability',
    c.appliesFinal,
    '',
    '## evidence',
    c.fields.evidence || '',
    '',
  ].join('\n')
  return fm + body
}

// ---------------------------------------------------------------------------
// mode card (mode-executor.md) 生成
// ---------------------------------------------------------------------------
function formatModeLine(c) {
  const safetyTag = c.reg.safety && c.reg.safety !== 'none' ? ` safety:${c.reg.safety}` : ''
  return `- \`${c.id}\` (T${c.reg.tier}${safetyTag}): shall ${c.fields.shall} / not ${c.fields.not} [applies: ${c.appliesFinal}]`
}

function buildModeCard(compiledList, now) {
  const kernelExcluded = []
  const candidates = []
  for (const c of compiledList) {
    if (c.sourcePath.endsWith('dispatch/loop-invariant.md')) {
      kernelExcluded.push(c.id)
      continue
    }
    candidates.push(c)
  }
  // 予算切捨て優先度: safety != none > T1 > T2 > T3 (安定 sort、同 rank は元の並び順を保持)
  const priorityRank = (c) => [c.reg.safety && c.reg.safety !== 'none' ? 0 : 1, Number(c.reg.tier)]
  const ranked = candidates.map((c, idx) => ({ c, idx }))
  ranked.sort((a, b) => {
    const ra = priorityRank(a.c)
    const rb = priorityRank(b.c)
    if (ra[0] !== rb[0]) return ra[0] - rb[0]
    if (ra[1] !== rb[1]) return ra[1] - rb[1]
    return a.idx - b.idx
  })
  const keptIds = new Set(ranked.slice(0, MODE_CARD_BUDGET_LINES).map((x) => x.c.id))
  const truncatedIds = ranked.slice(MODE_CARD_BUDGET_LINES).map((x) => x.c.id)

  if (truncatedIds.length) {
    warnings.push(`budget-truncated: mode card 予算 ${MODE_CARD_BUDGET_LINES} 行超過、${truncatedIds.length} rule を切捨て: ${truncatedIds.join(', ')}`)
  }

  // 出力は元の文書順 (可読性)、採否は優先度で決めたセット
  const lines = candidates.filter((c) => keptIds.has(c.id)).map(formatModeLine)

  const fmLines = [
    '---',
    `generated_at: ${now}`,
    `compiler_version: ${COMPILER_VERSION}`,
    `source_files: [${targets.map((t) => relative(ROOT, t)).join(', ')}]`,
    `budget_lines: ${MODE_CARD_BUDGET_LINES}`,
    `rule_count: ${lines.length}`,
    `kernel_rules_excluded: [${kernelExcluded.join(', ')}]`,
    `truncated_rules: [${truncatedIds.join(', ')}]`,
    '---',
    '',
  ].join('\n')

  return { text: fmLines + lines.join('\n') + (lines.length ? '\n' : ''), lineCount: lines.length, truncatedIds, kernelExcluded }
}

// ---------------------------------------------------------------------------
// verify mode: 既存 card と source hash を突合、既存 generated_at を再利用して byte 比較
// ---------------------------------------------------------------------------
function extractFrontmatterField(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  return m ? m[1].trim() : null
}

if (VERIFY) {
  const drift = []
  for (const c of compiled) {
    const cardPath = join(CARDS_DIR, `${c.id}.md`)
    if (!existsSync(cardPath)) {
      drift.push(`missing-card: rule "${c.id}" の card が ${relative(ROOT, cardPath)} に無い`)
      continue
    }
    const existing = readFileSync(cardPath, 'utf8')
    const existingNow = extractFrontmatterField(existing, 'generated_at') || NOW_DEFAULT
    const rebuilt = buildCardText(c, existingNow)
    if (rebuilt !== existing) drift.push(`hash-drift: rule "${c.id}" の card が source と不一致 (${relative(ROOT, cardPath)})`)
  }
  const modePath = join(CARDS_DIR, MODE_CARD_NAME)
  if (!existsSync(modePath)) {
    drift.push(`missing-card: mode card が ${relative(ROOT, modePath)} に無い`)
  } else {
    const existingMode = readFileSync(modePath, 'utf8')
    const existingModeNow = extractFrontmatterField(existingMode, 'generated_at') || NOW_DEFAULT
    const rebuiltMode = buildModeCard(compiled, existingModeNow)
    if (rebuiltMode.text !== existingMode) drift.push(`hash-drift: mode card が source と不一致 (${relative(ROOT, modePath)})`)
  }

  if (drift.length) {
    console.error('rule-compiler --verify: DRIFT 検出 (exit 1):')
    for (const d of drift) console.error(`  ✗ ${d}`)
    process.exit(1)
  }
  console.log(`rule-compiler --verify: PASS (drift 0、${compiled.length} rule + mode card)`)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// generate mode: card 群 + mode card を書き出す
// ---------------------------------------------------------------------------
mkdirSync(CARDS_DIR, { recursive: true })
for (const c of compiled) {
  writeFileSync(join(CARDS_DIR, `${c.id}.md`), buildCardText(c, NOW_DEFAULT))
}
const modeCard = buildModeCard(compiled, NOW_DEFAULT)
writeFileSync(join(CARDS_DIR, MODE_CARD_NAME), modeCard.text)

// ---------------------------------------------------------------------------
// レポート (anchor_coverage_report / normative_unanchored_warning / provisional_cardability)
// ---------------------------------------------------------------------------
const COVERAGE_HEADING_RE = /^#{2,3}\s/ // check-enforcement-coverage.mjs 踏襲
const NORMATIVE_RE = /(必須|禁止|してはならない|shall|must|fail|gate)/i
const ADVISORY_MARKER_RE = /<!--\s*ADVISORY\b[^>]*-->/

function scanSections(filePath) {
  const text = readFileSync(filePath, 'utf8')
  const lines = text.split('\n')
  let inFence = false
  const sections = []
  let current = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; if (current) current.bodyLines.push(line); continue }
    if (inFence) { if (current) current.bodyLines.push(line); continue }
    if (COVERAGE_HEADING_RE.test(line)) {
      current = { headingLine: line, lineNo: i + 1, anchored: /<!--\s*RULE:/.test(line), bodyLines: [] }
      sections.push(current)
      continue
    }
    if (current) current.bodyLines.push(line)
  }
  return sections
}

const anchorCoverageReport = []
const normativeUnanchored = []
for (const t of targets) {
  const sections = scanSections(t)
  const anchoredCount = sections.filter((s) => s.anchored).length
  anchorCoverageReport.push({
    file: relative(ROOT, t),
    anchored_sections: anchoredCount,
    total_sections: sections.length,
  })
  for (const s of sections) {
    if (s.anchored) continue
    const combined = [s.headingLine, ...s.bodyLines].join('\n')
    if (ADVISORY_MARKER_RE.test(combined)) continue
    const matched = [...new Set((combined.match(new RegExp(NORMATIVE_RE, 'gi')) || []).map((m) => m.toLowerCase()))]
    if (matched.length) {
      normativeUnanchored.push({
        file: relative(ROOT, t),
        line: s.lineNo,
        heading: s.headingLine.replace(/<!--.*?-->/g, '').trim(),
        matched_keywords: matched,
      })
    }
  }
}

// provisional_cardability: registry の evidence_required:false 全件について、skill 全域から
// anchor 実在 + 5字段完備を判定 (target file に限らない = 対象は 59 rule 全域の provisional 集合)
const allMdFiles = walkMd(SKILL)
const censusIgnored = []
const fullAnchorMap = new Map() // id -> block (最初に見つかったもの)
for (const f of allMdFiles) {
  const blocks = extractRuleBlocks(f, censusIgnored)
  for (const b of blocks) {
    if (!fullAnchorMap.has(b.id)) fullAnchorMap.set(b.id, b)
  }
}
const REQUIRED_FIELDS = ['scope', 'shall', 'not', 'applicability', 'evidence']
const provisionalCardability = []
for (const r of registryRules) {
  if (r.evidence_required !== false) continue
  const block = fullAnchorMap.get(r.id)
  const anchorExists = !!block
  const fieldsComplete = anchorExists && block.hasFields && REQUIRED_FIELDS.every((k) => block.fields[k] && block.fields[k].trim().length > 0)
  provisionalCardability.push({
    id: r.id,
    source: r.source,
    anchor_exists: anchorExists,
    fields_complete: fieldsComplete,
    cardable: anchorExists && fieldsComplete,
  })
}

// ---------------------------------------------------------------------------
// stdout レポート + (--report) JSON 書き出し
// ---------------------------------------------------------------------------
console.log(`rule-compiler: generated ${compiled.length} card(s) + ${MODE_CARD_NAME} (${modeCard.lineCount} 行、budget ${MODE_CARD_BUDGET_LINES})`)
console.log(`  cards dir: ${relative(ROOT, CARDS_DIR)}`)
console.log(`  kernel_rules_excluded: [${modeCard.kernelExcluded.join(', ')}]`)
console.log(`  truncated_rules: [${modeCard.truncatedIds.join(', ')}]`)
console.log('\nanchor_coverage_report:')
for (const r of anchorCoverageReport) console.log(`  ${r.file}: ${r.anchored_sections}/${r.total_sections} anchored`)
console.log(`\nnormative_unanchored_warning: ${normativeUnanchored.length} 件`)
for (const w of normativeUnanchored) console.log(`  ⚠ ${w.file}:${w.line} "${w.heading}" (${w.matched_keywords.join(',')})`)
const cardableCount = provisionalCardability.filter((p) => p.cardable).length
const anchorMissingCount = provisionalCardability.filter((p) => !p.anchor_exists).length
const fieldsIncompleteCount = provisionalCardability.filter((p) => p.anchor_exists && !p.fields_complete).length
console.log(`\nprovisional_cardability: ${provisionalCardability.length} 件 (cardable ${cardableCount} / anchor不在 ${anchorMissingCount} / fields不備 ${fieldsIncompleteCount})`)

if (warnings.length) {
  console.error('\nADVISORY (informational、exit 0 のまま):')
  for (const w of warnings) console.error(`  ⚠ ${w}`)
}

const reportObj = {
  compiler_version: COMPILER_VERSION,
  generated_at: NOW_DEFAULT,
  targets: targets.map((t) => relative(ROOT, t)),
  cards_generated: compiled.map((c) => c.id),
  degraded_rules: compiled.filter((c) => c.degraded).map((c) => c.id),
  mode_card: {
    path: relative(ROOT, join(CARDS_DIR, MODE_CARD_NAME)),
    line_count: modeCard.lineCount,
    budget_lines: MODE_CARD_BUDGET_LINES,
    truncated_rules: modeCard.truncatedIds,
    kernel_rules_excluded: modeCard.kernelExcluded,
  },
  anchor_coverage_report: anchorCoverageReport,
  normative_unanchored_warning: normativeUnanchored,
  provisional_cardability: provisionalCardability,
  warnings,
  hard_errors: [],
}
if (reportPath) {
  mkdirSync(dirname(resolve(reportPath)), { recursive: true })
  writeFileSync(resolve(reportPath), JSON.stringify(reportObj, null, 2) + '\n')
  console.log(`\nreport written: ${reportPath}`)
}

process.exit(0)
