---
last_updated: 2026-09-10
status: in_progress
scope: overseas-last-night-facebook-graph-page-source
owner: 项目经理
source_prd: docs/superpowers/specs/2026-09-10-facebook-page-source-design.md
---

# v075 Facebook 主页采集源交付计划

## 三评委结论

架构、安全运维、测试评审均同意立项。Facebook 当前仅支持只读筛选，未支持来源写入、官方 Graph API 连接器或真实采集；本任务不能以表单、mock、空列表或仅创建来源关闭。

## 已拍板范围

- 仅使用 Meta 官方 Graph API，不使用网页抓取、Cookie 或模拟登录。
- 管理员不在来源表单/API 填写、传输或保存 Page Access Token、Cookie、登录账号或密码；官方请求所需凭据只能由部署环境以受控系统级方式注入，绝不回显或进入来源记录。
- 范围固定为境外 Last Night 社区的 Facebook Page；默认地址为 `https://www.facebook.com/LastLightSurvival`，可编辑。
- Facebook 官方请求仅使用部署级受控凭据；不得写入来源记录、账号级凭据、前端、日志、任务摘要、AI 输入或 API 响应。
- 新建来源默认 disabled；Page 身份、posts、comments、replies 能力均通过才允许 enabled。
- “全部”仅指当前官方授权可访问范围内，Graph 三层分页游标均耗尽；任一页失败为 `partial`，不得报 `completed_full`。
- 不修改 AI 推荐算法、既有内容历史或其他平台；媒体/互动统计、完整地址变更状态机为 P1，不阻塞本 P0 闭环。

## 唯一待办与排期

| 状态 | 阶段 | 优先级 | 交付物与门禁 | 负责人 |
|---|---|---|---|---|
| superseded | P0-A | P0 | 旧来源级 Token 合同已被产品契约替换；其 URL/SSRF、分页、断点、幂等和互斥实现可复用，但不得作为新合同关闭依据 | 开发负责人 |
| superseded | P0-B | P0 | 旧来源级 Token 采集合同已被产品契约替换；其分页、partial、入库和 AI 复用点待新合同回归确认 | 开发负责人 |
| superseded | P0-C | P0 | 旧表单/API 的 Token 与来源级凭据操作必须移除；旧换绑状态机需改为主页地址目标变更合同 | 开发负责人 |
| done | P0-R1 | P0 | 部署级受控凭据适配、来源/账号级 credential 路径移除及 fail-closed 合同；开发定向回归 `86/86 PASS`、独立盲测通过 | 开发负责人 |
| done | P0-R2 | P0 | 独立盲测通过：拒绝 Facebook `apiToken`/Cookie/account/password/credential payload；UI 无敏感凭据操作；部署级凭据、Page 管理授权、MODERATE 与 posts/comments/replies capability 分项门禁 | 测试负责人 |
| done | P0-R3 | P0 | 本机 Konga 独立真实回归通过：来源安全创建、停用落库、零凭据/零入队及分项错误展示均通过；外部凭据缺失下正确 fail-closed，不构成启用或调度通过 | 开发负责人 -> 测试负责人 |
| done | P0-D-0 | P0 | 真实 E2E 准入只读核对完成，结论 `NOT_ADMITTED` | 开发负责人 |
| blocked_external | P0-D-1a | P0 | 候选/回滚 manifest：等待 v075 紧前权威基线或明确批准的联合 release 范围 | 发布负责人 / 项目经理 |
| pending_external | P0-D-1b | P0 | 确认发布绝对目录、运行账号、日志 ACL、守护方式与 Konga 上游配置导出及当前线上制品 SHA256 | 主机 / 发布运维（待指派） |
| pending_external | P0-D-2 | P0 | 注入经授权 Meta 测试 App/Page/受控 Token，并创建最小真实 fixture | 运维 / Meta 资产管理员（待指派） |
| blocked_external | P0-D-3 | P0 | 新合同代码与独立盲测通过后，且部署级官方凭据、Page 管理授权、MODERATE、fixture、可信候选制品、运行镜像、TLS 与 Konga/主机事实均齐备，才可执行真实 Graph API -> DB -> AI -> Konga 页面闭环 | 开发负责人 + 测试负责人 |
| pending | P1 | P1 | 媒体/互动统计、完整地址变更状态机、详细进度展示 | 后续排期 |

