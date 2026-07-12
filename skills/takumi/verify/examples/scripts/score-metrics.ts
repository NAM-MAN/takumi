#!/usr/bin/env node
/**
 * EXAMPLE ONLY — Next.js App Router 専用の参考実装。
 * このファイルは takumi skill の配布物ではなく「参考例」です。利用者は project 側の
 * `scripts/` 等に cp してから、対象プロジェクトの構造 (state ライブラリ選択、
 * handler 命名規則、guard の表現など) に合わせて regex と重みを調整してください。
 *
 * Stage 2: 各 route を regex で解析して Tier スコアリング
 *
 * 入力:  .takumi/machines/routes.json
 * 出力:  .takumi/machines/<slug>/metrics.json
 *
 * 依存: なし (Node.js 組み込みのみ、ts-morph 等の AST ライブラリ不要)
 * 使い方: npx tsx score-metrics.ts [--slug <slug>] [--all]
 */
import * as fs from "node:fs"
import * as path from "node:path"

type Evidence = {
  useState_count: number
  useReducer_count: number
  zustand_stores: string[]
  jotai_atoms_count: number
  handlers: string[]
  server_actions_count: number
  websocket: boolean
  canvas: boolean
  drag_drop: boolean
  middleware_guards: string[]
  layout_depth: number
  dynamic_segments: string[]
  conditional_render_branches: number
  error_boundary: boolean
  loading_boundary: boolean
}

type Metrics = {
  slug: string
  route_complexity: number
  ui_state_count: number
  interaction_complexity: number
  tier: "A" | "B" | "C" | "D"
  generated_format: string
  xstate_devDependency_required: boolean
  tier_changed_from?: "A" | "B" | "C" | "D"
  evidence: Evidence
  generated_at: string
}

const PROJECT_ROOT = process.cwd()
const MACHINES_DIR = path.join(PROJECT_ROOT, ".takumi", "machines")
const ROUTES_FILE = path.join(MACHINES_DIR, "routes.json")

function stripComments(source: string): string {
  // 単純な block/line comment 除去 (文字列内無視の完全対応は省略、十分な精度)
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*/gm, "")
}

function countMatches(source: string, re: RegExp): number {
  const m = source.match(re)
  return m ? m.length : 0
}

function collectUniqueMatches(source: string, re: RegExp, group = 1): string[] {
  const set = new Set<string>()
  let m: RegExpExecArray | null
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
  while ((m = g.exec(source)) !== null) {
    if (m[group]) set.add(m[group])
  }
  return Array.from(set)
}

function loadSource(files: string[]): string {
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => stripComments(fs.readFileSync(f, "utf-8")))
    .join("\n\n")
}

function resolveSourceFiles(routeFile: string): string[] {
  const abs = path.join(PROJECT_ROOT, routeFile)
  if (!fs.existsSync(abs)) return []
  const files = new Set<string>([abs])
  // 同ディレクトリの兄弟 component (簡易解決)
  const dir = path.dirname(abs)
  for (const entry of fs.readdirSync(dir)) {
    if (/\.(tsx?|jsx?)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      files.add(path.join(dir, entry))
    }
  }
  return Array.from(files)
}

