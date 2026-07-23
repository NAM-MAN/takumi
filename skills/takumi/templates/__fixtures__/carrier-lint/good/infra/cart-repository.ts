// FIXTURE ONLY — carrier-lint が 0 件になる正例。
// infra 層は class + constructor DI を層内で一貫させる (behavior-carrier.md §0 段1 / EXC2)。

import type { Cart } from "../domain/cart";

type Db = { readonly exec: (sql: string) => void };

export class CartRepository {
  constructor(private readonly db: Db) {}

  save(cart: Cart): void {
    this.db.exec("upsert cart ...");
  }

  findByUser(userId: string): Cart | null {
    return null;
  }
}
