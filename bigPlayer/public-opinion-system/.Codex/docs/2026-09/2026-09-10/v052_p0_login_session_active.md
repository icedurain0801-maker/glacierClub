---
last_updated: 2026-09-10
status: login_session_active
scope: p0-target-login-session
---

# v052 P0 目标绑定创建与单次真实登录

## 精确绑定

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- platform：`bigplayer_h5`
- 脱敏绑定摘要：`19e23716b8263f21`

绑定使用 credential reference，由 Login Session 服务通过内部受控解析器读取账号密码。本次输出未包含账号、密码、Token、sessionRef、验证码图片或请求头。

## 真实登录结果

| 阶段 | 状态 | failureCode | challengeId |
|---|---|---|---|
| binding | `pending_verification` | 无 | 无 |
| startLogin | `active` | 无 | 无 |
| read-only status | `active` | 无 | 无 |

- createdAt：`2026-09-10T01:18:44.825Z`
- updatedAt：`2026-09-10T01:18:51.565Z`
- sessionExpiresAt：`2026-09-10T02:18:51.565Z`（北京时间 10:18:51）
- challenge type：无
- 是否需要用户人工验证：否
- 是否可自动恢复：是

## 停止点

按本轮门禁，在登录会话变为 active 后立即停止：

- 未调用 auth result claim。
- 未写回或修改 credential。
- 未执行 provider health。
- 未恢复 source enabled。
- 未启动 Worker、统一调度、legacy task 或采集。

下一步需要新的授权：领取该账号登录结果并安全写回 api_token，然后执行真实 provider health。只有 health 返回 authorized 才能恢复 source 并重跑原日期采集。

本轮未修改业务代码，未提交、push 或发版。

## 登录结果领取后续

v053 执行唯一一次领取时，会话仍为 active，但交换结果已超过默认 30 秒有效期，返回 `AUTH_RESULT_EXPIRED`（HTTP 410）。失败发生在 credential 写回与 provider health 之前。
