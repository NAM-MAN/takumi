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
  - `.takumi/profiles/env.yaml` の preference.tier (copilot / codex / opus-max) + preference.model (auto / gpt-5.5 / gpt-5.4) で tier × model を決定。Tier 2 (codex、5.5 default、hardening v2) の例 (1 行目のみ示す、prompt は stdin heredoc):
  - `timeout 600s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - <<'PROMPT' 2>&1 | tail -100`
  - heredoc 本文: "git diff main...HEAD の全変更を敵対的にレビューせよ。境界条件・障害パス・競合状態・セキュリティを重点的に。出力 1.5KB 以内。" → `PROMPT`
  - 他 tier の exact 構文と GPT-5.5 upgrade path / hang fallback は `executor.md` の「軍師 routing」+「GPT-5.5 upgrade path」+「invocation hardening v2」節参照
```

## ルール

1. 全タスクにファイルパス参照
2. 全タスクに具体的な検証項目
3. 全タスクにロール指定 (職人 / 軍師 / 斥候)
4. Wave N+1 は Wave N に依存

## 軍師 計画レビュー (自動・生成直後)

計画ファイル生成直後、軍師 に自動でレビューを依頼。`.takumi/profiles/env.yaml` の `preference` に応じて tier を選択:

<!-- hardening v2 (2026-05-03): stdin heredoc / `timeout 600s` / 5.5 default / prompt 1.5KB 上限。
  ファイル参照は呼出側で本文を埋込み、codex に「読め」命令で hang trigger を引かない。
  hang/4xx → subagent (Sonnet via Agent tool) Tier 2 fallback (詳細: executor.md「invocation hardening v2」)。 -->
```bash
# Tier 2 (codex exec、ChatGPT Plus、hardening v2) の例
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
以下の plan の前提の誤り・スコープの漏れ・Wave 依存の矛盾・リスクを指摘せよ。
出力 1.5KB 以内、診断と修正案のみ。

## plan 本文
$(cat .takumi/plans/{name}.md)
EOF
timeout 600s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - < "$PROMPT_FILE" 2>&1 | tail -100

# Tier 1 (copilot、Copilot Pro / Pro+) の例 (default fallback chain から除外、user override 時のみ — executor.md「軍師 routing」節参照)
# copilot -p "..." --model gpt-5.5 --cwd "$(pwd)" --available-tools="view,grep,glob,web_fetch" --silent
```

各 tier の詳細呼出パターンは `executor.md` 「軍師 routing (3-tier + quota rotation)」参照。

- 指摘あり → 計画ファイルに反映してから提示
- 指摘なし → そのまま提示
