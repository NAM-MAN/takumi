# Synthesis Playbook: 矛盾統合解決パターン

2 つの品質次元が矛盾するとき、両方を同時に解決する第 3 案を生むためのパターン集。
sweep の Phase 2c で参照。実行ごとに新パターンを追記して進化する。

## 矛盾タイプ

| タイプ | 説明 |
|--------|------|
| add-vs-remove | 一方が追加、一方が削除 |
| simplify-vs-enrich | 一方が簡素化、一方が情報追加 |
| split-vs-merge | 一方が分離、一方が統合 |
| eager-vs-lazy | 一方が即時、一方が遅延 |
| strict-vs-lenient | 一方が厳格、一方が緩和 |

## パターン

### P-001: Optimistic Execute + Undo
- **タイプ**: add-vs-remove × confirmation
- **解決**: 即時実行 + 時限付き undo トースト
- **充足**: UX=摩擦ゼロ、堅牢性=誤操作から復帰可能

### P-002: Progressive Disclosure
- **タイプ**: simplify-vs-enrich × information
- **解決**: 最小表示 + 展開可能な詳細
- **充足**: UX=画面シンプル、機能=情報は到達可能

### P-003: Skeleton Screen
- **タイプ**: eager-vs-lazy × loading
- **解決**: 遅延ロード + コンテンツ形状プレースホルダ
- **充足**: パフォーマンス=軽量、UX=体感即時

### P-004: Compound Component
- **タイプ**: split-vs-merge × component
- **解決**: 共通 base + composable slots/variants
- **充足**: コード品質=DRY、UX=コンテキスト適応

### P-005: Contextual Strictness
- **タイプ**: strict-vs-lenient × validation
- **解決**: 影響度に応じて制約レベルを動的切替
- **充足**: セキュリティ=高リスクは厳格、UX=低リスクは自由

### P-006: Visually Hidden Semantics
- **タイプ**: add-vs-remove × accessibility-vs-visual
- **解決**: visually-hidden + aria-label
- **充足**: 視覚=クリーン、アクセシビリティ=情報豊富

### P-007: Inline Realtime Feedback
- **タイプ**: strict-vs-lenient × input
- **解決**: 自由入力 + リアルタイムバリデーション表示
- **充足**: セキュリティ=不正入力阻止、UX=制限を感じない

### P-008: Promise-Aware Scoped Mutation Guard
- **タイプ**: enrich-vs-simplify × mutation-feedback
- **解決**: aria 属性は既存 state から算出 (追加 0)、クリック系のみ Promise 化 onUpdate + 局所 isSubmitting、テキスト系はローカル draft + blur
- **充足**: UX=クリック系 disabled、a11y=aria-expanded、パフォーマンス=テキスト入力 rerender 排除
- **再利用条件**: mutation を伴う interactive element で disabled 中も aria 状態を正しく保ちたい場面

### P-009: Ownership via JOIN
- **タイプ**: add-vs-remove × authorization-performance
- **解決**: 所有権チェックを別クエリではなく既存 SELECT の JOIN/WHERE 条件に埋込 (`WHERE x.id=? AND parent.owner_id=?`)
- **充足**: セキュリティ=毎回検証、パフォーマンス=追加クエリ 0
- **再利用条件**: multi-tenant SaaS で row-level authorization を hot path で強制したい場面

### P-010: Trim-to-Null Schema Transform
- **タイプ**: strict-vs-lenient × validation
- **解決**: required=`.trim().min(1)`、optional=`.trim().transform(v => v || undefined)` で DB 空文字列排除 + UX フロー維持
- **充足**: 機能正確性=空文字列排除、UX=optional フィールドクリア可能
- **再利用条件**: zod / yup などの schema 層で form 入力と DB 制約を両立したい場面

### P-011: Classified Promise Parallelization
- **タイプ**: strict-vs-lenient × concurrency
- **解決**: 操作を 3 分類 (独立読み取り → `allSettled`、依存読み取り → `all`、書き込み → トランザクション) し各々最適な並列パターンを適用
- **充足**: 堅牢性=各分類で適切な安全性、パフォーマンス=読み取り系は並列、書き込み系はバッチ化
- **再利用条件**: 複数 I/O が混在する composite use case で一律 `Promise.all` を避けたい場面

### P-012: Token Triplet Expansion for rgba composition
- **タイプ**: simplify-vs-enrich × design-token-coverage
- **解決**: セマンティック色 token (`--color-X: #hex`) に対応する RGB-triplet token (`--color-X-rgb: r, g, b`) を並置して定義し、`rgba(var(--color-X-rgb), α)` で透明度バリアントを合成する。単一ソース (brand hex) を 1 箇所に維持しつつ、hover/subtle/ring/shadow の全透明度 variant を drift 無く生成できる。Tailwind v4 の arbitrary value syntax `bg-[rgba(var(--color-X-rgb),0.1)]` で CSS var がそのまま展開されるため client bundle 負担ゼロ。
- **充足**: 視覚一貫性=brand token と透明度 variant が同一ソースに紐付き drift 物理的不可能、コード品質=ad-hoc `rgba(r,g,b,0.1)` マジックナンバーが消える、UX=ホバー/アクティブ状態の色ブレが解消、DX=新しい subtle variant を追加する際も hex を書かない
- **再利用条件**: design system で brand 色の透明度 variant を複数 call-site で使い、drift が問題になる場面

