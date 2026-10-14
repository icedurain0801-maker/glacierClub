# v197 P0 恢复与舆情工作台侧栏合并浏览器验收

- 验收角色：测试负责人
- 验收时间：2026-09-17
- 范围：既有 3001 链路只读复验、外网页面及独立舆情工作台六入口；未安装 `PublicOpinionFrontend3001`，未切换 Kong，未控制 API/Worker、旧任务，未写生产数据、`.env` 或 ACL，未 push/发布。

## 结论

| 验收线 | 结论 | 说明 |
|---|---|---|
| P0：3001 既有链路恢复 | **PASS** | 本地、4320 健康检查与外网六页均可达；无 504/白屏，资源和业务 API 未见 5xx。 |
| C 线：独立舆情工作台侧栏 | **PASS** | 新建强刷外网标签已渲染“舆情工作台 / 运营”及仅六个平铺入口；六入口点击、作用域透传、后退/前进及非舆情页原侧栏回归均通过。 |

## P0 恢复证据

- `http://localhost:3001/admin/PublicOpinion/index.html`：HTTP 200。
- `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html`：HTTP 200，强刷新标签无 504、无白屏。
- `http://127.0.0.1:4320/health`：HTTP 200，`database.status=ok`。
- 外网六页 `index`、`content`、`alerts`、`sources`、`collection-runs`、`keywords`：均 HTTP 200。
- 从六页 HTML 收集的 16 个 CSS/JS 资源均 HTTP 200；浏览器运行期间捕获的 Console `error/warning` 为 0，`/api/public-opinion/` 响应 5xx 为 0。

## C 线侧栏与导航证据

- 新建外网强刷标签的实际可访问性树显示品牌为“舆情工作台 / 运营”，侧栏仅有六项：舆情数据概览、抓取内容管理、舆情通知管理、抓取账号管理、抓取任务记录、监控关键词设置。
- 分别点击上述六项：均进入对应的 `/admin/PublicOpinion/*.html` 页面，且保留 `regionCode=domestic`、`communityId=00000000-0000-0000-0000-000000000101`、`platform=bigplayer_h5`。
- 从概览进入内容页后，浏览器后退回到概览、前进回到内容页；两次恢复的作用域均保持上述三项。
- 抽查 `https://lfy3001.dev.q1op.com/admin/community/BadgeManage.html`：HTTP 200，仍为“大玩家 / 原型”原全局侧栏，不含“舆情工作台 / 运营”专用品牌。

## 基线不变核对

- `PublicOpinionApi`、`PublicOpinionWorker`：均为 `Running` / `Automatic`。
- 监听：3001 PID 34656、4320 PID 7172、3306 PID 32808；本次不涉及任何服务控制。
- 旧计划任务不变：`BigPlayer Last Night Overseas Daily 02`、`BigPlayer Q1 Daily 02` 为 `Ready`，`BigPlayer Keep Server Alive` 为 `Disabled`。

## 说明

此前已打开的旧标签仍缓存“大玩家 / 原型”多层侧栏；本次新建带缓存隔离查询参数的标签已加载新产物。验收以新标签强刷及独立浏览器复验的实际运行结果为准。
