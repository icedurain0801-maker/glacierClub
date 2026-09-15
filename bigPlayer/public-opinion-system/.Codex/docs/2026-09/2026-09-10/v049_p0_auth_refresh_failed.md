---
last_updated: 2026-09-10
status: blocked_auth_refresh_failed
scope: p0-target-account-auth-repair
---

# v049 P0 目标账号运行时认证修复失败

## 精确范围

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- default account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- business date：`2026-09-09`

## 来源重试隔离

为阻断当前常驻 Worker 对该 source 持续产生 `CREDENTIAL_NOT_FOUND` 失败 run，仅执行：

- source enabled：true → false
- affectedRows：1
- 未修改、停止或重启其他 Worker/来源
- 未启动统一调度或 legacy task

目标 source 当前保持 disabled；后续只有真实 auth health PASS 后才能恢复 enabled。

## 受控凭据核验

所有检查只输出状态和稳定码，未输出凭据明文、密文、长度、截图或请求头。

| 检查项 | 结果 |
|---|---|
| `account_password` 当前环境解密 | PASS |
| `api_token` 当前环境解密 | PASS |
| account/source 绑定 | PASS |
| credential active/未过期 | PASS |
| provider 实际 health | FAIL：`UNAUTHORIZED` |
| Login Session 服务配置 | PASS |
| 仅目标账号刷新 | FAIL：`AUTH_REFRESH_FAILED` |

两类凭据均能解密，说明本次手动运行环境的 credential 解密键有效；真实 provider 仍拒绝当前 Token。Login Session 刷新流程已启动，但没有返回可通过 provider health 的新 Token。

运行时同时出现 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告。该配置会关闭 TLS 证书校验，属于需要单独治理的安全风险；没有证据表明它是本次 401/UNAUTHORIZED 的直接原因。

## 停止点与数据证据

- 汇总原因码：`P0_AUTH_REFRESH_FAILED`。
- 真实 health 未通过，因此没有重跑同 source/date 采集。
- 精确窗口本机 DB：posts=0、comments=0、total=0。
- 最近观察到的既有 Worker run：failed，`CREDENTIAL_NOT_FOUND`，discovered/stored/fetched/inserted/comments 均为 0。
- v048 的手动采集报告仍为 failed/UNAUTHORIZED，未进入 crawler/import。

## 最小下一步

仅针对该 account，在 Login Session 服务侧检查本次绑定/登录会话的脱敏失败码；若进入人工验证，必须由用户完成相应挑战。获得新 Token 后应先执行 provider health，只有 `authorized=true` 才恢复 source enabled 并重跑原 source/date/manual。

不得通过直接修改 `auth_status`、credential `status` 或 expiry 字段伪造健康。

本轮未修改业务代码，未提交、push 或发版。

## 后续只读根因补充

v050 已确认 `AUTH_REFRESH_FAILED` 的直接原因是 `LOGIN_SESSION_SERVICE_URL` 指向的 4310 端口实际由 `QQ.exe` 监听，真实 Login Session 服务未运行。当前没有有效 challengeId 或挑战类型，不能将失败归因于用户未完成验证码。
