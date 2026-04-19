# takumi (匠)

AI 時代の開発ワークフローを `/plan` と `/probe` の 2 コマンドだけに集約する Claude Code skill 集合。first-time-right を軸に、仕様・設計・実装・検証・リファクタを 1 つの導線にまとめた。

> **匠**: 熟練職人。一撃必中、精度のために修正を先払いする。

## 哲学

- **作ってから疑う** を **壊れ方と見え方を先に固定してから実装する** に変える
- 人間が覚えるコマンドは 2 つだけ: `/plan` (主導線) + `/probe <観点>` (例外時の診断)
- loop は疲労労働から監視と診断に降格、自動で回る
- spec / design / verify / refactor は profile registry で連結、drift を防ぐ

## インストール

[gh CLI v2.90.0+](https://github.com/cli/cli) が必要。

```bash
# 個別にインストール
gh skill install <your-user>/takumi plan
gh skill install <your-user>/takumi design
gh skill install <your-user>/takumi probe
gh skill install <your-user>/takumi sweep
gh skill install <your-user>/takumi verify
gh skill install <your-user>/takumi verify-loop
gh skill install <your-user>/takumi strict-refactoring

# バージョン固定
gh skill install <your-user>/takumi plan@v1.0.0
```

インストール後の動作確認:

```bash
gh skill preview <your-user>/takumi plan   # 事前内容確認
```

## 4 ロール体制 (日本語)

| ロール | モデル | 担当 |
|---|---|---|
| 棟梁 (touryou) | opus | 全体統括・計画作成・ユーザー対話 |
| 軍師 (gunshi) | gpt-5.4 (codex exec) | 深い戦略判断・敵対的レビュー |
| 職人 (shokunin) | sonnet (Agent) | 実装 |
| 斥候 (sekkou) | haiku (Agent) | 調査 |

## 収録 skill

### 主導線(人間が叩く)

| skill | 役割 |
|---|---|
| `plan` | 対話で仕様 → AC-ID → Wave 計画 → 自動実行まで一貫 |
| `probe` | 観点指定(security / perf 等)で発見 → 選別 → 計画 → 実行 |

### 自動呼出(人間は意識しない)

| skill | 呼ばれ方 |
|---|---|
| `design` | project_mode=ui/mixed で `/plan` から自動、または単独起動 (「ダッシュボード作って」) |
| `verify` | CI / pre-push で自動、recipe library として参照 |
| `verify-loop` | event 駆動 (mutation drop / Sev2 障害等) で自動起動、期間限定使用 |
| `sweep` | 月次自動 or event 駆動、全 8 次元スキャン |
| `strict-refactoring` | `/plan` から `refactor_profile_ref` 経由、または「リファクタして」で単独 |

## 使い方(最小例)

```
# 新機能追加
/plan note の一括リネーム機能を追加して

→ 対話で 3-8 問
→ AC-ID 自動起草・分類
→ /design (ui 時)
→ Wave 計画
→ executor が自動実行 (mutation gate + L7 hard gate 通過)

# 不安が出たら
/probe security
→ 観点指定の発見→修正ループ
```

自然文で伝えれば OK:
- 「今何動いてる?」 → 状態提示
- 「止めて」 → 自動処理 24h pause
- 「リファクタして」 → strict-refactoring 起動

サブコマンド構文は採用せず、意図は `/plan` に自然文で伝える。詳細は各 `SKILL.md` 参照。

## プロジェクト状態

プロジェクトルートの `.takumi/` 配下に集約:

```
.takumi/
├── plans/{name}.md         # Wave 計画
├── specs/{feature}.md      # AC-ID
├── design/                 # sitemap / style-guide / wireframes (ui)
├── profiles/               # verify / design / refactor profile
├── verify/                 # recipe + reports
├── sprints/{date}/         # probe / sweep 実績
├── telemetry/              # profile 起因 drift 検出
└── state.json              # 実行状態管理
```

## references/

4 本の技術リファレンス (言語中立・プロジェクト中立):
- `backend-patterns.md`
- `clickhouse-io.md`
- `coding-standards.md`
- `frontend-patterns.md`

## 設計経緯

本 skill 集合は 7 ラウンドの Oracle (gpt-5.4) 敵対的レビューを経て設計された:
1. 9 フェーズ案の穴潰し
2. scope reduction (SQLite → YAML、supervisor 軽量化)
3. loop 設計 (event-driven + priority 2 段)
4. first-time-right (後追い loop 疲労の解消)
5. 最終統合版 (条件付き採用)
6. 最小コマンド (/plan + /probe の 2 つに絞り込み)
7. strict-refactoring policy 設計 (profile registry、Tier A-D、actionPreconditions contract)

## 謝辞

`.sisyphus/` 命名由来の状態置き場概念は [oh-my-opencode](https://github.com/) にインスパイアされている(takumi 版は `.takumi/` に統一)。

## ライセンス

MIT
