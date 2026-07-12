# enforcement-coverage — 全規範ルールを希釈に負けず強制する

> [!IMPORTANT]
> takumi の規範ルール (~102 file / ~1,402 section) を **会話文脈の脆い attention に依存させず**
> 強制するための機構。中心思想: **prose を「enforcer」から「SOURCE」へ降格**し、全ルールを
> **希釈しない 3 機構へ compile** して、双方向 orphan-zero で取りこぼしを証明する。

## なぜ (真因)

会話が伸びると front-load した規則 (1 mode ≈1,000-1,300 行) が希釈され適用されなくなる
(observed: autonomous なのに「Phase 2 やっていい?」と聞く / gate を飛ばす)。
「読まない (JIT 省略)」は **enforcement を捨てる誤り** — 全ファイルの規範は本当に守りたい。
→ enforcement を**脆い文脈の外へ追い出す**: 覚えるのでなく機構で守る。

## 3 tier (enforcement がどこに住むか)

| tier | enforcer | 希釈耐性 | takumi の例 |
|---|---|---|---|
| **T1 deterministic** | script / lint / CI / hook PreToolUse deny | 完全 (LLM 非依存) | build/test/mutation gate, ddp-lint, boundary_lint, M9 orphan, check-md-refs, irreversible-path override, **stop-legality (無人なのに確認/裸 yes/no/続けますか?)** |
| **T2 isolated-judgment** | 専用 reviewer subagent が当該 **1 file を fresh full 読み**→verdict のみ親へ | 完全 (主文脈ゼロコスト・full fidelity) | oracle review (F), contract-conformance (H), craft H1-H6, AC品質§C |
| **T3 kernel** | ≤30 行 always-on を毎 Wave 再アンカー | 完全 | loop-invariant (停止点3つ / thin-orchestrator), G6 context pause |
| (T0 SOURCE) | — md prose | — | **単独では enforcer でない = orphan rule = gate fail** |

census 分布: T1 候補 35% / T2 50% / T3 15% / safety 31。

## anchor 規約

各規範 section に機械可読アンカーを置く (NLP 抽出でなく明示、AC-ID と同型):

```markdown
## 停止点は 3 つだけ <!-- RULE: stop-points-only T3:kernel-reanchor -->
...本文...
```

各 section は最小 5 字段 `scope / shall / not / applicability / evidence` を持つ
(暫定RULEは存在保証であって意味保証でない → 5字段で意味を固定)。
registry の `evidence_required: false` (= 暫定) 比率は **≤20%** に制限。

## registry.yaml (single source of truth)

全 `RULE: id` は `registry.yaml` に 1 entry (`id/source/tier/mechanism/applies_when/safety/evidence_required`)。
`applies_when` は**既存** task frontmatter (`data_access/surface_ref/domain_slice/risk/tags`) で評価
= executor の G/H/I/J 発火条件を流用 (新機構でない、旧 plan 互換)。

## coverage gate (= 取りこぼしゼロの証明、M9 同型)

`scripts/check-enforcement-coverage.mjs` (check-md-refs 兄弟、Wave 3 で実装) が exit 1:
1. **forward orphan**: md の `RULE:` anchor で registry に無い id
2. **reverse orphan**: registry entry の `source` anchor が md に無い / `mechanism` path が disk に無い (死んだ機構)
3. **section 未アンカー = 0** (bootstrap 完了後は必須、それまで advisory)
4. **evidence_required=false 比率 ≤ 0.20**

## safety floor (LLM に委ねない)

`safety ∈ {none, irreversible, security, data_loss}` は **人間承認必須** (registry `safety_policy.classification_by: human`)。
未分類 = fail-closed。**safety は T2 単独禁止** (`t2_solo_forbidden`) = T1 か human。
autonomy.md §2 Layer2 の不可逆 path と一致。

## T2 reviewer の信頼 (揺れ対策)

- 各 reviewer は **seeded違反スイートを pass** して初めて registry で live (未pass = unenforced = orphan)。
  注入は reviewer prompt と**独立に著者** (検出と共謀させない)。
