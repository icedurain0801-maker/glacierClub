# V019 配置兼容小修独立 QA 报告

- 日期：2026-10-10
- 角色：测试负责人
- 范围：仅离线 fixture 聚焦验收；不读取真实 `.env`，不连接数据库，不发 HTTP/token/AI，不修改业务代码或国内 Worker。
- 结论：`PASS（限定兼容范围）`；允许项目经理签发新的单次真实七读 nonce。**不代表真实账号认证、mysql2 加载或 SELECT 已通过。**

## 冻结原件

| 原件 | 路径 | SHA256 |
|---|---|---|
| 开发 manifest | `.temp/v019-seven-read-executor-DkvtZb/manifest.json` | `e7236cd55bd91d0fba1082e7e58ee9bb8d69892739f28b20bed5b8c6b8163f86` |
| 开发原始测试结果 | `.temp/v019-seven-read-dev-2GE5k7/result.json` | `81fe39e4b5f17489db7f425889978ad765194a55e74b4e3d590d65aeff918c75` |
| QA 独立复跑结果 | `.temp/v019-seven-read-dev-a8ruds/result.json` | `09ec0172680199ce2552396ee4c8b1d827ece083a308644d05c44beea3e1d349` |

## 验证记录

1. 冻结包按专属 runner 执行前置 `--verify <manifest SHA>`，结果 `VERIFIED`。
2. 使用离线网络/DNS/mysql2 guard 执行 `--test <manifest SHA>`，23/23 通过，0 fail；测试后再次 `--verify`，结果 `VERIFIED`。
3. `result.json` 明确记录 `realConfigurationRead=false`、`realConnectionOpened=false`、`productionPermitIssued=false`。
4. 覆盖显式 `DB_PASSWORD=` 与 `DB_HOST=localhost` 兼容路径；内存协议握手保留空字符串（使用显式 nullish fallback，不把空值替换为默认密码）。
5. 覆盖缺键、重复键、远端 host/错误目标、URI/生产入口伪造、签名/期限/claim 重放等拒绝路径；配置读取计数和敏感值不输出断言通过。

## 边界与后续

- 本报告不能证明真实 MySQL 账号密码正确，也不能证明真实环境 mysql2 已加载；这些只能由项目经理新签 nonce 后的真实 CLI 原件证明。
- 旧失败 nonce `f47c8c5baf868668700b09d65aa41753` 及其 `MYSQL2_CONFIG_REJECTED` 结果永久保留，不重放、不改写。
- 新真实执行必须回传单次 claim、连接/SELECT 七读、关闭和输出 hash 的完整证据链；任一缺失即 `NO_GO`。

## 新 nonce 真实执行结果（后置更新）

项目经理按限定结论签发的新 nonce 已完成一次真实 CLI，但结果为 `NO_GO`，不是配置兼容失败：

- 原件：`.temp/v019-seven-read-output-1530fbfc63ab57687d77e16a1ecd5f53/result.json`
- SHA256：`4a681f36928b24312e0ddb210d59e55ef1287dbc5ea4e126d8175d149205f9d1`
- 证据：`actualMysql2Loaded=true`、`realConnectionOpened=true`、`realConfigurationRead=true`、`configurationReads=1`。
- 阶段：完成真实连接、R1、事务隔离和只读事务后，在 R1 字段元数据校验报 `MYSQL2_FIELDS_REJECTED`；trace 为 `CREATE_CONNECTION → R1 → SET_ISOLATION → START_READ_ONLY → R2 → DESTROY`，七读未完成。
- 处置：本 nonce 不重放、不签收；缺陷已退开发负责人定位真实字段契约差异并另冻最小修复。禁止用 synthetic mainchain、`installMainchainSchema` 或模拟 transport 代替真实抓取证据。

## 最终 board_id 聚焦验收

- 最终 manifest：`.temp/v019-seven-read-executor-mAPNXI/manifest.json`，SHA256 `8dcb5c837f994e89abf0362dfe54ae8c253fc712a452759533bf1687568c66d0`；前置 verify 通过。
- 开发 raw：`.temp/v019-seven-read-dev-99A7D8/result.json`，SHA256 `94b62c864fd235f1ef9f3fd72f543ce1f030e333f5763b023ca2842ffc13f367`；`23/23`、`exitCode=0`、前后未变，且 `realConfigurationRead=false`、`realConnectionOpened=false`。
- 真实字段诊断原件：`.temp/v019-real-metadata-diagnostic-original-stdout.json`，SHA256 `95f2552463dacdb6db176e470ae8a4b819f95177b244c3adf31ebd1a442a7bf0`。R1-R7 共 7 次 `LIMIT 0`，只输出 `name/columnType/flags/characterSet`；唯一差异是 R2 `board_id` 的 `columnType=251`，无行值、凭据正文或写入记录。
- 验收结论：`PASS（限定 board_id 类型兼容）`，仅允许 `board_id` 类型 251，行值仍须受限字符串且精确为 `100017`，其他字段白名单与类型规则不放宽。允许项目经理签发新的单次真实七读 nonce；不代表真实七读已通过。