## 强制实现约束

1. `facebook` 仅加入来源写白名单和专属 connector registry；不得借用只读外部连接器或顺带开放未接入平台。
2. 页面 URL 只用于 Page 身份解析和展示。实际请求与分页 next 均只允许固定 Graph API HTTPS 主机及经校验的固定 API 版本，禁止跟随任意重定向或管理员 URL。
3. Page ID 落 `platform_account_id`；Facebook connector 只可从服务端部署级受控配置读取官方凭据，禁止调用 `CredentialContext.load(account, 'api_token')`。新配置键和 secret-manager 形式沿用现有配置模式，禁止猜测或读取真实凭据。
4. Facebook 来源表单与来源 API 必须拒绝 `apiToken`、Cookie、账号、密码和任何 `credential` payload，且不得保留来源级凭据的新建、更新、删除或回显路径。
5. API 仅返回部署级凭据状态、Page 管理授权、`MODERATE` 与 Page/posts/comments/replies 逐项 capability；不得返回 token 值、token 状态或 expiry。
6. 部署级凭据缺失、无效、过期，以及 Page 管理授权、`MODERATE` 或任何固定 capability 缺失时，均保持 disabled、调度 fail-closed；错误码固定为 `FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED`、`FACEBOOK_SYSTEM_CREDENTIAL_INVALID`、`FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED`、`FACEBOOK_PAGE_MANAGEMENT_REQUIRED`、`FACEBOOK_MODERATE_CAPABILITY_REQUIRED`、`FACEBOOK_CAPABILITY_MISSING`。
7. 每页仅在成功入库后写入 next cursor。分页游标不前进、页失败、限流或授权失效必须产生稳定脱敏错误码；不得提前标记完整。
8. 回复断点与现有 checkpoint 模型的映射必须有明确契约和测试；若必须迁移 schema，先停单回报，不得隐式丢弃回复游标。
9. 手动与调度复用现有 source/run/lease 互斥链路，不新建旁路；运行实例加载新 connector 是真实验收前置。

## P0-R1 巡检检查点（2026-09-10）

状态：`in_progress`，不得转入测试或关闭。

- 已完成前端第一段替换：`../admin/PublicOpinion/assets/sources.js`、`../admin/PublicOpinion/sources.html` 与 `.tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js` 已移除 Facebook Token 输入和敏感 payload，改为部署级凭据状态及 Page / Page 管理授权 / MODERATE / posts / comments / replies 六项 fail-closed 展示。
- 开发自检：`node --check ../admin/PublicOpinion/assets/sources.js` 通过；`node --test .tests/2026-09/2026-09-10/facebook-p0c-admin-form.test.js` 为 `9/9 PASS`。
- 未完成：`server/src/connectors/facebookGraphConnector.js`、`server/src/app.js` 及定向合同测试仍在实现和审查中；尚未转交 P0-R2 独立盲测，未执行真实 Facebook 或 E2E。
- 开发返件记录：`.Codex/docs/2026-09/2026-09-10/v088_facebook_system_credential_p0r1.md`。

### P0-R1 未通过项（开发返工，2026-09-10）

定向命令 `node --test server/test/facebookGraphConnector.test.js server/test/facebookSecurity.contract.test.js server/test/facebookCollection.contract.test.js server/test/app.routes.test.js` 当前为 `82/85 PASS`，P0-R1 仍为 `in_progress`，禁止转入 P0-R2。

| 状态 | 阻塞码 | 最小修复 | 责任人 |
|---|---|---|---|
| resolved_pending_test | `P0R1_COLLECTION_FIXTURE_SYSTEM_CREDENTIAL_MISSING` | collection contract fixture 已显式注入 mock `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN`，待独立盲测 | 开发负责人 |
| resolved_pending_test | `P0R1_API_SENSITIVE_PAYLOAD_ACCEPTED` | Facebook create/edit API 已拒绝 `credential` payload 并返回 400，待独立盲测 | 开发负责人 |
| resolved_pending_test | `P0R1_RATE_LIMIT_CODE_PRECEDENCE` | HTTP 403 + Meta code `4`/`17`/`32`/`613` 已优先映射 `FACEBOOK_RATE_LIMITED`，待独立盲测 | 开发负责人 |

