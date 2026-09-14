---
date: 2026-09-14
status: completed
scope: bigplayer-api-token-runtime-contract
owner: 开发负责人
---

# v116 BigPlayer API Token 运行时凭据契约

## 根因

Last Light BigPlayer 的后台凭据页面和数据库已保存 active `api_token`，Worker 也通过 `CredentialContext` 读取该字段；但 Q1 返回 401/403 后，连接器无条件进入登录刷新。账号没有 `account_password` 时，运行结果被误报为 `AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED`，掩盖了实际的 Token 被远端拒绝事实。

## 最小修复

- 保持 `api_token` 与 `account_password` 的凭据类型分离，不把 Token 当作登录密码使用。
- active、未过期、可解密的 account `api_token` 继续由 `CredentialContext` 读取并发送；Token 自带 `Bearer` 时不重复添加前缀。
- Q1 401/403 触发刷新但缺少密码凭据时，连接器改为返回明确的 `UNAUTHORIZED`，消息指向重新授权，并保留 fail-closed 行为。
- 同步覆盖 BigPlayer 直接 JSON API 的相同错误映射，避免两条请求路径出现不同契约。

## 验证

- `node --test server/test/connectors.test.js server/test/connectorSlice.test.js server/test/authRefreshCoordinator.test.js`：57/57 通过。
- 新增 active account `api_token` 解密读取测试，以及无密码凭据时 Q1 401 明确未授权测试。
- 未改变调度频率、checkpoint、历史数据、Discord/Facebook 配置；未执行回补、删除、push 或发版。

## 运行边界

修复保证 Worker 不再把缺少密码凭据误报为根因，但当前数据库中的 Last Light Token 直接请求 Q1 `user/context` 仍返回 HTTP 401；因此该账号仍需重新授权，不能据此声称已恢复真实采集。
