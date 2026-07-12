# autonomy — 軍師裁定による無人実行 (executor 内部責務)

`executor.md` から参照。executor は既に Wave 間を無人継続する。本ファイルは**残る人間ゲートを軍師裁定に置換**し、`autonomy.level` に応じて計画→実行→完了を無人化する規約を定める。

> [!IMPORTANT]
> 無人化しても **human floor = 不可逆操作 (§2 の 2 層判定: LLM 可逆性分類 ∪ deterministic high-risk path override) は絶対に人間サインオフ**。軍師が proceed と言っても不可逆は止める。安全側に倒すのが大原則。本書で `critical` の語は **human-floor (= 不可逆)** と同義 (§3/§4/§6 の `critical` も同義)。

---

## 1. gate の 3 分類 <!-- RULE: gate-classification T3:kernel-reanchor -->
<!-- scope:各決定点の分類 / shall:auto-pass|軍師-adjudicated|human-required に分類し critical のみ human / not:全 gate で人間確認 / applicability:always / evidence:autonomy-decision.jsonl -->

各決定点を `auto-pass` / `軍師-adjudicated` / `human-required` に分類:

| gate | 分類 | 挙動 |
|---|---|---|
| **G1 計画承認** | 軍師-adjudicated → critical なら human | 軍師 plan-review が blocking なし AND critical AC なし → 無人 proceed |
| **G1.5 外部 scope 承認 check** (opt-in) | 状態駆動 → `rejected` なら human | `project.yaml.requirements.source ∈ {toishi, ...}` 時のみ発動。task 紐づき snapshot item の `approval_state` を Wave 1 着手前に確認: `approved` → proceed / `pending_approval`・`draft` → **自動 defer** (棟梁が「PdM 承認待ち」通知) / `rejected` → **human 必須** (差し戻し理由提示)。詳細 `toishi-integration.md` |
| **G2 Wave gate 失敗** | auto-pass (retry→skip) | 既存。ただし skip は fail-closed 記録 (§2) |
| **G3 escalation** (lint-repair 3 fail) | 軍師-adjudicated → critical なら human | 停止せず軍師に fix-or-defer 委譲 |
| **G4 最終レビュー** | auto-pass | 既存 (失敗時 2 round 修正) |
| **G5 P0 発見挿入** | auto-pass | 既存 (self-multiplying) |
| **G6 context 20% pause** | 保護機構 (gate ではない) | 残す |
| **G7 圧縮人間ゲート** (UI 自然さ、opt-in) | 状態駆動 → 高リスク差分のみ human | human-UI surface のみ。ConsistencyMatrix 人間必須 6 対 (H1 ブランド逸脱 / H2 情報優先度 / H3 例外画面違和感 / H4 コピー文言 / H5 導線 / H6 例外業務網羅、`contract-spine.md`) に**限定**。美意識全般は上げない。`変更リスク ∈ {cross-surface, contract-breaking}` or `失敗影響 ∈ {data-loss, security}` の差分のみ発火、それ以外は auto-pass |

実質の停止点は **G1 と G3 の 2 つだけ** (外部要件 source 連携時のみ G1.5、human-UI surface のみ G7 が加わる)。機械判定可能な部分 (M1-M12) は全機械化し、人間は反証能力のない美意識でなく上記 6 対の**高リスク差分**にのみ呼ぶ (軍師: 圧縮人間ゲート)。それを軍師が裁定し、critical のみ人間に上げる。G1.5 は state-driven (軍師裁定不要) で、`requirements.source` が未設定 / `local` / `never` の project では完全 no-op (default 挙動に影響なし)。

> **巡視 (junshi) ops の分類** (`../../junshi/`): 巡視の **発見記録 (discovered-{id}.md / backlog / `status: draft` の AC 提案) は `.takumi/` 限定 = ungated**。採取モードはここで完結し止まる。ただし **draft AC の active 化は contract-spine の add 規律 (`derived_from` + AC-coverage gate + M9) を通す** — 新 AC は将来の gate/scope/実装義務を変えるため ungated にしない (`../../junshi/graduation.md`)。**巡視発見の自動修正は通常の executor Wave gate (A-J) + 本書 human floor を必ず経由** (常駐ループ B-2、`autonomy.level` 準拠、`junshi.enforcement: autofix` 時のみ = pilot GO 後)。発見+記録 (discovery) 自体は `junshi.discovery: auto` で既定 ON・自己増殖するが advisory・`.takumi/`-only ゆえ無ゲート。趣き/摩擦オラクル由来は advisory ゆえ自動修正の対象にせず backlog 止まり。②走行は実アプリ駆動だが sandbox/in-memory/network-deny の containment 内 (`../../junshi/runtime.md`) で副作用 leak 時は即 reject = fail-closed。

---

## 2. human floor — 不可逆性 (blast-radius) の二段検出 + deterministic override <!-- RULE: human-floor-irreversible T1:check-irreversible-paths+hook -->
<!-- scope:不可逆操作の human sign-off / shall:LLM可逆性分類∪deterministic path override で human floor / not:不可逆を autonomous 通過 / applicability:always / evidence:scripts/check-irreversible-paths.mjs -->

