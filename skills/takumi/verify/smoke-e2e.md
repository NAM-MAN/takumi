# Smoke E2E (verify skill 内部参照)

Playwright を **CI 専用 / smoke 5 本だけ** で運用する。
**ローカル禁止** が大原則。

---

## なぜローカル禁止か

ローカルで Playwright + Docker を回すと:

- Docker hang → 開発が止まる
- リソース不足 → 他作業もカクつく
- 5 本実行に 60 秒以上 → TDD のリズムを壊す
- そもそも家の Mac は CI じゃない

**E2E は CI のインフラで走らせるもの**。ローカルで動かす理由はもう無い。
ロジック検証は L1-L4 (Property-Based / Mutation / Differential / Model-based) に
完全に押し付けたので、**E2E は実 DOM の最後の砦** だけ担当。

---

## smoke 5 本の選び方

critical user journey の **最頻パスを 5 本だけ**:

| # | 例 (汎用 SaaS) | 例 (EC / マーケットプレイス) |
|---|---|---|
| 1 | サインアップ → ダッシュボード表示 | 商品検索 → 詳細 → カート追加 |
| 2 | ログイン → 主機能の使用 | ログイン → 注文履歴 |
| 3 | 検索 → 詳細表示 | 決済 → 注文確定 |
| 4 | 設定変更 → 反映確認 | レビュー投稿 |
| 5 | 設定変更 → 永続化 | 課金フロー (testnet) |

**選定基準**: そのパスが落ちたら **アプリが事実上死ぬ** ものだけ。
nice-to-have は smoke に入れない。

---

## CI 専用構成

### `.github/workflows/e2e.yml`

```yaml
name: E2E Smoke

on:
  pull_request:
  push:
    branches: [main]

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: pnpm exec playwright install --with-deps chromium

      - run: pnpm exec playwright test tests/e2e/smoke
        env:
          CI: true

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### `playwright.config.ts` (smoke 用最小構成)

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e/smoke",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 1,

  use: {
    baseURL: process.env.PREVIEW_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // Firefox / WebKit は週次のみ (smoke では Chromium 1 本)
  ],
})
```

---

## ローカルで触れる方法 (どうしても必要な時)

ローカルで Playwright スクリプトを **書く / デバッグ** する際:

```bash
# テストコード生成 (UI 操作を記録)
pnpm exec playwright codegen http://localhost:3000

# Headed (ブラウザ表示) で 1 本だけ
pnpm exec playwright test tests/e2e/smoke/login.spec.ts --headed

# UI mode (対話的)
pnpm exec playwright test --ui
```

ただし **テストの実行は CI に任せる**。push したら GitHub Actions が回す。

---

## Page Object Model (テストの保守性)

```ts
// tests/e2e/pages/HomePage.ts
import { Page, Locator } from "@playwright/test"

export class HomePage {
  readonly newProjectButton: Locator
  readonly projectList: Locator

  constructor(readonly page: Page) {
    this.newProjectButton = page.getByRole("button", { name: "新規プロジェクト" })
    this.projectList = page.locator('[data-testid="project-list"]')
  }

  async goto() {
    await this.page.goto("/")
  }

  async createProject(name: string) {
    await this.newProjectButton.click()
    await this.page.fill('[data-testid="project-name"]', name)
    await this.page.click('button[type="submit"]')
  }
}
```

```ts
// tests/e2e/smoke/create-project.spec.ts
import { test, expect } from "@playwright/test"
import { HomePage } from "../pages/HomePage"

test("プロジェクト作成 smoke", async ({ page }) => {
  const home = new HomePage(page)
  await home.goto()
  await home.createProject("Test Project")
  await expect(home.projectList).toContainText("Test Project")
})
```

---

## セレクタ方針

優先順位 (上ほど好ましい):

1. `getByRole("button", { name: "送信" })` — accessibility 連動
2. `getByLabel("メールアドレス")` — form フィールド
3. `data-testid="..."` — 明示的テスト用 hook
4. `getByText("...")` — テキストコンテンツ
5. CSS class — **使わない** (崩れやすい)

---

## Preview environment に対して実行

Vercel など preview deploy がある場合、PR ごとに preview URL が発行される。
これに対して E2E を実行すれば **本番に近い環境** で smoke を回せる:

```yaml
# .github/workflows/e2e.yml
- run: pnpm exec playwright test tests/e2e/smoke
  env:
    PREVIEW_URL: ${{ steps.vercel-preview.outputs.url }}
```

ローカル / Docker は完全不要になる。

---

## e2e-runner agent との連携

詳しい test journey 設計や flaky 検出が必要な時は **`e2e-runner` agent**
(`~/.claude/agents/e2e-runner.md`) を呼ぶ:

```
Agent(
  description: "E2E smoke 5 本生成",
  subagent_type: "e2e-runner",
  prompt: "critical user journey 5 本を Page Object Model で生成。
           ローカル実行禁止。CI 専用構成で。"
)
```

---

## 失敗時 artifact

CI 失敗時は GitHub Actions の artifact から download:

- `playwright-report/index.html` — HTML レポート
- `test-results/<test-name>/` — screenshot / video / trace
- `trace.zip` → `pnpm exec playwright show-trace trace.zip` でステップ再生

---

## Flaky 検出と対応

```
⚠️  FLAKY: tests/e2e/smoke/approve.spec.ts
Passed 7/10 (70%)
```

対策の優先順:

1. `await page.waitForResponse(...)` で API 待機 (任意 timeout 禁止)
2. `getByRole` / `data-testid` セレクタへ変更
3. アニメーション完了を `page.waitForFunction(...)` で待つ
4. それでもダメなら `test.fixme()` で quarantine + 修正タスク化

**flaky を放置しない**。1 本の不安定が CI 全体の信頼性を殺す。

---

## 制約

- ローカルで **`pnpm exec playwright test` を打たない** (codegen / debug 例外)
- smoke は **5 本上限**。詳細検証は L1-L4 に押し出す
- `data-testid` か `getByRole` でセレクタ (CSS class 禁止)
- API レスポンス待機を必ず `waitForResponse` で (任意 timeout 禁止)
- flaky 発見即 quarantine + 修正タスク化
