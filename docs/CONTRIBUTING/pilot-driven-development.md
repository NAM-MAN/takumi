# pilot-driven-development.md — 新規 skill / rule / prompt はパイロット駆動で採否を決める

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

新しい skill / mode / rule / prompt を takumi に追加する時、**思いつきで commit しない**。一度パイロットで実地測定し、結果が良ければ採用、悪ければ見送り、その**試行錯誤の痕跡を skill 側に残さない**。

---

## 原則

1. **hypothesis を測定で検証**: 「良さそう」で skill を変えない。改善仮説を立てて、本番 production code で検証する
2. **事前に評価基準**: 採用 / 見送りの閾値を**事前に決める**。後から都合よくねじ曲げない
3. **軍師レビュー 1 回**: 評価設計自体を gpt-5.4 等の別モデルに敵対的レビューさせ、selection bias / metric の gaming 余地 / false positive 論点を潰す
4. **別リポジトリで実行**: パイロットは takumi 自身ではなく、実 production project (アプリケーション repo) で行う
5. **skill 側には結論のみ反映**: 採用された仕様のみが skill に commit される。失敗例・中間試行・production code 変更は skill repo に入らない

---

## ワークフロー (5 段階)

### 1. 提案 (Hypothesis)

`.takumi/drafts/{proposal-name}.md` に以下を書く:

- **hypothesis**: 1 行で「X を足すと Y が改善する」
- **motivation**: なぜ改善すると思うか (根拠 / 先行研究 / 経験)
- **scoreable target**: 何を測れば採否が決まるか

### 2. 評価基準の設計 + 軍師レビュー

- **primary metric**: scoreable で gaming されにくいもの (例: mutation score、critical defect の seed 検出率 or per-trial average、false positive rate)。「recall」的な指標は既知 ground truth が無い実 PR 相手だと ill-defined になりやすいので、件数ベースの average か bounded rate (0-1) を使う
- **adoption threshold**: 採用となる条件 (例: `primary_metric(new) >= baseline * 1.15`)
- **rejection threshold**: 即中断する条件 (例: fp_rate が +25pt 超過)
- **中間判定**: 途中で止めるかを決める chekpoint
- **統計処理**: n が少ない場合 bootstrap CI / permutation test / Bayesian で点推定の偶然性を吸収

これを**軍師に 1 回だけ** 敵対的レビュー:

<!-- hardening v2 (2026-05-03): stdin heredoc / `timeout 600s` / 5.5 default。
  ファイル本文は呼出側で埋込み、codex に「読め」命令で hang trigger を引かない (詳細: `skills/takumi/executor.md`「invocation hardening v2」)。 -->
```bash
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
以下の proposal を敵対的にレビュー: metric の gaming 余地 / selection bias /
blinding 破綻 / n 不足での結論反転リスクを指摘。出力 1.5KB 以内。

## proposal 本文
$(cat .takumi/drafts/{proposal-name}.md)
EOF
timeout 600s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - < "$PROMPT_FILE" 2>&1 | tail -100
```

指摘を反映してから次段階へ。

### 3. パイロット実行 (別 repo で、本番 code を変更して)

- パイロット用 project (別 repo、壊しても良いもの) に checkout
- **本番 production code を実際に修正**する (seeded bug の注入、新 prompt の適用 etc.)
- 試行回数は n 不足で CI が広がりすぎない程度 (推奨: 各 arm 8-10 試行以上)
- telemetry jsonl に 1 試行 1 行 append

**重要**: パイロットで生じる production code の変更・seeded bug branch・集計 script・telemetry jsonl は**パイロット repo 側に留める**。takumi skill repo には絶対にコピーしない。

### 3-a. Smoke batch (full execution 前のパイプライン検証)

全 30-38 trial を本走らせる前に、**3-5 trial の smoke batch** でパイプライン動作確認:

