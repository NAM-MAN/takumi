# gunshi-invocation — 軍師 (oracle) の tier routing と CLI 呼出 (executor 内部責務)

`executor.md` / `SKILL.md` / 各 phase ファイルから参照される、**軍師 (GPT 系列クロスモデルレビュー) の起動規約**。tier 選択 (copilot / codex / opus-max)、env.yaml preference、GPT-5.5 ↔ 5.4 の model 軸、発火基準、exact 呼出 syntax、invocation hardening (portable timeout / hang fallback) を集約する。

executor.md から分離 (350 行上限のため)。職人 (code-gen) 側の 3-mode routing は `routing-mode.md`、無人実行の gate 裁定は `autonomy.md`。

---

## 軍師 routing (3-tier + quota rotation)

軍師は **GPT 系列によるクロスモデルレビュー** が本質。以下 3 tier の **available なものから user が preference を設定**する。毎回 quota を自動チェックするのは重いので「雑に切り替え」モデルを採用:

| tier | ツール | モデル (env.yaml driven) | 特性 |
|---|---|---|---|
| **copilot** | `copilot` (Copilot Pro / Pro+) | gpt-5.x (Pro+ で gpt-5.5、Pro で gpt-5.4) | 定額・月次クォータ。新規受付は停止中、既存契約者のみ |
| **codex** | `codex exec` (ChatGPT Plus) | gpt-5.x (Plus で gpt-5.5 利用可、`-codex` バリアントは ChatGPT account 不可で 5.4 fallback) | 従量またはクォータ制、新規契約可能 |
| **opus-max** | Opus 4.8 max 自己レビュー | — | 常に利用可だが**劣化 mode** (同モデル系列 cross-model diversity なし)。critical MUST のみ最終手段 |

各 tier の実モデルは `.takumi/profiles/env.yaml` の `availability[tier].models` (Step 0 detection で確定) と `preference.model` (`auto` / `gpt-5.5` / `gpt-5.4`) で動的に決まる。詳細は下節「GPT-5.5 upgrade path (env.yaml schema v2)」。

## 切り替え方針 (user-declared preference)

**両方持ちのユーザーがよくいる**: 月初は copilot (定額で実質無料)、使い切ったら codex (従量)、翌月また copilot、という rotation が現実的な使い方。

- 自動クォータ検出は**しない** (毎回 API 叩くオーバーヘッドと複雑さが cost に見合わない)
- user が preference を declare、takumi はそれを使う
- 切り替えは**自然言語**: 「軍師を codex に切り替えて」「gunshi copilot」等の発話を `.takumi/profiles/env.yaml` 更新に mapping
- preference が unavailable なら次善策に自動 fallback (user への通知付)

## 検出と preference (`.takumi/profiles/env.yaml`、schema v2)

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

## GPT-5.5 upgrade path (env.yaml schema v2)

軍師は GPT-5.4 / 5.5 の **どちらでも動く**。schema v2 で「model 軸」を導入し、tier 内で使うモデルを `preference.model` で制御する。基本ポリシ:

| preference.model | 挙動 |
|---|---|
| `auto` (既定) | 当該 tier の `availability.models[0]` (= highest available) を選ぶ。codex Plus + Pro+ user なら gpt-5.5、Pro/Free user なら gpt-5.4 |
| `gpt-5.5` | 5.5 を強制。tier の models に 5.5 が無ければ呼出を拒否 + 警告 (silent fallback しない) |
| `gpt-5.4` | 5.4 を強制 (5.5 は試さない、安定性優先 user 向け) |

### 5.5 → 5.4 fallback rule (auto mode 限定)

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

### v1 → v2 migration

既存 user (`schema_version` 不在) は `step0-gunshi-detect.md` の migration スクリプトで自動移行:

- `availability: {copilot: true, codex: true}` (bool) → `availability: {copilot: {installed: true, models: [gpt-5.4]}, ...}` (構造化)
- `preference: copilot|codex|null` (tier のみ) → `preference: {tier: copilot|codex|null, model: auto}` (model 軸追加)
- atomic backup (`env.yaml.v1.bak`) + parse 失敗時 rollback + idempotent
- migration 後の **5.5 ping は手動** (`/takumi` で「軍師の availability を再 detect」と発話、または step0-gunshi-detect.md の Stage 2 を手動実行)

## 軍師 発火基準 (cost-aware)

全タスクで軍師を呼ぶのは過剰。重要度で階層化:

