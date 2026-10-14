---
last_updated: 2026-10-10
status: translation-independent-partial-pass-production-items-pending
owner: 开发负责人
production: HOLD
---

# 剩余修复的最小执行顺序

经理明确要求继续遗留项，不停在候选收口；禁止过度开发/测试。v069独立24PASS、v072独立16PASS保持冻结，不重矩阵/三站采集。生产切换、DDL及数据纠偏先交具体对象、影响和回退工件核收。

| 顺序 | 当前缺口 | 最小改动/动作 | 直接验证 | 生产影响 |
|---|---|---|---|---|
| 1 翻译延期闭环 | PageJobs旧F1活跃翻译会回滚F2正文与分析intent；旧翻译enqueue可能撤运行状态，旧fail缺完整指纹身份 | 同页事务持久F2翻译意图，保F1owner；精确scope/语言/版本证明后延期。consumer有界回放、冻结当前正文及完整job身份、原子译文+完成/失败保护 | actual page F2+分析/翻译双intent；旧F1迟到success/fail拒写；active/到期/F3/重复；事务回滚与预算不变 | 新隔离schema与海外producer/translationconsumer最小overlay；不执行生产 |
| 2 实际写入覆盖 | API/shared/consumer可能仍旧包，旧Q1潜在splitwriter | 只读核实际运行对象；准备现役升级/排空和旧Q1停用或阻断方案 | 精确路径/SHA/方法证明，候选仅受影响入口 | 明确服务/任务及排空窗口，经理核收后切换；目前只读 |
| 3 通知窗口 | 结果commit后独立通知可能基于过期结果 | 只读核实际入口，给提交后发送前当前指纹/版本抑制的最小方案 | 固定迟到回包/当前已改变场景，fake notifier，无真实通知 | 不触现役通知，本轮只读 |
| 4 生产实施与验收 | 新schema未生产，存量意图/精确回填及真实抓取未闭环 | 汇集已冻结schema、精确名单/审计CAS工件、具体运行身份/回退；不扩全库扫描 | 复用独立PASS，随后批准范围内受控验收 | DDL/切换/数据纠偏/付费调用另核收，HOLD |

第一项已完成隔离实现、串行整合和独立定向验收：最终v075-r2 manifest SHA `b8661a064b65677e34fa9553c70b28810f93e0b1e0a6846ab5fd5f379781cf4c`，独立8/8 PASS，仅翻译隔离部分范围。验收报告见 `.tests/2026-10/2026-10-10/v061_translation_current_intent_independent_qa.md`，正式索引与交接见v075/v076。第2/3/4项仍只读定位，生产未执行。

第一项拆producer/schema与consumer两员工，各只写仓库根.temp，主代理串行集成，审查员工同步做2/3/4必要只读定位。producer基v072、consumer基已冻结v069完整analysis运行树；不可把工作树或磁盘package当loaded证明，ACL拒读不擅改。

采用持久延期方案：仅放开guard不能恢复F2任务，直接重置active旧job会引入迟到回包竞争；所以正文同事务意图与消费者身份保护必须一起做。默认disabled、精确scope/targetLanguage/version、batch<=10，无第二翻译consumer，无真实HTTP/AI/生产DB动作。历史/force/NULLorphan等未授权扩项保持明确拒绝，旧开关和预算语义按已有范围保留。

本轮只验证以上第一项直接受影响路径；已通过analysis/source规则与海外板块兼容未重全矩阵。其他行只读定位并准备必要工件，不以门禁作为停止实现的理由，也不借HOLD无限加项。测试负责人已独立验收新冻结候选；后续生产项按经理既有流程推进，本次交接不授权生产操作。
