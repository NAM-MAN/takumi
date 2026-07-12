# env-harness-defaults (registry)

`step0-env.md` が初回 bootstrap で参照する**環境構築テンプレの registry**。
`verify-profiles-defaults/` と同じ方式で、project へは必要なテンプレだけを copy する。

## 思想: container-zero by default

OS 非依存・最大隔離・少道具・低ストレージ・即破棄を同時に満たすため、**コンテナは原則使わない**。
理由はコンテナを呼ぶ最大の動機 (DB 等の常駐サービス) を in-process / native で潰せるから (`step0-env.md` の state tier 参照)。
darwin ではコンテナが Linux VM を抱え最も重いので、native/embedded で済む限りそちらを選ぶ。

## 2 つの tier 軸

| 軸 | 既定 | 段階 |
|---|---|---|
| **env tier** (toolchain) | L1 mise | L1 mise → L2 devenv(nix) → L3 container |
| **state tier** (DB/service) | S0 PGlite | S0 in-process(PGlite/SQLite) → S1 native(devenv services) → S2 container |

container (env L3 / state S2) は「native/embedded 不在」or「prod runtime 同一性が必須」の 2 条件のいずれかが
立った時のみ。判断ルール・導出 signal・EnvGate は `step0-env.md` に集約。

## テンプレ一覧

| ファイル | tier | 用途 |
|---|---|---|
| `mise.toml` | L1 | runtime + env + task + venv 自動 activate。全 editor/terminal の単一 source |
| `.envrc` | L1/L2 | direnv bridge。IntelliJ / VSCode / Zed / terminal が同一 env を共有 (editor 統一) |
| `devenv.nix` | L2 | hermetic 再現環境 + `services.postgres` 等を native プロセスで起動 (コンテナ不要) |
| `db-pglite.md` | S0 | PGlite を dev/test DB に。各 test で瞬時生成・並列安全・即破棄。CI のみ real PG で差分検証 |

project 固有テンプレは `.takumi/profiles/env/` に追加するだけ (registry 方式、後方互換)。
