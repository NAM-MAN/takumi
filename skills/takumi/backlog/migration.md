# Backlog 移行サポート (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。`enabled` 切替直後に既存 `.takumi/sprints/*/backlog.md` と `drafts/discovered-*.md` をスキャンして `.takumi/backlog/open/` にコピーする手順を定義。

## 起動条件 (`fresh_bootstrap` flag 経由)

`BacklogGate.resolveMode()` が `enabled` を返した**直後**、かつ **`project.yaml.backlog.fresh_bootstrap == true`** の時のみ実行。

`bootstrapped_at` を判定基準にしない理由: bootstrap が step 4 で `bootstrapped_at` を先に書くため、bootstrap → migration の順序を見ると常に「セット済」になり migration が走らない。代わりに **`fresh_bootstrap` flag を bootstrap が立て、migration 完了で false に戻す** 方式を採用。

具体的には:

- 起票機会で「takumi で管理 (推奨)」を選択した直後 → bootstrap が `fresh_bootstrap: true` を立てる → migration 実行 → 完了時に `fresh_bootstrap: false`
- `project.yaml.backlog.mode: enabled` を手動セット + 再 `/takumi` 起動時 → bootstrap (idempotent、`bootstrapped_at` 未セットなら `fresh_bootstrap: true`) → migration 実行
- `fresh_bootstrap: false` の状態では migration 走らない (再実行なし)
- 「移行やり直し」発話で `fresh_bootstrap` を手動 true にしてから migration を再走査可能

## 既存スキャン対象

| 対象 | パス | 抽出内容 |
|---|---|---|
| probe triage 出力 | `.takumi/sprints/*/backlog.md` | 各 item の title / evidence / priority |
| 自己増殖発見 | `.takumi/drafts/discovered-*.md` | 発見タイトル / 根拠 / 提案 |
| (オプション) 未完了 plan | `.takumi/plans/*.md` の未完了 Wave | Wave 単位で BL 化提案 (確認必須) |

スキャンは **read-only**、元ファイルに一切 write しない (`md5sum` 検証で確認)。

## インポート 3 択 UI

スキャン結果を表で提示:

```
.takumi/sprints/ + drafts/ から {N} 件の backlog 候補を発見しました。

| # | source | title | priority | source_ref |
|---|---|---|---|---|
| 1 | probe   | DB クエリ N+1 問題  | P0 | sprints/2026-04-15/backlog.md#L12 |
| 2 | probe   | a11y label 不足     | P1 | sprints/2026-04-15/backlog.md#L34 |
| 3 | discovered | retry 漏れ        | P2 | drafts/discovered-005.md |
| ... |

どうしますか?
[1] 全部インポート (推奨、後で個別 wontfix 可)
[2] 選んで (チェックリスト UI)
[3] skip (空 .takumi/backlog/ だけ作成)
```

### 各選択肢の詳細

**[1] 全部インポート**:
- 全 N 件を `.takumi/backlog/open/BL-###-{slug}.md` に変換
- 採番は BL-001 から、衝突回避ロジックで重複なし
- 1 件あたり ~ 0.5 秒、N=20 でも 10 秒程度

**[2] 選んで**:
- チェックリスト UI を提示 ([x] / [ ] でトグル)
- 選択された分だけインポート
- 後で再度移行を走らせて追加可 (`bootstrapped_at` が null でなくても、`/takumi 移行追加` 発話で実行)

**[3] skip**:
- `.takumi/backlog/{open,doing,done}/` だけ作成、中身は空
- 後から手動 / 「BL 起票」発話で起票していく
- 元の sprints/ / drafts/ はそのまま残る

## copy-only contract

| 操作 | 動作 |
|---|---|
| 元ファイル | **不変更** (md5sum で前後検証、変更されたら abort & rollback) |
| 元ファイルへの参照 | `source_ref` field に anchor 付きで記録 (例: `sprints/2026-04-15/backlog.md#L12`) |
| 元ファイル削除 | **しない** (履歴として保持) |
| 元ファイル move | **しない** |
| 衝突時 (同 BL id) | 新 id を採番 (人工的衝突 fixture で検証) |

## dry-run diff + manifest

