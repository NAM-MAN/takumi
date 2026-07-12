# toishi-integration — 外部要件 source 連携 (opt-in、silent default)

`SKILL.md` Step 0a / Step 0 末尾 / Step 4 G1、`autonomy.md` G1.5 行、`step0-bootstrap.md` Step 0_pre、`integrations.md` toishi 連携節から参照される **opt-in 専用** 仕様。

> [!IMPORTANT]
> **本ファイルは toishi を使う一部 user 向け** (利用者は数% 想定)。toishi-less project は本ファイルを読む必要なし。SKILL.md 入口の脚注 4 箇所と進入路 table 1 行以外、99% の運用に影響しない。`mode == never` / `mode == unset` の project では本仕様全てが no-op。

## Overview

toishi (app.toishi.tech) は要件定義管理 SaaS で MCP server を提供する。takumi は toishi MCP の出力 (8 セクション: 前提 / persona / userNeeds / screenTransition / screenDetail / estimate / scope / verification) を **adapter 経由** で取り込み、AC-ID 起草 (Step 0c) と design mode (Step 0d) の入力に使う。

### 原則

1. **producer / consumer 分離**: toishi 側は改修ゼロ、takumi 側 (consumer) で吸収
2. **silent default**: 未検出 / `mode == never` で全 hook no-op
3. **one-time opt-in**: 検出時 1 ターン yes/no/never、以後永続化
4. **silent degrade**: MCP error 時 user 通知なし、log のみ
5. **adapter pattern**: skill 本体に toishi 依存コードを置かない、project 側 `.takumi/adapters/toishi.ts` に生成
6. **snapshot 凍結 (Cycle 単位)**: PdM 編集による plan 不整合を防ぐ
7. **G1.5 gate**: 承認状態 `pending_approval / draft / rejected` 紐づき task は着手禁止

## Detection — 2 signals

`step0-bootstrap.md` の Step 0_pre 節で初回判定する。**ENV var は signal にしない** (CI 偶発検出 + non-TTY hang リスクのため除外)。

| 順位 | signal | 判定方法 | 上書き禁止 |
|---|---|---|---|
| 1 | `project.yaml.requirements.source` が explicit | `grep` で確認 | 全 auto-detect を無効化 (固定) |
| 2 | `.mcp.json` に toishi server 定義 | `grep -i 'toishi' .mcp.json` | explicit 値があれば上書きしない |
| 3 | `.cursor/mcp.json` に toishi server 定義 | `grep -i 'toishi' .cursor/mcp.json` | 同上 |

優先順位は **固定**。explicit > .mcp.json > .cursor/mcp.json > 未検出。auto-detect は explicit を**上書きしない** (backlog 方式踏襲)。

### interactive TTY ガード

検出後の 1-time confirm は `[ -t 0 ]` でインタラクティブ TTY を確認してから発火する。非 TTY (CI / non-interactive shell / pipe 入力) では **silent skip** し、`project.yaml.requirements.source` を `unset` のまま残す (誤検出による CI hang を完全防止)。

## Mode states — 4 値

backlog-mode の 4 状態 (`unset / enabled / external / deferred`) と並列の 4 状態:

| state | 意味 | 全 hook の挙動 |
|---|---|---|
| `unset` | 未判定 (初期値、または `local` / `never` 後に user が手動 reset) | 次回 Step 0_pre で 1 回だけ提案 |
| `toishi` | toishi 連携 enabled | adapter 経由で fetch、G1.5 gate 発動 |
| `local` | 内部完結 (toishi 検出されたが今回は使わない) | 全 no-op、user が手動 / 発話で `unset` に戻すまで再提案なし |
| `never` | 外部要件 source を恒久的に使わない | 全 hook 完全 silent、再検出も発火しない |

`local` と `never` の違いは「**今回限り / 恒久**」で、never は `mode == external` の backlog 契約と同等の silent 強制。`local` / `never` どちらも `unset` に戻すと再提案が走る (§`local` / `never` 解除 UX)。

