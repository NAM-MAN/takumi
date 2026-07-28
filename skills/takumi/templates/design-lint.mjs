#!/usr/bin/env node
// design-lint — design mode が「lint でやる」と宣言済みの規則の実体。
//
// 根拠: l7-invariant.md §lint 「機械的に検出可能 (ast で判定できる) → lint。ビルド時に即失敗」、
//       layout-primitives.md §5 「機械的に AST/class で検出可能。build 時に即失敗」、
//       craft-layer.md §5 AI-slop blocklist (soft = warn、hard 昇格は 4 週 warning 10%+ かつ人間合意)。
//
// 実装した rule (16):
//   [hard] L1 color_token_only        hex / rgb() リテラル (token 定義ファイル外)
//   [hard] L2 typography_token_only   生 font-size
//   [hard] L3 no_inline_style         style={{ }} (dynamic theme を除く)
//   [hard] L4 no_arbitrary_tailwind   w-[13px] 等 layout の arbitrary 値
//   [hard] L5 radius_on_scale         生 border-radius
//   [hard] L6 no_raw_positioning      position:absolute/fixed (escape hatch 宣言外)
//   [soft] L7 no_layout_margin        レイアウト目的の margin (gap/Stack に置換)
//   [hard] L8 no_bare_1fr             grid の裸 1fr (minmax(0,1fr) 必須)
//   [hard] L9 require_min_w_0         flex 子の min-width:0 欠落
//   [hard] L10 style_pass_layout_leak skin pass に layout utility 混入 (`style-pass: skin` 宣言時のみ)
//   [hard] J1 jp_line_height_unitless line-height を % / px で書いている (unitless 必須)
//   [hard] J2 jp_measure_em           和文 measure に ch を使用 (38em 相当を em で)
//   [soft] J3 jp_palt_with_tracking   見出しの letter-spacing に palt 併用が無い
//   [soft] S1 no_default_ai_font      Inter/Roboto/Arial/system-ui を本文 brand font に
//   [soft] S2 no_single_box_shadow    box-shadow が 1 層
//   [soft] S3 pure_gray_without_intent 無彩色 (hex 等輝度 / hsl 0% / oklch chroma 0)
//
// **実装しない rule** (機械判定不能、craft-layer.md §6 が「gate にすべきでない」と明示):
//   accent_overuse / no_purple_on_white_cliche / no_centered_stack_template /
//   dark_not_redesigned / unjustified_component_count / 総合 taste。
//   これらは「正当化されない増殖か」「文脈で妥当か」の判断を含むため T2 reviewer or 人間に残す。
//
// 依存: Node 標準のみ (postcss を入れない。className 文字列と CSS を正規表現で走査する近似)。
// 使い方: cd <project> && node path/to/design-lint.mjs src
//   --config <f.json>  { "tokenFiles": ["src/styles/**"], "ignore": ["legacy/**"] }
//   --json             機械可読出力
//   --strict           hard finding があれば exit 1 (既定は常に exit 0)
//
// 例外指定: 対象行/直前行に `design-lint-allow <rule>: 理由`。
//   L6 は `escape_owner:` 宣言 (layout-primitives.md §6) でも解除される。

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const optValue = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : null;
};
const VALUE_FLAGS = new Set(["--config", "--ts"]);
const roots = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));
const targets = roots.length ? roots : ["src"];
const asJson = flag("json");
const strict = flag("strict");

const config = (() => {
  const p = optValue("config");
  if (!p) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (error) {
    console.error(`design-lint: config を読めません (${p}): ${error.message}`);
    process.exit(2);
  }
})();

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

// token 定義ファイルでは hex / 生 font-size / shadow 定義が正当 (FP の主因なので既定で広めに除外)
const DEFAULT_TOKEN_FILES = [
  "**/tokens*.*", "**/theme*.*", "**/globals.css", "**/global.css", "**/*.tokens.*",
  "tailwind.config.*", "**/design-system/**", "**/styles/base/**",
];
const tokenFileRes = [...(config.tokenFiles ?? []), ...DEFAULT_TOKEN_FILES].map(globToRe);
const ignoreRes = (config.ignore ?? []).map(globToRe);

const SCAN_EXT = /\.(tsx?|jsx?|css|scss|less)$/;
const findings = [];

const walk = (p) => {
  let st;
  try {
    st = statSync(p);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.next|\.git|dist|build|coverage)$/.test(p)) return;
    for (const e of readdirSync(p)) walk(join(p, e));
    return;
  }
  if (!SCAN_EXT.test(p) || ignoreRes.some((re) => re.test(p))) return;
  scan(p);
};