### P0-R1 开发返件（2026-09-10）

三项返工均已修复，状态转为 `ready_for_test`：collection fixture 显式注入 mock `FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN`；Facebook create/configuration 对敏感 payload 返回 `400 INVALID_INPUT`；HTTP `403` 且 Meta code `4`/`17`/`32`/`613` 优先返回 `FACEBOOK_RATE_LIMITED`。开发自检命令 `node --test server/test/facebookGraphConnector.test.js server/test/facebookSecurity.contract.test.js server/test/facebookCollection.contract.test.js server/test/app.routes.test.js` 为 `86/86 PASS`，`node --check` 与目标文件 `git diff --check` 均通过。现已转交 P0-R2 独立盲测；上述结果不构成真实 Facebook 或 E2E 验收。

### P0-R2 独立盲测（2026-09-10）

结论：`PASS`（代码与隔离合同），缺陷 `0`。测试负责人独立确认 create/edit 在写入前拒绝 `apiToken`、Cookie、account、password、credential 及嵌套敏感字段，并返回 `400 INVALID_INPUT`；前端无 Token/expiry/凭据操作；缺部署级凭据时零 fetch 且 fail-closed；HTTP `403` + Meta code `4`/`17`/`32`/`613` 返回 `FACEBOOK_RATE_LIMITED`；仅六项能力全通过才启用或同步，旧来源级 Token 不可用于 Facebook。

验证结果：Facebook 定向 `86/86 PASS`，前端表单 `9/9 PASS`，Server 全量 `335/335 PASS`，Worker 全量 `173/173 PASS`，语法 `3/3 PASS`。报告：`.tests/2026-09/2026-09-10/v089_facebook_system_credential_p0r2_regression.md`。该结果不解除 P0-D `NOT_ADMITTED`，不得关闭 v075、发版或声称真实 Facebook E2E 已通过。

### P0-R3 真实后台保存阻断（2026-09-10）

来源：产品经理交接与用户截图 `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-7bfa23a8-34fa-4175-9da2-694c4c13c6f3.png`。本机 Konga 映射页面点击“保存并检测授权”后显示“操作未完成，请检查服务状态后重试；采集源保持停用时不会进入调度”，来源未创建。页面将 `MODERATE`、帖子、评论、回复等统一显示为“未配置”，违背分项可定位失败原因的已拍板合同。

本单先要求开发负责人只读取并记录保存请求 HTTP 状态、后端稳定错误码、服务健康与 Facebook connector 准入；随后仅针对已复现根因修复。验收不得仅靠 mock 或隔离测试：需在 `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=discord` 的本机 Konga 映射下真实创建来源成功，DB 有来源记录、检测结果分项可读；仅在检测满足门禁后才可启用、生成下次采集时间并进入统一调度。若缺失部署级凭据或 Page 管理授权等外部资产，必须显示对应稳定错误和操作建议，不得泛化为“未配置”或伪报启用成功。

#### P0-R3 真实复现与分流

已复现：`POST https://lfy3001.dev.q1op.com/api/public-opinion/sources` 在旧运行态为 `400 INVALID_PLATFORM`（`platform is not supported`）；重载当前 Server 后为 `400 INVALID_CREDENTIALS`（`Facebook Page Access Token is required`）。这证明 runtime 已从旧平台白名单推进到仍强制来源级 Token 的错误合同；保存前后 Facebook sources/accounts 均为空，DB 未创建记录。

运行态：Server `/health` 为 `200`、DB `configured=true,status=ok`，当前 Server 已加载 Facebook connector；但 connector `installed=false`、`configured=false`、`reason=disabled by configuration`、`systemCredentialStatus=not_configured`。Worker 仍是陈旧镜像、无活动同步任务。上述部署级凭据缺失与陈旧 Worker 均为真实 E2E 外部阻塞，但**不得**阻止来源先以 disabled 状态落库，也不得改为要求管理员提供 Page Token。

