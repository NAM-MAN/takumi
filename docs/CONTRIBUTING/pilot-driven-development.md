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

- **primary metric**: scoreable で gaming されにくいもの (例: mutation score、critical defect recall、false positive rate)
- **adoption threshold**: 採用となる条件 (例: `primary_metric(new) >= baseline * 1.15`)
- **rejection threshold**: 即中断する条件 (例: fp_rate が +25pt 超過)
- **中間判定**: 途中で止めるかを決める chekpoint
- **統計処理**: n が少ない場合 bootstrap CI / permutation test / Bayesian で点推定の偶然性を吸収

これを**軍師に 1 回だけ** 敵対的レビュー:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  ".takumi/drafts/{proposal-name}.md を敵対的レビュー: metric の gaming 余地 / selection bias / blinding 破綻 / n 不足での結論反転リスクを指摘" \
  2>&1 | tail -100
```

指摘を反映してから次段階へ。

### 3. パイロット実行 (別 repo で、本番 code を変更して)

- パイロット用 project (別 repo、壊しても良いもの) に checkout
- **本番 production code を実際に修正**する (seeded bug の注入、新 prompt の適用 etc.)
- 試行回数は n 不足で CI が広がりすぎない程度 (推奨: 各 arm 8-10 試行以上)
- telemetry jsonl に 1 試行 1 行 append

**重要**: パイロットで生じる production code の変更・seeded bug branch・集計 script・telemetry jsonl は**パイロット repo 側に留める**。takumi skill repo には絶対にコピーしない。

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

1 項目でも曖昧なら先に埋める。急いで始めない。

---

## 例

- **pilot-max-review** (max 発動基準): 3 arm (xhigh / xhigh+max on critical keyword / all max) で critical defect recall を bootstrap CI で測定。採用時は `review-process.md` の placeholder を埋める
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
