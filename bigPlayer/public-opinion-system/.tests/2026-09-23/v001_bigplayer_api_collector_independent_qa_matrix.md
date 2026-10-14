# BigPlayer C 端 API 新采集器独立 QA 矩阵

- 日期：2026-09-23
- 角色：测试负责人
- 范围：新 BigPlayer C 端 API 采集器；旧采集器不恢复
- 当前状态：`NOT_RUN_WAITING_FOR_CANDIDATE`
- 安全边界：只读建立矩阵；未启动服务、未访问 3001、未连接生产 DB、未创建真实 Run、未写入生产

## 交测门禁

以下材料齐全前，不判任何端到端用例 PASS：

1. 候选目录、候选 hash/manifest，以及可复现的最小测试命令。
2. 新采集器入口和依赖闭合证明，明确旧 BigPlayer 采集器未恢复或接线。
3. 纯内存/fixture 原始结果，或明确隔离的测试数据库结果；不得用生产 DB 代替。
4. 运行日志、任务统计和错误码原始输出，凭据字段必须脱敏。

## 矩阵

| ID | 验收项 | 关键断言 | 当前状态 | 证据要求 |
|---|---|---|---|---|
| AUTH-01 | 账密优先 | 账密与旧 Token 同时存在时先登录；请求使用新临时 Token | NOT RUN | 登录调用序列、请求授权摘要 |
| AUTH-02 | 登录失败硬失败 | 账密配置但登录失败时任务明确授权失败，不回退旧 Token、不请求 API | NOT RUN | 登录错误码、API 请求计数为 0 |
| AUTH-03 | Token 兜底 | 无账密且有有效 Token 时直接请求 API，不触发登录 | NOT RUN | 登录调用为 0、请求授权摘要 |
| AUTH-04 | 无授权 | 账密和 Token 均无时进入 `authorization_missing`，不请求站点 | NOT RUN | 终态、请求计数为 0 |
| HOST-01 | 运行基地址 | 所有运行请求为配置化 `https://club.q1.com`；不请求 dev Swagger 域名 | NOT RUN | 完整请求 URL 清单 |
| HOST-02 | 白名单 fail-closed | 非 `club.q1.com`、危险协议、凭据嵌 URL 被拒绝 | NOT RUN | 错误码与无网络调用证据 |
| WIN-01 | 昨日到当前时刻 | Asia/Shanghai 昨日 00:00 至执行时刻，采用 `[from,to)` | PASS | 候选 fixture 半开窗口断言 |
| WIN-02 | 内容时间过滤 | post/activity/comment/reply 均按自身发布时间过滤，不按抓取时间 | NOT RUN | 评论/回复尚未交测 |
| BOARD-01 | 版块发现 | V2 优先，必要时 V1；保存 ID、名称、父子层级、可采集状态 | PASS | 候选 fixture 定向断言 |
| BOARD-02 | 23 feed 完整性 | 23 个 feed/版块均生成独立 post/activity scope；不可只抓默认版块 | PASS | 23 个唯一 feedKey fixture |
| BOARD-03 | 局部失败隔离 | 单版块失败不阻塞其他版块，父任务为 partial，可按版块重试 | NOT RUN | 多版块故障注入结果 |
| TYPE-01 | post/activity 分型 | post/list 为 `post`，activity/list 为 `activity`；不得按标题是否为空猜类型 | PASS | 独立 activity endpoint 与 contentType 断言 |
| TYPE-02 | 字段完整性 | board、externalId、标题/正文、作者、发布时间、来源 URL、raw payload 均保留 | NOT RUN | 单条落库 payload 脱敏快照 |
| PAGE-01 | 分页停止 | 早于窗口下界、末页标识或安全上限分别正确收敛；不完整必须标记 | PASS | 候选 fixture 分页与边界断言 |
| DEDUP-01 | 重叠去重 | 全部 feed 与分类 feed 重叠时只保留一条，不重复计数 | PASS | `inserted=1/change=0/duplicate=1`，AI job=1 |
| DEDUP-02 | 幂等分析 | 重复抓取不重复创建 AI job；唯一键包含 source/external/type，必要时 board | PASS | changed/unchanged AI job 去重 fixture |
| COMMENT-01 | 评论纳入 | post 与 activity 均创建 comment scope 并抓取到末页 | PASS | 候选 comment API fixture |
| COMMENT-02 | 父子层级 | 一级评论 depth=1；回复保留 parentPlatformId、rootPlatformContentId、contentDepth | PASS | root/parent/depth 逐条断言 |
| COMMENT-03 | 评论窗口 | 评论/回复按自身发布时间和同一窗口过滤，保留根内容关系 | PASS | 回复自身时间半开窗口断言 |
| COMMENT-04 | 声明/实际分离 | 声明 100、实际正文 80 显示 100/80，不伪装已抓取 100 | PASS | raw total 与实际正文数分离断言 |
| CKPT-01 | 重启恢复 | post、activity、每个根内容评论分别从 checkpoint 继续，不从头重抓 | PASS | completed scope 不重复 claim/fetch fixture |
| CKPT-02 | 精确窗口幂等 | 已完成的相同 source/board/scope/window 不重复 claim 或 fetch | BASELINE PASS | v354 + bigplayerTypeFlow 定向证据 |
| STORE-01 | 入库顺序 | 先校验/幂等入库 raw+normalized，再创建/唤醒 AI job | PASS | upsert raw/normalized 与下游调用顺序 fixture |
| STORE-02 | AI 异步失败 | AI 不可用时内容保留，状态为待分析/失败且可重试，不回滚内容 | PASS | AI failure 保留内容并标记 retryable fixture |
| SAFE-01 | 敏感信息 | raw payload、日志、URL 不含 token/cookie/password | NOT RUN | 脱敏前后字段扫描 |
| REG-01 | Discord 回归 | 新 BigPlayer 改动不改变 Discord 授权、调度、内容查询合同 | PASS | 候选根回归套件 |
| REG-02 | TapTap 回归 | 新 BigPlayer 改动不改变 TapTap 授权、调度、内容查询合同 | PASS | 候选根回归套件 |
| REG-03 | Facebook 回归 | 新 BigPlayer 改动不改变 Facebook 授权、调度、内容查询合同 | PASS | 候选根回归套件 |
| REG-04 | 国内/境外隔离 | 国内、境外 BigPlayer 配置各可独立执行；社区/来源边界不串 | PASS | gameId/baseUrl 隔离 fixture |

