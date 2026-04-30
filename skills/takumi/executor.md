# /takumi の executor (内部責務)

`/takumi` 本体から参照される補助ドキュメント。計画 (`.takumi/plans/*.md`) を Wave 順に自動実行する executor。

人間が直接叩くコマンドではない。`/takumi` 内の計画提示 → 確認後に自動的に executor が動く。plan name のタイポ問題も `/takumi` が最新計画を知っているため発生しない。

## 5 ロール体制 (2026-05-01 update、coding-shootout pilot 結論反映)

| ロール | モデル | effort 既定 | 担当 |
|--------|--------|---|------|
| 棟梁 | Opus 4.7 (自分) | xhigh | 実行管理・まとめ・ユーザー報告・**dispatch・gate check (lint / test / spec compliance)・integrate (説明)** |
| 軍師 | GPT-5.x (`codex exec` / `copilot`、env.yaml driven、auto-fallback 5.5→5.4) | (max 相当) | クロスモデルレビュー・設計判断 |
| **職人(Sonnet)** | sonnet (Agent tool) | xhigh | 実装 (default、A-favored or unreliable category) |
| **職人(GPT-5.5)** (NEW) | gpt-5.5 (`codex exec`) | (max 相当) | 実装 (`gpt55_priority` mode + C-favored category: T1/T3/T4/T8/T9) |
| 斥候 | haiku (Agent tool) | medium | 広範・深さ未定の探索 |

### 棟梁 直接 code-gen の例外規則 (2026-05-01、軍師 MED2 反映で T9 除外)

棟梁 (Opus main session) は原則 **dispatch + gate check + 説明** に専念。**code-gen を直接書く例外** は以下 **3 cell** のみ (A strict winner で深い推論が必須、coding-shootout pilot 結論):

- python_migration / refactor / realistic_debug_repair

T9 long_context_patch は unified diff 1 行追加のみで出力 contract が明示されるので職人 dispatch に任せる。それ以外の category は全て dispatch (職人(Sonnet) または 職人(GPT-5.5))。dispatch 先は 3-mode capacity-aware routing で決まる (下節 routing 参照)。

### Opus 4.7 delegation policy

Anthropic 公式指針 ([blog](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)) に従い subagent spawn を**抑制**する:

- **棟梁が自分で完結できる作業は spawn しない**: 1 response で `Read` / `Edit` / 小範囲 `grep` が済む範囲は自分で処理 (上記 4 例外 cell の code-gen を含む)
- **職人(Sonnet) を spawn する条件**: 規模「中」以上の実装で C-favored 以外の category、複数ファイル跨ぎ、長時間回る test iteration、Wave ごとの明示的実装タスク
- **職人(GPT-5.5) を spawn する条件**: `mode_select` で `gpt55_priority` 判定 + category ∈ {T1/T3/T4/T8/T9}、または routing-matrix で C primary cell
- **斥候 (haiku) を spawn する条件**: 深さ未定の広範探索、複数 keyword × 複数ディレクトリ、独立ドメイン並列 fan-out (例: security / perf / a11y 同時)
- **軍師 (GPT-5.x) を spawn する条件**: 計画レビュー、設計判断、公開前レビュー、破壊的変更時のクロスモデル確認

ロールは「呼ぶ義務」ではなく「必要なら呼べる道具」。`max` effort は真に難しい問題 (arch 決定 / 複雑な security 判断 / legacy 大改修) のみ使用、overthinking リスクあり。

### 軍師 routing (3-tier + quota rotation)

軍師は **GPT 系列によるクロスモデルレビュー** が本質。以下 3 tier の **available なものから user が preference を設定**する。毎回 quota を自動チェックするのは重いので「雑に切り替え」モデルを採用:

