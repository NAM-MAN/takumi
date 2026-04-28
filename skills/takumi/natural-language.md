# /takumi 自然文インターフェース

`/takumi` 本体から参照される補助ドキュメント。**人間が覚えるべきコマンドは `/takumi` の 1 つだけ**という設計思想のため、サブコマンド構文も対外サブコマンドも採用せず、意図は自然日本語で `/takumi` に伝える。

## 原則

- サブコマンド構文 (`/takumi override`, `/takumi status` 等) も、別コマンド (`/probe`, `/sweep`, `/verify`, `/design`, `/exec` 等) も**採用しない**
- 意図は自然日本語で `/takumi` に伝え、内部で意図分類ルータが 6 モード (normal / probe / sweep / status / continue / override) に振り分ける
- override は自然文で伝え、`.takumi/control/` のファイルに反映される
- override がファイル直編集しかない設計だと緊急時に使われず、自動化全体が信用を失う (軍師 警告)

## 人間が言う言葉 → /takumi の内部動作

| 言葉 | 内部動作 |
|---|---|
| 「<機能> 作って」「<機能> 追加して」 | normal mode (対話 → AC → design mode → 計画 → executor) |
| 「今なに動いてる?」「状態見せて」 | status mode (自動処理・gate 判定・停止中 override を 30 秒で提示) |
| 「うるさいから止めて」「一旦停止」 | override mode (`.takumi/control/pause.yaml` に 24h pause を記録) |
| 「もう 1 回動かして」「再開」 | override mode (pause 解除) |
| 「<観点> 心配」「<観点> 見て」「<観点> 調べて」 | probe mode に自動遷移 (発見者並列起動 → backlog → 計画) |
| 「全般的に棚卸し」「リリース前にちゃんと見て」 | sweep mode に自動遷移 (8 次元並列発見) |
| 「リファクタして」「設計見直して」 | takumi 内部の strict-refactoring モード (`strict-refactoring/README.md`) に委譲 |
| 「この計画続きから」「再開」 | continue mode (`.takumi/state.json` を読んで paused 状態から再開) |
| 「今の計画捨てて」「やり直し」 | state.json を reset、normal mode を新規開始 |

## 自動判定で動くもの (人間は意識しない)

| 自動処理 | 発火条件 |
|---|---|
| verify-loop (mutation score 継続向上) | mutation drop ≥ 2pt / Sev2 障害 / リリースブロッカー。`/loop 10m /verify-loop` で起動 (`/loop` は Claude Code 組込 skill) |
| sweep mode | 月次自動 or event 駆動 |
| verify 運用 (pre-push / CI) | 自動 |
| executor | /takumi 計画確定後に自動起動 (takumi 内部ロール) |
| design mode | project_mode=ui/mixed で Step 0d として自動呼出 (takumi 内部モード) |
| test strategy | task 作成時に `test-strategy.md` を内部呼出 |

## 緊急時の override

サブコマンドではなく自然文で伝える:

| 発話 | 動作 |
|---|---|
| 「auth の loop 止めて」 | `.takumi/control/` に `pause_loop module=auth` |
| 「sweep 24 時間止めて」 | `pause_sweep 24h` |
| 「hard gate 一時的に warning に」 | `soft_downgrade 2h` |
| 「override 一旦全部解除」 | `.takumi/control/` の全 pause ファイルを削除 |

`/takumi` が意図を認識して `.takumi/control/` の override ファイルを作成・削除する。人間は直接ファイル編集しない。

## 軍師 routing の切替 (tier × model)

両方持ちの user が月次クォータを rotate させる想定 + GPT-5.5 / 5.4 の model 軸 (env.yaml schema v2、詳細は `executor.md` の「GPT-5.5 upgrade path」参照):

### tier 切替 (どの CLI を使うか)

| 発話 | 動作 |
|---|---|
| 「軍師を codex に切り替えて」「gunshi codex」 | `.takumi/profiles/env.yaml` の `preference.tier` を `codex` に |
| 「軍師を copilot に」「gunshi copilot」 | 同 `copilot` に |
| 「軍師を opus-max に」「gunshi opus」 | 同 `opus-max` に (劣化 mode warning 付) |
| 「軍師今どっち?」「gunshi status」 | 現在 preference と availability を提示 |
| 「軍師 auto」「preference リセット」 | `preference.tier` を null に戻す (availability 順の自動) |

### model 切替 (5.5 / 5.4 / auto)

| 発話 | 動作 |
|---|---|
| 「軍師を 5.5 に」「軍師の model を gpt-5.5 に」「gunshi 5.5」 | `preference.model` を `gpt-5.5` に強制 (5.5 不在 tier では拒否) |
| 「軍師を 5.4 に固定」「軍師は 5.4 のままで」「gunshi 5.4」 | `preference.model` を `gpt-5.4` に強制 (安定性優先) |
| 「軍師の model を auto に戻して」「gunshi model auto」 | `preference.model` を `auto` に (tier 内 highest available を自動選択) |
| 「軍師の availability を再 detect」「gunshi redetect」 | step0-bootstrap.md の Stage 2 を再実行、5.5 ping 結果で `models[]` を更新 |

availability が false な tier、または該当モデル不在の tier への切替要求は拒否 + 警告 (「codex は未インストールです、`gh extension install` で導入するか preference を別に」/「Pro+ 未契約のため copilot 5.5 は使えません、preference.model: auto なら gpt-5.4 が選ばれます」)。クォータ枯渇の自動検出はしない — user が「切れた」と言ったタイミングで切り替える雑運用。

### 5.5 fallback の通知

`preference.model: auto` で 5.5 → 5.4 fallback が発生した場合、stderr に 1 行通知が出る (session 内重複は抑制)。fallback 自体を拒否したい (劣化を一切許容しない) user は `preference.model: gpt-5.5` 強制で 5.4 への切替を完全に拒否できる。

## 意図認識の曖昧さ対策

`/takumi` が発話の意図を即断できない場合の挙動:

1. **曖昧** → 「A の意味ですか? それとも B ?」と 1 問だけ確認
2. **新機能追加なのか、状態確認なのか判断がつかない** → 「新機能を追加しますか、それとも現状を確認しますか?」
3. **override 対象モジュールが曖昧** → status mode の内容を先に提示して「どのモジュールですか?」

**確認を 2 回以上重ねない**。1 問で解決しなければ最も可能性の高い解釈で進め、違ったら後で修正する。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | /takumi 本体 |
| `integrations.md` (同ディレクトリ) | 新 skill との接続詳細 |
| `telemetry-spec.md` (同ディレクトリ) | override / status の event 記録 |
