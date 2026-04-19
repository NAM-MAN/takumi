---
name: verify-loop
description: "Mutation score 80% 到達を各レイヤー (A 純粋ロジック → B 状態 → C 永続化 → D API → E UI) で順に進めるループ実行スキル。/loop 10m /verify-loop で継続回しができる。同じ観点を繰り返さず tabu + finder rotation で発見視点を毎 tick 変える。「mutation score 上げて」「テスト徹底的に増やして」「不具合検出のループ」「80% 埋める」と言われたら起動。"
---

# Verify-Loop: レイヤー別 Mutation Score 積み上げループ

`/loop 10m /verify-loop` のように Claude Code の `/loop` スキルから呼び出す、
**継続テスト拡充スキル**。各 tick で 1 ファイルに集中して:

1. Stryker incremental で survived mutant を検出
2. tabu 観点を避けつつ finder (arithmetic_boundary / empty_array / null_boundary / ...) を 1 つ選択
3. Property test / example test を 1-3 本追加
4. 必要に応じて実装バグを修正
5. score を state.json に記録

現在の layer 全員が 80% 以上に到達したら次の layer へ進む。全 layer 完了後は watch モード
(変更ファイルのみ再測定)。

## 本体ドキュメント

詳細な手順・状態ファイル形式・Phase 定義は **`~/.claude/skills/verify/loop.md`** に集約。
このファイルはエントリーポイントとループガードのみ。

## 使い方

| コマンド | 動作 |
|---------|------|
| `/verify-loop` | 1 tick 実行 (現在の layer / 対象ファイルから自動選択) |
| `/verify-loop continue` | paused 状態から再開 |
| `/verify-loop status` | state.json の要約を表示 |
| `/loop 10m /verify-loop` | 10 分間隔で自動 tick (Claude Code の /loop 経由) |

## Phase 0 — ガード (必ず最初に実行)

### 0a. 他スキルとの競合回避

`.takumi/state.json` を読む:
- `status === "in_progress"` かつ `active_plan !== "verify-loop"` → **即終了**。
  「他のスキル ({active_plan}) が実行中のためスキップします」と報告して何もしない
- 上記以外 → 続行

### 0b. state.json の存在確認

`.takumi/verify-loop/state.json` を確認:
- 存在しない → **初回 seed** を実行 (後述)
- 存在する `status === "completed"` → **watch モード**で Phase 1 へ (変更ファイル検出のみ)
- 存在する `status === "paused"` → 再開として Phase 1 へ
- 存在する `status === "in_progress"` → 通常 tick として Phase 1 へ

### 0c. Agent 委譲 (必須)

tick 内で Stryker 実行 + mutant 分析 + test 追加 + 検証と context を大量消費するため、
**必ず Agent ツールに委譲する**。Main は Agent の JSON 応答だけを受ける。

```
Agent(
  description: "verify-loop tick {N}",
  subagent_type: "general-purpose",
  prompt: """
    Read ~/.claude/skills/verify/loop.md fully and execute Phase 1-6.
    Read CLAUDE.md for the project context.
    Read .takumi/verify-loop/state.json for current state.

    ## I/O 契約 (厳守)
    - Stryker report は .takumi/verify-loop/reports/{tick_n}/{safe_path}.json に保存
    - state.json の書き換えは *.partial → mv *.final (atomic)
    - 最終メッセージは JSON 1 枚のみ (1KB 未満、画像・diff 含めない):
      {
        "tick": N,
        "layer": "A",
        "file": "src/lib/...",
        "before_score": N,
        "after_score": N,
        "finder_used": "arithmetic_boundary",
        "action_taken": "added 2 PBT for boundary values",
        "layer_graduated": false,
        "next_layer": "A",
        "status": "in_progress | paused | completed | watch",
        "one_line_verdict": "..."
      }

    ## 親に返してはいけないもの
    - Stryker html 本文 / 長い survivor 列挙
    - 追加した test コードの本文 (diff)
    - 修正した実装の本文 (diff)
    これらは全て .takumi/verify-loop/ 配下にのみ書く。

    ## コンテキスト保護
    残量 20% を切ったら state.json を保存し、resume.md を書き、status: "paused" で早期終了。
  """,
  run_in_background: false
)
```

## Phase 1 以降

Agent 内で実行される (Main では実行しない)。詳細は `~/.claude/skills/verify/loop.md`:

1. **Phase 1**: 対象ファイル選択 (tabu と被らない `active`/`pending` から best_score 昇順)
2. **Phase 2**: `pnpm stryker run --incremental --mutate <file>` で survived mutant 抽出
3. **Phase 3**: finder 選択 (tabu に 3 tick 追加) → test 追加 → 必要なら実装修正
4. **Phase 4**: state.json 更新 + layer graduation 判定
5. **Phase 5**: 全 layer 完了なら watch モード移行 (変更ファイル再測定のみ)
6. **Phase 6**: context 残量切迫時の paused 保存

## 初回 seed

state.json が無い時は、`seed-state.md` (同ディレクトリ内) の手順で生成:

1. project のディレクトリを glob で走査
2. 5 layer に振り分け:
   - **A 純粋ロジック**: `src/lib/**/*.ts` (テスト除外), `src/features/*/utils/**/*.ts`
   - **B 状態**: `src/features/*/store/**/*.ts`, `src/features/*/hooks/**/use-*.ts` の reducer/selector
   - **C 永続化境界**: `src/features/*/actions/**-repository.ts`, `src/lib/db/**/*.ts`
   - **D API 入口**: `src/app/api/**/route.ts`
   - **E UI component**: `src/features/*/components/**/*.tsx`
3. 各ファイルを `{path, status: 'pending', best_score: 0, tick_count: 0, ...}` で列挙
4. `current_layer = 'A'`, `layer_order = ['A','B','C','D','E']`, `status = 'in_progress'` で書き出し

## 制約

- 1 tick = 1 ファイル集中。複数ファイル並列禁止 (context と Stryker 待ちで崩壊)
- Full stryker run は layer graduation 時のみ
- tabu_patterns を無視しない (直近 2-3 tick の観点は除外)
- 実装バグ修正は mutant が「仕様違反」を示す時のみ、それ以外は `discovered-*.md` に落として人間レビュー
- state.json の手動書き換え禁止 (Phase 4 経路のみ)
- stryker html を親に返さない (要約 JSON のみ)
- 1 file の `tick_count > 8` で 80% 未到達なら `skipped_difficult` としてフラグ立てて人間判断へ

## 設計根拠

軍師 (gpt-5.4) との相談結果:

- **レイヤー順 A→E** は mutant kill 難度の低い順。A は入出力明確で PBT が刺さる → 早く 80% 到達 → E (DOM/非同期) は最後に回す
- **file-within-layer の state 管理**: layer 単位の graduation 判定と、個別 file の tick history を両立
- **tabu + finder rotation**: 「同じ観点を繰り返さない」を構造的に保証。直近 2-3 tick で使った finder は tabu、新 tick は別カテゴリから選ぶ
- **incremental mutate**: 1 tick 10 分は 1 ファイル (`--mutate <file>`) が現実的。複数ファイルは待ち時間で崩れる

関連スキル:
- `~/.claude/skills/verify/SKILL.md` — 検証全体方針
- `~/.claude/skills/verify/mutation.md` — Stryker 設定詳細
- `~/.claude/skills/sweep/SKILL.md` — 同系統のループ対応オーケストレーター (参考)
