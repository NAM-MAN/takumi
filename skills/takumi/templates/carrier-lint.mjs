#!/usr/bin/env node
// carrier-lint — behavior-carrier.md (Rule 19 / Rule 21) の機械検査。
//
// 検出:
//   K1 carrier-dual-definition : メソッド `T.verb()` と関数 `verbT(...)` が同一 (動詞, 名詞) で併存
//                                (= `hoge.save()` と `saveHoge()` の混在)。hard = lint、0 が正
//   K2 carrier-layer-mix       : 層ごとの carrier 分布 (method / function / class-DI / closure / hook)。
//                                report のみ。expect 宣言がある層だけ「既定と最頻の乖離」を出す
//   K3 rule19-boundary-verb    : domain 層の型のメソッド名が persistence/transport/I/O 動詞
//                                (`order.save()` 等)。report (候補列挙)
//   K4 rule21-new-debt         : `class *Service` / `*Handler.handle()` / 1-method `*Executor.execute()` の
//                                **新規追加のみ** (git diff)。hard = gate、既存コードは一切対象外
//
// 設計方針: 誤検出 (FP) を最優先で抑える。
//   K1 は「同一動詞 かつ 同一名詞」のみ。汎用動詞 (get/set/is/has/to/from/with/use) は stoplist で除外。
//     名詞はメソッド名の残りトークン、無ければ受け手の型名を使う。これにより `list.add()` と `addUser()` は
//     (add,list) vs (add,user) となり **一致しない** (別概念の同名動詞を拾わない)。
//   K3 は **domain 層に限定** し、Repository/Adapter/Client/Gateway/Store/Dao/Mapper 接尾辞の型を除外する
//     (`repo.save(order)` は Rule 12 の正しい形であり違反ではない)。
//   K2 の層既定 (expect) は宣言があるときだけ規範判定する。層が unknown の要素は分布にのみ計上し、
//     規範判定しない (分類器の正しさを指標に混ぜない = 循環論証の回避)。
//   K4 は grandfathered 規定 (behavior-carrier.md §5) に従い、diff の追加行にある宣言だけを対象にする。
//
// 依存: Node 標準 + git CLI + 検査対象プロジェクトの既存 typescript のみ (新規ライブラリ導入なし)。
//   typescript が解決できない場合は AST 系を skip して degrade する (exit 2 にしない)。
//   既知の制約: TypeScript 7 (Go port) の `typescript` entry は JS compiler API を持たないため
//   createSourceFile の有無で検証し、無ければ未解決扱いで skip する。TS 5.x が必要。
// 使い方: cd <project> && node path/to/carrier-lint.mjs src
//   --config <f.json>   { "layers": {"domain": ["src/domain/**"]}, "expect": {"domain": "method"} }
//   --layer name=glob   layers の shorthand (繰返し可)
//   --base <ref>        K4 の diff 基点 (既定: master/main との merge-base、無ければ K4 skip)
//   --json              機械可読出力
//   --strict            hard finding (K1/K4) があれば exit 1 (既定は常に exit 0)
//   --include-tests     test ファイルも走査対象にする (既定は production のみ)
//
// 例外指定: 対象行/直前行/対象本文に `carrier-lint-allow K1: 理由` (理由付き、レビュー可能な opt-out)

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname, relative, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

// --- 引数 ---
const argv = process.argv.slice(2);

