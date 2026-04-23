# Machine Generator Pipeline (verify skill 内部参照)

AI が Next.js / React プロジェクトを解析して **Tier 判定 + テスト生成** を行う。
人間は **生成物の diff レビューと intent.md による例外指定** だけ担当。

> [!IMPORTANT]
> `examples/scripts/*.ts` と `prompts/*.txt` は **参考例** です。takumi skill は
> これらを実行コードとして直接呼び出しません。利用者は project 側の `scripts/`
> `prompts/` 等に cp し、対象プロジェクトの構造・命名規則・依存ライブラリに合わせ
> て自由に改変してください。

---

## 全体パイプライン (5 stage)

```
[Stage 1] Route 抽出       純 regex + fs      → routes.json
[Stage 2] Metrics 採点      純 regex + fs      → {slug}/metrics.json + tier
[Stage 3] Tier A 生成       Claude Agent SDK   → *.component.test.tsx
[Stage 4] Tier B-D 生成     Claude Agent SDK   → *.model.test.ts / *.machine.ts / *.events.test.ts
[Stage 5] 三角測量          Claude Agent SDK   → drift report (AST / Runtime / Spec)
```

Stage 1-2 は **依存ゼロ** (Node.js 組み込みのみ)。
Stage 3-5 は Claude Agent SDK 経由、プロンプトは `prompts/` 配下。

---

## 成果物の配置

```
.takumi/machines/
├── routes.json                        # Stage 1
├── <slug>/
│   ├── metrics.json                   # Stage 2 (tier + evidence)
│   ├── machine.ts                     # Stage 4 (Tier C のみ, XState)
│   ├── machine.md                     # Stage 4 (生成ノート、昇格警告)
│   ├── paths.test.ts                  # Stage 4 (Tier C, @xstate/test)
│   ├── intent.md                      # (optional) 人間が書く
│   └── drift.json                     # Stage 5
└── shared/
    ├── async.machine.ts               # 共有: fetch/mutation
    ├── form.machine.ts                # 共有: pristine→editing→submitting
    ├── modal.machine.ts               # 共有: open/close
    └── list.machine.ts                # 共有: filter/sort/paginate/select
```

Tier A / B / D の test は **src 配下** (既存 `__tests__/` 慣習):
```
src/app/settings/__tests__/SettingsToggle.component.test.tsx       # Tier A
src/features/beat/__tests__/reducer.model.test.ts                  # Tier B
src/features/canvas/__tests__/canvas.events.test.ts                # Tier D
```

Tier C の machine のみ **`.takumi/machines/` に生成物として分離** (手修正禁止を明示)。

---

## Stage 1: Route 抽出

`examples/scripts/extract-routes.ts` は **Next.js 専用の参考実装**です。project 側 `scripts/` に cp して要件に合わせて改変してください (skill は .ts に直接依存しません):
- Next.js `app/` または `src/app/` を glob
- `page.tsx` / `layout.tsx` / `loading.tsx` / `error.tsx` を収集
- `middleware.ts` を読んで guard パターン抽出
- 出力: routes.json (slug / path / layouts / guards / dynamic / children)

---

## Stage 2: Metrics 採点 (3 軸スコアリング)

`examples/scripts/score-metrics.ts` は **参考実装**です (regex ベース、依存ゼロ)。project 側にコピーして使います:

```
Route Complexity =
    layouts_depth
  + dynamic_segments.length
  + middleware_guards.length * 2
  + (error_boundary ? 1 : 0) + (loading_boundary ? 1 : 0)

UI State Count =
    useState_count
  + useReducer_count * 2
  + zustand_stores * 3
  + conditional_render_branches / 2

Interaction Complexity =
    handlers_count
  + server_actions * 1.5
  + (websocket ? 10 : 0) + (canvas ? 15 : 0) + (drag_drop ? 5 : 0)

Tier = max(3 軸)
  0-2  → A (Component Test)
  3-8  → B (fc.commands + Pending Object)
  9-20 → C (XState + @xstate/test)
  21+  → D (Event Sourcing)
```

**前回比較**: 前回の metrics.json を読んで tier が上がった場合は `machine.md` に昇格警告を記載。

---

## Stage 3: Tier A 生成

プロンプト: `prompts/tier-a.txt`

ざっくり:
- RTL + fast-check で property test 1-3 本
- Props / interaction をドメイン arbitrary でランダム化
- render 落ちない / ユーザー可視挙動 / handler 呼出回数を assert
- Tier B 昇格候補なら警告出力

---

## Stage 4: Tier B-D 生成

プロンプト: `prompts/tier-b.txt` / `tier-c.txt` / `tier-d.txt`

### Tier B (Pending Object + fc.commands)
- 本番: `useReducer` + discriminated `Action` + **`actionPreconditions` を export**
- テスト: fc.commands で各 action に対応する Command クラス
- `check` は `actionPreconditions` をそのまま呼ぶ (production と test で precondition 共有)
- state > 8 検出で Tier C 昇格警告

### Tier C (XState test-only)
- `.takumi/machines/<slug>/machine.ts` に XState machine
- `createTestModel(...).getShortestPaths()` で @xstate/test 生成
- devDependencies に xstate / @xstate/test 追加提案
- production は machine を知らない (ただ @xstate/test が本物画面を叩く)
- state > 40 で分割提案

### Tier D (Event Sourcing)
- discriminated Event union
- applyEvent 関数を production から抽出 (or 推定)
- fc.array(eventArb, { maxLength: 200 }) でランダム event 列
- 不変条件: 範囲 / uniqueness / determinism / (CRDT なら順序独立性)

