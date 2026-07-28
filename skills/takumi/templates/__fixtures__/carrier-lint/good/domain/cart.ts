// FIXTURE ONLY — carrier-lint が 0 件になる正例。
// domain 層は method / SVO 既定 (behavior-carrier.md §0 段1)。
// 不変条件を所有する操作だけを method に置き、persistence/transport/I/O は持たない。

export type CartItem = { readonly sku: string; readonly qty: number };

export class Cart {
  constructor(private readonly items: readonly CartItem[] = []) {}

  addItem(item: CartItem): Cart {
    return new Cart([...this.items, item]);
  }

  removeItem(sku: string): Cart {
    return new Cart(this.items.filter((i) => i.sku !== sku));
  }

  validate(): boolean {
    return this.items.every((i) => i.qty > 0);
  }
}
