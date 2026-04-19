#!/usr/bin/env node
/**
 * Stage 3-5: Tier に応じてテスト / machine を生成する (Claude Agent SDK 経由)
 *
 * 使い方:
 *   npx tsx generate.ts --full               # 全 route
 *   npx tsx generate.ts --incremental --files <paths...>
 *   npx tsx generate.ts --slug <slug>
 *   npx tsx generate.ts --drift              # Stage 5 のみ
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { spawn } from "node:child_process"

type Tier = "A" | "B" | "C" | "D"
type Metrics = { slug: string; tier: Tier; generated_format: string; evidence: any }

const PROJECT_ROOT = process.cwd()
const MACHINES_DIR = path.join(PROJECT_ROOT, ".takumi", "machines")
const ROUTES_FILE = path.join(MACHINES_DIR, "routes.json")
const SKILL_PROMPTS_DIR = path.join(
  process.env.HOME || "",
  ".claude", "skills", "verify", "prompts"
)

type Mode = "full" | "incremental" | "slug" | "drift"
function parseArgs(): { mode: Mode; files?: string[]; slug?: string } {
  const a = process.argv.slice(2)
  if (a.includes("--drift")) return { mode: "drift" }
  if (a.includes("--full")) return { mode: "full" }
  if (a.includes("--incremental")) {
    const idx = a.indexOf("--files")
    const files = idx > -1 ? a.slice(idx + 1).filter((s) => !s.startsWith("--")) : []
    return { mode: "incremental", files }
  }
  const slugIdx = a.indexOf("--slug")
  if (slugIdx > -1) return { mode: "slug", slug: a[slugIdx + 1] }
  return { mode: "incremental", files: [] }
}

function runScript(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", script, ...args], { stdio: "inherit", cwd: PROJECT_ROOT })
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))))
  })
}

function loadMetrics(slug: string): Metrics | null {
  const f = path.join(MACHINES_DIR, slug, "metrics.json")
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null
}

function loadPromptTemplate(tier: Tier, stage: "generate" | "drift"): string {
  const fileMap: Record<string, string> = {
    "generate-A": "tier-a.txt",
    "generate-B": "tier-b.txt",
    "generate-C": "tier-c.txt",
    "generate-D": "tier-d.txt",
    "drift-A": "drift.txt",
    "drift-B": "drift.txt",
    "drift-C": "drift.txt",
    "drift-D": "drift.txt",
  }
  const fname = fileMap[`${stage}-${tier}`]
  const p = path.join(SKILL_PROMPTS_DIR, fname)
  if (!fs.existsSync(p)) throw new Error(`Prompt template missing: ${p}`)
  return fs.readFileSync(p, "utf-8")
}

function callClaudeAgent(prompt: string, context: Record<string, string>): Promise<string> {
  // Claude Agent SDK を使う想定。最小実装では claude-code CLI 経由:
  //   echo "$prompt" | claude-code -p --print-result
  // ここでは簡易に child_process で shell 経由
  return new Promise((resolve, reject) => {
    const filledPrompt = Object.entries(context).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v),
      prompt
    )
    const child = spawn("claude-code", ["-p", "--output", "json"], {
      stdio: ["pipe", "pipe", "inherit"],
    })
    child.stdin.write(filledPrompt)
    child.stdin.end()
    let out = ""
    child.stdout.on("data", (d) => (out += d.toString()))
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude-code exited ${code}`))
      resolve(out)
    })
    child.on("error", (err) => {
      // フォールバック: CLI が無い場合は user に依頼
      console.error("[WARN] claude-code CLI not available. Prompt saved to:", path.join(MACHINES_DIR, "pending-prompts", `${Date.now()}.txt`))
      fs.mkdirSync(path.join(MACHINES_DIR, "pending-prompts"), { recursive: true })
      const file = path.join(MACHINES_DIR, "pending-prompts", `${Date.now()}.txt`)
      fs.writeFileSync(file, filledPrompt)
      resolve(`{"pending": "${file}"}`)
    })
  })
}

async function processSlug(slug: string) {
  const metrics = loadMetrics(slug)
  if (!metrics) {
    console.warn(`[${slug}] metrics.json not found. Skipping.`)
    return
  }
  const prompt = loadPromptTemplate(metrics.tier, "generate")
  const sourceFiles = [] as string[]
  const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf-8")).routes
  const route = routes.find((r: any) => r.slug === slug)
  if (route?.file) sourceFiles.push(route.file)

  const source = sourceFiles
    .filter((f) => fs.existsSync(path.join(PROJECT_ROOT, f)))
    .map((f) => `// ${f}\n${fs.readFileSync(path.join(PROJECT_ROOT, f), "utf-8")}`)
    .join("\n\n")

  const result = await callClaudeAgent(prompt, {
    slug,
    tier: metrics.tier,
    metrics: JSON.stringify(metrics, null, 2),
    source: source.slice(0, 8000),
    evidence: JSON.stringify(metrics.evidence, null, 2),
  })

  const outFile = path.join(MACHINES_DIR, slug, "generation.log.json")
  fs.writeFileSync(outFile, result)
  console.log(`[${slug}] Tier ${metrics.tier} generation → ${path.relative(PROJECT_ROOT, outFile)}`)
}

function slugFromChangedFile(file: string): string | null {
  // app/foo/page.tsx -> foo
  const m = file.match(/^(?:src\/)?app\/(.*?)\/page\.(tsx?|jsx?)$/)
  if (!m) return null
  const segments = m[1].split("/").filter((s) => !(s.startsWith("(") && s.endsWith(")")))
  if (segments.length === 0) return "root"
  return segments.map((s) => s.replace(/\[|\]/g, "")).join("-").toLowerCase()
}

async function main() {
  const { mode, files, slug } = parseArgs()

  // Stage 1-2 を先に必ず回す
  await runScript(path.join(__dirname, "extract-routes.ts"))
  await runScript(path.join(__dirname, "score-metrics.ts"))

  if (mode === "drift") {
    console.log("[drift] Stage 5 only: triangulation against Runtime / Spec")
    // TODO: Runtime trace の読み取り + Spec 比較 (ここでは stub)
    console.log("(drift stage: not implemented in reference script; see machine-generator.md Stage 5)")
    return
  }

  const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf-8")).routes as any[]
  let targetSlugs: string[] = []

  if (mode === "full") {
    targetSlugs = routes.map((r) => r.slug)
  } else if (mode === "slug" && slug) {
    targetSlugs = [slug]
  } else if (mode === "incremental" && files) {
    const set = new Set<string>()
    for (const f of files) {
      const s = slugFromChangedFile(f)
      if (s) set.add(s)
    }
    targetSlugs = Array.from(set)
  }

  console.log(`Generating for ${targetSlugs.length} route(s): ${targetSlugs.join(", ")}`)
  for (const s of targetSlugs) {
    try {
      await processSlug(s)
    } catch (e: any) {
      console.error(`[${s}] failed:`, e.message)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