| tier | ツール | モデル (env.yaml driven) | 特性 |
|---|---|---|---|
| **copilot** | `copilot` (Copilot Pro / Pro+) | gpt-5.x (Pro+ で gpt-5.5、Pro で gpt-5.4) | 定額・月次クォータ。新規受付は停止中、既存契約者のみ |
| **codex** | `codex exec` (ChatGPT Plus) | gpt-5.x (Plus で gpt-5.5 利用可、`-codex` バリアントは ChatGPT account 不可で 5.4 fallback) | 従量またはクォータ制、新規契約可能 |
| **opus-max** | Opus 4.7 max 自己レビュー | — | 常に利用可だが**劣化 mode** (同モデル系列 cross-model diversity なし)。critical MUST のみ最終手段 |

各 tier の実モデルは `.takumi/profiles/env.yaml` の `availability[tier].models` (Step 0 detection で確定) と `preference.model` (`auto` / `gpt-5.5` / `gpt-5.4`) で動的に決まる。詳細は下節「GPT-5.5 upgrade path (env.yaml schema v2)」。

### 切り替え方針 (user-declared preference)

**両方持ちのユーザーがよくいる**: 月初は copilot (定額で実質無料)、使い切ったら codex (従量)、翌月また copilot、という rotation が現実的な使い方。

- 自動クォータ検出は**しない** (毎回 API 叩くオーバーヘッドと複雑さが cost に見合わない)
- user が preference を declare、takumi はそれを使う
- 切り替えは**自然言語**: 「軍師を codex に切り替えて」「gunshi copilot」等の発話を `.takumi/profiles/env.yaml` 更新に mapping
- preference が unavailable なら次善策に自動 fallback (user への通知付)

### 検出と preference (`.takumi/profiles/env.yaml`、schema v2)

Step 0 で 1 度だけ**検出** (CLI installed + GPT-5.5 ping)、user が**preference** 設定:

```yaml
gunshi:
  schema_version: 2
  detected_at: 2026-04-28T...
  availability:
    copilot:
      installed: true | false   # `command -v copilot` 結果
      models: [gpt-5.5, gpt-5.4] # Pro+ なら 5.5、Pro/Free なら [gpt-5.4]。Step 0 で ping 確定
    codex:
      installed: true | false   # `command -v codex` 結果
      models: [gpt-5.5, gpt-5.4] # Plus なら 5.5、Free なら [gpt-5.4]。Step 0 で ping 確定
  preference:
    tier:  copilot | codex | opus-max | null  # user 宣言 (null なら available 順で自動)
    model: auto | gpt-5.5 | gpt-5.4           # auto = tier 内 models[0]
  last_switched_at: 2026-04-28T...
```

初回 detection 後、preference.tier が null の場合の既定順:
1. availability.copilot.installed → `copilot`
2. availability.codex.installed → `codex`
3. どちらも false → `opus-max` (警告付)

user が「軍師を codex に切り替えて」と言ったら preference.tier を書き換え、「軍師を 5.4 に固定」なら preference.model を書き換え。availability が false / 該当モデル不在 の tier に切り替え要求があれば拒否 + 警告。

### GPT-5.5 upgrade path (env.yaml schema v2、2026-04-28〜)

軍師は GPT-5.4 / 5.5 の **どちらでも動く**。schema v2 で「model 軸」を導入し、tier 内で使うモデルを `preference.model` で制御する。基本ポリシ:

| preference.model | 挙動 |
|---|---|
| `auto` (既定) | 当該 tier の `availability.models[0]` (= highest available) を選ぶ。codex Plus + Pro+ user なら gpt-5.5、Pro/Free user なら gpt-5.4 |
| `gpt-5.5` | 5.5 を強制。tier の models に 5.5 が無ければ呼出を拒否 + 警告 (silent fallback しない) |
| `gpt-5.4` | 5.4 を強制 (5.5 は試さない、安定性優先 user 向け) |

#### 5.5 → 5.4 fallback rule (auto mode 限定)

`preference.model: auto` で 5.5 を試した結果、**実コール時に 4xx** が返った場合:

| reason | 挙動 |
|---|---|
| `400_not_supported` / `404_model` (永続的) | **即 fallback to 5.4** (retry 無意味) |
| `402_quota` (一時的) | 60 秒待機 → 1 度だけ retry → 再 fail なら fallback |
| `429_rate_limit` (一時的) | 5-15 秒 backoff → 1 度だけ retry → 再 fail なら fallback |
| `other` | 即 fallback、詳細を telemetry notes に保存 |

