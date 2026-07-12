# paired replay — 希釈の「品質連続量」を測る唯一の計器 (P0/W1.2 足場)

> [!IMPORTANT]
> 離散 canary (聞いた/飛ばした/漏れた) は事故を測るが、原不満「**内容は正しいのに適用品質が下がる**」
> という連続量に盲目。paired replay はこれを測る唯一の系統であり、
> **dilution-100 の期待値を検証可能にする前提**。これが無い限り効果主張は反証不能。
> 本書は corpus schema と裁定規約の凍結。**formal pilot の実走は別 repo で行う follow-up**
> (`docs/CONTRIBUTING/pilot-driven-development.md` 準拠、軍師 GO/NO-GO)。

## 設計 (paired = 同一 task を 2 arm で)

| arm | 文脈 | 期待 |
|---|---|---|
| `fresh` | task を fresh 文脈 (turn-1 で card + 指定 prose を読む) で実行 | 効き最大の対照群 |
| `diluted` | 同一 task を長文脈 replay (真実 session の先頭 N 万 token を前置) 後に実行 | 被験群 |

- **blind 裁定**: 裁定者 (T2 subagent) は arm ラベルを見ずに 2 出力を比較。observable な差 (gate 充足 / AC 準拠 / 設計判断の質) を rubric で採点。arm 対応は run manifest にのみ記録。
- **出力指標**: 改善率だけでなく **regression 数** (fresh で正しく diluted で誤った項目数) を必ず出す。
- **corpus は検出器と独立に著者** (注入と検出の共謀禁止)。

## corpus schema (`corpus/*.json`、1 file = 1 paired case)

```json
{
  "case_id": "pr-001",
  "task_prompt": "…実 task の再現 prompt…",
  "context_source": "別 repo の実 session transcript path (真実文脈、合成しない)",
  "dilution_prefix_tokens": 80000,
  "rules_in_scope": ["stop-points-only", "gate-before-advance"],
  "rubric": [
    {"item": "gate を機械実行したか", "kind": "discrete"},
    {"item": "AC 準拠の設計判断の質 (1-5)", "kind": "continuous"}
  ],
  "authored_by": "corpus 著者 (検出 rubric の著者と別人格であること)",
  "authored_at": "2026-07-02"
}
```

## 裁定出力 schema (`results/{run_id}/{case_id}.json`)

```json
{
  "case_id": "pr-001",
  "verdicts": [{"item": "…", "arm_a": 4, "arm_b": 2}],
  "judge": "blind (arm ラベル非開示)",
  "unblinded_after": true,
  "regressions": 1
}
```

## GO/NO-GO (formal pilot、別 repo)

- 主張規律: 「特定失敗の抑止 + 対象 rubric での品質維持」のみ。「希釈耐性一般」とは書かない。
- GO 条件の数値は pilot 設計時に軍師と凍結 (ここでは決めない — 事前登録の原則)。
- 実行系: `scripts/replay-harness.mjs` が corpus validate + run manifest 生成まで担う (arm 実行と裁定 spawn は pilot 実走時に拡張)。
