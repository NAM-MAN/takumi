# takumi routing mode (capacity-aware code-gen routing)

`/takumi` 本体から参照される補助ドキュメント。`executor.md` の dispatch logic に組み込む **3-mode capacity-aware routing** + **職人(GPT-5.5) dispatch 手順** + **lint-repair safety net** + **quota 分配規則** を定義する。

2026-05-01 追加 (`coding-shootout-pilot-2026-04-30` の結論を skill 反映)、軍師 NEEDS-FIX 反映済 v2。

---

## resolver order (manual_override 最優先、mode_select は step 1)

軍師 H3 反映: manual_override は **mode_select / degrade より絶対優先**。

```
0. manual_override 最優先 (user 発話: 「軍師 codex 固定」「コード生成は Sonnet」等)
1. mode_select(runtime_state) → mode 決定
2. cell mapping 引き (routing-matrix の mode overlay)
3. runtime_dynamic_check (cell.runtime_gates)
4. quota_safe_static
5. quality_tie
6. unknown_category
```

## mode_select(runtime_state) — 3-mode capacity-aware routing

職人 dispatch 前に **3 mode** を判定する (manual_override 不在の時のみ起動):

| mode | 起動条件 | 動作 |
|---|---|---|
| `opus_protect` | `opus_weekly_remaining_h < 5h` | 全 cell 職人(Sonnet) スライド (Opus 緊急保護) |
| `gpt55_priority` | `codex_remaining_share > 0.5 AND opus_weekly_remaining_h ≥ 5h` | C-favored cell (T1/T3/T4/T8/T9) を職人(GPT-5.5)、他は職人(Sonnet) (= balanced と同じ) |
| `balanced` (default) | 上記以外 | **全 cell 職人(Sonnet)** (既存 4-role 動作と完全互換、軍師 H4 反映) |

> **軍師 H4 反映**: 旧設計では balanced で T4 が職人(GPT-5.5) primary だったが、これは **既存 4-role plan の破壊的変更** に当たる。balanced は **既存と完全同等 (全 cell 職人(Sonnet))**、職人(GPT-5.5) は `gpt55_priority` mode 限定で起動する。これにより破壊変更を回避し、user が能動的に GPT-5.5 を使う mode に切り替えた時のみ effect が出る。

判定 pseudo-code:

```python
def mode_select(runtime_state) -> Mode:
    """env.yaml v3 の runtime_quota_tracker:
       opus_weekly_remaining_h: float | None (Anthropic Code statusline、null なら decay 推定)
       codex_remaining_share: float | None (codex は取得不能、conservative decay)
    """
    if (runtime_state.opus_weekly_remaining_h is not None
            and runtime_state.opus_weekly_remaining_h < 5.0):
        return Mode.OPUS_PROTECT
    if (runtime_state.codex_remaining_share is not None
            and runtime_state.codex_remaining_share > 0.5
            and runtime_state.opus_weekly_remaining_h is not None
            and runtime_state.opus_weekly_remaining_h >= 5.0):
        return Mode.GPT55_PRIORITY
    return Mode.BALANCED
```

### codex_remaining_share の conservative decay 推定 (軍師 MED3 反映)

codex CLI は残量を返さないため、telemetry から推定:

```python
def codex_remaining_share_estimate() -> float | None:
    """過去 24h の telemetry から消費数を集計、保守的に share 推定。

    値の意味: 0.0-1.0 の range で、available calls / 60 (daily quota)。
    safety margin 20 calls は使わない前提で計算 → 実際の cap は 40 calls/day。
    """
    today_start = today_start_utc()  # codex 5h reset の都合で 24h 単位は近似
    consumed_today = (
        count_jsonl_lines("shokunin-gpt55-burn.jsonl", since=today_start)
        + count_jsonl_lines("gunshi-codex.jsonl", since=today_start)
    )
    available = max(0, 60 - consumed_today - 20)  # safety_margin 20 を引く
    return available / 60 if 60 > 0 else 0.0

# decay rule:
# - 4xx 検出 → 即時 share = 0.0 (当日 disable)
# - reset 推定: 24h 経過後 share を 1.0 にリセット (5h window は近似で全消費しないと仮定)
# - telemetry 不在 (新規環境) → share = None → mode_select は balanced 落とす (= safe default)
```

判定後の cell mapping は project 側 `.takumi/sprints/{date}/routing-matrix.md` の mode overlay 表を参照。

## 職人(GPT-5.5) dispatch 手順 (軍師 H1/H2 反映で order + output contract 強化)

棟梁 が `mode == GPT55_PRIORITY` AND category ∈ {T1, T3, T4, T8, T9} と判定したら、`codex exec` で dispatch。

