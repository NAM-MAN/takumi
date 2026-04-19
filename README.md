# takumi (匠)

Claude Code の skill。`/takumi` ひとつで、やりたいことをそのまま伝えるだけで済む。「note にお気に入り機能つけて」と言えば、中身の詰め方からデザイン・実装・テスト・レビューまで勝手に走ってくれる。

---

## 5 分でためす

```bash
# gh CLI v2.90.0+ が必要
gh skill install NAM-MAN/takumi

# Claude Code で実行
/takumi note にお気に入り機能つけて
```

何問か聞かれて答えるだけで、仕様が決まって、計画立てて、実装して、テストして、最後まで走る。

---

## こんなときに使う

| やりたいこと | こう書くだけ |
|---|---|
| 新しい機能作りたい | `/takumi <機能> 追加して` |
| 画面の挙動変えたい | `/takumi dashboard の並び順を drag&drop にして` |
| セキュリティ大丈夫か見たい | `/takumi security 見て` |
| 重くない?遅くない?調べたい | `/takumi perf 調べて` |
| リリース前にざっと総点検 | `/takumi リリース前に全般見て` |
| コードちょっと汚いなおしたい | `/takumi auth 周りをリファクタして` |
| テスト弱いから強くしたい | `/takumi 認証のテスト強くして` |
| 前回の続きから再開 | `/takumi 続きから` |
| ちょっと止めて | `/takumi 止めて` |

コマンドを覚えなくていい。`/takumi` の後に好きに書けば、中で判断して振り分けてくれる。

---

## 考え方(4 つだけ)

### 1. 作ってから疑うのをやめる

ふつうはコードを書いてから「テストないな」と追加する流れだが、takumi は逆。まず「何が壊れちゃいけないか」を AC-ID で決めて、テストの型を自動で選んで、そのゲートを通らないと次に進めない。後追いで疲れるより、先に決めておく方が結局ラク。

### 2. 覚えるコマンドは `/takumi` ひとつ

`/plan` `/probe` `/sweep` みたいにバラバラ覚えなくていい。中で「これは新機能追加っぽい」「これは診断っぽい」と振り分ける。わかんない時は 1 回だけ聞き返してくる。

### 3. ループを常時回さない

10 分おきにテストを回し続けて疲れるやつ、やめた。何か起きたとき(テストスコア急落、本番でエラー、リリース直前)だけ動く。ふだんは静か。

### 4. デザインは最初から固める

「Notion っぽく」って何回も言い直すのやめたい。最初に `ref_archetypes`(参考にしたいサイト 1-2 個)と `brand_tone`(堅めとかポップとか)と `product_type`(SaaS ダッシュボードとか)と `target_user`(誰が使うか)を伝えると、色とか余白とか全部決めてくれる。同じ入力なら同じ結果、ブレない。

---

## インストール

### いるもの

