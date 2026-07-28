#!/usr/bin/env node
// check-templates-fixtures — templates/*.mjs の good/bad fixture が期待どおり判定されるかを検査する。
//
// 目的: 「fixture で確認した」を人手の記憶でなく再実行可能な gate にする。
//   good = 0 件 (誤検出ゼロ)、bad = 期待 rule が発火、を最低条件として固定する。
//
// 依存: Node 標準のみ。AST を使う script (carrier-lint / code-vitals / dm-lint) は
//   検査対象 project の typescript を必要とするため、解決できない場合は該当 case を skip する
//   (環境差で false alarm を出さない)。--ts <dir> で明示指定できる。
//
// 使い方: node scripts/check-templates-fixtures.mjs [--ts <dir>]
//   exit 0 = 全 case pass (skip を含む) / 1 = 期待と異なる

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const tsDir = argv[argv.indexOf("--ts") + 1] && argv.includes("--ts") ? argv[argv.indexOf("--ts") + 1] : process.env.TAKUMI_TS;

const T = "skills/takumi/templates";
const F = `${T}/__fixtures__`;
const scratch = mkdtempSync(join(tmpdir(), "takumi-fixtures-"));

const tsArgs = tsDir ? ["--ts", tsDir] : [];

/** script を実行して JSON 出力を返す。失敗時は {__error} を返す */
const run = (script, args) => {
  try {
    const out = execFileSync("node", [`${T}/${script}`, ...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch (error) {
    const stdout = error.stdout ?? "";
    try {
      return JSON.parse(stdout);
    } catch {
      return { __error: (error.stderr || error.message || "").toString().slice(0, 200) };
    }
  }
};

const countByRule = (findings = []) =>
  findings.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] ?? 0) + 1 }), {});

