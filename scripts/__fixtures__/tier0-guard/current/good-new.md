---
surface: notifications
tags:
  UI有無: none
  状態複雑度: stateless
  オラクル有無: deterministic
  変更リスク: local
  利用者: developer
  失敗影響: cosmetic
created: 2026-07-02
top_contract:
  I1: notification id は surrogate (uuid)
  I2: null
  I3: null
  I4: queued→sent のみ
  I5: system のみ発行可
  I6: null
  T1: enqueue 操作で notification が queued になる
  T2: null
  T3: 配信先不明時は queued のまま失敗ログ
  T4: null
---

# notifications surface (新規、baseline なし)

- id: AC-NOTIF-001
  gwt: "Given valid payload, When enqueue, Then status=queued"
  ac_class: state-transition
  risk: low
  derived_from: [I4, T1]
  status: active
  covered_by: [notifications.enqueue.spec.ts]
