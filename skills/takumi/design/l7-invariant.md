# design mode L7 Layout Invariant 詳細 (3 層 + preflight)

takumi の design mode 本体 (`design/README.md`) から参照される補助ドキュメント。画面生成後の検証は 3 層に分ける。
**hard gate は最小限**に留め、それ以外は soft / lint に降ろす。

> [!NOTE]
> **本書は一次予防でなく保険網 (L-detect)**。UI 崩れの一次予防は `layout-primitives.md` の構成的予防 (崩れない primitive の nest 合成 + 防御 CSS + content contract + StylePassPolicy) が担う。本書の構造化レンダー監査は、primitive で防げない残余 (境界条件・ブラウザ差・未知コンテンツ・escape hatch 領域) を実測で捕捉する net。primitive が健全なら hard gate は稀にしか発火しない。

## preflight (実装前 約束事)

hard gate の**事前約束版**。hard gate が「実装後に壊れていないか検出して block」なのに対し、preflight は「実装着手前に観点を網羅確認」の checklist として定位。Phase 1-3 (style guide + component 設計) 完了時点で確認、fail 項目があれば Phase 5 ワイヤーフレームで補完してから実装へ。

### preflight と hard gate の線引き

| 観点 | preflight (事前約束) | hard gate (事後 block) |
|---|---|---|
| タイミング | Phase 1-3 完了時 | 実装完了後 (wave gate) |
| 粒度 | 設計意図の存在 (token / 階層 / 状態) | 計算可能な固定閾値 (上表) |
| fail 時 | 次 Phase 進行前に補完 | 即 block |
| 観点 | hit area 基準は hard gate を参照 (primary action で余裕を取る推奨) | `interactive_hit_area_min_32px` (§hard gate 既存) |

観点が hard gate と同系統のものは、**hard gate の既存閾値を準拠**する。preflight 独自の新閾値は設けない (数値競合を避ける)。

### preflight 観点

実装着手前に以下が style guide / component 設計 / interactions / wireframe のいずれかに存在するかを確認:

- **grid**: 基準 grid を token で宣言 (4px / 8px など、具体値は style guide に従う)
- **spacing 階層**: outer (section) と inner (element) で token 階層を分離
- **action 強弱**: primary / secondary / destructive がスタイルで区別される
- **focus ring**: 色・太さ・offset を token 化 (既存 stack の規範に従う)
- **breakpoint**: desktop + mobile 最低 2 つを style guide で定義
- **状態含有**: error / empty / loading がワイヤーフレームに描かれる
- **typography scale**: h1/h2/body/caption 等が tokens に
- **semantic color**: success / warning / danger / info を brand から inference、token 化
- **hit area**: primary action は余裕を取る (既存 hard gate `interactive_hit_area_min_32px` が下限、より厳しい目安は project profile で設定可)
- **overflow 対策**: text-heavy 要素で truncate / wrap / scroll の方針明示
- **aria-\***: form / interactive で命名指針
- **motion-reduce**: `prefers-reduced-motion` fallback が interactions.md に

**運用**: preflight fail 項目がある状態で Phase 4-6 に進むと、後続の hard gate fail 確率が高まる。「実装後に発見する defect は予防可能だったもの」という視点で事前チェック。

動的 UI (progressive disclosure / hover / drag / animation / dark / print / zoom / i18n) への波及は preflight の対象外 (適用範囲は「静的・初期表示 UI」)。動的 UI 補助 check は別途 component 実装時の invariant テストに残す。

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

### craft 層との矛盾調停 (functional vs decorative overflow)

craft 層 (`craft-layer.md`) の演出 (大胆な余白 / hero 装飾 / 意図的はみ出し / 低コントラスト装飾) が hard gate と衝突しうる。調停は優先順位で固定: **a11y/安全 > レスポンシブ破綻回避 > 情報構造/タスク効率 > craft**。craft は hard gate を破れない。ただし overflow を 2 分類して**例外予算**を設ける:

| 分類 | 例 | 扱い |
|---|---|---|
| **functional overflow** | text / 操作要素 / data が container を超える | **常に禁止** (`no_container_overflow` / `no_text_clipping` / `grid_break_protection` を維持) |
| **decorative bleed** | 背景演出 / hero 装飾の意図的はみ出し | escape hatch 宣言下で **許可** (`layout-primitives.md` §6 の escape_owner + 構造化レンダー監査必須) |

