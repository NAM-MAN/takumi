# step0-env (内部参照)

`SKILL.md` Step 0b-2 から参照される**環境構築ハーネス**の判断ロジック。
テンプレ本体は `env-harness-defaults/` (registry)。初回 bootstrap でのみ走る (0b/0e と同じ初回 only)。

## 思想: container-zero by default

OS 非依存・最大隔離・少道具・低ストレージ・即破棄を同時に満たすため、**コンテナは原則使わない**。
コンテナを呼ぶ最大の動機 (DB 等の常駐サービス) を in-process / native で潰せば、コンテナはほぼ消える。
darwin ではコンテナが Linux VM を抱え最も重い ⇒ native/embedded で済む限りそちらを選ぶ。

判断は**新規機構ではなく導出**。takumi が Step 0 で既に集めた signal (0a-2 言語検出 / surface trust 軸 /
契約スパイン I6) からそのまま tier が決まる。0a-2 の mutation tier 導出の隣に env/state tier 導出を 1 個足すだけ。

---

## 2 つの tier 軸

### env tier (toolchain)

| signal (収集済) | → tier | 生成物 |
|---|---|---|
| **既定** (特別な signal なし) | **L1 mise** | `mise.toml` + `.envrc` (`use mise`) |
| 再現性要 (チーム共有 / CI byte 一致 / 「確実に同じ環境」語彙 = 既存 Full Spec trigger) | **L2 devenv** | `devenv.nix` + `.envrc` (`use devenv`) |
| カーネル隔離要 (surface `trust` = system/untrusted、システムスタック衝突) | **L3 container** | `.devcontainer/` (podman 互換) |

### state tier (DB / service)

| I6 / DDP signal (契約スパインで収集済) | → tier | dev / test | CI / prod-parity |
|---|---|---|---|
| 永続なし / ephemeral | **S0-mem** | in-process map | — |
| SQL・dev/test・特殊 PG 機能なし | **S0-pglite** (既定) | PGlite (file/:memory:) | devenv `services.postgres` |
| 本物の PG 意味論が local で要る (並行/拡張/NOTIFY) | **S1-native** | devenv `services.postgres` | 同上 |
| native/embedded 不在 or prod runtime 同一性必須 | **S2-container** | (最終手段・要記録) | container |

> [!IMPORTANT]
> 典型 CRUD は **L1 mise + S0-pglite** に着地 → コンテナは発火しない。
> container (env L3 / state S2) は「**native/embedded 不在**」or「**prod runtime 同一性が必須**」の
> 2 条件のいずれかが立った時のみ。env L3 を駆動する要因は state 側 (S0/S1) で吸収されるので、両軸連動で
> コンテナが真に例外になる。recipe 詳細は `env-harness-defaults/db-pglite.md`。

---

## EnvGate.resolveTier() — 既存環境の尊重 (侵襲ゼロ)

backlog の auto-detect と対称な precedence。**既存 config は上書きしない**:

```
explicit (project.yaml.env.tier) > 既存 config 検出 > signal 導出 > L1 / S0 既定
```

「既存 config 検出」= 以下のいずれかが既にある → **adopt (尊重・silent・上書きしない)**、tier だけ記録:

- env: `mise.toml` / `.mise.toml` / `devenv.nix` / `flake.nix` / `.devcontainer/` / `Dockerfile`
- state: `docker-compose.yml`(DB 定義) / 既存 `DATABASE_URL` を指す外部 PG

auto-detect は explicit を**上書きしない** (backlog の auto-detect と同原則)。

---

## bootstrap 手順 (初回・idempotent)

`project.yaml.env` が無い & 既存 config 不在の時のみテンプレ生成。bash + grep のみ (yq 非依存)。

```bash
# Step 1: 既存 env config 検出 → あれば adopt して silent return
existing=""
for f in mise.toml .mise.toml devenv.nix flake.nix Dockerfile; do
  [ -e "$f" ] && existing="$f" && break
done
[ -d .devcontainer ] && existing=".devcontainer"

# Step 2: env tier 導出 (既存なければ。既定 L1)
#   L2 昇格: CLAUDE.md/project.yaml に「チーム/再現/確実に同じ環境」語彙 or CI 設定が repro 要求
#   L3 昇格: surface trust 軸が system/untrusted (0a で収集済)。darwin では特に保守的に
env_tier="L1"   # 導出ロジックは棟梁が上表で判定し代入

# Step 3: state tier 導出 (契約スパイン I6。既定 S0-pglite。DB 不要なら S0-mem)
state_tier="S0-pglite"

# Step 4: テンプレ copy (L1 既定のみ自動。L2/L3/S1/S2 は提案後に copy)
if [ -z "$existing" ] && [ "$env_tier" = "L1" ]; then
  cp -n ~/.claude/skills/takumi/env-harness-defaults/mise.toml ./mise.toml
  cp -n ~/.claude/skills/takumi/env-harness-defaults/.envrc    ./.envrc
  # PGlite は .data/ を ephemeral として ignore
  grep -qE '^\.data/' .gitignore 2>/dev/null || printf '.data/\n' >> .gitignore
fi
# 言語行は 0a-2 の検出結果で mise.toml の [tools] を埋める (棟梁が編集)
```

> [!IMPORTANT]
> **L1 + S0 のみ自動生成**。L2/L3/S1/S2 は重い決定なので「`devenv.nix` を置きますか?」等を
> `OfferPolicy` 風に 1 回提案 → 承認後に copy。コンテナ (L3/S2) は takumi から提案すらせず、
> ユーザー明示要求 or 上記 2 条件成立時のみ。

`project.yaml` への `env:` 節記録 (idempotent append) は `step0-bootstrap.md`「project.yaml.env セクション」を参照。

---

## editor 統一 (terminal + IntelliJ / VSCode / Zed)

`.envrc` が単一 bridge。1 定義 → 全 consumer が同一 SDK/PATH/env を共有:

- **Zed**: direnv ネイティブ対応 (.envrc を自動で project env / LSP に反映)
- **VSCode**: 拡張 `mkhl.direnv` で .envrc を editor env へ
- **IntelliJ**: direnv plugin (+ JVM の Project SDK だけは mise の JDK path に 1 度向ける)

バージョンを `mise.toml` / `devenv.nix` で 1 箇所変えれば terminal + 3 editor が追従。

## 破棄 / ストレージ

生成 config にコメント同梱: `mise prune` / `uv cache prune` / `pnpm store prune` /
(L2 時) `nix-collect-garbage -d`。project 破棄は `rm -rf <dir>` のみ (hardlink なので実体を巻き込まない)。
