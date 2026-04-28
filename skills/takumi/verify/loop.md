# Verify Loop — 各レイヤーで mutation score 80% を順に埋めていくループ

`/loop 10m /verify-loop` のように呼び出す**継続テスト拡充サブスキル**。
同じ観点を繰り返さず、A → B → C → D → E の作業層を順に mutation score 80% まで引き上げ、
survived mutant 分析 → property test 追加 → 実装バグ修正を毎 tick で回す。

使い方:
- `/verify-loop` 単独 — 現在の layer / 対象ファイルから 1 tick 進める
- `/verify-loop continue` — paused 状態から再開
- `/verify-loop status` — state.json の要約を表示
- `/loop 10m /verify-loop` — 10 分間隔で自動 tick

## 根拠

- `coverage 80%` は実行済みでしかなく、テストの鋭さを測るには **mutation score** が必要 (`mutation.md`)
- 人間が観点を選ぶと同じ箇所を何度も触る → AI でも同じ失敗をする
- レイヤー順 rotation + tabu (直近観点) + file 単位集中で収束する

## 5 作業層 (軍師 確定)

mutation 昇格に向いた粒度で切った。`verify/SKILL.md` の L1-L6 (テスト層) とは**別軸** —
こちらは本番コードの配置に基づく「どのファイル群の score を次に上げるか」。

| Layer | 対象 glob | 典型ファイル数 | テスト形式 |
|-------|----------|---------------|-----------|
| **A 純粋ロジック** | `src/lib/**/*.ts` (`*.test.*` 除外), `src/features/*/utils/**/*.ts` | 50-100 | L1 PBT + L4 Mutation |
| **B 状態** | `src/features/*/store/**/*.ts`, `src/features/*/hooks/**/use-*.ts` の reducer/selector | 15-30 | L3 Model-based + L4 |
| **C 永続化境界** | `src/features/*/actions/**-repository.ts`, `src/lib/db/**/*.ts` | 30-60 | L3 Differential / in-memory DB + L4 |
| **D API 入口** | `src/app/api/**/route.ts` | 80+ | L3 request/response + L4 |
| **E UI component** | `src/features/*/components/**/*.tsx` | 50+ | L2 Component Test + L4 |

### 進行順の理由

A → E の順は **mutant の kill 難度の低い順**。
A は入力/出力が明確で PBT が刺さる → 短時間で 80% 到達 → 自信を積んで B へ。
E は DOM と非同期があり最難関 → 最後に回す (strict-refactoring が進んでいれば B で state machine が育っているので E の責務が薄くなっている)。

## 状態ファイル `.takumi/verify-loop/state.json`

```json
{
  "status": "in_progress | paused | completed | watch",
  "started_at": "ISO-8601",
  "current_layer": "A",
  "layer_order": ["A","B","C","D","E"],
  "layers": {
    "A": {
      "status": "in_progress | done",
      "files": [
        {
          "path": "src/lib/<module>/<target>.ts",
          "status": "pending | active | graduated",
          "best_score": 0,
          "last_score": 0,
          "last_tick_at": "ISO-8601",
          "tick_count": 0,
          "survivors_hash": "sha1 of sorted survivor ids",
          "rolling_avg": 0
        }
      ],
      "score_goal": 80,
      "rolling_threshold_files": 5
    }
    // ... B-E に同じ shape
  },
  "tabu_patterns": [
    { "pattern": "empty_array", "expires_tick": 123 },
    { "pattern": "null_boundary", "expires_tick": 124 }
  ],
  "tick_counter": 0,
  "history": [
    { "tick": 1, "file": "...", "before": 34, "after": 62, "action": "added PBT for X/Y/Z" }
  ]
}
```

- **current_layer**: 今 tick で触る layer
- **files[i].status**:
  - `pending`: 未着手
  - `active`: 1 回以上 tick を回したが 80% 未満
  - `graduated`: 80% 到達 (以降は score 低下 or 差分検出で `active` に戻る可能性)
