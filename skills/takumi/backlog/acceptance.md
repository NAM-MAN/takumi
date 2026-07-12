# Backlog AC trace table (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。AC-BLK-001 〜 013 を spec / fixture / hook 実装に紐付ける覆盖 (coverage) 表。AC が新規追加された時はここに 1 行追加し、対応 spec ファイル / fixture / hook の 3 箇所を埋める。

> [!TIP]
> 本表は契約スパイン (`../contract/contract-spine.md`) の **AC trace / DerivationMap の reference instance** でもある。`AC-ID → covered_by (spec/fixture/hook)` の 3 点埋めが ConsistencyMatrix M8 (AC ↔ test layer ↔ fixture ↔ assertion 粒度) の実証例。新 surface の `.takumi/specs/{surface}.md` でも同じ trace 構造を使う。

## AC trace table

| AC-ID | risk | 説明 | spec file | fixture | hook 実装 |
|---|---|---|---|---|---|
| AC-BLK-001 | normal | `.takumi/backlog/{open,doing,done}/` schema 定義 + bootstrap 可能 | `backlog/schema-frontmatter.md`, `step0-bootstrap.md` "project.yaml.backlog セクション" | `backlog/bootstrap.md` "失敗時の挙動" 4 ケース | `step0-bootstrap.md` の bash snippet 5 step |
| AC-BLK-002 | normal | frontmatter 必須 4 + 任意 7 fields | `backlog/schema-frontmatter.md` | sample 2 本 (minimal / full) + バリデーション 7 条件 | 起票時の frontmatter 生成 (`backlog/ai-move-sync.md` の発話 → move マッピング) |
| AC-BLK-003 | critical | `project.yaml.backlog.mode` で unset/enabled/external/deferred の 4 状態管理、遷移ルール定義 | `backlog/schema-project-yaml.md`, `SKILL.md` Step 0e | 状態遷移 4 × 5 table + 優先順位 4 段 | `BacklogGate.resolveMode()` 擬似コード (`backlog/schema-project-yaml.md`) |
| AC-BLK-004 | critical | 起票機会以外では提案を出さない | `backlog/offer-policy.md` | 6 シナリオ (`backlog/offer-policy.md` fixture) | `probe/triage.md` / `sweep/runtime.md` / `self-multiplying.md` / `sprint-mode.md` / `natural-language.md` の 5 hook |
| AC-BLK-005 | critical | `mode == external` で完全 silent (user-facing + telemetry 両方ゼロ) | `backlog/schema-project-yaml.md` "external 完全 silent 契約" + `backlog/offer-policy.md` "silent 契約" | `backlog/offer-policy.md` fixture 2 (expected emit 0 + telemetry 0) + `backlog/ai-move-sync.md` fixture 5 | BacklogGate.resolveMode() + OfferPolicy + sync check の external skip (全 early return) |
| AC-BLK-006 | normal | `mode == deferred` で 30 日 cooldown、期限切れで raw YAML 自動 normalize | `backlog/schema-project-yaml.md` "deferred 期限切れの扱い" | `backlog/offer-policy.md` fixture 3 (期限内) + 4 (期限切れ) | BacklogGate.resolveMode() の deferred normalize (raw YAML write) |
| AC-BLK-007 | normal | 自動判定 3 signal で誤検出ゼロ | `backlog/auto-detect.md` | 4 fixture (空 / `.linear/` / CLAUDE.md / 全 signal) | `hasExternalMarker()` + Signal A/B/C 検出 (`backlog/auto-detect.md`) |
| AC-BLK-008 | normal | 移行サポート copy-only + dry-run + manifest + 明示承認 | `backlog/migration.md` | 3 択 (全部 / 選んで / skip) の各動作 + md5sum 検証 | migration scan + import (`fresh_bootstrap` 経由起動、`step0-bootstrap.md` step 5) |
| AC-BLK-009 | normal | AI 移動 (発話) + sync check (`gh pr view`) best-effort | `backlog/ai-move-sync.md` | 7 シナリオ (`backlog/ai-move-sync.md` fixture) | 発話 → move (natural-language.md "移動" table) + sync check 擬似コード |
| AC-BLK-010 | normal | 発話辞書が `natural-language.md` に統合 | `natural-language.md` "backlog 操作" | 各発話パターン (起票 / 状態確認 / 移動 / mode 切替 / 移行) が意図分類ルータで振り分け | `natural-language.md` の発話 table 4 グループ 15+ パターン |
| AC-BLK-011 | normal | `.gitignore` で `.takumi/` 維持 + `!.takumi/backlog/` 例外行を bootstrap 時に追加 (親 `!.takumi/` も保証) | `step0-bootstrap.md` "チーム運用で個別 unignore する場合" + bootstrap step 3 | `git check-ignore .takumi/backlog/open/sample.md` が non-match | bootstrap step 3 の grep + printf |
| AC-BLK-012 | critical | 全 backlog entrypoint で `BacklogGate.resolveMode()` 経由必須 | `SKILL.md` Step 0e + `backlog-mode.md` (BacklogGate 経由必須宣言) | 全 entrypoint で `BacklogGate` を grep で確認 (drift 検出) | 全 hook ファイル (probe/triage / sweep/runtime / self-multiplying / sprint-mode / natural-language) で BacklogGate 記述 |
| AC-BLK-013 | critical | 全提案 hook が `OfferPolicy.shouldOffer()` 経由 (session + project scope) | `SKILL.md` Step 0e + `backlog/offer-policy.md` | `backlog/offer-policy.md` fixture 6 シナリオ | 5 hook (probe_triage / sweep_complete / discovered_3plus / user_utterance / sprint_bl_refs) 全部 OfferPolicy 経由 |

## drift 監査手順

新規 AC 追加 / 既存 hook 変更時に以下を実行:

```bash
# 1. AC-BLK-* が全 spec に grep で出現するか確認 (missing なら本 table 行を作る)
grep -rE '\bAC-BLK-0(0[1-9]|1[0-3])\b' skills/takumi/backlog/ skills/takumi/SKILL.md | sort -u

# 2. 全 hook ファイルで BacklogGate / OfferPolicy 経由が宣言されているか
for f in probe/triage.md sweep/runtime.md self-multiplying.md sprint-mode.md natural-language.md; do
  grep -lE 'BacklogGate|OfferPolicy' "skills/takumi/$f" || echo "DRIFT: $f に BacklogGate/OfferPolicy 参照なし"
done

# 3. external silent 違反パスの grep (actual emit を検出、禁止条項の説明文は除外)
#    禁止条項を記述する文 (「存在しない」「禁止」「emit しない」等) を含む行は false positive
grep -rE "emit_telemetry\(['\"]backlog_(offer|sync)_suppressed['\"][^)]*['\"]mode_external['\"]" \
  --include='*.md' skills/takumi/ \
  | grep -v acceptance.md \
  && echo "DRIFT: external silent 違反"
```

3 つ全てが clean (出力ゼロ / DRIFT なし) であれば AC coverage は健全。
