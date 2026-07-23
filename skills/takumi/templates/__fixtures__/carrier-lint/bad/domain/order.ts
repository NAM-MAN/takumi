// FIXTURE ONLY — carrier-lint の検出確認用。production コードではない。
// 期待: K1 (Order.save() と saveOrder() の carrier 二重化) + K3 (domain 型が境界動詞 save を持つ)

export type OrderData = { readonly id: string; readonly total: number };

export class Order {
  constructor(private readonly data: OrderData) {}

  validate(): boolean {
    return this.data.total >= 0;
  }

  // Rule 19 違反: persistence は aggregate の責務でない (K3)
  save(): void {
    // 実装は fixture では不要
  }
}

// Order.save() と同一概念 (save, order) を別 carrier で表現 (K1)
export function saveOrder(order: Order): void {
  order.validate();
}
