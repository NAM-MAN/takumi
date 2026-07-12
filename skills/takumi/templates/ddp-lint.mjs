#!/usr/bin/env node
// ddp-lint — DDP (data-access-protocol.md) の機械検査。executor gate J の hard 検査実体。
//
// 検出 (decidable、棟梁 LLM 目視を機械化):
//   R1 silent-catch-on-mutation : mutation の catch{} が握り潰し (通知/再同期/再throw なし) → 失敗時UX欠落 (D1)
//   R2 stringify-cache-key       : JSON.stringify(object) を queryKey/cacheKey に (D5)
//   R3 ddp-d2-list-invalidation  : list-affecting (insert/remove/reorder) mutation に list invalidation/更新が
//                                  同一 file 中に一つも無い (D2、registry safety: data_loss)
//   R4 ddp-connection-invalidation: connection (edges+pageInfo) を直接書換える cache 更新なのに invalidation が
//                                  同一 file 中に一つも無い (D8-connection、registry safety: data_loss)
//
// 設計方針: 誤検出 (FP) を最優先で抑える。確信の持てない箇所は flag せず severity を下げる。
//   URLSearchParams.toString() は安全な key 化 → 検出しない (R2 は JSON.stringify object のみ)。
//   R3/R4 は ADOPT-narrow: 「粒度が正しいか」(entity tag のみ vs entity+list tag) は tag 命名規約が
//   contract 側にしか無く静的判定不能なので対象外。検出するのは「invalidation/更新が file 内に皆無」の
//   ゼロ件ケースのみ (D1 の「空 catch」と同じ確信度モデル)。scope は関数単位でなく **file 単位**
//   (mutationFn と onSettled/invalidate が別関数に分かれる TanStack Query の一般形で FP を避けるため、
//   仕様の「同一 file/module」に合わせた)。
//
// 依存: typescript のみ (TS プロジェクトには必ずある = zero-extra-dep)。
// 使い方: cd <project> && node path/to/ddp-lint.mjs src   (dir/file を可変長で、既定 src)
//   exit 1 = hard finding あり (gate J fail) / 0 = clean。--advisory で常に exit 0。

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// typescript は「検査対象プロジェクトの node_modules」から動的解決 (script はどこに置いても可搬)
const projRequire = createRequire(join(process.cwd(), "package.json"));
let ts;
try {
  ts = (await import(pathToFileURL(projRequire.resolve("typescript")).href)).default;
} catch {
  console.error("ddp-lint: typescript が見つかりません。検査対象プロジェクト直下で実行してください (cwd に typescript 依存が必要)");
  process.exit(2);
}

const args = process.argv.slice(2);
const advisory = args.includes("--advisory");
const roots = args.filter((a) => !a.startsWith("--"));
const targets = roots.length ? roots : ["src"];

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// catch 内にこれらの呼出/文があれば「recovery あり」= 握り潰しでない
const RECOVERY = /toast|notif|error|throw|refresh|refetch|reload|invalidate|revalidate|mutate|router|setError|setStatus|console\./i;
const KEY_NAME = /(^|[._])(query|mutation|cache)?key$/i;

