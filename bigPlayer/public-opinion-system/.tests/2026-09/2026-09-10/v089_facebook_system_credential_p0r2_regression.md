# v089 Facebook 部署级受控凭据 P0-R2 独立盲测报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 测试范围：Facebook 管理员无凭据输入、部署级受控官方凭据、敏感 payload 拒绝、能力分项门禁及旧来源级 Token 隔离
- 测试限制：仅执行 mock、合同、静态与本地回归；未调用真实 Facebook、未读取真实凭据、未启动服务或 Worker、未写入真实业务数据。

## 结论

- **P0-R2：PASS（代码与隔离合同）**。
- **缺陷：0 个**。
- **P0-D：NOT ADMITTED**。本报告不能证明真实 Graph API、部署环境凭据、Page 管理授权、`MODERATE`、posts/comments/replies fixture、DB、AI 或 Konga 页面闭环，不得关闭 v075、提交、推送或发版。

## 实际结果

| 测试集 | 结果 |
|---|---|
| Facebook connector/security/collection/API 定向组合 | 86/86 PASS |
| Facebook 管理表单合同 | 9/9 PASS |
| Server 全量回归 | 335/335 PASS |
| Worker 全量回归 | 173/173 PASS |
| `server/src/app.js`、`facebookGraphConnector.js`、`sources.js` 语法检查 | 3/3 PASS |
| Facebook 目标文件 `git diff --check` | PASS，仅 CRLF 转换警告 |

## 盲测覆盖

| 检查项 | 结果 |
|---|---|
| Facebook create/configuration 递归拒绝 `apiToken`、Token、Cookie、账号、密码、`credential` 及嵌套敏感字段 | PASS，HTTP 400 `INVALID_INPUT`，写入前拒绝 |
| 被拒请求不进入凭据加密或来源/账号凭据落库路径 | PASS |
| Facebook 表单仅提交主页地址、名称、首次同步和调度策略 | PASS |
| Facebook UI 不渲染或发送 Token、expiry、Cookie、账号、密码或 credential 操作 | PASS |
| 部署级系统凭据为唯一 Facebook 凭据来源，账号级 `CredentialContext` 与请求 payload Token 不参与读取 | PASS |
| 缺少部署级凭据时不发起 fetch，稳定 fail-closed | PASS，`FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED` |
| 凭据无效与过期稳定区分且不泄露 provider 文本 | PASS，`FACEBOOK_SYSTEM_CREDENTIAL_INVALID` / `FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED` |
| HTTP 403 且 Meta code 4、17、32、613 优先映射 `FACEBOOK_RATE_LIMITED` | PASS |
| Page 管理授权不足、缺 `MODERATE`、posts/comments/replies 任一不足分别上报并 fail-closed | PASS |
| 仅 Page、Page 管理授权、MODERATE、posts、comments、replies 六项全部通过才允许授权、启用与同步 | PASS |
| 旧来源级 Token 不可用于 Facebook Graph 请求、分页或健康检测 | PASS |
| Token 仅允许在 mock 环境的 Authorization 合同中出现，URL、错误、响应与管理 API 不回显 | PASS |

## 通过边界与外部前置

本轮验证了 API、connector、Worker 接线和管理页面的隔离合同，未以匿名 Graph API 假设替代官方凭据要求。真实验收仍需受控部署级官方凭据、经授权测试 Page、Page 管理授权、`MODERATE`、最小 posts/comments/replies fixture、固定 Graph 版本、出网/DNS/TLS、同版 Server/Worker 候选制品、真实 DB/AI/Konga 映射及项目经理批准的验收窗口。

以上任一项缺失时，P0-D 必须保持 `NOT ADMITTED`。
