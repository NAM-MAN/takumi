#!/usr/bin/env node
// check-anchor-growth.mjs — anchor 成長機構 T1 script (zero-dep)
//
// 背景: 規範 md は RULE anchor (`<!-- RULE: id T#:mechanism -->`) が付いた section だけ機構強制される。
// anchor 済みは 42/1319 section (3%) で停滞している。原因は retrofit 方式 (誰かがまとめて後付け)。
// 本 script は強制点を「後で誰かがまとめて」から「書いた瞬間」へ移す2モードを提供する。
//
// mode (a) --diff (既定): 追加/変更された section が規範語彙を含むのに RULE anchor も
//   `<!-- ADVISORY -->` marker も無ければ fail。書いた瞬間に「anchor か advisory か」を選ばせる。
//   変更の無い既存 section は対象外 (retrofit を要求しない・誤検知に倒さない)。
//
// mode (b) --ratchet: 「数値上限は README に書くだけでは守られない」実証 (provisional ≤20% が
//   40% で恒常違反) を受け、後退だけを機械的に禁じる。per-file anchor 数の減少 / provisional 比率の
//   増加 / kernel (dispatch/loop-invariant.md) 行数 >30 / mode card 本文 >20行 を fail にする。
//   改善方向 (anchor 増・provisional 減) は pass。
//
// section / anchor / provisional の数え方は check-enforcement-coverage.mjs の census 実装と
// 同じ規約を使う (HEADING_RE / ANCHOR_RE / fence 除外 / registry.yaml parser を意図的に複製。
// 対象 script を編集しない制約のため import ではなく複製、規約は完全一致させてある)。
//
// usage:
//   node scripts/check-anchor-growth.mjs [--diff] [--base <ref>]        # git diff-gated (既定)
//   node scripts/check-anchor-growth.mjs --from-file <path> --target <md>  # diff-gated テスト入口
//   node scripts/check-anchor-growth.mjs --ratchet [--update-baseline] [--baseline <path>] [--dir <path>]
//   node scripts/check-anchor-growth.mjs --help
//
// exit 1 = 違反あり。

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const HELP = `check-anchor-growth.mjs — anchor 成長機構 T1 script

modes:
  --diff [--base <ref>]                   git diff (既定 HEAD 比較) で追加/変更 section を検査
  --from-file <path> --target <md>        diff-gated のテスト入口 (added-lines.txt = 1行1行番号)
  --ratchet [--update-baseline]
           [--baseline <path>] [--dir <path>]   後退禁止 ratchet 検査 / baseline 生成

diff-gated fail 条件: 追加/変更 section が規範語彙 (必須|禁止|してはならない|しない|shall|must|
MUST|fail|gateを|強制) を本文に含むのに、見出し行に RULE anchor も <!-- ADVISORY --> も無い。
code fence 内・HTML comment 内は語彙走査から除外。

ratchet fail 条件: per-file anchored_sections 減少 / provisional_count 増加 /
kernel_lines (dispatch/loop-invariant.md) > 30 / enforcement/cards/mode-*.md 本文 > 20行
(cards 不在なら skip)。改善方向は pass + --update-baseline 案内。
`

function argVal(flag, def) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}
function hasFlag(flag) { return process.argv.includes(flag) }

// ---------------------------------------------------------------------------
// census 実装の複製 (check-enforcement-coverage.mjs と同じ規約。編集不可のため import でなく複製)
// ---------------------------------------------------------------------------
const HEADING_RE = /^#{2,3}\s/
const CENSUS_RULE_RE = /<!--\s*RULE:/i

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) { if (name !== 'node_modules') walk(p, acc) }
    else if (name.endsWith('.md')) acc.push(p)
  }
  return acc
}

function scanMdForCensus(filePath) {
  const text = readFileSync(filePath, 'utf8')
  let inFence = false
  let sections = 0, anchored = 0
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    if (HEADING_RE.test(line)) {
      sections++
      if (CENSUS_RULE_RE.test(line)) anchored++
    }
  }
  return { sections, anchored }
}

