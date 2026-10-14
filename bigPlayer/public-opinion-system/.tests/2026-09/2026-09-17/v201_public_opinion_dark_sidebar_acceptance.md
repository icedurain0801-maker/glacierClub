# v201 舆情分析系统深色侧栏验收

## 浏览器验收

| 项目 | 结果 |
|---|---|
| 六页入口和 active | 每页 6 个入口，active 唯一且正确 |
| 作用域参数 | `regionCode/communityId/platform` 全程保留 |
| 前进 / 后退 | 正确恢复页面与 active |
| 1440 / 1280 / 390 | 无侧栏溢出或错位 |
| hover / focus / 键盘 | 专属状态可见，Tab 可聚焦 |
| Console | 六页及非 PublicOpinion 页面均 0 error / 0 warn |
| 非 PublicOpinion 隔离 | 保留“大玩家 / 原型”、220px、搜索框和 5px 圆点 |

## 缓存复验

- 首轮真实浏览器发现无版本 CSS 命中旧缓存，实际仍显示旧 220px 侧栏。
- 六页资源引用增加 `v=200` 后重新打开页面，计算样式均为 232px、`rgb(24, 36, 53)`。
- 六页 active、Console 和横向溢出重新逐页复验通过。

## 静态验证

- `node --check`：PASS。
- `git diff --check`：PASS。
- 资源引用检查：六页均唯一引用 `sidebar.css?v=200`、`sidebar-data.js?v=200`、`sidebar.js?v=200`。

## 独立测试负责人复验（2026-09-17）

结论：**PASS**。

- 六页外网强刷均实际加载 `sidebar-data.js?v=200`、`sidebar.js?v=200`、`sidebar.css?v=200`。
- 桌面计算样式为 `232px`、`rgb(24, 36, 53)`；品牌文案为“舆情分析系统 / OPERATION CENTER”。
- 仅“分析 / 采集”作视觉分组，六个入口均使用一个线性 SVG 图标，`active` 唯一；没有搜索框、圆点或健康状态元素。
- 菜单高度为 `42px`。普通态文字 `rgb(174, 189, 208)` 相对 `#182435` 的对比度为 `8.19:1`，超过 `4.5:1` 门槛；鼠标 hover 与键盘 Tab 焦点均显示专属状态。
- 六页在 1440、1280、390px 无横向溢出；390px 下侧栏按移动布局占满上方可滚动区。
- 六页区域切换、刷新、侧栏跳转、后退/前进均保留有效 `regionCode/communityId/platform`。
- 非 PublicOpinion 页 `admin/community/BadgeManage.html` 保持 `220px`、“大玩家 / 原型”、搜索框和圆点（22 个），不含舆情专属品牌。
- 六页和非 PublicOpinion 页 Console `error/warning=0`，舆情 API 5xx=0。

截图归档：

`C:\\Users\\Administrator\\AppData\\Roaming\\Code\\User\\project manage\\bigPlayer\\public-opinion-system\\.tests\\2026-09\\2026-09-17\\v201_dark_sidebar_screenshots\\`
