# db-pglite — state tier S0 recipe (コンテナ無しの既定 DB)

PGlite (Postgres を WASM 化、~3MB、in-process) を dev/test DB に使う recipe。
これが state tier の既定。CRUD アプリの大半はここで完結し、**コンテナは発火しない**。

> [!IMPORTANT]
> このファイルは**テンプレ (snippet 集)** であり実行コードではない。棟梁が project の言語/ORM に
> 合わせて適用する。実コードは project 側 (skill 配下に production code を置かない原則)。

## なぜ PGlite が既定か

- **dev**: ファイル 1 個が DB。`rm data.db` で破棄。ストレージは KB 単位
- **test**: 各 test で真っさらな DB を瞬時生成・並列安全・teardown 不要 (コンテナの起動待ち/ポート衝突が消える)
- **同一クエリ**: Drizzle の `drizzle-orm/pglite` dialect で dev↔prod 同じ SQL。pgvector 等の拡張も載る

## セットアップ (Node/TS + Drizzle 例)

```
pnpm add @electric-sql/pglite drizzle-orm
```

dev (file 永続) / test (in-memory) の 2 形態:

```ts
// EXAMPLE ONLY — project 側に置く想定の snippet
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

// dev: ファイル永続。破棄は rm -rf ./.data/pg
export const devDb = drizzle(new PGlite('./.data/pg'))

// test: in-memory。各 test で new = 独立 DB、並列安全、teardown 不要
export const makeTestDb = () => drizzle(new PGlite())  // 引数なし = :memory:
```

## 正直な限界とパリティ対処 (コンテナ不要)

PGlite は単一接続・WASM で、真の並行性や一部カタログ挙動が本物の PG と差がある。対処は**コンテナではなく**:

> 内ループは PGlite (速い・捨てやすい)。**CI のパリティ検証だけ devenv の `services.postgres`**
> (native プロセス) で本物 PG に**同じ migration** を当て、差分を検証する。

これは verify skill の L3 differential と噛み合う (PGlite vs real PG の 2-source 差分)。
`.gitignore` には `.data/` を足す (PGlite の file 永続先、ephemeral)。

## 段階を上げる signal (契約スパイン I6 由来)

- I6 に「並行編集 / 特定拡張 / LISTEN-NOTIFY / 高並行」が出る → state tier **S1** (devenv `services.postgres` を dev でも使用) を 1 回提案
- native/embedded が無いサービス or prod runtime 同一性が必須 → state tier **S2** (container、最終手段・要記録)