すべての fallback で:
1. 同じプロンプトを 5.4 に投げ直して結果を採用
2. **stderr に 1 行通知** (session 内重複は抑制): `⚠ gunshi: gpt-5.5 fallback to gpt-5.4 (reason: <code>, retry: <bool>)`
3. **telemetry に毎回 emit**: `gunshi.model_fallback` event (詳細は `telemetry-spec.md` の 3.8 節)
4. **session 終了時 summary**: stderr に `fallback N/M` (発生 N 回 / 5.5 試行 M 回) を 1 行出力 → user が断続 fail を見落とすことを防ぐ

**重要**: silent fallback では「精度劣化 NG」絶対制約と衝突する (5.5 が恒常的に劣化していても気付けない) ため、stderr 通知 + telemetry を必須とする。`preference.model: gpt-5.5` 強制時は fallback せず拒否する (劣化を絶対許容しない user 向け)。

**emit logic 実体**: skill リポジトリは仕様のみ (markdown)。実コードは user 環境の executor wrapper として持つ — bash 擬似コードは `telemetry-spec.md` の 3.8 節「emit logic 責務」参照。

#### v1 → v2 migration

既存 user (`schema_version` 不在) は `step0-bootstrap.md` の migration スクリプトで自動移行:

- `availability: {copilot: true, codex: true}` (bool) → `availability: {copilot: {installed: true, models: [gpt-5.4]}, ...}` (構造化)
- `preference: copilot|codex|null` (tier のみ) → `preference: {tier: copilot|codex|null, model: auto}` (model 軸追加)
- atomic backup (`env.yaml.v1.bak`) + parse 失敗時 rollback + idempotent
- migration 後の **5.5 ping は手動** (`/takumi` で「軍師の availability を再 detect」と発話、または step0-bootstrap.md の Stage 2 を手動実行)

### 軍師 発火基準 (cost-aware)

全タスクで軍師を呼ぶのは過剰。重要度で階層化:

| 重要度 | 発火 | 使う Tier |
|---|---|---|
| **MUST** — 公開レビュー / pilot 実験設計 / breaking change / semver major | 必須 | available 最上位 (1→2→3) |
| **SHOULD** — 大規模 plan / critical keyword 含む diff | 既定 on、user opt-out 可 | 同上 |
| **MAY** — 中規模 plan / 設計検証 | 既定 off、user opt-in | Tier 1 のみ、なければ skip |
| **SKIP** — 小規模 / ルーチン | 呼ばない | — |

Tier 3 (opus-max) は MUST タスクでのみ「最後の手段」として起動する。劣化 mode なので結果に `⚠ opus-max fallback` を明記。

### 各 tier の呼出パターン (exact syntax)

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、Pro+ で Copilot 5.5 利用可なら runtime は gpt-5.5 が選ばれる (上節「GPT-5.5 upgrade path」参照)。 -->
```bash
# copilot (Copilot Pro / Pro+)
# -p: プロンプト / --silent: ログ抑制して応答のみ / --cwd: 作業 dir
# --available-tools で read-only 相当 (view/grep/glob/web_fetch のみ許可)
copilot -p "{プロンプト}" \
  --model gpt-5.4 \
  --cwd "$(pwd)" \
  --available-tools="view,grep,glob,web_fetch" \
  --silent \
  > .takumi/notepads/{name}/oracle-task-{N}.md
```

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、ChatGPT Plus user は runtime で gpt-5.5 が選ばれる (Wave 0 ping 確認済)。`-m gpt-5.5-codex` は ChatGPT account では 400、auto-fallback で 5.4 になる。 -->
```bash
# codex exec (ChatGPT Plus)
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  "{プロンプト}" 2>&1 | tail -100
```

