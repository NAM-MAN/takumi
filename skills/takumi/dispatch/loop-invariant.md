# loop-invariant — Wave ループの不変条件 (毎 Wave 再アンカー、≤30行)

> [!IMPORTANT]
> executor が **各 Wave 境界で「次アクション判断の直前」に再読込**する compact 不変条件。`executor.md` 全体ではなく **これだけ**を再読込して再アンカーする (希釈に勝つための per-Wave re-injection)。本文は実装詳細を持たず**規則だけ** — 手順は `executor.md` (JIT) に逃がす。`SKILL.md` 冒頭は本 4 条を **各 1 行で再掲** (turn1 アンカー)、本ファイルが canonical single source。

## 1. 停止点は 3 つだけ — それ以外は黙って次 Wave へ <!-- RULE: stop-points-only T3:kernel-reanchor -->
<!-- scope:Wave境界の継続判断 / shall:1行報告で無人継続 / not:「続けますか?」と聞く / applicability:always / evidence:autonomy-decision.jsonl -->

Wave/task 完了で **ユーザーに「続けますか?」と聞いてはならない**。`autonomy.level` (既定 `autonomous`) に従い、進捗を **1 行報告して同一ターン内で次 Wave へ無人継続**する。手を止めてよいのは 3 つだけ: ①**G1 計画承認** (`autonomous` は軍師裁定で無人、`gated`/`manual` のみ人間) ②**G3 / human floor** — 不可逆操作 (`autonomy.md` §2 の 2 層判定) or 軍師 verdict が escalate/critical (各 side-effect 直前に risk 再評価、fail-closed) ③**G6 context 20% pause**。各 Wave 末は「Wave N/M 完了 → 次へ」の **非ブロッキング 1 行報告**に留める (報告 ≠ 質問)。

## 2. gate を満たすまで次へ進むな — 発火 gate を機械実行 <!-- RULE: gate-before-advance T3:kernel-reanchor -->
<!-- scope:Wave境界の前進判断 / shall:発火gateを機械実行しverdict全passで前進 / not:gate未起動/fail/uncertainのまま前進 / applicability:always / evidence:enforcement/registry.yaml -->

Wave を前進させる前に、その task に**発火する gate を機械実行**する: **T1** (script/hook) は exit≠0 なら前進不可、**T2** (isolated reviewer) は **verdict が pass 以外 (block/uncertain) なら前進不可** で §4 決裁ドシエへ。発火 rule の算出 (task frontmatter → `registry.yaml`) と T1 batch / T2 並列 spawn の手順は `executor.md` §3 (JIT)。gate は**進行条件**であって停止点ではない (停止点は §1 の 3 つのまま)。

## 3. orchestrator を痩せさせる (希釈の根治) <!-- RULE: thin-orchestrator T3:kernel-reanchor -->
<!-- scope:orchestrator文脈 / shall:重い実装/テスト/調査/reviewerをsubagentに隔離し要約/verdictだけ戻す / not:diff全文/testログ/rule本文を親に溜める / applicability:always / evidence:enforcement/README.md -->

棟梁 (orchestrator) は自分の文脈を薄く保つ。重い実装/テスト/調査、および §2 の T2 reviewer は **subagent に dispatch し、戻すのは要約/verdict だけ** (diff 全文・test ログ・**reviewer の rule 本文**を orchestrator 文脈に溜めない = 希釈に勝つ核)。**権威ある状態は会話履歴でなく外部** (plan の `- [ ]` と notepad `learnings.md`)。「未完」は残 `- [ ]` が決める (premature completion 防止)。subagent は fresh 文脈で動き最終要約だけ親に返る。

## 4. 停止は決裁ドシエを伴う — 裸の yes/no 禁止 <!-- RULE: decision-dossier-required T3:kernel-reanchor -->
<!-- scope:人間に手を止めて上げる全停止 / shall:検証済+推奨+confidence を添える(または blocked_reason+推奨不能理由+必要なもの) / not:検証も推奨もせず「いいか」だけ聞く / applicability:always / evidence:autonomy.md#決裁ドシエ -->

手を止めて人間に上げる時、必ず次のいずれかを添える (`autonomy.md#決裁ドシエ` が schema): **(検証済 + リスク + 推奨 + confidence + 選択肢)** — 自分で回した build/test/spec/軍師 verdict と結果を示し推奨で責任を取る、か **(blocked_reason ∈ {missing_capability, missing_input, missing_authority} + 推奨不能の理由 + 何があれば決められるか)**。**「検証も推奨も blocked_reason も書けない停止」= malformed = 責任逃れ**。書くものが無いなら止まるな — 検証して自分で決めろ。
