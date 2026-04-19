---
name: verify
description: AIファーストな検証統合スキル。Property-Based / Component Test / Model-based + Differential / Mutation / Smoke E2E / AI Review の 6 層で「人間の確認」を最小化する。strict-refactoring と連動し Pending Object → State Machine の進化に合わせてテスト形式を自動生成する。「テストを書く/増やす」「不具合検出を強化」「カバレッジ上げて」「リファクタ前の安全網」「テスト戦略」と言われたら起動。
---

# Verify: AIファーストな検証統合

人間が想像できる入力には限界がある。AI ファーストなテストは example を増やすのではなく
**ランダム生成 + 関係検証 + 本番観測** で網羅する。

**ループ運用**: `/loop 10m /verify-loop` で各レイヤーの mutation score を順に 80% 以上へ引き上げる
継続サイクル (`loop.md`) を持つ。同じ観点を繰り返さず A→B→C→D→E の作業層を rotate する。

**strict-refactoring (本番設計) と verify (テスト戦略) は 1 対の設計進化**。
Pending Object Pattern → State Machine → Event Sourcing に昇格するたびに、
verify が対応するテスト形式 (fc.commands → @xstate/test → Event invariants) を自動生成。

---

## 5 原則

1. **入力空間は AI が網羅** — example より property
2. **テストの質は機械が測る** — coverage より mutation score
3. **正解が無い世界は metamorphic で守る** — output 直接判定を諦める
4. **状態機械は操作列で網羅** — E2E は smoke 5 本だけ
5. **検出は左から右へ** — 型 → unit → mutation → 本番観測

---

## 6 層の検証スタック

| 層 | 何を | コスト | 内部参照 |
|---|---|---|---|
| L1 Property-Based | 入力空間 (純粋関数) | ms | `property-based.md` |
| L2 **Component Test** | UI component の state / props 空間 | ms | `component-test.md` |
| L3 Model-based + Differential | 状態機械 / 画面遷移 / 別実装比較 | s | `model-based.md` |
| L4 Mutation | テスト自体の鋭さ測定 | 30s/差分 | `mutation.md` |
| L5 Smoke E2E | 実 DOM 最小 5 本 | CI のみ | `smoke-e2e.md` |
| L6 AI Review | PR ゲート (軍師 cross-model) | API 呼出 | `ai-review.md` |

補助: `differential.md` (L3 の in-repo 2-export パターン)、
`machine-generator.md` (L3 の AI 自動生成パイプライン、Tier 分類、probe 統合)。

---

## 戦略選択フロー

```
何を守りたい?
├─ 純粋関数 (utils, builder, parser)     → L1 + L4
├─ UI component (props/state 単純)       → L2
├─ 状態を持つ feature                    → L3 (Tier で自動分類)
│   ├─ state 0-2 → L2 Component Test
│   ├─ state 3-8 → L3 Tier B (fc.commands + Pending Object)
│   ├─ state 9-20 → L3 Tier C (XState, test-only)
│   └─ state 21+ → L3 Tier D (Event Sourcing)
├─ オラクル不在 (画像生成, ML, LLM)      → L1 (metamorphic) + L3 Diff
├─ リファクタ予定                        → L3 in-repo 2-export
├─ 実 DOM / ネットワーク                 → L5 (CI のみ、ローカル禁止)
└─ AI が書いた PR                        → L6 (常時、軍師 gpt-5.4)
```

Tier 分類は **AST スコアリングで自動判定** (`machine-generator.md` Stage 2)。

---

## strict-refactoring との統合 (重要)

本番コードの設計進化と verify の Tier は **1 対 1 対応**:

| Tier | 本番設計 (strict-refactoring) | 共有契約 | テスト (verify) |
|---|---|---|---|
| A | useState 直書き | Props 型 | L2 Component Test |
| B | **Pending Object** (useReducer + `actionPreconditions` export) | precondition 関数 | L3 fc.commands (precondition 再利用) |
| C | **State Machine** (state > 8 で昇格、XState or plain TS) | machine 自体 | L3 @xstate/test (test-only XState) |
| D | **Event Sourcing** (state > 20 or canvas/realtime) | `applyEvent` pure 関数 | L3 Event invariants |

strict-refactoring が **production の設計を決める**。verify は **テスト形式を 1 対 1 で追従**。
両者が同じ precondition / machine / applyEvent を共有するため **drift しない**。

---

## 起動パターン

| 入力 | 動作 |
|---|---|
| `/verify` | プロジェクト診断 + 6 層導入 |
| `/verify run` | L1 + L4 Mutation incremental + L6 (pre-push 30s) |
| `/verify pbt <ファイル>` | property test を生成 |
| `/verify mutation` | Stryker フル実行 (週次) |
| `/verify machines init` | AI 生成パイプライン (Stage 1-5) を project に導入 |
| `/verify machines generate [--incremental]` | Tier 分類 + テスト/machine 自動生成 |
| 自動: 「テスト書いて」「カバレッジ上げて」等 | 戦略選択フロー経由 |

---

## 初回セットアップフロー (`/verify`)

