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
> `.takumi/` は計画・状態・telemetry を含むローカル作業領域であり、**リポジトリに commit しない**。tick config が大量に git 管理下に残る実例 (`stryker.tick79.config.mjs` 等が 10+ 個追跡される) を構造的に防止するためのガード。ただし project 側で `.takumi/specs/*.md` (AC-ID の正本) を共有したい場合は個別に unignore する判断もあり得る。

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