## `ToishiGate.resolveMode()` (擬似コード)

```
ToishiGate.resolveMode() -> mode:
  # 優先順位: explicit > auto-detect、explicit を上書き禁止
  explicit = read project.yaml.requirements.source
  if explicit in {toishi, local, never}:
    return explicit                          # 確定、auto-detect 不要

  # auto-detect (.mcp.json / .cursor/mcp.json)
  if grep -i 'toishi' .mcp.json or .cursor/mcp.json:
    if [ -t 0 ]:                             # interactive TTY のみ
      return prompt_user_once()              # yes → toishi、no → local、never → never
    else:
      return "unset"                         # 非 TTY は silent skip

  return "unset"                             # 完全未検出
```

`prompt_user_once()` は確定後すぐに `project.yaml.requirements.source` を永続化する (二度と聞かれない)。

## `ToishiGate.shouldFetch(stage)` — 全 fetch point の中央化

backlog の `OfferPolicy.shouldOffer(trigger)` と対称な **必須通過 gate**。全 toishi fetch point (Step 0_pre detection、Step 0c AC 起草、Step 0d design、G1.5 approval check) は本関数を必ず経由する:

```
ToishiGate.shouldFetch(stage) -> bool:
  mode = resolveMode()
  if mode != "toishi":
    return false                             # local / never / unset は全 stage no-op
  if stage not in {detection, ac, design, g1_5_gate}:
    raise InvalidStage                       # 想定外 stage は明示エラー (silent 拡張防止)
  return true
```

`mode == never` で fetch point が発火しないことを **構造的に保証** する。新規 fetch point を追加する際は本関数経由を必須とする (silent 違反防止)。

## 1-time confirm UX

interactive TTY 検出時のみ、1 ターンだけ user に提示。フォーマット:

```
toishi の設定が検出されました (.mcp.json: toishi server)。
このプロジェクトで toishi 連携を有効にしますか?

  [y] 連携する (今回のセッションから AC 起草と design に toishi の要件を使う)
  [n] 今回は使わない (project.yaml に local として保存、再提案なし)
  [never] このプロジェクトでは聞かない (project.yaml に never として保存、恒久 silent)
```

回答後の状態遷移:

| 回答 | `project.yaml.requirements.source` | 次回挙動 |
|---|---|---|
| y | `toishi` | 連携 enabled、Step 0c/0d で adapter fetch |
| n | `local` | silent (内部完結)、user が手動で `unset` に戻すまで再提案なし |
| never | `never` | 全 hook no-op、`ToishiGate.shouldFetch()` 常に false |

無回答 / unrecognized → `unset` のまま残し、次回再提案 (障害復旧時の救済)。

## adapter contract — toishi MCP → takumi 内部型

adapter コードは **project 側** に生成 (`.takumi/adapters/toishi.ts`)。本仕様は mapping 表のみ規定する。

| toishi MCP 出力 | takumi 内部型 | 備考 |
|---|---|---|
| `verifications.acceptance_criteria_checks[].criterion` | **AC 本体** (takumi `specs/{feature}.md` の AC エントリ) | criterion 文字列を AC 本体にマップ。Given/When/Then 分解は adapter 内 LLM-assisted (toishi 側は分解されていないため棟梁 / 職人(Sonnet) が後段で分解) |
| `verifications.acceptance_criteria_checks[].checked` / `comment` / `evidence_url` | AC frontmatter の `verification_status` / `verification_note` / `evidence_ref` | 検証完了状態の引き継ぎ |
| `userNeeds[]` (NeedCard 構造、ジョブ + 期待結果 + 月次実行回数) | AC frontmatter の `user_need_ref` + `persona_refs` | AC の Given を補強する素材 (need 自体は AC ではない) |
| `personas[]` | AC frontmatter の `persona_ref` | persona id (PE-001 等) を toishi の persona section.id から命名 |
| `screenTransition` + `screenDetail` | design mode の `screens` 入力 | design mode は wireframe / interactions だけ生成、screens は toishi 由来を尊重 |
| `estimate` | Step 1 規模判定 hint | Wave 数の参考値 (上書きはしない、規模判定の補助) |
| `scope` (item-level `approval_state`) | G1.5 gate 入力 | `approved / pending_approval / draft / rejected` を task の `external_approval_state` に埋める |
| `_links.product` / `_links.section` | AC frontmatter の `toishi_links` | 人間が toishi UI に飛べるよう URL を保持 |