```bash
# opus-max 自己レビュー (fallback、劣化 mode)
# 棟梁 (Opus 4.7 main session) が自身に指示を出す:
#   「以下を max effort で敵対的に自問自答してください。
#    cross-model 確認ではないため同系列の盲点が残る可能性に注意:
#    {プロンプト}」
# 結果を .takumi/notepads/{name}/oracle-task-{N}.md に書き出し、
# 冒頭に "⚠ Tier: opus-max self-review (degraded mode)" を明記。
```

これらの tier の quality 等価性は pilot で検証予定 (`docs/CONTRIBUTING/pilot-driven-development.md` の方法論に従い、別リポジトリで arm A/B/C 比較)。

## 3-mode capacity-aware routing と職人(GPT-5.5) dispatch (2026-05-01 追加、軍師 NEEDS-FIX 反映)

`coding-shootout-pilot-2026-04-30` の結論で導入された **3 mode** (`opus_protect` / `balanced` / `gpt55_priority`) と **職人(GPT-5.5) dispatch** + **lint-repair safety net** + **quota 分配規則** は、行数が多いため `routing-mode.md` に分離。

resolver order は **manual_override 最優先 → mode_select(runtime_state) → cell mapping 引き → runtime_dynamic_check / quota_safe_static / quality_tie / unknown** (軍師 H3 反映)。

### 1 行サマリ

- **manual_override 最優先** (user 発話で軍師 / 職人 を固定)、次に `mode_select` で 3 mode 判定
- `balanced` (default) = **全 cell 職人(Sonnet)** (既存 4-role と完全互換、軍師 H4 反映で破壊変更回避)
- `gpt55_priority` で T1/T3/T4/T8/T9 を職人(GPT-5.5) primary に切替、他 cell は職人(Sonnet) のまま
- 職人(GPT-5.5) は `codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C $(pwd) -` で起動 (stdin 経由 prompt、auto-fallback 拒否、4xx 先行判定で degrade path 確保)
- 出力 format は category 別 contract (T9 は unified diff、他は full file)、棟梁 が出力を該当 path に Edit/Write apply
- gate check (lint / test / spec) → fail なら職人(Sonnet) repair (max 3 attempts、最終 attempt fail で escalation)
- codex 60/day quota は 軍師 10 / 職人(GPT-5.5) 30 / safety 20 で分配、職人(GPT-5.5) 30/day 到達で gpt55_priority を当日 disable

## Step 0 — 計画読み込み

1. `.takumi/state.json` を読む
2. 引数あり → `.takumi/plans/{name}.md` を探す
3. アクティブ計画なし → `.takumi/plans/*.md` を一覧、ユーザーに選ばせる
4. `in_progress` / `paused` → 最初の `- [ ]` から再開
5. ノートパッド初期化: `.takumi/notepads/{name}/` (learnings.md, issues.md)
6. state.json 更新: `"status": "in_progress"`

## Step 1 — Wave 順に実行

Wave は順番に。各タスクを以下のループで処理。

### 1. 準備
- `.takumi/notepads/{name}/learnings.md` を読む
- 計画からタスクの **ac_ids / verify_profile_ref / design_profile_ref / 何を / ロール / やらない / 検証** を読む

### 2. ロール振り分け

**職人 (sonnet)** — 実装タスク:
```
Agent tool:
  subagent_type: "general-purpose" (テスト付きなら "tdd-guide")
  model: "sonnet"
  prompt: TASK / EXPECTED OUTCOME / MUST NOT / CONTEXT / verify_profile 参照
```

**軍師 (GPT-5.x)** — レビュー・設計判断:
以下は **Tier 2 (codex exec)** の例。他 tier の選択は上記「軍師 routing」参照。

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、Plus user の runtime は gpt-5.5。 -->
```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  "{タスク内容 + 検証基準 + ノートパッドの文脈}"
```

**斥候 (haiku)** — 調査:
```
Agent tool:
  subagent_type: "Explore"
  model: "haiku"
  prompt: "{調査内容}"
```

### 3. 検証 (Wave gate)

wave gate は以下を**全て**通過する必要あり:

