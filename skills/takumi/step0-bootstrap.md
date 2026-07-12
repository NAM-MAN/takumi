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
.takumi/*
# 要点: 親は ".takumi/*" (単層除外) にする。bare ".takumi/" だと git が親ディレクトリ除外で子を再包含できず、以下の ! が一切効かない。".takumi/*" なら直下の各子のみ除外され、!.takumi/<sub>/ で再包含可能 (子孫の "**" 行は冗長だが無害)
!.takumi/plans/
!.takumi/plans/**              # PR に plan を添えてレビューする運用
!.takumi/specs/
!.takumi/specs/**              # AC-ID をチームの契約 (source of truth) に
!.takumi/design/
!.takumi/design/**             # デザイン成果物の共有
!.takumi/backlog/
!.takumi/backlog/**            # 内蔵 backlog (project.yaml.backlog.mode == enabled のときのみ。Step 0e 参照)
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

## project.yaml.backlog セクション (Step 0e 連携)

Step 0e (backlog mode 判定) で `BacklogGate.resolveMode()` が読む。初回 bootstrap 時、`project.yaml` に `backlog:` セクションが**無ければ**追加する (既存値は touch しない、idempotent):

```yaml
# .takumi/project.yaml に追加 (既存セクションがあれば skip)
backlog:
  mode: unset                  # unset | enabled | external | deferred
  external_tool: null          # mode == external 時のみ
  deferred_until: null         # mode == deferred 時のみ (YYYY-MM-DD)
  bootstrapped_at: null        # mode == enabled 時のみ (YYYY-MM-DD)
```

bootstrap snippet (bash + sed のみ、yq / python yaml 依存なし):

```bash
# project.yaml が無ければ空作成、backlog: セクション不在時のみ append
test -f .takumi/project.yaml || touch .takumi/project.yaml
if ! grep -qE '^backlog:' .takumi/project.yaml; then
  printf '\nbacklog:\n  mode: unset\n  external_tool: null\n  deferred_until: null\n  bootstrapped_at: null\n  fresh_bootstrap: false\n' >> .takumi/project.yaml
fi
```

#### `mode == enabled` 確定時の bootstrap (idempotent)

`BacklogGate.resolveMode()` が `enabled` を返した時のみ実行 (再 bootstrap でも副作用ゼロ):

```bash
# Step 1: ディレクトリ作成 (既存なら touch しない)
mkdir -p .takumi/backlog/{open,doing,done}

# Step 2: README テンプレを bootstrap (既存なら skip)
if [ ! -f .takumi/backlog/README.md ]; then
  cp ~/.claude/skills/takumi/templates/backlog-readme.md .takumi/backlog/README.md
fi

# Step 3: backlog のみ git tracked に (.takumi/* idiom)
#   bare ".takumi/" は親除外で子を再包含できない (git 仕様)。".takumi/*" (単層除外) に正規化してから
#   "!.takumi/backlog/" を足す。state.json/telemetry/profiles/env.yaml 等は除外維持。
#   "!.takumi/" 親 un-ignore は .takumi/ 全体を leak させるため使わない。
if grep -qE '^\.takumi/$' .gitignore 2>/dev/null; then
  sed -i.bak 's|^\.takumi/$|.takumi/*|' .gitignore && rm -f .gitignore.bak   # 既存 bare 行を正規化
fi
grep -qE '^\.takumi/\*' .gitignore 2>/dev/null || printf '.takumi/*\n' >> .gitignore
grep -qE '^!\.takumi/backlog/' .gitignore 2>/dev/null || printf '!.takumi/backlog/\n' >> .gitignore

# Step 4 + 5: bootstrapped_at + fresh_bootstrap を bash + sed で atomic 更新
#   (BSD/GNU portable: -i.bak で backup 作って削除)
today=$(date -u +%Y-%m-%d)
if grep -qE '^  bootstrapped_at: null' .takumi/project.yaml; then
  sed -i.bak "s|^  bootstrapped_at: null|  bootstrapped_at: $today|" .takumi/project.yaml
  sed -i.bak 's|^  fresh_bootstrap: false|  fresh_bootstrap: true|' .takumi/project.yaml
  rm -f .takumi/project.yaml.bak
fi
# 再 bootstrap 時 (bootstrapped_at セット済) は fresh_bootstrap: false のまま (migration skip)
```

> [!IMPORTANT]
> 全 step が idempotent (再実行で副作用ゼロ)。手動編集された README やディレクトリは保護される。`bootstrapped_at` は初回のみ記入、以降は touch しない (履歴)。**Step 5 の `fresh_bootstrap` flag** が `true` の時のみ migration が起動する。

> [!WARNING]
> **OSS / 公開リポジトリは Step 3 の `!.takumi/backlog/` (backlog tracking) を適用しない**。内蔵 backlog は内部 issue を含み、公開すると漏洩する。公開 repo では backlog を **local-only** (= `.takumi/` を bare のまま、または `.gitignore` に明示 `.takumi/backlog/`) に保つ。`mode: enabled` でも tracking とは独立 (bootstrap は dir/README を作るが、公開 repo では gitignore 例外を足さない)。takumi 自身がこの運用 (OSS、backlog は `.gitignore` で明示 ignore)。

mode 解決の優先順位 / 状態遷移 / external silent 契約の詳細は `backlog-mode.md` (+ `backlog/schema-project-yaml.md`) を参照。

> [!IMPORTANT]
> `backlog.mode` を auto-detect で上書きしない。explicit な project.yaml 値は最優先。auto-detect (existing `.takumi/backlog/` 等) は `mode == null` の時のみ動作。

## project.yaml.requirements セクション (toishi 連携、Step 0_pre)

Step 0_pre (外部要件 source 連携の auto-detect) で `ToishiGate.resolveMode()` が読む。初回 bootstrap 時、`project.yaml` に `requirements:` セクションが**無ければ**追加する (既存値は touch しない、idempotent、backlog 節と同パターン):

```yaml
# .takumi/project.yaml に追加 (既存セクションがあれば skip)
requirements:
  source: unset        # unset | toishi | local | never
  toishi:
    project_id: null   # mode == toishi 時のみ
    last_snapshot_at: null
```

bootstrap snippet (bash + sed のみ、idempotent、backlog 方式踏襲):

```bash
test -f .takumi/project.yaml || touch .takumi/project.yaml
if ! grep -qE '^requirements:' .takumi/project.yaml; then
  printf '\nrequirements:\n  source: unset\n  toishi:\n    project_id: null\n    last_snapshot_at: null\n' >> .takumi/project.yaml
fi
```

### Step 0_pre detection (auto-detect)

`project.yaml.requirements.source` が `unset` の時のみ実行。**2 signals に限定** (ENV `TOISHI_API_KEY` は CI 偶発検出 + non-TTY hang リスクのため signal にしない):

```bash
# 既に explicit なら skip (auto-detect は explicit を上書きしない)
source=$(grep -E '^  source:' .takumi/project.yaml | awk '{print $2}')
if [ "$source" != "unset" ] && [ -n "$source" ]; then
  return 0   # 確定済、何もしない
fi

# Signal 1+2: .mcp.json / .cursor/mcp.json で toishi を含む server 定義
detected=false
if [ -f .mcp.json ] && grep -qi 'toishi' .mcp.json 2>/dev/null; then detected=true; fi
if [ -f .cursor/mcp.json ] && grep -qi 'toishi' .cursor/mcp.json 2>/dev/null; then detected=true; fi

if [ "$detected" != true ]; then
  return 0   # 完全未検出 = 完全 silent (toishi-less ユーザーへ侵襲ゼロ)
fi

# 検出済 + interactive TTY のみ 1-time confirm 発火
if [ ! -t 0 ]; then
  return 0   # 非 TTY (CI / pipe) は silent skip、unset のまま残す
fi

# ここから先は toishi-integration.md の §`ToishiGate.resolveMode()` + §1-time confirm UX に委譲
# 棟梁が user に y/n/never を提示し、回答を sed で source: に書き戻す
```

> [!IMPORTANT]
> 全 step が **silent on negative** (未検出時 echo / printf / log なし、return 0)。toishi-less project でこの bootstrap が走っても user は何も気づかない。
>
> auto-detect は explicit を**上書きしない** (backlog と同原則)。explicit な `project.yaml.requirements.source` 値は最優先。

mode 解決の優先順位 / 3 状態の遷移 / `ToishiGate.shouldFetch(stage)` 中央化 / G1.5 gate / silent degrade 詳細は `toishi-integration.md` 参照。

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

初回 bootstrap での GPT 系列 CLI 検出 + `.takumi/profiles/env.yaml` 書き出し + v1→v2 migration + preference 切替は **`step0-gunshi-detect.md`** に分離した (per-file 予算)。`gunshi-invocation.md` の 3-tier routing と対で読む。
