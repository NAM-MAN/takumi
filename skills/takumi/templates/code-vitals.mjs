#!/usr/bin/env node
// code-vitals — production コードの形状を計測する (report 専用、品質 KPI ではない)。
//
// 位置づけ (重要):
//   smd.md は「LoC は指標でなく副産物。削るべきは public exports / branching / dependency edges」と
//   規定する。本 script はそれを**覆さない**。ai-brevity.md が言う「token 経済 = 後続の全 read /
//   軍師 review / gate / context window が払う実コスト」を可視化するための **report** であり、
//   gate にも KPI にもしない。
//
// 出力:
//   V1 LOC        : git 管理下の production / test / generated / config / docs 別 (cloc 不使用)
//   V2 関数長分布 : 1-2 / 3-7 / 8-20 / 21-100 / 101+ と headline `≤7 行率`
//   V3 B3 カウンタ: delegation_only / single_callsite_helper / mean_callsites
//                   (「意味のない分割で ≤7 行率を上げる」と同時に増える。並置して自壊させる)
//   V4 形状       : ファイル長分布 / 引数個数分布 / 最大ネスト深度
//   V5 表面積     : public export 数 / 未参照 export 候補 / common・shared・utils の LOC
//
// 依存: Node 標準 + git CLI + 検査対象プロジェクトの既存 typescript のみ (新規ライブラリ導入なし)。
//   git が使えなければ FS 走査に degrade。typescript (5.x) が無ければ V1 のみ出力し AST 系は skip。
// 使い方: cd <project> && node path/to/code-vitals.mjs [roots...]
//   --config <f.json>   { "production": ["src/**"], "test": ["**/*.test.ts"], "generated": [...] }
//   --baseline <f.json> 前回の --json 出力。**悪化した項目だけ**を差分表示する
//   --ts <dir>          typescript の解決元 (既定: cwd)
//   --json              機械可読出力 (baseline 用)
//   --top <n>           ワースト N 件の表示数 (既定 5)

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const optValue = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const VALUE_FLAGS = new Set(["--config", "--baseline", "--ts", "--top"]);
const roots = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const asJson = flag("json");
const topN = Number(optValue("top") ?? 5);

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

const readJson = (p, fallback) => {
  if (!p) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (error) {
    console.error(`code-vitals: ${p} を読めません: ${error.message}`);
    process.exit(2);
  }
};
const config = readJson(optValue("config"), {});
const baseline = readJson(optValue("baseline"), null);

// --- 対象ファイルの列挙 (git 管理下を既定。untracked / gitignore は構造的に除外) ---
const gitOut = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

const walkFs = (p, acc) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return acc;
  }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.next|\.git|dist|build|coverage)$/.test(p)) return acc;
    return readdirSync(p).reduce((a, e) => walkFs(join(p, e), a), acc);
  }
  return [...acc, p];
};

const listFiles = () => {
  const out = gitOut(["ls-files", "-z", "--", ...(roots.length ? roots : ["."])]);
  if (out !== null) {
    return { files: out.split("\0").filter(Boolean), source: "git" };
  }
  return { files: (roots.length ? roots : ["."]).flatMap((r) => walkFs(r, [])), source: "fs" };
};

// --- 分類 ---
const GLOBSTAR_SLASH = "\\u0001GS\\u0001";
const GLOBSTAR = "\\u0002G\\u0002";
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
const compiledConfig = Object.entries(config).map(([kind, globs]) => ({
  kind,
  res: (Array.isArray(globs) ? globs : [globs]).map(globToRe),
}));

const DEFAULT_TEST = /(\.(test|spec)\.[jt]sx?$)|(^|\/)(__tests__|__mocks__|e2e|tests?)(\/|$)/;
const DEFAULT_GENERATED = /(\.d\.ts$)|(\.min\.js$)|(\.snap$)|(^|\/)(dist|build|out|\.next|generated|__generated__)(\/|$)|(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const DEFAULT_DOCS = /\.(md|mdx|txt|rst)$/;
const DEFAULT_CONFIG = /(^|\/)(package\.json|tsconfig[^/]*\.json|[^/]*\.config\.[jt]s|[^/]*\.ya?ml|\.[^/]*rc)$/;
const FIXTURE = /(^|\/)__fixtures__(\/|$)/;

const classify = (file, text) => {
  const declared = compiledConfig.find((c) => c.res.some((re) => re.test(file)));
  if (declared) return declared.kind;
  if (DEFAULT_GENERATED.test(file)) return "generated";
  if (text !== null && /@generated\b/.test(text.split("\n").slice(0, 5).join("\n"))) return "generated";
  if (DEFAULT_TEST.test(file) || FIXTURE.test(file)) return "test";
  if (DEFAULT_DOCS.test(file)) return "docs";
  if (DEFAULT_CONFIG.test(file)) return "config";
  return "production";
};

// --- コメント / 空行を除いた実コード行 ---
const C_LIKE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".kt", ".go", ".rs", ".c", ".h", ".cpp", ".cs", ".swift", ".scala"]);
const HASH_LIKE = new Set([".py", ".rb", ".sh", ".bash", ".zsh", ".yaml", ".yml", ".toml"]);

