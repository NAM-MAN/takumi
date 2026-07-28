// FIXTURE ONLY — carrier-lint の FP ガード確認用。
// 期待: K1 が **発火しない** こと。
//   TodoList.add() は (add, todolist)、addUser() は (add, user) で名詞が異なる。
//   同名動詞が別概念で使われているだけなので carrier 二重化ではない。

export class TodoList {
  private readonly items: readonly string[] = [];

  add(item: string): readonly string[] {
    return [...this.items, item];
  }
}

export function addUser(name: string): { readonly name: string } {
  return { name };
}