- **rolling_threshold_files**: 「直近 N ファイルの平均が 80% 以上」で layer graduation
- **tabu_patterns**: 直近 2-3 tick で使った発見観点。新 tick では別観点から着手 (finder rotation)

## Phase 0: ガード (loop 呼び出し時に必ず実行)

### 0a. 実行状態 (state.json) 競合回避
```
.takumi/state.json.status === "in_progress" AND active_plan !== "verify-loop"
 → 「他のスキルが実行中。スキップ」と報告して即終了
```

### 0b. state.json 初期化または読み込み
無ければ `seed-verify-loop-state.md` (別ファイル、下記) で作る。
あれば読む。`status === 'completed'` なら **watch モード**へ (Phase 5 参照)。

### 0c. Agent 委譲 (必須)
sweep/probe と同じ理由。tick 内の stryker 実行と分析で context を大量消費するため。
```
Agent(
  description: "verify-loop tick",
  subagent_type: "general-purpose",
  prompt: """
    Read ~/.claude/skills/takumi/verify/loop.md fully and execute Phase 1-4.
    Read CLAUDE.md for project context.
    Read .takumi/verify-loop/state.json for current state.

    I/O 契約:
    - stryker report は .takumi/verify-loop/reports/{tick}/{safe_path}.json に保存
    - state.json の更新は *.partial → rename *.final (atomic)
    - 最終メッセージは JSON 1 枚のみ:
      {
        "tick": N,
        "layer": "A",
        "file": "src/lib/...",
        "before_score": N,
        "after_score": N,
        "action_taken": "added PBT | fixed bug | skipped | graduated layer A",
        "next_layer": "A" | "B",
        "one_line_verdict": "..."
      }
    親に返してはいけないもの: stryker html 本文、職人 の diff、長い観点列挙
  """
)
```

## Phase 1: 対象ファイル選択

