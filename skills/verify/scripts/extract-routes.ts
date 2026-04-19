#!/usr/bin/env node
/**
 * Stage 1: Next.js App Router の route graph を抽出する
 *
 * 入力:  プロジェクトルート (cwd)
 * 出力:  .takumi/machines/routes.json
 *
 * 使い方:  npx tsx extract-routes.ts [--project <path>]
 */
import * as fs from "node:fs"
import * as path from "node:path"

type RouteInfo = {
  slug: string
  path: string
  file: string
  layouts: string[]
  loading: string | null
  errorBoundary: string | null
  dynamic: boolean
  dynamicSegments: string[]
  guards: string[]
  parent: string | null
  children: string[]
}

const projectArg = process.argv.indexOf("--project")
const PROJECT_ROOT = projectArg > -1 ? process.argv[projectArg + 1] : process.cwd()
const APP_DIR = path.join(PROJECT_ROOT, "app")
const SRC_APP_DIR = path.join(PROJECT_ROOT, "src", "app")
const OUTPUT_FILE = path.join(PROJECT_ROOT, ".sisyphus", "machines", "routes.json")

function findAppDir(): string | null {
  if (fs.existsSync(APP_DIR) && fs.statSync(APP_DIR).isDirectory()) return APP_DIR
  if (fs.existsSync(SRC_APP_DIR) && fs.statSync(SRC_APP_DIR).isDirectory()) return SRC_APP_DIR
  return null
}

function walk(dir: string, base: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walk(full, base))
    } else if (/^(page|layout|loading|error|middleware)\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(path.relative(base, full))
    }
  }
  return results
}

function toRoute(relFile: string): string {
  const parts = relFile.split(path.sep).slice(0, -1)
  if (parts.length === 0) return "/"
  const segments = parts
    .filter((p) => !p.startsWith("(") || !p.endsWith(")"))
    .map((p) => p.replace(/^\[\[?\.\.\.(\w+)\]?\]$/, ":$1*").replace(/^\[(\w+)\]$/, ":$1"))
  return "/" + segments.join("/")
}

function toSlug(routePath: string): string {
  if (routePath === "/") return "root"
  return routePath
    .replace(/^\//, "")
    .replace(/\//g, "-")
    .replace(/:/g, "")
    .replace(/\*/g, "catchall")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase()
}

function detectGuards(appRoot: string): string[] {
  const mw1 = path.join(PROJECT_ROOT, "middleware.ts")
  const mw2 = path.join(PROJECT_ROOT, "middleware.js")
  const mw3 = path.join(PROJECT_ROOT, "src", "middleware.ts")
  for (const p of [mw1, mw2, mw3]) {
    if (fs.existsSync(p)) {
      const source = fs.readFileSync(p, "utf-8")
      const matchers: string[] = []
      const configMatch = /config\s*=\s*\{[^}]*matcher\s*:\s*(\[[\s\S]*?\]|["'][^"']+["'])/.exec(source)
      if (configMatch) {
        matchers.push(`middleware:matcher=${configMatch[1].replace(/\s+/g, " ").slice(0, 80)}`)
      }
      if (/getToken|verifyAuth|requireAuth|authMiddleware/.test(source)) {
        matchers.push("middleware:authed")
      }
      return matchers
    }
  }
  return []
}

function extractDynamicSegments(routePath: string): string[] {
  const matches = routePath.match(/:(\w+)\*?/g) || []
  return matches.map((m) => m.replace(/^:/, "").replace(/\*$/, ""))
}

function run() {
  const found = findAppDir()
  if (!found) {
    console.error("No app/ or src/app/ directory found. Skipping.")
    process.exit(0)
    return
  }
  const appRoot: string = found
  const files = walk(appRoot, appRoot)
  const pages = files.filter((f) => /^page\.(tsx?|jsx?)$/.test(path.basename(f)))
  const layouts = files.filter((f) => /^layout\.(tsx?|jsx?)$/.test(path.basename(f)))
  const loadings = files.filter((f) => /^loading\.(tsx?|jsx?)$/.test(path.basename(f)))
  const errors = files.filter((f) => /^error\.(tsx?|jsx?)$/.test(path.basename(f)))
  const guards = detectGuards(appRoot)

  const routes: RouteInfo[] = pages.map((pageFile) => {
    const dir = path.dirname(pageFile)
    const routePath = toRoute(pageFile)
    const slug = toSlug(routePath)
    const dynamicSegments = extractDynamicSegments(routePath)

    const myLayouts = layouts
      .filter((l) => dir === "." ? path.dirname(l) === "." : dir.startsWith(path.dirname(l)))
      .map((l) => path.join(path.relative(PROJECT_ROOT, appRoot), l))

    const myLoading = loadings.find((l) => path.dirname(l) === dir)
    const myError = errors.find((e) => path.dirname(e) === dir)

    return {
      slug,
      path: routePath,
      file: path.join(path.relative(PROJECT_ROOT, appRoot), pageFile),
      layouts: myLayouts,
      loading: myLoading ? path.join(path.relative(PROJECT_ROOT, appRoot), myLoading) : null,
      errorBoundary: myError ? path.join(path.relative(PROJECT_ROOT, appRoot), myError) : null,
      dynamic: dynamicSegments.length > 0,
      dynamicSegments,
      guards: guards.slice(),
      parent: null,
      children: [],
    }
  })

  // parent / children 関係を計算
  const byPath = new Map(routes.map((r) => [r.path, r]))
  for (const r of routes) {
    const segments = r.path.split("/").filter(Boolean)
    for (let i = segments.length - 1; i >= 0; i--) {
      const parentPath = "/" + segments.slice(0, i).join("/")
      const parent = byPath.get(parentPath || "/")
      if (parent && parent !== r) {
        r.parent = parent.slug
        parent.children.push(r.slug)
        break
      }
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    project_root: PROJECT_ROOT,
    app_root: path.relative(PROJECT_ROOT, appRoot),
    route_count: routes.length,
    routes,
  }, null, 2))

  console.log(`Extracted ${routes.length} routes → ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`)
}

run()
