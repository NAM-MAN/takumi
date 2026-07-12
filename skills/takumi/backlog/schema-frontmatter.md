# Backlog frontmatter schema (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。BL ファイルの YAML frontmatter 構造を定義。

## 必須フィールド (4)

| field | type | 説明 |
|---|---|---|
| `id` | string | `BL-###` 形式、3 桁ゼロパディング。プロジェクト内一意。例: `BL-001`, `BL-042` |
| `title` | string | 1 行の日本語タイトル (≤ 80 文字目安)。ファイル名にも slug 化して含める |
| `created` | date | `YYYY-MM-DD` (ISO 8601 date)。作成日 |
| `source` | enum | `probe` \| `sweep` \| `discovered` \| `manual` \| `pr-feedback` のいずれか |

## 任意フィールド (7)

| field | type | 説明 |
|---|---|---|
| `priority` | enum | `P0` \| `P1` \| `P2` \| `P3`。未設定なら P2 扱い |
| `ac_refs` | array&lt;string&gt; | 関連 AC-ID 配列 (例: `[AC-AUTH-002]`)。`.takumi/specs/` と相互リンク |
| `pr` | integer \| null | PR 番号 (例: `42`)。sync check の対象トリガ。null なら sync check 対象外 |
| `blocked_by` | string \| null | 別 BL ID (例: `BL-003`)。値があれば blocked として扱う (`doing/` 配下に置いたまま) |
| `outcome` | enum \| null | `done/` 移動時のみ: `shipped` \| `wontfix` \| `superseded:BL-###`。`done/` に置く時は必須 |
| `source_ref` | string \| null | source の参照 (例: `.takumi/sprints/2026-05-24/backlog.md#L42`)。移行時に記入 |
| `closed_at` | date \| null | `done/` 移動時にセット (`YYYY-MM-DD`) |
| `closed_by` | string \| null | `PR#42` \| `manual` \| `auto-sync` 等 |

## ファイル名規約

```
.takumi/backlog/{open,doing,done}/{id}-{slug}.md
```

- `{id}`: `BL-###` (例: `BL-007`)
- `{slug}`: title を kebab-case ASCII slug 化 (日本語は最小限の英訳 or romaji)
- 例: `BL-007-image-lazy-load.md`

## サンプル 1: minimal (必須 4 のみ)

```yaml
---
id: BL-001
title: ユーザー認証に 2FA を追加
created: 2026-05-24
source: manual
---

## 背景
2FA を導入してアカウント乗っ取り対策を強化したい。

## やること
- TOTP 方式の 2FA を `auth/login.ts` に追加
- 設定画面で有効化/無効化を切り替え可能に

## やらないこと
- SMS 方式 (コスト面で見送り)
- Backup codes (将来別 BL)
```

## サンプル 2: full (全任意フィールド)

```yaml
---
id: BL-007
title: 画像アップロードの遅延読み込み
created: 2026-05-20
source: probe
source_ref: .takumi/sprints/2026-05-18/backlog.md#L42
priority: P1
ac_refs: [AC-MEDIA-003, AC-PERF-012]
pr: 42
blocked_by: null
outcome: null
closed_at: null
closed_by: null
---

## 背景
probe で perf 観点の発見。FID が p75 で 350ms (target 200ms)。

## やること
- `<img>` に `loading="lazy"` 属性追加
- LCP 候補画像のみ eager で先読み

## 検証
- AC-MEDIA-003 / AC-PERF-012 の verify_profile に従う
- Stryker mutation_floor 65% 通過
```

## バリデーションルール

1. **必須 4 field 欠落** → error (起票拒否)
2. **`id` 形式違反** (BL-### 以外) → error
3. **`source` enum 外** → error
4. **`outcome` に値があるが `done/` 外に存在** → warning (sync check で自動補正対象)
5. **`done/` 内ファイルで `outcome` が null** → error
6. **`pr` に値があるが `gh pr view` で 404** → warning (silent skip、state 変更なし)
7. **`blocked_by` が存在しない BL を参照** → warning

## YAML validation

両 sample が YAML として valid である:

```bash
# frontmatter 抽出 + parse
awk '/^---$/{c++; next} c==1' sample.md | yq '.'
```
