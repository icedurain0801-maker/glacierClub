# 国内 02:00 槽只读诊断与精确影响方案

Status: READONLY_DIAGNOSIS_COMPLETE_NO_IMPLEMENTATION

承接项目经理三项诊断派单。员工只读现役代码和指定 source/run 索引，开发负责人核 QA 报告与两份原件 SHA 一致；未改国内业务、配置、数据库或服务。现役代码根为 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/`。本文是技术影响方案，不是实施或启用授权。

## 已核证据

QA：`.tests/2026-10/2026-10-10/v008_domestic_0200_readonly_qa.md`。
仓库根 `.temp/qa-domestic-0200-readonly-coverage.raw.jsonl` SHA256 `7d418b12cf1cd343392a54cddc5f8cca9ce23d3599c544e19b7e5ca992ca224a`；脚本 `.temp/qa-domestic-0200-readonly.js` SHA256 `7ff16f746286a7d4e3d461aa4d4294f5faa571db7c5ea5877529c704e0402672`。

大玩家 run `e56eebe7-1280-42eb-9d39-d5d90da0f3eb` 于北京时间02:04:01完成，discovered1071/stored856，但 posts inserted0/changed168，401内容关联均归超能。stored不是新增。TapTap `61726610-541b-439b-bce7-a26dda7bae84` partial/PARTIAL_SYNC，posts inserted4/changed117，预算耗尽错误带 from200；不等于上游为空。圣魂/老祖受检source/account均无行，不证明上游为空或共享源已覆盖。

## 1. 大玩家 source schedule 过期租约

`worker/src/schedulerRepositoryAdapter.js:113` 建槽写 source lease，116允许空/过期lease，117要求无queued/running run；138已推进last/next slot。`sourceSchedulerRuntime.js:30` 默认5分钟，仅异常路径74调用release。正常 `server/src/db/repository.js:1304` finishSyncRun 在1309仅清run租约；现役业务未调用renewLease/finalizeLease。`sourceScheduler.js:157` 先判断due，未到期不清旧字段；adapter188/199还要求原lease未过期。

推荐不改代码/config/数据，沿用既有巡检核北京时间08:00合法新槽：唯一run、epoch、last/next slot及终态。过期lease可被新槽覆盖，不必先清字段；尚未观察新槽，不能宣称健康闭环PASS。无新增HTTP/数据影响，无需回退。

若新槽被阻断，按实际reasonCode另派最小候选：单源终态事务按source_id+lease_run_id及可靠原调度owner/epoch精确收口，锁序与claim一致；不能用消费run owner替代调度owner，不能清别人lease、不改next slot。隔离测迟到owner、新槽替换、回滚、单/多站；回退恢复代码并保留历史slot/run，不执行清租约脚本。当前不为字段整洁立即改生产。

## 2. TapTap 分页预算 partial

`worker/src/worker.js:592/597/599` 有限页循环、耗尽时持久cursor并释放checkpoint idle、返回未完成；796/945记partial。`repository.js:1106/1117` 保留/保存cursor，1183只列queued及过期running，不自动重跑partial。`connectors/taptapConnector.js:251/274` 支持accountIdx/from续页。

原建议（已被后续精确QA纠正，不执行）：保留budget/frequency/cursor，下一合法槽只读核相同checkpoint identity续页。每日新槽会换窗口及checkpoint身份，不能自然沿用旧partial窗cursor；见末尾纠偏节。历史partial不改状态，不宣称续跑验收。

若需求要求单槽完整，另立TapTap专属有限持久续页工作与审计候选，保留授权、单消费者及总预算；不直接提高共享SYNC_PAGE_BUDGET，避免影响其他平台/评论HTTP、DB与AI量。合成验证耗尽保存、fresh进程续页、幂等、account推进、失败不越cursor、总量上限；回退关闭新增入口/恢复代码，保留checkpoint及内容，不归零或删数据。

## 3. 圣魂/老祖配置与归属

`sourceScheduler.js:93-107` 要求source/game/community及默认account启用、归属一致且授权；`repository.js:1462` 按account game/community落库，增加超能站点列表不会改变归属。

推荐先向项目经理提供真实站点/账号/授权材料：每社区独立source/default account/registry/凭据绑定，初始disabled，精确频率、生效点、回溯范围；隔离验证后单独申请启用。复用现有scheduler/connector，不改超能source，不重归旧内容。若实际仅共享站点，需产品明确可信游戏标识、未知拒绝和复合幂等身份，不能复制source制造双归属。

启用每个source会新增合法槽、HTTP、内容和下游分析量，性能需按频率/窗口评估。验证合成授权/跨社区拒绝/去重后，真实启用按指定source/run短索引验归属。回退禁用新source并等自有run在既有页边界退出；不停止共享Worker，不删account/内容/run。活跃run未退出不能称排空。

## 时间与剩余风险

内容collected_at默认CURRENT_TIMESTAMP、first/last_seen NOW为北京时间DB会话值；run/scheduler UTC_TIMESTAMP为UTC。pool timezone Z不改变DB NOW，不允许历史全表±8小时修正。旧内容last_seen今日更新并不代表今日新增。

三项仅方案，均未实施。08:00槽、TapTap实际续页、两社区站点授权资料及任何实施审批仍待完成；不阻塞海外隔离交QA，FULL_RUNTIME_NO_GO/CUTOVER_HOLD不变。

经理核收后澄清：TapTap state下一合法槽是10月11日02:00，超出本监控截止，不能承诺大玩家08:00槽同时证明TapTap续页；本窗口仅核精确checkpoint身份/cursor/idle。圣魂/老祖本轮只盘点现有文档/配置授权材料并列缺项，不创建disabled候选或启源。大玩家08:00由经理既有监控截止抽样，开发不另开消费者或巡检。

## 追加只读抽样及材料缺项

员工追加派单连续返回空Payload，未据此冒称员工完成；负责人补只读原件与文档盘点。既有QA原件只含run/source，未查询checkpoint，无法凭它确认本槽cursor。现役worker873明确owned_content/owned；负责人以已知account `727b1ded-1ac2-4379-b931-93e94a659af3` +这两个task字段索引限4抽样，核3306/serverId1/public_opinion/datadir，2s超时与READ ONLY，结束rollback/end，没有写库/HTTP。

首次SELECT中cursor未加标识符引号，ER_PARSE_ERROR停止；失败raw `.temp/domestic-taptap-checkpoint-readonly.raw.txt` SHA `5e33635455d83c78ab6f349c174d994a37aa63ffbe1adad29d2b494a2f381612`保留。改正SELECT引号后exit0，raw `.temp/domestic-taptap-checkpoint-readonly-fixed.raw.txt` SHA `2e9358c2a690b4149cf5a5e26fb249a9ac96ed723bbb2949081eb562eb7c61d5`。

样本含历史09月18/21窗口idle/from200和空字符串窗口checkpoint `2f6ffc0f-f51a-4957-8b7d-afe7205b67d3` idle/from400（site null/posts/root空/租约空）。限4不是全集合，且窗口尚未与02:00 run精确匹配，不能称该run的from200/续页策略已验证；待QA/经理按精确run-window identity核对，勿归零或改历史checkpoint。没有重跑采集。

材料盘点：已有 `.Codex/docs/2026-09/2026-09-23/v004_bigplayer_boardid_config.md`给圣魂boardId=1的产品映射样例，并明确boardId不是社区身份；社区选择器v038及QA v061只证明两社区enabled/可选择。受检项目docs/shared及相关配置文件未找到足以批准两社区采集的真实站点+对应授权材料闭包；不据局部搜索宣称全仓不存在。缺项包括：各社区可验证站点URL/registry身份、对应account/source归属、授权方式/有效性证明（不传secret）、我要当老祖boardId有效映射、频率/生效点/回溯范围。不得复制超能source归属或由样例boardId推断授权。未建立disabled候选或启源。

## 精确窗口QA纠偏及仅设计候选

已完整读 `.tests/2026-10/2026-10-10/v010_taptap_exact_checkpoint_readonly_qa.md`，重算原件 `.temp/qa-taptap-run-checkpoint-exact.raw.jsonl` SHA `79ffbb13f3ca7f1121d65c505426ab67aa03bcd14d98597d6f66c41492eb157f`及脚本SHA `da34eba52e1f21b4dae81364975fbf194934bc420c5a2aeb1243d23c6310294f`均匹配。精确checkpoint `caebdaf5-25eb-48f2-ae8a-6477de95ed6f`，account上述TapTap账号/site NULL/owned_content/owned/posts/root空，UTC窗[2026-10-08 16:00,2026-10-09 16:00)为idle/from200/items200/无租约。实际续页未发生。空窗from400不是本窗。10月11日02:00合法槽按每日规则换为新窗身份，不能据此补完旧窗。前文自然续页建议撤回，保留历史纠偏记录。

仅设计、不实施：若经理另行安排历史partial补完，建议复用现役单Worker增加TapTap专属有限旧窗续页工作记录，绑定原source/account/run-window及checkpoint ID/cursor摘要和内容幂等身份；新工作run记录补完关系，不把原partial篡改为成功，不借新日checkpoint续旧窗。授权仍逐页实时检查、同source单活跃消费者，达到页/HTTP/时间总预算就保存原窗cursor并partial停止；失败不能越过最后已提交页。不创建第二consumer，不采用宽历史扫描。需新增工作记录准入/claim/完成审计和现有worker调度分支，精确锁序与正常source claim一致；持久结构/DDL及真实执行均须独立批准，当前不创建。

影响：每补页额外HTTP至少分页请求及所需评论请求，精确上限须根据connector现有端点计费制定，不把页预算等同HTTP总数；DB包括内容幂等upsert、checkpoint页事务、run/审计与新增工作状态；新/变更内容可能触发现有分析/翻译job，需另设本任务下游入队/消费范围，不直接沿用共享无限量消费。旧内容重复页不可重复计新增/重复建job。正常次日窗口继续按原策略，不混合归属或改全局预算。

隔离验证：精确窗口不串用、并发旧窗/新槽claim单赢家、cursor CAS漂移拒绝、每页提交前后故障恢复的幂等、总HTTP/页/时间预算、授权撤销停止、重复内容与job去重、终态及审计关系；如所需恢复依赖受限proof，该部分保持停止而非新模块绕过。真实启用前需新冻结独立QA及精确授权。回退只关闭专属准入并等自有run安全页边界退出，保留原partial、checkpoint、内容/job/审计，不清cursor、不删数据、不重启共享Worker。无任何候选实施或补采，本设计不构成执行授权。