/** 文字列リテラルを考慮した簡易 state machine。近似であり厳密なパーサではない。 */
const codeLines = (text, ext) => {
  if (HASH_LIKE.has(ext)) {
    return text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  }
  if (!C_LIKE.has(ext)) return text.split("\n").filter((l) => l.trim()).length;

  const state = text.split("\n").reduce(
    (acc, raw) => {
      const stripped = raw.split("").reduce(
        (s, ch, i, arr) => {
          const next = arr[i + 1];
          if (s.lineComment) return s; // 行コメント以降は行末まで捨てる
          if (s.inBlock) return ch === "*" && next === "/" ? { ...s, inBlock: false, skip: 1 } : s;
          if (s.skip > 0) return { ...s, skip: s.skip - 1 };
          if (s.quote) {
            if (ch === "\\") return { ...s, skip: 1 };
            return ch === s.quote ? { ...s, quote: null, out: s.out + ch } : { ...s, out: s.out + ch };
          }
          if (ch === "/" && next === "/") return { ...s, lineComment: true };
          if (ch === "/" && next === "*") return { ...s, inBlock: true, skip: 1 };
          if (ch === '"' || ch === "'" || ch === "`") return { ...s, quote: ch, out: s.out + ch };
          return { ...s, out: s.out + ch };
        },
        { ...acc, out: "", lineComment: false, skip: 0 },
      );
      const meaningful = stripped.out.trim().length > 0;
      return { inBlock: stripped.inBlock, quote: stripped.quote, count: acc.count + (meaningful ? 1 : 0) };
    },
    { inBlock: false, quote: null, count: 0 },
  );
  return state.count;
};

// --- 収集 ---
const { files, source: fileSource } = listFiles();
const perFile = files.reduce((acc, file) => {
  let text = null;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return acc;
  }
  if (text.includes("\0")) return acc; // binary
  const kind = classify(file, text);
  const ext = extname(file);
  return [...acc, { file, kind, ext, total: text.split("\n").length, code: codeLines(text, ext), text }];
}, []);

const production = perFile.filter((f) => f.kind === "production");
const sumBy = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
const locByKind = perFile.reduce(
  (m, f) => ({ ...m, [f.kind]: { files: (m[f.kind]?.files ?? 0) + 1, code: (m[f.kind]?.code ?? 0) + f.code } }),
  {},
);

// --- AST 系 (TS/JS のみ) ---
const BUCKETS = [
  ["1-2", 1, 2],
  ["3-7", 3, 7],
  ["8-20", 8, 20],
  ["21-100", 21, 100],
  ["101+", 101, Infinity],
];
const emptyHistogram = () => BUCKETS.reduce((m, [name]) => ({ ...m, [name]: 0 }), {});

