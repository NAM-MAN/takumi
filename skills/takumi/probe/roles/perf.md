# probe/roles/perf.md — perf 観点発見者

probe mode で「perf 見て / 心配 / 重い / bundle が」などの発話を受けた時に起動する発見者 role。[`references/performance-philosophy.md`](../../../../references/performance-philosophy.md) の 3 条を discover checklist に落とし、証拠付きの backlog entry を生成する。

## 役割

- 棟梁から「perf 診断」指示を受ける
- リポジトリを scan、本 checklist の各項目を検証
- 発見は証拠 (file:line, 計測値) 付きで `discoveries.md` に record
- triage で ICE スコアを付けて `backlog.md` に promote

---

## Discovery checklist (C1-C6)

philosophy の 3 条をさらに 6 診断観点に展開。pull 型 (probe 起動時のみ実行) なので、normal 実装 flow に影響しない。

### C1: `"use client"` 境界が過剰に広くないか (philosophy §1)

- `grep -rn '"use client"' --include='*.tsx' --include='*.ts'` で全検出
- 各 file につき interactive 要素 (onClick / useState / useEffect / browser API) が実際にあるか
  - 無ければ削除候補 (Server Component に戻す)
  - 有るなら最小 subtree に分離できないか (例: `<Button onClick>` だけ client wrapper 化)
- Backend (API route / server lib): startup で全 dep を eagerly load していないか

```
[C1] {file}:{line} — "use client" が over-scope
  evidence: file {LOC} 行中、interactive 要素は {N} 箇所のみ
  proposal: interactive 部分を {extracted_file} に分離
  ICE: I={} C={} E={}
```

### C2: Boundary から heavy dep が leak していないか (philosophy §1)

- client file の import 追跡、import 先が heavy dep (100 KB 超) を依存していないか
- Data fetching が component ごとに並列 (co-located かつ parallel Suspense) になっているか

```
[C2] {client_file} → {server_lib} → {heavy_dep} ({KB}) が client に leak
```

### C3: platform-native で代替可能な dep (philosophy §2)

philosophy §2 の代替表を当てて置換候補を抽出:

| 依存 | Native 代替 | 節約見込 gz |
|---|---|---|
| `lodash.*` default import | `Array.toSorted` / `Object.groupBy` / `.length` | ~10-70 KB |
| `moment` | `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` | ~60 KB |
| `date-fns.format` 大半 | 同上 | ~5-15 KB |
| `uuid v4` | `crypto.randomUUID()` | ~5 KB |
| `@heroicons` 小 icon | inline SVG | ~3-10 KB / icon |
| `classnames` | template literal | ~1 KB |

Backend: `cargo tree` / `go mod why` / `pip-audit` / `npm ls --depth=0` で dep graph を監査、lazy 化候補を発見。

### C4: real metric (INP / LCP / p99) 未計測 (philosophy §3)

- `.lighthouserc.*` / Lighthouse CI 設定の有無
- Backend: APM / k6 / autocannon の有無
- Field data (RUM): Vercel Speed Insights / Cloudflare Web Analytics 等

```
[C4] real metric 計測不在: INP / LCP / p99 を CI / production で見ていない
  proposal: Lighthouse CI を PR gate に、または Vercel Speed Insights を field で
```

### C5: Budget CI gate 不在 (philosophy §3)

- `.size-limit.json` / `bundlesize` config / package.json script / CI workflow を grep
- 設定が無い、または緩すぎ (実測より遥かに大きい) なら発見

```
[C5] size-limit 不在または未配線
  current_size: {measured_KB_gz}
  proposal: .size-limit.json で {proposed_KB} 予算、CI で `npx size-limit` run
  reference: Addy Osmani 推奨 170 KB minified
```

### C6: Third-party scripts 未監査 (philosophy §3 末尾)

- `app/layout.tsx` / `<Script>` / `<head>` 周辺を grep、domain 列挙
- `strategy="lazyOnload" / "worker"` を使っているか
- Consent Management Platform が過重でないか

```
[C6] 3rd-party audit: {N} 個検出
  domains: {list}
  combined_size: {KB_gz}
  strategy: {eager: N, lazy: N, worker: N}
  proposal: eager な {domain} を lazyOnload へ
```

---

## 出力フォーマット (discoveries.md 追加分)

```markdown
## Performance discoveries ({date})

### C1 (RSC boundary)
- [ ] {発見 1} — I:5 C:3 E:4 = ICE 12
- [ ] {発見 2} — ...

### C3 (dep as debt)
- [ ] {発見 1}

(以下 C5, C6)
```

## triage で backlog.md に promote

ICE (Impact / Confidence / Effort 各 1-5) 付与:
- **I**: bundle 削減 KB または INP/p99 改善見込
- **C**: 実測済 = 5、典型パターン = 4、推測 = 2
- **E**: 数時間 = 5、数日 = 3、数週間 = 1

ICE >= 60 を backlog 上位、<30 は icebox。

## 反論者チェック (calibration)

本 role は発見を盛りがち。sprint 末に軍師へ敵対レビュー 1 回:

- 「発見が真に bundle / latency を削減するか、cosmetic か」
- 「native 代替が本当に同機能か (timezone, i18n, edge case で壊れないか)」
- 「3rd-party を lazy 化して CLS / UX を悪化させないか」

結果は `.takumi/discovery-calibration.jsonl` に 1 行 append (継続学習)。

## 関連

- [`../../../../references/performance-philosophy.md`](../../../../references/performance-philosophy.md) — 3 条の根拠
- [`../discover.md`](../discover.md) — 発見者選定の親フロー
- [`../triage.md`](../triage.md) — triage / ICE / backlog 生成
