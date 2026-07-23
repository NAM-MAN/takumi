#!/usr/bin/env node
// dm-lint — 二重管理テスト (double management) の候補を列挙する。
//
// 二重管理の定義: **テストの失敗条件が実装値のコピーである**状態。
//   LP 文言のように「テストを書くと同じ事実を 2 箇所で管理することになる」ものを減らすのが狙い。
//   文言は等値テストでなく構造契約 (key 完全性 / placeholder arity / リンク到達性 / schema) で守る。
//
// 検出:
//   R1 literal-mirror   assertion の literal が被テスト実装 (または import 定数) に verbatim 出現
//   R2 content-lock     killed mutant が content glob 内の StringLiteral に偏る test
//                       (--mutation と --content-glob が両方与えられたときのみ有効)
//
// 設計方針 (軍師 敵対レビューの反映):
//   - **率 (DMR) を KPI にしない**。候補列挙のみ。削除圧にしない
//   - 除外タグを必須サポートする。文言そのものが仕様である場合 (法務・広告審査済) は正当
//   - R2 単独では弱いので、R1 と重なったときだけ「強い候補」と表示する
//
// 除外: 対象行/直前行に `dm-lint-allow <tag>: 理由`
//   tag = legal-copy | public-api-contract | snapshot-baseline | security-boundary |
//         schema-migration | i18n
//
// 依存: Node 標準 + 検査対象プロジェクトの既存 typescript のみ (新規ライブラリ導入なし)。
// 使い方: cd <project> && node path/to/dm-lint.mjs src
//   --min-len <n>       R1 が対象にする文字列長の下限 (既定 8)
//   --mutation <f.json> Stryker json (R2 用)
//   --content-glob <g>  content module の glob (R2 用、繰返し可)
//   --ts <dir>          typescript の解決元
//   --json / --strict   機械可読出力 / hard finding で exit 1 (既定は常に exit 0)

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const optValue = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const repeated = (n) => argv.reduce((acc, a, i) => (a === `--${n}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const VALUE_FLAGS = new Set(["--min-len", "--mutation", "--content-glob", "--ts"]);
const roots = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const targets = roots.length ? roots : ["src"];
const minLen = Number(optValue("min-len") ?? 8);
const asJson = flag("json");
const strict = flag("strict");

const hasCompilerApi = (m) => Boolean(m && m.createSourceFile && m.ScriptTarget);
const loadTypeScript = async () => {
  const bases = [optValue("ts") || process.env.TAKUMI_TS, process.cwd()].filter(Boolean);
  for (const base of bases) {
    try {
      const req = createRequire(join(base, "package.json"));
      const mod = (await import(pathToFileURL(req.resolve("typescript")).href)).default;
      if (hasCompilerApi(mod)) return mod;
    } catch {
      /* 次の候補へ */
    }
  }
  return null;
};
const ts = await loadTypeScript();

const ALLOW_TAGS = ["legal-copy", "public-api-contract", "snapshot-baseline", "security-boundary", "schema-migration", "i18n"];
const ASSERT_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual", "toContain", "toHaveTextContent", "toHaveValue", "toMatch"]);
const TRIVIAL_NUMBERS = new Set([0, 1, -1, 2, 100]);
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;

const findings = [];

const walk = (p, acc = []) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return acc;
  }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.next|\.git|dist|build|coverage)$/.test(p)) return acc;
    return readdirSync(p).reduce((a, e) => walk(join(p, e), a), acc);
  }
  return /\.[jt]sx?$/.test(p) ? [...acc, p] : acc;
};

const resolveImport = (fromFile, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((c) => existsSync(c)) ?? null;
};

/** 対象ファイルの string / number literal 集合を返す (1 段だけ相対 import も辿る) */
const literalsOf = (file, depth = 1, seen = new Set()) => {
  if (!file || seen.has(file)) return new Set();
  const nextSeen = new Set([...seen, file]);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return new Set();
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const acc = new Set();
  const imports = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) acc.add(node.text);
    if (ts.isNumericLiteral(node)) acc.add(Number(node.text));
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (depth <= 0) return acc;
  for (const spec of imports) {
    const resolved = resolveImport(file, spec);
    if (resolved && !TEST_FILE.test(resolved)) {
      for (const v of literalsOf(resolved, depth - 1, nextSeen)) acc.add(v);
    }
  }
  return acc;
};

const scanTestFile = (file) => {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line;
  const allowed = (i) => {
    const around = `${lines[i] ?? ""}\n${lines[i - 1] ?? ""}`;
    return ALLOW_TAGS.some((tag) => new RegExp(`dm-lint-allow\\s+${tag}\\b`).test(around));
  };

  // 被テスト実装の literal 集合 (相対 import 先を 1 段辿る)
  const prodLiterals = (() => {
    const acc = new Set();
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveImport(file, node.moduleSpecifier.text);
        if (resolved && !TEST_FILE.test(resolved)) for (const v of literalsOf(resolved)) acc.add(v);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return acc;
  })();
  if (prodLiterals.size === 0) return;

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const matcher = node.expression.name.getText(sf);
      if (ASSERT_MATCHERS.has(matcher)) {
        for (const arg of node.arguments) {
          const isString = ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg);
          const isNumber = ts.isNumericLiteral(arg);
          if (!isString && !isNumber) continue;
          const value = isNumber ? Number(arg.text) : arg.text;
          if (isString && value.length < minLen) continue;
          if (isNumber && TRIVIAL_NUMBERS.has(value)) continue;
          if (!prodLiterals.has(value)) continue;
          const i = lineOf(arg);
          if (allowed(i)) continue;
          findings.push({
            file,
            line: i + 1,
            rule: "R1",
            sev: "mid",
            msg: `assertion の値が実装側にも同じリテラルで存在する (二重管理)。文言・定数は等値テストでなく構造契約で守る。仕様そのものなら dm-lint-allow <${ALLOW_TAGS.join("|")}>: 理由 を付ける`,
            value: String(value).slice(0, 40),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
};

// --- R2: content-lock (mutation.json 併用時のみ) ---
const GLOBSTAR_SLASH = "GS";
const GLOBSTAR = "G";
const globToRe = (g) =>
  new RegExp(
    "^" +
      g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, GLOBSTAR_SLASH)
        .replace(/\*\*/g, GLOBSTAR)
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .split(GLOBSTAR_SLASH)
        .join("(?:.*/)?")
        .split(GLOBSTAR)
        .join(".*") +
      "$",
  );

const detectContentLock = () => {
  const mutationPath = optValue("mutation");
  const contentGlobs = repeated("content-glob");
  if (!mutationPath || contentGlobs.length === 0) return;
  const contentRes = contentGlobs.map(globToRe);
  let mutation;
  try {
    mutation = JSON.parse(readFileSync(mutationPath, "utf8"));
  } catch (error) {
    console.error(`dm-lint: mutation.json を読めません: ${error.message}`);
    return;
  }
  const testNames = Object.entries(mutation.testFiles ?? {}).reduce(
    (m, [file, e]) => (e.tests ?? []).reduce((mm, t) => mm.set(t.id, { name: t.name, file }), m),
    new Map(),
  );
  const perTest = new Map();
  for (const [srcFile, entry] of Object.entries(mutation.files ?? {})) {
    const isContent = contentRes.some((re) => re.test(srcFile));
    for (const m of entry.mutants ?? []) {
      for (const tid of m.killedBy ?? []) {
        const cur = perTest.get(tid) ?? { total: 0, contentString: 0 };
        perTest.set(tid, {
          total: cur.total + 1,
          contentString: cur.contentString + (isContent && /StringLiteral/i.test(m.mutatorName ?? "") ? 1 : 0),
        });
      }
    }
  }
  for (const [tid, agg] of perTest) {
    if (agg.total === 0) continue;
    const ratio = agg.contentString / agg.total;
    if (ratio < 0.8) continue;
    const t = testNames.get(tid) ?? { name: tid, file: "(unknown)" };
    findings.push({
      file: t.file,
      line: 0,
      rule: "R2",
      sev: "low",
      msg: `killed mutant の ${Math.round(ratio * 100)}% が content module の StringLiteral (文言ロック test の疑い)。R1 と重なる場合は強い候補`,
      value: t.name.slice(0, 40),
    });
  }
};

// --- 実行 ---
if (!ts) {
  console.error("dm-lint: typescript(5.x) が解決できないため R1 を skip します (--ts で明示指定できます)");
  if (asJson) console.log(JSON.stringify({ skipped: true }));
  // gate 実行 (--strict) では skip を pass にしない (silent green 防止)
  process.exit(strict ? 2 : 0);
}

const files = targets.flatMap((t) => walk(t));
for (const f of files.filter((f) => TEST_FILE.test(f))) scanTestFile(f);
detectContentLock();

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const hard = findings.filter((f) => f.sev === "mid" || f.sev === "high");

if (asJson) {
  console.log(JSON.stringify({ findings }, null, 2));
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}: [${f.rule}/${f.sev}] ${f.msg}\n    > ${f.value}`);
  const byRule = findings.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] ?? 0) + 1 }), {});
  console.log(`\ndm-lint: ${findings.length} findings ${JSON.stringify(byRule)}`);
  console.log("  (候補列挙であり削除指示ではない。文言そのものが仕様なら allow タグで明示する)");
}

process.exit(strict && hard.length ? 1 : 0);
