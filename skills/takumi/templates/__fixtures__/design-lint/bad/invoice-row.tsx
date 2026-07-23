// FIXTURE ONLY — design-lint の検出確認用。
// 期待: L1 (hex 直書き) / L3 (inline style) / L4 (arbitrary layout) / L6 (absolute) /
//       L7 (layout margin) / L9 (flex-1 に min-w-0 が無い) が発火する。

type Props = { readonly name: string; readonly amount: number };

export function InvoiceRow({ name, amount }: Props) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="flex-1 truncate">{name}</span>
      <span className="w-[73px] text-right">{amount}</span>
      <button className="absolute right-2" style={{ color: "#3366ff" }}>
        編集
      </button>
    </div>
  );
}
