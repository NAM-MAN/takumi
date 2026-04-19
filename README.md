# takumi (匠)

AI 時代の開発ワークフローを **`/takumi` ただ 1 つのコマンド** に集約する Claude Code skill。仕様・観点診断・全域棚卸し・設計・実装・検証・リファクタを、自然文から意図を読み取って適切な内部モードへ自動で振り分ける。

> **匠**: 熟練職人。一撃必中、精度のために修正を先払いする。

## なぜ takumi か

### Before (従来の開発ワークフロー)

- 計画は `/plan`、診断は `/probe`、全域点検は `/sweep`、リファクタは `/strict-refactoring`、実行は `/exec` … コマンドが散在
- テストは実装後に後追い、`verify-loop` を 10 分おきに回してスコアを上げる疲労労働
- 「Notion っぽく」を繰り返してデザインを調整、最後は目視レビュー疲労

### After (takumi)

- **`/takumi <自然文>`** だけ。内部で 6 mode に振り分ける
- **first-time-right**: AC-ID から verify_profile を自動選定、wave gate (mutation floor + L7 layout invariant) を通らないと次 wave へ進めない
- **loop は降格**: 常時巡回ではなく event 駆動(mutation drop、本番異常、リリースブロッカー時のみ)
- **design は seeded inference**: `ref_archetypes` + `brand_tone` の 4 項目入力で style guide を固定 token 化、drift 不能

## クイックスタート

```bash
# install (1 コマンド、skill 名省略可能)
gh skill install NAM-MAN/takumi

# 日常使用 (1 コマンド、自然文を渡すだけ)
/takumi note の一括リネーム機能を追加して
```

対話で 3-8 問 → AC-ID 自動起草 → 計画 → 実行 が自動で走ります。

## インストール

