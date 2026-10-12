# 84 批次原件独立核验与首轮复盘

- 日期：2026-10-10（Asia/Shanghai）
- 岗位：测试总监，继承独立 QA 职责。
- 结论：原件完整性、三站单页样本及请求账核验通过；`FULL_CHAIN_NOT_VERIFIED`。provider 统计的执行版本根因待确认。
- 范围：仅读取本地原件及相关脚本；未加载业务 `.env`、打开数据库、执行 HTTP/AI、启动服务或子代理。未修改业务代码、原件、经理待办。

## 原件与独立产物

以下路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/`，不是相对 public-opinion-system。

| 产物 | 实际路径 | SHA256 |
|---|---|---|
| 84 抓取原件 | `.temp/overseas-real-small-batch-fetch-84-raw.json` | `06b1cd4a19f180ae8b906cbb7e88467b420c63376aae128249eba7b47ebab9d4` |
| items 原件 | `bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json` | `b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca` |
| 独立读取结果 | `.temp/qa-v044-84-batch-readonly-audit-20261010.json` | `f4e52b01c038904165d49b100a7c71fab6dbb41e051a66afda768669351ae8ec` |
| 独立审计脚本 | `bigPlayer/public-opinion-system/.tests/2026-10/2026-10-10/v044_84_batch_readonly_audit.cjs` | `63d57c8cee199eaedba9504f9ae4dc86da7431a0edf134c81e0e19e7406826b5` |
| 读取时抓取脚本 | `bigPlayer/public-opinion-system/scripts/overseas-real-small-batch.js` | `f9387c55b8521ec0e1fb2f43d07c7217e01deac08be11ab3f4978b232ca08abe` |

items 位于旧的业务目录 `.temp` 错落点；本轮保留，不移动、删除或改写。抓取原件记录的绝对路径及 items hash 与该文件一致。

## 独立核验事实

独立脚本只依赖 Node 内置 fs/path/crypto/assert，核验退出码 0；不导入业务模块。检查 sourceId、一一 site 对应、文件 hash、60 个逐项 JSON hash 与抓取摘要逐项一致，以及原始列表 ID 与归一化 externalId 一一一致。

| 分项 | 事实 | 验收边界 |
|---|---|---|
| 批次结果 | `FETCH_COMPLETED`，三站各一页各 20 条，每站唯一 ID 20 | 单页受控样本完成 |
| 请求账 | attempt=72、sent=72、budget=84；72 条 index 集合精确为 1..72，全部 HTTP200/ok=true，body hash 格式合法 | 响应正文仅 hash/长度证据，不能仅凭200证明每次详情有效 |
| 请求构成 | context 6、board 3、merged-list 3、detail 60 | 未抓取全部发现的 23 feeds，也未抓评论/回复 |
| 详情补全 | 每站 attempted20/enriched18/fallback2 | 不能宣称详情全部完整，fallback 原因需定向核对 |
| 跨站身份 | 60 个 site-item 观察，共 20 个不同 externalId | 入库需按已定身份契约去重并保留三站归属，不能把60观察数当60不同内容或仅按externalId丢站点 |
| cursor | 每站 pageIndex2/offset20/pagesFetched1，hasMore=true | 仅有可继续分页的 cursor，不证明续页实际成功 |

## providerItemCount=0：确定事实与待确认根因

items 原件的 `raw.data` 是数组，实际长度各20；记录的 providerItemCount 各0，不代表上游零条或空页。

当前脚本表达式为 `Array.isArray(page.raw?.data) ? page.raw.data : (page.raw?.data?.items || page.raw?.data?.list || [])`；用同批原件离线计算得到20，与原件记录0不一致。当前工作树不是执行时冻结快照，不能据此直接确定当时用了哪个字段。已要求开发提供执行84批次时的脚本快照/hash或原始统计表达式。

QA 初次消息误推数组 `.items` 方法为原因，随后检查当前表达式已撤回并真实消息纠正。该推断不进入正式根因结论。本轮确定的是统计值与原始结构不一致；执行版本的结构读取原因仍待确认，不补写旧原件、不重抓。

## blocked 口径

原件没有显式 `blockedCount`。当前 transport 先增加 attempt；超过 MAX_REQUESTS 时在 sent 增加之前拒绝。因此在该预算门禁口径下，原件 attempt72=sent72、索引集合1..72与预算84支持推导 `budgetBlocked=0`。

这是依据 transport 计数语义的推导，不是原件显式字段；不扩展成鉴权、网络契约或其他层级“所有阻断均为0”。sent 表示已进入 fetch 调用，不独立证明网络包实际发送次数。日志按并发响应完成顺序写入，不能要求原始数组索引严格升序。当前72次调用均记录有效响应。

## 时间顺序与时间边界

三站各20个 `createTime` 均可解析，但实际并非单调新到旧；`timeOrderVerified=false`与原始数据一致。不能解释为“只是第一页所以false”，也不能在后续使用未经验证顺序的时间提前截断。

当前抓取脚本未向 listFeedContents 传 dailyBounded/publishedFrom/publishedTo/historyStart。连接器只有 boundedWindow 且整页早于窗口下界、已有时间顺序及跨页顺序验证时才可能记 `timeBoundaryReached=true`；本批false符合无时间窗口单页样本的范围。

因此两个false不构成该单页样本抓取必然失败；同样不能签完整回溯、时间窗口覆盖或 `completed_full`。本批hasMore=true，也不能宣称分页终结。旧24预算批次失败保留，不混入新84批结论。

## 当前业务状态及后续验收

“尚未入库/AI/定时”是本轮交接状态；本轮未新开业务数据库，不能把交接摘要或缺少本地原件当成最新业务库零写的独立证明。已向特邀开发总监请求精确范围的只读结果/入口及新冻结原件，避免宽扫与重复副作用。

| 后续项 | 状态 | 必须核验的证据 |
|---|---|---|
| 执行时统计版本、正式认证session | 待开发交付 | 冻结hash、正式session路径、授权与失败边界；旧Bearer override不代替正式session验收 |
| 真实样本入库及幂等 | 未独立验收 | 精确source/account/site范围、输入items hash、前后业务行、重复执行受控结果与三站关联 |
| jobs scope | 未独立验收 | 本批content/job复合身份、状态与范围外不消费证据 |
| 少量真实AI/翻译 | 未独立验收 | ≤3真实调用预算口径、逐次调用/账单/结果持久化与jobs终态，QA不重复调用 |
| 独立schedule排他/持久化/恢复 | 未独立验收 | 新冻结、隔离QA矩阵、精确owner与持久原件 |
| 实际slot | 未独立验收 | 实际槽时间、run identity、claim/采集/入库/jobs/父子终态与排他证据；合成connector不作真实生产证据 |

真实副作用由特邀开发总监受控执行，QA独立核原件与结果；业务代码修改/发版由对应岗位负责。国内Worker、其他平台、数据库/API/前端及健康调度不停止或重启；旧海外代码与证据保留。

## 附录：首次项目配置补充草案（未写入 AGENTS.md）

```yaml
last_updated: 2026-10-10
status: draft
scope: project
owner: 待确认
```

# AGENTS.md（草案）

## 项目简介

public-opinion-system 是独立游戏舆情监控工程，Node.js >=20、原生 JS、npm server/worker workspaces，使用 mysql2 访问 MySQL/MariaDB 的 po_* 表。API、采集与分析/翻译进程分离，不依赖 aiCompanion/server 代码或业务表。具体现役部署入口与版本以冻结原件确认，待确认。

## 快速导航

| 事项 | 入口 |
|---|---|
| 项目入口 | README.md、package.json、server/src/app.js、worker/src/worker.js |
| 架构 | docs/architecture.md、server/src/connectors、server/src/db、worker/src |
| 配置 | .env.example、server/src/runtimeEnv.js；不得输出.env正文 |
| 测试 | server/test、worker/test、.tests/YYYY-MM/YYYY-MM-DD |
| 部署 | docs/production-checklist.md、scripts/windows-services/README.md、deployment |
| 文档规范 | 仓库上级AGENTS.md；项目文档索引待确认 |

## 硬性规则

### 安全红线

| 编号 | 规则 | 原因 |
|---|---|---|
| S1 | 不提交密钥/token/连接串/证书；凭据AES-256-GCM加密，缺配置fail-closed | 防泄露 |
| S2 | 不输出敏感配置、凭据正文或将其写日志 | 防泄露 |
| S3 | 不绕过鉴权、scope、审计、租约/排他和调用预算 | 保持运行边界 |

### 架构规则

1. server维护API、鉴权与存储契约，worker通过连接器/适配器执行任务；不导入aiCompanion/server。
2. 采集完整性、分析完整性及定时执行分别验收；单页、manual或合成证据不代替实际scheduled全链。
3. 测试先核隔离目标与冻结hash；真实副作用由开发受控执行，独立QA不双执行HTTP/AI。国内与其他平台不纳入海外测试。

### 编码规则

1. 保持现有原生JS/CommonJS及项目模块风格，不重构无关改动。
2. 沿用明确错误码及fail-closed；不把失败或授权未知表示成空数据成功。
3. 使用最小聚焦验证；运行现有测试前核查隔离和副作用，不自动执行全量npm test。

## 常用命令

| 场景 | 已有命令/当前判断 |
|---|---|
| 安装 | npm install（本轮未执行） |
| 构建 | 根package.json无build脚本；正式构建方式待确认 |
| 测试 | npm test；server与worker为node --test，真实环境不得未经隔离直接运行 |
| 本地运行 | npm run start:server / npm run start:worker；本轮不启动 |
| 迁移 | npm run migrate；需评审目标与窗口，本轮不执行 |
| 格式化/检查 | 根package.json无lint/format脚本；可node --check指定JS，统一命令待确认 |

## 项目目录结构

```text
server/       API、连接器、数据库契约、集成与测试
worker/       采集、分析、翻译、调度与测试
shared/       共享契约
migrations/   数据迁移
scripts/      运行、冻结、隔离验证与部署脚本
docs/         现有架构/API/生产清单及设计文档
.Codex/docs/  按日期维护正式变更/交接记录
.tests/       按日期维护测试脚本与报告
```

## docs 目录规范

现状为docs下architecture.md、api.md、production-checklist.md及superpowers等，不覆盖已有结构。继续遵循上级按日期.Codex/docs和.tests规则；建议未来建立architecture/conventions/design/plans/reference索引与分层映射，具体迁移待确认。临时产物统一仓库根.temp，保留已有错落原件；QA不写经理待办。

## 待确认信息

| 问题 | 当前判断 | 需确认 |
|---|---|---|
| 名称/用途/技术栈 | public-opinion-system、独立舆情系统、Node/mysql2 | 是否正确 |
| 构建/测试/运行 | 以上package scripts已存在，测试需隔离 | 正式构建及安全测试入口 |
| 安全与架构边界 | 以上规则来自README、架构与本次授权 | 是否补充 |
| 根AGENTS | 该业务项目根无AGENTS，上级内容主要为glacierClub | 是否允许将补充草案写入项目根AGENTS.md |

草案只用于确认，未写入项目根AGENTS.md，也不作为业务实现变更。
