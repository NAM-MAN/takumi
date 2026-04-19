# takumi

Claude Code で、1 つのコマンドに全部を任せるためのスキル。

```
/takumi 管理画面に CSV エクスポート機能を追加
```

数問で仕様を固めて、計画を立て、実装・テスト・レビューまで通す。観点を指定した診断 (`/takumi security 見て`) や、リリース前の全域点検 (`/takumi 全般見て`) も同じ `/takumi` で呼び出す。振る舞いを変えたいときは「止めて」「続きから」と言えばいい。

## 使い方

とにかく `/takumi` に自然文を投げる。内部で 6 つのモードに振り分けて、迷うときは 1 回だけ聞き返す。

- 新機能・変更 — `/takumi 商品一覧にソートとフィルターを追加`
- 観点指定の診断 — `/takumi security 見て`
- 全域点検 — `/takumi リリース前に全般見て`
- 状態確認 — `/takumi 今なに動いてる?`
- 中断からの再開 — `/takumi 続きから`
- 一時停止 — `/takumi 止めて` / `/takumi auth の loop 止めて`

新機能を追加する流れはだいたいこうなる。最初に数問で前提を固める(対象リソース、認可、想定件数、画面の有無など)。次に AC-ID を列挙して確認を取り、計画を `.takumi/plans/` に書き出す。UI を含むなら sitemap と style-guide と wireframe も生成する。あとは Wave ごとに実装して、mutation score と layout invariant のゲートを通す。通らなければ最大 3 回リトライ、それでもダメなタスクは記録してスキップする。

## インストール

gh CLI v2.90.0+ が要る。

```bash
gh skill install NAM-MAN/takumi
```

中身を先に読むなら `gh skill preview NAM-MAN/takumi takumi`、消すなら `gh skill uninstall takumi`。Claude Code を開いて `/takumi` が補完候補に出れば動く。

## 設計

takumi が避けたかったことは 3 つある。

**コマンドの分裂。** `/plan` `/probe` `/sweep` `/exec` を使い分けるのは不自然で、分類は中でやればいい。`/takumi` はそれらを統合した入口で、意図分類は決定木で決める。

**後付けテスト。** 実装してから「テストないな」と書き足すのは順番が逆で、仕様を AC-ID で先に固定し、ゲートを通らなければ次の Wave に進ませない。mutation score は 65-80% の幅、layout invariant は 5-7 項目に抑える。

**うるさい監視。** 10 分おきにテストを回し続けるループは疲れるし、何も起きていないときに動く意味はない。mutation の急落、本番障害、リリースブロッカーのいずれかがあるときだけ動く。

あと、デザインは seeded にしている。参考サイト 1-2 個、ブランドトーン、プロダクトの種類、想定ユーザーの 4 つを渡せば、色と余白と間は決まる。「Notion っぽく」で揺れるのはやめたかった。

## プロジェクトに書かれるもの

`.takumi/` 配下だけに書く。既存コードは `/takumi` で実装を頼んだときだけ触る。

```
.takumi/
  plans/                        計画
  specs/                        AC-ID
  design/                       sitemap / style-guide / wireframe
  profiles/                     verify / design / refactor の設定
  sprints/                      probe / sweep の実行記録
  telemetry/                    指標
  control/                      一時停止
  state.json                    現在のモードと run id
  discovery-calibration.jsonl   発見者精度の履歴
```

`.gitignore` に推奨するのは `sprints/` `control/` `telemetry/`。残りはチームで共有したほうがいい。

## 制限

Claude Code が要る。素の API では動かない。
意図分類は日本語に最適化している。英語でも動くけれど、観点語と診断動詞のマッチは弱い。
軍師ロール(敵対的レビュー)は codex CLI (gpt-5.4) を使う。無ければ opus が代替するが精度は落ちる。
コストは 1 request $0.5〜30 の幅で、大半は codex exec。
振り分けをずっと間違えるときは、`natural-language.md` の辞書を増やす。

## 貢献

以下は特に歓迎。

- `natural-language.md` — 観点語・診断動詞の追加
- `integration-playbook.md` — 矛盾解決パターン
- `strict-refactoring/language-relaxations.md` — 言語別ルール

## ライセンス

MIT
