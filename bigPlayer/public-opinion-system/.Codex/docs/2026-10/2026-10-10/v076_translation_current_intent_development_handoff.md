---
last_updated: 2026-10-10
status: independent-isolated-translation-partial-pass
owner: 开发负责人
production: HOLD
---

# 翻译冲突修复开发交接

当前尚未线上恢复。本项只闭环旧翻译任务运行期间，新正文保存导致整页回滚的问题；v069 与 v072 独立验收保持冻结。最终 v075-r2 已由测试负责人独立定向验收，8/8 通过，结论为 `PASS_INDEPENDENT_ISOLATED_TRANSLATION_PARTIAL_SCOPE`。本文件引用独立结果，不授权生产切换。

| 交付项 | 当前状态 | 证据或后续动作 |
|---|---|---|
| 同页持久翻译意图与受控延期 | 开发整合证据已通过 | 仓库根 `.temp/risk-normalization-20261010/employee-translation-intent-producer/`，actual page4项原件绑定初版SHA |
| 消费者回放与旧成功/失败回包保护 | 审查缺陷已修，定向续验通过 | 同根 `employee-translation-intent-consumer/`，完整 snapshot、controlled 范围、manual/NULL、事务与预算保护 |
| 两个完整运行树串行集成 | v075-r2 已冻结 | 同根 `candidate-translation-current-intent-v075-r2/`；825文件/3schema，SHA `b8661a064b65677e34fa9553c70b28810f93e0b1e0a6846ab5fd5f379781cf4c`，正式索引v075 |
| 真实隔离 SQL 与整页闭环 | 开发12个唯一直接case与独立8项通过 | 开发证据按三个候选身份记录；独立8项全部执行最终r2 |
| 独立 QA | PASS，8/8，仅翻译隔离范围 | `.tests/2026-10/2026-10-10/v061_translation_current_intent_independent_qa.md`，完整r2 SHA与825文件/3schema前后一致 |
| 实际写入者、通知、生产实施 | 尚未完成，本轮必要只读定位 | `v074_remaining_production_execution_scope.md` 与员工只读运行边界报告 |

新正文、分析意图、翻译意图在实际海外页面的唯一外层事务中保存；旧翻译 owner/lease 保留。共享协议采用九字段 task scope 与十三字段站点证据集合，同一任务同正文的三个已审站点可合并证据；跨任务或跨窗口明确拒绝，不宣称跨日全量覆盖。消费者需在旧任务结束或到期后，重新核对范围、正文和完整任务身份，再有界回放当前正文。

主代理集成时为海外 Repository 翻译入队接入安全 helper，并显式借用 `overseasPageTransactionConnection(this)`，避免父页面已锁正文时另开连接争抢相同记录；借用连接不能单独提交、回滚或释放。此接线必须在实际页面路径验证，员工各自 mock PASS 不代表该整合成立。

审查中已发现并退回：生产者与消费者 scope 键不一致、结果快照字段不完整、受控执行先回放全配置范围、expired manual 可被普通 claim 接管、claim 锁内可用性复核不足。最终交接必须以修复后的文件 SHA 和验证原件为准，不能套用本文件初始状态。

上述代码问题已关闭；最终消费者 helper 对成功/失败/claim 核15个任务字段，冻结正文身份并在结果锁内再核，enabled 时复核精确范围与 membership；worker 不回放，claim 唯一回放入口接受同一精确 job/content IDs。manual owner 在安全入队写前拒绝，含 expired/pending/force；借用连接检查实际事务，无内层提交。translation 原表无 trigger_reason，不宣称通用 history marker 或实时 source_sites 配置覆盖。

已收初版消费者开发 SQL 原件 `employee-translation-intent-consumer/run-LYj8el/result.json`，8 个组件 case 通过，自建实例已核身份关闭、端口释放。它手工构造意图，不能替代实际海外页面双意图事务证明；初版当时仍有上述未关闭审查项。员工初版报告中的“完整任务身份 CAS”与初版实际字段范围不符，已退回修正；最终验收引用后续 r2 独立证据。

主代理实际运行整合 v075 的 `combined-page.test.cjs`：正常新增同一真实 conn、唯一 begin/commit；双 F1 running 时 F2 正文与双意图提交、旧任务全字段不变；重复 F2 与 F3 代次；receipt trigger 失败整页回滚，4/4 通过。原件为 `employee-translation-intent-consumer/run-D7ICkZ/result.json`，核825文件不变，实例端口58531已按身份关闭释放。这是开发整合旧SHA证据，后续独立 QA 已执行最终 r2。

消费者定向修复运行 `run-caJMvL`：第1/2项通过，第3项暴露意图表与旧任务表 collation 不同导致精确 job ID 回放失败，后3项未执行；实例已按身份关闭、端口58010释放。只修二进制精确 ID 比较，另外阻止安全入队覆盖 expired q1-daily manual 标记，然后重新冻结 r2；不重整页四项或已过旧矩阵。后续证据严格记录各候选 SHA 的适用范围。

最终 r2 的主代理定向续验原件 `employee-translation-intent-consumer/run-n0LDGw/result.json`，第3—8项6/6通过：精确单回放、错版本零写、manual/NULL/预算拒claim、锁内正文/source_deleted复核、无事务 borrowed拒绝、过期F1回放F2并成功原子完成、manual安全入队普通/force零写。核825文件前后不变，59257实例已核身份SQL关闭释放。

r2 与初版完整 v075 只在两个运行树的同一个 `currentTranslationConsumer.js` 文件变化：二进制 job ID 过滤与 manual 入队保护。正式 v075 索引记录全部证据 SHA 与适用范围，保留 FAIL；生产未改。独立 QA 仅本项直接影响验收，未重 v069/v072 或三站矩阵。

## 最终独立验收

测试负责人原件为仓库根 `.temp/qa-v061-translation-fNGrye/result.json`，8/8 PASS，实际执行最终完整 r2（SHA `b8661a064b65677e34fa9553c70b28810f93e0b1e0a6846ab5fd5f379781cf4c`）。独立覆盖 actual page 双 active 更新、旧 frozen 成功/失败零写、全部15字段真实SQL变化、实际 worker 指定job回放1次与fake provider1次完成F2、跨collation精确名单、正文/范围/门禁保护及页面/结果/回放审计故障回滚。

独立运行前后825文件/3schema身份一致；MariaDB实例62351核port/serverId/datadir/pid_file/PID/runner身份后SQL SHUTDOWN，端口释放，exit0。无真实采集、HTTP、付费AI、通知、生产修改或ACL操作。报告与脚本位于 `.tests/2026-10/2026-10-10/v061_translation_current_intent_independent_qa.md` 和 `v061_translation_current_intent_independent_sql.cjs`。

本项以独立隔离部分PASS收口。现役 translation ACL、实际 loaded producer/consumer/全部writers、Q1/通知接线、生产schema/精确名单/cutover、境内外真实定时采集仍未完成；不以本次PASS解除生产HOLD。

剩余生产项按 v074 顺序处理：全部实际写入者与旧 Q1 入口覆盖、发送前重核当前指纹/版本以抑制过期通知、生产 schema 与精确名单、受控切换及定时抓取验收。生产四个服务的实际入口与冻结候选不同；translation 安装包 ACL 拒读尚待核实，未修改权限。磁盘文件身份不等于进程 loaded 身份。

生产 DDL、服务/任务停启、切包、数据纠偏、真实 AI 与通知、推送/合并/发版均未执行。回退须保留未回放意图和审计，不通过删除 ledger 或重启旧写入者实现。
