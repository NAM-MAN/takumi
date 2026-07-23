// FIXTURE ONLY — dm-lint が 0 件になる正例 (被テスト実装側)。

export const HERO_HEADLINE = "はじめての方でも 5 分で使いはじめられます";
export const CTA_LABEL = "無料ではじめる";

export type Hero = { readonly headline: string; readonly cta: string; readonly ctaHref: string };

export function heroCopy(): Hero {
  return { headline: HERO_HEADLINE, cta: CTA_LABEL, ctaHref: "/signup" };
}
