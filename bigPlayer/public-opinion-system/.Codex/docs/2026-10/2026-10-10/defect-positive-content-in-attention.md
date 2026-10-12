---
date: 2026-10-10
status: confirmed-defect-ready-for-project-manager
owner: 产品经理
scope: sentiment-risk-consistency
---

# 正面内容进入关注级：既有规则回归缺陷

## 一句话需求

正面内容不应进入关注级。修复截图中帖子/动态926937显示“正面·20%”但风险等级为“关注”的问题，保证写入、历史结果、页面列表和数量一致。

## 已明确口径

- 用户2026-10-10直接反馈：“正面的就不应该进入关注级别了，如图1标红的”。
- 既有已确认需求：`.Codex/docs/2026-09/2026-09-18/v025_positive_content_attention_misclassification.md`，正面最终风险为normal，不进入关注级、负面待处理、当前告警；质量推荐与风险分离。此次为该规则的回归缺陷，无新增产品选项，不要求用户重复确认。
- 国内、海外及各平台的帖子、动态、评论均遵守同一情感/风险组合约束；本次不调整中性、负面分层阈值。
- 用户此前明确“反馈问题查到后直接安排解决”，可交项目经理安排修复。历史纠偏按已有审计规则实施，真实数据执行范围与影响由项目经理核实，不物理删除内容/分析/告警。

## 证据及现状

截图文件：`C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-a7f22d88-050b-4ace-ae0f-942a63e4019c.png`。

境内/超能世界国服版、BigPlayer社区，昨天2026-10-09、类型动态、关注级列表：926937，正文起始“今天神了，魔能宝库开盲盒出了30个…”，情感正面20%，风险关注，轻量分析已完成。截图关注级总数96不是“96条全误判”的证明。

工作树只读确认：

- `server/src/services/riskSeverityNormalizer.js`已有positive强制normal。
- `worker/src/worker.js`的`normalizePersistedAnalysis`和`worker/src/q1DailyAnalysisRunner.js`已有归一化调用。
- `shared/riskModes.js`按severity映射attention，`normalizeRiskFilters`会删除sentiment条件；仓储列表与统计读取已存分析等级，没有在该入口消除positive+attention组合。
- `server/src/db/repository.js`的`insertAnalysis`接收传入等级，需核其他写入入口；已有`reconcilePositiveRiskAlerts`。

上述只能确认源码规则和查询行为，不能确定926937当前库值或本机运行版本。根因待开发以精确内容记录、运行构建版本、最近分析作业/缓存/写入入口证实；不得把运行旧版或历史回算遗漏写成已证实事实。

## 修复与验收要求

1. 先定位926937的实际contentId、sentiment、severity、分析版本与时间、执行worker构建及写入路径，报告明确原因。
2. 所有分析输出/缓存复用/持久化入口遵守positive→normal，包括轻/深分析覆盖，不允许后续任务重新写回attention/urgent。
3. 排查已有positive+attention/urgent冲突结果，使用确定性归一化纠偏、保留原模型结果与批次审计；关联当前告警按已有误报规则处理，保留历史。
4. 抓取内容管理关注级列表/卡片数量、负面待处理及舆情概览对应卡片/内容列表使用同一口径。不可仅隐藏标签或仅改当前页，存量纠偏未完成时不得报全量修复完成。
5. 保留正常正面内容、统计中的正面数量和独立质量推荐；关注级排除正面不等于删除内容或改成中性。

| 验收场景 | 预期 |
|---|---|
| 截图926937实际记录纠偏后刷新昨天/动态 | 全部内容中仍显示正面、正常；关注级中消失，列表/卡片/概览数量一致 |
| 模型返回positive+attention或positive+urgent | 最终normal，原结果可审计，不进入风险集合 |
| 缓存命中、轻量后深度覆盖、重复执行 | 不能重新升级正面风险；纠偏幂等 |
| 正面内容有高negativeScore、游戏bug词、热门互动或推荐字段 | 不因这些字段进入关注级/负面待处理 |
| 国内/海外，帖子/动态/评论 | 同一约束；原文、翻译、来源与发布时间保持正确 |
| 负面轻微表达、负面游戏问题及中性样本 | 保留原已确认分层，不借本缺陷修改算法范围 |

项目经理安排开发与独立测试，分别报告源码验证、实际运行版本验证、目标记录及冲突存量纠偏证据。不得以单测PASS或提示词已修改替代后台实际验收。