### 出力 format contract (軍師 H2 反映)

職人(GPT-5.5) の出力は category ごとに明示的な contract を持つ。`-s read-only` sandbox なので codex 自身は file write 不可、**棟梁 が dispatch 後の content を該当 path に書き込む**:

| category | 出力形式 | 適用方法 |
|---|---|---|
| T1 skill_md_edit | 完全な節テキスト (markdown) | 棟梁 が target file を Edit (節を追加挿入) |
| T3 bash_snippet | 完全な bash script | 棟梁 が Write tool で新規 file 作成 |
| T4 typescript_example | 完全な .ts file content | 棟梁 が Write tool で新規 file 作成 |
| T8 multi_file_edit | 各 file の完全 content (file path で section 分け) | 棟梁 が file ごとに Write/Edit |
| T9 long_context_patch | **unified diff** (1-3 行追加のみ) | 棟梁 が patch -p1 dry-run 確認後 apply |

> 出力が patch/diff か full file か曖昧だと dispatch contract が不安定。各 category の prompt template に `[output format spec]` を必ず明記する。

### dispatch snippet (4xx 先行判定 + actual_model 抽出 fallback)

```bash
# 1. context + output_format を inline embed した prompt を build
PROMPT_FILE=$(mktemp /tmp/shokunin-prompt-XXXX.md)
cat > "$PROMPT_FILE" <<EOF
[task spec]
[expected_behavior]
[constraints (coding-style.md / immutability)]
[input file content (inline)]
[output format spec — category 別 contract、上表参照]
EOF

# 2. codex exec で 職人(GPT-5.5) dispatch (gpt-5.5 強制、auto-fallback 拒否)
RAW_OUTPUT=$(mktemp /tmp/shokunin-output-XXXX.log)
cat "$PROMPT_FILE" | codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - > "$RAW_OUTPUT" 2>&1
EXIT=$?

# 3. metadata 抽出 (軍師 H1 反映: 4xx 先行判定で degrade path 確保)
HAS_4XX=$(grep -qiE '(429|401|403|400)' "$RAW_OUTPUT" && echo 1 || echo 0)
ACTUAL_MODEL=$(grep -E '^model: ' "$RAW_OUTPUT" | head -1 | awk '{print $2}')
TOKENS_USED=$(grep -A1 '^tokens used$' "$RAW_OUTPUT" | tail -1 | tr -d ',' | grep -oE '[0-9]+' || echo 0)

# 4. 4xx 先行判定 (軍師 H1: actual_model 抽出より先に degrade path)
if [ "$HAS_4XX" = "1" ]; then
  # 4xx 検出 → 当日 mode を強制 balanced に degrade、当該 task は職人(Sonnet) 経由で再 dispatch
  trigger_mode_degrade
  return_to_shokunin_sonnet
  exit 0
fi

# 5. actual_model 抽出 fallback (軍師 H1: model 行不在でも postpone しない)
if [ -n "$ACTUAL_MODEL" ] && [ "$ACTUAL_MODEL" != "gpt-5.5" ]; then
  # 明示的に gpt-5.5 でない (例: gpt-5.4 fallback されてた) → postpone
  log_warning "actual_model=$ACTUAL_MODEL (expected gpt-5.5), postponing"
  exit_with_postpone
fi
# ACTUAL_MODEL が空 (model 行不在) なら正常通過扱い、lint-repair が品質下限を保証

# 6. 30s inter-call delay 強制
sleep 30

# 7. 棟梁 が後段で gate_check_and_repair() を実行 (lint-repair pass)
```

**注意点**:
- prompt は **stdin 経由** (引数 escape 困難)
- `-s read-only` sandbox + `--skip-git-repo-check` は必須 (codex 自身は file write 不可、出力を棟梁が apply)
- token / wall_time は `~/.claude/projects/.../telemetry/shokunin-gpt55-burn.jsonl` に append
- 30s inter-call delay は codex 連投制約 (`coding-shootout-pilot-2026-04-30` Wave 2.3 運用 baseline)
- **4xx 先行判定**: model 行不在で stuck/postpone を起こさない (軍師 H1 反映)

## lint-repair pass (職人(GPT-5.5) gate fail 30% 吸収、軍師 MED1 反映)

職人(GPT-5.5) 出力 → 棟梁 が gate check → fail なら職人(Sonnet) repair dispatch。retry order を「**check → fail なら repair → 次 attempt の冒頭で再 check**」に統一 (軍師 MED1):

