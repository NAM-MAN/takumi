# 自己増殖型計画（plan skill 内部参照）

> **計画は固定ではない。実行中に 職人 が発見した問題は新タスクとして計画に追記され、
> 計画自体が有機的に成長する。**
>
> 従来の「計画→実行」ではなく「計画→実行→発見→計画追記→実行→…」のループ。

> [!NOTE]
> **Opus 4.8 delegation policy との整合**: 本方式は 中/大 規模 (`SKILL.md` Step 1 の規模分類) で 職人 spawn を伴う場合の運用。小 規模は 棟梁 が直接実装するため「発見→別 職人」のフローは発生せず、棟梁 が自分の session で記録・対応する。subagent spawn を恣意的に増やさないのが前提 (`executor.md` の Opus 4.8 delegation policy 参照)。

## なぜ必要か

通常の計画は「やること」が事前に全て見えている前提。しかし以下では途中でスコープが広がる:
- 品質改善: 1つ直すと関連する問題が見つかる
- 網羅的レビュー: 観点洗い出し→調査→新観点発見
- リファクタリング: 依存を辿ると影響範囲が広がる

職人 が発見を「自分のコンテキスト内で解決しよう」とすると**コンテキスト溢れ**が起きる。
代わりに発見を計画に書き戻し、別の 職人 が別コンテキストで解決する。

## アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│  Plan File (.takumi/plans/{name}.md)            │ ← 唯一の永続状態
│  ・TODOリスト（自己増殖する）                        │
│  ・完了マーク（[x]）                                │
│  ・Wave完了レポート（進捗の可視化）                   │
└──────────────────┬───────────────────────────────┘
                   │ 読み取り＆ディスパッチ
           ┌───────┴───────┐
           │  棟梁   │ ← 司令塔
           │  ・計画を読む   │
           │  ・次バッチ決定  │
           │  ・発見を統合   │
           │  ・ユーザー報告  │
           └───┬───┬───┬───┘
               │   │   │  各職人は独立コンテキスト
         ┌─────┘   │   └─────┐
         ▼         ▼         ▼
      職人 A  職人 B  職人 C
      (task-1)  (task-2)  (task-3)
         │         │         │
         └── 発見 → discovered-{id}.md ──┘
                        │
                棟梁 が読み取り
                        │
                計画ファイルに新タスク追記
```

## 職人 への指示テンプレート

職人 を起動する際、以下を必ず含める:

```
あなたの担当タスク: {タスク内容}

【重要: 発見ルール】
作業中に以下を発見した場合、自分で解決せず
`.takumi/drafts/discovered-{あなたのタスクID}.md` に記録せよ:
- 担当外だが修正すべきバグ
- 関連するが別タスクにすべき改善点
- テスト不足の箇所
- 仕様上の疑問点

記録形式:
---
discovered_by: {タスクID}
---
- **発見1**: {内容} | 優先度: P0/P1/P2/P3 | カテゴリ: Bug|UX|Missing|Friction/Need|Test|Other
  | oracle_type: static|spec|differential|metamorphic|taste|friction  (巡視由来時のみ、既定 static)
  | phenomenon_id: {surface::journey::観測クラス}  (巡視 dedup 一次キー、視覚/摩擦/差分用) | root_cause_id: {file::symbol::欠陥クラス|null}  | graduate_to: AC-{surface}-{seq}|verify-L1|verify-L3|none
- **発見2**: ...

自分の担当タスクに集中し、スコープを広げないこと。

