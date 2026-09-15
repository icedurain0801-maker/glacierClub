# v088 Facebook 部署级凭据 P0-R1 返件

## 合同边界

- 管理员仅配置 Facebook 主页地址与采集策略。
- Facebook 官方请求只能使用服务端部署级受控凭据。
- 来源、账号、表单和 API 不接收 Token、Cookie、登录账号、密码或 credential payload。
- 部署级凭据、Page 管理授权、`MODERATE`、Page/posts/comments/replies 任一不足时 fail-closed。
- 本轮不读取真实凭据、不真实外呼 Facebook、不启动服务。

## 前端管理表单（已完成）

修改文件：

- `../admin/PublicOpinion/assets/sources.js`
- `../admin/PublicOpinion/sources.html`
- `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js`

改动：

- 删除 Facebook Page Access Token 输入、换绑提示与 payload 构造。
- 表单仅提交主页地址、名称、首次同步和调度策略。
- 新增部署级官方凭据脱敏状态，并分项展示 `page`、`pageManagement`、`moderate`、`posts`、`comments`、`replies`。
- 部署级凭据或六项能力任一未通过时，禁用启用与同步。

验证：

- `node --check "..\\admin\\PublicOpinion\\assets\\sources.js"`：PASS。
- `node --test ".tests\\2026-09\\2026-09-10\\facebook-p0c-admin-form.test.js"`：9/9 PASS。
- 上述文件 `git diff --check`：PASS。

## Connector 与 API

状态：`READY_FOR_P0_R2`。

已修改文件：

- `.env.example`
- `server/src/connectors/facebookGraphConnector.js`
- `server/test/facebookGraphConnector.test.js`
- `server/test/facebookSecurity.contract.test.js`

已完成：

- connector 改为仅从 `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN` 读取部署级凭据，不再调用 `CredentialContext.load(account, 'api_token')`。
- 凭据仅放在 `Authorization` header，不放入 URL、错误或响应。
- connector 返回 `page`、`pageManagement`、`moderate`、`posts`、`comments`、`replies` 六项能力，任一不足时 fail-closed。
- connector 定向测试 14/14 PASS。

已解决缺口：

| 原阻塞码 | 修复 | 验证 |
|---|---|---|
| `P0R1_COLLECTION_FIXTURE_SYSTEM_CREDENTIAL_MISSING` | `server/test/facebookCollection.contract.test.js` 显式注入 mock `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN`，删除旧 `credentialContext` token fixture | collection + connector 24/24 PASS |
| `P0R1_API_SENSITIVE_PAYLOAD_ACCEPTED` | `server/src/app.js` 在 Facebook create/configuration 进入加密与落库前递归拒绝 `credential`/token/cookie/account/password 等敏感键 | Facebook security contract 14/14 PASS；拒绝响应为 HTTP 400 `INVALID_INPUT` |
| `P0R1_RATE_LIMIT_CODE_PRECEDENCE` | `server/src/connectors/facebookGraphConnector.js` 将 Meta provider code 4/17/32/613 的限流判定提前到 HTTP 403 权限判定之前，并新增 mock 回归 | connector 15/15 PASS |

定向收口命令：

```powershell
node --test server/test/facebookGraphConnector.test.js server/test/facebookSecurity.contract.test.js server/test/facebookCollection.contract.test.js server/test/app.routes.test.js
```

结果：原 85 项全部 PASS；本轮新增 1 条限流优先级回归后，当前精确结果为 86/86 PASS、0 FAIL。未读取真实凭据、未真实外呼、未启动服务。

## 测试交接点

- Facebook source create/configuration 对任意层级敏感凭据键返回 HTTP 400 `INVALID_INPUT`，且不写入 source/account credential。
- connector 不调用账号级 `CredentialContext`；缺失部署级凭据时不发起 fetch。
- HTTP 403 + Meta code 4/17/32/613 稳定返回 `FACEBOOK_RATE_LIMITED`。
- 部署级凭据、Page 管理授权、`MODERATE`、Page/posts/comments/replies 任一不足时不得启用或同步。

## 真实 E2E 外部前置

本轮不执行真实 E2E。后续仍需由运维 / Meta 资产管理员安全注入受权部署级凭据，并准备已完成 Page 管理授权与 `MODERATE` 能力的测试 Page、posts/comments/replies fixture、固定 Graph API 版本、出网/DNS/TLS、同版 Server/Worker 运行镜像与已批准的验收时窗。
