# v004 Changelog · 2026-05-28

## admin/analytics · 新增「用户数据分析」页面

- 新建 `admin/analytics/UserDataAnalysis.html`（PC 静态原型，遵循 admin/constraint.md）
- `shared/sidebar-data.js`「数据分析」分组下新增入口 → `admin/analytics/UserDataAnalysis.html`（v3.1.1）

页面含：筛选栏（所属版块 / 日期范围 / 创角天数范围 / 查询）、累计总数（去重，4列×两组共17项）、按天统计总数（18列横向滚动表 + 3行 mock）、右下角可拖拽需求说明浮窗。字段与列名 1:1 对齐 admin-new/club/statistics/index.tsx。