// --- typescript の動的解決 (検査対象プロジェクトの node_modules から) ---
// 解決順: --ts <dir|module path> → 環境変数 TAKUMI_TS → cwd の package.json
// (monorepo や cwd に node_modules を持たない構成のための明示指定。依存の追加ではない)
// TypeScript 7 (Go port) の `typescript` entry は compiler API を持たない。
// 解決できても createSourceFile が無ければ「未解決」として扱い、regex fallback に降りる。
const hasCompilerApi = (mod) => Boolean(mod && mod.createSourceFile && mod.ScriptTarget);
const loadTypeScript = async () => {
  const explicit = argv[argv.indexOf("--ts") + 1];
  const bases = [explicit || process.env.TAKUMI_TS, process.cwd()].filter(Boolean);
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
const flag = (name) => argv.includes(`--${name}`);
const optValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};
const repeated = (name) =>
  argv.reduce((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const asJson = flag("json");
const strict = flag("strict");
const includeTests = flag("include-tests");
const VALUE_FLAGS = new Set(["--config", "--layer", "--base", "--ts"]);
const targets = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const roots = targets.length ? targets : ["src"];

const readConfig = () => {
  const p = optValue("config");
  if (!p) return { layers: {}, expect: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return { layers: parsed.layers ?? {}, expect: parsed.expect ?? {} };
  } catch (error) {
    console.error(`carrier-lint: config を読めません (${p}): ${error.message}`);
    process.exit(2);
  }
};
const config = readConfig();
const layerGlobs = repeated("layer").reduce((acc, spec) => {
  const [name, glob] = spec.split("=");
  if (!name || !glob) return acc;
  return { ...acc, [name]: [...(acc[name] ?? []), glob] };
}, config.layers);

// --- 層の解決 ---
const GLOBSTAR_SLASH = "\u0001GS\u0001";
const GLOBSTAR = "\u0002G\u0002";
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
const compiledLayers = Object.entries(layerGlobs).map(([name, globs]) => ({
  name,
  res: globs.map(globToRe),
}));

// 宣言が無い場合の推定 (保守的。判定できなければ unknown のままにする)
const INFERRED = [
  ["domain", /(^|\/)(domain|entities|entity|aggregates?|models?)(\/|$)/],
  ["application", /(^|\/)(application|usecases?|use-cases?|interactors?)(\/|$)/],
  ["infra", /(^|\/)(infra|infrastructure|repositories|repository|adapters?|gateways?|persistence)(\/|$)/],
  ["ui", /(^|\/)(ui|components?|hooks|pages|screens?|views?)(\/|$)/],
];

const resolveLayer = (file) => {
  const rel = isAbsolute(file) ? relative(process.cwd(), file) : file;
  const declared = compiledLayers.find((l) => l.res.some((re) => re.test(rel)));
  if (declared) return { layer: declared.name, source: "declared" };
  const inferred = INFERRED.find(([, re]) => re.test(rel));
  return inferred ? { layer: inferred[0], source: "inferred" } : { layer: "unknown", source: "none" };
};

// --- 語彙 ---
const VERB_STOPLIST = new Set(["get", "set", "is", "has", "can", "should", "to", "from", "with", "of", "as", "use"]);
const BOUNDARY_VERBS = new Set([
  "save", "load", "persist", "store", "fetch", "send", "publish", "notify",
  "upload", "download", "print", "sync", "flush", "commit", "insert", "delete",
]);
// K3 で除外する型 (これらの型が persistence 動詞を持つのは Rule 12 の正しい形)
const BOUNDARY_TYPE_SUFFIX = /(Repository|Repo|Adapter|Client|Gateway|Store|Dao|Mapper|Api|Service)$/;
const TEST_FILE = /(\.(test|spec)\.tsx?$)|(^|\/)__tests__(\/|$)/;

const camelSplit = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
const norm = (s) => s.toLowerCase();

// --- 収集結果 ---
const findings = [];
const methodOps = []; // { verb, noun, file, line, typeName, methodName, layer, layerSource }
const functionOps = []; // { verb, noun, file, line, fnName }
const carriers = []; // { kind, file, line, layer, layerSource, name }

const walk = (p, onFile) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.next|\.git|dist|build|coverage)$/.test(p)) return;
    for (const e of readdirSync(p)) walk(join(p, e), onFile);
    return;
  }
  if (!/\.tsx?$/.test(extname(p) ? p : "")) return;
  if (!includeTests && TEST_FILE.test(p)) return;
  onFile(p);
};

// --- K4: git diff の追加行 ---
const gitLines = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};

const resolveBase = () => {
  const explicit = optValue("base");
  if (explicit) return explicit;
  for (const ref of ["master", "main"]) {
    const merged = gitLines(["merge-base", "HEAD", ref]);
    if (merged) return merged.trim();
  }
  return null;
};

/** file -> Set<line> の追加行マップ。git が使えなければ null (K4 skip) */
const buildAddedLines = () => {
  const base = resolveBase();
  if (!base) return null;
  const diff = gitLines(["diff", "-U0", "--no-color", base]);
  if (diff === null) return null;
  const added = new Map();
  let current = null;
  for (const line of diff.split("\n")) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      current = fileMatch[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const set = added.get(current) ?? new Set();
      for (let i = 0; i < count; i += 1) set.add(start + i);
      added.set(current, set);
    }
  }
  return added;
};
const addedLines = flag("no-k4") ? null : buildAddedLines();

