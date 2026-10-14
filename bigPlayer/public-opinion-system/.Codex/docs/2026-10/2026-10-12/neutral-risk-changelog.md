# 中性无风险内容误入关注级修复

Status: released
日期：2026-10-12

原因：风险决策树把未通过具体问题门槛的中性正常内容兜底成L1；AI摘要已说明无风险，但最终severity仍attention。

修改：server/src/services/riskDecisionTree.js区分中性无风险与问题/抱怨；更新light/deep共用提示词与政策版本。server/src/integrations/aiAnalyzer.js仅更新提示schema缓存键，运行包从各自最新版本补丁构建，保留Worker特有分析原因改动。不改变negative/urgent内部等级和既有通知策略。

新增scripts/reconcile-neutral-risk.js，限定该社区北京时间10/06–10/12，只有neutral+attention且新规则判normal的当前指纹记录允许修正；事务、逐条快照检查、审计、匹配缓存同步，历史通知关闭。已更新38条分析和39条缓存；198条旧指纹记录不变。没有全库重分析或调用AI；其他社区历史未回放，后续新分析适用规则。

验证：70项分析/决策回归通过，3项历史修正边界测试通过；API/Worker候选策略验证和manifest验证通过。实际4320/API进程40172、Worker进程51624指向新包。外网Edge只读验收：927716、927627、927616、927574为neutral/normal，927703为negative/attention；概览今日关注帖子/动态仅剩抽卡结果不满，既有紧急8条保持，无浏览器脚本错误。

测试：server/test/neutralRiskNoise.test.js、server/test/reconcileNeutralRisk.test.js；更新server/test/aiAnalyzer.test.js的普通咨询预期与缓存键契约。证据：.tests/2026-10/2026-10-12/neutral-risk-live.json、neutral-risk-live.png、neutral-risk-validation.json。

风险边界：情感判断仍由AI负责。中性且无可核查指控及原文问题/不满信号才降normal；负面抱怨保留关注级。缺上下文、旧指纹、疑似问题记录不批量降级，后续分析按新政策处理。
