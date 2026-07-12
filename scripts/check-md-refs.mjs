#!/usr/bin/env node
// skills/takumi/**/*.md の md 参照を検査。
// - 相対パス参照 (`/` を含む `foo/bar.md` や [..](../x.md)) → referrer の dir から解決、未解決を dead として報告
// - bare 名参照 (`executor.md` 等、`/` 無し) → basename が tree 内に存在するかで判定 (移動に強い)
// 目的: BL-006 ファイル移動の前後で「相対パス参照の dead」を 0 に保つ安全網。
// 使用: node scripts/check-md-refs.mjs [--verbose]

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'takumi')
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const verbose = process.argv.includes('--verbose')

const SKIP_DIRS = new Set(['.takumi', 'node_modules', 'examples'])
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []
  })

const files = walk(ROOT)
const basenames = new Set(files.map((f) => f.split('/').pop()))

// 参照抽出: backtick `...md` と markdown [..](..md)
const refRe = /`([^`\n]+?\.md)`|\]\(([^)\n]+?\.md)(?:#[^)]*)?\)/g
// テンプレ placeholder / runtime 生成パスは「リンク」ではないので除外
const isNoise = (ref) =>
  ref.includes('{') || ref.includes('*') || ref.includes('$') ||
  ref.includes('<') || ref.includes('>') || /\s/.test(ref) ||
  ref.startsWith('.takumi/') || ref.includes('/.takumi/') ||
  /^(plans|drafts|sprints|specs|telemetry|control)\//.test(ref) ||
  // skills/takumi の外を指す意図的参照 (repo 他所 / home / memory)
  /^(docs|references|memory)\//.test(ref) || ref.startsWith('~') || ref.startsWith('../../')

const pathDead = []
let bareTotal = 0
let bareMissing = 0
let pathTotal = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(refRe)) {
    const ref = (m[1] ?? m[2]).trim()
    if (ref.startsWith('http') || isNoise(ref)) continue
    const isPath = ref.includes('/')
    if (isPath) {
      pathTotal++
      const clean = ref.replace(/^\.\//, '')
      // skill 慣習: root 相対 (skills/takumi/) が主。file-dir 相対 / basename も許容
      const okFromDir = existsSync(resolve(dirname(file), clean))
      const okFromRoot = existsSync(resolve(ROOT, clean))
      const okByBase = basenames.has(clean.split('/').pop())
      if (!okFromDir && !okFromRoot && !okByBase) pathDead.push({ from: relative(ROOT, file), ref })
    } else {
      bareTotal++
      if (!basenames.has(ref)) bareMissing++
    }
  }
}

// repo doc → skill パス参照の検査 (README/CLAUDE/docs/references が skills/takumi/... を正しく指すか)。
// doc↔skill の path drift (BL-006 移動で docs が旧パス参照のまま) を自動検知する。
const docFiles = ['README.md', 'CLAUDE.md', 'docs', 'references'].flatMap((r) => {
  const p = join(REPO, r)
  if (!existsSync(p)) return []
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const docDead = []
let docSkillRefs = 0
for (const file of docFiles) {
  for (const m of readFileSync(file, 'utf8').matchAll(refRe)) {
    const ref = (m[1] ?? m[2]).trim()
    if (!ref.startsWith('skills/takumi/') || isNoise(ref)) continue
    docSkillRefs++
    if (!existsSync(resolve(REPO, ref))) docDead.push({ from: relative(REPO, file), ref })
  }
}

console.log(`md files: ${files.length}`)
console.log(`relative-path refs: ${pathTotal}, dead: ${pathDead.length}`)
console.log(`bare-name refs: ${bareTotal}, basename 不在: ${bareMissing}`)
console.log(`doc→skill refs: ${docSkillRefs}, dead: ${docDead.length}`)
if (verbose || pathDead.length > 0) {
  for (const d of pathDead.slice(0, 50)) console.log(`  DEAD-PATH  ${d.from}  ->  ${d.ref}`)
}
if (verbose || docDead.length > 0) {
  for (const d of docDead.slice(0, 50)) console.log(`  DOC-DEAD   ${d.from}  ->  ${d.ref}`)
}
process.exit(pathDead.length > 0 || docDead.length > 0 ? 1 : 0)