### Given/When/Then 分解の LLM-assisted フロー (決定論的契約)

toishi の `criterion` 文字列は単一 AC 文 (例: 「ユーザーが /login にアクセスしてメール + PW で submit すると 200 が返り JWT が cookie に乗る」) であることが多い。adapter 内で職人(Sonnet) または棟梁が以下を実行:

1. criterion を読み込む
2. Given (前提) / When (操作) / Then (期待) に **構文的に分解**
3. `.takumi/specs/{feature}.md` の AC エントリとして書き込む (`toishi_acceptance_check_id: ne-xxxx` を frontmatter に保持)

### AC 分解の決定論的契約 (drift 防止)

LLM-assisted 分解は非決定的なので、同一 `criterion` を別 Cycle で再分解すると AC 文言が drift する。これを防ぐため:

- **分解結果も snapshot に同梱** する (`toishi-snapshot-{rfc3339}.json` 内に `decomposed_acs: { "ne-xxxx": { given, when, then, decomposed_at, model } }` セクションを追加)
- 同一 `toishi_acceptance_check_id` に対して **常に同一分解** を返す (snapshot lookup → cache hit なら再分解しない)
- **新規 criterion のみ** LLM 分解を発火 (cache miss)、Cycle あたりのコストを抑える
- 分解結果は人間が一覧で確認 (棟梁が 1 ターンで提示)。承認後 snapshot に固定
- toishi 側の criterion 文字列は **不変** (write-back しない)、takumi 側分解だけが SSoT

## Snapshot 凍結 — Cycle 単位

PdM が toishi を編集しても、実装中の plan が変動しないようにする。粒度は **Sprint Cycle 単位** (`sprint-mode.md` の Discovery / Plan / Execute / Retro の 1 周)。

### ファイル仕様

```
.takumi/agreements/
  ├ toishi-snapshot-2026-05-24T10-00-00Z.json   # 1 Cycle に 1 snapshot
  ├ toishi-snapshot-2026-05-25T09-30-00Z.json   # 次 Cycle の Plan Phase 開始時
  └ ...
```

- ファイル名は **RFC3339 UTC timestamp** (`:` は `-` に置換、ファイル名安全化)。
- snapshot 自体は **immutable**: 一度書いたら上書きしない、新 snapshot は新 timestamp で発行。
- 同一 Cycle 内 (Sprint Phase 内、normal mode の単一 plan 内) では **既存 snapshot を再利用**、再 fetch しない。
- 新 snapshot は **Plan Phase 開始時のみ** 発行 (sprint-mode の Cycle 境界、または normal mode の Step 0 開始時)。

### Cycle ID の解決 (物理基盤)

adapter は以下の順で **Cycle ID** を解決する (fail-closed、空文字を絶対に使わない):

1. **sprint mode**: `.takumi/state.json.active_cycle_id` (sprint-mode.md が更新する想定。schema 追加は別途 sprint-mode 側で対応、未整備でも下記 fallback で安全動作)
2. **normal mode の fallback**: `.takumi/state.json.active_plan_name` → 無ければ最新 `.takumi/plans/{name}.md` の `{name}`
3. **plan も無い**: `bootstrap-{date}` を発行 (Step 0 bootstrap 時のみ)