- quorum: 通常 2of2、**safety 3of2** + 直近50件 agreement ≥0.90 + seeded pass ≥0.95。
  agreement <0.85 → advisory、<0.80 → human-only。
閾値は `registry.yaml#thresholds`。

## Wave gate との統合

executor §3 の gate A-J は **registry を消費する driver** になる:
- per Wave、各 task frontmatter から enforcement set = `{applies_when(task)==true な rule}` を算出
- T1 → script batch 実行 (層単位 gate)
- T2 → rule-file ごと reviewer subagent を**並列** spawn (発見者並列と同型)、verdict を autonomy §3 分岐へ
- T3 → Wave 境界で再アンカー (現状の Step 6)
- **棟梁は reviewer の rule-file を自文脈に読まない** = 希釈に勝つ核

## capability matrix — 誇大主張の封じ込み

「実装済み mechanism」と「未実装の placeholder」を**利用者が混同し、不可逆操作で過信する**のが最大リスク。
registry の `evidence_required` がその discriminator:

| evidence_required | 意味 | 扱い |
|---|---|---|
| `true` | mechanism が live (script 実在 or kernel-reanchor) | enforced |
| `false` | 暫定 (mechanism 未実装) | **enforced でない**。`safety != none` なら **human floor 必須** |

- **`safety != none` × `evidence_required:false`** は `check-enforcement-coverage.mjs` が prominent に列挙し、
  `--strict` (配布前) で **HARD fail** = mechanism 実装 or human-fallback 明示まで配布不可。実行時は **human/manual に自動 fallback** (enforced と誤認させない)。
- **主張規律**: README/skill 文面は **「pilot で特定失敗を抑止」**と書く。**「有効性確認済み」「希釈耐性一般」とは書かない**
  (本設計の evidence は n 小・controlled test の ecological validity 限定・自走 tick が self-observation。directional GO であり formal CI bar 未達)。
- 採用範囲: **不可逆 path 検出 / 停止決裁 (dossier) / loop 停止述語**に限定。一般的希釈耐性は主張しない。

## 希薄化対策プログラム

「mode 別 JIT で読む量は減らした」のに希薄化が残る真因 = 規範の大半が **prose-only (attention 依存)**。
配分は **機構化 (T1/T2/T3) 70% : 読む量削減 30%**。本 program の到達点:

| W | 打ち手 | 機構 |
|---|---|---|
| **W0** | 指標の現実化 | registry `coverage_policy`: 全 section anchor は **NON-GOAL**、KPI=enforced rule 数 (網羅率でない)。placeholder を別カウント |
| **W1** | T3 kernel 拡張 + SKILL.md 純ルータ化 | kernel に `gate-before-advance` 追加 (4 不変条件・≤30行)。SKILL.md 冒頭に kernel を **各 1 行で再掲** (turn1 アンカー)、重複散文を削除 |
| **W2** | 停止 accident を T1 deny | `check-stop-legality.mjs`: 「無人なのに確認 / 裸 yes/no / 続けますか?」を telemetry から deterministic に fail。決裁ドシエを T3→T1 昇格 |
| **W3** | T2 reviewer 稼働 | `check-reviewer-seeded.mjs` で go-live 前提条件を機構化。oracle reviewer empirical 7/7 で live 実証 (rule 本文を親文脈に載せない) |
| **W4** | description precision | **skill 分割は不採用** (分割は希薄化に無効・description が広いと悪化)。takumi は単一 explicit-invoke skill で auto-load しない。precision は entry-table (必要 3-5 本のみ) + kernel 再掲で担保 |

### skill 分割を採らない理由
別 skill に割っても **description は常時ロード** (税は小だが false-positive で重い本体を読むと一気に希薄化)。
分割単体は無効、広い description で悪化。**有効化条件 = description を狭く + auto-load 後 router/kernel だけで止まれる構造** —
takumi は既にこれを満たす (`/takumi` explicit 起動・進入路表で per-task に必要本だけ JIT・kernel 冒頭再掲)。