> **巡視 (挙動/視覚) 由来の発見** (`../../junshi/`) も同じ `discovered-{id}.md` 経路に載る。`oracle_type` と `graduate_to` を付け、`Friction/Need` カテゴリ (= ユーザーニーズ、起票時 confidence 低め) はバグ stream と混ぜない。確証の結晶化は `../../junshi/graduation.md`。
```

## 棟梁 の統合サイクル

各 Wave 完了後に 棟梁 が実行するルーチン:

1. `discovered-*.md` を全て読み取る
1.5. **root-cause 単位で novel 判定 (gaming 防止)**: 各発見に `root_cause_id` (= `file::symbol::欠陥クラス`) を付与し、**既出 (解決済 含む) と同一 root-cause なら novel でない** — issue の言い換え・別名で同一根因を再カウントしない。`novel_valid` = 新 root-cause ∧ 再現可 (同手順 2 回 or test deterministic fail) ∧ actionable (affected surface + 期待/実際 + 最小再現 + 推定原因)。非該当は計画に挿入しない (低信頼・重複の水増しを防ぐ)。
2. novel_valid 発見を計画ファイルの適切な Wave に挿入（または新 Wave 作成）。**新 task の `depends_on` を推定** (発見元 task + 触る file_scope から逆算)。推定不能なら安全側で「現在の全未完了 task に依存」= 最終層に直列追加 (`wave-dag.md` §7)
3. 優先度 P0 の発見は依存解決を待たず次バッチ先頭に割り込み
4. `discovered-*.md` をアーカイブ（`.takumi/drafts/archive/`）
5. Wave 完了レポートを生成してユーザーに報告

## Wave 完了レポート形式

```markdown
## Wave N 完了レポート
- **完了タスク**: X件
- **新規発見タスク**: Y件（P0: a, P1: b, P2: c, P3: d）
- **残タスク**: Z件（P0: a, P1: b, P2: c, P3: d）
- **累計完了**: XX / YY 件
- **次Wave予定**: Wave N+1: {概要}
- **状態**: 自動継続中（ユーザーが「止めて」と言わない限り進む）
```

## 自動継続ポリシー

自己増殖型は **ユーザーが「止めて」と言うまで自動で回り続ける**:

| タイミング | 自動アクション |
|-----------|--------------|
| Wave 完了レポート時 | 進捗を報告し、即座に次 Wave へ進む |
| P0 割り込み発見時 | 次 Wave の先頭に自動挿入して続行 |
| 計画が 100+ タスクに成長時 | ICE スコア上位 50件に自動トリアージして続行（報告のみ） |

> **loop 健全性**: 自己増殖ループは無人で回り続けて健全 — root-cause dedup で重複ゼロ・novel_valid 継続・低信頼水増しなし・自律 self-correction。**健全収束** = ラダー L6 (harness 不在なら L5/L4) まで登り切った後 2 cycle 連続 novel_valid=0 (`discover.md`/`runtime.md` の限界効用)。「候補なし」での早期停止は最上位レンズ未踏なら不可。novel_valid 収量の最低健全線は **≥0.08 件/1k token** (下回り継続時は理由ログ必須)。

## 通常計画との使い分け

| | 通常計画 | 自己増殖型 |
|---|---------|-----------|
| スコープ | 事前確定 | 実行中に拡張 |
| Wave 数 | 固定 | 増える |
| 終了条件 | 全タスク完了 | ユーザー判断 |
| 適用場面 | 機能追加、明確なバグ修正 | 品質改善、網羅的レビュー、リファクタ |
| コンテキスト管理 | 1 職人 が広く見る | 各 職人 は狭く、発見は計画へ |

---

## 3-Lane Discovery / Sprint Mode との使い分け

本書 (single backlog) は **発見が少なめ (1 Wave で ≤ 3 件)** の Quick / Standard / 軽い Large 用。発見が多発する場合や Sprint × N の長期 plan では別系統:

| 状況 | 適用 |
|---|---|
| 発見 ≤ 3 件 / Wave、線形 backlog で OK | **self-multiplying.md (本書、default)** |
| 発見 4+ 件 / Wave、Main context 圧迫 | `3lane-discovery.md` (P0/P1/P2 分離、P2 隔離で context 削減) |
| 50+ file / 30+ task の長期 plan (Sprint × N) | `sprint-mode.md` (3-phase Cycle、S-PCR で発見の Plan Phase 環流) |
| user 発話 "確実に / 完全に / マイクロ管理" or Wave Formula ≥ 100 | sprint-mode.md フル + 3-Lane + Hidden checklist + Cross-Sync |

混在禁止: plan 起草時に「**self-multiplying / 3-Lane / sprint-mode のどれか 1 つ**」を選択して明示。

### 探索 task 分離 (discovered_ratio 測定時の注意)

self-application 系 plan (= plan 自身を Sprint task に充当) では exploration 副作用で discovered_ratio が通常運用より高く出る (通常閾値 25% を超過しうる)。

- plan 起草時に **探索 task に flag** (= "scope 未確定 / 仕様模索 / pilot 自身を含む")
- `discovered_ratio = discovered / non_exploration_input` で評価
- 探索 task と通常 task を `sprint-X-task-classification.csv` で分離記録

通常 product 開発の self-multiplying では探索 task はゼロ前提、本注意は pilot / research 用途のみ適用。

---

## backlog 連携 (発見 3 件超で OfferPolicy 経由)

1 Wave 内で `discovered-*.md` が **3 件以上**生まれた時、**`OfferPolicy.shouldOffer('discovered_3plus')`** を呼ぶ (`SKILL.md` Step 0e):

- `true` → backlog 機能の提案を 1 回提示 (1-2 件では呼ばない、ノイズ防止)
- `false` (external / enabled / deferred 期限内 / session 既出) → silent

`mode == enabled` 時は discovered 各エントリを `.takumi/backlog/open/BL-###-{slug}.md` に自動昇格 (source: discovered)。`backlog/` で管理される項目は plan 本体 TODO リストからは外す (二重台帳防止)。詳細: `backlog/offer-policy.md`。