| 状态 | 阻塞码 | 最小修复 / 流转 | 责任人 |
|---|---|---|---|
| resolved | `P0R3_SOURCE_TOKEN_GATE_STILL_ACTIVE` | 来源级 Token 必填门禁已移除；有效主页地址可创建 disabled 来源和账号，能力检测返回部署级凭据稳定错误 | 开发负责人 |
| resolved | `P0R3_GENERIC_CAPABILITY_ERROR` | 前端已按 `FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED` 等稳定码分项展示原因与建议，不再统一“未配置” | 开发负责人 |
| blocked_external | `P0R3_SYSTEM_CREDENTIAL_NOT_CONFIGURED` | 受控部署级凭据尚未注入，connector disabled；仅在来源保存合同修复后，由外部运维注入并重载受控运行实例 | 运维 / Meta 资产管理员 |
| blocked_external | `P0R3_WORKER_RUNTIME_STALE` | Worker 仍为陈旧镜像；在可信候选制品与外部环境齐备后才允许重载，不得当前直接操作 | 发布运维 |

#### P0-R3 开发返件

开发验证：Facebook 定向 `87/87 PASS`、管理页定向 `9/9 PASS`、Server 全量 `336/336 PASS`、`node --check` 与 `git diff --check` 通过。运行态证据最终提交 `39cb166`，Server 最终 PID `23148`。真实 Konga 页面已创建 source `45214733-4f70-4780-b5eb-166e4fdd16ec`：source/account 均为 `enabled=0, auth_status=unauthorized`，credential `0` 条、sync run `0` 条、`collect_requested_at` 和 `next_scheduled_at` 均为 `null`；同步与启用控件禁用。六项均显示 `FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED` 及“联系运维在服务端配置 Facebook 官方采集凭据后重新检测”。

此返件只证明“来源可安全保存且外部资产缺失可定位”，不证明启用、下次采集时间、统一调度或 Graph -> DB -> AI -> Konga 闭环。开发记录：`.Codex/docs/2026-09/2026-09-10/v090_facebook_p0r3_source_token_gate_fix.md`；现转交 P0-R3 独立真实回归。

#### P0-R3 独立真实回归

结论：`PASS`，缺陷 `0`。测试负责人在 Konga 映射页面实际执行检测，确认 source `45214733-4f70-4780-b5eb-166e4fdd16ec` 的 source/account 均为 `enabled=0, auth_status=unauthorized`，`collect_requested_at=null`、checkpoint `0`、sync run `0`；六项均逐项显示 `FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED` 与可执行建议，启用和同步均禁用，未进入调度。回归：Facebook `87/87 PASS`、前端 `9/9 PASS`、Server `336/336 PASS`、Worker `173/173 PASS`。报告：`.tests/2026-09/2026-09-10/v091_facebook_p0r3_konga_fail_closed_acceptance.md`。

P0-R3 的通过只覆盖“无部署级凭据下可安全保存和 fail-closed”；P0-D 仍为 `NOT_ADMITTED`，真实 Graph、启用、下次采集时间与闭环验收仅在部署级凭据、Page 管理授权、MODERATE、受权 fixture、Worker 候选镜像、TLS/DB/AI/Konga 链路齐备后另立任务。

## P0-D 外部验收前置

以下任一项缺失时，P0-D 状态为 `not_admitted`，只能完成代码和隔离测试，不能关闭本任务：

- Konga HTTPS 页面到本机 API 的映射、CORS 与真实 DB 连通；Server/Worker 使用同一 `.env` 且 `CREDENTIAL_ENC_KEY` 一致。
- 经授权的 Meta 测试 App、测试 Page、最小权限 Page Access Token、确定的 Graph API 版本；开发过程不读取或输出 Token 明文。
- 测试 Page 在验收窗口至少包含 2 个帖子、每帖至少 1 条顶层评论和 1 条回复。
- Graph API 出网、DNS、TLS 正常，且 `NODE_TLS_REJECT_UNAUTHORIZED` 未设置为 `0`。
- 无该 source 的 active run/checkpoint/analysis lease；AI 可真实运行。