いずれも空文字なら **fail-closed**: adapter は snapshot 発行を skip し、G1.5 は §Silent degrade の fail-closed ルールに従って全 toishi-紐づき task を defer する。

### bash 例 (adapter 側で実装、要約)

```bash
# Plan Phase 開始時。Cycle ID 解決 → 既存 snapshot 再利用 or 新発行
snapshot_dir=".takumi/agreements"; mkdir -p "$snapshot_dir"

# Cycle ID: sprint > plan_name > 最新 plan > bootstrap-{date}
cid=$(jq -r '.active_cycle_id // .active_plan_name // empty' .takumi/state.json 2>/dev/null)
[ -z "$cid" ] && cid=$(ls -t .takumi/plans/*.md 2>/dev/null | head -1 | xargs -I{} basename {} .md)
[ -z "$cid" ] && cid="bootstrap-$(date -u +%Y-%m-%d)"
[ -z "$cid" ] && { echo "warn: cycle_id unresolved, G1.5 defers all" >> .takumi/telemetry/toishi-events.jsonl; return 1; }

# 既存 snapshot 再利用 or 新発行 (tk_timeout で hang protection、失敗時 silent degrade)
existing=$(jq -r --arg c "$cid" '.cycle_to_snapshot[$c] // empty' "$snapshot_dir/snapshot-index.json" 2>/dev/null)
if [ -z "$existing" ]; then
  ts=$(date -u +%Y-%m-%dT%H-%M-%SZ); snap="$snapshot_dir/toishi-snapshot-${ts}.json"
  tk_timeout 30 mcp-client toishi.snapshot --project-id "$TOISHI_PROJECT_ID" > "$snap" || { rm -f "$snap"; return 0; }
  jq --arg c "$cid" --arg p "$snap" '.cycle_to_snapshot[$c] = $p' "$snapshot_dir/snapshot-index.json" \
    > "$snapshot_dir/snapshot-index.json.tmp" && mv "$snapshot_dir/snapshot-index.json.tmp" "$snapshot_dir/snapshot-index.json"
fi
```

### 差分検出

Cycle N+1 と N の snapshot を timestamp 順で diff し、AC / screen / approval_state の変更を検出。変更があれば Plan Phase の Discovery 候補に挙げる (`sprint-mode.md` Discovery Phase 連携)。

## G1.5 gate — 実装着手前の承認状態 check

`autonomy.md` の G1.5 行と対応する decision flow。Wave 1 (実装 task の最初) を開始する直前で実行する。

### Decision flow

```
for task in plan.waves[1].tasks:
  if not ToishiGate.shouldFetch("g1_5_gate"):
    continue                                  # mode != toishi なら gate 自体 no-op

  for ac in task.ac_ids:
    if not ac.toishi_acceptance_check_id:
      continue                                # toishi 由来でない AC は skip
    state = snapshot.lookup_approval_state(ac.toishi_acceptance_check_id)
    case state:
      "approved":
        # proceed (何もしない)
      "pending_approval" | "draft":
        defer(task, reason="toishi PdM 承認待ち")
        notify_user("task {task.id} は PdM 承認待ちのため自動 defer しました")
      "rejected":
        halt(task, reason="toishi で差し戻し")
        present_to_user(reject_reason)        # autonomy.md: human-required
```

`defer` された task は同 Cycle 内では着手しない。次 Cycle の Plan Phase で再 snapshot を取り、承認済みなら次回着手。`halt` は human 介入待ち (autonomy.md G1.5 の `rejected` ルート)。

### autonomy 連携

詳細は `autonomy.md` の G1.5 行を参照。`autonomy.level == manual` / `gated` では全 state で human 確認、`autonomous` のみ上記 decision flow で自動進行。

## Silent degrade — MCP error 時の安全側挙動

以下 4 種の error 全てで silent degrade (user 通知なし、log のみ、local-only に降りる):

