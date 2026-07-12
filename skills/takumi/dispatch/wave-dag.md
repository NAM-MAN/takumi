# wave-dag — Wave の DAG 並列実行 (executor 内部責務)

`executor.md` Step 1 から参照。従来「Wave は順番に」だったのを、**task 依存グラフのトポロジカル層**に再定義し、独立 task を並列実行する。

> [!IMPORTANT]
> **Wave = 手書きの順序ではなく、依存が解決済の task 群 (トポロジカル層)**。`depends_on` が無い旧 plan は全 task 直列 = 現状と完全互換 (§6)。

---

## 1. task schema 追加フィールド (plan-template.md)

```markdown
- [ ] 3. **タスク名**
  - **depends_on**: [1, 2]                       # 先行 task ID (空=依存なし)
  - **file_scope**: [src/auth/login.ts]          # 触るファイル (衝突検出)
  - **resource_scope**: [auth:policy]            # 非ファイル資源 (下記)
  - (既存: ac_ids / verify_profile_ref / risk / 何を / ロール / ...)
```

### resource_scope — file_scope だけでは実依存を表せない

DB migration・生成物・config・lockfile・env var・cache・外部 API・test fixtures の競合は **DAG 上は独立に見えるが実際は衝突する**。これを宣言する語彙:

| 語彙例 | 意味 |
|---|---|
| `db:schema` / `db:{table}` | DB スキーマ / 特定テーブル |
| `auth:policy` | 権限・認可ルール |
| `env` | 環境変数 |
| `package-lock` | lockfile (並列 install 不可) |
| `generated:*` | codegen 生成物 |
| `external:{svc}` | 外部 API (例 `external:stripe`) |

plan 生成時に棟梁/軍師が各 task の resource_scope を抽出 (Step 0c の risk 抽出と同じ要領)。

---

## 2. 実行モデル

```
1. 全 task の depends_on から DAG 構築 (循環検出 → エラーで停止)
2. トポロジカルソートで「層」に分割 (層 = 依存が全て完了済の task 群)
3. 各層内で並列可能性を判定:
     並列可 ⇔ file_scope ∩ = ∅ AND resource_scope ∩ = ∅
   衝突する pair は同一層内でも直列化
4. 並列バッチを 1 メッセージ内の複数 Agent dispatch で同時起動 (concurrency cap §3)
5. 層完了後に gate を 1 回 (層単位、合成状態でテスト) → §4
6. 次の層へ。全層完了で最終検証 (executor.md Step 2)
```

層内並列の判定 pseudo-code:

```python
def parallel_batches(layer_tasks):
    """同一層内で衝突しない task を並列バッチに束ねる。"""
    batches, assigned = [], set()
    for t in layer_tasks:
        placed = False
        for b in batches:
            if all(disjoint(t, u) for u in b):   # file ∩ = ∅ AND resource ∩ = ∅
                b.append(t); placed = True; break
        if not placed:
            batches.append([t])
    return batches   # 各 batch を並列、batch 間は直列

def disjoint(a, b):
    return (not (set(a.file_scope) & set(b.file_scope))
            and not (set(a.resource_scope) & set(b.resource_scope)))
```

---

## 3. 並列安全制約

| 制約 | 内容 |
|---|---|
| **衝突検出** | file_scope ∪ resource_scope が交わる task は直列化 (write 競合・shared_state 競合回避) |
| **並列度キャップ** | 同時 dispatch 上限 **3-4** (context fan-in が棟梁を圧迫しない範囲) |
| **GPT-5.5 並列の quota** | 職人(GPT-5.5) は codex 30/day + 30s inter-call delay に直撃 → GPT-5.5 task は並列幅 **1-2** に絞る。`balanced` (Claude-only) では quota 制約が無く**並列の恩恵が最大** |
| **mutable shared state** | file_scope が素でも resource_scope が衝突すれば直列 (§1 で宣言必須) |

> 並列化の恩恵は `balanced` (Claude-only) 時に最大。

---

## 4. 層単位 gate と犯人特定

層内の並列 task が全完了 → gate を 1 回 (build / test / mutation / L7、executor.md Step 1.3 と同じ項目)。

- **pass** → 次の層へ。
- **fail** → どの task が壊したかを **二分探索**: 層内 task を半分ずつ直列再実行して gate を回し、原因 task を特定 → その task だけ retry/escalation (autonomy.md G3)。
- 層が 1 task の時は二分探索不要 (= 従来の task 単位 gate)。

層単位 gate は task 単位より安いが、fail 時の特定コストとの trade-off。**層内 task 数が多い (>4) ほど二分探索コストが増える**ので、並列度キャップ 3-4 が特定コストの上限も兼ねる。

---

## 5. 宣言外変更の検出

file_scope / resource_scope は静的宣言。職人が**宣言外のファイルを触る**逸脱を検出する:

- 各 task 完了後 `git diff --name-only` と `file_scope` を照合。
- 宣言外ファイルが変更されていたら **層 gate で fail** 扱い → 当該 task を並列対象から外して直列再実行 + 宣言を修正。
- resource_scope は静的検出が難しいので、plan レビュー時に軍師が抽出漏れをチェック (best-effort)。

---

## 6. 後方互換 (直列 fallback)

- `depends_on` フィールドが **1 つも無い** plan → 全 task を記載順に直列実行 (現状と完全同一)。
- 段階導入: 新規 plan のみ DAG、既存 plan は触らない。
- `depends_on` が一部 task のみにある → 宣言の無い task は「前の全 task に依存」とみなし安全側 (直列) に倒す。

---

## 7. self-multiplying 連携

実行中に発見された新 task (`discovered-*.md`) を DAG に挿入する時:

- 棟梁が新 task の `depends_on` を推定 (発見元 task + 触る file_scope から逆算)。
- 推定不能なら**安全側で「現在の全未完了 task に依存」** = 最終層に直列追加。
- P0 割り込みは依存解決を待たず次バッチ先頭 (self-multiplying.md の既存規則を継承)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `executor.md` (同ディレクトリ) | Step 1 が本ファイルを参照 |
| `autonomy.md` (同ディレクトリ) | 層単位 gate fail の escalation (G3) |
| `plan-template.md` (同ディレクトリ) | task schema (depends_on / file_scope / resource_scope) |
| `self-multiplying.md` (同ディレクトリ) | 新 task の depends_on 推定と挿入 |