### P-013: Server-Only Lazy-Registered Local Asset
- **タイプ**: add-vs-remove × loading
- **解決**: 外部 CDN 依存を排除しつつ、固定バージョンのローカルアセット (fontsource パッケージ or prebuild script でダウンロード → public/ 配下) を PDF / server 経路からだけ lazy に解決 & 1 度だけ register する。Next.js の場合は `next.config.ts` の `outputFileTracingIncludes` で serverless 出力に同梱を明示する。
- **充足**: 堅牢性=CDN 障害でも生成可 (HTTP 依存ゼロ)、パフォーマンス=cold start の外部 fetch ゼロ、コード品質=server-only モジュールに隔離
- **再利用条件**: PDF 生成・サーバー側 rendering で font や画像アセットを CDN 経由で引いている場面

### P-013b: Click-only div → absolute-inset button hit-area + sibling actions
- **タイプ**: split-vs-merge × interactive-row
- **解決**: 行全体クリックの `<div role="button" tabIndex onClick onKeyDown>` (中に nested action `<button>` を含む = HTML invalid) を、relative wrapper + absolute-inset の hit-area `<button aria-label aria-pressed>` + foreground content `pointer-events-none` + sibling action buttons (relative, group-hover) に再構成する。Tooltip 等の wrapper はそのまま機能する。
- **充足**: アクセシビリティ=native button keyboard semantics + aria-pressed/aria-label、機能=nested-button HTML invalid 解消、UX=既存の見た目 100% 維持 (relative/absolute layering で同じ視覚)、保守性=再利用可能パターン
- **再利用条件**: 全幅 clickable な list row / card / tile 内に sub-action button を配置したい場面。chevron / reorder / expand などの sibling action が必要な場合に特に有効

### P-014: ReadModel-Backed View BFF
- **タイプ**: split-vs-merge × endpoint
- **解決**: 画面が要求する view model を `XxxViewForYyy` ReadModel クラスに集約し、`/api/v1/{view}` という view-specific BFF 1 本で返す。既存 resource endpoint は不変。Repository 直結のクエリで N+1 排除、domain 層を壊さない。
- **充足**: パフォーマンス=1 round trip + DB クエリ N+1 排除、コード品質=既存 REST を保ちつつ CoDD ReadModel パターンに沿う、保守性=ページ側の fetch 連鎖が消えコード量大幅削減
- **3 層実装構造** (典型):
  - (a) repository ReadModel 関数: batched JOIN / IN-clause queries、strict-membership ownership gate、returns `{ parent; childrenByParent; grandchildrenByChild }` の in-memory grouping
  - (b) `/api/…/xxx-detail` route: P-009 ownership + 既存 build-* helper を per-item in-process call
  - (c) consuming hook: `setXxxBulk(entries)` helper + prop callback で既存 Map / Record state に bulk-merge (legacy single-purpose endpoint は mutation refresh 用に維持)
- **再利用条件**: 1 画面で N+1 的な fetch 連鎖が発生していて、既存 resource endpoint の後方互換を保ちたい場面 (典型的に 3-6 fetch を 1 fetch に集約可能)

### P-014b: Lifted Provider + Realtime Cache Invalidation
- **タイプ**: eager-vs-lazy × ui-cached-data
- **解決**: 同じ resource を複数の page / subtree で fetch する場面で、(a) Layout 直下の Provider に**1 回だけ** fetch する集約状態を持たせ、(b) 既存の realtime sync (Supabase channel 等) callback に hook して INSERT/DELETE 時にローカル state を refetch する。consumer は context から読むだけ。
- **充足**: パフォーマンス=ページ遷移ごとの重複 fetch ゼロ、UX=realtime で常に fresh、堅牢性=エラー / silent catch を Provider に集約
- **再利用条件**: 「同じ resource を複数の page / 複数の subtree で必要とするが、resource は realtime sync でも更新される」という条件。typical: notifications, billing summary, member list, product catalog
- **P-014 との違い**: P-014 は server-side composition (BFF endpoint)、P-014b は client-side composition (Provider + realtime)。両方を組み合わせて使うのが理想

### P-015: Server Layout + Client Active-State Subcomponent
- **タイプ**: simplify-vs-enrich × navigation-active-state
- **解決**: navigation の active state (visual highlight + `aria-current="page"`) を実現する際、layout 全体を `"use client"` 化してしまうと RSC 配信効率を犠牲にする。代わりに、layout は server component のまま保ち、active 計算が必要な navigation 部分のみを**小さな client subcomponent** に切り出して `usePathname()` で `isActive` を計算する。`isActive` の結果を visual class と `aria-current` の両方に同時適用することで、視覚的フィードバックと screen reader 対応を 1 つの `usePathname()` 呼び出しから派生させる。
- **充足**: 現在ページの視覚化 ✅、`aria-current="page"` でスクリーンリーダー対応 ✅、server layout は server のまま / client コードは subcomponent 内に局所化 ✅
- **再利用条件**: 任意の sticky sidebar / breadcrumb / tab 系 navigation で active 表現が必要な場面。layout を client 化したくないが、特定の slot だけ pathname を読みたい時

