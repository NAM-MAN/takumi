// FIXTURE ONLY — dm-lint の検出確認用 (被テスト実装側)。
// LP 文言のような「事実そのもの」を保持するモジュール。

export const HERO_HEADLINE = "はじめての方でも 5 分で使いはじめられます";
export const CTA_LABEL = "無料ではじめる";
export const PLAN_PRICE_JPY = 4980;

export function heroCopy(): { readonly headline: string; readonly cta: string } {
  return { headline: HERO_HEADLINE, cta: CTA_LABEL };
}