## dilution-100 v3 <!-- ADVISORY: program 説明。強制は各 mechanism (rule-compiler / check-anchor-growth / check-stop-legality / check-plan-contract) -->

「300行の思想の効き」を保持でなく**生成物**で実現する program (`.takumi/drafts/dilution-100-proposal.md` が設計)。柱:

| 柱 | 実体 |
|---|---|
| **二層供給** (P1/P2') | fresh executor 入力 = kernel + mode card 1枚 (床、`cards/mode-*.md` ≤20行) + applicability match prose ≤2本全文 (天井、craft は生成時にしか効かない)。`executor.md` §2.2 |
| **Rule Compiler** (P5) | `scripts/rule-compiler.mjs` — card は RULE anchor 5字段の機械抽出のみ (LLM 要約・手書き禁止)、source hash で drift 検出。**fail 二分** (`dsl.md`): build fail = hash drift / shall・not 欠落 / id 重複 / schema 破壊のみ、applicability parse 不能 = `always` 降格 + warning (compile fail-closed は実行時 fail-open — 1 個の下手な anchor で pipeline をブリックさせない) |
| **plan gate 行** (P3) | `[GATE: rule-id | mechanism-ref | 期待値]` を plan に compile (ref-only、task ≤3 / plan ≤30)。`plan-template.md` |
| **弁別率 canary** (P0) | negative (違法停止) と **positive control (合法停止 G1/G3/G6)** を対で gate — 「絶対止まらないモデル」への過学習を検出。`check-stop-legality.mjs` |
| **paired replay** (P0) | 品質**連続量** (内容は正しいのに適用が鈍る) は離散 canary で測れない → fresh vs 希釈 arm の blind 裁定。`replay/README.md`。formal pilot は別 repo follow-up |
| **anchor 成長** | retrofit 廃止 → edit 経路強制: diff-gated (規範語彙 + 無 anchor = fail) + ratchet (`ratchet-baseline.json` 単調性) + 数値 cap の script 化 (README 記載の cap は守られない実証: provisional ≤20% が 40% で恒常違反した)。`check-anchor-growth.mjs` |
| **violation-driven 起票** | canary fire / T2 block が起きたら、違反された rule の anchor 草案を `.takumi/drafts/anchor-draft-{rule}.md` に自動起票する (需要駆動 — 実際に破られた規範から anchor する。機構は junshi 自己増殖ループ流用、実装 follow-up。手動運用: 違反観測時に棟梁が起票) |

**主張規律 (継続)**: 本 program が主張できるのは「特定失敗の抑止 + fixture での弁別」まで。「希釈耐性一般」「品質向上」は paired replay の evidence が出るまで書かない。provisional ≤20% の絶対 cap は **ratchet (単調非増加) に置換** — 現状値を baseline とし増加のみ fail、絶対値は formal pilot 後に再設定。

## ファイル <!-- ADVISORY: 一覧のみ -->
- `registry.yaml` — rule → mechanism mapping + 閾値 + safety policy + `coverage_policy` (全 section anchor は NON-GOAL、KPI=enforced rule 数)
- `dsl.md` — applicability DSL (凍結文法、parse 不能 = always 降格)
- `cards/` — rule-compiler 生成物 (per-rule card + `mode-*.md`、手書き禁止・編集は source md 側へ)
- `replay/README.md` — paired replay corpus schema (blind 裁定、regression 数必須)
- `ratchet-baseline.json` — anchor 率 / provisional 数 / kernel 行数の単調性 baseline
- `reviewers/*.md` — T2 reviewer prompt
- `scripts/check-enforcement-coverage.mjs` — coverage gate
- `scripts/check-stop-legality.mjs` — 停止合法性 T1 監査 + 弁別率 (seeded fixture `scripts/__fixtures__/stop-legality/`)
- `scripts/check-reviewer-seeded.mjs` — T2 reviewer go-live 前提条件 gate (両極性 seeded + verdict 契約を強制)
- `scripts/rule-compiler.mjs` / `scripts/check-anchor-growth.mjs` / `scripts/replay-harness.mjs` — dilution-100 (上表)
