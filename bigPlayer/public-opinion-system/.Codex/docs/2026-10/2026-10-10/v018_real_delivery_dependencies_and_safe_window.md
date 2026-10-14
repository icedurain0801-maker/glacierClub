# 局部独立PASS到真实交付：依赖与本窗口判定

Status: READONLY_DELIVERY_DEPENDENCY_PLAN_FULL_RUNTIME_NO_GO_CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

响应经理03:30派单。只读核当前源码、v104/v110/v133及当日独立QA；员工只读交叉核查，负责人唯一写本报告。不写经理v033，不改产品需求。不运行SQL/HTTP/AI、不访问生产目录、不DDL/ACL/切服务，不重试或替代受限恢复/progress proof；不改9io1Ti冻结或干预QA原session62657等04:00槽。旧方案暂留、国内及其他平台现役不动。

## 一、目前能计入什么

任务账本/绑定终态/祖先竞争/预算语义仅对应已核收的隔离局部范围；预算为有限fixture全账扫描和disabled outbox，并非生产调用预算。YLd7mL独立13/13仅实际runOnce内存依赖清理因果与隔离目录拒绝，非SQL drain、生产目录或现役shutdown。9io1Ti开发03:00两站8/8合成执行，独立QA另等04:00，当前不能预报其结果；即使独立通过，也不证明三站真实HTTP、AI/翻译或生产入口。

历史材料第一源 `081a16d2-5545-4afd-9c65-e04777e4540b` 为board100017/config三站与registry对齐、frequency21600；第二源 `8c690d6e-12ea-4ad3-b434-d941276c4906` 曾缺board、registry只一legacy站、自身401。**这些是历史证据，不是本窗口新读生产现状**。不能把fixture site-en/site-fr语言1/2当真实三站定义或把第一源board/account复制给第二源。

## 二、精确缺项与顺序

| 顺序/缺项 | 当前代码与事实 | 要完成的工作及独立证据 | 本窗口处理 |
|---|---|---|---|
| 1 自身源/账号/三站合同 | SiteSession.contextOf/exchange核scope与languageId；真实三站token、授权board、feeds和响应分流未证 | 针对每个源独立确认默认账号、board、完整URL/hash/registry/version、auth有效性与真实站点含义；产品配置定义+真实授权schema+脱敏响应绑定，不以URL参数不同代分站 | 只列方案；真实HTTP/配置修改停止 |
| 2 生产schema合同 | ScheduledAdmissionStore强制IsolatedTarget/SchemaGuard；schedulerRepositoryAdapter.scheduleSlotAtomic仍写board_id/site_url_snapshot等；readiness.inspect恒ready=false | 定义生产唯一合同及索引/类型/CHECK、与旧路径锁序/兼容；精确schema差异、规模/备份/回退方案和独立迁移演练。fixture安装不算生产迁移 | 不DDL，缺列现状需临近切换再只读核，不猜已存在 |
| 3 生产持久证据与恢复 | StateDirectoryPolicy仅isolated-v1；RequestJournal内部创建isolated policy；RunContractJournal无条件限制root.temp，即使注入statePolicy也不解除 | 正式生产目录策略、账户权限/防reparse替换、持久提交与备份完整性、真实故障后证据处理；受限proof分支原样停止，不能新目录/新品牌重建为替代恢复 | 不ProgramData/ACL、无替代proof；未证恢复是硬HOLD |
| 4 原始准入与全入口唯一执行 | buildDeps构建BigPlayerH5Connector未注入overseasSiteSession；manual candidate工厂拒enabled scheduler，scheduled工厂isolated-only；普通入口未组装candidate/lifecycle | 在独立组装入口接manual/queued/due/poll/firstClaim及父终态，非目标保持原策略，证据品牌与每个执行者排他；生产readiness不能简单翻true | 生产入口停止；可未来独立隔离研发，不自动接现役 |
| 5 排空/单owner与加载 | worker.js main复用sharedDeps，shutdown仅清timer后pool.end；v133既有现场读取旧v055无热加载证据 | 整体等待scan/poll/renewal/commit/HTTP/AI、实际lease与UNKNOWN处理；隔离进程/SQL并发单owner、停止启动首scan测量；Windows账户实际验收另授权 | QA占13316；离线13PASS不代SQL；不启动第二消费者或重启国内 |
| 6 三站真实内容持久闭包 | PageJobs只入队，next-slot helper两站合成传输，固定IDs不证provider全量 | 唯一已放行入口固定真实窗口，三站schema→feeds/动态→历史及新增comments/replies→事务内容/jobs/任务/audit/游标；逐站unique计数与partial兜底 | 等1–5后精确真实运行决定，本窗口不真实采集 |
| 7 精确AI/翻译完成与费用/通知 | ControlledManifest仅synthetic-only；IsolatedCallBudget仅fixture。analysisWorker常规backlog虽有advisory gate，不是候选预算；processPersistentAnalysisJobs contentIds可限scope但仍light/deep、cache/quality/alert路径。translationWorker.runControlled仅job/content allowlist；contentIds会backfill，job-only无backfill；reserveTranslationCall仅UTC日global计数 | 从本批links冻结真实job/content/fingerprint/profile或language/version清单；消费前后scope与租约/版本再核、每实际provider尝试持久扣费、未知不重放/退款；精确通知抑制与结果事务/失败状态；与现役消费者排他独立验证 | 不借现役消费者直接开跑、不disable全局通知影响国内；真费用/外发另决定 |
| 8 真实下一槽与新旧回退 | 原frequency3600 fixture真实墙钟只是两站合成；源21600历史值不决定当前实际槽 | 已放行真实配置下自然下一槽scheduled_at/window/parent-child/job完成独立验；开放前失败与写入后失败分别回退，旧版不盲接新任务/新schema；不删数据 | 9io1Ti原QA单独继续；生产下一槽未交付，不手工run冒称 |