- 各 arm 最低 1 trial ずつ選び、実 diff で reviewer を回す
- 出力 CSV の列数 / severity 表記 / normalize 成否を確認
- telemetry jsonl に 1 行書かれ、集計 script が動くことを確認
- **maintainer verdict は 0 のまま** で OK (smoke は pipeline 確認のみ、quality 測定は本走時)
- smoke で発見した不備 (正規化漏れ、keyword regex 誤検知等) は本走前に修正

Smoke batch の出力は telemetry に **"notes": "smoke"** マーカーを付け、最終集計で除外する (本走データと混ぜない)。

Smoke で見つかる典型的な不備:
- 対象 corpus の品質問題 (metadata-heavy commit が混入して review 対象にならない)
- reviewer prompt の ambiguity (arm 間の差分が出力に現れない)
- normalizer の列数ズレ
- token_cost / latency の計測方法が環境依存

### 4. 判定 (機械的に)

事前定義した閾値を適用:

- **採用**: adoption threshold をすべて満たす → skill に結論だけ反映
- **拡大**: CI 幅が広く判定不能 → corpus を拡大して再試行 (予算あれば)
- **見送り**: threshold を満たさない → `.takumi/drafts/{proposal-name}-result.md` に判定と理由を記録、skill は無変更

判定は **主観で覆さない**。数値が駄目なら駄目。

### 5. 痕跡の分離

| 置き場所 | 何を置く | `.gitignore` |
|---|---|---|
| takumi repo `skills/**` | 採用された仕様 (新 md / 更新された prompt / 新 rule のみ) | 公開配布 |
| takumi repo `docs/CONTRIBUTING/` | 採用ワークフローの一般知見のみ | 公開配布 (export-ignore) |
| takumi repo `.takumi/drafts/` | 提案・評価基準・軍師レビュー結果・判定記録 | ignored (dev 手元のみ) |
| パイロット repo `.takumi/drafts/` | runbook・assignment table・seeded bug 仕様・集計 script | ignored (dev 手元のみ) |
| パイロット repo production code | 実際のコード変更 (branch で隔離) | tracked (パイロット側 repo の git 上) |
| パイロット repo `.takumi/telemetry/` | jsonl 実測値 | ignored |

**production code の変更は takumi に逆流させない**。skill に「こう書くと良い」の一般原則だけが残る。

---

## なぜこの分離が重要か

1. **skill が小さく保たれる**: 配布物としての clean さを維持。git archive / tarball が軽い
2. **試行錯誤が skill を汚さない**: 失敗 prompt / 中間版 rule / 実験用 scaffold が残骸化しない
3. **採用判定が明確**: pilot 結果が「成功」と言えたもののみ skill に残る
4. **見送り案が無駄にならない**: `drafts/{proposal-name}-result.md` に理由が残り、後で再挑戦時の参考になる
5. **公開リポジトリの視認性**: 利用者 / 貢献者が skill を読んだ時、雑多な実験痕跡を見なくて済む

---

## 提案時のチェックリスト

- [ ] hypothesis が 1 行で書ける
- [ ] primary metric が scoreable (gaming 余地が小さい)
- [ ] adoption / rejection 閾値が数値で事前確定
- [ ] n 不足対策 (CI / bootstrap / permutation) が組み込まれている
- [ ] 軍師レビューを 1 回通している (指摘反映済)
- [ ] パイロット実行先 (どの repo / どの branch) が決まっている
- [ ] 判定後の反映先 (skill のどのファイルに何行追加) が具体化
- [ ] 見送り時の処理 (drafts に残す) が決まっている
- [ ] パイロット成果物 (pilot code / seeded bugs / telemetry / 集計 script) が skill repo に流入しない設計
- [ ] **blind / generalization metric の測定可能性** (alert 件数が CI 算出可能な水準に届く corpus 設計)
- [ ] **補助 arm (ensemble 候補) の貢献は gate metric に混入させず別トラックで記録する設計**

1 項目でも曖昧なら先に埋める。急いで始めない。

---

