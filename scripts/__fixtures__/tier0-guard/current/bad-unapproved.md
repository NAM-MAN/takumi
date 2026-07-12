---
surface: auth
tags:
  UI有無: human-UI
  状態複雑度: CRUD
  オラクル有無: deterministic
  変更リスク: contract-breaking
  利用者: end-user
  失敗影響: security
created: 2026-04-01
top_contract:
  I1: user id は surrogate (uuid)
  I2: null
  I3: 認証済みセッションは有効期限内のみ有効
  I4: anonymous→authenticated のみ
  I5: 本人のみパスワード変更可
  I6: null
  T1: login 操作で session が authenticated になる
  T2: 正しい credential 提示時のみ login 可能
  T3: 10 回失敗でアカウントロック
  T4: ロック解除は admin のみ
---

# auth surface (T3 の閾値を無承認で 5→10 に変更)

- id: AC-AUTH-001
  gwt: "Given valid credential, When login, Then session=authenticated"
  ac_class: state-transition
  risk: critical
  derived_from: [I4, T1]
  status: active
  covered_by: [auth.login.spec.ts]
