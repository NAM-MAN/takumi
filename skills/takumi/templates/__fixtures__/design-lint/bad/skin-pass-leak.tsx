// FIXTURE ONLY — design-lint L10 の確認用。
// style-pass: skin
// 期待: L10 (skin pass に layout utility が混入)。
//   StylePassPolicy (layout-primitives.md §4) では layout utilities は primitive 専有 (Phase A)。
//   skin pass (Phase B) が w-screen / absolute を持ち込むと primitive の防御 CSS が無効化される。

export function Badge({ label }: { readonly label: string }) {
  return <span className="rounded-full bg-accent-soft w-screen absolute">{label}</span>;
}