// --- R3 (D2 list-invalidation) の signature ---
// list membership/順序/件数を変える意味の動詞で始まる関数名 (前方一致)
const LIST_VERBS = /^(create|add|insert|append|delete|remove|destroy|archive|reorder|move|duplicate)/i;
// 「書込み」呼出: db 系 create/delete/remove/destroy/insert/reorder/move メソッド呼出、または POST/PUT/PATCH/DELETE fetch
const WRITE_CALL = /\.(create|delete|remove|destroy|insert|reorder|move)\(|method:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i;
// list invalidation の充足シグナル (invalidation そのもの、または list cache への直接更新)
const LIST_SATISFY = /revalidateTag|revalidatePath|invalidateQueries|onSettled|refetch\(|setQueryData\(/i;

// --- R4 (D8-connection connection-invalidation) の signature ---
// connection shape: edges を持ち、かつ pageInfo/hasNextPage/cursor のいずれかも持つオブジェクトリテラル
// (edges 単体は普通の配列 field と区別できないため pageInfo 系との併存を要求し FP を抑える)
const CONNECTION_KEYS = new Set(["pageInfo", "hasNextPage", "cursor"]);
// connection を書換える cache API 呼出 (setQueryData/writeQuery/writeFragment/cache.modify)
const CACHE_WRITE_CALLEE = /(^|\.)(setQueryData|writeQuery|writeFragment)$|^cache\.modify$/;
// connection invalidation の充足シグナル (setQueryData は書込みそのものなので除外、明示的 invalidate のみ)
const CONNECTION_SATISFY = /revalidateTag|revalidatePath|invalidateQueries|onSettled|refetch\(/i;

/** @type {{file:string,line:number,rule:string,sev:string,msg:string,code:string}[]} */
const findings = [];

function walk(p) {
  let st;
  try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) {
    if (/(^|\/)(node_modules|\.next|\.git|dist|build|coverage)$/.test(p)) return;
    for (const e of readdirSync(p)) walk(join(p, e));
  } else if (/\.tsx?$/.test(extname(p) ? p : "")) {
    scanFile(p);
  }
}

// R3/R4 の file 単位 satisfy 判定はコメントを含む生 text を対象にしないよう剥がす
// (剥がさないと「revalidateTag が無い」と書いた TODO コメント自体が満たしてしまう false negative になる)
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  if (/ddp-lint-disable\b/.test(text.slice(0, 500))) return; // file 先頭で全体抑制
  const codeText = stripComments(text); // R3/R4 の file-level satisfy 判定専用 (コメント除去済)
  const lines = text.split("\n");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart()).line; // 0-based
  const loc = (node) => lineOf(node) + 1;
  const snippet = (node) => node.getText(sf).split("\n")[0].slice(0, 80);
  // 明示的例外: 当該行/直前行/対象ノード本文に `ddp-lint-ignore` (理由必須、レビュー可能な opt-out)
  const ignored = (node, bodyText = "") => {
    const ln = lineOf(node);
    const around = (lines[ln] || "") + (lines[ln - 1] || "") + bodyText;
    return /ddp-lint-ignore/.test(around);
  };

  const visit = (node) => {
    if (ts.isTryStatement(node)) checkTry(node, loc, snippet, file, ignored);
    if (ts.isCallExpression(node) && node.expression.getText(sf) === "JSON.stringify") checkKey(node, sf, loc, snippet, file, ignored);
    const namedFn = getNamedFunction(node);
    if (namedFn) checkListInvalidation(namedFn.fn, namedFn.name, codeText, loc, snippet, file, ignored);
    if (ts.isObjectLiteralExpression(node)) checkConnectionInvalidation(node, codeText, loc, snippet, file, ignored);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// --- R1: silent-catch-on-mutation ---
function checkTry(tryStmt, loc, snippet, file, ignored) {
  if (!tryStmt.catchClause) return;
  const mut = tryBlockHasMutation(tryStmt.tryBlock);
  if (!mut) return; // read-only try は対象外 (FP 回避)

  const cc = tryStmt.catchClause.block;
  const bodyText = cc.getText();
  if (ignored(tryStmt.catchClause, bodyText)) return; // 明示 opt-out (理由付きレビュー済)
  const stmtCount = cc.statements.length;
  if (stmtCount === 0) {
    findings.push({ file, line: loc(cc), rule: "R1", sev: "high",
      msg: "mutation の catch が空 (握り潰し)。失敗時 UX (通知+再同期) を追加", code: snippet(mut) });
  } else if (!RECOVERY.test(bodyText)) {
    findings.push({ file, line: loc(cc), rule: "R1", sev: "mid",
      msg: "mutation の catch に通知/再同期/再throw が見当たらない (silent の疑い)", code: snippet(mut) });
  }
}

function tryBlockHasMutation(block) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const opts = n.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        for (const pr of opts.properties) {
          if (ts.isPropertyAssignment(pr) && pr.name.getText() === "method") {
            const v = pr.initializer.getText().replace(/['"`]/g, "").toUpperCase();
            if (MUTATION_METHODS.has(v)) { found = n; return; }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(block);
  return found;
}

// --- R2: JSON.stringify(object) as cache key ---
function checkKey(call, sf, loc, snippet, file, ignored) {
  const arg = call.arguments[0];
  if (!arg) return;
  if (ignored(call)) return;
  // 文字列/URLSearchParams など primitive 化は対象外。object/array/identifier(=おそらく object) のみ
  const argIsObjectish = ts.isObjectLiteralExpression(arg) || ts.isArrayLiteralExpression(arg) || ts.isIdentifier(arg);
  if (!argIsObjectish) return;
  // key 文脈か: 親が queryKey/mutationKey 配列要素 or *key への代入/プロパティ
  if (inKeyContext(call)) {
    findings.push({ file, line: loc(call), rule: "R2", sev: "high",
      msg: "JSON.stringify(object) を cache key に使用。canonical な structured key に置換 (順序非保証で衝突/stale)", code: snippet(call) });
  }
}

function inKeyContext(node) {
  let p = node.parent;
  for (let i = 0; p && i < 5; i++, p = p.parent) {
    if (ts.isPropertyAssignment(p) && KEY_NAME.test(p.name.getText())) return true;
    if (ts.isVariableDeclaration(p) && p.name && KEY_NAME.test(p.name.getText())) return true;
    // queryKey: [ ..., JSON.stringify(x) ] の配列要素
    if (ts.isArrayLiteralExpression(p) && p.parent && ts.isPropertyAssignment(p.parent) && KEY_NAME.test(p.parent.name.getText())) return true;
  }
  return false;
}

// --- R3: D2 list-invalidation ---
// 対象: `function name(...) {}` 宣言、または `const name = (...) => {}` / `const name = function (...) {}`
// 検査対象外: 上記以外の形 (object method 省略記法・default export の無名関数など) は名前が取れないため対象外。
function getNamedFunction(node) {
  if (ts.isFunctionDeclaration(node) && node.name) return { name: node.name.getText(), fn: node };
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return { name: node.name.getText(), fn: node.initializer };
  }
  return null;
}

function checkListInvalidation(fn, name, codeText, loc, snippet, file, ignored) {
  if (!LIST_VERBS.test(name)) return; // list-affecting 命名でなければ対象外 (rename 等は D2 の対象外)
  const body = fn.body;
  if (!body) return;
  const bodyText = stripComments(body.getText());
  if (!WRITE_CALL.test(bodyText)) return; // 書込み呼出が無ければ対象外 (読み取り専用関数の FP 回避)
  if (ignored(fn, bodyText)) return;
  if (!LIST_SATISFY.test(codeText)) {
    findings.push({ file, line: loc(fn), rule: "R3", sev: "high",
      msg: `list-affecting mutation "${name}" に list invalidation/更新 (revalidateTag/revalidatePath/invalidateQueries/setQueryData 等) が file 内に見当たらない (D2: list membership/順序/件数が腐る)`,
      code: snippet(fn) });
  }
}

// --- R4: D8-connection connection-invalidation ---
function isConnectionShape(obj) {
  let hasEdges = false, hasPageInfoLike = false;
  for (const p of obj.properties) {
    const n = p.name && p.name.getText();
    if (!n) continue;
    if (n === "edges") hasEdges = true;
    if (CONNECTION_KEYS.has(n)) hasPageInfoLike = true;
  }
  return hasEdges && hasPageInfoLike;
}

function findEnclosingCacheWriteCall(node, maxUp = 8) {
  let p = node.parent;
  for (let i = 0; p && i < maxUp; i++, p = p.parent) {
    if (ts.isCallExpression(p) && CACHE_WRITE_CALLEE.test(p.expression.getText())) return p;
  }
  return null;
}

function checkConnectionInvalidation(obj, codeText, loc, snippet, file, ignored) {
  if (!isConnectionShape(obj)) return; // edges + pageInfo系 の併存が無ければ対象外 (普通の配列との誤検出回避)
  const writeCall = findEnclosingCacheWriteCall(obj);
  if (!writeCall) return; // cache 書込み呼出の内側でなければ対象外 (読み取りのみの connection は対象外)
  if (ignored(writeCall)) return;
  if (!CONNECTION_SATISFY.test(codeText)) {
    findings.push({ file, line: loc(writeCall), rule: "R4", sev: "high",
      msg: "connection (edges+pageInfo/hasNextPage/cursor) を直接書換える cache 更新に invalidation (invalidateQueries/revalidateTag/onSettled/refetch 等) が file 内に見当たらない (D8-connection: 一覧順/件数/cursor が腐る)",
      code: snippet(writeCall) });
  }
}

// --- run ---
for (const t of targets) walk(t);

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const hard = findings.filter((f) => f.sev === "high");
for (const f of findings) {
  console.log(`${f.file}:${f.line}: [${f.rule}/${f.sev}] ${f.msg}\n    > ${f.code}`);
}
const byRule = findings.reduce((m, f) => ((m[f.rule] = (m[f.rule] || 0) + 1), m), {});
console.log(`\nddp-lint: ${findings.length} findings (high=${hard.length}) ${JSON.stringify(byRule)}`);
process.exit(advisory ? 0 : hard.length ? 1 : 0);