| error 種別 | trigger | 挙動 |
|---|---|---|
| timeout | `tk_timeout 30` 超過 | log info、当該 fetch point は no-op、続行 |
| 4xx | HTTP 400-499 | log warn、auth 切れの可能性を log に明記、続行 |
| 5xx | HTTP 500-599 | log warn、retry 1 回後 fail で no-op、続行 |
| parse error | JSON 不正 / schema 不一致 | log error、snapshot ファイル削除、no-op |

**user 通知をしない理由**: silent default 原則の徹底。toishi が落ちていても takumi の本流 (Step 0c / 0d の local 生成) は完全動作するため、user に通知すると「toishi 連携を意識させる」原則違反になる。log は `.takumi/telemetry/toishi-events.jsonl` に append-only で残し、verbose mode (将来) で確認可能。

### G1.5 の fail-closed ルール (silent degrade 中の安全保証)

silent degrade 中、snapshot が古い / 欠落 / parse fail の状態で G1.5 が「skip」してしまうと、**未承認 task が autonomous で着手される穴** が成立する。これを防ぐため:

- **snapshot 取得失敗 + 既存 snapshot も無い**: G1.5 は当該 Cycle の **全 toishi-紐づき task を `defer`** (fail-closed、proceed を絶対許さない)
- **snapshot 取得失敗 + 既存 snapshot あり (前 Cycle)**: 既存 snapshot で G1.5 を判定 (古いが安全側、log warn で「snapshot 鮮度警告」を記録)
- 全 task defer は telemetry に `g1_5_fail_closed: true` で記録、F4 最終レビューで集計

silent default は **user 通知しないこと** が原則であり、**未承認 task の着手を許す原則ではない** 。fail-closed が silent default の正しい守り方。

## External silent matrix — `mode == never` の契約

`mode == never` 時、以下全てが no-op (silent 違反は仕様違反として軍師指摘の対象):

| hook / fetch point | mode == never の挙動 |
|---|---|
| Step 0_pre detection | `ToishiGate.resolveMode()` で `never` を返し、prompt 発火なし |
| Step 0c AC 起草 | `ToishiGate.shouldFetch("ac") == false` で MCP fetch せず、local 生成のみ |
| Step 0d design mode | `ToishiGate.shouldFetch("design") == false`、IA ゼロ生成 |
| G1.5 gate | `ToishiGate.shouldFetch("g1_5_gate") == false`、gate 自体 skip |
| snapshot 発行 | 全 stage で false なので snapshot ファイルも作らない |
| feedback 出力 (v2 検討) | `mode == never` で常に skip |

backlog の `mode == external` 契約 (`backlog-mode.md` external silent matrix) と同等の **構造的 silent 保証**。

## `local` / `never` 解除 UX

user が一度 `local` (今回は使わない) または `never` (恒久 silent) を選んだ後、解除する手段:

### 手動編集
```yaml
# .takumi/project.yaml を編集
requirements:
  source: unset     # local / never → unset に変更
```

次回 `/takumi` 起動時の Step 0_pre で再度 detection が走り、1-time confirm が発火。

### 発話による reset
```
/takumi toishi 連携を再有効化     # local / never どちらからでも
```

棟梁が `ToishiGate.resetMode()` を起動し、`requirements.source` を `unset` に戻して 1-time confirm を即座に発火。

### 状態遷移図
```
unset ─[detect + y]─────→ toishi
  │                         │
  │                         └─[手動 unset / 発話 reset]──→ unset
  ├─[detect + n]──→ local
  │                  │
  │                  └─[手動 unset / 発話 reset]──→ unset
  └─[detect + never]→ never
                       │
                       └─[手動 unset / 発話 reset]──→ unset
```

## G1.5 escape hatch — 探索的開発 (PoC / spike)

PdM 承認前に開発を進めたいケース (PoC / spike / 試作) のため、task 単位の escape hatch を用意する。autonomy.md の `manual` level に落とすほどではない少数 task に対し:

