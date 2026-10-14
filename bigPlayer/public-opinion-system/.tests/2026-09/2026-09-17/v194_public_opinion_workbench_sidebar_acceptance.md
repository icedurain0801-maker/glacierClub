# v194 PublicOpinion 独立工作台侧栏：浏览器验收

- 验收角色：测试负责人
- 结论：**FAIL**。
- 范围：仅前端侧栏；未修改业务、服务、生产数据或发布状态。

## 本地静态检查

- `shared/sidebar-data.js`、`shared/sidebar.js` 的 `node --check` 均通过。
- diff 显示新增 `PUBLIC_OPINION_SIDEBAR_DATA`，并在 `admin/PublicOpinion/` 路径分支使用独立数据源、转发区域/社区作用域参数。

## 真实浏览器阻断证据

外网页面 `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html` 实际渲染仍为：

- Logo：`大玩家 / 原型`，而非 `舆情工作台 / 运营`；
- 侧栏仍包含全局 C 端、后台管理等多层目录；
- 舆情入口仍作为全局侧栏中的 `舆情管理` 分组，而非独立单层六入口工作台。

因此“PublicOpinion 六页始终只展示独立单层工作台侧栏”首要前置条件未成立。本次不继续将六个入口点击结果表述为通过，也不能据此确认刷新、前进后退和作用域透传的最终验收。

## 退回事项

请开发负责人确认 PublicOpinion 页面是否实际加载了更新后的 `shared/sidebar-data.js` / `shared/sidebar.js`（缓存版本、部署产物或页面接线）。修复后重新派发浏览器验收，届时再逐项验证六入口、参数透传、前进后退、Console 与非 PublicOpinion 页面回归。
