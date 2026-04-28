# Reconciliation（sweep skill 内部参照、Phase 2 詳細）

Phase 2 の全ステップの詳細手順。`integration-playbook.md` と併用。

## Step 2a — Merge + Dedup

全次元の発見を1ファイルに統合。重複判定:
- 同一ファイル・同一問題 → 統合（「{N}次元が指摘」と記録）
- 同一根本原因 → 統合、個別証拠は保持

## Step 2b — Conflict Detection

統合リスト内で矛盾ペアを検出:

```
矛盾の定義:
  同一ファイル or 同一コンポーネントに対して、
  異なる次元から**逆方向**の変更を提案している

矛盾タイプ: add-vs-remove | simplify-vs-enrich | split-vs-merge |
            eager-vs-lazy | strict-vs-lenient
```

矛盾ペアを `.takumi/sprints/{日付}/conflicts.md` に書き出す。

## Step 2c — 統合（核心）

同ディレクトリの `integration-playbook.md` を読み、パターンを取得。

各矛盾ペアに対して:

1. **意図抽出**: 両方の「手段」ではなく「目的」を特定
2. **Playbook照合**: 矛盾タイプで一致パターンを探す
3. **統合生成**: パターン適用 or 新案創造

出力フォーマット（各 統合）:

```markdown
### INTEGRATION-NNN: {タイトル}
**矛盾**: {D?} [B-NNN] vs {D?} [B-NNN]
**意図A**: {目的}
**意図B**: {目的}
**統合解決**: {1行説明}
**実装**: {ファイルと方針}
**充足**: {次元A}=✅{理由}、{次元B}=✅{理由}
**副次効果**: {あれば}
**Playbookパターン**: {P-NNN or 新規}
```

## Step 2d — 軍師 検証

全 統合 をバッチで 軍師 (GPT-5.x) に送り検証:

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、Plus user の runtime は gpt-5.5 (詳細: `~/skills/takumi/executor.md`「GPT-5.5 upgrade path」)。 -->
```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  "以下の統合提案を検証せよ。各提案について:
1. 真の統合か？（両次元を100%満たすか、片方が犠牲になっていないか）
2. 実装可能か？
3. 第3の次元を犠牲にしていないか？
4. より良い統合はないか？

判定: ✅真の統合 | ⚠️偽の統合（理由）| 💡改善案あり

$(cat .takumi/sprints/{日付}/syntheses.md)" 2>&1 | tail -200
```

- ✅ → 採用
- ⚠️ → 棟梁 が再生成（最大2回）
- 💡 → 軍師 の改善案を採用

## Step 2e — Coherence Verification

解決済みリストの全タスクペアをチェック:
- 同一ファイルを変更するタスク間で、一方が他方の前提を壊さないか
- 違反発見 → Step 2c に差し戻し

結果を `.takumi/sprints/{日付}/resolved-backlog.md` に書き出す。

## Step 2f — Playbook 進化

新規 統合パターンが生まれた場合:
- 同ディレクトリの `integration-playbook.md` にパターンを追記
- 矛盾タイプ・適用条件・充足証明を記録
