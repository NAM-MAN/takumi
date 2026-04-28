# バックログ入力モード (takumi 内部参照)

takumi の probe mode / sweep mode から backlog.md が生成された場合、またはユーザー発話で明示された場合に使用。インタビューを省略し、バックログから直接 Wave 計画を生成する。

## 起動条件

以下のいずれかで起動:
- probe mode / sweep mode が triage を終えて backlog.md を確定したあと
- ユーザーが「backlog.md から計画を作って」と指示
- `.takumi/sprints/{日付}/backlog.md` を明示的に指定

## 処理フロー

### 1. backlog.md を読み込む
- 各課題の証拠（file:line）、MECE 分類、ICE スコアを取得
- 反論者チェック通過済みであることを確認

### 2. 依存関係分析
- 同一ファイルを修正する課題 → 同一 Wave にまとめる
- 前提条件がある課題 → 先の Wave に配置
- 独立した課題 → 並列実行可能としてマーク

### 3. Wave 計画生成（インタビューなし）

各課題をタスクに変換:
- **何を**: backlog の証拠 (file:line) + 問題説明から具体的な変更内容を推定
- **なぜ**: backlog の影響説明を引用
- **ロール**: 分類に応じて自動割り当て
  - Bug / Security → 職人 (tdd-workflow)
  - Architecture / DX → 斥候 で調査 → 職人 で実装
  - UX / Accessibility → 職人
- **やらない**: スコープを課題単位に限定
- **検証**: 分類に応じた検証項目を自動設定

**常に自己増殖型**として生成（`self-multiplying.md` のテンプレートを埋め込む）。

### 4. 計画ファイル出力

`.takumi/plans/probe-{日付}.md`

## backlog 入力時の Wave 構成例

```markdown
# Probe {日付}

## 概要
> **やること**: バックログ {N}件の課題を解決
> **成果物**: 修正コード + テスト
> **規模**: 大
> **Wave数**: N+（自己増殖型）

## 自己増殖メカニズム
（self-multiplying.md のテンプレート埋め込み）

## TODOs

### Wave 1: Bug 修正（ICE スコア上位）
- [ ] 1. **{課題B-001のタイトル}** [ICE: {スコア}]
  - **何を**: `{ファイルパス}:{行番号}` — {具体的な変更}
  - **なぜ**: {backlog の影響説明}
  - **ロール**: 職人 (tdd-workflow)
  - **やらない**: この課題の範囲外の変更
  - **検証**: テスト追加 + 既存テスト通過

### Wave 2: UX 改善
- [ ] 2. ...

### Wave 3: 非機能改善
- [ ] 3. ...

### 最終検証
- [ ] F1. 全検証項目の再確認
- [ ] F2. ビルド通過
- [ ] F3. テスト通過
- [ ] F4. 軍師 最終レビュー (tier は env.yaml preference に従う、model も env.yaml `preference.model: auto` で 5.5/5.4 自動選択、詳細は `executor.md` の「軍師 routing」+「GPT-5.5 upgrade path」参照)
  - Tier 2 例 (例示は guaranteed baseline gpt-5.4、Plus user の runtime は gpt-5.5): `codex exec -m gpt-5.4 -s read-only -C "$(pwd)" "git diff main...HEAD の全変更を敵対的にレビューせよ。境界条件・障害パス・競合状態・セキュリティを重点的に" 2>&1 | tail -100`
```

## 通常モードとの使い分け

| | 通常モード | バックログ入力モード |
|---|-----------|-------------------|
| 入力 | ユーザーの要望（曖昧） | backlog.md（構造化済み） |
| インタビュー | 必要 | 不要（証拠+分類が既にある） |
| 斥候 調査 | 必要 | 最小限（file:line で十分） |
| 軍師 分析 | 大規模時に使用 | 不要（反論者チェック済み） |
| 計画の性質 | 通常 or 自己増殖 | 常に自己増殖型 |