---

## Stage 5: 三角測量

プロンプト: `prompts/drift.txt`

3 view 突き合わせ:
- AST: Stage 2 の evidence から遷移抽出
- Runtime: OpenTelemetry trace / E2E 実行ログ / 本番 canary sample
- Spec: `intent.md` (optional)

出力 `drift.json`:
```json
{
  "ok_transitions": [...],
  "dead_code_candidates": [...],
  "missed_by_ai": [...],
  "unimplemented_from_spec": [...],
  "unexpected_in_ast": [...],
  "recommendations": [...]
}
```

### Runtime trace 収集 (最小実装)

```ts
// src/test/trace.ts (全画面共通の薄い hook)
export function useStateTrace<T>(label: string, value: T) {
  if (typeof window !== "undefined" && (window as any).__verifyTrace) {
    (window as any).__verifyTrace.push({ label, value, ts: Date.now() })
  }
}
```

→ E2E / canary で `window.__verifyTrace` を dump。
→ OpenTelemetry が入っているならそちらに送る。

---

## Tier 昇格検知と strict-refactoring 連携

Stage 2 で前回 metrics.json との比較で昇格を検知:

```
1. machine.md に「⚠️ 昇格候補 (B→C)」記載
2. probe Phase 3 (plan) で「strict-refactoring 呼出し」タスク自動追加
3. Phase 4 職人 が:
   a. strict-refactoring skill を読み、Pending Object → State Machine 移行
   b. verify が新形式 test を追加生成
   c. 既存 fc.commands test は差分比較の基準として保持
4. differential 並走 (L3) → 1 スプリント後に旧版削除
```

詳細は `model-based.md` の「Tier 昇格」セクション参照。

---

## 起動コマンド

```bash
# 初回セットアップ
npx verify machines init
# → scripts/verify/ コピー、.husky/pre-commit 登録、shared machines 配置、
#    src/test/component-arbitraries.ts / trace.ts 空テンプレ

# 通常運用
npx verify machines generate --incremental --files <paths>   # pre-commit
npx verify machines generate --full                           # 週次 CI
npx verify machines generate --slug <slug>                    # 特定 route
npx verify machines verify --drift                            # Stage 5 のみ
```

---

## probe との統合

**verify を probe から明示的に呼ばない**。pre-commit hook で結合:

```bash
# .husky/pre-commit (verify init が登録)
CHANGED=$(git diff --cached --name-only | grep -E '(app|features|components)/.*\.(tsx?)$')
if [ -n "$CHANGED" ]; then
  npx verify machines generate --incremental --files $CHANGED
  git add .takumi/machines/ src/**/__tests__/
fi
```

probe の Phase 4 職人 は **本番コードを書く**だけ。
commit 時に pre-commit が自動で test / machine を生成。
probe Phase 5 完了レポートは `.takumi/machines/` の diff を集計:

```
Verify Layer 生成 (今回の probe サイクル):
  Tier A Component Test: +3
  Tier B fc.commands:    +1  (src/features/beat/__tests__/reducer.model.test.ts)
  Tier C XState:         新規 1 (checkout/machine.ts) ← 昇格
  Tier D Event Sourcing: 0
  昇格警告: settings画面が state > 2、B 昇格候補
```

---

## 運用ライフサイクル

### 新機能実装 (takumi の probe mode 経由)
1. `/takumi <feature> 見て` で probe mode に遷移
2. 職人 が page / component 実装 (strict-refactoring パターン推奨)
3. commit
4. pre-commit で verify machines generate --incremental
5. 生成物が commit に含まれる
6. Phase 5 で集計 report

### 既存画面改修
1. ファイル改修 → stage
2. pre-commit で metrics 再計算 → tier 変化検出
3. tier bump あれば警告表示
4. 人間が WARNING を読んで commit 継続 or 中断

### 週次 nightly CI
1. Runtime trace 収集 (E2E + canary sample)
2. Stage 5 で drift 検出
3. drift > 閾値なら PR 自動起票

---

## 失敗モードと回避策

| 失敗 | 原因 | 回避策 |
|---|---|---|
| AI が machine を hallucinate | AST だけでは挙動不明 | Runtime trace + intent.md |
| 生成 machine が drift | production コード変更 | pre-commit 再生成で追従 |
| tier 判定が過大 | 複雑に見えるだけ | intent.md で tier 固定宣言可 |
| 1 machine 40+ states | ドメイン粗い | 分割提案を Stage 4 が自動出力 |
| Tier C で xstate 導入拒否 | チーム方針 | Tier B fc.commands にフォールバック |
| 職人 がテスト書きすぎ | verify と重複 | 職人 は本番のみ、test は hook 任せ |
| pre-commit が遅い | full 走行してる | incremental 専用 (full は CI で) |

---

## 制約

- Stage 1-2 は **依存ゼロ** (正規表現 + fs のみ、ts-morph 不使用)
- Stage 3-5 は Claude Agent SDK (cross-model で 軍師 併用可)
- machine は生成物、**手修正禁止** (修正は intent.md か source 経由)
- Tier C の XState は **devDependencies** 固定
- production の state management は**一切触らない** (useState / Zustand / Jotai そのまま)
- pre-commit は incremental 専用
- drift 検出は警告のみ (**自動修正しない**)
- AI が自信を持てない遷移は `machine.md` に明示 (黙って生成しない)