## Blind precision の測定可能性を必須前提にする

Pilot が seeded 母集団だけで precision を出すと、**既知バグへの適合度**しか測れない。採否の主戦場は **未知入力での一般化性能** (blind / transplanted corpus) であり、blind precision が統計的に測定可能な水準で alert を観測できる corpus 設計が無ければ、pilot pass 判定をさせない。

- blind precision の実効 n は **alert 件数** (trial 件数ではない)
- alert 件数が CI を妥当幅に収める下限 (目安: alert n >= 15) に達しないなら、採否は pass にせず **expand-corpus runbook に自動で送る**
- expand-corpus の発動条件に「**statistical unfeasibility** (blind alert n 不足で AC が判定不能)」を含める (従来の「CI 幅過大」に加える)

**なぜ**: seeded 有利の selection bias を敵対レビューで潰しても、blind 側の母数が不足していれば一般化性能は測れない。敵対レビュー後の実行設計でも blind の情報量が薄いと「fail が弱く、pass も言えない」曖昧な結果になる。

## 補助 arm の rescue 貢献を gate metric に混入させない

Pilot が「主 arm + 補助 arm」の複合を評価する場合、補助 arm の rescue 貢献 (主 arm miss を補助 arm が救った件数) は **別トラック**で記録し、主 arm の precision/recall gate には混入させない。

- 主 arm 単独で pass 判定、補助 arm は次 iteration の ensemble 候補材料
- ensemble (主 OR 補助) の評価は、別 AC を並走設定して二重評価
- 混入させると「主 arm の性能」か「ensemble の性能」かが曖昧化し、判定がぶれる

**なぜ**: ensemble 性能が良くても主 arm が弱いなら、主 arm の独立価値は証明されていない。採否判定の粒度を守るため、gate metric は「何を採否判定しているか」が一意に定まる必要がある。

---

## 例

- **pilot-max-review** (max 発動基準): 3 arm (xhigh / xhigh+max on critical keyword / all max) で critical defect の per-trial average と seed 検出率を bootstrap CI で測定。結果は `review-process.md` に「選択的発動 policy」として反映済 (ヒューリスティックと明示、次回 pilot で個別 trigger の有効性検証予定)
- **gepa-comparison** (GEPA 部分採用): GEPA-lite を tier-a.txt に限定して 3 世代進化、mutation score で採否判定

どちらも `.takumi/drafts/` 配下 (gitignored、開発者ローカルのみ) に原案を置き、判定結果だけが skill に反映される設計。公開ファイルからは具体名で参照せず、運用フローの一般説明のみ行う。

---

## アンチパターン (やらない)

- **思いつきで prompt を書き換える**: 評価無しで「良くなった気がする」で commit すると、次の誰かが悪化を観測して revert するループに
- **パイロット成果物を skill に cp**: skill が雑多に膨らむ、利用者に不要な情報を配る
- **閾値を後出しで緩める**: 「ギリギリ届かなかったから基準を下げよう」は禁止。数値が駄目なら見送り
- **軍師レビュー省略**: 自己評価だけでは selection bias / metric gaming に気付けない
- **パイロット project を takumi 本体に統合**: 別 repo 原則を維持、相互独立に保つ

---

## 関連

- [`skill-contract.md`](skill-contract.md) — skill 編集の互換性ルール (採用時の反映ガイド)
- [`workflow.md`](workflow.md) — commit / release
- [`review-process.md`](review-process.md) — レビュー運用 (パイロット結果の skill 反映時にも適用)
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針

---

## Appendix: UI 品質 pilot 固有の禁止事項と運用ルール (scope 限定)

