# AI-first Brevity — 生成時の冗長を断つ横断規律

`rules-heuristics.md` の **Rule 16 (SMD)** の姉妹規律。SMD が **macro / refactor 時 / production 表面積** を扱うのに対し、本ファイルは **micro / 生成時 / token 経済** を扱う。職人 (Sonnet / GPT-5.5) が**コードを書く瞬間**に効かせる (事後リファクタより安い)。

> [!IMPORTANT]
> これは「関心の分離を犠牲にして短くしろ」ではない。**優先順位の最下位に brevity を足す**だけ。最初の 3 つ (correctness / 分離 / safety contract) を 1 mm でも削るなら brevity は発動しない。

---

## 1. SMD との関係 — 「LoC は指標でない」との矛盾を解く

`smd.md` は「**LoC は指標でなく副産物**」と明言する。これは production の**保守性**を測る文脈では正しい。本規律はそれと矛盾しない。文脈が違う:

| | SMD (Rule 16) | AI-first Brevity (本ファイル) |
|---|---|---|
| timing | refactor 時 (事後) | **生成時** (職人が書く瞬間) |
| 削る対象 | public exports / branching / deps edges / config knobs | 1 関数内の冗長な記述 (B1-B5) |
| driver | 保守性・事故率・局所性 | **token 経済** (後続の全 read / 軍師 review / gate / context window が払う実コスト) |
| LoC の位置 | 副産物 (指標にしない) | 副産物だが **context budget という二次コストを SMD は値付けしていない** |

**結論**: production 品質の指標は今も LoC ではない。だが AI-first pipeline では token 数が**測定可能な実コスト**であり、brevity に SMD が拾わない**二次的価値**がある。ただし下記 priority lattice の最下位に固定する。

---

## 2. Priority Lattice (hard、絶対順序)

```
correctness  >  関心の分離  >  observability / safety contract  >  brevity
```

- **brevity は tie-breaker 専用**。上位 3 つが等しい時に「短い方」を選ぶだけ。
- 上位を 1 つでも削るなら brevity は発動しない。具体的には:
  - ファイルを跨いで concern を混ぜて短くする → **却下** (file-organization / 関心の分離違反)
  - 信頼境界の input validation (zod 等) を削って短くする → **却下** (SMD: Silent Contract Violation)
  - 1 行に詰める code golf → **却下** (SMD が既に禁止、`reduce` 1 行詰めも不可)

---

## 3. AI 冗長 failure mode (B1-B5、命名して指摘可能に)

SMD の DRY-trap が「**消しすぎ**」の罠なら、これは「**書きすぎ**」の罠。AI 特有の過剰生成パターンに名前を付け、レビュー時にラベルで指摘する。

| ラベル | 症状 | 直し方 | 反対側の罠 (SMD) との区別 |
|---|---|---|---|
| **B1 Over-defensive Scaffolding** | 型/呼出契約が既に保証する条件への `if (!x) return` / try-catch / null guard | 型に寄せる、契約を信頼する | SMD の Silent Contract Violation は「**本物の**契約を消すな」。B1 は「**偽の**契約を足すな」。**信頼境界の validation は B1 ではない (残す)** |
| **B2 Redundant Restatement** | scope に既にある値の再導出、TS が推論する型の再宣言、1 回しか使わない中間変数、次行を実況するコメント | 直接使う、型推論に任せる、変数をインライン | — |
| **B3 Premature Abstraction** | 呼出 1 箇所のための wrapper / helper / factory / interface | 呼出側にインライン、rule-of-three まで待つ | SMD の Premature DRY Trap の生成時版 (そもそも作らない) |
| **B4 Comment Narration** | `// users をループ` の直後に `users.map(...)` | what コメント削除。コメントは **why のみ** | — |
| **B5 Ceremonial Error Plumbing** | 全 call を個別 try-catch で包み、文言を少し変えて re-throw | propagate、または境界 1 箇所で集約 handle | グローバル error-handling rule と整合 (境界で 1 回 handle) |

---

## 4. 1 行判定基準 (生成・レビュー共通)

> **この token を消して、correctness / concern 境界 / safety contract のどれも失わないか?**

- Yes → B1-B5 のどれかの冗長。削る。
- No (どれか失う) → 残す。それは冗長ではなく必要な記述。

この問いを職人が**書く前に**自問する。レビュー時は B1-B5 ラベルで指摘する。

---

## 5. 生成時の適用 (dispatch prompt への接続)

事後リファクタより、**最初からタイトに書かせる**方が安い (リファクタ自体が context を食う)。職人 (Sonnet / GPT-5.5) の dispatch prompt の制約節に以下を必ず含める:

```
[brevity 制約 — ai-brevity.md]
- correctness > 関心の分離 > safety contract > brevity の順。上位を削らない範囲で最短。
- B1-B5 を避ける: 偽の防御 / 再記述 / 早すぎる抽象 / what コメント / 過剰 error 包み。
- 信頼境界の validation・本物の防御契約・concern 境界は削らない (これらは brevity 対象外)。
- code golf 禁止 (声に出して読んで意図が分かる最短)。
```

接続点は `../dispatch/routing-mode.md` の「職人(GPT-5.5) dispatch 手順」§出力 contract と、`../dispatch/executor.md` Step 1.2 の職人 dispatch prompt。

---

## 6. 過矯正ガード (brevity が壊してはいけないもの)

低リスクな規律だが、AI が「短く」に過剰反応すると以下を壊す。明示的に除外する:

- **file-organization (many small files)**: 短くするためにファイルを統合しない。200-400 行/ファイルの分割原則は維持。brevity は **1 ファイル内**の話。
- **信頼境界の input validation**: zod parse 等は残す (B1 ではない)。
- **本物の error handling**: 境界での comprehensive handling は残す (B5 は「全 call の冗長な個別包み」だけが対象)。
- **immutability (Rule 17/18/20)**: 既に LoC を減らす方向。brevity はこれに乗るが、mutation 復活で短くするのは却下。

---

## 7. 適用効果の目安 (生成時に効かせた場合)

- 生成直後の LoC: 同等仕様で **10-25% 減** (B1/B2/B3 が支配的)。
- 後続 context 消費: 生成コードを read する全工程 (軍師 review / gate / 次 Wave) で比例削減。
- **survived mutant 不変** (brevity は assertion でなく記述を削るため、テスト品質に中立)。SMD と違い mutation gate を主目的にしない。
- 過矯正で concern を壊した場合は **PR review で B-ラベル逆方向 (「分離が消えた」) を指摘**して差し戻す。

---

## 関連リソース

| file | 用途 |
|---|---|
| **`code-vitals.md`** (同ディレクトリ) | **B3 の計測実体。`delegation_only` / `single_callsite_helper` / `mean_callsites` を `≤7 行率` と並置して report する** |
| `rules-heuristics.md` (同ディレクトリ) | Rule 16 SMD (macro/refactor 時の姉妹) |
| `smd.md` (同ディレクトリ) | SMD recipe (production 表面積、消しすぎの罠) |
| `immutable-first.md` (同ディレクトリ) | Rule 17/18/20 (LoC を減らす micro 規律、brevity の土台) |
| `../dispatch/routing-mode.md` | 職人 dispatch prompt への brevity 制約接続点 |
| `../verify/compression.md` | test 側の MSS (テストの冗長を削る、本規律の test 版対比) |
