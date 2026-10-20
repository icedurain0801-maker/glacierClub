# 议题分布为空修复

日期：2026-10-14
状态：当前 API 与分析 Worker 已应用定向补丁；未提交、未推送 Git，未发布静态托管。

## 原因与变更

- TypeSafe 返回 `topics: []`，概览按议题数组聚合，因此有已分析内容也没有议题。
- `server/src/services/topicClassifier.js`：复用已有 AI 标签；缺失时按正文关键词分类，无法匹配归入“其他”。支持 JSON 字符串标签，并优先使用已有中文译文。
- `server/src/services/baasReadRepository.js`：概览读取时补齐缺失标签，排除无情感分析结果的内容；保留社区、时间及权限过滤。
- `server/src/integrations/typeSafeAnalyzer.js`：新分析填写低成本规则议题，不新增 AI 请求或 token，不改变情感与风险判定。
- `server/src/db/repository.js`：本地 SQL 聚合对空数组使用“其他”，提取标签与计算数组长度使用同一兜底表达式。
- 新增隔离分类测试和 BaaS 概览回归测试。

## 当前运行环境

- 实际 API：`C:/ProgramData/PublicOpinion/releases/release-20261014-handling-fast-api-r1-lastlight-progress-1791966251369`。
- 实际分析 Worker：`C:/ProgramData/PublicOpinion/releases/release-20261014-analysis-quote-bound-1791969430692`。
- 对以上包定向修改分类模块、概览读取循环及分析器 topics 字段，保留现役其他改动。API 使用 BaaS 读取，不依赖本地 SQL 兜底生效。
- 备份：`C:/ProgramData/PublicOpinion/data/backups/topic-fix-20261014`。
- `PublicOpinionApi`、`PublicOpinionAnalysisWorker` 重启后 Running。
- 无历史重判、无历史告警补发、无批量业务数据回写。

## 验证

- 分类与 BaaS 读取测试 13/13 通过；概览及权限定向测试 7/7 通过；语法、空白检查通过。
- 扩展执行 repository 与 TypeSafe 测试共 163 项，155 通过、8 失败；失败涉及采集 checkpoint、补采及同步任务 SQL mock。内存恢复本次议题 SQL 修改后，同样 8 项失败，确认非议题 SQL 改动引入。本任务不修改相关采集代码。
- 外网 overview API 返回有效议题数组，超能世界今日 201 条内容、8 类议题。
- 在 `https://club-opinion.q1.com/admin/PublicOpinion/index.html` 真实浏览器切换：超能世界 8 类、X-Clash 9 类、Last Light 6 类，均显示数量与负面数量；圣魂纷争今日总量 0，正确显示空状态。
- 截图：`.tests/2026-10/2026-10-14/topic-distribution-lastlight.png`。

## 限制

缺失 AI 标签使用正文关键词兜底，并非重新生成 AI 语义聚类。外语、短回复和无明确关键词内容可能归入“其他”，目前占比较高。保留已有 AI 标签，后续如需更细的语义分类需单独优化。
