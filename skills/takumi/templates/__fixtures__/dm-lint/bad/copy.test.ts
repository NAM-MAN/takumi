// FIXTURE ONLY — dm-lint の検出確認用。
// 期待: R1 が 2 件 (headline の文字列 / 価格の数値)。3 件目は allow タグで抑止される。

import { describe, it, expect } from "vitest";
import { heroCopy, PLAN_PRICE_JPY } from "./copy";

describe("heroCopy", () => {
  // 二重管理: 文言を変えるとこのテストも直す必要がある
  it("heroCopy は見出しに LP のコピーを返すべき", () => {
    expect(heroCopy().headline).toBe("はじめての方でも 5 分で使いはじめられます");
  });

  it("PLAN_PRICE_JPY は税別価格を返すべき", () => {
    expect(PLAN_PRICE_JPY).toBe(4980);
  });

  // dm-lint-allow legal-copy: 特商法表記の CTA 文言は広告審査済みで文言自体が仕様
  it("heroCopy は審査済み CTA 文言を返すべき", () => {
    expect(heroCopy().cta).toBe("無料ではじめる");
  });
});
