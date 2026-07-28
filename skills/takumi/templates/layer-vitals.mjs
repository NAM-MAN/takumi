#!/usr/bin/env node
// layer-vitals — 「各層で最小コストで検出できているか」を obligation として列挙する (report 専用)。
//
// 位置づけ (重要、軍師 敵対レビューの結論):
//   これは score でも KPI でもない。**annotation** である。率にすると「安い層で同じ mutant を殺す
//   薄い test」を量産して改善できてしまうため、率を出さず obligation の**件数**と一覧だけを出す。
//   減らす手段は「安い層で殺す」か「理由を書く」の 2 つだけ。
//
// classification:
//   type-killed     status=CompileError = 型 (L0) が無料で落とした。obligation ではなく可視化
//   no-coverage     status=NoCoverage
//   layer-escape    期待より高い層でしか殺せていない (expected_layers と cheapest_kill_layer の乖離)
//   redundant-guard 安い層に包含され unique_kill=0 の高コスト test。**L5 は対象外**
//   ok / survived   それ以外
//
// L5 を redundant-guard から外す理由 (軍師指摘):
//   L5 E2E は unique_kill=0 になりやすいが、実際には設定 / routing / 認可 / i18n / ビルド成果物 /
//   外部連携をまとめて守っている。mutation は schema drift / migration / 権限境界 / race / locale /
//   bundler 差分 / 外部 API 契約 / a11y / legal / observability を**構造的に表現できない**ため、
//   mutation 由来の指標で L5 の価値を測ってはいけない。
//
// 循環論証の回避:
//   expected_layers は **profile 宣言を第一情報源**にする。宣言が無い場合のみ path から推定し、
//   その record には expected_source=inferred を付けて advisory 扱いにする
//   (分類器の正しさを指標に混ぜない)。
//
// 依存: Node 標準のみ。
// 使い方: node layer-vitals.mjs --mutation reports/mutation/mutation.json --config layers.json
//   --config <f.json>  { "layers": {"L1": ["test/unit/**"]}, "expect": {"src/domain/**": ["L1"]},
//                        "redundant_guard_exclude": ["test/contract/**", "test/i18n/**"] }
//   --runner <f.json>  vitest --reporter=json の出力 (per-test 実測時間。無ければ covered 数を proxy)
//   --justify <f>      justification ledger (.json / 単純 .yaml)。`<mutantId>: 理由` 20 字以上で解除
//   --out <f.jsonl>    obligation の書き出し先 (既定 .takumi/verify-loop/layer-obligations.jsonl)
//   --json             機械可読出力
//   --strict           未処理 obligation 件数が baseline を超えたら exit 1 (--baseline 必須)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const optValue = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};

const readJson = (p, fallback = null) => {
  if (!p) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (error) {
    console.error(`layer-vitals: ${p} を読めません: ${error.message}`);
    process.exit(2);
  }
};

const mutationPath = optValue("mutation");
if (!mutationPath) {
  console.error("layer-vitals: --mutation <mutation.json> が必要です (Stryker の json reporter 出力)");
  process.exit(2);
}
const mutation = readJson(mutationPath);
const config = readJson(optValue("config"), { layers: {}, expect: {} });
const runner = readJson(optValue("runner"), null);
const baseline = readJson(optValue("baseline"), null);
const outPath = optValue("out") ?? ".takumi/verify-loop/layer-obligations.jsonl";
const asJson = flag("json");

// justification ledger: .json か「id: 理由」だけの単純 .yaml を受ける (YAML パーサは入れない)
const readJustifications = () => {
  const p = optValue("justify");
  if (!p) return {};
  try {
    const raw = readFileSync(p, "utf8");
    if (p.endsWith(".json")) return JSON.parse(raw);
    return raw.split("\n").reduce((acc, line) => {
      const m = /^\s*([\w.\-/:]+)\s*:\s*(.+?)\s*$/.exec(line);
      return m && !line.trim().startsWith("#") ? { ...acc, [m[1]]: m[2] } : acc;
    }, {});
  } catch (error) {
    console.error(`layer-vitals: justification を読めません (${p}): ${error.message}`);
    process.exit(2);
  }
};
const justifications = readJustifications();
const MIN_REASON = 20; // 空・一言の「理由」を未処理扱いにする下限

