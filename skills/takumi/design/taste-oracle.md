# Taste Oracle — craft の offline 観測装置 (design mode、採否保留 / pilot-gated)

> [!CAUTION]
> **本書は spec であり、まだ採用していない (NOT adopted)**。takumi の **pilot-driven 方針** (閾値先出し) に従い、pilot を通過するまで build/gate に組み込まない。`craft-layer.md` / `runtime.md` から「offline 観測装置」として参照されるが、現時点で **常時 pipeline は決定論層 (craft-tokens / jp-typography / craft-layer の preflight) のみ**。本書の Stage 1/2 は **opt-in** かつ **advisory** で、採用は pilot GO 後。

craft (作り込み) は本質的に非決定論で、決定論 rule だけでは「プロが組んだような」天井に届きにくい。そこで **render→screenshot→multimodal 採点** で craft を観測し、**頻出 defect を決定論 preflight rule に昇格** (E→D) する。**gate ではなく観測装置**。

---

## staged rollout

| stage | 内容 | 決定論 | コスト | 採用条件 |
|---|---|---|---|---|
| **Stage 0** (常時) | craft-tokens / jp-typography / craft preflight + design-token lint。render なし | 完全 | ~0 | 既定 |
| **Stage 1** (opt-in) | 決定論 *capture* + visual regression。component 単位 (Storybook) を change-gating (TurboSnap/Lost-Pixel) | capture は決定論 | 低 (free tier 内) | opt-in。taste 判定はしない |
| **Stage 2** (opt-in) | multimodal taste oracle。changed component のみ。**advisory・never block** | 非決定論 | 高 (vision calls) | **pilot GO 必須** |

one-line rule: **数値/token に還元できるものは Stage 0 で常時・安価に。主観は Stage 2 で opt-in・助言のみ・build を止めない。oracle は changed のみに走らせる。**

---

## Stage 2 critique 設計 (gaming/variance 対策)

### ArtCoT 3-stage prompt (evidence-first、必須)

naive な「1-10 で採点」は human alignment を ~20% 悪化させる (実測、hedge 語に流れ hallucination)。**観測→判定→要約**の 3 段で根拠を強制:

1. **Analyzer (記述、判定しない)**: 観測事実のみ列挙 (spacing 実測値 / alignment edge / type size・weight / 色数 / contrast / grouping)。
2. **Critic (named principle で判定)**: 上の事実のみを使い rubric (`craft-layer.md` §6) で評価。各判定に観測根拠を引用。
3. **Summarizer**: per-axis **{pass / warn / fail}** verdict + severity (Nielsen 流) + 具体 token 修正 ("card gap 20px→16px")。**絶対 0-3 スコアにしない** — 0-3 は judge 間 ±1 揺れが出るため。A/B 比較時は better / worse / tie の相対判定。`craft-layer.md` §6 の anchored 0-3 は**設計時 preflight 用**に残し、oracle の機械判定は粗い 3 値に収束させる。

### variance 制御 (research C)

- **anchored rubric**: 各 score level を具体記述 (0=凡庸 / 3=pro)、open な 1-10 にしない
- **multi-sample median + confidence**: N 回採点して median、disagreement 大は low-confidence → 人間へ
- **swap-consistent pairwise**: A/B 相対比較、順序を入替えて両方で勝った時のみ採用 (position bias 対策)
- **blind + cross-provider judge**: 自作物と明かさない、Claude に Claude を採点させない (self-preference 対策)
- **Blank-Drop check**: 画像を抜いてもスコアが残るなら modality bias → 棄却

### gate にしてよい / いけない

- **gate 可候補**: 階層欠落 / CTA 埋没 / 余白リズム破綻 / 型スケール逆転 / 色数過剰 / shadow・border・bg の濁り / 日本語の行長・行高
- **gate 不可**: 総合 taste / 「プロっぽさ」/ 「AI っぽさ」/ ブランド適合 / 装飾の好み / 競合類似度

### 自動修正ループ

`screenshot→critique→fix` は **1 round まで**。過剰 iteration 禁止。残違反は PR description に記録。

---

## E→D promotion (skill が育つループ)

oracle 指摘を `.takumi/design/craft-calibration.jsonl` に append (schema は discovery backlog 参照)。
**頻出 defect** (例: 4 週で同 axis fail 10%+) を discovery backlog に昇格 → 決定論 preflight / lint rule 化を検討。
人間 spot-check との乖離 >20-25% なら rubric を**先に再校正**してから信頼する (calibration ledger)。

---

## pilot 設計 (採用前)

pilot-driven 方針 Step 1-2 必須 (閾値後出し禁止)。pilot 実行は skill repo の外で:

- 固定 prompt / viewport / seed / rubric
- gold set: 人間デザイナーの pairwise ranking
- 同一画像を複数回採点して variance 測定
- **採用閾値 (先出し)**: oracle の指摘 precision / human alignment (Spearman) / variance が事前登録値を満たす
- **棄却条件 (先出し)**: variance 過大 / human divergence >25% / gaming 余地

> **taste critique は pixel diff (視覚回帰) と別物** なので同列に却下しない。raw taste score を gate にするのは恒久禁止。

---

## 関連リソース

| file | 用途 |
|---|---|
| `craft-layer.md` (同) | craft preflight rubric (oracle が採点する rubric) / 矛盾調停 |
| `craft-tokens.md` (同) | Stage 0 決定論 token (昇格先) |
| `jp-typography.md` (同) | 日本語 axis (行長・行高など) |