function analyze(source: string, routeInfo: any): Evidence {
  return {
    useState_count:             countMatches(source, /\buseState\s*\(/g),
    useReducer_count:           countMatches(source, /\buseReducer\s*\(/g),
    zustand_stores:             collectUniqueMatches(source, /(\w+Store)\s*\(/g),
    jotai_atoms_count:          countMatches(source, /\b(atom|atomWithStorage|useAtom)\s*\(/g),
    handlers:                   collectUniqueMatches(source, /\b(on[A-Z]\w+)\s*=/g),
    server_actions_count:       countMatches(source, /["']use server["']/g),
    websocket:                  /new\s+WebSocket|new\s+EventSource|\.channel\(|\.realtime\(/.test(source),
    canvas:                     /<canvas\b|getContext\(\s*["']2d|<svg[^>]*onMouseDown/.test(source),
    drag_drop:                  /onDragStart\b|onDrop\b|onDragEnd\b|useDrag\b|useDrop\b|@dnd-kit/.test(source),
    middleware_guards:          routeInfo.guards || [],
    layout_depth:               routeInfo.layouts?.length || 0,
    dynamic_segments:           routeInfo.dynamicSegments || [],
    conditional_render_branches: countMatches(source, /\{[^{}]*\?\s*<[A-Z]|\{[^{}]*&&\s*<[A-Z]/g),
    error_boundary:             !!routeInfo.errorBoundary,
    loading_boundary:           !!routeInfo.loading,
  }
}

function score(ev: Evidence): { route: number; ui: number; interaction: number } {
  const route =
    ev.layout_depth +
    ev.dynamic_segments.length +
    ev.middleware_guards.length * 2 +
    (ev.error_boundary ? 1 : 0) +
    (ev.loading_boundary ? 1 : 0)

  const ui =
    ev.useState_count +
    ev.useReducer_count * 2 +
    ev.zustand_stores.length * 3 +
    ev.jotai_atoms_count * 2 +
    Math.floor(ev.conditional_render_branches / 2)

  const interaction =
    ev.handlers.length +
    Math.floor(ev.server_actions_count * 1.5) +
    (ev.websocket ? 10 : 0) +
    (ev.canvas ? 15 : 0) +
    (ev.drag_drop ? 5 : 0)

  return { route, ui, interaction }
}

function classifyTier(max: number): "A" | "B" | "C" | "D" {
  if (max <= 2) return "A"
  if (max <= 8) return "B"
  if (max <= 20) return "C"
  return "D"
}

function formatFor(tier: "A" | "B" | "C" | "D"): string {
  return ({ A: "component-test", B: "fc-commands", C: "xstate-with-test", D: "event-sourcing" } as const)[tier]
}

function readPreviousTier(slug: string): "A" | "B" | "C" | "D" | null {
  const p = path.join(MACHINES_DIR, slug, "metrics.json")
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")).tier
  } catch { return null }
}

function run() {
  if (!fs.existsSync(ROUTES_FILE)) {
    console.error(`${ROUTES_FILE} not found. Run extract-routes.ts first.`)
    process.exit(1)
  }
  const { routes } = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf-8"))

  const slugArg = process.argv.indexOf("--slug")
  const targets = slugArg > -1
    ? routes.filter((r: any) => r.slug === process.argv[slugArg + 1])
    : routes

  for (const route of targets) {
    const sourceFiles = resolveSourceFiles(route.file)
    const source = loadSource(sourceFiles)
    const ev = analyze(source, route)
    const s = score(ev)
    const maxScore = Math.max(s.route, s.ui, s.interaction)
    const tier = classifyTier(maxScore)
    const previousTier = readPreviousTier(route.slug)

    const metrics: Metrics = {
      slug: route.slug,
      route_complexity: s.route,
      ui_state_count: s.ui,
      interaction_complexity: s.interaction,
      tier,
      generated_format: formatFor(tier),
      xstate_devDependency_required: tier === "C",
      evidence: ev,
      generated_at: new Date().toISOString(),
    }
    if (previousTier && previousTier !== tier) {
      metrics.tier_changed_from = previousTier
    }

    const outDir = path.join(MACHINES_DIR, route.slug)
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, "metrics.json"), JSON.stringify(metrics, null, 2))

    const bumpNote = metrics.tier_changed_from ? ` (${metrics.tier_changed_from} → ${tier})` : ""
    console.log(
      `${route.slug.padEnd(30)} Tier ${tier}${bumpNote}  ` +
      `(route=${s.route}, ui=${s.ui}, interaction=${s.interaction})`
    )
  }
}

run()