`no_container_overflow` は **functional** に対してのみ block する。decorative bleed は escape hatch 領域として明示管理する (`layout-primitives.md` §6)。AI-slop blocklist (`no_default_ai_font` / `no_single_box_shadow` / `pure_gray_without_intent` / `unjustified_component_count` 等、`craft-layer.md` §5) は soft / lint に登録する。

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
| nested_radius_concentric | 親子で同径 radius (隅の隙間が不均一) は警告。外 = 内 + padding (`craft-tokens.md` §3) |
| elevation_layered | 単一 box-shadow は警告。多層 elevation を使う (`craft-tokens.md` §2) |

false positive 率 5% 未満を目安。超過したら rule を見直すか lint に移す。

## lint (eslint / stylelint) <!-- RULE: design-lint-token-only T1:templates/design-lint.mjs -->
<!-- scope:UI surface の className / CSS 宣言 / shall:色・タイポ・radius は token 参照のみ、layout の arbitrary 値と escape hatch 宣言外の position:absolute/fixed と裸 1fr と flex 子の min-width:0 欠落を許さない / not:判断を要する rule (accent_overuse・総合 taste・unjustified_component_count) を hard gate にする / applicability:surface.tags.UI in [human-UI, machine+human] / evidence:templates/design-lint.mjs (fixture 検証済、good 0 / bad 16 rule) -->

静的解析で機械的に弾く。ビルド時に即失敗、PBT は不要。

> **既知の限界**: 行単位の正規表現走査であり、`clsx()` / computed class / CSS-in-JS の生成結果は
> 検出できない (false negative)。className が複数行に分かれるケースは前後 4 行の窓で判定する。
>
> **実体**: `templates/design-lint.mjs` (Node 標準のみ、postcss 不使用)。下表の 5 rule に加え
> `layout-primitives.md` §5 の 6 rule、`jp-typography.md` の 3 rule、`craft-layer.md` §5 の
> AI-slop 3 rule (soft) を実装する。判断を含む rule (accent_overuse / centered-stack /
> dark_not_redesigned / unjustified_component_count / 総合 taste) は **実装しない** (§craft-layer §6 が
> gate 不可と明示)。`cd <project> && node <takumi>/templates/design-lint.mjs src --strict`

| rule | 内容 |
|---|---|
| color_token_only | hex / rgb リテラル禁止、CSS var / tailwind token のみ |
| typography_token_only | 生 font-size 禁止、text-* utility のみ |
| no_inline_style | `style={{}}` 原則禁止 (dynamic な theme 以外) |
| no_arbitrary_tailwind | `w-[13px]` のような arbitrary value を禁止 |
| radius_on_scale | 生 `border-radius` 禁止、radius token (sm/md/lg/full) のみ (`craft-tokens.md` §3) |

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

## 構造化レンダー監査 (L-detect、保険網の 4 軸)

primitive (`layout-primitives.md`) で防げない残余 (境界条件 / ブラウザ差 / 未知コンテンツ / escape hatch 領域) を、**スクショ比較でなく DOM/CSSOM の幾何・スタイル数値**で実測する。Playwright で content-stress 状態 (長文 / 大量行 / 空 / エラー / i18n / zoom125% / mobile) を当て、4 軸を判定:

| 軸 | 計測 | fail 条件 |
|---|---|---|
| **bbox containment** | 子 bbox が親 bbox に収まるか | 親をはみ出す (functional overflow)。decorative bleed は escape_owner 宣言下で除外 |
| **光学センタリング** | 中央寄せ要素の左右余白差 | 閾値超の非対称 |
| **interaction-bbox** | focus ring / hit area の実寸 | hit area < 32px、focus ring が隠れる |
| **状態 matrix** | error/disabled/loading/RTL/autofill/zoom125%/mobile で崩れ | いずれかの状態で bbox/overflow 違反 |

**位置づけは net** — primitive が健全なら稀にしか発火しない。**主軸扱いしない / スクショ差分しない / CI を hang させる重い E2E にしない**。既存 hard gate を内包する (hard gate = この監査の最小固定閾値版)。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本体 entry point |
| `phases.md` (同ディレクトリ) | Phase 1-6 の詳細 |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults |
| `../verify/property-based.md` | PBT テンプレの参照 |
| `../verify/model-based.md` | fc.commands / XState test |
| `../verify/smoke-e2e.md` | L5 smoke (fallback) |
