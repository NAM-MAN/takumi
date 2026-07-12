# L0-type — 型で実行時例外を消す (最小にして最強のテスト)

> [!IMPORTANT]
> verify ラダーの **最下層 (L0)**。L1 PBT より下に置く。**正しい型 = コンパイル時に成立する証明**であり、無数の runtime example より安く強い。実行時 test は「型で表現できない不変条件」にのみ使う。

## 思想

「illegal state を型で表現不能にする」(`domain-data-primitives.md` §2 / `contract-spine.md` の数学者観 / Alexis King "Parse, don't validate" / Yaron Minsky "Make illegal states unrepresentable")。型で潰した分は **runtime test 不要** になる — これを 4 象限で正の評価にする (下記)。

## L0-type の作法 (横断ルール)

1. **`any` 禁止**: `unknown` + 絞り込みへ。暗黙 any も禁止 (TS: `strict` / `noImplicitAny` で機械 enforce)。
2. **`undefined` / optional の濫用を削る**: **total function 優先**。欠落・失敗は直和型 (`Result<T,E>` / `Option<T>`) で明示し、呼び出し側に分岐を強制。
3. **make illegal states unrepresentable**: 直和型 + 判別 union。`switch` + `never` default で **exhaustive check** (新ケース追加時にコンパイルエラーで気づく。`strict-refactoring/behavior-carrier.md` の switch+never と整合)。
4. **branded / opaque 型**: 「検証済みの値」と「生の値」を型で区別。境界で 1 度 parse (zod 等) → 内側は信頼済み型のみ流通 (parse, don't validate)。
5. **数学的整合を型に**: 単位・範囲・非空・正の数を branded 型で表現し、不変条件 (契約 I1-I6) と接続。`NonEmptyArray<T>` / `Positive` / `Email` 等。

## 4 象限への反映 (型で消した分を正に評価)

`README.md` の量×鋭さ 4 象限は実行時指標のみ。L0-type は **「型で表現不能化した illegal state = テスト不要になった」を正の品質**として扱う:

- `as` / `any` / non-null `!` の出現数を **逆指標** (多いほど型を逃げている) として観測。
- 型強化で runtime test を縮約できたら、それは Q4 (張子) でなく Q1/Q2 への正しい移動。

## 言語別 tier (mutation tier と同型)

| tier | 言語 | enforcement |
|---|---|---|
| **hard gate (方針確定)** | TypeScript | `strict` / `noImplicitAny` ON + `any`/`as`/non-null `!` の出現数 gate |
| **advisory** | 型表現力の弱い言語 | warning のみ (mutation の advisory と同じ思想) |

> [!NOTE]
> **限定直接**: 本書は L0-type の**位置づけと方針文言**まで。`any`/`as`/`!` の **具体 gate 閾値と profile 運用・他言語 advisory の数値**は、QBC と同様に pilot or 別レビューで確定する (verify profile への数値反映は保留)。文言を先に置き、数値で品質ポリシーを QBC 未確定のまま固定しない。

## AC / 契約との接続

`contract-spine.md` の I3 (禁止状態) / I4・I6 (整合性) は「**まず型で表現不能にできないか**」を先に検討する (強制問診の前段)。型で潰せたら対応する runtime AC を縮約 (MSS と整合)。型で表現できない不変条件 (時間依存・外部状態・統計的性質) のみ L1+ の runtime test へ。

## 関連

- `verify/README.md` (4 象限・ラダー L0-L6)
- `domain-data-primitives.md` §2 (illegal state を型で) / `contract-spine.md` (I1-I6)
- `strict-refactoring/behavior-carrier.md` (switch + never exhaustive)
- BL-004 (`.takumi/backlog/`)
