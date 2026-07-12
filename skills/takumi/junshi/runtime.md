# 巡視エンジン — AI runtime spec (①-⑥)

takumi の巡視で呼び出された AI エージェントが Read する運用仕様。LP / 用語解説は `README.md` 側。4 オラクルの接地は `oracles.md`、2 モード起動は `modes.md`、昇格は `graduation.md`。

> [!IMPORTANT]
> 巡視は重量オーケストレーターであり、capture (画像) を扱う。probe/sweep と同じく **1 本の Agent (Foreman) に全工程を委譲**し、Main は最終 JSON だけ受け取る。画像・DOM・trace を Main に返さない (context 崩壊防止)。委譲条件は `modes.md`。

---

## 発火条件 (これを満たさない surface は巡視しない)

巡視は **behavioral surface のみ**を対象とする。surface の 6 軸タグ (`../contract/surface-archetypes.md`) で判定:

- `UI有無 ∈ {human-UI, machine+human}` **OR** `状態複雑度 ∈ {workflow, realtime}`
- かつ `.takumi/specs/{surface}.md` に TopContract (I/T) が存在 (オラクル源)
- かつ ②走行に必要な **harness + 安全 containment** が揃う (下記)。揃わなければ静的発見 (probe L0-L4) に委ね、巡視は skip

> 上記いずれか欠落 → 巡視 skip (静かに)。`ac_ids` のみの旧 plan / spine 無し surface でも壊れない (発火しないだけ)。

### ②走行の前提 (L5 execution probe と同じ安全規律)

`../probe/discover.md` の L5 と同じ containment を要求する。**満たさなければ②走行を行わず①③のみの静的 dry-run に縮退**:

- 実行可能 harness: `run` skill / `webapp-testing` skill (Playwright) / Playwright MCP のいずれか
- sandbox / in-memory or seed DB / network deny (or mock) / 実・共有・staging・prod への write 遮断 / 副作用 audit
- **副作用 leak 1 件で巡視 run 全体を無効** (即 reject、`pilot.md` の棄却条件)

---

## エンジン ①-⑥

### ① 再生 (journey regeneration) — 保存しない

対象 surface の `.takumi/specs/{surface}.md` から **TopContract T1-T4** を読み、ユーザータスクの操作列 (journey) を生成する。

- T1 (観測可能成果) ごとに 1 journey。T2 (事前条件) で開始状態を、T3 (失敗・例外業務) で異常系 journey を、T4 (可逆性) で undo/rollback journey を派生
- **保存しない**。毎 run で TopContract から再生成する (spec が単一ソース = 腐らない = メンテ不要)
- journey はデータでなく「意図」: 「請求書を作成して送信し、その後取り消す」のような自然文ステップ列。具体的 selector は②走行時に DOM から解決

> 旧 e2e との差: 維持される `.spec.ts` を持たない。journey は spec の射影であり artifact でない。

### ② 走行 (drive) — 使い捨て capture

各 journey を実アプリで駆動し、各ステップで証拠を撮る。**全て使い捨て**:

| 証拠 | 退避先 (Foreman 内のみ、親に返さない) |
|---|---|
| screenshot (PNG) | `.takumi/artifacts/ui/{ts}/{journey}-{step}.png` → 分析後に破棄 |
| DOM snapshot | 同 `{ts}/` 配下の tmp、分析後に破棄 |
| console / network / timing | 同上 tmp |
| **観察テキスト化** | `.takumi/sprints/{日付}/ui-obs/{id}.final.md` (軽量、残す) |
| **比較用 signature** (差分オラクル用) | `.takumi/sprints/{日付}/ui-obs/{surface}-signatures.json` — 正規化 DOM 要約 / 状態ハッシュ / journey outcome **のみ** (raw でない軽量)。run-scoped、次 run 比較後に prune、**回帰ベースラインにしない** |

> sweep Foreman の capture 契約と同一 (`../sweep/runtime.md` 0b): 「撮影した PNG は `.takumi/artifacts/ui/{ts}/*.png` に保存。観察結果はテキスト化。親に画像を見せない」。巡視はこの既存契約を再利用する (新 machinery 不要)。

