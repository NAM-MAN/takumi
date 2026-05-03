# step0-bootstrap (内部参照)

`SKILL.md` Step 0b から参照される初回 bootstrap の詳細。

## profiles の defaults コピー

```bash
mkdir -p .takumi/profiles/verify .takumi/profiles/design
cp ~/.claude/skills/takumi/verify-profiles-defaults/*.yaml .takumi/profiles/verify/
cp ~/.claude/skills/takumi/design/profiles-defaults/*.yaml .takumi/profiles/design/  # ui/mixed のみ
```

project 固有 profile は `.takumi/profiles/` に yaml を追加するだけ (registry 方式)。

## .gitignore への追加行

`.takumi/` 配下と verify-loop が生成する ephemeral artifact を登録 (既存行は skip):

```
# takumi (計画・状態・sprint・telemetry・verify-loop の中間成果物)
.takumi/

# verify-loop が吐く Stryker tick artifact (ephemeral、追跡禁止)
stryker.tick*.config.mjs
vitest.stryker-*.config.ts
.stryker-tmp/
reports/stryker/
```

> [!IMPORTANT]
> `.takumi/` は計画・状態・telemetry を含むローカル作業領域で、**default は全体 ignore**。tick config が大量に git 管理下に残る実例 (`stryker.tick79.config.mjs` 等が 10+ 個追跡される) を構造的に防止するためのガード。

### チーム運用で個別 unignore する場合

以下のサブディレクトリはチームで共有したい場合、`.gitignore` に例外行を追加する:

```
.takumi/
# ディレクトリの unignore は `!dir/` と `!dir/**` の両方が必要 (子ファイル再包含)
!.takumi/plans/
!.takumi/plans/**              # PR に plan を添えてレビューする運用
!.takumi/specs/
!.takumi/specs/**              # AC-ID をチームの契約 (source of truth) に
!.takumi/design/
!.takumi/design/**             # デザイン成果物の共有
!.takumi/profiles/
!.takumi/profiles/verify/
!.takumi/profiles/verify/**    # チーム共通 verify 基準
!.takumi/profiles/design/
!.takumi/profiles/design/**    # チーム共通 design 基準
.takumi/profiles/env.yaml      # ただし env.yaml (軍師 routing の user 固有 preference) は共有しない
```

**絶対 ignore を維持するもの** (unignore しない):
- `sprints/` — セッション固有の発見ログ、共有すると雑音
- `telemetry/` — 内部メトリクス、個人環境差が残る
- `control/` — 一時停止フラグ、session で使い捨て
- `drafts/` / `notepads/` — 作業中の走り書き
- `state.json` / `discovery-calibration.jsonl` — session state
- `profiles/env.yaml` — 軍師 routing の user preference (CLI availability + quota rotation)

判断基準: 「他開発者 or 未来の自分が読んで得をするか」が Yes のものだけ unignore。個人開発では全部 default (ignore) のままが自然。

## 他言語プロジェクトでの補足

Stryker 非対応言語 (Python, Go) は `.gitignore` の `stryker.tick*.config.mjs` / `vitest.stryker-*.config.ts` / `.stryker-tmp/` 行は不要だが、害にもならないため残してよい。代わりに以下を追加:

```
# Python (mutmut 利用時)
.mutmut-cache

# Rust (cargo-mutants 利用時)
mutants.out/
mutants.out.old/

# Go (gremlins 利用時)
.gremlins/
```

profile の `mutation_tool` field に応じて takumi が初回に提案する。

## 軍師 routing の availability 検出 (初回のみ)

利用者環境で使える GPT 系列 CLI を検出し `.takumi/profiles/env.yaml` に保存。詳細は `executor.md` の「軍師 routing (3-tier + quota rotation)」「GPT-5.5 upgrade path」節:

### 4 stage detection (新規 user / env.yaml 不在時)

```bash
mkdir -p .takumi/profiles

# Stage 1: CLI installed 確認
codex_installed=false
copilot_installed=false
command -v codex   > /dev/null && codex_installed=true
command -v copilot > /dev/null && copilot_installed=true

# Stage 2: 5.5 ping (installed tier のみ、1 token 程度の cost)
codex_models='[gpt-5.4]'
copilot_models='[gpt-5.4]'
if [ "$codex_installed" = true ]; then
  # 短 prompt (1 token) なので hang trigger ではないが、`--skip-git-repo-check` で sandbox trust 問題回避、`timeout 30s` で念のため hard cap
  if timeout 30s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" "1" >/dev/null 2>&1; then
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

**強化点** (2026-04-28、Wave 5 oracle 指摘反映):
- `cp -n` で既存 backup を上書きしない (複数回 migration 試行時の保護)
- `schema_version: 2` ガードで再実行 idempotent (notes 二重追記を防ぐ)
- `notes` が None / dict の場合の型 guard (TypeError 防止)
- `datetime.now(timezone.utc)` で deprecated warning 回避 (Python 3.12+)
- rollback は `mv` ではなく `cp` で backup 自体を保持 (再試行可能)

> [!IMPORTANT]
> migration 後も 5.5 を実際に使うには再 detect が必要 (Stage 2 の ping)。`migrated_from_v1_at` が記録されている user に対し、棟梁が 1 度だけ「軍師に gpt-5.5 を試すには Step 0 detection を再実行してください」と通知する。

### preference の自然言語切替 (既存)

**primary_tier は user 宣言**: detection だけでは決めない (毎回クォータを見ない運用)。両方持ちで月次 rotate する user が典型的なので、`preference` を自然言語で切り替える方式を採る:

- 「軍師を codex に切り替えて」「gunshi copilot」「gunshi を opus に」 → `preference.tier` 書き換え
- 「軍師を 5.5 に」「軍師の model を 5.4 に固定」「軍師の model を auto に戻して」 → `preference.model` 書き換え
- availability が false の tier に切替要求 → 拒否 + 警告
- preference が null のまま実行 → availability 順で自動 (copilot > codex > opus-max)

どちらの CLI も無い利用者 (opus-max のみ) には、棟梁が「cross-model 効果が損なわれるため Copilot Pro+ か ChatGPT Plus の契約を推奨」と warning を出す (強制はしない)。