[gh CLI v2.90.0+](https://github.com/cli/cli) が必要。

```bash
# 最推奨: 1 コマンド install
gh skill install NAM-MAN/takumi

# skill 名明示形
gh skill install NAM-MAN/takumi takumi

# バージョン固定
gh skill install NAM-MAN/takumi takumi --pin v0.2.1

# install 前に内容を事前確認 (セキュリティ上の自己防衛に推奨)
gh skill preview NAM-MAN/takumi takumi
```

**セキュリティ注意**: GitHub は skill を検証しない。`gh skill preview` で内容を事前確認してから install するのが安全。

### アンインストール

```bash
gh skill uninstall takumi
```

### アップデート

```bash
gh skill update takumi
```

## 使い方(6 mode 詳細)

自然文で `/takumi` に意図を伝えるだけ。takumi は以下 6 mode に自動振り分けする。

### 1. normal — 通常の計画 → 実装

```
/takumi note の一括リネーム機能を追加
/takumi auth 周りを修正して
/takumi ダッシュボード画面を作成
```

**内部動作**:
1. 対話 3-8 問で要件を深掘り、AC-ID を自動起草(人間は一覧確認のみ)
2. project_mode=ui/mixed なら `/design` が自動起動、IA / style-guide / wireframe を生成
3. task に verify_profile_ref / design_profile_ref / refactor_profile_ref を自動付与
4. Wave 計画を生成、executor が自動実行
5. 各 wave で mutation gate + L7 hard gate を通らないと次 wave に進めない

### 2. probe — 観点指定の発見 + 修正

```
/takumi security 見て
/takumi perf が心配、調べて
/takumi a11y と ux を徹底的に見て
```

**内部動作**:
1. 観点に対応する発見者(haiku Agent)を並列起動
2. ICE 採点 + 軍師(gpt-5.4)の反論者チェック
3. backlog 生成 → 修正計画 → executor 実行
4. 発見者の精度を `.takumi/discovery-calibration.jsonl` に記録(継続学習)

### 3. sweep — 全域棚卸し

```
/takumi 全般的に棚卸ししたい
/takumi リリース前の総点検
/takumi 全次元見て
```

**内部動作**:
1. 8 品質次元(機能正確性 / UX / Missing / Performance / Security / Accessibility / Architecture / DX)を並列スキャン
2. 矛盾する発見を Synthesis パターンで統合解決
3. 統合 backlog → Wave 計画 → 自動実行

### 4. status — 今なにが動いているか

```
/takumi 今なに動いてる?
/takumi 状態見せて
```

自動処理・gate 判定・停止中 override を 30 秒で提示。

### 5. continue — 中断地点から再開

```
/takumi 続きから
/takumi 再開
```

`.takumi/state.json` の `mode` + `active_run_id` から復元。

### 6. override — 緊急時の自動処理停止

```
/takumi 止めて
/takumi sweep 24h 停止
/takumi auth の loop 止めて
/takumi hard gate を warning に
```

`.takumi/control/` に override ファイルを作成、自動化を一時停止。

## 判定ルール(失敗防止のため)

takumi の意図分類は決定木で動く:

1. **観点語**(security / perf / a11y 等)単独 → 曖昧 → normal 候補
2. **観点語 + 診断動詞**(〜見て / 〜調べて / 〜心配)→ **probe**
3. **全般語**(全般 / 総点検 / 棚卸し / リリース前)→ **sweep**
4. feature 実装語(追加 / 作って / 実装)→ **normal**
5. 曖昧時は **1 問だけ確認**(「security feature 追加ですか、security 診断ですか?」)

誤分類率は telemetry で可視化、運用で辞書を更新する前提。

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
├── sprints/{date}/              # probe / sweep の証跡
├── discovery-calibration.jsonl  # 発見者精度 ledger (append-only)
├── telemetry/                   # profile 起因 drift 検出
├── control/                     # override 記録
└── state.json                   # 実行状態 (mode / active_run_id / phase)
```

`.gitignore` に追加(成果物以外はローカル):
```
.takumi/sprints/
.takumi/control/
.takumi/telemetry/
```

## 収録内容

1 つの skill (`takumi`) + 内部補助 md。利用者は内部構造を意識しなくてよい。

- **意図分類ルータ**: normal / probe / sweep / status / continue / override の 6 mode
- **計画生成**: 対話 → AC-ID 自動起草 → Wave 計画 → 自動実行
- **観点診断** (内部 probe mode): 発見者並列 → ICE triage → 修正計画
- **全域棚卸し** (内部 sweep mode): 8 次元並列発見 → Synthesis 矛盾統合 → backlog
- **設計生成** (design): project_mode=ui/mixed で seeded design inference (IA / style-guide / wireframe)
- **検証戦略** (verify): L1 PBT / L2 Component / L3 Model-based+Diff / L4 Mutation / L5 Smoke / L6 AI Review
- **検証ループ** (verify-loop): mutation score 向上の期間限定 loop
- **リファクタ policy** (strict-refactoring): 5 profile (domain-strict / ui-pending-object / legacy-touchable / integration-thin / lang-relaxed-go-rust)

## 設計閾値(Oracle 判定)

| 閾値 | 推奨値 |
|---|---|
| mutation_floor | task 65-70% / epic 80% |
| L7 hard gate | 5-7 項目、false positive < 5% |
| auto_ref_site 更新 | 30-45 日 |
| design_drift 粒度 | screen × primary_action |
| loop min/max interval | 15 分 / 72 時間 |

## references/

言語中立・プロジェクト中立な 4 本の技術リファレンス:

- `backend-patterns.md` — バックエンド設計パターン
- `clickhouse-io.md` — ClickHouse 入出力
- `coding-standards.md` — コーディング標準
- `frontend-patterns.md` — フロントエンド設計パターン

## 既存 project の移行

旧 `.sisyphus/` を使っていた project は:

```bash
cd path/to/existing/project
mv .sisyphus .takumi
```

これだけ。中身のファイル構造は 1 対 1 で移行。

## トラブルシューティング

### gh skill install で「unknown command」

gh v2.89 以前。`brew upgrade gh` で v2.90.0+ に更新。

### install 後に `/takumi` が認識されない

Claude Code を再起動。または `gh skill list` で install 状況を確認。

### 自動振り分けが期待と違う

1. 1 問確認に「この解釈で進めて良いですか?」と出る → yes/no で訂正
2. 恒常的な誤分類は `~/.claude/skills/takumi/natural-language.md` の辞書を拡充(project 固有語彙を追加)
3. telemetry で誤分類率を確認: `duckdb -c "SELECT count(*) FROM read_json('.takumi/telemetry/*.jsonl') WHERE event='ambiguous_resolved'"`

### `gh skill publish` で tag already exists

publish は tag を自分で作成する。**pre-existing tag は削除してから**実行:

```bash
git tag -d v0.x.y
git push origin :refs/tags/v0.x.y
gh skill publish --tag v0.x.y
```

## FAQ

### Q. install 時に `takumi takumi` と二重で書くのはなぜ?

前者は repo 名、後者は skill 名。`gh skill install OWNER/REPO SKILL` の gh CLI 文法。skill 名省略(`gh skill install NAM-MAN/takumi`)でも同じ。

### Q. `/takumi` 以外のコマンド(`/plan` 等)は使えない?

v0.2.0 以降、takumi は単一 skill 化された。`/plan` `/probe` `/sweep` 等は削除。全て `/takumi <自然文>` で起動。

### Q. Oracle (gpt-5.4) が無いと動かない?

`codex` CLI がない場合、軍師ロールの敵対的レビューはスキップされる(代わりに opus が代替レビュー)。推奨は `codex` を install すること: https://github.com/openai/codex

### Q. Ruby / Elixir 等 docs に無い言語は?

`strict-refactoring/language-relaxations.md` に汎用ルール(3 分類 / Result 型 / イミュータブル)が適用される。言語固有の緩和は project 側で追加。

### Q. このワークフローは小規模 project でも効く?

初期は `normal` mode だけで十分。probe / sweep は 3-6 か月運用してから有効化推奨。全機能を一度に有効化すると儀式化 drift が起きる(Oracle 警告)。

## 設計経緯

本 skill は 7 ラウンドの Oracle (gpt-5.4) 敵対的レビューを経て設計された:

1. 9 フェーズ案の穴潰し
2. scope reduction (SQLite → YAML、supervisor 軽量化)
3. loop 設計 (event-driven + priority 2 段)
4. first-time-right (後追い loop 疲労の解消)
5. 最終統合版 (条件付き採用)
6. 最小コマンド (2 個に絞り込み → さらに 1 個に)
7. strict-refactoring policy 設計 (profile registry、Tier A-D、actionPreconditions contract)

## 貢献

issue / PR 歓迎。特に:

- 新しい観点語 / 診断動詞の追加 (natural-language.md の辞書)
- 言語別緩和ルールの追加 (language-relaxations.md)
- Synthesis パターン追加 (synthesis-playbook.md)

## ライセンス

MIT