human floor = **「不可逆操作」**。旧 語彙マッチ (undo/rollback/決済/権限/並行編集/データ消失/監査) は irreversible を無人通過させ危険なため廃止。代わりに **2 層**で判定する:

**human floor = (Layer1) LLM 可逆性分類が irreversible ∪ (Layer2) deterministic high-risk path override**

### Layer1 — 可逆性分類 (LLM、blast-radius ベース)
**autonomous 可 (可逆)** = 4 条件全て: (1) 効果が git 管理下の作業ツリーに限定し git で巻き戻せる / (2) runtime 外部副作用なし (network / 実・共有・staging・prod DB write / 送信 / process / deploy なし) / (3) local test で検証できる種類 (code/test/refactor/config 編集) / (4) 実行が永続外部効果を持たない (sandbox / in-memory / dry-run / read-only)。
**基準は実行・接続・権限変更であってファイル位置でない**: git 管理ファイルの *編集* 自体は config でも可逆 (git revert 可)。
**human floor 必須 (不可逆)**: deploy/publish/release/registry write / 実・共有・staging・prod DB の write・migration 実行・破壊的 query / secret rotation・credential 発行失効 / billing・payment・auth provider の live 設定変更 / CI/CD 有効化・runner secret・prod env / 外部 API write・execute / 未追跡・未 backup の削除・共有ログ truncate / **rollback 手順が未定義 or 検証不能**。

### Layer2 — deterministic high-risk path override (LLM 判断に依らず human)
LLM 判断は「config 編集の downstream 不可逆性」(例: workflow から SENTRY_DSN 削除 → 次 deploy で error tracking 不可逆消失) を境界で取り逃がす。これを機構的に塞ぐため、**次の path/keyword に該当する mutating 操作 (delete/disable/rename/value 除去/deploy 挙動変更) は LLM 分類に依らず human floor**:
- `.github/workflows/**` / `.gitlab-ci*` / `.circleci/**` / `buildkite/**`
- `deploy/**` / `deployment/**` / `k8s/**` / `helm/**` / `terraform/**` / `infra/**`
- `*.env` / `.env*` / `config/**/prod*`
- path/diff に secret・credential・key・token を含む
- observability: sentry / datadog / newrelic / otel / prometheus / grafana / logging / alert
- DB migration: `migrations/**` / `prisma/migrations/**` / `db/migrate/**`