## P0-D-0 准入核对（2026-09-10）

结论：`NOT_ADMITTED`。本轮为零写入、零真实 Facebook 外呼、零秘密读取。

| 前置 | 状态 | 脱敏结论 |
|---|---|---|
| Server / DB 存活 | PASS | 本机服务与数据库可访问 |
| Konga HTTPS 页面与 `/api/public-opinion` | PASS | 页面和同源 API 路径可访问 |
| Facebook 代码运行态 | MISSING | 在线 `/health` 无 Facebook，Server 与 Worker 均为本轮代码前的陈旧镜像 |
| 凭据密钥配置键 | PARTIAL | 根 `.env` 存在非空 `CREDENTIAL_ENC_KEY` 键；运行态有效性及跨进程一致性未核验 |
| Graph 配置 | MISSING | `.env` / `.env.example` 未声明 `FACEBOOK_*` 或 `META_*` 启用配置 |
| Meta 测试资产 | MISSING | DB 无 Facebook source/account/credential/capability，未 provision 授权 Page、帖子、顶评和回复 fixture |
| AI 运行态 | UNKNOWN | 本地接线存在；上游实时可用性按本轮禁令未外呼探测 |
| Konga 终端归属 | UNKNOWN | HTTPS 由 `172.16.0.192` 上游承接，本机 Apache 仅见 80 配置；需运维确认真实映射归属 |

稳定阻塞码：`P0D_RUNTIME_STALE_SERVER`、`P0D_RUNTIME_STALE_WORKER`、`P0D_CREDENTIAL_RUNTIME_UNVERIFIED`、`FACEBOOK_GRAPH_ENV_NOT_CONFIGURED`、`FACEBOOK_RUNTIME_NOT_LOADED`、`META_TEST_ASSETS_NOT_PROVISIONED`、`FACEBOOK_AUTHORIZED_FIXTURE_MISSING`、`AI_UPSTREAM_LIVE_UNPROBED`。

下一阶段仅在运维安全注入经授权 Meta 测试 App/Page/受控 Token、补齐 Facebook 固定版本与启用配置、确认 Konga 映射，并在获准后有序重载 Server/Worker 使本轮代码生效后，才可派发脱敏只读复核。P0-D 前不得关闭 v075 或发版。

## P0-D 流转（2026-09-10）

P0-D 不再以“冻结”作为终态，拆为以下连续责任链：

1. 开发负责人执行 P0-D-1：只读确认运行实例的部署入口、Konga 上游归属、配置加载路径和 Server/Worker 停启影响；在不读取秘密的前提下完成可自动完成的镜像/配置合同准备，并将任何高影响操作收敛到精确命令与目标。
2. 运维 / Meta 资产管理员执行 P0-D-2：通过安全渠道注入经授权测试 App/Page/Token 与固定 Graph API 版本，提供最小 posts/comments/replies fixture；此项不允许以测试负责人或开发负责人伪造。
3. P0-D-1、P0-D-2 均完成后，开发负责人执行 P0-D-3 脱敏只读复核；通过才由测试负责人接手一次真实闭环验收。

### 当前责任归属

- `P0-D-1a` 已直接派开发负责人执行，可在不部署、不读取秘密、不改运行环境的边界内完成。
- `P0-D-1b` 与 `P0-D-2` 需要主机/发布运维及 Meta 资产管理员提供当前会话外的受控资产和主机事实。项目现有会话编制未设发布运维岗位，当前标为 `pending_external`，不得伪报已派发或完成。

## 无来源 Token 官方契约核对（2026-09-10）

开发负责人只读核对结论：管理员可不手工提供 Token，但服务端不能以无凭据方式调用 Meta Graph API。应改为部署级受控官方凭据，不得继续使用来源/账号级 `api_token`。

