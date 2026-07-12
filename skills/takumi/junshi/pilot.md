# 巡視 pilot 設計 — 閾値先出し (採用前、NOT adopted)

> [!CAUTION]
> 巡視は **spec であり、まだ build/gate に常時組み込んでいない (NOT adopted)**。takumi の **pilot-driven 方針** (閾値先出し、後出し禁止) に従い、pilot を通過した層から順に採用する。`../design/taste-oracle.md` と同じ規律。

巡視は「render→screenshot→multimodal 採点」を含む非決定論的発見を伴うため、固定 prompt/viewport/seed/rubric で variance を測り、人間のぽちぽちレビューを gold set として alignment を検証してから信頼する。

---

## staged rollout (採用順、`modes.md` と整合)

| stage | knob | 内容 | リスク | 採用条件 |
|---|---|---|---|---|
| **Stage 0/1 = discovery** | `discovery: manual→auto` | 採取モード + per-Wave hook で発見を記録・**自己増殖**。advisory・`.takumi/`-only・可逆 | 低 (記録のみ、反証+triage 経由で初めて backlog/draft AC) | **pilot 中に走らせて precision を貯める** (走らせないと検証不能)。harness あれば既定 `auto` |
| **Stage 2 = gate** | `enforcement: gate` | 客観オラクル (spec/differential/metamorphic) が Wave gate を**ブロック** | 中 (gate fail でブロック) | 下記閾値を事前登録で満たす (**pilot GO 必須**) |
| **Stage 3 = autofix** | `enforcement: autofix` | 常駐ループ B-2 の**自動修正** (executor gate + human floor 経由) | 高 (無人修正) | Stage 2 + autonomy + human floor 検証 (**pilot GO 必須**) |

one-line rule: **発見+自己増殖は advisory・可逆ゆえ harness があれば既定 ON で pilot を兼ねる。pilot GO で gate するのは enforcement (ブロック/自動修正) だけ。趣き/摩擦は恒久 advisory で gate にしない。**

---

## 事前登録する採用閾値 (先出し)

pilot 実行は skill repo の外の実 project で。固定 prompt / viewport / seed / rubric を使う。

| 指標 | 採用閾値 (先出し) | 測定 |
|---|---|---|
| **precision** (oracle_type 別) | spec/differential/metamorphic ≥ 0.6、趣き ≥ 0.5 (advisory) | confirmed/(confirmed+rejected)、`discovery-calibration.jsonl` |
| **recall** (既知欠陥 seed) | execution-only seed corpus で ≥ 0.7 (静的 L0-L5 が取り逃す family に限定) | gold seed の再現率 |
| **human-alignment** | 巡視発見 vs 人間ぽちぽちレビューの順位相関 (Spearman) ≥ 0.6 | gold set との突合 |
| **variance** | 同一画面 N 回採点で verdict 揺れ (趣き) が事前登録幅内、客観オラクルは run 間一致 ≥ 0.9 | multi-sample median |
| **novel_valid 収量** | ≥ 0.08 件 / 1k token (`../sprint/self-multiplying.md` 健全線) | run ledger |

---

## 棄却条件 (先出し)

1 つでも該当したらその stage を **REJECT**:

- **副作用 leak 1 件** (②走行が実・共有・staging・prod に write、network 漏れ) → 即 reject (containment 破綻)
- variance 過大 / human divergence > 25% (rubric/接地を再校正してからのみ再 pilot)
- precision が閾値未満で改善しない (gaming 余地 = root_cause 言い換え水増しが検出される)
- 趣きオラクルを gate にしようとする試み (恒久禁止、advisory 固定)
- capture を回帰の正解に使う設計 (pixel diff、verify でも REJECT 済)

---

## gate にしてよい / いけない (`oracles.md` と統一)

- **gate 可候補** (Stage 2): spec の I3/I4/I5 違反 (決定的判定可) / differential の「AC 変更なき振る舞い変化」/ metamorphic の deterministic 関係
- **gate 不可** (恒久 advisory): 総合 taste / 「プロっぽさ」/ ブランド適合 / 摩擦 (= 主観・人間/PM 判断)

---

## pilot ハーネス

- gold set: 人間が実際にぽちぽち触って見つけた発見リスト (surface × journey)
- holdout: seed 未漏洩の clean surface で family/distinct/precision を測る (`../probe/discover.md` のラダー pilot と同形式)
- 比較群: (a) 静的のみ L0-L5、(b) 巡視 L6 込み — L6 が静的の取り逃す execution/visual family を回収するかを確認
- blind + cross-provider judge: 自作物と明かさない、Claude に Claude を採点させない (self-preference 対策、taste-oracle 継承)

---

## 関連リソース

| file | 用途 |
|---|---|
| `README.md` (同) | 巡視全体像 |
| `modes.md` (同) | stage と採用順の対応 |
| `oracles.md` (同) | gate 可/不可の oracle 別根拠 |
| `graduation.md` (同) | 校正 ledger (precision 測定元) |
| `../design/taste-oracle.md` | pilot-driven 方針の参照実装 |
| `../probe/discover.md` | ラダー pilot の形式 (holdout/family/precision) |
