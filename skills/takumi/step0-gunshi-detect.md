# step0-gunshi-detect (内部参照)

`dispatch/gunshi-invocation.md` / `SKILL.md` Step 0・Step 2 から参照される、軍師 (GPT 系列) routing の **初回 availability 検出 + `.takumi/profiles/env.yaml` 書き出し + v1→v2 migration + preference 自然言語切替**。`step0-bootstrap.md` から分離 (per-file 予算)。0b/0e と同じく**初回 bootstrap でのみ走る**。3-tier routing 規約は `gunshi-invocation.md` と対で読む。

---

## 軍師 routing の availability 検出 (初回のみ)

利用者環境で使える GPT 系列 CLI を検出し `.takumi/profiles/env.yaml` に保存。詳細は `gunshi-invocation.md` の「軍師 routing (3-tier + quota rotation)」「GPT-5.5 upgrade path」節:

### 4 stage detection (新規 user / env.yaml 不在時)

```bash
mkdir -p .takumi/profiles .takumi/bin

# Stage 0: portable timeout helper を install (timeout 不在の mac/windows でも hang protection を効かせる)
#   正準定義は gunshi-invocation.md §portable-timeout。全 codex/copilot 呼出が source して使う。
cat > .takumi/bin/tk-timeout.sh <<'TKEOF'
tk_timeout() {  # usage: tk_timeout <secs> <command...>  (timeout→gtimeout→pure-bash、timeout 時 exit 124 正規化)
  local secs="$1"; shift
  if command -v timeout  >/dev/null 2>&1; then timeout  "${secs}s" "$@"; return $?; fi
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "${secs}s" "$@"; return $?; fi
  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null ) &
  local killer=$!
  wait "$pid" 2>/dev/null; local rc=$?
  kill -TERM "$killer" 2>/dev/null; wait "$killer" 2>/dev/null
  { [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; } && return 124
  return "$rc"
}
TKEOF
source .takumi/bin/tk-timeout.sh

# Stage 1: CLI installed 確認
codex_installed=false
copilot_installed=false
command -v codex   > /dev/null && codex_installed=true
command -v copilot > /dev/null && copilot_installed=true

# Stage 2: 5.5 ping (installed tier のみ、1 token 程度の cost)
codex_models='[gpt-5.4]'
copilot_models='[gpt-5.4]'
if [ "$codex_installed" = true ]; then
  # 短 prompt (1 token) なので hang trigger ではないが、`--skip-git-repo-check` で sandbox trust 問題回避、`tk_timeout 30` で念のため hard cap
  if tk_timeout 30 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" "1" >/dev/null 2>&1; then
    codex_models='[gpt-5.5, gpt-5.4]'
  fi
fi
if [ "$copilot_installed" = true ]; then
  # 注: copilot 5.5 は Pro+ 必須。quota 0 user が多いので 1 回だけ silent ping
  if copilot -p "1" --model gpt-5.5 --silent >/dev/null 2>&1; then
    copilot_models='[gpt-5.5, gpt-5.4]'
  fi
fi

# Stage 3: env.yaml v2 schema で書き出し
{
  echo "gunshi:"
  echo "  schema_version: 2"
  echo "  detected_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  availability:"
  echo "    codex:   {installed: $codex_installed,   models: $codex_models}"
  echo "    copilot: {installed: $copilot_installed, models: $copilot_models}"
  echo "  preference:"
  echo "    tier: null    # 'copilot' / 'codex' / 'opus-max'。null なら availability 順で自動"
  echo "    model: auto   # 'auto' / 'gpt-5.5' / 'gpt-5.4'。auto = tier 内 models[0]"
  echo "  last_switched_at: null"
  echo "autonomy:"
  echo "  level: autonomous            # manual | gated | autonomous (既定 autonomous = Wave 間無人実行)"
  echo "  human_floor: irreversible    # 不可逆操作のみ human (autonomy.md §2 の 2 層判定)"
} > .takumi/profiles/env.yaml

# Stage 4: 検証 (yaml が valid か簡易 parse)
python3 -c "import yaml; yaml.safe_load(open('.takumi/profiles/env.yaml'))" || \
  echo "⚠ env.yaml parse 失敗、手動確認推奨"
```