- Page 元数据和部分公开帖子是否可读，取决于部署级凭据、App Review/PPCA 与当前官方权限。
- 非我方管理 Page 的完整评论 ID 与回复链路受 Page `MODERATE` 等任务权限限制；仅凭主页地址不能承诺“全部评论和回复”。
- 现有实现仍强制账号级 `api_token`，无 Token 会返回 `FACEBOOK_TOKEN_INVALID`，与新口径不一致，必须在 PRD 契约修订后整体替换。

待产品经理修订并交接：

1. “官方公开采集，无需 Token”改为“管理员无需填写凭据；系统使用受控部署级官方凭据”。
2. “全部评论和回复”改为“以官方凭据和目标 Page 实际授权能力可返回的范围为准”。
3. 若业务坚持完整评论/回复，则须提供目标 Page 管理授权及 `MODERATE` 能力的外部准入证据。

在此契约完成前，冻结 Facebook 实现、测试和 P0-D，不得删除来源 Token 合同后伪造匿名采集能力。

## P0-D-1a 候选制品门禁（2026-09-10）

结论：`BLOCKED_EXTERNAL`。开发负责人按门禁停止，未生成候选目录、假 manifest 或候选测试结果。

以下关键运行文件的 v075 变更与既有未提交任务混杂，且不存在紧前完整基线：

| 文件 | 混杂范围 |
|---|---|
| `server/src/app.js` | Facebook 前置只读接线、v071 独立审核等 |
| `server/src/db/repository.js` | v056 分析 claim、v071 独立审核、v079 Facebook 换绑等 |
| `worker/src/worker.js` | v031 统一调度 seam、v077 Facebook 采集等 |
| P0-C 三个前端文件 | 仅有 9 月 9 日旧快照，缺少 P0-C 紧前权威基线 |

仅 `facebookGraphConnector.js` 可独立恢复；其余运行链无法保证无夹带。阻塞码：`P0D_CANDIDATE_BASELINE_UNAVAILABLE`、`P0D_CANDIDATE_HUNK_MIXED`、`P0D_FRONTEND_IMMEDIATE_BASELINE_UNAVAILABLE`、`P0D_ROLLBACK_BASELINE_INCOMPLETE`。

重新流转条件二选一：

1. 发布负责人提供 v075 紧前的完整 release/权威父 blob/精确补丁，以及线上 Server/Worker 当前制品 SHA256，开发负责人重新构造窄候选和回滚 manifest。
2. 明确批准“当前联合 release”并提供其全部变更归属，开发负责人先构造完整联合候选、执行覆盖所有混杂模块的完整回归，再进入发布审批；不得将其称为 Facebook 窄发布。

阻塞记录：`.Codex/docs/2026-09/2026-09-10/v082_facebook_p0d1a_artifact_blocked.md`。

## 验收关闭条件

1. 创建后来源保持 disabled，检测准确识别 Page 且 posts/comments/replies 均通过后才可启用。
2. 一次真实全量任务达到 `completed_full`，三层官方分页游标耗尽；DB 帖子、评论、回复的 ID、父子关系与官方计数一致。
3. 同范围第二次同步不重复入库；至少一条新增或正文变化内容进入轻量 AI。
4. API 与 Konga 页面可见内容，并能证明进入现有告警、优质内容或概览链路。
5. 失效 Token 或缺权限时来源 fail-closed、输出稳定脱敏码，且不影响其他来源。

未授权提交、push、合并或发版。

## P0-C 范围冲突（2026-09-10）

开发负责人只读复现确认：现有 configuration PATCH 可更新 Facebook `baseUrl` 并暂停来源，但不会失效旧 `platform_account_id`、Page/posts/comments/replies 能力或 checkpoint。页面刷新后会重新读取旧能力，导致新主页可能错误复用旧主页的授权能力后被重新启用或同步。

前端内存标记无法跨刷新保证门禁，因此不能直接实现“地址可编辑”。项目经理按用户已确认的原 PRD（地址可修改）收口：实施最小地址变更状态机，不将需求缩减为只读。

- 地址规范化值改变时，在同一事务内暂停 source，清除 Page ID、所有 Facebook 授权/能力结果与下次采集状态，并使旧 checkpoint 不可用于新目标。
- 不删除历史内容或历史审核数据；新地址只有重新检测 Page/posts/comments/replies 全部通过后才能重新启用。
- 若旧/新地址解析为同 Page ID，是否保留 checkpoint 必须以真实探测结果与显式安全合同判定；不能仅按 URL 字符串推测。

