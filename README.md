# 匠 takumi

<p>
  <img alt="version"  src="https://img.shields.io/github/v/tag/NAM-MAN/takumi?label=version&color=E53935" />
  <img alt="license"  src="https://img.shields.io/github/license/NAM-MAN/takumi?color=1E88E5" />
  <img alt="platform" src="https://img.shields.io/badge/platform-Claude%20Code-4A148C" />
  <img alt="style"    src="https://img.shields.io/badge/style-日本語-F4511E" />
</p>

> **Claude Code のスキル。`/takumi` 1 つに、やりたいことをそのまま伝えるだけ。**
> 「ログイン画面にパスワードリセット機能を追加して」と言えば、中身の詰め方・デザイン・実装・テスト・レビューまで全部走ってくれる。

---

## ⚡ 5 分でためす

```bash
# gh CLI v2.90.0+ が必要
gh skill install NAM-MAN/takumi
```

Claude Code を開いて、自分のプロジェクトで:

```
/takumi ログイン画面にパスワードリセット機能を追加して
```

何問か聞かれて答えるだけで、仕様が決まって、計画立てて、実装して、テストして、最後まで走る。

---

## 🎯 こんなときに使う

| やりたいこと | こう書くだけ |
|:---|:---|
| 🆕 新しい機能作りたい | `/takumi <機能> 追加して` |
| 🔄 画面の挙動変えたい | `/takumi 商品一覧にソートとフィルター機能を追加して` |
| 🔐 セキュリティ大丈夫か見たい | `/takumi security 見て` |
| ⚡ 重くない?遅くない? | `/takumi perf 調べて` |
| 📝 リリース前の総点検 | `/takumi リリース前に全般見て` |
| 🧹 コードちょっと汚い、直したい | `/takumi auth 周りをリファクタして` |
| 🧪 テスト弱いから強くしたい | `/takumi 認証のテスト強くして` |
| ⏯ 前回の続きから再開 | `/takumi 続きから` |
| 🛑 ちょっと止めて | `/takumi 止めて` |

> [!TIP]
> **コマンドを覚えなくていい。** `/takumi` の後に好きに書けば、中で判断して振り分けてくれる。

---

## 💡 考え方(4 つ)

<table>
<tr>
<td width="50%" valign="top">

### 1️⃣ 作ってから疑うのをやめる

ふつうはコードを書いてから「テストないな」って追加する。takumi は逆。**何が壊れちゃいけないか**を AC-ID で先に決める。テストの型も自動で選ぶ。ゲートを通らないと次に進めない。

</td>
<td width="50%" valign="top">

### 2️⃣ 覚えるコマンドは 1 つ

`/plan` `/probe` `/sweep` みたいにバラバラ覚えなくていい。中で**これは新機能っぽい、これは診断っぽい**って振り分ける。わかんない時は 1 回だけ聞き返す。

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 3️⃣ ふだんは静か

10 分おきにテストを回し続けて疲れるやつ、やめた。**何か起きたとき**(テスト急落・本番エラー・リリース直前)だけ動く。

</td>
<td width="50%" valign="top">

### 4️⃣ デザインは最初から固める

「Notion っぽく」を繰り返すのやめたい。**参考サイト 1-2 個 + トーン + 製品タイプ + ユーザー像**の 4 つ伝えると色や余白も全部決まる。同じ入力なら同じ結果。

</td>
</tr>
</table>

---

## 📦 インストール

### いるもの

