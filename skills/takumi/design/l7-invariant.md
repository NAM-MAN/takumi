# design mode L7 Layout Invariant 詳細 (3 層)

takumi の design mode 本体 (`design/README.md`) から参照される補助ドキュメント。画面生成後の検証は 3 層に分ける。
**hard gate は最小限**に留め、それ以外は soft / lint に降ろす。

## hard gate (5-7 項目)

失敗したら**即 block**(exec の wave gate で next wave 進行を止める)。
profile の `layout_invariants.hard` に列挙。

| rule_id | 内容 | 検出 |
|---|---|---|
| no_container_overflow | container からはみ出さない | 画面 snapshot の bounding box チェック |
| interactive_hit_area_min_32px | button / link のクリック範囲 >= 32px | DOM 測定 (getBoundingClientRect) |
| focus_visible_all_controls | 全 interactive 要素に focus-ring | axe-core |
| no_text_clipping | 文字の overflow: hidden + truncate 以外禁止 | computed style + scrollWidth |
| color_contrast_aa | WCAG AA 以上 | axe-core |
| no_overlap | z-index 衝突で互いを覆わない | snapshot diff |
| grid_break_protection | 横スクロール発生時は設計 bug | scrollWidth > clientWidth |

5-7 項目に絞る理由: hard を増やすと誤検知で bypass 常態化する。takumi の sweep mode で観点ごとに追加したくなっても、profile レベルで足す前に **soft → hard 昇格の履歴**を残す。

### 昇格ルール

soft gate から hard gate に昇格する場合:
- 4 週間連続で soft warning の件数が 10% 以上
- かつ人間が「これは常に block にすべき」と合意
- 昇格時は `.takumi/design/rule-history.yaml` に記録 (いつ・なぜ昇格したか)

## soft gate (warning)

profile の `layout_invariants.soft` に列挙。失敗しても block しない (warning のみ)。
week 単位で集計、閾値超過でのみ fail にする運用。

| rule_id | 内容 |
|---|---|
| spacing_on_token_scale | 4px grid 外の spacing は警告 |
| icon_from_lucide_only | 他ライブラリの icon が混ざったら警告 |
| grid_column_alignment | column 数 = 12 / 6 / 4 / 3 / 2 以外は警告 |
| density_consistency | 同 profile 内で table 行高がブレたら警告 |

false positive 率 5% 未満を目安 (軍師 推奨)。超過したら rule を見直すか lint に移す。

## lint (eslint / stylelint)

静的解析で機械的に弾く。ビルド時に即失敗、PBT は不要。

| rule | 内容 |
|---|---|
| color_token_only | hex / rgb リテラル禁止、CSS var / tailwind token のみ |
| typography_token_only | 生 font-size 禁止、text-* utility のみ |
| no_inline_style | `style={{}}` 原則禁止 (dynamic な theme 以外) |
| no_arbitrary_tailwind | `w-[13px]` のような arbitrary value を禁止 |

### どの rule を lint に逃がすか

- **機械的に検出可能** (ast で判定できる) → lint
- **状態依存** (render 後の DOM 測定が必要) → hard / soft gate
- **設計判断を要する** (context で妥当性が変わる) → 人間 review

## PBT に残すもの (最小)

property-based test で守るのは**状態変化時のレイアウト保持**のみ。
token / 色 / タイポは既に固定されているので PBT で守らない。

### 4 カテゴリ

1. **長文入力**: 256-2048 文字のランダム string で truncate + tooltip が動く
2. **空状態**: empty placeholder が表示される (0 件 list、null field 等)
3. **エラー状態**: error banner + 直前 state 維持 (API failure 時)
4. **状態遷移後**: layout が hard gate を全て満たす (fc.commands で操作列生成)

### テンプレ例

```typescript
// layout.invariant.test.ts (auto-generated from design_profile)

test("long text does not overflow container", () => {
  fc.assert(fc.property(
    fc.string({ minLength: 256, maxLength: 2048 }),
    (text) => {
      render(<InvoiceRow customerName={text} />)
      const row = screen.getByRole('row')
      expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    }
  ))
})

test("empty state shows placeholder", () => {
  render(<InvoiceList invoices={[]} />)
  expect(screen.getByText(/まだ invoice がありません/)).toBeInTheDocument()
})

test("error state preserves prior data", () => {
  const { rerender } = render(<InvoiceList invoices={mockData} />)
  rerender(<InvoiceList invoices={mockData} error={new Error('API fail')} />)
  expect(screen.getAllByRole('row')).toHaveLength(mockData.length + 1) // +header
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

test("state transition preserves layout hard gate", () => {
  fc.assert(fc.commands([
    new ToggleSidebarCommand(),
    new OpenDialogCommand(),
    new ChangeFilterCommand(),
  ], { runNs: 50 }))
})
```

色やタイポの微調整を PBT で守らない (token で既に固定済み)。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本体 entry point |
| `phases.md` (同ディレクトリ) | Phase 1-6 の詳細 |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults |
| `../verify/property-based.md` | PBT テンプレの参照 |
| `../verify/model-based.md` | fc.commands / XState test |
| `../verify/smoke-e2e.md` | L5 smoke (fallback) |