### task frontmatter での宣言
```yaml
# .takumi/plans/{name}.md の対象 task に
- task_id: T-042
  ...
  toishi_gate_override: spike   # G1.5 を skip + telemetry に override_used を記録
  override_reason: "認証 PoC、承認は次 Cycle で取る"
```

### 挙動
- G1.5 は当該 task のみ skip (他 task の判定は通常通り)
- `.takumi/telemetry/toishi-events.jsonl` に `{gate: "G1.5", task: "T-042", override: "spike", reason: "..."}` を append-only で記録
- F4 最終レビューで `override_used` 件数を集計、PdM に「承認外で着手した task 一覧」として提示
- override が **plan 内 30% 超** なら警告 (escape hatch の濫用検知)

## AC mapping (本仕様が実装する受け入れ条件)

各 AC-ID と本ファイルの実装節の対応:

| AC-ID | 実装節 | 内容 |
|---|---|---|
| **AC-TOISHI-001** | §Detection + §External silent matrix | toishi-less project では Step 0_pre が silent (検出 0、出力 0) |
| **AC-TOISHI-002** | §Detection (2 signals) | `.mcp.json` / `.cursor/mcp.json` の `toishi` server 定義のみ detection 発火、ENV は signal から除外 |
| **AC-TOISHI-003** | §1-time confirm UX + §Detection (interactive TTY) | 初回検出時 1 ターン yes/no/never、非 TTY は silent skip |
| **AC-TOISHI-004** | §`ToishiGate.resolveMode()` | `project.yaml.requirements.source` が explicit ならスキップ、auto-detect は上書き禁止 |
| **AC-TOISHI-005** | §adapter contract + §AC 分解の決定論的契約 | Step 0c は `verifications.acceptance_criteria_checks[].criterion` を AC 本体に直マップ (分解結果は snapshot に同梱して固定)、Step 0d は `screenTransition + screenDetail` を入力に |
| **AC-TOISHI-006** | §Snapshot 凍結 — Cycle 単位 | `.takumi/agreements/toishi-snapshot-{rfc3339}.json` に immutable cache、同一 Cycle 内は再 fetch なし、Plan Phase 開始時のみ新発行 |
| **AC-TOISHI-007** | §G1.5 gate + autonomy.md G1.5 行 | `pending_approval / draft` → 自動 defer、`rejected` → human 必須、`approved` → proceed |
| **AC-TOISHI-008** | §Silent degrade | MCP error (timeout / 4xx / 5xx / parse) 全て silent degrade、log のみ、user 通知なし |
| **AC-TOISHI-009** | (SKILL.md 側で物理保証、本ファイルは脚注 4 + 進入路 1 の footprint 約束を Overview で明記) | 99% ユーザーへの侵襲ゼロ、CI script で機械検証 |
| **AC-TOISHI-010** | §`ToishiGate.shouldFetch(stage)` + §External silent matrix | `mode == never` で全 fetch point (detection / ac / design / g1_5_gate) が no-op、backlog OfferPolicy 対称な中央化契約 |

## 関連リソース

skill 内: `SKILL.md` (脚注 + 進入路) / `autonomy.md` (G1.5 行) / `step0-bootstrap.md` (Step 0_pre detection bash) / `integrations.md` (連携節) / `sprint-mode.md` (Cycle 境界) / `executor.md` (G1.5 実行順) / `backlog-mode.md` (`mode == external` silent 契約の対称参照)。

project 側 (skill 同梱なし): `.takumi/adapters/toishi.ts` (adapter 本体) / `.takumi/agreements/toishi-snapshot-{rfc3339}.json` (immutable snapshot) / `.takumi/agreements/snapshot-index.json` (Cycle ID → snapshot path mapping) / `.takumi/telemetry/toishi-events.jsonl` (silent degrade log)。

外部 (本リポジトリでは読まない): chataide repo `src/claude-integration/mcpServer.ts` (toishi MCP server 実装、adapter 起草時のみ参照)。
