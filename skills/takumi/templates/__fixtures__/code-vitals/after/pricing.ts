// FIXTURE ONLY — code-vitals の検出確認用 (分割「後」)。
// 期待: ≤7 行率が before より上がり、同時に single_callsite_helper が増える。
//   分割そのものは害ではない (命名で責務が可視化される)。ただし呼出 1 箇所の helper が
//   同時に増えることを並置表示することで「率だけ上げる」操作が自壊する。

export type Line = { readonly sku: string; readonly qty: number; readonly unit: number };
export type Quote = { readonly subtotal: number; readonly discount: number; readonly tax: number; readonly total: number };

function calcSubtotal(lines: readonly Line[]): number {
  return lines.reduce((acc, l) => acc + l.qty * l.unit, 0);
}

function calcDiscount(lines: readonly Line[], subtotal: number, memberRank: string): number {
  const volumeBonus = lines.reduce((acc, l) => acc + (l.qty >= 10 ? l.qty * l.unit * 0.05 : 0), 0);
  const rankRate = memberRank === "gold" ? 0.15 : memberRank === "silver" ? 0.1 : memberRank === "bronze" ? 0.05 : 0;
  const couponFloor = subtotal > 100000 ? 5000 : 0;
  const raw = volumeBonus + subtotal * rankRate + couponFloor;
  return Math.round(raw > subtotal * 0.4 ? subtotal * 0.4 : raw);
}

function clampNegative(subtotal: number, discount: number, tax: number, total: number): Quote {
  const isNegative = total < 0;
  return {
    subtotal,
    discount: isNegative ? subtotal : discount,
    tax: isNegative ? 0 : tax,
    total: isNegative ? 0 : total,
  };
}

export function buildQuote(lines: readonly Line[], memberRank: string, taxRate: number): Quote {
  const subtotal = calcSubtotal(lines);
  const discount = calcDiscount(lines, subtotal, memberRank);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * taxRate);
  return clampNegative(subtotal, discount, tax, taxable + tax);
}
