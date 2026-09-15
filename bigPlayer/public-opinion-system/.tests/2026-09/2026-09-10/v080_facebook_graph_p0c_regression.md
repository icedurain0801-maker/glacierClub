# v080 Facebook Graph P0-C 管理表单与安全换绑独立回归报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 测试范围：P0-C 管理表单、地址编辑状态机、安全换绑与既有来源页回归
- 测试限制：未调用真实 Facebook、未启动真实 Konga 采集、未读写真实 Token 或业务数据；未使用或占用 3001。

## 结论

- **P0-C：PASS（代码与隔离测试）**。
- **P0-D：NOT ADMITTED**。本报告不代表真实 Graph API、真实数据库、AI 与 Konga 页面闭环通过，不能据此关闭 v075。

## 执行结果

| 测试集 | 结果 |
|---|---|
| P0-C 前端合同 | 8/8 PASS |
| 既有来源页回归 | 12/12 PASS |
| P0-C 定向服务端组合 | 164/164 PASS |
| Server 全量回归 | 320/320 PASS |
| 目标 JavaScript 语法检查 | PASS |
| `git diff --check` | PASS，仅 CRLF 转换警告 |

## 验收覆盖

| 检查项 | 结果 |
|---|---|
| Facebook 仅允许境外 Last Night 社区创建，默认主页地址正确 | PASS |
| Facebook URL 规范化，并拒绝非法协议、域名及非 Page 地址 | PASS |
| 仅尾斜杠或跟踪参数差异不误触发换绑 | PASS |
| 主页地址变化后暂停来源，清 Page ID、授权、四能力、checkpoint 和计划 | PASS |
| 地址变化时终止旧 queued/running run，并通过栅栏阻止旧 Worker 写入 | PASS |
| 同址显式换 Token 时 fail-closed，保留 Page ID 与 checkpoint | PASS |
| 公共 PUT credential 路径同样执行 fail-closed 状态切换 | PASS |
| 地址变化和换 Token 均保留历史内容、分析、告警、审核与 Token | PASS |
| 创建时 Token 必填；编辑留空不发送、不回显、不清除已有凭据 | PASS |
| page/posts/comments/replies 四项能力全部通过后才允许启用或同步 | PASS |
| 首次同步三种范围及服务端下次采集时间展示 | PASS |
| 无管理权限时表单只读 | PASS |
| Discord、BigPlayer H5、TapTap 既有公共来源路径 | PASS |

## 测试资产

- `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js`
- `../admin/PublicOpinion/assets/source-status.test.js`
- `server/test/repository.test.js`
- `server/test/app.routes.test.js`
- `server/test/facebookGraphConnector.test.js`
- `server/test/facebookSecurity.contract.test.js`

## 风险与门禁

- 当前验收仅覆盖代码、隔离合同和回归测试，未验证外部 Facebook Page Access Token、真实权限、网络连通性、Graph API 返回、真实数据库落库、AI 分析和 Konga 页面展示。
- `configured_unverified` 超出现有 `auth_status VARCHAR(20)` 长度，本阶段使用等价 fail-closed 状态 `unconfigured`；该实现已纳入回归，但后续若调整 schema 需重新验证。
- 仅当项目经理确认 P0-D 外部前置齐备并另行派单后，才可执行真实 Graph API -> DB -> AI -> Konga 页面闭环。

## 放行意见

P0-C 可登记为通过；v075 整体不得关闭或发版，P0-D 继续保持 `NOT ADMITTED`。