## 已有基线映射

- `worker/test/bigplayerTypeFlow.test.js`：类型保留、raw payload 脱敏边界、精确窗口 checkpoint。
- `worker/test/bigplayerTokenWorkerContract.test.js`：缺少刷新密码时的明确 unauthorized token failure；不等价于本次账密优先/不回退完整验收。
- `server/test/bigplayerSiteConfig.test.js`：多站点规范化、重复 URL/ID、协议和 host 白名单。
- `.tests/2026-09-22/v354_bigplayer_credential_window_independent_qa.md`：21/21 既有凭据绑定与 scheduled_catchup 窗口回归；不覆盖新采集器端到端链路。

## 当前结论

矩阵已建立。v001 授权/host 与 board/feed 复测结果为 `PASS_AUTH_HOST_BOARD_FEED_ONLY`；评论、入库、AI 和生产链路仍未交测。

### v001 board/feed 复测（2026-09-23）

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `670/670`，`BAD=0` |
| checksums | PASS | `670/670`，`BAD=0` |
| manifest hash | PASS | `0FF0A1E41FB8F5ADE3F5C8DF1EE99704BBC1CDBFAE87ADBFA0573055298201D5` |
| checksums hash | PASS | `0BEC7DD7DAEBBE6256B1813D0055DF4AEE60301A6CAA82D2CFA335D9623D5A2C` |
| BOARD/TYPE/WIN/PAGE 定向套件 | PASS | 候选根 `17/17 PASS`，0 fail |
| 安全边界 | PASS | 仅 fixture/in-memory；未启动服务、未执行真实 Run、未访问生产 DB |