- [Claude Code](https://docs.anthropic.com/claude-code)
- [gh CLI v2.90.0+](https://github.com/cli/cli)
- 🔶 (おすすめ) [codex CLI](https://github.com/openai/codex) — きびしめレビュー(軍師ロール)を動かす

### コマンド

```bash
# 🔍 中身をさきに見てから入れる(セキュリティ的におすすめ)
gh skill preview NAM-MAN/takumi takumi

# 📥 入れる
gh skill install NAM-MAN/takumi

# 🔒 バージョン固定
gh skill install NAM-MAN/takumi takumi --pin v0.2.9

# 🔄 更新 / 🗑 消す
gh skill update takumi
gh skill uninstall takumi
```

> [!NOTE]
> Claude Code を開いて `/takumi` が候補に出れば OK。

---

## 🔧 中で何が起きてるか(6 つのモード)

`/takumi` に自然文を投げると、中で次のどれかに振り分けられる。気にしなくていいけど気になる人向け。

<details>
<summary>📝 <b>normal</b> — 新しいものを作る/変える</summary>

```
/takumi 管理画面に CSV エクスポート機能を追加
```

何問か対話して仕様を固める → AC-ID 自動生成 → (UI なら)デザイン生成 → 計画 → 実装 → テスト → チェック。

</details>

<details>
<summary>🔍 <b>probe</b> — 気になるところを掘る</summary>

```
/takumi security 見て
/takumi perf と a11y 調べて
```

観点ごとに調査役(haiku)を並列で走らせて、問題を ICE 採点して、直す計画まで作る。

</details>

<details>
<summary>🗺 <b>sweep</b> — ぜんぶ見直す</summary>

```
/takumi リリース前に総点検
```

8 つの品質軸を全部並列でスキャン。矛盾する指摘もあるので、両立できる解(統合パターン)を探して backlog にする。

</details>

<details>
<summary>📊 <b>status</b> — 今なに動いてるか</summary>

```
/takumi 今なに動いてる?
```

動いてる処理・チェック結果・止まってる override を 30 秒で教える。

</details>

<details>
<summary>⏯ <b>continue</b> — 中断から戻る</summary>

```
/takumi 続きから
```

前回どこで止まったか覚えてる。

</details>

<details>
<summary>🛑 <b>override</b> — 止める</summary>

```
/takumi 止めて
/takumi auth の loop 止めて
/takumi hard gate を warning に
```

`.takumi/control/` に止めたい内容を書いて、自動処理を一時的にオフ。

</details>

---

## 📁 プロジェクトに何が書かれる?

プロジェクトのルートに `.takumi/` ディレクトリが作られる。**そこにしか書かない**。既存のコードは、あなたが `/takumi` で実装を頼んだ時だけ変わる。

```
.takumi/
├── 📋 plans/{name}.md              ← 計画ファイル
├── 📐 specs/{feature}.md           ← AC-ID (何が守られるべきか)
├── 🎨 design/                      ← sitemap / style-guide / wireframe
├── ⚙  profiles/                    ← verify / design / refactor の設定
├── 📂 sprints/{日付}/               ← probe / sweep の記録
├── 📊 discovery-calibration.jsonl  ← 調査役の精度履歴
├── 📈 telemetry/                   ← 指標の記録
├── 🛑 control/                     ← 止めてる内容
└── 🔁 state.json                   ← 今の状態
```

> [!TIP]
> **`.gitignore` に入れておくとよい**
> ```
> .takumi/sprints/
> .takumi/control/
> .takumi/telemetry/
> ```
> 他(`plans/`, `specs/`, `design/`, `profiles/`, `state.json`)はチームで共有したいので追跡推奨。

---

## 👥 中で働いてる 4 人

| | 名前 | モデル | やってること |
|---|---|---|---|
| 🏗 | **棟梁** (とうりょう) | opus | 全体まとめ・対話・計画づくり |
| 🎯 | **軍師** (ぐんし) | gpt-5.4 (codex exec) | きびしめの最終チェック |
| 🔨 | **職人** (しょくにん) | sonnet (Agent) | 実装する人 |
| 🔍 | **斥候** (せっこう) | haiku (Agent) | 調べる人 |

> [!NOTE]
> codex CLI がないと軍師はお休み。棟梁が代わりに見るけど、精度はちょっと落ちる。

---

## ❓ はじめての人がよく思うこと

<details>
<summary><b>Q1. 入れたら勝手に何か動き出す?</b></summary>

動かない。`/takumi` を自分で呼ぶまで何もしない。自動ループが起動するのも、初めて `/takumi` を使って状態ができてから、条件がそろった時だけ。

</details>

<details>
<summary><b>Q2. 既存のプロジェクトに入れて壊れない?</b></summary>

`.takumi/` の下にしか書き込まない。既存コードを触るのは、あなたが `/takumi 〜追加して` と実装を頼んだ時だけ。心配なら新しいブランチで試してほしい。

</details>

<details>
<summary><b>Q3. 合わなかったら消せる?</b></summary>

消せる。

```bash
gh skill uninstall takumi   # スキル消す
rm -rf .takumi/             # プロジェクトの記録も消す
```

これで元通り。Git には関係しない。

</details>

<details>
<summary><b>Q4. 英語でも使える?</b></summary>

動くけど、日本語のほうが判定が強い。「心配」「調べて」みたいな日本語の言い方を軸に作ってある。英語の例文を増やしたい人は PR 歓迎。

</details>

<details>
<summary><b>Q5. お金どれくらいかかる?</b></summary>

1 回あたりの目安:

| 何するか | だいたい |
|---|---:|
| ちっちゃい機能(1-2 ファイル) | **$0.5 - 2** |
| 中くらい(4-10 ファイル) | **$2 - 10** |
| probe (観点診断) | **$3 - 8** |
| sweep (全域点検) | **$10 - 30** |

いちばん高いのは軍師(codex/gpt-5.4)。使わなければ半額くらい。

</details>

<details>
<summary><b>Q6. Claude Code ないと動く?</b></summary>

動かない。これは Claude Code の skill。

</details>

<details>
<summary><b>Q7. 最初何から試したらいい?</b></summary>

**ちっちゃい機能をひとつ追加**するのが一番はやい。

```
/takumi このプロジェクトに <簡単な機能> を追加して
```

1 回うまくいけば「対話 → 仕様 → 計画 → 実装」の流れが体でわかる。いきなり probe や sweep をやると情報多すぎて疲れる。

</details>

<details>
<summary><b>Q8. takumi takumi って 2 回書くのなんで?</b></summary>

`gh skill install リポジトリ スキル名` という gh CLI の書き方。たまたまリポジトリ名もスキル名も `takumi` だから 2 回出るだけ。省略形 `gh skill install NAM-MAN/takumi` でも OK。

</details>

<details>
<summary><b>Q9. いつも正しく振り分けてくれる?</b></summary>

100% じゃない。あいまいな時は「これは A ですか B ですか?」と 1 回だけ聞き返す。ずっと間違う場合は、`natural-language.md` の辞書を増やせば直る。

</details>

<details>
<summary><b>Q10. 他の Claude Code スキルと喧嘩しない?</b></summary>

しない。takumi は中で全部やるから、他のスキルを呼ばない。`/review` とか `/security-review` とかもそのまま使える。

</details>

---

## 🚨 うまくいかないとき

| 症状 | どうする |
|:---|:---|
| `unknown command` | gh が古い → `brew upgrade gh` で v2.90.0+ に |
| 入れたのに `/takumi` が出ない | Claude Code 再起動 → ダメなら `gh skill list` で確認 |
| 毎回あいまいで聞き返される | `~/.claude/skills/takumi/natural-language.md` に言い回しを追加 |
| `mutation_floor` が通らない | 該当タスクに `mutation_tier: low` を足す |

---

## 📚 もっと詳しく

| | どこ | 何が書いてある |
|---|---|---|
| 🏠 | `~/.claude/skills/takumi/SKILL.md` | 本体(入れた後に見れる) |
| 📖 | `takumi/natural-language.md` | 言い回し辞書 |
| 🔍 | `takumi/probe/` | 気になるところを掘る詳細 |
| 🗺 | `takumi/sweep/` | 全域点検の詳細 |
| 🎨 | `takumi/design/` | デザイン生成の詳細 |
| 🧪 | `takumi/verify/` | テスト戦略 L1-L6 |
| 🧹 | `takumi/strict-refactoring/` | リファクタの 5 profile |

---

## 🤝 手伝ってほしいこと

issue / PR 歓迎:

- 辞書に新しい言い回し追加(`natural-language.md`)
- 言語別のゆるめルール(`language-relaxations.md`)
- 統合パターンの追加(`integration-playbook.md`)

---

## 📄 ライセンス

[MIT](./LICENSE)