### P-016: Shared Authed-Fetch Hook with Session-Expiry Redirect
- **タイプ**: add-vs-remove × shared-behavior (robustness vs DRY)
- **解決**: 複数の page / hook が `fetch()` の 401 レスポンスを「もし session が切れていたら /login に router.push する」という同じ処理で扱う必要があるとき、その分岐を**1 つの薄い custom hook** (例: `useAuthedFetch`) にまとめる。call site は `const authedFetch = useAuthedFetch()` で受け取り、戻り値を `Response | null` として扱う (`null` のときは hook 側が既に redirect 済みなので呼び出し側は早期 return)。router 依存は hook 内に隠蔽されるため call site は `next/navigation` を import しなくてよい。
- **充足**: 堅牢性 ✅ (全 page で session 期限切れに正しく反応、新 page を作っても hook 経由で自動 redirect)、DRY ✅ (`if (res.status === 401) router.push("/login")` の重複を 1 箇所に統合)、副次的に機能正確性 ✅ (401 を握り潰して "エラーが発生しました" を出していた page で正しく login に飛ぶ)
- **再利用条件**: client component が `fetch()` を直接呼んでいて、session 期限切れの user-experience を保証したい場面。SWR / TanStack Query を導入していない middleware-light な React コードベースで特に有効

### P-017: Bounded Outbound RPC Helper
- **タイプ**: add-vs-remove × outbound-call-timeout (robustness vs DRY)
- **解決**: 1 つの `src/shared/network/withTimeout.ts` モジュールで (a) raw `fetch()` 用の `fetchWithTimeout(input, init, timeoutMs, label)` (AbortSignal-merging で呼び出し側の signal も尊重) と (b) AbortSignal を受け付けない SDK 用の `withTimeoutPromise(promise, timeoutMs, label)` を提供。プロバイダ別の defaults (`TIMEOUT_SLACK_MS`, `TIMEOUT_RESEND_MS`, `TIMEOUT_STRIPE_MS` 等) を同モジュールで export し、call site は `withTimeoutPromise(getStripe().checkout.sessions.create(...), TIMEOUT_STRIPE_MS, "label")` のように呼ぶ。タイムアウトは `TimeoutError` を throw、既存の try/catch / error handler パスがそのまま動く。
- **充足**: 堅牢性 ✅ (Cloud Run / Lambda 等のハードリミット手前で全 outbound RPC が打ち切られる)、セキュリティ ✅ (unbounded blocking 経由の DoS シナリオ排除)、DRY ✅ (プロバイダごとの timeout policy が 1 箇所に集約、新 route で同 provider を使うとき自動で同 timeout)
- **典型 defaults**: Slack / Resend など同期 webhook-like API は 8s、Stripe など subscription 操作は 10s (各 provider の p99 に合わせる)
- **再利用条件**: 任意の outbound HTTP / SDK call site で provider の p99 が一定範囲に収まることが知られている場面。新しい外部 API integration を追加するときは必ず timeout を入れる規律に

## Synthesis 生成手順

1. 矛盾ペアの「手段」ではなく「目的」を抽出
2. 矛盾タイプを特定し、Playbook で一致パターンを探す
3. 一致あり → パターン適用して具体化
4. 一致なし → 両方の目的を同時に満たす新案を創造
5. 軍師 検証: 真の Synthesis か判定

## 真 / 偽の判定基準

**真の Synthesis**: 両次元を 100% 満たす。第 3 の次元を犠牲にしない。

**偽の Synthesis (却下)**:
- 「基本的には A だが、B も少し考慮」→ A-wins の言い換え
- 「設定で切り替え可能」→ 判断の先送り
- 「ドキュメントに注意書き」→ UI で解決していない

## 新パターン登録

sweep 完了時、新 Synthesis が生まれた場合にこのファイルに追記:

```markdown
### P-NNN: {パターン名}
- **タイプ**: {type} × {context}
- **解決**: {1-3 行、具体的なテクニック}
- **充足**: {次元 A}={理由}、{次元 B}={理由}
- **再利用条件**: {このパターンが効く場面の条件}
```

project 固有の component 名 / API path / 日付 / ラウンド ID は playbook に入れない (汎用性が落ちる)。実績記録は `.takumi/sprints/{日付}/` 配下の retro に残す。

1. **`beat` → `note` に置換**(OK なら進めます)
2. **`ringi`**: 置換する(`ApprovalRequest`) / 残す のどちら?
3. **参考 md 5 本**: 配布から除外でよいか?

返答次第で一気に進めます。