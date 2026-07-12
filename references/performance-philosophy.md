---
name: performance-philosophy
description: Bundle / client JS / p99 latency の 3 条思想。「何を送らないか」を先に決める設計原則。frontend と backend の共通言語。
---

# Performance philosophy (3 条)

「**何を送らないか / 動かさないか**」を先に決める設計原則。Zenn 記事的な "lodash を個別 import" はタクティクスで、これはアーキテクチャ層の話。frontend / backend 共通。

## 1. Default: ship no JS / load no dep (境界 = コスト)

- React: Server Components を基本、`"use client"` は **理由付きの例外** (input / effect / event handler / browser API を使う時だけ)
- `"use client"` は **module import graph** で伝播する (render tree でなく)。境界の 1 行が下流全部を client 化する
- Backend: lazy import、cold path を軽く、middleware は必要最小、startup に全 service を eager 初期化しない
- **境界 = コスト**。境界を引く前に「ここは本当に client (別 process / 別 region) か?」を問う

実測 (takumi-perf-sample): RSC 化後は dep の重さが client bundle に影響しない。Server Component に置いている限り lodash / date-fns / heroicons を入れても client に 1 byte も出ない。**「lodash を個別 import せよ」は client component 前提の局所最適化**。

## 2. Dependencies are debt (境界ごとにコスト形態が違う)

| 境界 | dep のコスト |
|---|---|
| Client (`"use client"` 内) | bundle に即乗る (gzipped KB) |
| Server (RSC / API) | 起動時間 / memory / cold start / security surface |
| Backend main | 同上 + dep audit コスト |

**追加前チェック**: [bundlephobia.com](https://bundlephobia.com) / [packagephobia.com](https://packagephobia.com) で重さ確認、platform-native 代替の有無を確認。

2026 年新規コードで以下は不要 (platform-native が代替):

| 依存 | 代替 |
|---|---|
| `lodash.orderBy / groupBy / size` | `Array.toSorted()` / `Object.groupBy()` / `.length` |
| `moment` / `date-fns.format` (大半) | `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` |
| `uuid v4` | `crypto.randomUUID()` |
| `classnames` | `${a} ${b}` template literal |
| `qs` (URLSearchParams 程度) | `URLSearchParams` |
| icon library 全体 (小 icon 限定) | inline SVG |

Backend 側: `cargo tree` / `go mod why` / `pip-audit` / `npm ls` で dep graph を定期監査。

## 3. Budget を CI の hard gate に (proxy と real、両方要る)

「目標」でなく「数値」にする。超えたら PR merge 不可。

| 層 | proxy (cheap、CI gate 向き) | real (本当に効く、計測コスト高) |
|---|---|---|
| Frontend | bundle KB gzipped | INP, LCP, CLS |
| Backend | response byte / SQL query count | p50 / p99 latency |

**Frontend 例** (size-limit):

```json
// .size-limit.json
[{ "path": ".next/static/chunks/**/*.js", "limit": "200 KB", "gzip": true }]
```

```yaml
# CI
- run: npm run build
- run: npx size-limit  # exit 1 on budget exceeded
```

参考予算 (Addy Osmani): モバイル JS **170 KB minified** (gzipped ~60 KB) が厳格、緩くて ~200 KB。landing / product page は厳しく、奥ページは緩めても可。size-limit は **parse / execute 時間** も実機 emulation で計測する (Snapdragon 410 での running time) ので、download KB だけでなく CPU cost も CI で可視化できる。

**Backend 例** (k6 threshold):

```yaml
thresholds:
  http_req_duration{env:prod}: ["p(99)<500", "p(50)<100"]
```

**Third-party 分離**: 平均 web page の 70% は 3rd party (analytics / chat / ads)。1st と 3rd を **分けて計測** しないと、自社 JS を削っても効果が埋もれる。`<Script strategy="lazyOnload">` / `strategy="worker"` で deferred loading。Backend 同等: external API call と自前 DB/service を分けて p99 計測。

## Applied on takumi: どこに効くか

- **probe mode** (観点診断): [`skills/takumi/probe/roles/perf.md`](../skills/takumi/probe/roles/perf.md) が本 philosophy を checklist 化して診断
- **sweep mode** (全域棚卸): Performance axis で本書を参照
- **normal mode** (feature 実装): AC 起草には**入れない** (儀式化リスク)。必要時に probe mode 経由で pull する

## References

- [Addy Osmani: Performance Budgets](https://addyosmani.com/blog/performance-budgets/)
- [web.dev: Performance budgets in build process](https://web.dev/articles/incorporate-performance-budgets-into-your-build-tools)
- [React docs: `'use client'` directive](https://react.dev/reference/rsc/use-client)
- [Josh Comeau: Making Sense of RSC](https://www.joshwcomeau.com/react/server-components/)
- [size-limit](https://github.com/ai/size-limit)
