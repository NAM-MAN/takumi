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

## 軍師 routing の availability 検出 (初回のみ)

利用者環境で使える GPT 系列 CLI を検出し `.takumi/profiles/env.yaml` に保存。詳細は `executor.md` の「軍師 routing (3-tier + quota rotation)」節:

```bash
mkdir -p .takumi/profiles
{
  echo "gunshi:"
  echo "  detected_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  availability:"
  command -v copilot > /dev/null && echo "    copilot: true" || echo "    copilot: false"
  command -v codex   > /dev/null && echo "    codex: true"   || echo "    codex: false"
  echo "  preference: null  # 'copilot' / 'codex' / 'opus-max'。null なら availability 順で自動選択"
  echo "  last_switched_at: null"
} > .takumi/profiles/env.yaml
```

**primary_tier は user 宣言**: detection だけでは決めない (毎回クォータを見ない運用)。両方持ちで月次 rotate する user が典型的なので、`preference` を自然言語で切り替える方式を採る:

- 「軍師を codex に切り替えて」「gunshi copilot」「gunshi を opus に」等の発話 → `preference` 書き換え
- availability が false の tier に切替要求 → 拒否 + 警告
- preference が null のまま実行 → availability 順で自動 (copilot > codex > opus-max)

どちらの CLI も無い利用者 (opus-max のみ) には、棟梁が「cross-model 効果が損なわれるため Copilot Pro か ChatGPT Plus の契約を推奨」と warning を出す (強制はしない)。
