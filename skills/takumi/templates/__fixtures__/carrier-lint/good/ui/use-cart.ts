// FIXTURE ONLY — carrier-lint が 0 件になる正例。
// UI 層は hook 既定 (behavior-carrier.md §0 段1 / EXC4)。
// hook 名は K1 の対象外 (use* は動詞 stoplist)。

import type { Cart, CartItem } from "../domain/cart";

export function useCart(initial: Cart) {
  const addItem = (item: CartItem): Cart => initial.addItem(item);
  return { addItem };
}
