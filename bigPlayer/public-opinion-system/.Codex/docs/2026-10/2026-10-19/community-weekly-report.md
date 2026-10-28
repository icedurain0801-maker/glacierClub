# 社区运营周报摘要

Status: implemented, verified locally; deployment pending

## 已确认口径

- 概览上方展示“本周社区运营周报摘要”。
- 北京时间周一9:30每社区生成一期；统计上一完整周，左闭右开。
- 读取社区全部已抓取原文，不受概览日期、平台筛选影响；未抓取的内容不在统计范围内。
- 情绪比例由已分析且指纹有效的内容计算，单独展示未分析量。

## 实现

- shared/weeklyReport.js：周期、UTC日期、完整Unicode分块、准确统计。
- migrations/042_community_weekly_reports.sql：周报、原文分块及每日AI调用预算三表；社区+周唯一。
- server/src/services/weeklyReportRepository.js：事务固化全部输入、空周兜底、轻量单期读取。
- worker/src/weeklyReportRunner.js：数据库连接级命名锁跨进程串行，每轮最多一个分块，持久中间摘要并多级合并。失败15分钟重试，累计5次失败后停止；每天最多1000次请求。仅处理本期，避免补做无限历史积压。
- worker/src/worker.js：独立5秒定时器与1连接池，不等待采集扫描；WEEKLY_REPORT_ENABLED=true启用。
- server/src/app.js：GET /api/public-opinion/weekly-report，仅允许regionCode/gameId/communityId，复用概览导航及社区权限。
- ../admin/PublicOpinion/assets/weekly-report.js、index.html、assets/app.js：卡片、社区切换防竞态、失败重试、日期与分析覆盖率。
- scripts/windows-services/build-api-release.ps1：补入shared/weeklyReport.js，Worker闭包脚本自动包含新增依赖。

9:30是调度触发时刻，AI完成时间随整周内容量及排队而变化；页面明确显示生成中。首次启用若已错过9:30，只补生成本周对应的上一完整周期。生成后本期不随后续补抓自动改写。

## 验证

- 21项隔离单测通过（weeklyReport、weeklyReportPermissions、aiTranslator、scanRunner）。
- .tests/2026-10/2026-10-19/weekly-report-database.cjs：独立测试数据库建表/唯一调度/完整原文/周界限/过期分析/合并/空社区/恢复/预算通过，完成后删除该隔离库。
- 真正启动本机Edge进行工作区页面测试：正确日期、451/148/303覆盖率、切社区竞态、日期平台不污染、移动端布局、失败重试及空周报，无pageerror。
- 浏览器数据为隔离模拟数据；未验证现役周报API与真实AI输出，不得称已上线。
- 语法与限定文件git diff --check通过。

## 发布影响与待执行

新增三张表，不重采集、不重新单条分析、不改变处理状态。沿用现有分析模型凭据，默认轻量模型，可用AI_WEEKLY_REPORT_MODEL覆盖。启用后会把本期抓取原文送现有AI服务生成摘要。

待执行：从现役基线准备限定变更运行包并校验，审批切换API/Worker/前端、应用042迁移和开启WEEKLY_REPORT_ENABLED，再验收真实社区周报和现役页面。工作区包含大量并行未发布改动，不应直接全量复制上线。尚未修改现役配置或数据库。


## 2026-10-19 发布验收

用户已确认发布及生成本期，并追加范围：只为已配置未删除采集源且本统计周有抓取内容的启用社区生成。无源/无内容返回not_applicable，不入队、不调用AI。本期10个有效社区全部completed，其余30个已停止为not_applicable，无失败或运行中任务。

现役版本：API release-20261019-weekly-api-r2，Worker release-20261019-weekly-worker-r5，前端 release-20261019-weekly-r2。均从原现役基线合入限定文件；API/Worker/前端均RUNNING，042迁移已登记。备份在 E:/CodexData/public-opinion/audit/weekly-release-20261019。

现场修复：队列创建/更新时间统一UTC；原文保留全部文字，图片URL置为不可见占位，提示词禁止推断图片内容，文字不足时明确说明；首批摘要重新生成，保留原始抓取及分析数据。

实际Edge浏览器验证免登录现役入口、周报真实摘要、10/12至10/18日期、无数据不生成、时间范围切换不改变周报通过；club-opinion入口保持钉钉登录。最终9项专项测试与独立数据库测试通过。未提交或推送Git。