実行前に必ず以下を提示してユーザー明示承認を得る:

```
[Migration dry-run]

新規生成予定 ({N} ファイル):
  + .takumi/backlog/open/BL-001-db-query-n-plus-1.md       (from sprints/2026-04-15/backlog.md#L12)
  + .takumi/backlog/open/BL-002-a11y-label.md              (from sprints/2026-04-15/backlog.md#L34)
  + .takumi/backlog/open/BL-003-retry-missing.md           (from drafts/discovered-005.md)

変更予定 ({M} ファイル):
  (なし、copy-only)

削除予定 (0 ファイル):
  (なし)

manifest を .takumi/backlog/.migration-{date}.json に記録します。

この内容で実行しますか? (y/n)
```

`y` で実行、`n` で abort (空 backlog/ だけ残る)。abort 後も `/takumi 移行やり直し` で再実行可能。

manifest 例:

```json
{
  "migration_id": "mig-2026-05-24-001",
  "ts": "2026-05-24T03:31:36Z",
  "items": [
    {"generated_id": "BL-001", "source": "probe", "source_ref": ".takumi/sprints/2026-04-15/backlog.md#L12", "title": "DB クエリ N+1 問題"},
    {"generated_id": "BL-002", "source": "probe", "source_ref": ".takumi/sprints/2026-04-15/backlog.md#L34", "title": "a11y label 不足"},
    {"generated_id": "BL-003", "source": "discovered", "source_ref": ".takumi/drafts/discovered-005.md", "title": "retry 漏れ"}
  ],
  "user_choice": "all"
}
```

manifest は `.takumi/backlog/.migration-{date}.json` に保存 (`backlog/` 内、`!.takumi/backlog/**` で git tracked、ただしファイル名は `.` 始まりで隠す)。

## 採番ロジック (衝突回避)

```
function nextBLId(): string {
  const existing = glob('.takumi/backlog/{open,doing,done}/BL-*.md');
  const ids = existing.map(parseBLNumber).filter(Boolean);  // [1, 5, 7, ...]
  const maxId = ids.length === 0 ? 0 : Math.max(...ids);
  const candidate = maxId + 1;
  // 念のため再確認 (race condition 防止)
  while (existsSync(`.takumi/backlog/open/BL-${zeroPad(candidate, 3)}-*.md`)) {
    candidate++;
  }
  return `BL-${zeroPad(candidate, 3)}`;
}
```

衝突 fixture:
- 既存 `BL-001`, `BL-003` ありで `nextBLId()` → `BL-004` (gap 埋めない、append-only)
- 並列実行 (複数セッション同時) は想定外、想定するなら lock file 必要

## slug 生成

title から ASCII slug を生成:

```
"DB クエリ N+1 問題" → "db-query-n-plus-1"
"a11y label 不足"   → "a11y-label-missing"
"retry 漏れ"        → "retry-missing"
```

ロジック:
1. 日本語を簡易英訳 (主要 token のみ、AI 判断)
2. 小文字化、特殊文字除去、スペース → `-`
3. 長さ ≤ 40 文字 (超過は truncate)
4. 衝突時 (同 BL id 内、まずないが) は末尾に `-2` を追加

## 移行が **実行されない** ケース

| 状況 | 理由 |
|---|---|
| `mode != enabled` | BacklogGate で skip |
| `bootstrapped_at` セット済 + ユーザーから「移行やり直し」発話なし | 1 回限りの原則 |
| スキャン対象が 0 件 | 何もしない (空 backlog/ だけ残る) |
| CI 環境 | 非対話で 3 択選べない (skip 扱い、`.takumi/backlog/` だけ作成) |

## failure & rollback

| 失敗 | 対処 |
|---|---|
| copy 中の write error (disk full / permission) | abort、生成済みの新ファイルを全 rollback (manifest を逆順で削除)、ユーザーに通知 |
| 元ファイルの md5sum が前後で変わった | abort、生成済みを rollback、コード bug として escalation |
| 採番衝突 | 上記の `nextBLId()` で skip、log のみ |
| manifest 書込失敗 | 移行は完了させ、manifest を `.takumi/backlog/.migration-fallback.json` に置く |
