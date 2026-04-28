# plan-template (内部参照)

`SKILL.md` Step 4 から参照される計画ファイルテンプレート。`.takumi/plans/{name}.md` に書き出すときの骨格。

```markdown
# {タイトル}

## 概要
> **やること**: 一行説明
> **成果物**: 箇条書き
> **規模**: 小 | 中 | 大
> **Wave数**: N (自己増殖型は "N+(自己増殖型)")

## 自己増殖メカニズム (自己増殖型のみ)
(self-multiplying.md のテンプレートを埋め込む)

## 背景
### リクエスト
### 調査結果 (斥候 / 軍師)

## スコープ
### 完了条件
### やらないこと

## TODOs

### Wave 1: {基盤}

- [ ] 1. **タスク名**
  - **ac_ids**: [AC-AUTH-002, AC-AUTH-003]
  - **verify_profile_ref** / **design_profile_ref** / **mutation_tier**: state-transition / dashboard-dense / standard
  - **refactor_profile_ref** / **strictness** / **ui_state_model_tier**: ui-pending-object / L1+L2+L3 / B  # 詳細は各 skill 参照
  - **何を**: ファイルパス、行番号、変更内容
  - **なぜ**: 動機
  - **ロール**: 職人 | 軍師 | 斥候
  - **やらない**: ガードレール
  - **検証**: 具体的な確認手順 + mutation_floor 通過 + L7 hard gate 通過 + strict-refactoring checklist 通過

### Wave 2: {本体}

- [ ] 2. ...

### 最終検証

- [ ] F1. 全検証項目の再確認
- [ ] F2. ビルド通過
- [ ] F3. テスト通過
- [ ] F4. 軍師 最終レビュー
  - `.takumi/profiles/env.yaml` の preference.tier (copilot / codex / opus-max) + preference.model (auto / gpt-5.5 / gpt-5.4) で tier × model を決定。Tier 2 (codex) の例 (guaranteed baseline gpt-5.4、Plus user の auto 時 runtime は gpt-5.5):
  - `codex exec -m gpt-5.4 -s read-only -C "$(pwd)" "git diff main...HEAD の全変更を敵対的にレビューせよ。境界条件・障害パス・競合状態・セキュリティを重点的に" 2>&1 | tail -100`
  - 他 tier の exact 構文と GPT-5.5 upgrade path は `executor.md` の「軍師 routing」+「GPT-5.5 upgrade path」節参照
```

## ルール

1. 全タスクにファイルパス参照
2. 全タスクに具体的な検証項目
3. 全タスクにロール指定 (職人 / 軍師 / 斥候)
4. Wave N+1 は Wave N に依存

## 軍師 計画レビュー (自動・生成直後)

計画ファイル生成直後、軍師 に自動でレビューを依頼。`.takumi/profiles/env.yaml` の `preference` に応じて tier を選択:

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、Plus user / Pro+ user の runtime は gpt-5.5 (詳細: executor.md「GPT-5.5 upgrade path」)。 -->
```bash
# Tier 2 (codex exec、ChatGPT Plus) の例
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  ".takumi/plans/{name}.md を読み、前提の誤り・スコープの漏れ・Wave依存の矛盾・リスクを指摘せよ" 2>&1 | tail -100

# Tier 1 (copilot、Copilot Pro / Pro+) の例
# copilot -p "..." --model gpt-5.4 --cwd "$(pwd)" --available-tools="view,grep,glob,web_fetch" --silent
```

各 tier の詳細呼出パターンは `executor.md` 「軍師 routing (3-tier + quota rotation)」参照。

- 指摘あり → 計画ファイルに反映してから提示
- 指摘なし → そのまま提示
