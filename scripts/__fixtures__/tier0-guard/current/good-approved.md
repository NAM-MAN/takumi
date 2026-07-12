---
surface: refund
tags:
  UI有無: API-only
  状態複雑度: workflow
  オラクル有無: deterministic
  変更リスク: cross-surface
  利用者: operator
  失敗影響: data-loss
created: 2026-05-01
tier0_change_approved_by: reviewer-a (軍師 gate 2026-07-02、契約改訂 semver major 相当)
top_contract:
  I1: refund id は natural key (refund_number)
  I2: null
  I3: 返金額は元注文金額を超えない (部分返金は複数回まで許容)
  I4: requested→approved→settled のみ
  I5: admin のみ approve 可
  I6: null
  T1: 承認操作で refund が approved になる
  T2: requested 状態のみ承認可能
  T3: 元注文が cancelled の場合は承認不可
  T4: settled 後の取消は不可
---

# refund surface (contract 改訂: I3 部分返金複数回対応)

- id: AC-REF-001
  gwt: "Given requested refund, When approve, Then status=approved"
  ac_class: state-transition
  risk: critical
  derived_from: [I4, T1]
  status: active
  covered_by: [refund.approve.spec.ts]
