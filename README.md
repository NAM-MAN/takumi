# takumi

自然文の依頼を、仕様定義から実装と検証まで一つの流れに落とす Claude Code skill。
コマンドを増やさない。先に仕様を固定する。普段は黙っていて、必要なときだけ深く入る。
変更の痕跡は `.takumi/` に閉じる。

```
/takumi 管理画面に CSV エクスポート機能を追加
```

## Why

- コマンド分裂をやめる。`/takumi` 1 つで計画・診断・全域点検・再開・停止まで通す。
- 後付けテストをやめる。AC-ID を先に定義し、mutation score と layout invariant のゲートを通らないと次へ進めない。
- 常時監視のうるささをやめる。loop は mutation 急落・本番障害・リリースブロッカーのときだけ起動する。
- デザインは seeded inference に落とす。参考サイト 1-2 個、brand_tone、product_type、target_user の 4 点で token を固定する。

## Install

```bash
# 必要: gh CLI v2.90.0+
gh skill install NAM-MAN/takumi

# 内容確認 (入れる前に)
gh skill preview NAM-MAN/takumi takumi

# アンインストール
gh skill uninstall takumi
```

Claude Code を開いて `/takumi` が補完候補に出れば動いている。

## One Request

```
/takumi 管理画面に CSV エクスポート機能を追加
```

数問で前提を確定する(対象リソース、列、認可、想定件数、ファイル名など)。
AC-ID を列挙して確認を取り、計画ファイルを `.takumi/plans/` に書き出す。
UI を含む project なら sitemap / style-guide / wireframe を `.takumi/design/` に生成する。
executor が Wave 順に実装し、各 Wave の終わりで mutation floor と layout invariant を評価する。
ゲート不合格なら自動でリトライ、3 回失敗したタスクは記録してスキップする。
完了時に `git diff --stat` をまとめて提示する。

## Operational Model

自然文は内部で 6 系統に落とす。曖昧なら 1 回だけ聞き返す。

- `normal` — 新機能・変更。対話 → AC → 計画 → 実装 → ゲート。
- `probe` — 観点指定の診断。発見者を並列起動、ICE 採点、backlog から修正計画。
- `sweep` — 全域点検。8 品質次元を並列スキャン、矛盾する指摘を統合パターンで解決。
- `status` — 進行中の処理、直近のゲート、停止中 override を表示。
- `continue` — 前回の mode と `active_run_id` を復元。
- `override` — `.takumi/control/` に pause を書く。loop / sweep / gate を個別に止められる。

## Files

takumi が書き込むのは `.takumi/` 配下だけ。既存コードは、明示的に実装を依頼したときだけ変わる。

```
.takumi/
  plans/                        計画ファイル
  specs/                        AC-ID
  design/                       sitemap / style-guide / wireframe
  profiles/                     verify / design / refactor の設定
  sprints/                      probe / sweep の実行記録
  telemetry/                    指標
  control/                      一時 override
  state.json                    現在の mode と run_id
  discovery-calibration.jsonl   発見者精度の履歴
```

`.gitignore` に推奨するのは `sprints/`, `control/`, `telemetry/`。
残りはチームで共有する価値がある。

## Limits

- Claude Code が必要。素の Claude API では動かない。
- 意図分類辞書は日本語に最適化している。英語でも動くが、観点語と診断動詞のマッチ精度は下がる。
- 軍師ロールに codex CLI (gpt-5.4) を推奨。無ければ opus が代替するが、敵対的レビューは弱くなる。
- コストは 1 request あたり $0.5-30 の幅。内訳の大部分は codex exec。
- 自動振り分けは決定木で動く。ずっと間違う場合は `natural-language.md` の辞書を更新する。

## Contributing

issue / PR 歓迎。優先度が高い寄与:

- `natural-language.md` — 観点語と診断動詞の辞書追加
- `integration-playbook.md` — 矛盾解決パターンの追加
- `strict-refactoring/language-relaxations.md` — 言語別の緩和ルール

## License

MIT
