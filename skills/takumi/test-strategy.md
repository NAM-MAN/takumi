# takumi の test strategy (内部補助)

`/takumi` 本体から参照される補助ドキュメント。各 task の `verify_profile_ref` を AC-ID から選定する狭い責務ロジック。

## 責務

AC-ID と ac_text から **verify_profile の選定 1 つ** (`goal / oracle / layers / mutation_floor / budget_sec / fallback_layer`) を返す。選定理由 (`reason`) を日本語で添える。これだけ。

verify_profile 本体の生成は `.takumi/profiles/verify/*.yaml` 側 (profile registry)。test コード生成は takumi の verify 運用 (職人 Agent が `verify/spec-tests.md` の USS 原則に従って既存 `*.test.ts` に `it('…べき')` を追加する)。

---

## 入力 schema

```yaml
ac_id: "AC-AUTH-002"
ac_text: "遷移は未認証→認証済のみ。逆方向遷移は拒否。"
ac_class: "state-transition" | "boundary" | "property" | "model" | "metamorphic"  # optional
context:
  layer: "domain" | "ui" | "api" | "data"
  risk: "low" | "standard" | "critical"
  project_mode: "ui" | "mixed" | "backend"
```

## 出力 schema

```yaml
verify_profile_ref: "state-transition"
profile:
  goal: "state transition safety"
  oracle: "model+invariant"
  layers: ["L2", "L4"]
  mutation_floor: 72
  budget_sec: 90
  fallback_layer: "L5-smoke"
reason: "遷移安全性は model-based + PBT + mutation で担保、E2E は fallback"
```

追加/省略 field 禁止 (schema 逸脱は許さない)。

---

## 5 archetype 標準表

| ac_class | goal | oracle | layers | mutation_floor | budget_sec | fallback |
|---|---|---|---|---|---|---|
| state-transition | 遷移安全性 | model+invariant | L2, L4 | 72 | 90 | L5-smoke |
| boundary | 境界条件 | boundary+property | L1, L4 | 75 | 60 | L3-diff |
| property | 不変条件 | property | L1, L4 | 80 | 45 | - |
| model | 複雑状態機械 | model+fc.commands | L3, L4 | 70 | 120 | L5-smoke |
| metamorphic | 正解が直接書けない (画像/ML/LLM) | metamorphic+differential | L1, L3 | 65 | 90 | - |

### 補正ルール

| 条件 | 補正 |
|---|---|
| risk = `critical` | mutation_floor +10 (上限 90)、layers に L4 必須 |
| risk = `low` | mutation_floor -5 (下限 60) |
| project_mode = `ui` | layers に L2 (Component Test) を優先付加 |
| project_mode = `backend` | layers から L2 を除外、L1+L4 軸に |

---

## 導出ロジック (A → B → C の順)

### A. ac_class 明示 — archetype 直引き
表から該当行を返して risk / project_mode 補正を適用するだけ。最速・最安定。
plan author は可能な限り ac_class を明示する運用を推奨。

### B. ac_class 未指定 — キーワード推論
`ac_text` に対してキーワードマッチで archetype を推論:

| archetype | マッチキーワード |
|---|---|
| state-transition | 遷移 / 状態 / transition / state / フロー / 承認経路 / 認証 / 未認証→認証済 |
| boundary | 境界 / 最大 / 最小 / 上限 / 下限 / 0 超 / 以上 / 以下 / 閾値 / boundary / limit |
| property | 不変 / 常に / どんな入力でも / 冪等 / 可換 / 結合 / invariant / property / forall |
| model | 複雑 / 状態機械 / カート / 注文 / ワークフロー / ステップ / state machine / workflow |
| metamorphic | 画像 / ML / LLM / 分類 / 変換 / 回転しても / 同一クラス / 正解が書けない / オラクル不在 / metamorphic |

優先順: state-transition > model > boundary > property > metamorphic。
複数ヒット時は優先順で 1 つに収束。

### C. 曖昧 — 軍師 判定

