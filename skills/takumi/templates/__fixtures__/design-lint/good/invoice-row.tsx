// FIXTURE ONLY — design-lint が 0 件になる正例。
// primitive の nest 合成 + token utility のみ。flex 子には min-w-0 を付ける。

type Props = { readonly name: string; readonly amount: number };

export function InvoiceRow({ name, amount }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 min-w-0 truncate text-body">{name}</span>
      <span className="w-24 text-right text-body">{amount}</span>
      <button className="text-link">編集</button>
    </div>
  );
}