各 journey は **2 回走行** (再現性確認の最低線、`oracles.md` の差分/変換不変に必要)。非決定的差異 (timestamp 等) は noise として除外。

### ③ 照合 (collate, 4 oracles) — 発見力の本体

撮った証拠を 4 オラクルで照合する。**各オラクルの接地・検出対象・gate 可否・昇格先は `oracles.md` を読んで適用**:

1. **仕様オラクル**: 観測状態/出力 ↔ AC (I/T 派生) の食い違い
2. **差分オラクル**: 今回 capture ↔ 前 run capture / 姉妹 surface — AC で説明できない変化
3. **変換不変オラクル**: 変換不変条件 (戻る→進む / 2 経路同結果 / 並べ替え不変)
4. **趣きオラクル**: ArtCoT (`../design/taste-oracle.md`) — **advisory・never-block**

並行して **摩擦ログ** (ユーザーニーズ) を記録 (`oracles.md` §摩擦ログ)。

### ④ 反証 (refute) — 軍師 Devil's Advocate

候補発見を `../probe/triage.md` Step 4 の反論者にかける (軍師、`../dispatch/gunshi-invocation.md`)。生存条件:

- **再現可**: 2 回走行で同じ証拠が出る、または deterministic test に落とせる
- **接地**: 違反した I/T 項 (仕様/変換不変/差分) または taste rubric axis を引用できる。引用できない「なんとなく」は棄却
- **既知でない**: CLAUDE.md / 既存 AC で許容済の挙動でない

軍師 unavailable 時は opus-max self-review に降格 (`../dispatch/autonomy.md` §4、`⚠ degraded` 注記)。趣きオラクル発見は反証を通しても **advisory 止まり** (gate にしない)。

### ⑤ 昇格 (promote) — discovered-{id}.md + 結晶化

生存発見を self-multiplying の経路に載せる (`../sprint/self-multiplying.md`):

```
---
discovered_by: junshi-{surface}-{run_id}
---
- **発見N**: {内容} | 優先度: P0-P3 | カテゴリ: Bug|UX|Missing|Friction/Need|...
  | oracle_type: spec|differential|metamorphic|taste|friction
  | phenomenon_id: {surface::journey::観測クラス}   # dedup の一次キー (視覚/摩擦/差分は根因未確定が普通)
  | root_cause_id: {file::symbol::欠陥クラス|null}   # 根因確定時のみ (spec/metamorphic の実装バグ)
  | 証拠: .takumi/sprints/{日付}/ui-obs/{id}.final.md (screenshot は破棄済)
  | derived_from: [I4, T3]   # spec/metamorphic の場合、違反した I/T 項
  | graduate_to: AC-{surface}-{seq} | verify-L1 | verify-L3 | none
```

棟梁が Wave 境界で統合 (root_cause_id dedup、novel_valid 判定)。**確証された発見は結晶化** → `graduation.md` (spec → AC-ID 追加 / metamorphic・differential → verify L1/L3 の `it()`)。screenshot はこの時点で破棄済。

### ⑥ 校正 (calibrate) — oracle 別 precision

confirmed/rejected を `discovery-calibration.jsonl` に oracle_type 別で append (`graduation.md` §校正 ledger)。precision floor 未達の oracle は advisory 降格 / throttle。これが「人間以上」を維持する自己学習ループ。

---

## 発見ラダーにおける位置 = L6

巡視は `../probe/discover.md` の発見ラダー L0-L5 の **次レベル L6** として起動する (静的 L0-L4 + execution L5 が原理的に届かない「実際に触ると分かる挙動/視覚」family を炙る)。

- 昇格判定: L5 (harness 不在なら L4) が新規発見を出さなくなり、かつ harness + containment が揃うときのみ L6 起動
- **停止 = 限界効用** (`../probe/runtime.md` 終了条件と同一): 巡視 L6 で新レンズ (4 オラクル全部) を回しても新規が出なくなったときのみ収束。「新規ゼロ」での早期停止は不可
- novel_valid 収量の最低健全線は `../sprint/self-multiplying.md` と同じ **≥0.08 件/1k token** (下回り継続時は理由ログ)