> [!NOTE]
> **軍師モデル表記**: 以下の `-m gpt-5.4` は guaranteed baseline。`.takumi/profiles/env.yaml` の `preference.model: auto` 時、ChatGPT Plus user の runtime は **gpt-5.5** が選ばれる (詳細: `executor.md` の「GPT-5.5 upgrade path」)。

A / B で決まらなければ 軍師 (GPT-5.x) に 1 行 archetype 名だけ返させる:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" "以下の AC を 5 archetype に分類せよ。
archetype: state-transition | boundary | property | model | metamorphic
ac_text: <本文>
出力: archetype 名 1 語のみ" 2>&1 | tail -5
```

### Tie-breaker
B で複数 hit した場合:
1. `context.layer = domain` → property 優先
2. `context.layer = ui` → state-transition 優先
3. `context.risk = critical` → model 優先
4. 決まらなければ 軍師 (C) 委譲

---

## 起動例(/takumi 内部呼出)

```yaml
# 入力 (AC-AUTH-002、遷移条件)
ac_id: "AC-AUTH-002"
ac_text: "遷移は未認証→認証済のみ。逆方向遷移は拒否。"
context: { layer: "ui", risk: "standard", project_mode: "ui" }
```

```yaml
# 出力 (B ルート: 「遷移」「認証」でキーワード推論)
verify_profile_ref: "state-transition"
profile:
  goal: "遷移安全性"
  oracle: "model+invariant"
  layers: ["L2", "L4"]
  mutation_floor: 72
  budget_sec: 90
  fallback_layer: "L5-smoke"
reason: "ac_text「遷移」「未認証→認証済」で state-transition に収束、ui で L2 優先"
```

critical 時の例 (AC-PAY-004、boundary 明示、risk=critical):
```yaml
mutation_floor: 85  # 75 + 10 (critical 補正)
layers: ["L1", "L4"]  # L4 必須
```

---

## /takumi との連携

/takumi は task 作成時に各 AC に対して内部呼出する(コマンドではなく関数呼出のイメージ):

```
for ac in task.ac_ids:
  profile_ref = resolve(ac.id, ac.text, ac.class_if_known, context)
  task.verify_profile_ref = profile_ref
```

結果を `.takumi/telemetry/profile-usage.jsonl` に `task_created` event で emit (`derivation_path: A|B|C` 付き)。C ルートが増えたら keyword 表を拡充するサイン。

---

## 月次保守ルール (陳腐化防止)

導出ルールは 3-6 か月で陳腐化する (軍師 警告)。毎月以下を実施:

1. **月次逆流レビュー**:
   - 先月の survived mutant のうち現行 archetype で拾えなかったものを抽出
   - 先月の prod defect のうち検出できたはずのものを抽出
   - 新 failure pattern を発見

2. **archetype 追加 or tweak**:
   - 既存 5 で足りなければ新 archetype (例: `concurrency`, `security-boundary`)
   - keyword 表の新語追加

3. **telemetry 確認**:
   - `gate_failed` events の `failure_source: profile_item` 比率
   - **10% 未満 4 週続いたら archetype 形骸化のサイン** → 見直しか除外

### 禁止事項

- `.takumi/verify/testing-matrix.md` の手動書き換え (月次保守経由のみ)
- archetype を一気に 5 → 10 と増やす (3 か月以上の観察期間)
- mutation_floor を根拠なく下げる (telemetry と prod defect 相関を見る)
- keyword の無秩序追加 (false match で tie-breaker 暴走)

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | /takumi 本体 |
| `verify-profiles-defaults/*.yaml` (同ディレクトリ) | 5 archetype の default template (bootstrap 時 project にコピー) |
| `verify/README.md` (同階層配下) | L1-L6 定義・recipe library |
| `design/README.md` (同階層配下) | takumi の design mode。同じ profile registry 方式、design_profile 側 |
| `.takumi/profiles/verify/{name}.yaml` | project 側の profile 本体 |
| `.takumi/verify/testing-matrix.md` | 導出ルール表 (月次保守) |
