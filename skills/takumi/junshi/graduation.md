# 巡視の昇格 (graduation) と校正 ledger — 使い捨てを永続保護に変える

`runtime.md` ⑤昇格 / ⑥校正 が読む詳細。**capture は使い捨て、確証だけが永続化する**。これが「探索は安く、回帰保護は堅く」を両立し、e2e のメンテ地獄を回避する設計の要。

---

## 使い捨て ⇄ 永続の境界 (絶対規律)

| 永続化する (少数、維持対象) | 毎回破棄する (維持しない) |
|---|---|
| TopContract specs (`../contract/contract-spine.md`、元々維持) | journey (T1-T4 から再生成) |
| 巡視エンジン spec (一度書く) | screenshot / DOM / trace (`.takumi/artifacts/ui/{ts}/`) |
| **graduate した AC-ID / verify test (確証のみ)** | 観察テキスト `ui-obs/{id}.final.md` (run 後 archive、回帰には使わない) |

> **差分オラクル用 signature の例外**: 正規化 DOM 要約 / 状態ハッシュ / journey outcome は **run-scoped で短期保持**し、次 run の差分比較後に prune する (`runtime.md` ②)。これは「維持対象」ではなく回帰ベースラインでもない (raw capture は破棄)。確証された差分は L3 test に昇格して初めて永続化する。

> [!IMPORTANT]
> 維持される `.spec.ts` を一切作らない。回帰保護は「spec から派生した少数の不変条件テスト」だけが担う。screenshot を回帰の正解にしない (pixel diff は verify でも REJECT 済、`../verify/README.md` L5.5 注記)。

---

## 昇格マトリクス (oracle_type → 昇格先)

確証された (= 人間 or autonomous 修正で「本物の問題」と確定した) 発見のみ昇格する。

| oracle_type | 確証時の昇格先 | 形 |
|---|---|---|
| **spec** | 新 **AC-{surface}-{seq}** | `.takumi/specs/{surface}.md` に `derived_from: [違反 I/T 項]` 付きで追加。DerivationMap に載り M9 orphan 検出対象に |
| **differential** | verify **L3 in-repo 2-export** or snapshot 不変条件 | 既存 `{m}.test.ts` に `it('… を保つべき')` (USS、`../verify/differential.md`) |
| **metamorphic** | verify **L1 metamorphic** | 既存 `{m}.test.ts` に `it('{Subject} は {変換} に対して {関係} を保つべき')` (`../verify/property-based.md`) |
| **taste** | 昇格しない (E→D promotion 検討のみ) | 頻出 axis fail は `../design/taste-oracle.md` の決定論 preflight rule 化検討。**gate にしない** |
| **friction** | 基本 `none` (backlog の UX/Missing) | 人間が要件と認めたときのみ AC 化 |

> [!WARNING]
> USS 厳守: 機構別ファイル (`.metamorphic.test.ts` / `.pbt.test.ts`) を**作らない**。既存 unit の `{m}.test.ts` に `it('…べき')` を追加する (`../verify/spec-tests.md`)。巡視はテストを増やす装置ではなく、**確証を最小の永続不変条件に結晶化**する装置。

### 昇格の実行主体とゲート
- **AC 追加 (spec)**: 巡視は **`status: draft` の AC 提案**までを `.takumi/`-only で行う (ungated)。**active 化は contract-spine の add 規律を通す** (`derived_from` 必須 + AC-coverage gate + M9 orphan、`../contract/contract-spine.md`) — 新 AC は将来の gate/scope/実装義務を変えるため draft 提案と active 化を分離する。AC の削除/改訂は Tier-0 保護核チェック (非 cosmetic 削除は human floor)
- **test 追加 (differential/metamorphic)**: 職人が実装 → executor Wave gate (A-J) を通す。新規 production code への影響があれば human floor 判定

---

## ⑥ 校正 ledger — `discovery-calibration.jsonl` (append-only)

巡視を「人間以上」に保つ自己学習ループ。既存の発見者精度 ledger を **oracle_type 軸で拡張**する。

```jsonc
// .takumi/discovery-calibration.jsonl (probe の発見者 ledger と同居、append-only)
{"ts":"...","source":"junshi","surface":"invoices","run_id":"...",
 "oracle_type":"spec|differential|metamorphic|taste|friction",
 "finding_id":"D-012","verdict":"confirmed|rejected","by":"human|autonomous|gunshi",
 "graduated_to":"AC-INVOICES-007|verify-L1|verify-L3|none",
 "phenomenon_id":"invoices::sort::order-mismatch",
 "root_cause_id":"src/invoice/list.ts::sortBy::ordering|null"}
```

### precision の算出と反映 (oracle_type × surface 別)
- `precision = confirmed / (confirmed + rejected)`
- **< 30%**: その surface でその oracle を **advisory 降格 or throttle** (棟梁が低重み扱い、出力件数を絞る)
- **≥ 80%**: journey 数 / レンズ強度を増やす
- 趣き/摩擦は元々 advisory ゆえ gate 昇格対象外。precision は重み調整のみ

### dedup による gaming 防止 (self-multiplying と同一規律)
- **dedup の一次キーは `phenomenon_id` (`surface::journey::観測クラス`)** — 視覚/摩擦/差分は根因未確定が普通なので**観測単位で dedup**。実装バグは根因が確定した時に `root_cause_id` (`file::symbol::欠陥クラス`) へ昇格
- **既出 (解決済 含む) と同一 phenomenon / root-cause なら novel でない** (`../sprint/self-multiplying.md`)。言い換え/別 surface 再観測を再カウントしない。precision を水増ししない

### 人間 spot-check との乖離
- oracle の判定が人間 spot-check と **>20-25% 乖離**したら、rubric/接地基準を**先に再校正**してから信頼する (`../design/taste-oracle.md` calibration ledger 方針と統一)

---

## 起票への接続 (OfferPolicy)

昇格と起票は別。発見が backlog に乗るのは `OfferPolicy.shouldOffer()` 経由 (`../backlog/offer-policy.md`):

| 文脈 | trigger | 備考 |
|---|---|---|
| per-Wave hook で discovered ≥3 | `discovered_3plus` | self-multiplying と同一 |
| 採取モード probe triage 完了 | `probe_triage` | 起票で STOP |
| 採取モード sweep 完了 | `sweep_complete` | 起票で STOP |

`mode == enabled` なら `.takumi/backlog/open/BL-###-{slug}.md` に自動昇格 (source: junshi)。新 trigger は追加しない。

---

## 関連リソース

| file | 用途 |
|---|---|
| `runtime.md` (同) | ⑤昇格 / ⑥校正 がここを読む |
| `oracles.md` (同) | oracle_type 定義 (昇格先の対応元) |
| `../contract/contract-spine.md` | AC 追加先 (specs)、Tier-0 保護核、M9 orphan |
| `../verify/spec-tests.md` | USS (it 命名、機構別ファイル禁止) |
| `../verify/property-based.md` | L1 metamorphic 昇格先 |
| `../verify/differential.md` | L3 differential 昇格先 |
| `../sprint/self-multiplying.md` | root_cause_id / novel_valid 規律 |
| `../backlog/offer-policy.md` | 起票 trigger |
