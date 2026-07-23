// FIXTURE ONLY — code-vitals の検出確認用 (分割「前」)。
// 期待: 21-100 行 bucket に 1 件、≤7 行率が低い、single_callsite_helper=0。

export type Line = { readonly sku: string; readonly qty: number; readonly unit: number };
export type Quote = { readonly subtotal: number; readonly discount: number; readonly tax: number; readonly total: number };

export function buildQuote(lines: readonly Line[], memberRank: string, taxRate: number): Quote {
  const subtotal = lines.reduce((acc, l) => acc + l.qty * l.unit, 0);
  const volumeBonus = lines.reduce((acc, l) => acc + (l.qty >= 10 ? l.qty * l.unit * 0.05 : 0), 0);
  const rankRate = memberRank === "gold" ? 0.15 : memberRank === "silver" ? 0.1 : memberRank === "bronze" ? 0.05 : 0;
  const rankDiscount = subtotal * rankRate;
  const couponFloor = subtotal > 100000 ? 5000 : 0;
  const rawDiscount = volumeBonus + rankDiscount + couponFloor;
  const cappedDiscount = rawDiscount > subtotal * 0.4 ? subtotal * 0.4 : rawDiscount;
  const discount = Math.round(cappedDiscount);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * taxRate);
  const total = taxable + tax;
  const isNegative = total < 0;
  const safeTotal = isNegative ? 0 : total;
  const safeTax = isNegative ? 0 : tax;
  const safeDiscount = isNegative ? subtotal : discount;
  return {
    subtotal,
    discount: safeDiscount,
    tax: safeTax,
    total: safeTotal,
  };
}