| 重要度 | 発火 | 使う Tier |
|---|---|---|
| **MUST** — 公開レビュー / pilot 実験設計 / breaking change / semver major | 必須 | available 最上位 (1→2→3) |
| **SHOULD** — 大規模 plan / critical keyword 含む diff | 既定 on、user opt-out 可 | 同上 |
| **MAY** — 中規模 plan / 設計検証 | 既定 off、user opt-in | Tier 1 のみ、なければ skip |
| **SKIP** — 小規模 / ルーチン | 呼ばない | — |

Tier 3 (opus-max) は MUST タスクでのみ「最後の手段」として起動する。劣化 mode なので結果に `⚠ opus-max fallback` を明記。

## 各 tier の呼出パターン (exact syntax)

<!-- 例示は 5.5 default。Pro user で 5.5 利用不可なら env.yaml の preference.model で `gpt-5.4` 強制可 (上節「GPT-5.5 upgrade path」参照)。
  copilot は **default fallback chain から除外** (402 quota 枯渇で fallback 不能になり得るため)、user 明示 override 時のみ起動。 -->
```bash
# copilot (Copilot Pro / Pro+、user override 時のみ)
# -p: プロンプト / --silent: ログ抑制して応答のみ / --cwd: 作業 dir
# --available-tools で read-only 相当 (view/grep/glob/web_fetch のみ許可)
copilot -p "{プロンプト}" \
  --model gpt-5.5 \
  --cwd "$(pwd)" \
  --available-tools="view,grep,glob,web_fetch" \
  --silent \
  > .takumi/notepads/{name}/oracle-task-{N}.md
```

<!-- stdin heredoc / `tk_timeout 600` / 5.5 default / prompt 1.5KB 上限。
  参照ファイルは呼出側で本文を埋込み、codex に「読め」命令で hang trigger を引かない。
  `-m gpt-5.5-codex` は ChatGPT account では 400、env.yaml auto-fallback で 5.4 にエスケープする (詳細: 上節「GPT-5.5 upgrade path」)。 -->
```bash
# codex exec (ChatGPT Plus、hardening v2)
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  - <<'PROMPT' 2>&1 | tail -100
{プロンプト本文、1.5KB 以内、参照ファイルは本文埋込}
PROMPT
```

```bash
# opus-max 自己レビュー (fallback、劣化 mode)
# 棟梁 (Opus 4.8 main session) が自身に指示を出す:
#   「以下を max effort で敵対的に自問自答してください。
#    cross-model 確認ではないため同系列の盲点が残る可能性に注意:
#    {プロンプト}」
# 結果を .takumi/notepads/{name}/oracle-task-{N}.md に書き出し、
# 冒頭に "⚠ Tier: opus-max self-review (degraded mode)" を明記。
```

これらの tier の quality 等価性は pilot で検証予定 (`docs/CONTRIBUTING/pilot-driven-development.md` の方法論に従い、別リポジトリで arm A/B/C 比較)。

## invocation hardening v2 (codex CLI 長 prompt hang 対策)

codex CLI v0.125.0 は **長 prompt + sandbox** の組合せで 5 分超 hang する。read-only でも再現、`-C` を `/tmp` に逃がしても trigger。bug は CLI 側でモデル version (5.4/5.5) 非依存。以下 hardening を **全 codex exec 呼出に必須**とする:

### portable timeout — `tk_timeout` (mac / linux / windows-gitbash / wsl)

GNU `timeout` は **素の macOS に無く** (`gtimeout` も brew 未導入なら不在)、Windows の `timeout` は別物 (秒待機コマンド) で非互換。3 OS で揃えるため、全 codex/copilot 呼出は GNU `timeout` を直接使わず **`tk_timeout 600`** を使う。内部で `timeout`→`gtimeout`→pure-bash の順に degrade し、**timeout 時は常に exit 124 に正規化**する (既存の `EXIT = 124` 判定がそのまま効く)。

実行時は同一 Bash 呼出内で定義する (shell state は call 間で永続しない)。step0-gunshi-detect が `.takumi/bin/tk-timeout.sh` に install するので `source .takumi/bin/tk-timeout.sh` でも可。

```bash
tk_timeout() {  # usage: tk_timeout <secs> <command...>  (stdin/heredoc は継承)
  local secs="$1"; shift
  if command -v timeout  >/dev/null 2>&1; then timeout  "${secs}s" "$@"; return $?; fi
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "${secs}s" "$@"; return $?; fi
  "$@" &                                   # pure-bash fallback (timeout 不在の素 macOS 等)
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null ) &
  local killer=$!
  wait "$pid" 2>/dev/null; local rc=$?
  kill -TERM "$killer" 2>/dev/null; wait "$killer" 2>/dev/null
  { [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; } && return 124   # SIGTERM/KILL → timeout 正規化
  return "$rc"
}
```

