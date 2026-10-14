# BigPlayer 4311 会话绑定冲突透传

- 日期：2026-09-20
- Candidate：`login-session-4311-20260920-1911g`
- 目标账号：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`

## 运行态验收

- 账号仅关联 1 个启用 source/platform 三元组，无合法共用冲突。
- 仅重启 `PublicOpinionLoginSession`：旧 PID `34376`，新 PID `38008`。
- 新进程持续监听 `127.0.0.1:4311`，health `200`，ready `true`。
- 目标三元组 bind 成功；只读 status 返回 `pending_verification`，scope 一致，`credentialConfigured=true`，无 scope mismatch。
- 未重启 API/Worker，未访问 Provider，未再次请求 sync。

## 根因

重启前，4311 内存会话中该 account 存在与目标 source/platform 不匹配的绑定。使用目标三元组只读查询返回 `403 ACCOUNT_SCOPE_MISMATCH`，导致 auth refresh 在 `bindAccount` 阶段失败；`AuthRefreshCoordinator` 原先将该客户端错误泛化为 `AUTH_REFRESH_FAILED`。

## 修复

`server/src/services/authRefreshCoordinator.js` 现在保留并透传 `ACCOUNT_BINDING_CONFLICT` 与 `ACCOUNT_SCOPE_MISMATCH`。新增 `server/test/authRefreshCoordinator.test.js` 两个透传用例。

## 验证

`node --test server/test/authRefreshCoordinator.test.js`：4/4 PASS。

有限 sync 请求此前已使用且失败，本次未重试、未补跑；需 QA 复核代码和运行态后，才能重新申请新的有限 sync 门禁。