本轮新增 PASS 仅覆盖 V2→V1、23 feed、activity 分型、半开时间窗口和分页边界。评论/回复、去重、checkpoint、入库、异步 AI、其他平台回归及国内/境外端到端仍为 `NOT_RUN`。

### v001 评论/回复复测（2026-09-23）

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `672/672`，`BAD=0` |
| checksums | PASS | `672/672`，`BAD=0` |
| manifest hash | PASS | `BF4FCB045C80054D137804C8989307FF3DC56995780BF5FD1BE05A616FC70C9A` |
| checksums hash | PASS | `5124108D9028398ACFAD28CD31A2B7577A6F5E9B11DCA8098F57707C5E9ABB86` |
| COMMENT-01..04 定向套件 | PASS | 候选根总套件 `19/19 PASS`，0 fail |
| 安全边界 | PASS | 仅 fixture/in-memory；未启动服务、未执行真实 Run、未访问生产 DB |

本轮通过覆盖 post/activity comment API、分页末页、评论/回复自身时间半开窗口、root/parent/depth、声明 total 与实际正文数分离。入库、AI、去重、checkpoint、其他平台回归和端到端运行仍为 `NOT_RUN`。

### v001 幂等入库/异步 AI/checkpoint 复测（2026-09-23）

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `674/674`，`BAD=0` |
| checksums | PASS | `674/674`，`BAD=0` |
| manifest hash | PASS | `D7B82E6984D36F779C5BDFCE4B54E568C131F0D8A632AF655D6C1309646B6AD2` |
| checksums hash | PASS | `18038ACF62965652E64D660B2E095C47F651E5404A0C74AFC6F25391CC2812E1` |
| STORE/DEDUP/CKPT/AI 定向套件 | PASS | 候选根总套件 `23/23 PASS`，0 fail |
| 安全边界 | PASS | 仅 fixture/in-memory；未启动服务、未执行真实 Run、未访问生产 DB |

本轮通过覆盖 raw/normalized 先 upsert、changed/unchanged AI job 去重、AI 失败保留内容并标记 retryable、completed scope 重启不重复 claim/fetch。其他平台回归和端到端运行仍为 `NOT_RUN`。

### 整合候选端到端前置门禁（等待交测）

状态：`NOT_RUN_WAITING_FOR_INTEGRATED_CANDIDATE`

整合候选必须同时提供：

- 候选根、完整 manifest/checksum 及可复核 hash。
- 从候选根执行的最小端到端 fixture 命令和原始输出。
- worker/调度接线、开始同步门禁、旧采集器未恢复证明。
- fixture 中的授权、窗口、23 feed、post/activity、评论回复、去重、入库、异步 AI、checkpoint、国内/境外隔离和三平台回归证据。
- 明确未执行生产 DB、真实 Run、服务切换；敏感字段扫描结果。

整合候选端到端矩阵：

| 范围 | 状态 |
|---|---|
| worker/调度接线与开始同步门禁 | PASS（fixture） |
| 账密优先、Token 兜底、授权失败 | PASS（fixture） |
| 昨日北京时间窗口 | PASS（fixture） |
| 23 feed、post/activity、评论回复 | PASS（fixture） |
| 重叠去重、幂等入库、异步 AI 失败不回滚 | PASS（fixture） |
| checkpoint 重启恢复 | PASS（fixture） |
| 国内/境外隔离 | PASS（fixture） |
| Discord/TapTap/Facebook 回归 | PASS（fixture/contract） |
| 真实运行前验收 | BLOCKED，须整合 fixture 全部 PASS 后另行申请 |

### 整合候选独立端到端 fixture 复测（2026-09-23）