const cases = [
  {
    name: "carrier-lint / bad",
    run: () => run("carrier-lint.mjs", [...tsArgs, `${F}/carrier-lint/bad`]),
    expect: (r) => {
      if (r.skipped) return "skip";
      const by = countByRule(r.findings);
      // K1 (Order.save/saveOrder) と K3 (domain の境界動詞) は必ず出る。
      // K4 は git diff 基点に依存する (commit 済みなら発火しない) ため件数を要求しない。
      if ((by.K1 ?? 0) < 1) return "K1 が検出されていない";
      if ((by.K3 ?? 0) < 1) return "K3 が検出されていない";
      // FP ガード: todo-list.ts の add/addUser と repository.save は出てはいけない
      const fp = (r.findings ?? []).filter((f) => /todo-list|order-repository/.test(f.file));
      return fp.length ? `FP ガード違反: ${fp.map((f) => `${f.rule}@${f.file}`).join(", ")}` : true;
    },
  },
  {
    name: "carrier-lint / good = 0",
    run: () => run("carrier-lint.mjs", [...tsArgs, `${F}/carrier-lint/good`]),
    expect: (r) => (r.skipped ? "skip" : (r.findings ?? []).length === 0 ? true : `good が ${r.findings.length} 件`),
  },
  {
    name: "design-lint / bad (16 rule 発火)",
    run: () => run("design-lint.mjs", [`${F}/design-lint/bad`]),
    expect: (r) => {
      const rules = new Set((r.findings ?? []).map((f) => f.rule));
      const missing = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "J1", "J2", "J3", "S1", "S2", "S3"].filter(
        (x) => !rules.has(x),
      );
      return missing.length ? `未発火 rule: ${missing.join(",")}` : true;
    },
  },
  {
    name: "design-lint / good = 0",
    run: () => run("design-lint.mjs", [`${F}/design-lint/good`]),
    expect: (r) => ((r.findings ?? []).length === 0 ? true : `good が ${r.findings.length} 件`),
  },
  {
    name: "dm-lint / bad (R1 2 件、allow タグは抑止)",
    run: () => run("dm-lint.mjs", [...tsArgs, `${F}/dm-lint/bad`]),
    expect: (r) => {
      if (r.skipped) return "skip";
      const by = countByRule(r.findings);
      return (by.R1 ?? 0) === 2 ? true : `R1 が ${by.R1 ?? 0} 件 (期待 2)`;
    },
  },
  {
    name: "dm-lint / good = 0",
    run: () => run("dm-lint.mjs", [...tsArgs, `${F}/dm-lint/good`]),
    expect: (r) => (r.skipped ? "skip" : (r.findings ?? []).length === 0 ? true : `good が ${r.findings.length} 件`),
  },
  {
    name: "layer-vitals / L5 を redundant-guard にしない",
    run: () =>
      run("layer-vitals.mjs", [
        "--mutation", `${F}/layer-vitals/mutation.json`,
        "--config", `${F}/layer-vitals/config.json`,
        "--justify", `${F}/layer-vitals/justifications.yaml`,
        "--out", join(scratch, "obligations.jsonl"),
      ]),
    expect: (r) => {
      const records = r.records ?? [];
      const guards = records.filter((x) => x.classification === "redundant-guard");
      if (guards.some((g) => g.layer === "L5")) return "L5 が redundant-guard に混入している";
      if (!guards.some((g) => g.layer === "L3")) return "L3 の redundant-guard が検出されていない";
      const escapes = records.filter((x) => x.classification === "layer-escape");
      if (escapes.length < 2) return `layer-escape が ${escapes.length} 件 (期待 2 以上)`;
      if (!escapes.some((e) => e.justified)) return "justification が反映されていない";
      return r.type_killed >= 1 ? true : "type-killed (CompileError) が数えられていない";
    },
  },
  {
    name: "code-vitals / 分割で ≤7 行率と B3 カウンタが同時に動く",
    run: () => {
      const cfg = (dir) => {
        const p = join(scratch, `cv-${dir}.json`);
        execFileSync("node", ["-e", `require("fs").writeFileSync(${JSON.stringify(p)}, JSON.stringify({production:["${F}/code-vitals/${dir}/**"]}))`]);
        return p;
      };
      const before = run("code-vitals.mjs", [...tsArgs, "--config", cfg("before"), `${F}/code-vitals/before`]);
      const after = run("code-vitals.mjs", [...tsArgs, "--config", cfg("after"), `${F}/code-vitals/after`]);
      return { before, after };
    },
    expect: ({ before, after }) => {
      if (!before.ast || before.ast.skipped || !after.ast || after.ast.skipped) return "skip";
      if (!(after.ast.le7_ratio > before.ast.le7_ratio)) return "分割後に ≤7 行率が上がっていない";
      if (!(after.ast.single_callsite_helper > before.ast.single_callsite_helper)) {
        return "分割後に single_callsite_helper が増えていない (gaming の自壊が機能しない)";
      }
      return true;
    },
  },
];

const results = cases.map((c) => {
  const out = c.run();
  if (out.__error) return { name: c.name, status: "fail", detail: `実行失敗: ${out.__error}` };
  const verdict = c.expect(out);
  if (verdict === "skip") return { name: c.name, status: "skip", detail: "typescript 未解決" };
  return verdict === true ? { name: c.name, status: "pass" } : { name: c.name, status: "fail", detail: verdict };
});

for (const r of results) {
  const mark = r.status === "pass" ? "✓" : r.status === "skip" ? "-" : "✗";
  console.log(`  ${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const failed = results.filter((r) => r.status === "fail");
const skipped = results.filter((r) => r.status === "skip");
console.log(
  `\ncheck-templates-fixtures: ${results.length - failed.length - skipped.length} pass / ${failed.length} fail / ${skipped.length} skip`,
);
if (skipped.length && !tsDir) console.log("  (typescript を持つ dir を --ts で渡すと skip を解消できます)");
process.exit(failed.length ? 1 : 0);
