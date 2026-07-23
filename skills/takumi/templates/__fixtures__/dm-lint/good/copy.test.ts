// FIXTURE ONLY — dm-lint が 0 件になる正例。
// 文言は等値で固定せず、**構造契約** (存在 / 空でない / placeholder arity / リンク到達性) で守る。
// 文言を変えてもテストは壊れない = 二重管理にならない。

import { describe, it, expect } from "vitest";
import { heroCopy, HERO_HEADLINE, CTA_LABEL } from "./copy";

describe("heroCopy", () => {
  it("heroCopy は見出しと CTA を空でない文字列として返すべき", () => {
    const hero = heroCopy();
    expect(hero.headline.trim().length).toBeGreaterThan(0);
    expect(hero.cta.trim().length).toBeGreaterThan(0);
  });

  it("heroCopy は copy モジュールの定数をそのまま参照するべき", () => {
    const hero = heroCopy();
    expect(hero.headline).toBe(HERO_HEADLINE);
    expect(hero.cta).toBe(CTA_LABEL);
  });

  it("heroCopy は CTA の遷移先を内部パスとして返すべき", () => {
    expect(heroCopy().ctaHref.startsWith("/")).toBe(true);
  });
});
