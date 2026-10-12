# 抓取内容管理入口调整：方案 1

- 日期：2026-10-12
- 用户选定：独立风险卡片方案（方案 1）。

## 修改

- `bigPlayer/admin/PublicOpinion/content.html`：按负面待处理、关注级内容、帖子、评论的顺序组织入口。前两项位于左侧风险卡片组，后两项位于右侧文字 Tab 组。保留原有 `data-content-mode`、统计元素 ID、`aria-pressed` 和点击/键盘事件接线。
- `bigPlayer/admin/PublicOpinion/assets/content-modes.css`：独立布局样式。风险卡片宽度 230px，普通文字 Tab 使用 13px 字号、透明背景、选中细下划线及键盘焦点样式。1000px 以下允许分组换行，800px 以下采用原移动间距。
- 数据查询、统计口径、默认内容模式和处理行为沿用现有 JavaScript。

## 验证

候选页面采用现役运行包，仅替换本次 HTML 与新增 CSS，连接真实只读 API；有界面 Chromium 验证通过：

- 四项 DOM 顺序与左风险、右普通内容位置正确。
- 1920px、1280px 与 900px 布局通过；无整页横向溢出。
- 帖子点击、评论 Enter、关注级点击、负面待处理 Space 均触发正确接口筛选，HTTP 200；四种模式只有当前入口选中。
- 2026-10-11 境内 BigPlayer 测试范围：帖子 148、评论 303、关注 21、负面 69，与统计接口和列表总数一致。
- 页面重新加载后保留当前模式；文字 Tab 选中下划线正确；页面脚本错误 0。
- 工件：`.tests/2026-10/2026-10-12/content-modes-plan1-browser.cjs`、`content-modes-plan1-candidate.json`、`content-modes-plan1-candidate.png`。

## 发布边界

仅提交本次 HTML 增量、独立 CSS、测试与本记录；保留工作区已有改动。前端发布仅切换 `PublicOpinionFrontend3001`，不修改 API、Worker 或业务数据。发布前校验现役 XML 未变化；发布后核对 3001 实际监听进程及新版资源标识，保留旧运行包与 XML 用于回退。线上通过结果以 `content-modes-plan1-live.json` 为准。

## 线上验收

- 已发布 `release-20261012-independent-line-trend-1791778846400-content-modes-plan1`。采用最新现役运行包合入本次增量，36 个文件通过 manifest 校验。
- 3001 实际监听进程确认使用新 release；外网 HTML 的样式版本标识、CSS 资源与前端健康接口均 HTTP 200。
- 有界面 Chromium 直接访问线上，不拦截请求：四入口顺序、点击/Enter/Space 切换、选中下划线、统计数量、真实接口筛选、重新加载均通过。
- 1920px、1280px、900px 宽度检查通过，浏览器脚本错误 0。
- 线上证据：`.tests/2026-10/2026-10-12/content-modes-plan1-live.json`、`content-modes-plan1-live.png`。
