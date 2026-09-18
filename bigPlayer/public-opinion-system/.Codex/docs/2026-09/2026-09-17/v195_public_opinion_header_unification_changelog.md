# v195 PublicOpinion 五页顶部统一

日期：2026-09-17

## 变更内容

- 在 `admin/PublicOpinion/public-opinion.css` 统一六页工作台顶部：深蓝背景、圆角、阴影、内边距、白色主标题与浅色副标题，并补充窄屏换行规则。
- `index.html`、`alerts.html`、`sources.html`、`collection-runs.html`、`keywords.html` 的顶部面包屑统一为 `PUBLIC OPINION CENTER / <页面后缀>` 格式。
- 顶部只保留区域与社区两个作用域选择器；`collection-runs.html`、`keywords.html` 的数据平台挂载位移出顶部。
- 六页的 `public-opinion.css` 引用升级为 `?v=194`，避免静态资源缓存保留旧样式。

## 验证

- 本地 `http://127.0.0.1:8080` 浏览器逐页检查六个顶部：背景渐变、圆角、阴影、标题颜色、两个顶部选择器与缓存版本一致。
- 375px 视口逐页验证：顶部操作区换行，页面和顶部均无横向溢出。
- 侧栏跳转与返回操作保留完整初始作用域 URL；控制台无 error/warn。

## 已知环境依赖

本机社区接口不可用，`scope.js` 会在刷新或前进后按既有规则清除无效的 `communityId`。外网验收需使用有效社区数据复测刷新及前进/后退的作用域保持；本次未修改作用域、接口或数据逻辑。