const GLOBSTAR_SLASH = "GS";
const GLOBSTAR = "G";
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

// 層のコスト順序 (安い→高い)。L4 は「測定器」であって test 層ではないので含めない。
const LAYER_RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L5: 5 };
const EXPENSIVE_MIN = LAYER_RANK.L3; // これ以上を「高コスト層」とみなす
const INFERRED_LAYERS = [
  ["L5", /(^|\/)(e2e|playwright)(\/|$)|\.(e2e|smoke)\.[jt]sx?$/],
  ["L3", /\.(model|machine|differential)\.test\.[jt]sx?$/],
  ["L2", /\.(component|dom)\.test\.[jt]sx?$/],
  ["L1", /\.test\.[jt]sx?$/],
];

const compiledLayers = Object.entries(config.layers ?? {}).map(([name, globs]) => ({
  name,
  res: (Array.isArray(globs) ? globs : [globs]).map(globToRe),
}));
const compiledExpect = Object.entries(config.expect ?? {}).map(([glob, layers]) => ({
  re: globToRe(glob),
  layers: Array.isArray(layers) ? layers : [layers],
}));

const layerOfTestFile = (file) => {
  const declared = compiledLayers.find((l) => l.res.some((re) => re.test(file)));
  if (declared) return { layer: declared.name, source: "declared" };
  const inferred = INFERRED_LAYERS.find(([, re]) => re && re.test(file));
  return inferred ? { layer: inferred[0], source: "inferred" } : { layer: "unknown", source: "none" };
};

const expectedFor = (srcFile) => {
  const hit = compiledExpect.find((e) => e.re.test(srcFile));
  return hit ? { layers: hit.layers, source: "declared" } : { layers: ["L1", "L2"], source: "inferred" };
};

// --- test id -> {file, layer} の索引 ---
const testIndex = Object.entries(mutation.testFiles ?? {}).reduce((map, [file, entry]) => {
  const { layer, source } = layerOfTestFile(file);
  return (entry.tests ?? []).reduce((m, t) => m.set(t.id, { id: t.id, name: t.name, file, layer, source }), map);
}, new Map());

// --- runner 実測時間 (任意) を test file 単位で集計 ---
const runtimeByFile = runner
  ? (runner.testResults ?? []).reduce((m, r) => {
      const file = r.name ?? r.testFilePath ?? "";
      const ms = (r.assertionResults ?? []).reduce((n, a) => n + (a.duration ?? 0), 0);
      return m.set(file, (m.get(file) ?? 0) + ms);
    }, new Map())
  : null;

// --- mutant ごとの分類 ---
const allMutants = Object.entries(mutation.files ?? {}).flatMap(([file, entry]) =>
  (entry.mutants ?? []).map((m) => ({ ...m, srcFile: file })),
);

const uniqueKillCount = new Map(); // testId -> その test だけが殺した mutant 数
for (const m of allMutants) {
  const killers = m.killedBy ?? [];
  if (m.status === "Killed" && killers.length === 1) {
    uniqueKillCount.set(killers[0], (uniqueKillCount.get(killers[0]) ?? 0) + 1);
  }
}

