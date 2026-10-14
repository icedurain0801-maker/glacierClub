# v336 BigPlayer source-account-credential 绑定链只读核对

## 范围与安全边界

- 核对 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`（境内）、`081a16d2-5545-4afd-9c65-e04777e4540b`（境外）。
- 仅执行数据库 `SELECT`，未读取 `secret_cipher`、`secret_ref` 或任何 token 内容。
- 未执行 `check-auth`、未创建真实 Run、未修改配置或业务数据。
- 查询时间：2026-09-22；结果来自当前本机数据库连接。

## source → account → credential

| source.id | enabled | auth_status | default_account_id | account.id | account.source_id | platform | account.enabled | account.auth_status | credential.id | credential.account_id | credential_type | credential.status | expire_at |
|---|---:|---|---|---|---|---|---:|---|---|---|---|---|---|
| `5c21f78d-5f67-4467-963d-dcdeb5e26cab` | 1 | authorized | `70c393cf-9600-11f1-b3d2-d85ed3ae61b0` | `70c393cf-9600-11f1-b3d2-d85ed3ae61b0` | `5c21f78d-5f67-4467-963d-dcdeb5e26cab` | bigplayer_h5 | 1 | authorized | `931761c2-1e1d-4954-9218-287fedfb340b` | `70c393cf-9600-11f1-b3d2-d85ed3ae61b0` | api_token | active | null |
| `081a16d2-5545-4afd-9c65-e04777e4540b` | 1 | authorized | `75c8205f-37eb-4bdf-b6a4-f4f502e35658` | `75c8205f-37eb-4bdf-b6a4-f4f502e35658` | `081a16d2-5545-4afd-9c65-e04777e4540b` | bigplayer_h5 | 1 | authorized | `a8869597-0c2e-4df8-a47e-1705a5ec0892` | `75c8205f-37eb-4bdf-b6a4-f4f502e35658` | api_token | active | null |

## Worker subject 实际路径

- `worker/src/worker.js:345-346`：授权检查调用 `credentialContext.load(account, 'api_token')`。
- `worker/src/worker.js:865`：非社交平台采集阶段调用 `deps.credentialContext.load(account, 'api_token')`。
- 因此当前 Worker 的 CredentialContext subject 是 `account`，不是 `source`；平台参数为 `api_token`。
- `server/src/services/credentialContext.js` 的解析入口继续按传入 account 的 `id/source_id` 查找凭据，代码路径与数据库绑定一致。

## 与旧证据对比及根因

旧证据 `.tests/2026-09/2026-09-10/v064_last_light_bigplayer_zero_content_diagnosis.md`、`.tests/2026-09/2026-09-22/v332_bigplayer_fail_rate_root_cause_independent_qa.md` 记录过：数据库存在 active credential，但运行实例曾报 `CREDENTIAL_NOT_FOUND`。本次只读结果证明当前数据库链条没有 source/account/credential 外键错配；因此历史根因应定位为运行时实例配置/版本/连接到的数据库与当前证据不一致，或旧 Worker 使用了 source 作为解析 subject，而非当前代码的 account subject。`auth_status=authorized` 仍不能替代运行时成功加载证据。

## 最小修复范围（待开发负责人确认）

1. 不改数据库绑定，不执行授权探针；先确认实际运行 Worker 的 commit、工作目录、`DB_HOST/DB_NAME` 指向和进程路径与当前代码/数据库一致。
2. 在同一运行实例增加不泄露 secret 的 credential subject 审计字段：仅记录 `source.id`、`account.id`、`credential_type`、解析结果 code，不记录密文/token。
3. 若运行实例仍出现 `CREDENTIAL_NOT_FOUND`，只修复运行实例版本/配置或 CredentialContext subject 接线；不新增 credential、不重置授权状态。