> [!IMPORTANT]
> **本節は UI 品質測定を目的とする pilot に固有の運用ルール**です。他の pilot (mutation / test strategy / documentation quality / prompt 改善 等) には適用しません。
>
> 本 appendix に加え、本 doc 上部の「Blind precision の測定可能性を必須前提にする」「補助 arm の rescue 貢献を gate metric に混入させない」節も **UI 品質 pilot から抽出された知見を一般化した 2 節** です。一般 pilot に適用する際は、当該 pilot の proxy 構造が UI 品質 pilot と類似するか (human proxy 依存 / source-level blinding 困難 等) を確認してから適用してください。
>
> 経緯: 前 pilot iteration 1 は REJECT、続く UI prevention pilot iteration 1 は pilot 実行前の軍師 review で plan + draft が連続 RED、計 41 指摘 (16 cluster) を得て RETREAT 判断に至りました。本 appendix はその cluster 化された指摘から、**UI 品質 pilot を再起動する際に一般 pilot フロー (上記本節) に追加で適用すべき制約**を抽出したものです。

以下 10 項目は UI 品質 pilot のみに適用。一般 pilot の barrier として読まない。

### 1. source-level blinding は不可能 (CL-02)

HTML / TSX / class 構造 / import 順 / SVG 内部 / font hinting から arm 推定が残る。judge に渡す入力は **canonical screenshot + 正規化 a11y tree + task spec** のみ、HTML 源泉は原則不使用。
どうしても DOM が必要な場合は、コメント削除 / 属性 allowlist / class 名 hash (pilot_salt 付き) / import 正規化 / formatter 統一 / ソースマップ除去を通した canonical artifact のみ使う。

### 2. order effect 交絡の禁止 (CL-09)

同一 task を連続 arm で実行しない。各 `task × arm` を **fresh session + fresh worktree + fresh output dir** で実行し、**arm 実行順を task ごとに無作為化** して run manifest に記録。文脈学習 / ローカル cache / ファイル残骸 / task 理解の蓄積が後続 arm に漏れると arm 効果と run-order 効果が完全交絡する。

### 3. AI prior 漏洩の明示 (CL-05)

仮説は **"incremental prevention uplift"** に限定。"無追加ガード vs 追加ガード" の比較は成立しない (AI 事前学習の prior が常時漏れるため)。baseline arm も既存 priors の上に乗る増分 policy 比較とみなす。

### 4. sentinel oracle の自作バイアス回避 (CL-04)

軍師 single-point 制作の sentinel を proxy 能力の SoT にしない。**外部実 defect と軍師作成の二重化**、二次 calibrator 承認。sentinel は gate の一部に格下げ、単独で proxy 能力の判定に使わない。

### 5. audit oracle drift の防御 (CL-07)

軍師 single-point audit 禁止。hidden duplicate で self-consistency + 20-30% を二次監査者に回す。audit 順序は完全ランダム化し、時系列 drift を監視。軍師-第二監査者 agreement が閾値未達ならその期間の audit を invalid にする。

### 6. 撤退検討基準 (UI 品質 pilot 固有)

軍師 review で **RED verdict が 2 連続** (plan review + draft review、または 2 iteration) 出たら、pilot 実行前に **skill 直接反映への切替を検討**。指摘の雪だるま化は設計 over-engineering の signal。この rule は UI 品質 pilot のみ、一般 pilot には昇格しない (探索より萎縮が勝つため)。

### 7. 3-family judge + agreement 複合閾値 (CL-04)

cross-family judge (例: Claude + GPT + Gemini) を hard gate に。**family 不足時は pilot 延期**、2-family fallback 禁止。agreement 指標は Fleiss kappa 単独でなく **Gwet AC1 + Krippendorff alpha 併記** + cross-family pairwise agreement 下限を併用。

### 8. 絶対床 metric (CL-01)

相対差 (delta 閾値) だけで採否判定しない。**baseline 自体の capture floor** と **sentinel detection floor** を絶対床として併記。proxy 全体が緩んで相対差だけ通過する gaming を防ぐ。

### 9. seeded defect 割付と統計手法 (CL-03 / CL-10 / CL-11)