const classifyMutant = (m) => {
  if (m.status === "CompileError") return "type-killed";
  if (m.status === "NoCoverage") return "no-coverage";
  if (m.status !== "Killed" && m.status !== "Timeout") return "survived";

  const killers = (m.killedBy ?? []).map((id) => testIndex.get(id)).filter(Boolean);
  if (killers.length === 0) return "ok";
  const ranked = killers
    .map((k) => ({ ...k, rank: LAYER_RANK[k.layer] ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank);
  const cheapest = ranked[0];
  const expect = expectedFor(m.srcFile);
  const expectMaxRank = Math.max(...expect.layers.map((l) => LAYER_RANK[l] ?? 0));
  return cheapest.rank > expectMaxRank ? "layer-escape" : "ok";
};

const obligations = allMutants
  .map((m) => {
    const classification = classifyMutant(m);
    const killers = (m.killedBy ?? []).map((id) => testIndex.get(id)).filter(Boolean);
    const cheapest = killers
      .map((k) => ({ ...k, rank: LAYER_RANK[k.layer] ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.rank - b.rank)[0];
    const expect = expectedFor(m.srcFile);
    const reason = justifications[m.id] ?? "";
    return {
      mutant_id: m.id,
      file: m.srcFile,
      mutator: m.mutatorName,
      status: m.status,
      classification,
      killed_layers: [...new Set(killers.map((k) => k.layer))],
      cheapest_kill_layer: cheapest?.layer ?? null,
      expected_layers: expect.layers,
      expected_source: expect.source,
      justified: reason.trim().length >= MIN_REASON,
      justification: reason.trim().length >= MIN_REASON ? reason.trim() : null,
    };
  })
  .filter((o) => ["layer-escape", "no-coverage"].includes(o.classification));

// --- redundant-guard: 高コスト層の test で unique_kill=0 (L5 は構造的に除外) ---
// L5 と同じ理由で mutation が価値を測れない test 群 (契約 / migration / i18n / a11y /
// observability) も config で除外できる。既定は空。
const guardExcludeRes = (config.redundant_guard_exclude ?? []).map(globToRe);
const redundantGuards = [...testIndex.values()]
  .filter((t) => {
    const rank = LAYER_RANK[t.layer] ?? -1;
    if (guardExcludeRes.some((re) => re.test(t.file))) return false;
    return rank >= EXPENSIVE_MIN && t.layer !== "L5" && (uniqueKillCount.get(t.id) ?? 0) === 0;
  })
  .map((t) => ({
    test_id: t.id,
    test_name: t.name,
    file: t.file,
    layer: t.layer,
    unique_kills: 0,
    cost_ms: runtimeByFile?.get(t.file) ?? null,
    justified: (justifications[t.id] ?? "").trim().length >= MIN_REASON,
    note: "要人間理由付け候補 (削除候補ではない)",
  }));

const counts = allMutants.reduce((m, x) => {
  const c = classifyMutant(x);
  return { ...m, [c]: (m[c] ?? 0) + 1 };
}, {});
const openObligations = [
  ...obligations.filter((o) => !o.justified),
  ...redundantGuards.filter((r) => !r.justified),
].length;

// --- 書き出し ---
const records = [
  ...obligations.map((o) => ({ kind: "mutant", ...o })),
  ...redundantGuards.map((r) => ({ kind: "test", classification: "redundant-guard", ...r })),
];
try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
} catch (error) {
  console.error(`layer-vitals: ${outPath} に書けません: ${error.message}`);
}

const report = {
  counts,
  type_killed: counts["type-killed"] ?? 0,
  obligations_total: records.length,
  obligations_open: openObligations,
  redundant_guards: redundantGuards.length,
  out: outPath,
};

if (asJson) {
  console.log(JSON.stringify({ ...report, records }, null, 2));
} else {
  console.log("-- mutant 分類 --");
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`\n-- obligation (減らす手段は「安い層で殺す」か「理由を書く」の 2 つだけ) --`);
  for (const o of obligations) {
    const mark = o.justified ? "✓" : "•";
    const src = o.expected_source === "inferred" ? " [expected=推定]" : "";
    console.log(
      `  ${mark} ${o.classification.padEnd(13)} ${o.file} #${o.mutant_id} (${o.mutator}) ` +
        `cheapest=${o.cheapest_kill_layer ?? "-"} expected=${o.expected_layers.join("/")}${src}`,
    );
  }
  for (const r of redundantGuards) {
    console.log(`  ${r.justified ? "✓" : "•"} redundant-guard ${r.file} "${r.test_name}" (${r.layer}, unique_kills=0) ${r.note}`);
  }
  console.log(`\nlayer-vitals: 未処理 obligation=${openObligations} / 全 ${records.length}  型が落とした mutant=${report.type_killed}`);
  console.log(`  → ${outPath}`);
  if (baseline) {
    const before = baseline.obligations_open ?? 0;
    console.log(
      openObligations > before
        ? `  ⚠ 未処理 obligation が baseline を超過: ${before} → ${openObligations}`
        : `  baseline 比: ${before} → ${openObligations} (悪化なし)`,
    );
  }
}

const exceeded = baseline && openObligations > (baseline.obligations_open ?? 0);
process.exit(flag("strict") && exceeded ? 1 : 0);
