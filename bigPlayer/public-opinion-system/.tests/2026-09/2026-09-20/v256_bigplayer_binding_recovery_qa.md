# BigPlayer 4311 绑定恢复 QA 报告

- 日期：2026-09-20
- 结论：**绑定恢复 PASS；已允许一次新的有限 incremental sync**

## 证据

- 数据库只读核对：目标账号仅关联 `1` 个 enabled source，且为目标 BigPlayer source；source/account 均 authorized/enabled。
- 仅重启 `PublicOpinionLoginSession`：4311 监听保持，health `200`、ready `true`；API/Worker 未重启。
- 目标 bind/status：HTTP `200`，scope 为目标 `sourceId/accountId/platform`，状态 `pending_verification`，`credentialConfigured=true`，`failureCode=null`。
- 错误码透传：错误 scope status 返回 `403 ACCOUNT_SCOPE_MISMATCH`；冲突 bind 返回 `409 ACCOUNT_BINDING_CONFLICT`。
- 定向回归：`node --test server/test/authRefreshCoordinator.test.js`，`4/4 PASS`；`git diff --check` 通过。
- 未访问 Provider，未创建第二个 run。

## 后续唯一门禁

只允许一个新的 `incremental` sync；需核对 run 创建、queued/running/terminal、`fetched = inserted + changed + unchanged`、checkpoint、`919716` 入库和 3000 浏览器内容。失败即停，不重试。