开发不得通过前端标记或复用旧能力绕过该门禁。

## P0-A 开发返件（2026-09-10）

开发负责人已完成 P0-A，自检结果：定向与路由回归 `75/75 PASS`，安全合同 `11/11 PASS`，语法与 diff 检查通过，无 schema 迁移。

- 专属实现：`server/src/connectors/facebookGraphConnector.js`。
- Token 仅用于 Authorization，账号级 AAD 加密且 API 不回显。
- Page、posts、comments、replies 四项能力均为 `authorized_scope` 才允许 enabled/collect/sync。
- 回复断点合同：复用 comments checkpoint，`task_kind=facebook_reply`、`task_key=reply:<commentId>`、root 为 post ID；分页 next 仅提取 cursor 后重建固定 Graph URL。

开发记录：`.Codex/docs/2026-09/2026-09-10/v076_facebook_graph_p0a_security_contract.md`。当前等待测试负责人独立复验；P0-D 未启动。

## P0-B 开发返件（2026-09-10）

开发负责人已完成 P0-B，当前等待测试负责人独立复验：

- 回复 checkpoint 合同固定为 `sync_scope=comments`、`task_kind=facebook_reply`、`task_key=reply:<commentId>`、root 为 post ID；无需 schema 迁移。
- 首页失败为 `failed`；已有成功提交页后的失败为 `partial`，只保留最后安全 cursor。
- Token 失效、Page mismatch、权限撤销保持 fail-closed。
- 开发验证：主验收 `125/125 PASS`、P0-B 合同 `9/9 PASS`、Worker+Facebook 联合 `105/105 PASS`。

开发记录：`.Codex/docs/2026-09/2026-09-10/v077_facebook_graph_p0b_collection_pipeline.md`。上述仅为开发验证，P0-A/P0-B 均须测试负责人独立验收；P0-D 仍为 `not_admitted`。

## P0-A/P0-B 独立验收（2026-09-10）

测试负责人结论：P0-A PASS、P0-B PASS，仅限代码与隔离合同，不构成真实 Graph API 或 Konga 闭环验收。

- P0-A 组合回归：`79/79 PASS`。
- P0-B 组合回归：`125/125 PASS`。
- P0-D 仍为 `NOT ADMITTED`；禁止调用真实 Facebook/Konga，v075 不得关闭。

测试报告：`.tests/2026-09/2026-09-10/v078_facebook_graph_p0ab_regression.md`。

## P0-C 开发返件（2026-09-10）

开发负责人完成 Facebook 管理表单与安全换绑门禁，等待测试负责人独立验收：

- 地址规范化值变化或同址显式换 Token 均 fail-closed，暂停来源且不复用 checkpoint。
- 不删除历史内容、审核数据或既有 Token；重新检测 Page/posts/comments/replies 全部为 `authorized_scope` 后才允许启用/同步。
- 开发验证：server 全量 `320/320 PASS`、P0-C 定向 `164/164 PASS`、既有前端 `12/12 PASS`、P0-C 前端 `8/8 PASS`。
- 本轮还修复公共 source/account PUT 的 credential fail-closed 绕过及 Discord 摘要函数覆盖回归。

开发记录：`.Codex/docs/2026-09/2026-09-10/v079_facebook_graph_p0c_admin_form.md`。未真实外呼；P0-D 仍为 `not_admitted`。

## P0-C 独立验收（2026-09-10）

测试负责人结论：P0-C PASS，仅限代码与隔离测试；未调用真实 Facebook/Konga，不能作为 P0-D 或发版结论。

- P0-C 前端合同：`8/8 PASS`。
- 既有来源页：`12/12 PASS`。
- P0-C 定向服务端：`164/164 PASS`。
- Server 全量：`320/320 PASS`。

测试报告：`.tests/2026-09/2026-09-10/v080_facebook_graph_p0c_regression.md`。P0-D 保持 `NOT ADMITTED`，v075 不得关闭。
