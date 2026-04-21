# probe mode — Phase 0 委譲プロンプトと I/O 契約

`probe/runtime.md` の Phase 0 委譲ガードから参照される、Agent 委譲の**本体プロンプトと I/O 契約**。読むタイミング: Main から Foreman (Agent) へ委譲するときのみ。起動条件の判定は `runtime.md` 側で完結させる。

---

## 1. 委譲の起動条件 (runtime.md の判定済みの前提)

以下のいずれかに当てはまる場合、**必ず Agent に委譲する** (Main では Phase 1 以降を実行しない):

- `/loop` 経由で呼ばれた (直近の会話に `/loop N` で probe mode を起動している気配、または ScheduleWakeup での再発火)
- 指示に画像系キーワードを含む: 「スクリーンショット」「画像」「UI改善」「screenshot」「png」「mockup」「画面」
- Main コンテキスト残量の体感が 60% を下回っている
- `/takumi <観点> 見て` 等で probe mode フルサイクルを走らせる (= 通常ケース)
- `/takumi 続きから` (continue mode) で probe mode を再開する

例外 (Main で直接実行してよい):

- status mode は軽量クエリなので Main で `.takumi/` を読むだけ (委譲不要)

---

## 2. 委譲手順

条件に該当したら、以下の **Agent を 1 本だけ**起動し、その戻り値のみを日本語で要約してユーザーに返す。**Main では以降の Phase を自分で実行しない**。

```
Agent(
  description: "probe <観点> run",
  subagent_type: "general-purpose",
  prompt: """
    Read ~/.claude/skills/takumi/probe/README.md fully and execute
    Phase 0a (初期化) から Phase 5 (完了処理) まで全部。
    Also read CLAUDE.md for project context.

    観点: {ユーザー指定の観点}
    サブコマンド: {/probe <観点> | /probe continue}
    注: この "/probe ..." は takumi の probe mode runtime の内部表記 (擬似コマンド名)。
        人間向けの対外コマンドは /takumi 1 つだけ (runtime.md 冒頭 NOTE 参照)。

    ## I/O 契約 (厳守)
    - 全 artifact は .takumi/sprints/{YYYY-MM-DD}/ 配下に書く
    - 書き込みは *.partial に書いてから完了時に mv で *.final に rename
    - 最終メッセージとして **JSON 1 枚だけ**を返す (1KB 未満、日本語コメント禁止):
      {
        "phase": "discover|triage|plan|exec|paused|done",
        "counts": { "discovered": N, "kept": N, "fixed": N },
        "top3_ids": ["B-001", "B-007", "B-012"],
        "artifact_path": ".takumi/sprints/{日付}/summary.final.md",
        "ledger_seq": N,
        "one_line_verdict": "一行まとめ (日本語 OK)"
      }

    ## 親に返してはいけないもの (絶対禁止)
    - discoveries.md / backlog.md / syntheses.md の本文
    - スクリーンショット / 画像バイナリ / 画像の詳細観察文
    - codex exec の tail 出力
    - 職人 の実装差分
    - Wave 完了レポートの本文
    これらは全て .takumi/ 配下に書くだけに留める。

    ## スクリーンショット / 画像の扱い
    - 画像の Read はこの Agent 内部のみ。親に画像を見せない。
    - 撮影した PNG は .takumi/artifacts/ui/{ts}/*.png に保存。
    - 観察結果は .takumi/sprints/{日付}/ui-obs/{id}.final.md にテキスト化。

    ## コンテキスト上限への対応
    残量 20% 以下なら resume.md を書き、JSON の phase を "paused" にして
    早期終了する。続きは /takumi 続きから (continue mode) で再開できる。
  """,
  run_in_background: false
)
```

Agent が返した JSON を読み、ユーザーに 2-3 行で要約して終了する。**以降の Phase 0a〜5 は Foreman (Agent) の内部手順**であり、Main では実行しない。

---

## 関連リソース

| file | 用途 |
|---|---|
| `runtime.md` (同ディレクトリ) | probe mode runtime 本体、Phase 0 判定条件と Phase 0a-5 の骨格 |
| `discover.md` (同ディレクトリ) | Phase 1 発見フェーズ詳細 |
| `triage.md` (同ディレクトリ) | Phase 2 選別フェーズ詳細 |