1. プロジェクト構造解析 (Next.js / 純 TS / monorepo)
2. テスト基盤確認 (Vitest / Jest / Playwright)
3. **L1 導入**: `pnpm add -D fast-check`、`src/test/pbt-utils.ts` 生成
4. **L2 導入**: RTL 確認、`src/test/component-arbitraries.ts` 生成
5. **L3 導入**: `verify machines init` → scripts/ + `.takumi/machines/shared/` + pre-commit 登録
6. **L4 導入**: `pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker`、`stryker.config.mjs` 生成
7. **L5 整理**: 既存 Playwright を CI 専用 smoke 5 本に絞る
8. **L6 提案**: `.github/workflows/oracle-review.yml` 生成 (codex CLI 前提)
9. **pre-push hook 登録**: `/verify run` を `.husky/pre-push` に

各ステップは **ユーザー確認を取らずに連続実行**。

---

## `/verify run` の中身 (30 秒以下)

```bash
pnpm test --run                              # L1 + L2 + L3 の通常 vitest
pnpm stryker run --incremental               # L4 差分のみ
claude-code review --staged  # or codex      # L6 AI レビュー
```

3 つ全部 PASS で 0 終了。1 つでも失敗で push ブロック。

---

## 既存スキルとの役割分担

| スキル / コマンド | 役割 |
|---|---|
| **verify** (本スキル) | テスト追加・実行・Tier 分類 |
| **strict-refactoring** plugin | 本番コード設計 (Pending Object → State Machine → Event Sourcing) |
| 組み込み `/review` | 既存コードの品質検出 |
| 組み込み `/security-review` | セキュリティ検出 |
| `/refactor-clean` | 死コード削除 |
| `/build-fix` | ビルド/型エラー修正 |
| `probe` / `sweep` | 全体スイープ (pre-commit 経由で verify と統合) |

**設計 = strict-refactoring**、**テスト = verify**、**修正 = /refactor-clean / /build-fix**。役割を混ぜない。

---

## 依存ライブラリ (最小化方針)

production bundle に追加: **なし** (設計自由、既存 useState / Zustand / Jotai 維持)

devDependencies に追加:
- `fast-check` (必須、L1 + L2 + L3 Tier B/D で使用)
- `@testing-library/react` (既存でなければ、L2 用)
- `@stryker-mutator/core` + `vitest-runner` + `typescript-checker` (L4)
- `xstate` + `@xstate/test` (**Tier C 画面が存在する場合のみ**、オプトイン)

**追加しないもの**: ts-morph (scripts は regex で済ませる)、Jest (Vitest 推奨)、dedicated state library。

---

## ローカル実行コスト (M3 Mac)

| 検証 | 頻度 | 1 回コスト |
|---|---|---|
| L1 PBT | `pnpm test` | +0.5 秒/file |
| L2 Component Test | `pnpm test` | +0.5 秒/file |
| L3 Model-based | `pnpm test` | 2-5 秒 (numRuns=100) |
| L3 Differential (in-repo) | `pnpm test` | +1-3 秒 |
| L4 Mutation incremental | pre-push | 20-40 秒 |
| L4 Mutation full | 週次 CI | 5-15 分 |
| L5 Playwright smoke | CI 専用 | 60 秒 (**ローカル禁止**) |
| L6 AI Review | PR ごと | 10-30 秒 |
| machine generate incremental | pre-commit | 5-15 秒 |

**ローカル合計 30 秒以下**。Docker hang 問題は構造的に発生しない。

---

## 詳細ファイル (必要時 Read)

| ファイル | 内容 |
|---|---|
| `property-based.md` | fast-check 6 流派 |
| `component-test.md` | L2 RTL + fc パターン |
| `model-based.md` | L3 4-Tier + strict-refactoring 統合 |
| `differential.md` | in-repo 2-export パターン |
| `mutation.md` | Stryker 設定 + 運用 |
| `smoke-e2e.md` | Playwright 5 本 + CI 構成 |
| `ai-review.md` | 軍師 cross-model レビュー |
| `machine-generator.md` | AI 生成 5 stage パイプライン + probe 統合 |
| `loop.md` | `/loop 10m /verify-loop` — レイヤー A→E を順に mutation 80% へ引き上げる継続ループ |
| `scripts/extract-routes.ts` | Stage 1: Next.js route 抽出 (依存ゼロ) |
| `scripts/score-metrics.ts` | Stage 2: Tier 判定 (regex、依存ゼロ) |
| `scripts/generate.ts` | Stage 3-5: AI 生成オーケストレータ |
| `prompts/tier-a.txt` | Tier A (Component Test) 生成プロンプト |
| `prompts/tier-b.txt` | Tier B (Pending Object + fc.commands) 生成 |
| `prompts/tier-c.txt` | Tier C (XState + @xstate/test) 生成 |
| `prompts/tier-d.txt` | Tier D (Event Sourcing) 生成 |
| `prompts/drift.txt` | Stage 5 (3 view 三角測量) |

---

## 制約

- ローカルで Playwright を走らせない (Docker hang 防止)
- Mutation full run は週次のみ (pre-push は incremental)
- production の state management library は**一切触らない** (依存追加禁止)
- Pending Object (Tier B) の `actionPreconditions` は必ず export (L3 fc.commands が再利用)
- XState (Tier C) は **devDependencies 固定**、production 非混入
- AI 生成された machine / test は **手修正禁止** (修正は intent.md 経由)
- 1 machine 40 states 超で分割必須
- AI が自信を持てない遷移は `machine.md` に明示 (黙って生成しない)
- pre-commit は incremental 専用
- Tier 分類は **AST 自動**、人間は intent.md で例外指定のみ