| フェーズ | 内容 |
|---------|------|
| A. コード確認 | 変更ファイルを読む、ミューテーション・スコープ逸脱チェック |
| B. build | `pnpm build` / `tsc` |
| C. test pass | `pnpm test --run` |
| **D. mutation gate** | `verify_profile_ref.mutation_floor` を下回らない (task tier の値) |
| **E. L7 hard gate** | `design_profile_ref.layout_invariants.hard` を全て満たす (ui 時のみ) |
| F. oracle_review | 軍師 の 400 字以内最終確認 |

**不合格 → リトライ最大 3 回 → issues.md に記録してスキップ**

### 4. 記録
- `.takumi/notepads/{name}/learnings.md` に追記
- `.takumi/telemetry/profile-usage.jsonl` に `gate_passed` / `gate_failed` event emit

### 5. 完了マーク
計画ファイルの `- [ ]` → `- [x]`

### 6. 自動継続
次のタスクへ。ユーザーに聞かない。

## Step 1.5 — Probe 連携 (Probe 計画実行中のみ)

Probe 計画 (`.takumi/plans/probe-*.md`) を実行中のみ有効。通常 plan では省略。

### 自動点検 (毎 Wave 完了後、2-3 分)

1. **発見の統合**:
   - `.takumi/drafts/discovered-*.md` を読み、ICE (Impact×Confidence×Ease, 各 1-5) 採点
   - ICE >= 40 → 未実行 Wave 末尾に新タスク追加
   - ICE < 40 → `.takumi/sprints/{日付}/deferred.md`
   - 処理済み → `.takumi/drafts/archive/`

2. **メトリクス記録**:
   ```bash
   pnpm test:run 2>&1 | tail -5
   pnpm typecheck 2>&1 | tail -3
   ```
   `.takumi/sprints/{日付}/metrics.md` に追記

3. **learnings.md に点検結果を記録**

### 定期点検 (3 Wave ごと、5-10 分)

1. 変更ファイル特定: `git diff --name-only HEAD~{3Wave 分}`
2. 関連発見者の**再実行** (haiku 並列、変更ファイルに限定)
3. 発見者精度更新: `.takumi/sprint-config.md` に採用率記録
4. 新規発見を ICE 採点 → 計画追加
5. 進捗レポート → learnings.md + ユーザー簡潔報告

## Step 2 — 最終検証

F1-F4 を実行。F4 (コードレビュー) は 軍師 委譲:

<!-- 例示は guaranteed baseline (gpt-5.4)。env.yaml の preference.model: auto 時、Plus user の runtime は gpt-5.5。 -->
```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/final-review.md \
  "全変更を敵対的レビュー: 品質/immutability/error handling/scope compliance/境界条件/競合"
```

失敗 → 修正 + 再検証 (最大 2 ラウンド)。

## Step 3 — 完了

1. state.json: `"status": "completed"`
2. 日本語まとめ: 完了タスク数、スキップ、学び、`git diff --stat`
3. `/takumi` が「計画 X が完了しました」とユーザーに報告

## コンテキスト保護

Agent 内コンテキスト残量 20% を切ったら:

1. 実行を一時停止
2. 再開ファイル生成 (`.takumi/sprints/{日付}/resume.md`):
   ```markdown
   # 再開情報: {日付} {時刻}
   ## 中断地点
   - 計画: {計画ファイルパス}
   - 完了 Wave: {N} (タスク {N} 件完了)
   - 残 Wave: {N} (タスク {N} 件)
   ## 直近の学び (learnings.md 最新 5 件)
   ## 再開: /takumi continue
   ```
3. ユーザー通知: 「Wave {N} まで完了。/takumi continue で再開できます」

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | /takumi 本体 |
| `test-strategy.md` (同ディレクトリ) | verify_profile 選定ロジック |
| `integrations.md` (同ディレクトリ) | 新規 skill 連携ガイド |
| `telemetry-spec.md` (同ディレクトリ) | event emit の spec |
| `verify/README.md` (同階層配下) | verify run / recipe library |
| `design/README.md` (同階層配下) | L7 hard gate の定義 (ui 時) |