// registry.yaml minimal parser — check-enforcement-coverage.mjs の parseRegistry/stripVal を複製
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

// ---------------------------------------------------------------------------
// mode (a) diff-gated
// ---------------------------------------------------------------------------
const ANCHOR_ON_HEADING_RE = /<!--\s*RULE:\s*[a-z0-9-]+\s+T\d:\S+?\s*-->/i
const ADVISORY_RE = /<!--\s*ADVISORY\b[^>]*-->/i
const VOCAB_RE = /必須|禁止|してはならない|しない|shall|must|MUST|fail|gate\s*を|強制/

function stripInlineComments(line) {
  return line.replace(/<!--[\s\S]*?-->/g, '')
}

function computeFenceMask(lines) {
  const mask = new Array(lines.length).fill(false)
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { mask[i] = true; inFence = !inFence; continue }
    mask[i] = inFence
  }
  return mask
}

// section = 見出し行(1-indexed) から次見出し行の手前まで。level (##/###) は区別しない
// (census と同じ HEADING_RE で数える単位に合わせる)。
function parseSections(lines, fenceMask) {
  const headingLines = []
  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue
    if (HEADING_RE.test(lines[i])) headingLines.push(i + 1)
  }
  const sections = []
  for (let k = 0; k < headingLines.length; k++) {
    const start = headingLines[k]
    const end = (k + 1 < headingLines.length) ? headingLines[k + 1] - 1 : lines.length
    sections.push({ headingLine: start, start, end })
  }
  return sections
}

function sectionTouched(section, addedLines) {
  for (let ln = section.start; ln <= section.end; ln++) if (addedLines.has(ln)) return true
  return false
}

// 語彙 match は見出しでなく本文 (heading 自体は除外)。fence 行・HTML comment も除外。
function sectionHasVocab(lines, fenceMask, section) {
  for (let ln = section.start + 1; ln <= section.end; ln++) {
    const idx = ln - 1
    if (fenceMask[idx]) continue
    const stripped = stripInlineComments(lines[idx])
    if (VOCAB_RE.test(stripped)) return true
  }
  return false
}

function headingHasMarker(lines, headingLine) {
  const raw = lines[headingLine - 1]
  return ANCHOR_ON_HEADING_RE.test(raw) || ADVISORY_RE.test(raw)
}

function checkFile(targetPath, addedLines) {
  const text = readFileSync(targetPath, 'utf8')
  const lines = text.split('\n')
  const fenceMask = computeFenceMask(lines)
  const sections = parseSections(lines, fenceMask)
  const violations = []
  for (const sec of sections) {
    if (!sectionTouched(sec, addedLines)) continue
    if (!sectionHasVocab(lines, fenceMask, sec)) continue
    if (headingHasMarker(lines, sec.headingLine)) continue
    violations.push({ file: targetPath, line: sec.headingLine, heading: lines[sec.headingLine - 1].trim() })
  }
  return violations
}

function parseAddedLinesFile(path) {
  const set = new Set()
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const n = Number(t)
    if (Number.isInteger(n) && n > 0) set.add(n)
  }
  return set
}

// git diff --unified=0 <base> -- skills/takumi を解析し、file(相対path) -> Set(新ファイル行番号)
function parseDiff(diffText) {
  const filesMap = new Map()
  let currentFile = null
  let newCursor = null
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const m = line.match(/^\+\+\+ (?:b\/)?(.+)$/)
      currentFile = (m && m[1] !== '/dev/null') ? m[1] : null
      continue
    }
    if (line.startsWith('@@ ')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) newCursor = Number(m[1])
      continue
    }
    if (!currentFile) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) {
      if (!filesMap.has(currentFile)) filesMap.set(currentFile, new Set())
      filesMap.get(currentFile).add(newCursor)
      newCursor++
      continue
    }
    if (line.startsWith('-')) continue // old-file only、new cursor は進めない
    if (line.startsWith(' ')) newCursor++ // unified=0 では通常出ないが保険
  }
  return filesMap
}