```python
def gate_check_and_repair(output, task_spec, max_retry=3):
    """棟梁 が職人(GPT-5.5) 出力に対して gate check、fail なら repair dispatch.

    各 attempt で必ず check を先に行い、最後の attempt 後に escalation.
    max_retry=3 → 初回 + repair 2 回 = 計 3 回 gate check が走る。
    """
    for attempt in range(max_retry):
        gate_result = run_gate_check(output, task_spec)
        if gate_result.pass_all:
            telemetry.record(lint_repair_used=(attempt > 0), attempts=attempt)
            return output
        # 最後の attempt で fail なら escalation (repair しない)
        if attempt == max_retry - 1:
            telemetry.record(lint_repair_escalation=True, attempts=max_retry)
            raise GateCheckEscalation(
                f"{max_retry} attempts failed for task {task_spec.task_id}, manual review required"
            )
        # 中途 attempt → 職人(Sonnet) repair (cross-vendor で family bias 最小化)
        repair_prompt = build_repair_prompt(
            original_output=output,
            failed_gates=gate_result.fail_reasons,
            task_spec=task_spec,
        )
        output = dispatch_shokunin_sonnet(repair_prompt)
```

**安全規則**:
- `max_retry=3` hardcode、上限超で必ず escalation (無限 loop 防止)
- repair dispatch は 職人(Sonnet) 限定 (cross-vendor で safety、Anthropic family が GPT-5.5 出力を独立 repair)
- escalation 後は棟梁 が手で修正 OR 職人(Sonnet) full re-gen

repair prompt template:

```
以下の output を minimal-fix で gate pass まで修正せよ:

## 原 output
{original_output}

## 失敗した gate
{format_failed_gates(failed_gates)}

## 制約
- minimal change のみ (機能追加禁止)
- 全 expected_behavior 維持
- linter pass を最優先
```

## quota 分配規則 (codex 60/day を 軍師 + 職人(GPT-5.5) で共有)

```yaml
codex_daily_quota: 60          # Plus user の lower bound、wave0.5-constraints §1
allocation:
  gunshi_review: 10            # 軍師 reserve
  shokunin_gpt55: 30           # 職人(GPT-5.5) cap
  safety_margin: 20            # 4xx 緊急時用 reserve
```

**degrade rule**:
- 職人(GPT-5.5) が **30/day 到達** → mode_select で `gpt55_priority` を強制 disable、当日残り codegen は `balanced` mode で 職人(Sonnet) へ
- 軍師 が **10/day 到達** → review 起動を当日 postpone (棟梁 self-review で代替、軍師 review は翌日)
- 4xx 検出 → 即時 mode_degrade + telemetry の `codex-4xx.jsonl` に append

## C-favored category 一覧 (gpt55_priority mode で職人(GPT-5.5) primary)

`coding-shootout-pilot-2026-04-30` で C が tie or 上位 + gate pass rate 確保 された 5 category:

| task | category | 根拠 |
|---|---|---|
| T1 | skill_md_edit | tie (5/5/5)、Opus 温存価値高 |
| T3 | bash_snippet | C +0.9 strict winner、gate 100% |
| T4 | typescript_example | C +0.6 strict winner、gate 100% |
| T8 | multi_file_edit | tie (C 微優位)、harness sensitive 注記 (重み 0.5) |
| T9 | long_context_patch | tie、unified diff format で出力 (Opus 1M 不要、軍師 MED2 反映) |

## Opus 直接 code-gen の例外規則 (軍師 MED2 反映で T9 を例外から除外)

棟梁 (Opus main session) が **直接 code-gen を書く** category は以下 **3 つ** に限定:

| task | category | 根拠 |
|---|---|---|
| T5 | python_migration | A strict winner 全軸、C unreliable (judge2 で gate fail) |
| T6 | refactor | A maint+conv 強い、C 50% gate fail |
| T10 | realistic_debug_repair | A strict winner、C disqualified (gate fail 全 judge) |

> **軍師 MED2 反映**: 旧設計で T9 long_context_patch を「重い時」基準で例外扱いしていたが、resolver が不安定。T9 は **unified diff (1-3 行追加のみ) で出力 contract が明示される** ので、職人(GPT-5.5) で 1 行 diff 生成しても Opus 1M context は不要。T9 は C-favored cell 一覧に統一、棟梁 例外から除外。

それ以外 (T1/T2/T3/T4/T7/T8/T9) は全て **dispatch (職人(Sonnet) または 職人(GPT-5.5))**。

## 関連リソース

- `executor.md` — 全体 executor、本ファイルを §mode_select 節で参照
- `SKILL.md` — 5-role 体制 + 3-mode 概要
- `.takumi/sprints/{date}/routing-matrix.md` — project 側 mode overlay 表 (10 cell × 3 mode)
- `coding-shootout-pilot-2026-04-30` 結論レポート (本 routing の根拠)
