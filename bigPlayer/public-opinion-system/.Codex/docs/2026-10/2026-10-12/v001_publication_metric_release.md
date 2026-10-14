# 发布内容总数分项统计上线

- 日期：2026-10-12
- 授权：用户在本会话回复“确认”，同意发布此前已展示、自检的三文件补丁。
- 状态：已发布，真实外网浏览器验收通过。

## 发布范围

- API：从 `release-20261010-sync-status-scope` 克隆到 `C:/ProgramData/PublicOpinion/releases/release-20261012-publication-count-v156`，仅替换 `server/src/db/repository.js`。
- 前端：从 `release-20261010-overview-risk-order-v155` 克隆到 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-publication-count-v156`，仅替换 `public/admin/PublicOpinion/index.html` 和 `assets/app.js`。
- 运行包生成并复核 SHA-256 manifest；API 395 文件、前端 33 文件校验通过。API 服务账号保持 LocalService 只读执行权限。
- 只切换 PublicOpinionApi、PublicOpinionFrontend3001 两项服务，两者健康检查通过。数据库、Worker、分析 Worker 均未修改。
- XML 原版备份在仓库根 `.temp/publication-metric-check/service-backups-20261012/`；旧运行包保留，可恢复旧 XML 并重启对应服务回退。

## 验收

- 相关 4 项隔离回归测试及修改路径空白检查通过。
- 实际启动 headed Chromium，访问用户原始外网网址；无请求拦截、无模拟响应。
- 原始链接的 2026-10-10 发布时间窗口：总计 **615**，帖子/动态 **182**，评论 **433**；主数字等于分项之和，与真实 contents/stats 结果一致。数据比 10 月 10 日开发自检时增加，数值按当前数据库查询结果展示。
- 刷新保持正确；切换昨日（10 月 11 日）为 451=148+303；切换今日（10 月 12 日）为 0=0+0。
- 1920、1280 宽度下分项均位于卡片底部右侧、无溢出，无 pageerror。
- 证据：`.tests/2026-10/2026-10-12/publication-metrics-live-browser.json`、`publication-metrics-*.png`。

## 逻辑

复用同地区、社区、平台、发布时间窗口的 getContentStats.post/comment，动态沿用数据库 post 分类，主数字取二者之和。评论数为已入库评论记录（含回复），不使用父帖宣称的评论量。既有并行开发的风险指标标题、顺序和色彩保留。
