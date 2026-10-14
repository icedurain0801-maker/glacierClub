# BigPlayer source/account 绑定根因报告

- 日期：2026-09-20
- 类型：只读定位
- 结论：**采集门禁阻塞，禁止再次 sync**

## 根因

数据库三元组一致且账号仅关联 1 个 enabled source：

- `sourceId=5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- `accountId=70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- `platform=bigplayer_h5`

当前运行 API 的 `connectorAccountHealth` 调用仍把 `source.id` 改写为 `account.id`，导致运行包传给 4311 的 `sourceId` 等于账号 ID，而不是目标 source ID。隔离 payload 已复现该错误；正确调用应保留真实 `source.id` 并单独传入 `account`。

## 运行包证据

- API XML 当前指向 `C:\ProgramData\PublicOpinion\releases\release-31135-668-15061`。
- 工作树已包含 v027 修复，但运行包中的 `authRefreshCoordinator` 不含错误码透传修复，说明修复尚未部署到运行 API。
- API 日志仅有两次脱敏的 `UNAUTHORIZED / AUTH_REFRESH_FAILED`；4311 仅有启动日志，无凭据泄漏。

## 门禁结论

- 4311 绑定恢复、目标 bind/status、scope 错误码透传测试：PASS。
- 实际 sync：FAIL，创建阶段 `401 AUTH_REFRESH_FAILED`，无 runId。
- 禁止第三次 sync、补跑或数据修改。
- 需先构建并部署含 source/account 传参修复和 v027 的 API 候选，再进行独立 QA；API 切换不得重启 Worker/登录会话服务。
