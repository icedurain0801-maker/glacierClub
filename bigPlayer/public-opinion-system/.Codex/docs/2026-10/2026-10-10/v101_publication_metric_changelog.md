# 发布内容总数与分项统计

- 日期：2026-10-10
- 状态：2026-10-12 用户确认后已发布，真实外网浏览器验收通过，见 `../2026-10-12/v001_publication_metric_release.md`。
- 需求：发布内容主数字统计帖子、动态、评论总和，卡片右下角展示帖子/动态、评论各自总数。

## 修改

- `server/src/db/repository.js`：复用 getContentStats 的 post/comment 结果，返回 total、postCount、commentCount；动态在既有数据模型中属于 post。各项沿用相同地区、社区、平台和发布时间窗口及删除过滤，评论含已入库回复，不使用帖子携带的宣称评论数。
- `../admin/PublicOpinion/assets/app.js`：首张指标卡片显示分项。
- `../admin/PublicOpinion/index.html`：底部左右对齐、窄卡片自动换行，更新脚本版本参数。
- `server/test/repository.test.js`：新增混合数据、仅评论、仅帖子、空数据及筛选条件一致性回归。
- 保留修改前已经存在的指标顺序、标题、风险色及其他并行开发内容。

## 验证

- `node --test --test-name-pattern='getOverview|getContentStats' server/test/repository.test.js`：4 项通过。
- 两个 JavaScript 修改文件语法检查、相关路径 git diff --check 通过。
- 实际启动 headed Chromium，访问用户给定网址，以只读真实 API 数据和工作区 HTML/JS 验证。仅在浏览器内替换 overview 的新统计字段，不修改现役服务或数据库，因此不代表已上线验收。
- 今日：帖子/动态 118，评论 242，总计 360；昨日：帖子/动态 188，评论 503，总计 691（自检当时数据）。
- 1920、1280 宽度布局、今日切昨日、全零显示通过，无浏览器 pageerror。
- 浏览器证据：`.tests/2026-10/2026-10-10/publication-metrics-browser.json` 与 `publication-metrics-*.png`。

## 发布边界

现役 API 和 3001 前端从 ProgramData 独立版本化目录运行。工作区存在大量其他并行改动；发布必须基于现役版本只携带本需求的窄补丁，不能整体复制当前工作区。API 切换会短暂影响读取请求，Worker 无需重启，数据库无需迁移或回填。发布授权遵循 AGENTS.md 的用户弹窗要求。