// --- rule 定義 ---
// each: { id, sev, kind: "css"|"class"|"line", test(line, ctx) -> message|null }
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB_FN = /\b(rgba?|hsla?)\(/;
const LAYOUT_UTILS = /\b(absolute|fixed|inset-|w-screen|h-screen|flex|grid|w-\d|h-\d|min-h-|max-w-|overflow-|gap-|basis-|shrink|grow|col-span-|row-span-|p-\d|m-\d)/;
const ARBITRARY_LAYOUT = /\b(w|h|min-w|max-w|min-h|max-h|p|m|mt|mb|ml|mr|px|py|gap|top|left|right|bottom|inset|basis)-\[[^\]]+\]/;
const AI_FONTS = /font-family\s*:\s*[^;]*\b(Inter|Roboto|Arial|system-ui|-apple-system)\b/i;
const LAYOUT_MARGIN = /\bm[trblxy]?-\d|\bmargin(-(top|bottom|left|right|inline|block))?\s*:\s*(?!auto)/;

const isTokenFile = (file) => tokenFileRes.some((re) => re.test(file));

const scan = (file) => {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const isStyleSheet = /\.(css|scss|less)$/.test(file);
  const skinPass = /style-pass:\s*skin/.test(text);
  const escapeOwner = /escape_owner\s*:/.test(text);
  const tokenFile = isTokenFile(file);

  const allowed = (i, rule) => {
    const around = `${lines[i] ?? ""}\n${lines[i - 1] ?? ""}`;
    return new RegExp(`design-lint-allow\\s+${rule}\\b`).test(around);
  };
  const push = (i, id, sev, msg) => {
    if (allowed(i, id)) return;
    findings.push({ file, line: i + 1, rule: id, sev, msg, code: (lines[i] ?? "").trim().slice(0, 100) });
  };

  // 宣言値は行をまたぐ (複数行 box-shadow 等)。`:` の後から `;` までを最大 6 行で結合して取る。
  const declValue = (i) => {
    const joined = lines.slice(i, i + 6).join(" ");
    const afterColon = joined.slice(joined.indexOf(":") + 1);
    const end = afterColon.indexOf(";");
    return (end >= 0 ? afterColon.slice(0, end) : afterColon).trim();
  };
  // 括弧の外にあるカンマだけを数える (rgba(0,0,0,.1) の内部カンマを層区切りと誤認しない)
  const topLevelCommas = (value) =>
    [...value].reduce((acc, ch) => {
      if (ch === "(") return { ...acc, depth: acc.depth + 1 };
      if (ch === ")") return { ...acc, depth: acc.depth - 1 };
      return ch === "," && acc.depth === 0 ? { ...acc, n: acc.n + 1 } : acc;
    }, { depth: 0, n: 0 }).n;
  // token 参照 (var(--x) / theme()) は正しい書き方なので raw literal だけを対象にする
  const isRawLength = (value) => /(^|\s)-?[\d.]+(px|rem|em|%|pt|vh|vw)\b/.test(value) && !/var\(|theme\(/.test(value);

  lines.forEach((line, i) => {
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(line);
    if (isComment) return;

    // L1 color_token_only
    if (!tokenFile && (HEX.test(line) || RGB_FN.test(line))) {
      const inClassOrStyle = isStyleSheet || /className|style=|css`|styled\./.test(line);
      if (inClassOrStyle) push(i, "L1", "high", "色を hex / rgb() リテラルで直書きしている。CSS var / token のみ使う");
    }
    // L2 typography_token_only
    if (!tokenFile && /font-size\s*:/.test(line) && isRawLength(declValue(i))) {
      push(i, "L2", "high", "生 font-size を指定している。type scale token (text-* utility) を使う");
    }
    // L3 no_inline_style
    if (/style=\{\{/.test(line)) {
      push(i, "L3", "high", "style={{ }} のインライン指定。dynamic theme 以外は禁止 (token / class に寄せる)");
    }
    // L4 no_arbitrary_tailwind
    if (ARBITRARY_LAYOUT.test(line)) {
      push(i, "L4", "high", "layout の arbitrary 値 (w-[13px] 等)。scale 上の token を使う");
    }
    // L5 radius_on_scale
    if (!tokenFile && /border-radius\s*:/.test(line) && isRawLength(declValue(i))) {
      push(i, "L5", "high", "生 border-radius。radius token (4/6/8/12/16/24/full) を使う");
    }
    // L6 no_raw_positioning
    if (/position\s*:\s*(absolute|fixed)/.test(line) || /\b(absolute|fixed)\b/.test(line) && /className/.test(line)) {
      if (!escapeOwner) {
        push(i, "L6", "high", "position:absolute/fixed を escape hatch 宣言なしで使用。primitive の nest 合成に寄せるか escape_owner を宣言する");
      }
    }
    // L7 no_layout_margin (soft)
    if (LAYOUT_MARGIN.test(line) && /className|^\s*margin/.test(line)) {
      push(i, "L7", "low", "レイアウト目的の margin。Stack/Cluster の gap に置換する (近似検出)");
    }
    // L8 no_bare_1fr
    if (/(grid-template-columns|grid-cols-\[)/.test(line) && /\b1fr\b/.test(line) && !/minmax\(\s*0/.test(line)) {
      push(i, "L8", "high", "grid の裸 1fr。内容最小幅で破裂するため minmax(0, 1fr) にする");
    }
    // L9 require_min_w_0
    // className が複数行に分かれる (clsx / テンプレート整形) 場合に FP を出さないよう、
    // 前後を含む窓で min-w-0 の有無を見る。
    const classWindow = lines.slice(Math.max(0, i - 1), i + 4).join(" ");
    if (/className/.test(line) && /\bflex-(1|auto)\b/.test(classWindow) && !/\bmin-w-0\b/.test(classWindow)) {
      push(i, "L9", "high", "flex 子に min-width:0 が無い。min-width:auto 既定で長文/表が親を押し広げる");
    }
    // L10 style_pass_layout_leak (skin 宣言があるファイルのみ)
    if (skinPass && /className/.test(line) && LAYOUT_UTILS.test(line)) {
      push(i, "L10", "high", "skin pass に layout utility が混入している (Phase A の primitive 専有を侵している)");
    }
    // J1 jp_line_height_unitless
    if (/line-height\s*:\s*[\d.]+(%|px|rem|em)(?![\w-])/.test(line)) {
      push(i, "J1", "high", "line-height は unitless で書く (1.5 / 1.75)。% や px は子孫に比例継承しない");
    }
    // J2 jp_measure_em
    if (/max-width\s*:\s*[\d.]+ch\b/.test(line) || /\bmax-w-\[\d.]*ch\]/.test(line) || /\bmax-w-prose\b/.test(line)) {
      push(i, "J2", "high", "和文 measure に ch / max-w-prose を使用。ch は 0 glyph 基準で CJK に不安定、38em 相当を em で指定する");
    }
    // J3 jp_palt_with_tracking (soft)
    if (/letter-spacing\s*:/.test(line) && !/font-feature-settings/.test(text)) {
      push(i, "J3", "low", "letter-spacing を使っているが palt 併用が無い (和文見出しは palt + 小 positive tracking で refined になる)");
    }
    // S1 no_default_ai_font (soft)
    if (AI_FONTS.test(line)) {
      push(i, "S1", "low", "既定 font (Inter/Roboto/Arial/system-ui) を brand font にしている。distinctive な選択を検討 (技術系の意図採用は allow で明示)");
    }
    // S2 no_single_box_shadow (soft)
    if (/box-shadow\s*:/.test(line) && topLevelCommas(declValue(i)) === 0 && !/none/.test(declValue(i))) {
      push(i, "S2", "low", "box-shadow が 1 層。多層 elevation (ambient + key) にする");
    }
    // S3 pure_gray_without_intent (soft)
    const grayHex = /#([0-9a-fA-F]{2})\1\1\b/.test(line);
    const grayHsl = /hsl\([^)]*,\s*0%\s*,/.test(line) || /hsl\(\s*0\s+0%/.test(line);
    const grayOklch = /oklch\(\s*[\d.]+\s+0\s+/.test(line);
    if (grayHex || grayHsl || grayOklch) {
      push(i, "S3", "low", "無彩色 (pure gray) を直接使用。neutral に微量 hue を混ぜる (禁止ではなく温度/階層の意図を確認)");
    }
  });
};

for (const t of targets) walk(t);

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
const hard = findings.filter((f) => f.sev === "high");

if (asJson) {
  console.log(JSON.stringify({ findings, hard: hard.length }, null, 2));
} else {
  for (const f of findings) console.log(`${f.file}:${f.line}: [${f.rule}/${f.sev}] ${f.msg}\n    > ${f.code}`);
  const byRule = findings.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] ?? 0) + 1 }), {});
  console.log(`\ndesign-lint: ${findings.length} findings (hard=${hard.length}) ${JSON.stringify(byRule)}`);
}

process.exit(strict && hard.length ? 1 : 0);