依赖有并行设计空间：2/3/7可先独立设计和隔离开发；真实采集必须1–5放行后才执行6，真实下游7和自然下一槽8须各自独立核证。不能通过新fixture bypass生产合同或受限proof。

## 三、国内零改动与实际接线冲突

v133此前已直接只读核旧v055服务入口及sharedDeps常驻，没有可用热加载证据。本窗口未再次访问生产XML/进程，现场版本临近任何切换必须重新核。当前源码main也无候选热接入口。

在“不新增第二consumer、不重启或改国内同进程服务”边界下，新海外实现无法加载到该现役共享Worker。此分支停止，不用新海外独立服务绕过。生产依赖不是普通技术审批不足：必须由经理向用户收口是否允许一个实际共享服务暂停窗口，或先批准/开发/验收另一种排他加载架构；后者同样不能凭隔离模块PASS声称已可零中断。

若未来允许单Worker切换，影响方案须列精确服务/账户/release/hash/env、实际停止/启动/首scan耗时、暂停国内新claim和在途任务处理、API/前端/DB保持不动、无双owner及回退条件。停止等待配置60秒不是总停机时间或安全排空保证，当前不承诺分钟数/零丢失/零重复。开放扫描后有新任务必须先停止新增、精确取证和兼容处置，恢复XML不回滚数据库，不删新内容。

## 四、待经理收口的精确真实影响方案（仅建议，未执行）

### 第一阶段：授权/站点合同侦察，不入库

- 对第一源或第二源分别确定自身账号、三条真实URL/board与当前配置version/hash；不共用凭据。第二源board/401/legacy registry引用diff未确认前单独停止。
- 建议最多24个真实请求、每请求10秒、整个阶段5分钟、单并发、自动重试0，失败即止该站并保留精确错误；这是**审批候选上限**，未获授权也未实测，不放宽原业务合同。
- 每站1次 `/api/club/v1/login/token`（可能交换/更新登录态，需单列授权），1次user/context、1次board schema，共最多12次；剩余最多12次用于按已授权schema选择帖子/动态/详情/顶层评论或回复的单页合同探针。不存在某类feed时记录unsupported，禁止伪造；不为凑24跳过必要授权，也不把有界探针称采集全量。
- 列每条endpoint/query键、来源账号标识、purpose、上限、站点token归属/board关系/响应schema和去敏hash；不记token/header密文/原始正文、个人信息。日志脱敏和证据最小保存方案先QA。禁止账号密码刷新、浏览器登录和循环401重试；需要自身重新授权则回经理单独决定。
- 该阶段可暂不启动共享采集Worker，但其真实HTTP仍超出本窗口许可。不写run/content/job，不造成第二consumer。

### 第二阶段：内容执行与下游

真实采集页数、历史root数、总content数、运行时间上限及固定窗口先据侦察和只读规模确定，不把fixture pageSize20/budget2或cap4沿用为生产值；不能承诺未知provider全集。三站每阶段成功/partial和缺项单列，原需求N启用站点规则不缩成硬编码三站。

AI/翻译具体provider/model/version、授权调用数/每次最大tokens/金额、重试是否为0、UTC全局余额、该源窗口scope cap、结果保存及禁通知方式均待确认；必须把每次retry算调用，不把AiTranslator默认maxRetries3（可至4次尝试）或分析light→deep视为一次。仅jobId模式虽不backfill，也不能替代manifest/fullscope/fingerprint再核与预算。结果需核真实analysis/translation completed+版本/译文/usage，pending不是完成。

## 五、本窗口安全下一步判定

只读核查和依赖顺序已完成。尚可开发三站合同负测、生产预算/精确消费者候选接口或进程排空演练，但它们需要先确定新的具体技术边界/合同；本窗口QA占用13316、禁止真实站点/生产操作及受限恢复，新增mock/readiness清单不能解除上述真实依赖。因此本次**不新建重复模拟PASS包、不改业务、不将局部PASS充为真实进度**，交经理本影响方案收口下一精确派单。

继续保留QA原04:00等槽：等待其独立原件并核收对应两站合成范围，不干预、不换包；如果失败按原结果退开发，不用开发03:00证据补PASS。QA未回结果前不预写结论。生产恢复相关分支保持停止且不能以新接口/目录/firstClaim绕过；今后安全隔离研发存在并不意味着生产可交付。

本次仅新增报告，无新测试或发版/commit/push。FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

## 交叉复核与变更记录

员工real_delivery_dependencies只读复核上述实际源码接口，确认factory拒globalThis.fetch且仅隔离、PageJobs仅入队、现役buildDeps缺海外session、analysis虽有限contentIds仍含deep/alerts、translation job-only无backfill但不等完整预算闭包。root直接核Repository.reserveTranslationCall/translationCallBudget确只有UTC日global计数、AlertEngine.pushDingTalk可实际notify、RunContractJournal仍无条件.temp限制。三站HTTP计划还需明确board v1 fallback是否禁用或单独计入24总上限，绝不预算外回退。030迁移涉及内容唯一键，未来生产schema方案必须计入去重/历史引用影响，不能默认无影响或直接应用。

本次只写v018，不重跑13/13、旧SQL/模拟PASS，不新增readiness恒真或替代恢复入口；员工未写文件、未SQL/HTTP/生产访问。历史生产证据与当前工作树推导分开，未知生产现状明确待临近切换只读核。经理下一精确派单可指定生产级预算/消费者候选接口或单owner排空演练的隔离设计，但必须保留原受限proof及生产边界，不以这些设计完成称真实交付。