- seeded は **random 注入比率でなく各 arm 固定件数**。alert n が CI を妥当幅に収める下限 (目安 alert n>=15) に達する件数を確保。
- 割付は軍師 single-point hold でなく **commit-reveal** または 2 名承認で封印。軍師は key のみ、具体割付は監査時まで blind。
- 主解析は per-task paired delta の permutation (task block 内 arm swap のみ、run 単位シャッフル禁止)、GLM は **task cluster-robust SE** 必須。McNemar は defect count 指標に使わない (binary 化するなら事前固定)。
- D-applicable subset は pilot 開始前に manifest freeze、分析時の subsetting 自由度ゼロ。
- **corpus contamination 対策 (CL-11)**: real PR corpus は実装 AI / 評価 AI 双方への手法有利化バイアスを含む。pilot は **seeded-only または blind-transplant (commit-reveal で別 session 制作)** を推奨、real PR 直接採用を避ける。expand-corpus 発動時も予備 corpus を事前 RNG 封印して上から固定順で追加、選定自由度ゼロに。

### 10. Wave 順序と resume-safe execution (CL-06 / CL-12 / CL-13 / CL-16)

CL-06 の 3 独立論点を明示的に守る:

- **(a) Wave ordering**: 評価系 (judge prompt / sentinel / seeded assignment) の freeze は **draft 軍師 review 通過後のみ**。Wave 0 と Wave 1 は並走禁止。
- **(b) session resume プロトコル**: `run_id / git_sha / prompt_sha / judge_sha / seed_sha / status` を各 run に記録、`done` 再実行禁止、`running` の timeout 回収、stale prompt 検出時 abort。
- **(c) concurrency-safe manifest**: 複数 process 並走時は JSONL flock + rename ではなく **SQLite WAL または immutable per-run file + reducer 後段集計** に切替 (NFS / OS race 回避)。
- **CL-12 / 13 (arm coverage / preflight 化)**: arm-D 系 invariant (grid / overflow / hit area / focus / spacing) は detection arm でなく **implementation preflight checklist** に統合、動的 UI 補助は別 arm として扱う。
- **CL-16 (adjudication feasibility)**: iteration 1 で Cohen kappa が **alert n 不足で structurally unsatisfiable** に陥った failure mode を踏まえ、**pilot 開始 entry criteria に "adjudication feasibility 事前確認"** (blind 母集団で必要 alert 件数が見込めるか、dual-labeler capacity が確保できるか) を追加。

### 11. launch 前 power analysis の必須化 (v3 起動 entry criteria)

UI 品質 pilot を再起動する際、**pilot 開始前に以下を別 audit で確認**することを entry criteria に加える:

- **Monte Carlo power analysis**: 想定する task 数 × arm × judge × seeded の設計で、目標 marginal uplift effect size を妥当な p 値 / Cohen's d で識別可能か simulation
- **閾値の smoke 後再固定**: smoke batch での baseline prevalence 観察後に primary / absolute-floor 閾値を事前再固定 (smoke 結果を見て緩めるのではなく、事前 power analysis の解像度で再設定)
- **観測系の装備レベル再評価**: 3-family / WAL manifest / commit-reveal / sentinel 二重化 / hidden duplicate / 二次監査は `marginal uplift` のような小さい effect size の pilot では観測系装備が過剰になりうる。何を残し何を外すかは起動 plan で取捨選択、全部載せが常に正解ではない
- **skill 起点の効果量再定義**: 効果量を skill 反映で取れた部分と追加 arm で取る残差 uplift に分解、期待値を skill 反映 evaluation から逆算

power 未確認のまま起動しないこと。軍師 audit がこれを確認する。

### 運用メモ

- 本 appendix は `.takumi/drafts/reflection-map.csv` (16 cluster) に論拠を対応付けて保持
- 追加規則は機械 grep で発見可能 (`## Appendix: UI 品質 pilot` 節タイトル)
- 他 pilot で本 appendix を誤適用したい誘惑が出たら、まず本節冒頭の IMPORTANT box を再読する
