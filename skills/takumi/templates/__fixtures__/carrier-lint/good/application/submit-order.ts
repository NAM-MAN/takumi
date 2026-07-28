// FIXTURE ONLY — carrier-lint が 0 件になる正例。
// application 層は function 既定 (behavior-carrier.md §0 段1)。

import type { Cart } from "../domain/cart";

export type SubmitResult = { readonly ok: boolean };

export function submitOrder(cart: Cart): SubmitResult {
  return { ok: cart.validate() };
}

export function cancelOrder(orderId: string): SubmitResult {
  return { ok: orderId.length > 0 };
}