---

## Foreman 委譲プロンプト (採取/常駐 共通の骨格)

```
Agent(
  description: "junshi {surface} {run_id}",
  subagent_type: "general-purpose",
  prompt: """
    Read ~/.claude/skills/takumi/junshi/runtime.md + oracles.md fully and execute ①-⑥.
    Read CLAUDE.md for project context. Read .takumi/specs/{surface}.md for TopContract.

    ## I/O 契約 (厳守)
    - screenshot/DOM/trace は .takumi/artifacts/ui/{ts}/ に退避し、分析後に破棄
    - 観察は .takumi/sprints/{date}/ui-obs/{id}.final.md にテキスト化
    - 発見は .takumi/drafts/discovered-junshi-{surface}-{run_id}.md (上記 schema)
    - 書き込みは *.partial → mv *.final (atomic)
    - 最終メッセージは JSON 1 枚のみ (1KB 未満、画像・DOM・diff 含めない):
      {
        "surface": "...", "run_id": "...", "journeys_run": N,
        "candidates": N, "survived": N, "by_oracle": {"spec":N,"differential":N,"metamorphic":N,"taste":N,"friction":N},
        "graduated": N, "ladder_level": "L6", "harness_ok": true,
        "novel_valid_per_1k": 0.x, "status": "in_progress|paused|done|skipped_no_harness",
        "one_line_verdict": "..."
      }

    ## 親に返してはいけないもの
    - screenshot / DOM / trace のバイナリや詳細観察文
    - 軍師 (codex) の tail 出力
    - journey の操作ログ本文
    これらは全て .takumi/ 配下にのみ書く。

    ## コンテキスト保護
    残量 20% で resume.md を書き status: "paused" で早期終了。
  """,
  run_in_background: false
)
```

Main は JSON を 2-3 行で日本語要約してユーザーに返すだけ。以降の ①-⑥ は Foreman 内部手順。

---

## 制約

> [!WARNING]
> - ②走行の harness/containment が無ければ巡視を**実行しない** (静的に縮退)。無理に走らせない
> - 副作用 leak 1 件で run 無効 (即 reject)
> - 趣きオラクルは **never-block** (advisory)。raw taste を gate にしない (恒久禁止)
> - capture は使い捨て。維持される `.spec.ts` を生成しない。journey は再生成
> - 親 (Main) に画像・DOM・trace を返さない (Foreman 内で完結)
> - 反証 (④) を skip しない。接地できない「なんとなく」は棄却 (FP 抑制)
> - 発見の書き込みは `.takumi/` 限定 = ungated。修正は別 (executor Wave gate + human floor、`modes.md`)

---

## 関連リソース

| file | 用途 |
|---|---|
| `README.md` (同) | 人間向け LP、2 モード、使い捨て⇄永続の論証 |
| `oracles.md` (同) | 4 オラクルの接地・検出対象・gate 可否・昇格先 + 摩擦ログ |
| `modes.md` (同) | 採取/常駐モード、`/loop` 配線、排他ガード、autonomy 連携 |
| `graduation.md` (同) | 確証 → AC-ID / verify L1/L3、使い捨て境界、校正 ledger schema |
| `pilot.md` (同) | 閾値先出し (precision/recall/FP/human-alignment)、採用/棄却条件 |
| `../contract/contract-spine.md` | オラクル源 (I1-I6/T1-T4、M1-M12/H1-H6) |
| `../probe/discover.md` | 発見ラダー (巡視 = L6)、L5 containment 前提 |
| `../sprint/self-multiplying.md` | discovered-{id}.md 経路、root_cause_id、novel_valid |
| `../design/taste-oracle.md` | 趣きオラクル (ArtCoT、advisory・never-block) |
| `../sweep/runtime.md` | Foreman の capture 退避契約 (再利用元) |