结论：`PASS_E2E_FIXTURE_READY_FOR_CONTROLLED_RUNTIME_REVIEW`。本结论仅针对无生产写入 fixture，不等价于真实运行已成功。

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `685/685`，`missingOrMismatch=0` |
| checksums | PASS | `686/686`，`checksumBad=0`；额外 1 项为顶层 `manifest.json` |
| manifest hash | PASS | `52D0D15652C12CE44DA012414668B61E0C1CD425CCFD7CAB96CCC84E7DD9E765` |
| checksums hash | PASS | `6EA62C31AE1FA24A59796D128DF2CF5E80C5BC66D67B9C4929307837303EBA41` |
| E2E-GATE | PASS | 默认未设置 `BIGPLAYER_API_SYNC_ENABLED` 时返回 `BIGPLAYER_QA_GATE_DISABLED`，不创建 run |
| E2E-FIXTURE | PASS | 昨日窗口、feed post/activity、评论、去重、幂等入库、AI retryable、checkpoint 重启、零生产写入 |
| E2E-SAFETY | PASS | 无旧 BigPlayer HTML 链、无 fixture secrets |
| 整合总套件 | PASS | 候选根实际 TAP `92/92 PASS`，`0 fail` |
| 关键语法 | PASS | `worker/src/worker.js`、BigPlayer connector `node --check` 通过 |

### 真实运行解除条件

在项目经理受控窗口内，解除 QA gate 前仍需保留以下条件：

1. 只在候选身份与上述 hash 一致时，显式设置 `BIGPLAYER_API_SYNC_ENABLED=true`。
2. 先以抓取账号管理中的目标配置核对 source/account、频率、国内/境外和平台边界，再执行单次受控运行。
3. 记录原始 run ID、实际窗口、调度触发证据、23 feed/帖子/动态/评论计数、inserted/changed/duplicate、AI 状态和 checkpoint。
4. 真实运行出现任一授权、调度、窗口、抓取、入库或平台串线异常，立即停止放行并回传原始日志；不得以 fixture PASS 替代真实运行 PASS。

### 受控真实运行复核（2026-09-23）

结论：`BLOCKED_AUTHORIZATION_FAILED`。不解除 gate，不安排重试。

- 目标：国内 BigPlayer；source `5c21f78d...`，community `000...0101`，base URL `https://club.q1.com`。
- 前置元数据：source/account 显示 authorized，账密与 Token 均 active；本次显式开启 `BIGPLAYER_API_SYNC_ENABLED=true`，统一调度为 `off`。
- runId：`7dd713a5-deab-4079-8862-1a01028fb295`。
- 终态：`failed`。
- 原始错误：`AUTHORIZATION_FAILED [cause:LOGIN_FAILED]`。
- 失败位置：未进入窗口计算、feed/帖子/动态/评论抓取；无 post/activity/comment/AI/checkpoint 成功证据。
- 后置读取另见生产 `po_sync_runs` 缺少 `site_url_snapshot`，返回 `ER_BAD_FIELD_ERROR`；未修改 schema 或数据。
- 境外 `club-en` 本轮未运行。

该结果不能用 fixture PASS 覆盖；需开发负责人修复授权失败及 schema 兼容问题后重新交受控运行，测试负责人不在本会话自行改码或重试。

### 纠偏候选独立复测（2026-09-24）

结论：`PASS_FIXTURE_READY_FOR_ONE_CONTROLLED_RUNTIME`。此前失败 run 不重试；本结论仅允许项目经理按候选身份申请一次新的受控真实运行。

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `687/687`，`BAD=0` |
| checksums | PASS | `688/688`，`BAD=0`；额外唯一项为顶层 `manifest.json` |
| manifest hash | PASS | `E44BCD73725F176E8BE1EAA1829A865127EC3930BDBFE822626A24CCFA167252` |
| checksums hash | PASS | `E3533E79B423C4FB5E978D6E73C5CD06B54C76E620728614CE8F4BA62251B86` |
| AUTH 时序修复 | PASS | `startLogin -> getStatus` 轮询完成 -> `claimAuthResult`；pending→completed |
| AUTH 失败边界 | PASS | 失败、挑战、超时均 `AUTHORIZATION_FAILED`，不回退 Token |
| READ-COMPAT | PASS | 缺 `site_url_snapshot` 返回 `NULL AS site_url_snapshot/siteUrl`；列存在时保留原值 |
| 定向修复测试 | PASS | `10/10 PASS` |
| 完整最小回归 | PASS | 候选根实际 TAP `96/96 PASS`，`0 fail` |
| 关键语法 | PASS | worker、connector、repository `node --check` 通过 |

