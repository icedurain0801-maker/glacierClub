# 优质内容推荐理由补生成修复

- 日期：2026-10-16
- 范围：分析 Worker、优质内容推荐理由、X-Clash 线上历史记录

## 问题与根因

X-Clash 优质内容列表中的部分历史记录显示“推荐理由待生成”。这些记录的 `po_quality_candidates.quality_reason` 和 `po_analyses.quality_reason` 仍是旧占位文案 `TypeSafe结构化质量及推荐判断`。此前只有指定的 Last Light 记录做过一次性补修，系统没有对历史优质候选持续补生成理由的后台任务；因此旧记录不会随着新分析逻辑自动更新。

## 代码变更

- `worker/src/qualityReasonBackfill.js`：新增每分钟扫描和补生成任务。按正文指纹匹配当前记录，使用 advisory lock 防止重复处理，每轮最多尝试 5 条；失败记录 5 分钟后重试。
- `worker/src/analysisWorker.js`：在正常分析 backlog 后异步单 flight 调用补生成任务，不阻塞正常分析消费。
- `worker/test/qualityReasonBackfill.test.js`：覆盖节流、失败重试、跨进程门禁、正文/推荐标记并发校验、BaaS watermark 和审计写入。

补生成只更新推荐理由和分析时间，不改变质量评分、推荐标记或审核状态。

## 验证与发布

- 隔离测试：`node --test worker/test/qualityReasonBackfill.test.js worker/test/analysisWorker.test.js server/test/typeSafeQualityExplanation.test.js`，15 项通过。
- 发布包：`C:/ProgramData/PublicOpinion/releases/release-20261016-quality-reason-backfill-r1`
- 已切换并重启服务：`PublicOpinionAnalysisWorker`
- 运行参数：`C:/ProgramData/PublicOpinion/releases/release-20261016-quality-reason-backfill-r1/worker/src/analysisWorker.js`
- manifest、语法和 `git diff --check` 通过。

## 线上补修

已对截图中的 X-Clash 4 条记录补生成并保存真实中文理由：帖子 ID `1607709`、`1607002`、`1603966`、`1600672`。随后同步 BaaS：4 条内容写入、40 条元数据写入。

浏览器只读验收页面：
`https://club-opinion.q1.com/admin/PublicOpinion/alerts.html?boardId=100016&tab=quality&pageSize=20`

验收结果：上述 4 条记录均显示真实中文 AI 推荐理由，不再显示“推荐理由待生成”。证据文件：

- `.tests/2026-10/2026-10-16/quality-reasons-browser.json`
- `.tests/2026-10/2026-10-16/quality-reasons-browser.png`
- `.tests/2026-10/2026-10-16/quality-pending-repaired.json`
- `.tests/2026-10/2026-10-16/quality-pending-cloud.json`

## 运行边界

后台任务会继续自动处理其他历史占位记录；每轮最多 5 条，失败按 5 分钟冷却重试。当前只保证截图涉及的 4 条已完成，不宣称全系统历史记录已经全部补齐。本轮没有重跑全量 AI 分析，也没有发送钉钉测试消息。
