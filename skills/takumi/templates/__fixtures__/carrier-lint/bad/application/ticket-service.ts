// FIXTURE ONLY — carrier-lint の検出確認用。
// 期待: K4 (Rule 21 で新設禁止の carrier を新規追加)。
//   このファイルが diff の追加行に含まれるときのみ発火する (既存コードは grandfathered)。

export class TicketService {
  create(title: string): { readonly title: string } {
    return { title };
  }

  close(id: string): void {
    // no-op
  }
}
