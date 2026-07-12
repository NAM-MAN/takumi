# design mode の Phase 1-6 (目次)

takumi の design mode 本体 (`design/README.md`) から参照される補助ドキュメントの**目次**。規模の都合で 2 本に分割している。

---

## Phase 1-3 — 骨格決定

**`phases-1-3.md`** を参照:

- **Phase 1**: IA 推論 — AC-ID 群と必須入力 4 項目からサイトマップを推論
- **Phase 2**: Style Guide seeded 決定 — color / typography / spacing / radius / shadow / motion を固定 token set に
- **Phase 3**: コンポーネント基盤 — shadcn/ui + Tailwind のベース設定

## Phase 4-6 — 画面化と統合

**`phases-4-6.md`** を参照:

- **Phase 4**: マイクロインタラクション標準化 — framer-motion でアニメーション token 固定
- **Phase 5**: OOUI ワイヤーフレーム — 各 screen の wireframe を ASCII + token 表で生成
- **Phase 6**: /takumi 連携 — `design_profile_ref` を各 UI task に埋める、L7 Layout Invariant gate を executor に接続

## 関連リソース

| file | 用途 |
|---|---|
| `README.md` (同ディレクトリ) | design mode 本体 (LP + runtime spec) |
| `phases-1-3.md` (同ディレクトリ) | Phase 1-3 の詳細 |
| `phases-4-6.md` (同ディレクトリ) | Phase 4-6 の詳細 |
| `l7-invariant.md` (同ディレクトリ) | L7 hard/soft/lint の検出・昇格・PBT テンプレ |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults |
