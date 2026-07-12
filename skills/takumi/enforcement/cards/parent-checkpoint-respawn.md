---
source_rule_id: parent-checkpoint-respawn
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:a1a59c1a8bd760f887a51516826792de40d4a86db658c9604262a7c3ce0f718f
generated_at: 2026-07-09T07:35:36.697Z
compiler_version: 1.0.0
tier: 3
safety: none
applies: autonomy.level != manual
applicability_degraded: false
---
## scope
長走行 session の親 (棟梁) 文脈

## shall
5 Wave ごとに plan + state.json + 直近 handoff + active card から状況を再構成し「現在地 5 行要約」を書き直す (context 20% 到達なら G6 で respawn)

## not
10 Wave 超を要約更新なしで走る・実行を剥がした親の判断を古い会話記憶に依拠させる

## applicability
autonomy.level != manual

## evidence
false
