# 游戏崩溃反馈历史风险校正

Status: verified
Date: 2026-10-12

## 问题与口径

Discord001 / Last Light 的 Laura 帖子（external_id=1558774998615990362，content_id=0399ee49-35e3-4223-bc08-632b7a2d2b94）反馈发起联盟boss集结时约每十次崩溃一次，重连浪费时间并与其他玩家不同步。分析情感为负面、强度0.60，但历史分析与对应缓存均保存 attention，导致概览归入关注级。

现役 API 与 Worker 已具备 progressive-game-risk-strict-50-v6：实际游戏故障反馈属于负面待处理；现役规则对原文重新计算得到 negative，包括低强度/低置信度场景。根因为该历史记录未校正，不需要再次修改分类算法或更换服务包。

## 实施

新增 scripts/reconcile-content-risk.js：只接受明确内容UUID和指定已验证运行包，默认只读预览。应用要求预览文件SHA256，事务内锁定并逐项比对内容、分析和匹配缓存，拒绝内容修改、过期指纹、删除、旧策略、无实际问题及紧急级降级。仅 attention→negative 更新，原分析字段保持，分析与缓存分别写入审计，任意审计失败整批回滚。新预览后重复应用为无变更。缓存匹配限定指纹、分析档次、版本和模型，避免后续相同内容复用旧等级。

正式库本次仅校正用户截图对应1条 po_analyses、1条 po_analysis_cache，写入2条 game_problem_risk_reconciled 审计，保留原分析快照。无内容删除、迁移、处理记录更改、新告警或历史通知，未触发采集、翻译或付费AI重分析。

## 文件

- scripts/reconcile-content-risk.js：有预览、范围与并发保护的历史校正工具。
- .tests/2026-10/2026-10-12/game_crash_risk.test.js：截图原文及反例、真实隔离MySQL回归。
- .tests/2026-10/2026-10-12/game_crash_risk.browser.cjs：有界面正式Edge浏览器验收（只读）。
- .tests/2026-10/2026-10-12/game_crash_risk_result.json：正式接口、浏览器、数据校正结果。

## 验证

node --test .tests/2026-10/2026-10-12/game_crash_risk.test.js server/test/riskSeverityNormalizer.test.js：15通过、0失败。

PO_RISK_TEST_RUNTIME_ROOT=C:/ProgramData/PublicOpinion/releases/release-20261012-handling-risk-gate-r1 node --test .tests/2026-10/2026-10-12/game_crash_risk.test.js：对现役策略4通过、0失败。测试数据仅写 public_opinion_crash_risk_test，覆盖只读预览、缓存一致、2条审计、幂等、内容/缓存并发变化拒绝与审计失败回滚。

有界面Edge打开正式概览（境外 / Last Light / Discord / 昨日），校正帖子出现在负面内容区且不在关注级区；点击查看能读到原文和摘要，再点击全部负面内容跳转列表，风险列为“负面待处理”，处理状态“待处理”且复选框可用。真实API negative筛选包含该帖、attention筛选排除该帖、详情severity=negative。页面脚本错误0。概览请求使用fresh=1旁路90秒旧缓存并刷新对应缓存键。

## 使用边界

此工具依赖显式指定的现役四档风险策略，旧策略运行包会拒绝预览。用户本次指定的历史记录已修复；未执行其他历史内容的全库回填，也未把共享工作区未提交的规则改动卷入本次提交。生产应用前须先解释影响并核对只读预览，禁止盲目全库变更。