> Windows は **Git Bash / WSL 前提** (bash 文脈)。`cmd.exe` / PowerShell の `timeout` は使わない。pure-bash fallback の stdin は heredoc でも継承されるが、確実性のため fallback 経路では `< "$PROMPT_FILE"` (file 渡し) を推奨。

### 必須 invocation pattern

```bash
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - <<'PROMPT' 2>&1 | tail -100
{prompt 本文、1.5KB 以内、参照ファイルは本文埋込}
PROMPT
```

| 規約 | 理由 |
|---|---|
| `tk_timeout 600` で hard cap | 正常な codex 長考 (大規模 diff レビュー等で 2-5 min) は 600s 内で完了想定。hang ケース (5 min / 27 min output 0 bytes) は 600s で確実に kill されて Tier 2 fallback に流れる |
| `--skip-git-repo-check` 必須 | sandbox trust 判定の不一致回避 (`-C` 指定でも信頼判定が暴れる) |
| `-` で stdin 経由 (heredoc) | codex 内部の file read を発生させない (hang trigger の主因) |
| prompt 上限 **1.5KB** | hang trigger 3KB の半分。超過 → 分割 or subagent fallback |
| ファイル本文は呼出側で埋込 | 「`{path} を読め`」と命令しない。`$(cat path)` で本文展開 |

### fallback chain (hang / 4xx / non-zero exit 時)

```
Tier 1: codex (600s hard timeout、long-thinking レビューは 600s 内に完了想定)
  ↓ exit 124 (timeout) | 4xx | non-zero
Tier 2: subagent (Sonnet via Agent tool)   ← default fallback
  ↓ subagent でも判定不能の極端 case
Tier 3: opus-max 自己レビュー (劣化 mode、最終手段)
```

| Tier | 課金 | 備考 |
|---|---|---|
| Tier 1 codex | ChatGPT Plus quota | default、hardening pattern 必須 |
| Tier 2 **subagent (Sonnet via Agent tool)** | Claude subscription 内、追加 API 課金なし | 確実、軍師 cross-model diversity は失われるが運用継続を優先 |
| Tier 3 opus-max | Opus session 内 | 同モデル系列 self-review、`⚠ degraded mode` 注記必須 |

**copilot を default fallback chain から除外** (402 quota 枯渇や Pro+ 未契約で fallback 不能になり得るため)。**user が明示的に「軍師を copilot に切替」と override した場合のみ Tier 1 として起動**。

### prompt 圧縮ガイドライン

- 長文 plan / diff レビューは **section 抽出** (該当 Wave / hunk のみ送る、全文送らない)
- 1.5KB を超えた時点で:
  1. 分割 (section ごとに別 query)
  2. もしくは Tier 2 subagent (Sonnet) に直接 dispatch (1.5KB 制約なし)
- ファイル参照は `$(cat path/to/file)` で **呼出側で展開**、codex に「`{path}` を読め」命令禁止

### Bash snippet (timeout 検出 + Tier 2 fallback の最小例)

```bash
RAW_OUTPUT=$(mktemp)
cat "$PROMPT_FILE" | tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - > "$RAW_OUTPUT" 2>&1
EXIT=$?

if [ "$EXIT" = "124" ] || grep -qiE '(429|401|403|400)' "$RAW_OUTPUT"; then
  # Tier 2: subagent (Sonnet via Agent tool) に同 prompt を渡す
  # 棟梁 main session から Agent tool で general-purpose subagent を spawn、
  # prompt body と「軍師の代行レビュー」役割を渡して結果を取得する
  echo "⚠ codex tier failed (exit=$EXIT), falling back to subagent (Sonnet)" >&2
  dispatch_to_subagent_sonnet "$PROMPT_FILE"
fi
```

完全な dispatch logic は `routing-mode.md`「dispatch snippet (4xx 先行判定 + actual_model 抽出 fallback)」参照 (職人(GPT-5.5) dispatch でも同 hardening pattern を使用)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `executor.md` (同ディレクトリ) | 全体 executor、本ファイルを軍師呼出時に参照 |
| `routing-mode.md` (同ディレクトリ) | 職人 code-gen の 3-mode capacity-aware routing |
| `step0-gunshi-detect.md` (skill root) | 軍師 availability 検出 + env.yaml 書き出し + tk_timeout install |
| `telemetry-spec.md` (同ディレクトリ) | `gunshi.model_fallback` emit の spec |
