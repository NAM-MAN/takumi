# AI Review (verify skill 内部参照)

AI が書いたコードを **別の AI** にレビューさせる。
**Cross-model = blind spot の非対称性** で品質を担保する。

---

## なぜ 軍師 (gpt-5.4 / codex)

Claude が書いたコードを Claude にレビューさせると、訓練データ・推論パターンが
共通で同じ盲点を持つ。GPT-5.4 (軍師) に投げると:

- 訓練データが違う
- アーキテクチャが違う
- 好みのバイアスが違う

→ Claude が見逃すバグを GPT が拾う、その逆も。
**Differential Testing と同じ思想** を AI レビューに適用したもの。

sweep の Phase 2e (Coherence Verification) や exec の 軍師 role が既に
軍師 (gpt-5.4 via codex CLI) を verification 役で使っている。
**ai-review もこの流儀に統一** する。学習コスト 0、ワークフロー一貫性 確保。

---

## ローカル pre-push (主)

`.husky/pre-push`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

DIFF=$(git diff --staged)
[ -z "$DIFF" ] && exit 0

echo "$DIFF" | codex exec --model gpt-5.4 "
以下の git diff を 3 観点でレビューし、CRITICAL/HIGH があれば JSON で返せ:

1. セキュリティ: OWASP Top 10、認証/認可、入力検証、秘密情報漏洩
2. アーキテクチャ: 関心の分離、レイヤ違反、責務重複、命名一貫性
3. コード品質: 関数 50 行超、ファイル 800 行超、ネスト 4+、immutable 違反、
   エラーハンドリング、verify (L1/L2/L4) が適用されてるか

出力 JSON のみ:
{
  \"verdict\": \"approve\" | \"block\",
  \"issues\": [{\"severity\": \"CRITICAL|HIGH|MEDIUM\", \"category\": \"...\",
                \"file\": \"...\", \"line\": N, \"issue\": \"...\", \"fix\": \"...\"}]
}
" > .verify-review.json

VERDICT=$(jq -r .verdict .verify-review.json)
if [ "$VERDICT" = "block" ]; then
  jq . .verify-review.json
  echo "軍師 review blocked. Fix CRITICAL/HIGH or override with --no-verify."
  exit 1
fi
```

3 観点を **1 プロンプトに圧縮** = 1 PR で 軍師 1 呼出 = コスト最小。

---

## CI PR ゲート (主)

`.github/workflows/oracle-review.yml`:

```yaml
name: 軍師 Review
on: pull_request

jobs:
  oracle-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - name: Install codex CLI
        run: npm install -g @openai/codex

      - name: 軍師 review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          git diff origin/${{ github.base_ref }}...HEAD | \
            codex exec --model gpt-5.4 "$(cat .github/prompts/review.txt)" \
            > review.json

      - name: Post review to PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const review = JSON.parse(fs.readFileSync('review.json'))
            const body = `## 軍師 Review (gpt-5.4)\n\n` +
              review.issues.map(i =>
                `**[${i.severity}]** \`${i.file}:${i.line}\`\n${i.issue}\n→ ${i.fix}`
              ).join('\n\n')
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            })
            if (review.verdict === 'block') {
              core.setFailed('軍師 blocked: CRITICAL/HIGH issues')
            }
```

`.github/prompts/review.txt` には pre-push と同じプロンプトを置く (DRY)。

---

## 代替: claude-code-action (codex を持ってない人向け)

OpenAI API key が無く Anthropic API key だけある場合の fallback:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    prompt: |
      この PR をセキュリティ・アーキ・コード品質の 3 観点でレビュー
```

ただし **Claude が書いたコードを Claude がレビュー** = blind spot 共通 = 弱い。
**軍師 (gpt-5.4) が利用可能なら必ずそちらを使う**。

---

## 探索テスト (Stagehand 不可、代替案)

「ランダムにアプリを叩いて壊す」探索テスト用途:

| ツール | サブスクで動く? | 備考 |
|---|---|---|
| Stagehand | いいえ | Anthropic API key 直接消費 |
| Playwright MCP | はい | `claude mcp add playwright -- npx @playwright/mcp@latest` |
| Claude Agent SDK (subscription mode) | はい | 自前スクリプト用 |

→ 自動探索が欲しくなったら Playwright MCP から始める。

---

## false positive への対処

軍師 レビューも 30% は誤検出 (経験則)。**盲信せず無視判断ができる文化**:

- 軍師 指摘を必ず読む (無視するにせよ確認はする)
- 「これは意図的」と判断したら PR コメントで反論
- 同じ false positive が 3 回出たら CLAUDE.md に明記
- 反論パターンを `.github/prompts/review.txt` に追記して 軍師 に学習させる

---

## 既存スキルとの分担

- **verify L6** (本ファイル) = CI / pre-push の AI ゲート (軍師 一発呼出)
- 組み込み `/review` = 対話的レビュー (ローカル、Claude)
- 組み込み `/security-review` = 対話的セキュリティレビュー (ローカル、Claude)
- **sweep Phase 2e** = 軍師 Synthesis 検証 (verify とは別目的)

→ verify L6 は **CI / pre-push ゲート専用、軍師 一発呼出**。
対話的レビューは組み込みコマンド (Claude 系) に任せる。

---

## 制約

- OPENAI_API_KEY は GitHub Secrets で管理 (commit 禁止)
- 1 PR = 1 軍師 呼出 (3 観点を 1 プロンプトに圧縮、コスト最小)
- 軍師 指摘は読む / 判断する / 反論する。盲信も無視も禁止
- false positive 定形化したら `.github/prompts/review.txt` と CLAUDE.md に反映
- claude-code-action は cross-model 性が無いので fallback 用のみ
