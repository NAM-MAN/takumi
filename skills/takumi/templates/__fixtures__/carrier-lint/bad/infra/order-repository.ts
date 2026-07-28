// FIXTURE ONLY — carrier-lint の FP ガード確認用。
// 期待: K3 が **発火しない** こと。
//   repository が save を持つのは Rule 12 (Repository = Aggregate Root 単位) の正しい形であり、
//   Rule 19 違反ではない。層が infra であることと型名の接尾辞の二重で除外される。

import type { Order } from "../domain/order";

type Db = { readonly exec: (sql: string) => void };

export class OrderRepository {
  constructor(private readonly db: Db) {}

  save(order: Order): void {
    this.db.exec("insert into orders ...");
  }

  findById(id: string): Order | null {
    return null;
  }
}
