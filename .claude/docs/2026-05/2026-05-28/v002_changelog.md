# v002 Changelog · 2026-05-28

## .temp/admin-prototype/ · Club 后台原型样本（HTML 版）

源：`bigPlayer/admin-new/club/` 下的 React + TS 源码。
目标：把后台 UI 翻译为可直接在浏览器打开 + 手改的 HTML 原型，供需求/设计评审用。

### 本次产出（2 个样本页）
- `index.html` — 后台原型索引（卡片入口）
- `pages/topic.html` — 对应 `club/topic/index.tsx`，含 Record/Audit 双 Tab、过滤器、列表、批量审核、新增/编辑 Modal
- `pages/banner.html` — 对应 `club/banner/list/`，含双 Tab、排序占位、上下架开关、时间区间筛选、新增/编辑/审核 Modal
- `css/admin.css` — 三栏外壳 + Tab + 过滤器 + 表格 + Modal + 按钮 + 分页，纯手写
- `js/admin.js` — 仅 Tab 切换、Modal 开关、Switch/Checkbox 切换、占位 Toast

### 关键决策
- 放在 `.temp/` 而非 `bigPlayer/` 正式目录，遵循「所有项目目录写入门控规则」。
- 不引 Antd CDN，不引任何前端框架，仿 Antd 外观但完全独立可改样式。
- 所有按钮通过 `data-action` 触发占位 Toast；Tab/Modal/Switch/Checkbox 用 `data-*` 属性纯声明绑定。

### 待用户确认
- 看 1–2 个样本效果后决定：是否继续把剩余 13 个模块翻译完；是否搬到 `bigPlayer/admin-prototype/` 正式目录。

### 打开方式
```
直接双击 .temp/admin-prototype/index.html
或
cd .temp/admin-prototype && python -m http.server 8081
```