// --- AST 走査 ---
const scanFile = (file) => {
  const text = readFileSync(file, "utf8");
  const { layer, source: layerSource } = resolveLayer(file);
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = text.split("\n");
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line;
  const loc = (node) => lineOf(node) + 1;
  const allowed = (node, rule) => {
    const ln = lineOf(node);
    const around = `${lines[ln] ?? ""}${lines[ln - 1] ?? ""}`;
    return new RegExp(`carrier-lint-allow\\s+${rule}\\b`).test(around);
  };

  const methodsOf = (decl) =>
    decl.members.filter((m) => (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) && m.name);

  const recordTypeMethods = (decl, typeName) => {
    for (const m of methodsOf(decl)) {
      const methodName = m.name.getText(sf);
      const tokens = camelSplit(methodName);
      if (tokens.length === 0) continue;
      const verb = norm(tokens[0]);
      const noun = tokens.length > 1 ? norm(tokens.slice(1).join("")) : norm(typeName);
      methodOps.push({
        verb, noun, file, line: loc(m), typeName, methodName, layer, layerSource,
        allow: allowed(m, "K1"),
      });
      carriers.push({ kind: "method", file, line: loc(m), layer, layerSource, name: `${typeName}.${methodName}` });

      // K3: domain 層の型が persistence/transport/I/O 動詞を持つ
      const isBoundaryType = BOUNDARY_TYPE_SUFFIX.test(typeName);
      if (layer === "domain" && !isBoundaryType && BOUNDARY_VERBS.has(verb) && !allowed(m, "K3")) {
        findings.push({
          rule: "K3", sev: layerSource === "declared" ? "mid" : "low", file, line: loc(m),
          msg: `domain 層の ${typeName}.${methodName}() が境界動詞 "${verb}" を持つ (Rule 19: persistence/transport/I/O は aggregate の責務でない${layerSource === "inferred" ? "、層は path から推定" : ""})`,
          code: `${typeName}.${methodName}()`,
        });
      }
    }
  };

  const classCarrierKind = (decl) => {
    const ctor = decl.members.find((m) => ts.isConstructorDeclaration(m));
    const methodCount = methodsOf(decl).length;
    return ctor && ctor.parameters.length > 0 && methodCount >= 2 ? "class-DI" : null;
  };

  const returnsFunctionObject = (fn) => {
    if (!fn.body) return false;
    if (!ts.isBlock(fn.body)) return ts.isObjectLiteralExpression(fn.body) && hasFunctionProps(fn.body);
    const ret = fn.body.statements.find((s) => ts.isReturnStatement(s));
    return Boolean(ret?.expression && ts.isObjectLiteralExpression(ret.expression) && hasFunctionProps(ret.expression));
  };
  const hasFunctionProps = (obj) =>
    obj.properties.some(
      (p) =>
        ts.isMethodDeclaration(p) ||
        (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))),
    );

  // module scope の宣言だけを「free function carrier」とみなす。
  // 関数内部のローカル arrow は carrier 選択の対象でなく実装詳細 (誤検出の主因)。
  const isModuleScope = (node) => {
    if (ts.isFunctionDeclaration(node)) return ts.isSourceFile(node.parent);
    const list = node.parent; // VariableDeclarationList
    const stmt = list?.parent; // VariableStatement
    return Boolean(stmt && ts.isVariableStatement(stmt) && ts.isSourceFile(stmt.parent));
  };

  const recordFreeFunction = (name, fnNode, node) => {
    if (!isModuleScope(node)) return;
    const tokens = camelSplit(name);
    const isHook = /^use[A-Z]/.test(name);
    const kind = isHook ? "hook" : returnsFunctionObject(fnNode) ? "closure-factory" : "function";
    carriers.push({ kind, file, line: loc(node), layer, layerSource, name });
    if (isHook || tokens.length < 2) return; // 名詞を特定できない関数名は K1 の対象外
    functionOps.push({
      verb: norm(tokens[0]), noun: norm(tokens.slice(1).join("")), file, line: loc(node), fnName: name,
      layer, layerSource, allow: allowed(node, "K1"),
    });
  };

  const isNewDebt = (node) => {
    if (!addedLines) return false;
    const rel = isAbsolute(file) ? relative(process.cwd(), file) : file;
    return Boolean(addedLines.get(rel)?.has(loc(node)));
  };

  const checkNewDebt = (decl, typeName) => {
    if (!isNewDebt(decl) || allowed(decl, "K4")) return;
    const methods = methodsOf(decl);
    const names = methods.map((m) => m.name.getText(sf));
    const violation = /Service$/.test(typeName)
      ? "XxxService は主語・責務が曖昧"
      : /Handler$/.test(typeName) && names.includes("handle")
        ? "XxxHandler.handle() は主語・責務が曖昧"
        : /Executor$/.test(typeName) && methods.length === 1 && names[0] === "execute"
          ? "1-method XxxExecutor.execute() は ceremony のみ (関数で等価)"
          : null;
    if (!violation) return;
    findings.push({
      rule: "K4", sev: "high", file, line: loc(decl),
      msg: `Rule 21 で新設禁止の carrier を新規追加: ${violation}。既存コードは grandfathered だが新規は対象`,
      code: `class ${typeName}`,
    });
  };

  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const typeName = node.name.getText(sf);
      recordTypeMethods(node, typeName);
      const diKind = classCarrierKind(node);
      if (diKind) carriers.push({ kind: diKind, file, line: loc(node), layer, layerSource, name: typeName });
      checkNewDebt(node, typeName);
    }
    if (ts.isInterfaceDeclaration(node) && node.name) recordTypeMethods(node, node.name.getText(sf));
    if (ts.isFunctionDeclaration(node) && node.name) recordFreeFunction(node.name.getText(sf), node, node);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      recordFreeFunction(node.name.getText(sf), node.initializer, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
};