ただし comment / docs / test-only / local-dev-only の純加算的変更は Layer1 (R') に戻す (過剰 gate を避ける)。

> **runtime 質問予算** (`../qbc.md`、policy `ask-only-if-irreversible`): Layer2 path override の誤発火 (例: markdown/skill-only repo で config 系に触れず停止) を抑え、不可逆のみ停止する較正は QBC が source-of-truth。

### 二段検出 (static first-pass + runtime second-pass) — 構造は維持
1. **first-pass (static)**: plan 生成時に上記 2 層で task を autonomous-eligible / human-floor に分類。
2. **second-pass (runtime)**: 職人/棟梁が **各 side-effect (tool call / diff apply / 外部 API / DB 書込) の直前に再評価**。可逆と判定した op が実行直前に不可逆 (接続先・auto-hook・権限変化) と判明したら、その時点で **human-floor に動的昇格**。

**fail-closed 原則**: 可逆性を証明できない時 (検証不能 dry-run / auto-run hook 付き未実行 migration / hot-reload file) は human。G2 の gate 失敗 skip と G6 timeout は**安全側で停止**し `autonomy-decision.jsonl` に記録 (§6)。skip が連続 **3 件**超で非 critical でも human escalation。

> **supervised completion (self-paced loop) 下の fail-closed**: human floor で停止する時は **state.json.status を `paused_human` + `stop_reason` に記録**してからユーザーに上げる (`executor.md` Step 4)。これにより `/loop` が次の tick で**再起床して承認ゲートを踏み潰すのを機構的に防ぐ** (executor が `paused_human` を見て自分で ScheduleWakeup を呼ばない)。固定間隔ループは使わない (self-paced 必須)。

---

## 3. 軍師 adjudication protocol

G1/G3 で軍師 review を呼ぶ時、戻り値を構造化し棟梁が機械分岐する:

```
verdict:     proceed | fix | defer | escalate
confidence:  high | medium | low          # low は uncertainty:high 扱い
rationale:   1-2 行
fix_instruction: (verdict=fix のみ) 職人 への repair 指示
```

棟梁の branching:

| verdict / 条件 | 棟梁の動作 |
|---|---|
| `proceed` + 非 critical + confidence ∈ {high, medium} | 無人 proceed |
| `proceed` + critical | **human-required** (verdict を添えて提示) |
| `confidence: low` (verdict 問わず) | **human-required** (軍師が判断つかない = 人間) |
| `fix` | 職人(Sonnet) repair → 再 gate (lint-repair ループに合流) |
| `defer` | issues.md 記録 + 継続 (非 critical のみ。critical は escalate に格上げ) |
| `escalate` | **human-required** |

---

## 3.5 決裁ドシエ — 停止の質 (裸の yes/no 禁止) <!-- RULE: decision-dossier-schema T3:kernel-reanchor -->
<!-- scope:人間に上げる全停止の提示形式 / shall:検証済+推奨 or blocked_reason を構造化して添える / not:裸のyes/no / applicability:always / evidence:loop-invariant.md#3 -->

human floor (G3/§2) や critical G1 で人間に手を止めて上げる時、**裸の「いいですか?」は malformed**。
必ず次の構造を添える (`loop-invariant.md` §3 が kernel 再アンカー):

```
🛑 STOP [gate / なぜ自動で決められないか 1 行]
検証済 : 自分で回した build/test/spec/軍師 verdict と結果   ← 責任を取る
リスク : blast-radius・可逆性・誤れば何が壊れるか
推奨   : 私の推奨 + confidence(high|medium|low)            ← 責任を取る
人間判断が要る理由 : 不可逆性 / ブランド美意識 / 事業判断 のどれか
選択肢 : [推奨どおり進める] / [代替案] / [中止]
```

**例外 (検証不能だが聞くべき)**: 外部権限・秘匿情報・未取得要件で推奨が出せない時は、
裸の質問でなく **`blocked_reason ∈ {missing_capability, missing_input, missing_authority}` + 推奨不能の理由 + 何があれば決められるか**を添える。
これも「いいか」だけよりは責任を果たす形。

**自己診断**: 検証済も推奨も blocked_reason も書けない → それは停止すべきでないシグナル。検証して自分で決める。
監査: 各停止は `autonomy-decision.jsonl` に `stop_kind: dossier|blocked|bare` を記録 (bare = 違反、telemetry-spec)。 <!-- RULE: stop-legality-audit T1:scripts/check-stop-legality.mjs -->
**T1 deterministic 強制** (kernel §4 を script 化): `scripts/check-stop-legality.mjs` が `stop_kind=bare`・legal stop set `{G1,G1.5,G3,G6,G7}` 外の gate・不正 `blocked_reason`・confidence 欠落 dossier・`wave_boundary.asked_continue=true` を deterministic に fail (exit 1)。希薄化に負けず「無人なのに確認/裸 yes/no/続けますか?」を機構的に塞ぐ。seeded fixture: `scripts/__fixtures__/stop-legality/`。

---

## 4. degraded autonomy — 軍師 unavailable 時

env.yaml で codex=degraded / copilot=quota_constrained の時、裁定者は **opus-max self-review (棟梁自身)** に落ちる。autonomy の信頼性は transport に依存することを明示し、critical は安全側に倒す:

| 軍師 transport | 非 critical の裁定者 | critical の裁定者 |
|---|---|---|
| healthy (codex/copilot 正常) | 軍師 (cross-model) | 軍師 + human |
| **degraded** | **opus-max self-review** (`⚠ degraded` 注記) | **human 必須** (opus-max 単独で critical を無人通過させない) |
| 軍師 + opus-max 共に不能 | pause + resume.md | pause + resume.md |

---

## 5. autonomy level knob (`.takumi/profiles/env.yaml`)

```yaml
autonomy:
  level: autonomous            # manual | gated | autonomous (default: autonomous)
  human_floor: irreversible    # 不可逆操作のみ human (§2 の 2 層判定)
  degraded_critical: pause_for_human   # 軍師 degraded 時の不可逆 (=critical) の扱い
  skip_escalation_threshold: 3 # 連続 skip がこの数を超えたら非 critical でも human
```

| level | G1 計画承認 | G3 escalation | 用途 |
|---|---|---|---|
| `manual` | human | human | 旧来挙動 (慎重運用) |
| `gated` | human (1 回だけ) | 軍師→critical なら human | 計画だけ確認したい |
| `autonomous` (**default**) | 軍師→critical なら human | 軍師→critical なら human | 完全無人 |

切替は自然言語: 「autonomy を gated に」「無人実行を止めて」等を本 block 更新に mapping。

---

## 6. 監査証跡 (`.takumi/telemetry/autonomy-decision.jsonl`、append-only)

無人実行の各 gate 判断を必ず残す (後から「なぜ proceed したか」を追える):

```jsonc
{"ts":"...","gate":"G1|G3","task_id":"...","risk":"critical|...",
 "adjudicator":"gunshi|opus-max|human","verdict":"proceed|fix|defer|escalate",
 "confidence":"high|medium|low","runtime_promoted":false,"rationale":"..."}
```

`runtime_promoted: true` は §2 の second-pass で critical に動的昇格したことを示す。schema 詳細は `telemetry-spec.md` の autonomy 節。

---

## 関連リソース

| file | 用途 |
|---|---|
| `executor.md` (同ディレクトリ) | 全体 executor、G1/G3 で本ファイルを参照 |
| `wave-dag.md` (同ディレクトリ) | 並列実行 (層単位 gate が G2 に対応) |
| `plan-template.md` (同ディレクトリ) | task の `risk` フィールド (Step 0c で付与) |
| `telemetry-spec.md` (同ディレクトリ) | autonomy-decision.jsonl の schema |