### 既存 v1 → v2 migration (既存 user 向け、`schema_version` 不在時 trigger)

```bash
# atomic backup (既存 .v1.bak を上書きしないよう -n)
cp -n .takumi/profiles/env.yaml .takumi/profiles/env.yaml.v1.bak

# v1 を読んで v2 に変換 (preference.tier は完全保持、idempotent)
python3 <<'PY'
import yaml, datetime, sys
from datetime import timezone

with open('.takumi/profiles/env.yaml') as f:
    cur = yaml.safe_load(f) or {}

g = cur.get('gunshi', {})

# idempotent guard: 既に v2 (schema_version: 2) ならスキップ
if g.get('schema_version') == 2:
    print('already v2, skipping migration', file=sys.stderr)
    sys.exit(0)

# notes が None / dict / 文字列いずれでも安全に文字列化
notes_raw = g.get('notes')
notes_str = '' if notes_raw is None else (notes_raw if isinstance(notes_raw, str) else yaml.safe_dump(notes_raw))

avail = g.get('availability', {}) or {}
v2 = {'gunshi': {
    'schema_version': 2,
    'detected_at': g.get('detected_at'),
    'migrated_from_v1_at': datetime.datetime.now(timezone.utc).isoformat(),
    'availability': {
        'codex':   {'installed': bool(avail.get('codex',   False)), 'models': ['gpt-5.4']},
        'copilot': {'installed': bool(avail.get('copilot', False)), 'models': ['gpt-5.4']},
    },
    'versions': g.get('versions', {}) or {},
    'auth': g.get('auth', {}) or {},
    'preference': {'tier': g.get('preference'), 'model': 'auto'},
    'last_switched_at': g.get('last_switched_at'),
    'notes': notes_str + '\n--\nmigrated v1→v2 (schema_version 追加、availability 構造化、preference.model: auto 追加)',
}}
with open('.takumi/profiles/env.yaml', 'w') as f:
    yaml.safe_dump(v2, f, sort_keys=False, allow_unicode=True)
PY

# parse 失敗時 rollback
python3 -c "import yaml; yaml.safe_load(open('.takumi/profiles/env.yaml'))" || \
  { echo "⚠ migration 失敗、rollback"; cp .takumi/profiles/env.yaml.v1.bak .takumi/profiles/env.yaml; exit 1; }
```

**強化点**:
- `cp -n` で既存 backup を上書きしない (複数回 migration 試行時の保護)
- `schema_version: 2` ガードで再実行 idempotent (notes 二重追記を防ぐ)
- `notes` が None / dict の場合の型 guard (TypeError 防止)
- `datetime.now(timezone.utc)` で deprecated warning 回避 (Python 3.12+)
- rollback は `mv` ではなく `cp` で backup 自体を保持 (再試行可能)

> [!IMPORTANT]
> migration 後も 5.5 を実際に使うには再 detect が必要 (Stage 2 の ping)。`migrated_from_v1_at` が記録されている user に対し、棟梁が 1 度だけ「軍師に gpt-5.5 を試すには Step 0 detection を再実行してください」と通知する。

### preference の自然言語切替

**primary_tier は user 宣言**: detection だけでは決めない (毎回クォータを見ない運用)。両方持ちで月次 rotate する user が典型的なので、`preference` を自然言語で切り替える方式を採る:

- 「軍師を codex に切り替えて」「gunshi copilot」「gunshi を opus に」 → `preference.tier` 書き換え
- 「軍師を 5.5 に」「軍師の model を 5.4 に固定」「軍師の model を auto に戻して」 → `preference.model` 書き換え
- availability が false の tier に切替要求 → 拒否 + 警告
- preference が null のまま実行 → availability 順で自動 (copilot > codex > opus-max)

どちらの CLI も無い利用者 (opus-max のみ) には、棟梁が「cross-model 効果が損なわれるため Copilot Pro+ か ChatGPT Plus の契約を推奨」と warning を出す (強制はしない)。