function runGitDiff(base) {
  try {
    return execFileSync('git', ['diff', '--unified=0', base, '--', 'skills/takumi'], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    return null // git 不在 / base 不明 / repo 外 → skip 扱い
  }
}

function runDiffGated() {
  if (hasFlag('--from-file')) {
    const fromFile = argVal('--from-file')
    const target = argVal('--target')
    if (!fromFile || !target) {
      console.error('--from-file には --target <md> が必須です')
      return 1
    }
    const addedLines = parseAddedLinesFile(fromFile)
    const violations = checkFile(target, addedLines)
    return reportDiffGated(violations)
  }

  const base = argVal('--base', 'HEAD')
  const diffText = runGitDiff(base)
  if (diffText === null) {
    console.log('anchor-growth --diff: git diff 取得不可 (repo外/base不明) → skip (pass)')
    return 0
  }
  if (!diffText.trim()) {
    console.log(`anchor-growth --diff: ${base} 比較で差分なし → pass`)
    return 0
  }
  const filesMap = parseDiff(diffText)
  const violations = []
  for (const [relPath, addedLines] of filesMap) {
    if (!relPath.endsWith('.md')) continue
    const abs = join(ROOT, relPath)
    if (!existsSync(abs)) continue // rename/delete 等で新ファイル側が無い
    violations.push(...checkFile(abs, addedLines))
  }
  return reportDiffGated(violations, base)
}

function reportDiffGated(violations, base) {
  const label = base ? ` (base=${base})` : ''
  if (violations.length) {
    console.error(`anchor-growth --diff${label}: 規範語彙を含む section に anchor/ADVISORY 無し (${violations.length} 件)`)
    for (const v of violations) {
      console.error(`  ✗ ${relative(ROOT, v.file) === v.file ? v.file : relative(ROOT, v.file)}:${v.line} ${v.heading}`)
    }
    console.error(`\nFAIL: ${violations.length} section が anchor 未選択 (RULE か <!-- ADVISORY --> を付けてください)`)
    return 1
  }
  console.log(`anchor-growth --diff${label}: PASS (違反 0)`)
  return 0
}

// ---------------------------------------------------------------------------
// mode (b) ratchet
// ---------------------------------------------------------------------------
function lineCount(text) {
  const lines = text.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') return text
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break }
  }
  if (end === -1) return text
  return lines.slice(end + 1).join('\n')
}

function computeState(skillDir) {
  const mdFiles = existsSync(skillDir) ? walk(skillDir) : []
  const files = {}
  for (const f of mdFiles) {
    const rel = relative(skillDir, f)
    const { sections, anchored } = scanMdForCensus(f)
    files[rel] = { anchored_sections: anchored, total_sections: sections }
  }
  const registryPath = join(skillDir, 'enforcement/registry.yaml')
  const registry = existsSync(registryPath) ? parseRegistry(readFileSync(registryPath, 'utf8')) : []
  const provisional_count = registry.filter(r => r.evidence_required === false).length
  const total_rules = registry.length
  const kernelPath = join(skillDir, 'dispatch/loop-invariant.md')
  const kernel_lines = existsSync(kernelPath) ? lineCount(readFileSync(kernelPath, 'utf8')) : 0
  return { files, provisional_count, total_rules, kernel_lines }
}

function checkModeCards(skillDir) {
  const cardsDir = join(skillDir, 'enforcement/cards')
  if (!existsSync(cardsDir)) return []
  const violations = []
  for (const name of readdirSync(cardsDir)) {
    if (!/^mode-.*\.md$/.test(name)) continue
    const p = join(cardsDir, name)
    if (statSync(p).isDirectory()) continue
    const body = stripFrontmatter(readFileSync(p, 'utf8'))
    const n = lineCount(body)
    if (n > 20) violations.push(`mode-card-oversize: ${name} 本文 ${n} 行 > 20`)
  }
  return violations
}

