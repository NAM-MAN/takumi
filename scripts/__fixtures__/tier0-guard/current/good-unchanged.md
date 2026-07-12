---
surface: billing
tags:
  UI有無: API-only
  状態複雑度: CRUD
  オラクル有無: deterministic
  変更リスク: local
  利用者: operator
  失敗影響: recoverable
created: 2026-06-01
top_contract:
  I1: 請求書 id は natural key (invoice_number)
  I2: null
  I3: 確定後は金額不変
  I4: draft→confirmed→paid のみ、逆遷移不可
  I5: operator のみ確定可
  I6: null
  T1: 確定操作で invoice が confirmed になる
  T2: draft 状態のみ確定可能
  T3: 二重確定は禁止 (冪等エラー)
  T4: 確定後の取消は不可 (補償トランザクションで新規クレジットノート発行)
---

# billing surface

Tier0 は不変。今回は Tier-1 (AC) の追加のみ。

- id: AC-BILL-001
  gwt: "Given draft invoice, When confirm, Then status=confirmed"
  ac_class: state-transition
  risk: standard
  derived_from: [I4, T1]
  status: active
  covered_by: [billing.confirm.spec.ts]

- id: AC-BILL-002
  gwt: "Given confirmed invoice, When paid, Then status=paid"
  ac_class: state-transition
  risk: standard
  derived_from: [I4]
  status: active
  covered_by: [billing.pay.spec.ts]
