---
last_updated: 2026-09-10
status: implemented
scope: facebook-graph-p0-a
owner: 开发负责人
source_plan: .Codex/docs/2026-09/2026-09-10/v075_facebook_graph_page_source_delivery_plan.md
---

# v076 Facebook Graph P0-A 安全与授权合同实施记录

## 实施结果

- `facebook` 加入来源写白名单，但不作为手机号社交登录平台，也未开放其他只读平台。
- 创建范围固定为境外 Last Night；Facebook 主页地址仅接受官方 HTTPS 单主页地址，规范化跟踪参数和尾斜杠。
- 新增专属 `FacebookGraphConnector`，实际请求只允许 `https://graph.facebook.com` 和批准的显式 Graph 版本。
- 所有 Graph 请求关闭自动重定向；`paging.next` 每次重新校验协议、主机、端口、版本、路径、userinfo、fragment 和 Token query。
- Page Access Token 仅放入 Authorization header；账号级 `api_token` 复用现有 AAD 加密，响应、错误、日志和 URL 均不回显 Token、授权头或平台响应体。
- 新来源默认 disabled；创建 Token 必填，编辑空 `credential` 保留旧 Token。
- Page、posts、comments、replies 四项能力独立检测并持久化；空样本保持 `untested`，任一项未达到 `authorized_scope` 均禁止启用、同步或手动采集。
- 首次检测允许 `pending:<accountId>` 绑定真实 Page ID；已绑定不同 Page 时返回 `FACEBOOK_PAGE_MISMATCH`。

## 文件

- `server/src/connectors/facebookGraphConnector.js`
- `server/src/connectors/externalConnectors.js`
- `server/src/services/sourceValidators.js`
- `server/src/app.js`
- `server/test/facebookGraphConnector.test.js`
- `server/test/facebookSecurity.contract.test.js`
- `server/test/sourceValidators.test.js`

## 验证

```powershell
node --check server/src/connectors/facebookGraphConnector.js
node --check server/src/connectors/externalConnectors.js
node --check server/src/services/sourceValidators.js
node --check server/src/app.js
node --test --test-concurrency=1 server/test/facebookGraphConnector.test.js server/test/facebookSecurity.contract.test.js server/test/sourceValidators.test.js server/test/app.routes.test.js
```

- P0-A 定向及路由回归：75/75 PASS。
- 语法检查：PASS。
- 独立安全合同：11/11 PASS。
- 未发现数据库 schema 迁移需求。

## P0-B 前置结论

- 回复断点复用现有 `po_sync_checkpoints`：`sync_scope=comments`、`task_kind=facebook_reply`、`task_key=reply:<commentId>`、`root_platform_content_id=<postId>`。
- 不得沿用非 Facebook 的 `q1_reply` 诊断标签。
- 若 Meta `paging.next` 含 `access_token`，必须仅提取游标并重建无 Token 的固定 Graph URL，不得原样跟随。

本阶段未 commit、未 push、未合并、未发版；P0-D 未启动。