- [Claude Code](https://docs.anthropic.com/claude-code)
- [gh CLI v2.90.0+](https://github.com/cli/cli)
- (おすすめ) [codex CLI](https://github.com/openai/codex) — きびしめのレビュー担当(「軍師」ロール)が動く

### コマンド

```bash
# 中身をさきに見てから入れる(セキュリティ的におすすめ)
gh skill preview NAM-MAN/takumi takumi

# 入れる
gh skill install NAM-MAN/takumi

# バージョン固定
gh skill install NAM-MAN/takumi takumi --pin v0.2.4

# 更新 / 消す
gh skill update takumi
gh skill uninstall takumi
```

Claude Code を開いて `/takumi` が候補に出れば OK。

---

## 中で何が起きてるか(6 つのモード)

`/takumi` に自然文を投げると、中で次のどれかに振り分けられる。気にしなくていいけど、気になる人向けに。

### normal — 新しいものを作る/変える

```
/takumi note にお気に入り機能追加
```
何問か対話して仕様を固める → AC-ID 自動で作る → (UI なら)デザイン生成 → 計画 → 実装 → テスト → チェック。

### probe — 気になるところを掘る

```
/takumi security 見て
/takumi perf と a11y 調べて
```
観点ごとに調査役(haiku)を並列で走らせて、問題を ICE 採点して、直す計画まで作る。

### sweep — ぜんぶ見直す

```
/takumi リリース前に総点検
```
8 つの品質軸を全部並列でスキャン。矛盾する指摘もあるので、両立できる解(統合パターン)を探して backlog にする。

### status — 今なに動いてるか知りたい

```
/takumi 今なに動いてる?
```
動いてる処理・チェック結果・止まってる override を 30 秒で教える。

### continue — 中断から戻る

```
/takumi 続きから
```
前回どこで止まったか覚えてるので、そこから再開。

### override — 止めたい

```
/takumi 止めて
/takumi auth の loop 止めて
/takumi hard gate を warning に
```
`.takumi/control/` に止めたい内容を書いて、自動処理を一時的にオフにする。

---

## プロジェクトに何が書かれる?

プロジェクトのルートに `.takumi/` というディレクトリが作られる。そこにしか書かない。既存のコードは、あなたが `/takumi` で実装を頼んだ時だけ変わる。

```
.takumi/
├── plans/{name}.md              # 計画ファイル
├── specs/{feature}.md           # AC-ID(何が守られるべきか)
├── design/                      # sitemap / style-guide / wireframe
├── profiles/                    # verify / design / refactor の設定
├── sprints/{日付}/               # probe / sweep の記録
├── discovery-calibration.jsonl  # 調査役の精度の履歴
├── telemetry/                   # 指標の記録
├── control/                     # 止めてる内容
└── state.json                   # 今の状態
```

`.gitignore` に入れておくとよさそうなもの:

```
.takumi/sprints/
.takumi/control/
.takumi/telemetry/
```

他(`plans/`, `specs/`, `design/`, `profiles/`, `state.json`)はチームで共有したいので追跡するのがおすすめ。

---

## 中で働いてる 4 人

takumi の中で AI が役割分担してる。

| 名前 | モデル | やってること |
|---|---|---|
| 棟梁 (とうりょう) | opus | 全体まとめ・あなたと対話・計画づくり |
| 軍師 (ぐんし) | gpt-5.4 (codex exec) | きびしめの最終チェック |
| 職人 (しょくにん) | sonnet (Agent) | 実装する人 |
| 斥候 (せっこう) | haiku (Agent) | 調べる人 |

codex CLI がないと軍師はお休み。棟梁が代わりに見るけど、精度はちょっと落ちる。

---

## はじめての人がよく思うこと

### Q1. 入れたら勝手に何か動き出す?

動かない。`/takumi` を自分で呼ぶまで何もしない。「ループが自動で起動」みたいなのも、初めて `/takumi` を使って状態ができてから、条件がそろった時だけ。

### Q2. 既存のプロジェクトに入れて壊れない?

`.takumi/` の下にしか書き込まない。既存のコードを触るのは、あなたが `/takumi 〜追加して` と実装を頼んだときだけ。心配なら新しいブランチで試してほしい。

### Q3. 合わなかったら消せる?

消せる。

```bash
gh skill uninstall takumi   # スキル消す
rm -rf .takumi/             # プロジェクトの記録を消す
```

これで元通り。Git には関係しない。

### Q4. 英語でも使える?

動くけど、日本語のほうが判定が強い。「心配」「調べて」みたいな日本語の言い方を軸に作ってある。英語の例文を増やしたい人は PR 歓迎。

### Q5. お金どれくらいかかる?

1 回あたりの目安:
- ちっちゃい機能(1-2 ファイル): $0.5-2
- 中くらい(4-10 ファイル): $2-10
- probe(観点診断): $3-8
- sweep(全域点検): $10-30

いちばん高いのは軍師(codex/gpt-5.4)。使わなければ半額くらい。

### Q6. Claude Code ないと動く?

動かない。これは Claude Code の skill。

### Q7. 最初何から試したらいい?

**ちっちゃい機能をひとつ追加**するのが一番はやい。

```
/takumi このプロジェクトに <簡単な機能> を追加して
```

1 回うまくいけば「対話 → 仕様 → 計画 → 実装」の流れが体でわかる。いきなり probe や sweep をやると情報多すぎて疲れる。

### Q8. `takumi takumi` って 2 回書くのなんで?

`gh skill install リポジトリ スキル名` という gh CLI の書き方。たまたまリポジトリ名もスキル名も `takumi` だから 2 回出るだけ。省略形 `gh skill install NAM-MAN/takumi` でもいい。

### Q9. いつも正しく振り分けてくれる?

100% じゃない。あいまいな時は「これは A ですか B ですか?」と 1 回だけ聞き返す。ずっと間違う場合は、`natural-language.md` の辞書を増やせば直る。

### Q10. 他の Claude Code スキルと喧嘩しない?

しない。takumi は中で全部やるから、他のスキルを呼ばない。`/review` とか `/security-review` とかもそのまま使える。

---

## うまくいかない時

### `gh skill install` で「unknown command」

gh が古い。`brew upgrade gh` で v2.90.0 以上にして。

### 入れたのに `/takumi` が出ない

Claude Code を一度閉じて開き直す。それでもダメなら:

```bash
gh skill list
ls ~/.claude/skills/
```

### 毎回あいまいで聞き返される

辞書に自分のプロジェクトの言葉が足りてない。`~/.claude/skills/takumi/natural-language.md` に例を足すか、issue で相談して。

### ゲートの mutation_floor が高すぎて通らない

最初はよくある。タスクに `mutation_tier: low` って書くと閾値が下がる:

```markdown
- [ ] 1. **タスク名**
  - **mutation_tier**: low
```

---

## 昔の `.sisyphus/` から乗り換え

もし前に `.sisyphus/` を使ってたら:

```bash
cd 自分のプロジェクト
mv .sisyphus .takumi
```

中身はそのまま。リネームだけで動く。

---

## もっと詳しく

- 本体: `~/.claude/skills/takumi/SKILL.md`(入れた後に見れる)
- 辞書: `takumi/natural-language.md`
- 6 mode の中身: `takumi/probe/`, `takumi/sweep/`, `takumi/design/` など
- テスト戦略 (L1-L6): `takumi/verify/`
- リファクタのルール (5 profile): `takumi/strict-refactoring/`

---

## できるまで

takumi は Oracle (gpt-5.4) と 7 回やり合って作った。

1. 9 フェーズ案に穴がないか叩く
2. SQLite を YAML に落として軽くする
3. ループ設計を 2 段にする
4. 「作ってから疑う」をやめる
5. 「採用していい条件」を決める
6. コマンドを 2 つから 1 つに絞る
7. リファクタのルールを 5 profile に整理

気になる人は git log を追うと議論の流れが見える。

---

## 手伝ってほしいこと

issue / PR 歓迎:

- 辞書に新しい言い回し追加(`natural-language.md`)
- 言語別のゆるめルール(`language-relaxations.md`)
- 統合パターンの追加(`integration-playbook.md`)

---

## ライセンス

MIT