## 最终真实七读核验

- 原件：`.temp/v019-seven-read-output-dfeaf4ac57d2d5f9372c9636576eac89/result.json`
- SHA256：`61b0a88819fa6e6074bf7ed6cc3f4f07ad830a23af340eb2addda0a93f0f1a87`
- 结果：`SEVEN_READ_COMPLETED`；`actualMysql2Loaded=true`、`realConnectionOpened=true`、`realConfigurationRead=true`、`configurationReads=1`。
- 七读闭包：`R1` 至 `R7` 共 `selects=7`，trace 包含 `SET_ISOLATION`、`START_READ_ONLY`、`ROLLBACK`、`END`、`END_CALLBACK`；`closed=true`、`poisoned=false`、`destroys=0`、`reconnectCount=0`。
- 身份/范围：发现记录含 1 个 `authorized` registry、2 个 `unknown` registry；`grantStatus=unverified`，不将未验证 grant 或未知站点解释为已授权抓取范围。R4 仅为 credential 元数据字段，未输出 secret 正文。
- 结论：`PASS（仅真实七读）`。后续真实 HTTP/token/secret、三站抓取、去重幂等入库、异步 AI 与定时槽均未测，不能据此签署全链路或发版通过。

## 真实小批 HTTP 后置结果

- 原件：`.temp/overseas-real-small-batch-fetch-raw.json`
- SHA256：`befe9d301b3254f9f7901cea3cecd8b1a06d74a3d36dcb08e0f029f3df133808`
- 结果：`NO_GO/Q1_TOURIST_LOGIN`；仅 1 次 `/api/club/v1/login/token` 请求，HTTP 200，但响应被判定为游客登录，尚无内容抓取，不能视为授权成功。
- 运行风险：执行输出出现 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告；已退回开发负责人，要求在海外独立进程验证证书，不得修改共享环境或国内服务。
- 旁证：此前 `.temp/overseas-real-small-batch-raw.json` 与 `initial-failure.json` 为 `CREDENTIAL_DECRYPT_FAILED`、0 请求，均保留，不重放。

## Bearer Token 上下文纠正

- 原件：`.temp/overseas-token-context-check-bearer-tls-raw.json`
- SHA256：`59df57a3d875be914593f81596fd3956fbcaaf793bd9ce5241f57f8579c1346d`
- 结果：`TOKEN_CONTEXT_AUTHORIZED`，TLS 独立验证，HTTP 200、provider code 0、`boardAuthorized=true`、`boardCount=1`，目标 board 为 `100017`。
- 该原件只证明 Bearer token 上下文和 board 授权，不证明三站抓取、入库、AI 或调度完成；裸 header 401/游客二次 exchange 不覆盖此结论。

## 旧 24 次预算批次结果

- 原件：`.temp/overseas-real-small-batch-fetch-bearer-raw.json`
- SHA256：`4cf97eb0263dc2267c69393eb21c465980d2a6ebd197d04b5175ee474cf5cde1`
- 结果：`NO_GO/OVERSEAS_HTTP_BUDGET_EXCEEDED`；实际 `requestCount=25`。这是调整到 84 次上限**之前**的旧 24 次预算失败原件，不能据此判断新配置未生效。
- 本批 200 响应不作为抓取通过证据，原批次保留且不重放。84 次新预算、三站各一页的执行原件尚待交付，相关 sent/blocked、完整 items、cursor、入库/jobs/AI/定时链均未验收。

## 84 预算三站抓取批次

- 抓取原件：`.temp/overseas-real-small-batch-fetch-84-raw.json`，SHA256 `06b1cd4a19f180ae8b906cbb7e88467b420c63376aae128249eba7b47ebab9d4`。
- item 原件：`.temp/overseas-real-small-batch-items-1791599835385.json`，SHA256 `b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca`。
- 已核事实：`FETCH_COMPLETED`，72/84 请求，72 sent，三站各 20 条，唯一 externalId 各 20，三站均 `pagesFetched=1` 且 cursor 存在，HTTP 200 全部成功。
- 待补证：原件未给明确 blocked 统计；`providerItemCount=0` 与每站 20 条 items 的口径需解释；三站 `timeOrderVerified=false`、`timeBoundaryReached=false`。因此仅记录为批次抓取完成，暂不签入库、AI、定时槽或全链路 PASS。
