# v012 变更文档 — C 端 chat.html 输入框隐藏滚动条 + Markdown 表格窄屏横滚适配

日期：2026-07-15

**输入框滑动条**：`.chat-input textarea` 原生上下滚动条在窄屏下显得多余、不美观，新增 `scrollbar-width: none` / `-ms-overflow-style: none` / `::-webkit-scrollbar{width:0;height:0}` 隐藏，输入框仍可正常多行滚动，只是不再显示滚动条。

**Markdown 列表勾选图标**：`.msg.bot .bubble.md li::before` 原来是绿色 `✓` 对号，容易让人误以为是"已验证/已完成"状态标记，改为中性蓝色小圆点（与气泡强调色 `#0084ff` 一致）。

**Markdown 表格窄屏断行问题**（出 3 个方案给用户选，选定方案A）：列数多、内容短的表格（如"当地时间 18:00 | 北京时间 23:00"）在 375px 窄屏气泡里被压缩到每列几十像素宽，导致数字从中间被截断换行（"18:0" + "0"）。方案A - 横向滚动表格：保留原有 `<table>` 语义不变，给单元格加 `white-space: nowrap` 禁止内容断行，外层套一个可横向滚动的容器 `.md-table-scroll`，超宽时整张表可以左右滑动，并在下方加一行 "⇔ 左右滑动查看完整表格" 提示。改动集中在样式层，未改变 `renderMarkdown()` 解析表格的逻辑，只是给输出的 `<table>` 多包一层 `<div class="md-table-scroll">` 并追加提示 `<div>`。

涉及文件：
- `web/js/chat.js` — `renderMarkdown()` 中表格渲染分支：输出包裹 `<div class="md-table-scroll">...</div>` + `<div class="md-scroll-hint">`
- `web/css/style.css` — `.chat-input textarea` 新增隐藏滚动条规则；`.msg.bot .bubble.md li::before` 图标改为圆点；`.msg.bot .bubble.md table/th/td` 系列规则替换为横向滚动容器 `.md-table-scroll` + `nowrap` 单元格 + `.md-scroll-hint` 提示样式

验证方式：用真实的 `renderMarkdown()` 函数和真实 CSS 在 375px 移动端视口下渲染世界杯决赛时间的原问题案例，确认 `18:00`/`23:00` 不再被截断换行；并通过 `getComputedStyle` 校验输入框 `scrollbarWidth: none` 生效、列表 `::before` 已替换为圆点样式。
