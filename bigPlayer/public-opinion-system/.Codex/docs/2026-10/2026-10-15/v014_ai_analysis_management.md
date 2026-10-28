# AI分析管理与规则调试

Status: 已发布，相关自动测试与线上验收完成
日期：2026-10-15

## 用户可见行为

- “监控关键词设置”更名为“AI分析管理”，保留区域、社区选择，移除“重载”“保存全部规则”。
- 每个社区分别保存 TypeSafe L0/L1/L2/L3 的分析强度、帖子/评论范围及判定规则。同一游戏下的社区也独立保存；新社区使用线上默认规则。
- 页面展示默认口径和生效说明：保存后下次采集使用新规则，正在执行的任务与历史内容不自动重分析。
- 调试支持手动文本或25条随机模拟游戏社区帖子/评论，可勾选、编辑，直接使用当前未保存草稿。输出等级、情感、分析强度、原因、议题及错误码。
- 调试不写业务内容、不提交采集任务、不产生业务告警。相同规则和文本复用分析缓存。

## 实现与数据边界

社区策略保存在 `po_games.ai_analysis_policy.communities[communityId]`，事务加行锁后只更新目标社区，保留其他社区并记录审计。读取和测试接口沿用导航权限、社区权限；测试结果限制为发起用户和目标社区。

采集开始读取一次社区策略，写入内容原始数据及 `po_analysis_jobs.analysis_policy` 快照，后续分析消费快照。规则与内容类型参与缓存键，避免跨规则或帖子/评论复用错误结果。L3保持独立证据复核；关闭或超出筛选范围的结果不进入关注、告警及优质内容。

执行迁移037（游戏策略JSON列）、038（分析任务策略快照JSON列），保留历史数据。现役API、采集Worker、分析Worker、前端均已切换并运行。运行包基于各服务上一现役包增量补入所需文件，保留各服务原有依赖差异与回滚包。

## 文件

- 前端：`../admin/PublicOpinion/keywords.html`、`assets/keywords.js`、`assets/ai-analysis-debug.js`；导航：`../shared/sidebar-data.js`。
- API：`server/src/app.js`、`server/src/db/repository.js`、`server/src/services/aiAnalysisPolicy.js`、`server/src/services/aiAnalysisDebug.js`。
- AI：`server/src/integrations/typeSafeAnalyzer.js`、`server/src/integrations/typeSafeUrgentReview.js`。
- Worker：`worker/src/worker.js`、`worker/src/q1DailyAnalysisRunner.js`、`worker/src/overseasBigPlayerPageJobs.js`。
- 迁移：`migrations/037_ai_analysis_policy.sql`、`migrations/038_analysis_policy_snapshot.sql`。
- 测试：`server/test/aiAnalysisPolicy.test.js`、`server/test/aiAnalysisDebug.test.js`、`server/test/aiAnalysisPolicyRoute.test.js`、`worker/test/aiAnalysisPolicyQueue.test.js`。

## 验证

相关自动测试27项通过，结果：`.tests/2026-10/2026-10-15/ai-analysis-management-tests.txt`。覆盖社区独立读写、保留其他社区配置、草稿调试、25条批次、权限范围、并发、失败处理、缓存及任务快照。API/Worker/Analysis实际运行包各7项策略测试通过，Worker/Analysis各1项队列契约测试通过。语法和目标文件空白检查通过。

线上地址：<https://club-opinion.q1.com/admin/PublicOpinion/keywords.html?boardId=2>。

实际修改并保存L1规则，刷新读回成功；测试完成后已恢复原规则并再次保存。手动签到文本真实AI返回L0、正面、轻量。25条模拟样例首轮23成功、2失败，再次测试复用缓存后24成功、1失败；余下“这只是我个人觉得抽卡运气差，没有统计证据。”返回 `EXPLANATION_INVALID_RESPONSE`，页面明确展示失败。该失败属于AI解释校验失败，未伪装为正常结果，不以重复测试掩盖失败。

已知回归限制：`worker/test/q1DailyAnalysisRunner.test.js` 的旧用例“Q1 analysis runner persists normalized severity audit fields”期待urgent，工作区返回negative；上一现役包同一断言也失败（attention）。未修改业务逻辑或断言掩盖基线问题，不声称全系统测试全部通过。

线上截图：`.tests/2026-10/2026-10-15/ai-analysis-policy-live.jpg`。
