# QBC — Question Budget Calibrator (いつ聞き / 察し / 止まるか)

> [!IMPORTANT]
> **人間相互作用の単一較正核**。「聞きすぎ (過剰承認)」と「聞かなすぎ (初期誤解→手戻り)」を 1 つの risk 推定 + 質問予算に統一し、文脈別 policy に分岐する。intake / pre-Wave1 / runtime の 3 箇所から参照される。

## 適用範囲と限界

基盤的ドメイン誤解 (権限境界・状態機械・マルチテナンシー・監査・部分失敗) を着手前の critical 質問が防ぐのが機序。rework を大きく減らすが、**守備範囲外**もある: ① 非自明な codebase 規約 (例: object-key 形式・署名 URL) は質問で捕捉不能。② QBC でも誤る場合がある (seat-check のバッチ化等)。QBC は rework を激減させるが**ゼロにはしない**。

## 1. 共通核: risk 推定 (安価 proxy)

| 次元 | proxy |
|---|---|
| **ambiguity** | 未束縛名詞・代名詞・抽象動詞 / AC 欠落 / IN・OUT 未定 / 解釈候補数 / コード探索で候補 surface 複数 |
| **blast-radius** | 推定 files × surface 数 × AC 数 × dependency depth × (prod/DB/auth/CI/config 係数)。`rg`/diff 計画/パス分類で近似 |
| **不可逆性** | `dispatch/autonomy.md` の human floor (2 層) を流用 + 実行直前 second-pass 昇格 |

→ **質問予算** = 上記の単調増加関数。高いほど「聞く/収集」許容、低いほど「察して進む」。

## 2. コンテキスト十分性スコア (pre-Wave1)

7 軸 各 0-2 (最大 14): `Goal 明確度 / Scope 境界 / Surface 同定 / AC 原子性 / Risk 把握 / Verify 経路 / Reversibility`。

**規模別閾値** (Step 1 規模分類): Quick 8 / Standard 10 / Large 12 / Continuous・Full Spec 13+。
**ハード条件**: 不可逆 or blast 高は、スコアに関係なく「未回答 critical 質問ゼロ」を必須。

## 3. 停止の 2 分類 (auto-continue 両立)

- **hard-stop**: 不可逆 / critical 不足のみ。ここだけ人間を待つ。
- **soft-question**: 質問を投げ**つつ**可逆な探索・spec 草案・plan 下書き・小 preflight を継続。

plan schema に持たせる (soft-question 実現):
```yaml
assumption_id: A-3            # 仮定で進んだ箇所
rollback_point: "Wave 2 end"  # 仮定誤りで巻き戻す地点
blocked_tasks: [task-7]       # 回答待ちで保留中
```
提示は「止まりました」でなく**「仮定で進行中・ここだけ回答待ち」**。

## 4. 3 policy (共通核の上、文脈別 — 同一閾値を全場面で使わない)

| 文脈 | policy | 参照元 |
|---|---|---|
| **intake** (起票) | `assume + cite` — ラフ入力を察して根拠付き起票、誤推測コスト高い点のみ最小質問 | `backlog/offer-policy.md` / `natural-language.md` |
| **pre-Wave1** (計画前) | `ask-if-critical-gap` — 十分性スコア + critical gap 判定。**narrow: Standard/Large のみゲート、Quick は非ゲート** | `SKILL.md` Step 3 完了チェック / `dispatch/executor.md` |
| **runtime** (実行中) | `ask-only-if-irreversible` — Layer2 path override の誤発火を抑え、不可逆のみ停止 | `dispatch/autonomy.md` |

## 関連
- `dispatch/autonomy.md` (human floor・runtime) / `SKILL.md` Step 1・3 (規模・pre-Wave1) / `backlog/offer-policy.md` (intake)
