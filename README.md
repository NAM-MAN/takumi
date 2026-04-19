# takumi (匠)

AI 時代の開発ワークフローを **`/takumi` ただ 1 つのコマンド** に集約する Claude Code skill。仕様・観点診断・全域棚卸し・設計・実装・検証・リファクタを、自然文から意図を読み取って適切な内部モードへ振り分ける。

> **匠**: 熟練職人。一撃必中、精度のために修正を先払いする。

## 哲学

- **作ってから疑う** を **壊れ方と見え方を先に固定してから実装する** に変える
- 人間が覚えるのは `/takumi` 1 つだけ
- loop は疲労労働から監視と診断に降格、自動で回る
- 仕様 / 設計 / 検証 / リファクタは profile registry で連結、drift を防ぐ

## インストール

[gh CLI v2.90.0+](https://github.com/cli/cli) が必要。

```bash
gh skill install NAM-MAN/takumi takumi

# バージョン固定
gh skill install NAM-MAN/takumi takumi@v0.2.0
```

インストール後の動作確認:

```bash
gh skill preview NAM-MAN/takumi takumi
```

## 使い方

自然文で `/takumi` に意図を伝えるだけ。内部で 6 モードに振り分ける。

| 発話 | 内部動作 |
|---|---|
| 「note の一括リネーム機能を追加」 | 通常計画フロー(対話→AC→/design→Wave 実行) |
| 「security 見て」「perf 心配」 | **観点診断モード**(発見者並列→ICE 採点→修正計画) |
| 「全般的に棚卸ししたい」「リリース前総点検」 | **全域棚卸しモード**(8 次元並列発見→Synthesis 統合) |
| 「今なに動いてる?」 | 状態提示(自動処理・gate 判定・停止中 override) |
| 「続きから」 | 中断地点から再開 |
| 「sweep 24h 止めて」「auth の loop 止めて」 | 緊急 override(`.takumi/control/` に記録) |
| 「リファクタして」 | strict-refactoring policy で検査 |

判定ロジックは決定木 + 曖昧時 1 問確認。辞書は運用で更新(telemetry で誤分類率を測定)。

## 4 ロール体制

| ロール | モデル | 担当 |
|---|---|---|
| 棟梁 (touryou) | opus | 全体統括・計画作成・ユーザー対話 |
| 軍師 (gunshi) | gpt-5.4 (codex exec) | 深い戦略判断・敵対的レビュー |
| 職人 (shokunin) | sonnet (Agent) | 実装 |
| 斥候 (sekkou) | haiku (Agent) | 調査 |

## プロジェクト状態

プロジェクトルートの `.takumi/` 配下に集約:

```
.takumi/
├── plans/{name}.md              # Wave 計画
├── specs/{feature}.md           # AC-ID
├── design/                      # sitemap / style-guide / wireframes (ui)
├── profiles/                    # verify / design / refactor profile
├── verify/                      # recipe + reports
├── sprints/{date}/              # 観点診断・全域棚卸しの証跡
├── discovery-calibration.jsonl  # 発見者精度 ledger (append-only)
├── telemetry/                   # profile 起因 drift 検出
├── control/                     # override 記録
└── state.json                   # 実行状態 (mode / active_run_id / phase)
```

## 収録内容

1 つの skill (`takumi`) + 内部補助 md。利用者は内部構造を意識しなくてよい。

- **意図分類ルータ**: normal / probe / sweep / status / continue / override の 6 モード
- **計画生成**: 対話 → AC-ID 自動起草 → Wave 計画 → 自動実行
- **観点診断** (旧称 probe): 発見者並列 → ICE triage → 修正計画
- **全域棚卸し** (旧称 sweep): 8 次元並列発見 → Synthesis 矛盾統合 → backlog
- **設計生成** (design): project_mode=ui/mixed で seeded design inference (IA / style-guide / wireframe)
- **検証戦略** (verify): L1 PBT / L2 Component / L3 Model-based+Diff / L4 Mutation / L5 Smoke / L6 AI Review
- **検証ループ** (verify-loop): mutation score 向上の期間限定 loop
- **リファクタ policy** (strict-refactoring): 5 profile (domain-strict / ui-pending-object / legacy-touchable / integration-thin / lang-relaxed-go-rust)

## references/

4 本の技術リファレンス(言語中立・プロジェクト中立):
- `backend-patterns.md`
- `clickhouse-io.md`
- `coding-standards.md`
- `frontend-patterns.md`

## 既存 project の移行

旧 `.sisyphus/` を使っていた project は:

```bash
cd path/to/existing/project
mv .sisyphus .takumi
```

## 設計経緯

本 skill は 7 ラウンドの Oracle (gpt-5.4) 敵対的レビューを経て設計された。詳細は [docs/](./docs/) (随時追加)。

## ライセンス

MIT