真实运行仍须单独验收：只使用上述候选 hash，显式开启 gate 后记录新 runId、账号配置、实际窗口、抓取/入库/AI/checkpoint 原始证据；不得把本 fixture PASS 视为真实运行 PASS。

### 第二次受控真实运行结果（2026-09-24）

结论：`BLOCKED_AUTHORIZATION_FAILED`，本阶段不再重试、不解除 gate、不修改 schema。

- 目标 source：`5c21f78d...`，gate 显式为 `true`。
- 新 runId：`5ef69bf3-0e73-472c-83fc-7ae658491aa5`。
- 终态：`failed`。
- 原始错误：`AUTHORIZATION_FAILED [cause:LOGIN_FAILED]`。
- `window_start/window_end=null`，未进入窗口计算和抓取；无 post/activity/comment/AI/checkpoint 证据。
- 后置读取再次暴露旧 schema 缺少 `r.last_request_at`；未改 schema。

因此 fixture PASS 仍不能升级为真实运行 PASS；需开发负责人继续处理真实登录失败和旧 schema 读取兼容后，重新交候选/明确新的受控运行授权。

### v001 重叠 feed 去重复测（2026-09-23）

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `676/676`，`BAD=0` |
| checksums | PASS | `676/676`，`BAD=0` |
| manifest hash | PASS | `884767037C1C8DEFE0176569FC717DB4D41DFEF6E1425D89159D6FBE1BDC3261` |
| checksums hash | PASS | `BB6DDB0F487231BEE3DE1552C3E1D4DEC50F9CC50DD12AF4C313DB309F606A46` |
| DEDUP-01 定向套件 | PASS | 候选根总套件 `24/24 PASS`，0 fail |
| 关键统计 | PASS | merged/category 重叠只保留 1 条，`inserted=1/change=0/duplicate=1`，AI job=1 |
| 安全边界 | PASS | 仅 fixture/in-memory；未生产操作 |

### v001 授权候选复测（2026-09-23）

| 检查项 | 结果 | 原始结果 |
|---|---|---|
| manifest 文件完整性 | PASS | `668/668`，`MANIFEST_BAD=0` |
| checksums | PASS | `668/668`，`CHECKSUM_BAD=0` |
| manifest hash | PASS | `5D69A354C0BB346B1C3E84AAE97F529C89BA6327EE064F15583A96E5D5256388` |
| checksums hash | PASS | `566B13E3E2D13E06DE062FEF98A0946726B12AEC7D6EF4AB1CEEB10F89A65FF7` |
| 关键 JS 语法 | PASS | 4 个候选文件 `node --check` 通过 |
| AUTH-01..04 / HOST-01..02 | PASS | 候选根定向套件通过；账密优先、startLogin→claimAuthResult、失败不回退 Token、Token 兜底、无授权和 `club.q1.com` fail-closed 均覆盖 |
| BigPlayer 既有定向基线 | PASS | 合计 `15/15`，0 fail |

本次测试从候选根解析依赖，未使用工作区文件补齐；未启动服务、未执行真实 Run、未访问生产 DB。AUTH-01..04、HOST-01..02 可判 PASS，但仅限授权/host 范围。BOARD/PAGE/COMMENT/STORE、WIN、DEDUP、CKPT-01、REG-04 等继续 `NOT_RUN`；本候选不构成端到端采集器发布通过。