const analyzeAst = () => {
  const tsFiles = production.filter((f) => /\.[jt]sx?$/.test(f.ext));
  const histogram = emptyHistogram();
  const argHistogram = {};
  const state = { functions: 0, delegationOnly: 0, longest: [], maxDepth: 0, deepest: [], exports: [] };
  const importedNames = new Set();
  const localHelpers = [];

  const bucketOf = (n) => BUCKETS.find(([, lo, hi]) => n >= lo && n <= hi)?.[0] ?? "1-2";

  for (const f of tsFiles) {
    const sf = ts.createSourceFile(f.file, f.text, ts.ScriptTarget.Latest, true, f.ext.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line;
    const fileLines = f.text.split("\n");

    // body の実行行数 (空行 / コメントのみ行 / 単独 brace 行を除く)
    const bodyLineCount = (fn) => {
      if (!fn.body) return 0;
      if (!ts.isBlock(fn.body)) return 1;
      const start = sf.getLineAndCharacterOfPosition(fn.body.getStart()).line;
      const end = sf.getLineAndCharacterOfPosition(fn.body.getEnd()).line;
      return fileLines
        .slice(start + 1, end)
        .filter((l) => {
          const t = l.trim();
          return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !/^[{}();,]+$/.test(t);
        }).length;
    };

    const isDelegationOnly = (fn) => {
      if (!fn.body) return false;
      if (!ts.isBlock(fn.body)) return ts.isCallExpression(fn.body);
      if (fn.body.statements.length !== 1) return false;
      const [st] = fn.body.statements;
      if (ts.isReturnStatement(st)) return Boolean(st.expression && ts.isCallExpression(st.expression));
      return ts.isExpressionStatement(st) && ts.isCallExpression(st.expression);
    };

    const depthOf = (fn) => {
      const maxIn = (node, d) => {
        const nests = ts.isBlock(node) || ts.isIfStatement(node) || ts.isForStatement(node) ||
          ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) ||
          ts.isTryStatement(node) || ts.isSwitchStatement(node);
        const here = nests ? d + 1 : d;
        const children = [];
        ts.forEachChild(node, (c) => {
          children.push(maxIn(c, here));
        });
        return Math.max(here, ...children, 0);
      };
      return fn.body ? maxIn(fn.body, 0) : 0;
    };

    const isModuleScope = (node) => {
      if (ts.isFunctionDeclaration(node)) return ts.isSourceFile(node.parent);
      const stmt = node.parent?.parent;
      return Boolean(stmt && ts.isVariableStatement(stmt) && ts.isSourceFile(stmt.parent));
    };
    const isExported = (node) => {
      const target = ts.isVariableDeclaration(node) ? node.parent?.parent : node;
      return Boolean(target?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    };

    const identifierCounts = new Map();
    const countIdentifiers = (node) => {
      if (ts.isIdentifier(node)) identifierCounts.set(node.text, (identifierCounts.get(node.text) ?? 0) + 1);
      ts.forEachChild(node, countIdentifiers);
    };
    countIdentifiers(sf);

    const visit = (node) => {
      if (ts.isImportDeclaration(node) && node.importClause) {
        const named = node.importClause.namedBindings;
        if (named && ts.isNamedImports(named)) for (const el of named.elements) importedNames.add(el.name.text);
        if (node.importClause.name) importedNames.add(node.importClause.name.text);
      }
      // 抽象化の単位 (宣言された関数) だけを数える。
      // call の引数として渡されるインライン callback (`arr.map(x => ...)`) は実装詳細であり、
      // これを 1 関数として数えると 1-2 行 bucket が膨らんで ≤7 行率が意味を失う。
      const isInlineCallback =
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        node.parent &&
        (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent)) &&
        node.parent.arguments?.includes(node);
      const isFn =
        !isInlineCallback &&
        (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node));
      if (isFn) {
        const n = bodyLineCount(node);
        state.functions += 1;
        histogram[bucketOf(Math.max(n, 1))] += 1;
        argHistogram[node.parameters.length] = (argHistogram[node.parameters.length] ?? 0) + 1;
        if (isDelegationOnly(node)) state.delegationOnly += 1;
        const d = depthOf(node);
        state.maxDepth = Math.max(state.maxDepth, d);
        state.deepest = [...state.deepest, { file: f.file, line: lineOf(node) + 1, depth: d }];
        state.longest = [...state.longest, { file: f.file, line: lineOf(node) + 1, lines: n }];
      }
      const named = ts.isFunctionDeclaration(node) && node.name
        ? { name: node.name.text, node }
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? { name: node.name.text, node }
          : null;
      if (named && isModuleScope(node)) {
        if (isExported(node)) {
          state.exports = [...state.exports, { name: named.name, file: f.file, line: lineOf(node) + 1 }];
        } else {
          // 宣言自身の 1 回を引いた出現数 = file 内の呼出箇所数 (非 export なので file 外参照は無い)
          localHelpers.push({ name: named.name, file: f.file, callsites: (identifierCounts.get(named.name) ?? 1) - 1 });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const totalFns = Object.values(histogram).reduce((a, b) => a + b, 0);
  const le7 = histogram["1-2"] + histogram["3-7"];
  const singleCallsite = localHelpers.filter((h) => h.callsites <= 1);
  const meanCallsites = localHelpers.length
    ? Number((localHelpers.reduce((a, h) => a + h.callsites, 0) / localHelpers.length).toFixed(2))
    : 0;
  const unreferencedExports = state.exports.filter((e) => !importedNames.has(e.name));

  return {
    functions: totalFns,
    histogram,
    le7_ratio: totalFns ? Number((le7 / totalFns).toFixed(3)) : 0,
    delegation_only: state.delegationOnly,
    single_callsite_helper: singleCallsite.length,
    mean_callsites: meanCallsites,
    arg_histogram: argHistogram,
    args_3plus: Object.entries(argHistogram).reduce((n, [k, v]) => (Number(k) >= 3 ? n + v : n), 0),
    max_nest_depth: state.maxDepth,
    exports: state.exports.length,
    unreferenced_export_candidates: unreferencedExports.length,
    longest: state.longest.sort((a, b) => b.lines - a.lines).slice(0, topN),
    deepest: state.deepest.sort((a, b) => b.depth - a.depth).slice(0, topN),
    unreferenced_sample: unreferencedExports.slice(0, topN),
  };
};

const ast = ts ? analyzeAst() : null;

const HUB_DIR = /(^|\/)(common|shared|utils|util|helpers?|misc)(\/|$)/;
const report = {
  file_source: fileSource,
  loc: locByKind,
  production_files: production.length,
  production_code_lines: sumBy(production, "code"),
  file_length: {
    over_400: production.filter((f) => f.code > 400).length,
    over_800: production.filter((f) => f.code > 800).length,
    largest: [...production].sort((a, b) => b.code - a.code).slice(0, topN).map((f) => ({ file: f.file, code: f.code })),
  },
  hub_dirs: {
    files: production.filter((f) => HUB_DIR.test(f.file)).length,
    code: sumBy(production.filter((f) => HUB_DIR.test(f.file)), "code"),
  },
  ast: ast ?? { skipped: "typescript(5.x) 未解決のため AST 系を skip" },
};

// --- 出力 ---
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`-- V1 LOC (${fileSource === "git" ? "git 管理下" : "FS 走査 (git 不使用)"}) --`);
  for (const [kind, v] of Object.entries(report.loc).sort()) {
    console.log(`  ${kind.padEnd(11)} files=${String(v.files).padEnd(5)} code=${v.code}`);
  }
  if (ast) {
    console.log(`\n-- V2 関数長分布 (production ${ast.functions} 関数) --`);
    for (const [name] of BUCKETS) console.log(`  ${name.padEnd(8)} ${ast.histogram[name]}`);
    console.log(`  headline: ≤7 行率 = ${ast.le7_ratio}`);
    console.log(`\n-- V3 B3 カウンタ (≤7 行率と併読する。分割で率を上げると同時に増える) --`);
    console.log(`  delegation_only=${ast.delegation_only}  single_callsite_helper=${ast.single_callsite_helper}  mean_callsites=${ast.mean_callsites}`);
    console.log(`\n-- V4 形状 --`);
    console.log(`  引数 3 個以上の関数=${ast.args_3plus}  最大ネスト深度=${ast.max_nest_depth}`);
    console.log(`  400 行超 file=${report.file_length.over_400}  800 行超=${report.file_length.over_800}`);
    console.log(`\n-- V5 表面積 --`);
    console.log(`  public export=${ast.exports}  未参照 export 候補=${ast.unreferenced_export_candidates} (動的 import/plugin は検出不能。削除判断に使わない)`);
    console.log(`  common/shared/utils: files=${report.hub_dirs.files} code=${report.hub_dirs.code}`);
    if (ast.longest.length) {
      console.log(`\n-- ワースト ${topN} (最長関数) --`);
      for (const l of ast.longest) console.log(`  ${l.file}:${l.line}  ${l.lines} 行`);
    }
  } else {
    console.log(`\n  (AST 系 skip: ${report.ast.skipped})`);
  }
}

// --- baseline 差分: 悪化した項目だけを出す (軍師指摘 (c): 全量サマリは飾りになる) ---
const WORSE_IF_UP = [
  ["production_code_lines", (r) => r.production_code_lines],
  ["delegation_only", (r) => r.ast?.delegation_only],
  ["single_callsite_helper", (r) => r.ast?.single_callsite_helper],
  ["args_3plus", (r) => r.ast?.args_3plus],
  ["max_nest_depth", (r) => r.ast?.max_nest_depth],
  ["unreferenced_export_candidates", (r) => r.ast?.unreferenced_export_candidates],
  ["file_over_800", (r) => r.file_length.over_800],
];
if (baseline && !asJson) {
  const worsened = WORSE_IF_UP.map(([name, pick]) => ({ name, now: pick(report), before: pick(baseline) }))
    .filter((d) => typeof d.now === "number" && typeof d.before === "number" && d.now > d.before);
  console.log(`\n-- baseline 比較 (悪化した項目のみ) --`);
  if (worsened.length === 0) console.log("  悪化なし");
  for (const d of worsened) console.log(`  ⚠ ${d.name}: ${d.before} → ${d.now} (+${d.now - d.before})`);
}

process.exit(0);