1. `current_layer` の `files[]` から次の対象を決める:
   - `active` かつ `last_score < 80` かつ **tabu_patterns と被っていない** ファイルを best_score 昇順
   - なければ `pending` から先頭
   - なければ → layer graduation 判定 (Phase 4)
   - **Skip files where `guarded === true`** (they're excluded from mutation-score targeting). Guarded files are considered effectively graduated for layer promotion purposes (count toward `rolling_threshold_files` if `guarded || graduated`).
2. 選んだ file を `active` に昇格

## Phase 2: Stryker incremental tick

```bash
pnpm stryker run --incremental --mutate <selected_file>
```

タイムアウト: 5 分。incremental cache が効かない fresh run なら 3-5 分、キャッシュ HIT なら 30-60 秒。

- 結果から survived mutant を抽出 (上位 3-5 件)
- survived の `mutatorName` (ArithmeticOperator / ConditionalExpression / BlockStatement...) を observe
- `survivors_hash = sha1(sort(survivors.map(m => m.id)).join)` で前回との差分を検出:
  - 同じ hash = 「変化なし。同観点で追加投入しても無駄」→ **Phase 3 で別観点を選ぶ** (tabu に追加)
  - 違う hash = 前回追加したテストが kill した → 進捗あり

## Phase 3: 分析 → テスト追加 → バグ修正

観点を rotation するために **finder** を 1 つ選ぶ (tabu 以外から):

| finder | 対象 mutant | アクション例 |
|--------|------------|------------|
| arithmetic_boundary | +/-/*/%/== 反転 | 境界値 PBT (0/負数/overflow) |
| conditional_collapse | if body 除去 | true/false 両分岐の assertion |
| empty_array | filter/map 空列 | fc.array() で length=0 投入 |
| null_boundary | null/undefined | optional 引数の両パターン |
| string_literal | "" / "Stryker" | spec の文字列不変条件 |
| object_literal | {} | 必須 property 存在 assert |
| array_mutation | push/splice 削除 | 状態不変性 PBT |
| http_status | 200/400/500 反転 | response.status 厳密比較 |
| ui_event | onClick 除去 | user-event 起動 assertion |

選んだ finder を **tabu_patterns に追加** (expires_tick = 現 tick + 3)。

職人 タスク (Agent 内):
1. survived mutant の source 位置を読み、**テストで検出すべき挙動**を特定
2. 該当 test ファイル (`__tests__/{file}.test.ts`) に property test を 1-3 本追加
3. テスト実行 → survived mutant が kill されるか確認
4. kill されなければ、または mutant が **仕様違反の出力を示す**場合: **バグ確定扱いで即修正**
   - 軍師 (codex exec、GPT-5.x; 例示は baseline gpt-5.4、env.yaml auto で Plus user は gpt-5.5、詳細: `executor.md`「GPT-5.5 upgrade path」) に 400 字以内で相談: (a) 修正方針 (b) 既存テストへの影響 (c) 他の類似箇所波及
   - 軍師 確定案を適用 → テスト更新 (filter 削除、回帰テスト追加) → 全スイート通過確認
   - `discovered-*.md` に残さない (テスト品質が下がるだけ)
   - 例外: セキュリティクリティカル or 大規模リファクタ必要な場合のみ draft に落として人間レビュー

## Phase 4: state.json 更新と遷移判定

1. 選んだ file の `last_score`, `best_score = max(best, last)`, `last_tick_at`, `tick_count++`
2. `last_score >= 80` なら `status = 'graduated'`
3. Layer graduation 条件:
   - layer 内 files が全員 `graduated` OR
   - layer 内 graduated ファイル数 >= `rolling_threshold_files` かつ **graduated ファイルの last_score 平均 >= 80**
4. 満たせば `current_layer` を `layer_order` の次へ進める
5. 最後の layer まで終わっていたら `status = 'completed'`

## Phase 5: watch モード (収束後)

`status === 'completed'` になったら、以降の tick は:

1. `git log --since="last_tick_at" --name-only` で **変更ファイル**を列挙
2. state.json の files と突き合わせ、変更あったファイルの score を再測定
3. score 低下 (前回比 -5pt 以上) または `graduated → active` にする
4. 通常 tick (Phase 1-4) と同じ処理を当該ファイルで実施
5. 何も変わっていなければ「変化なし、watch 継続」と返して終了

**When counting graduated files for layer promotion, treat `guarded === true` files as graduated-equivalent.** (i.e. a file that is `guarded === true` counts the same as `graduated` for layer-graduation judgement in Phase 4 and for watch-mode re-measurement skipping here; guarded files are never picked in Phase 1 and never re-measured.)

## Phase 6: コンテキスト保護と resume

Agent 内のコンテキスト残量が 20% を切ったら:
1. `state.json` を最新化して保存
2. `.takumi/verify-loop/resume.md` に「次 tick は layer X file Y から」を書く
3. JSON 応答で `"status": "paused"` を返す

Main は `/verify-loop continue` で再開できる。

## 制約と反則行為

- **1 tick = 1 ファイル集中**。複数ファイルを並列で触らない (context と stryker 待ちで崩壊)
- **Full stryker run は layer graduation 時のみ**。tick 中は必ず `--incremental --mutate <file>`
- **tabu_patterns を無視しない**。同観点の連投は「発見」ではなく「惰性」
- **実装バグは 軍師 相談して即修正**。`discovered-*.md` にため込まない (テスト品質低下の原因)。例外はセキュリティクリティカル or 大規模リファクタのみ
- **state.json の手書き禁止**。常に Phase 4 の書き換え経路を通す
- **stryker html を親に返さない**。サマリ JSON のみ
- 1 file の `tick_count > 8` で 80% 未到達ならスキップ (`status = 'graduated'` にせず `skipped_difficult` flag を立てて人間へ)

## seed (初回のみ)

初回起動時に `state.json` が無ければ `seed-verify-loop-state.md` の手順で layer A-E のファイル一覧を生成する。
project 固有の initial file list がある場合は `.takumi/verify-loop/state.json` に seed しておけば読み込まれる。
