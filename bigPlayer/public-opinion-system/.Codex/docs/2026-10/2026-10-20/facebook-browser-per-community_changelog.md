# Facebook 按社区独立账密网页登录采集

Status: API、前端、Worker、登录服务已发布；配置入口完成真实管理员浏览器验收；真实 Facebook 账号采集联调待完成，新来源保持停用。

## 已拍板需求

- 所有已启用境外社区可新增 Facebook 网页采集源。
- 每个社区独立填写登录账密和采集网页，不采用跨社区共用账号。
- 账号管理页面提供配置、登录、验证码及人工安全验证入口。
- 保留旧 Graph 来源、历史内容、分析和告警；新建来源默认网页登录模式。

## 实现与主要文件

| 文件 | 变更 |
|---|---|
| `shared/facebookBrowser.js` | 模式识别、官方 HTTPS 主页/群组 URL 校验、绑定键 |
| `server/src/services/facebookBrowserAccount.js` | 社区及管理员权限、加密凭据、配置和登录接口；仅返回脱敏摘要 |
| `server/src/db/facebookBrowserAccount.js` | 配置事务锁定精确默认账号；进行中的任务阻止修改；配置变更停用并失效授权、检查点和能力缓存；写审计 |
| `server/src/db/repository.js` | 创建来源时持久化浏览器模式；其余并行改动不属于本次任务 |
| `server/src/app.js` | 注册浏览器模式配置路由、内部凭据解析、版本指纹；保持鉴权和社区范围检查；新模式不使用旧六项 Graph 门禁 |
| `server/src/connectors/facebookBrowserConnector.js`、`externalConnectors.js` | 按来源模式分流，旧 Graph 行为保留；过期会话有界续登，人工验证/账密错误不自动重试 |
| `login-session-service/src/adapters/facebookBrowser.js` | 独立浏览器上下文、登录状态及真实认证 Cookie 校验、人工验证画面、渲染 DOM 读取、原始 ID/时间、断点隔离 |
| `login-session-service/src/loginSessionService.js`、`httpServer.js`、`index.js` | 绑定会话及内部采集接口；人工验证只作用于当前绑定；撤销先使引用失效 |
| `server/src/services/loginSessionClient.js` | 内部采集和验证画面客户端 |
| `worker/src/worker.js` | 浏览器模式授权检查跳过 Graph Token；继续使用既有分页、入库、检查点、队列及分析流程；人工验证状态兼容现有字段长度 |
| `../admin/PublicOpinion/assets/facebook-browser.js` | 独立账号表单、密码不回显、登录/验证码/人工画面、明确错误、超时防重复提交、关闭后异步结果不干扰新表单 |
| `../admin/PublicOpinion/assets/sources.js`、`sources.html` | 境外社区新增入口及列表/同步门禁，加载新表单模块 |
| `scripts/windows-services/build-api-release.ps1`、`verify-api-release.js`、`prepare-login-session-service.ps1` | 补齐共享契约打包与允许清单；未执行发布脚本 |

## 接口

- `POST /api/public-opinion/sources`：`platform=facebook`、`collectionMode=browser`、`communityId`、`displayName`、`baseUrl`、`account`、`password`、`frequencySeconds`。
- `GET/PATCH /api/public-opinion/sources/:id/browser`：脱敏详情/保存配置。
- `POST .../browser/login`：服务端解析本社区加密账密并登录。
- `GET .../browser/status`：状态及当前人工验证描述。
- `POST .../browser/challenge`：提交验证码或检查可信设备批准。
- `POST .../browser/challenge-view`：限管理员、限当前挑战的画面及人工点击/滚动。
- 登录服务内部接口继续使用现有内部 Token，采集目标仅从服务器已保存的配置解析，不接受调用者任意 URL。

## 并发、数据及登录边界

- 每绑定账号的操作串行；全局最多两个浏览器操作，FIFO 等待队列最多 32 项，排队最多 10 秒；16 个并行社区的隔离队列测试通过。
- 上下文最多 16 个，空闲一小时失效，会话仅存内存；服务重启后按已保存账密重新登录，平台要求验证时转人工处理。
- 密码采用现有 AES-256-GCM，AAD 绑定账号/凭据类型/平台；日志、列表和测试结果不保存真实凭据。
- 登录会话绑定配置指纹，账号或网页变化后不能复用旧浏览器会话进行采集。
- 无新数据库表/迁移。保存新账密会写现有凭据表；改变账号或网页会清当前账号检查点及能力缓存，历史内容、分析及告警不删除。
- 仅读取账号可见内容。无可验证的 ID、正文或机器发布时间时明确失败；无明确末尾证据时保持部分完成/报错，不假报全量完成。
- 每页读取与断点恢复有时间、轮数、游标体积上限，避免无限滚动卡住服务。

## 验证