function runRatchet() {
  const skillDir = argVal('--dir', join(ROOT, 'skills/takumi'))
  const baselinePath = argVal('--baseline', join(skillDir, 'enforcement/ratchet-baseline.json'))
  const current = computeState(skillDir)
  const cardViolations = checkModeCards(skillDir)

  if (hasFlag('--update-baseline')) {
    const out = { generated_at: new Date().toISOString(), ...current }
    writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n')
    console.log(`anchor-growth --ratchet: baseline 更新 → ${relative(ROOT, baselinePath)}`)
    console.log(summarize(current))
    if (cardViolations.length) {
      console.log('\n注意 (baseline 生成時点で既に mode-card 超過):')
      for (const c of cardViolations) console.log(`  ⚠ ${c}`)
    }
    return 0
  }

  if (!existsSync(baselinePath)) {
    console.error(`anchor-growth --ratchet: baseline 不在 (${relative(ROOT, baselinePath)})`)
    console.error('  --update-baseline で現状から生成してください')
    return 1
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const fails = []
  const improvements = []

  const baselineFiles = baseline.files || {}
  for (const [rel, prev] of Object.entries(baselineFiles)) {
    const now = current.files[rel]
    const nowAnchored = now ? now.anchored_sections : 0
    if (nowAnchored < prev.anchored_sections) {
      fails.push(`anchor-decrease: ${rel} ${prev.anchored_sections} → ${nowAnchored}`)
    } else if (nowAnchored > prev.anchored_sections) {
      improvements.push(`anchor-increase: ${rel} ${prev.anchored_sections} → ${nowAnchored}`)
    }
  }
  const newFiles = Object.keys(current.files).filter(rel => !(rel in baselineFiles))

  const prevProvisional = baseline.provisional_count ?? 0
  if (current.provisional_count > prevProvisional) {
    fails.push(`provisional-increase: ${prevProvisional} → ${current.provisional_count}`)
  } else if (current.provisional_count < prevProvisional) {
    improvements.push(`provisional-decrease: ${prevProvisional} → ${current.provisional_count}`)
  }

  if (current.kernel_lines > 30) {
    fails.push(`kernel-oversize: dispatch/loop-invariant.md ${current.kernel_lines} 行 > 30`)
  }
  fails.push(...cardViolations)

  console.log(summarize(current, baseline))
  if (newFiles.length) console.log(`  (baseline 未収録の新規 md ${newFiles.length} 件、--update-baseline で反映可)`)
  if (improvements.length) {
    console.log('\n改善方向 (baseline 更新推奨):')
    for (const i of improvements) console.log(`  + ${i}`)
    console.log('  → --update-baseline で baseline を更新してください')
  }
  if (fails.length) {
    console.error('\nHARD violations:')
    for (const f of fails) console.error(`  ✗ ${f}`)
    console.error(`\nFAIL: ${fails.length} ratchet violation(s)`)
    return 1
  }
  console.log('\nPASS: ratchet 違反 0')
  return 0
}

function summarize(current, baseline) {
  const totalAnchored = Object.values(current.files).reduce((s, f) => s + f.anchored_sections, 0)
  const totalSections = Object.values(current.files).reduce((s, f) => s + f.total_sections, 0)
  const base = baseline ? ` (baseline: anchored計 ${Object.values(baseline.files || {}).reduce((s, f) => s + f.anchored_sections, 0)}, provisional ${baseline.provisional_count ?? 'n/a'}, kernel ${baseline.kernel_lines ?? 'n/a'})` : ''
  return `anchor-growth --ratchet: files ${Object.keys(current.files).length} / anchored計 ${totalAnchored}/${totalSections} / provisional ${current.provisional_count}/${current.total_rules} / kernel_lines ${current.kernel_lines}${base}`
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
if (hasFlag('--help') || hasFlag('-h')) {
  console.log(HELP)
  process.exit(0)
}

let code
if (hasFlag('--ratchet')) {
  code = runRatchet()
} else {
  code = runDiffGated()
}
process.exit(code)