// --- K1: 同一 (動詞, 名詞) の carrier 二重化 ---
const detectDualDefinition = () => {
  const fnIndex = functionOps.reduce((map, op) => {
    const key = `${op.verb}|${op.noun}`;
    return map.set(key, [...(map.get(key) ?? []), op]);
  }, new Map());

  // Rule 19 は **layer-local consistency**。cross-layer の carrier 差は違反ではない
  // (behavior-carrier.md §1 / SC4)。よって同一層、または層が未分類でも同一 file の対のみを見る。
  const sameScope = (m, f) => (m.layer !== "unknown" && m.layer === f.layer) || m.file === f.file;

  for (const m of methodOps) {
    if (VERB_STOPLIST.has(m.verb)) continue;
    const peers = fnIndex.get(`${m.verb}|${m.noun}`) ?? [];
    for (const f of peers) {
      if (m.allow || f.allow) continue;
      if (!sameScope(m, f)) continue;
      findings.push({
        rule: "K1", sev: "high", file: m.file, line: m.line,
        msg: `carrier 二重化: ${m.typeName}.${m.methodName}() と ${f.fnName}() が同一概念 (${m.verb}, ${m.noun}) を別 carrier で表現 (${f.file}:${f.line})。層内で carrier を一貫させる`,
        code: `${m.typeName}.${m.methodName}() / ${f.fnName}()`,
      });
    }
  }
};

// --- K2: 層別 carrier 分布 ---
const buildDistribution = () => {
  const byLayer = carriers.reduce((map, c) => {
    const entry = map.get(c.layer) ?? { total: 0, kinds: {}, sources: new Set() };
    return map.set(c.layer, {
      total: entry.total + 1,
      kinds: { ...entry.kinds, [c.kind]: (entry.kinds[c.kind] ?? 0) + 1 },
      sources: entry.sources.add(c.layerSource),
    });
  }, new Map());

  return [...byLayer.entries()].map(([layer, e]) => {
    const ranked = Object.entries(e.kinds).sort((a, b) => b[1] - a[1]);
    const [dominant, dominantCount] = ranked[0] ?? [null, 0];
    const expected = config.expect[layer] ?? null;
    return {
      layer, total: e.total, kinds: e.kinds, dominant,
      dominant_share: e.total ? Number((dominantCount / e.total).toFixed(3)) : 0,
      minority: e.total - dominantCount,
      expected,
      // 規範判定は expect 宣言がある層のみ (未宣言なら分布のみ = 分類器を指標に混ぜない)
      deviates: expected ? dominant !== expected : null,
    };
  });
};

// --- 実行 ---
if (!ts) {
  console.error(
    "carrier-lint: typescript が解決できないため AST 検査を skip します (K1-K4 すべて未実行)。\n" +
      "  検査対象プロジェクト直下 (typescript を持つ cwd) で実行してください。",
  );
  if (asJson) console.log(JSON.stringify({ skipped: true, reason: "typescript-unresolved" }));
  process.exit(0);
}

for (const r of roots) walk(r, scanFile);
detectDualDefinition();
const distribution = buildDistribution();

findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.line - b.line);
const hard = findings.filter((f) => f.sev === "high");

if (asJson) {
  console.log(JSON.stringify({ findings, distribution, k4_skipped: addedLines === null }, null, 2));
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}: [${f.rule}/${f.sev}] ${f.msg}\n    > ${f.code}`);
  console.log("\n-- K2 層別 carrier 分布 (report) --");
  for (const d of distribution) {
    const dev = d.deviates === null ? "" : d.deviates ? ` ⚠ 既定 ${d.expected} と乖離` : ` (既定 ${d.expected} と一致)`;
    console.log(
      `  ${d.layer.padEnd(12)} total=${String(d.total).padEnd(4)} dominant=${d.dominant ?? "-"} ` +
        `share=${d.dominant_share} minority=${d.minority}${dev}  ${JSON.stringify(d.kinds)}`,
    );
  }
  if (addedLines === null) console.log("\n  (K4 skip: git diff の基点を解決できませんでした)");
  const byRule = findings.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] ?? 0) + 1 }), {});
  console.log(`\ncarrier-lint: ${findings.length} findings (hard=${hard.length}) ${JSON.stringify(byRule)}`);
}

process.exit(strict && hard.length ? 1 : 0);