- Facebook 新模式、权限路由、Worker 凭据分流和旧 Graph 回归：52/52 通过。
- 登录服务已有完整回归：36/36 通过；后续内部 HTTP/客户端与发布清单回归：18/18 通过（部分用例重叠，不相加作为独立总数）。
- 真实 Edge 浏览器加载实际账号管理页面与前端脚本；所有业务 API、Facebook 网页均为隔离模拟，未写真实业务库、未调用 AI/钉钉、未登录真实 Facebook。
- 浏览器 12 项检查通过：非 Last Light 境外社区新增、密码一致性、社区归属、密码清空、失败提示、验证码、关闭/Escape/重开、切社区隔离、ID/时间/断点、明确末尾、评论与原帖分离、登录表单和配置失效。
- 16 个本次接线的 JavaScript 文件语法检查、两个修改的 PowerShell 脚本解析、指定文件 `git diff --check` 通过。
- 浏览器脚本及证据：`.tests/2026-10/2026-10-20/facebook-browser-ui.cjs`、`facebook-browser-ui-results.json`、`facebook-browser-ui.png`。

## 尚未完成的真实环境验收

1. 当前没有用于本任务的真实 Facebook 测试账号，尚未确认真实网页 DOM、发布时间元素和评论展开结构的兼容性；不能把隔离测试通过表述为真实 Facebook 抓取成功。
2. 上线前需要在候选环境配置一个社区账号及页面，验证帖子、评论、回复、长正文、分页和安全验证；遇到平台结构差异继续修复选择器。
3. 用户已单独批准“发布配置入口，真实验收后再启用”。按各服务现役基线逐点合入，未发布整个并行工作区。
4. 本次未切换或启用现役来源、未补抓历史、未推送钉钉、未提交或推送 Git。

## 2026-10-20 发布记录

- API：从 `release-20261020-resilience-r1` 切至 `release-20261020-facebook-browser-api-r1`。
- 前端：从 `release-20261020-weekly-two-lines-r1` 切至 `release-20261020-facebook-browser-r1`。
- Worker 候选：`release-20261020-facebook-browser-worker-r1`，基于 `release-20261020-collection-recovery-r1`，仅加入 Facebook 模式分流。
- 登录服务候选：`login-session-20261020-facebook-browser-r1`，基于 `login-session-20261010-entry-ready-iyogames-20261012`。
- API/前端 XML 原文件分别备份到各服务 `services/backups/<Service>.before-facebook-browser-20261020-r1.xml`。回滚使用对应原 XML 和原运行包；不能把本次回滚用于覆盖后续并行发版。
- 现役 API 启动后另发生一次停止/启动；核验入口仍为本次版本，恢复运行。发现运行包中并行加入采集源列表不查检查点、前端取消旧请求和 12 秒超时处理；保留并审阅该变更，重新生成校验清单并通过回归。
- 冻结候选 API/Worker/前端依赖闭包及 SHA-256 清单、登录服务清单通过；候选后端核心测试 29/29、真实 Edge 隔离检查 12/12 通过。
- 候选登录服务按现役环境在随机本机端口启动，健康检查 200、无内部鉴权访问 401、虚构绑定的采集请求 404 `ACCOUNT_NOT_FOUND`；未调用外部登录、未写库。
- 候选登录服务对当前工作区测试集为 35/36；唯一失败为 `selectorFallback.test.js` 的 `firstAvailable is not a function`。该 BigPlayer 模块与原现役 SHA-256 完全相同，属于工作区测试和现役基线差异，未混入其他开发修改。
- 用户在真实 Edge 完成钉钉登录后，管理员页面验证 X-Clash/TitanWarSA 新增表单、社区归属、空账密、关闭按钮及 Escape；旧 Last Night Graph 来源仍显示停用。真实概览/趋势/周报/内容列表/内容统计请求均返回 200，内容管理正常展示 403 条记录。
- 页面证据：`.tests/2026-10/2026-10-20/facebook-browser-live-form.png`、`facebook-browser-live-checks.json`、`facebook-release-content-regression.png`。未保存测试来源或输入真实 Facebook 账密。
- 北京时间 12:07:01 完成后两项服务切换：仅在取得现有调度租约且查询到零个运行中/暂停中/取消中任务后，切换登录服务与 Worker，再释放租约。没有取消、重置业务任务或启用 Facebook 来源。切换后四项服务运行，登录服务和 API 健康检查均为 200，原队列任务已被新 Worker 接续。
- 发布期间现役另有词云归并模块和概览展示的并行修改，已保留，没有覆盖或重复实现；发布清单按实际文件重新校验。完整 11 社区扩展浏览器巡检超出工具时限，未计入通过项目；真实通过证据以 X-Clash/TitanWarSA 入口及既有 12 项隔离浏览器检查为准。
