# v013 变更文档 — C 端 chat.html 页面背景改为深空粒子星域科技动效

日期：2026-07-16

用户反馈 chat.html 外层页面背景（纯色浅灰）太空、没有设计感，出 6 个方案（粒子星域/极光渐变/透视网格扫描/流体网格光斑/电路板流光/上升浮尘粒子）对比后选定**方案1 · 深空粒子星域**：

- 深蓝黑径向渐变打底（`radial-gradient(ellipse at 30% 20%, #131b33 0%, #060810 55%, #030408 100%)`）
- Canvas 绘制约 90 个缓慢漂浮的光点粒子，邻近粒子（<110px）之间自动画出半透明连线（`rgba(0,132,255,...)`），呈现"神经网络/星链"科技感
- 聊天窗口本身（白色卡片、蓝色 `#0084ff` 强调色）完全不变，背景动效在其下层（`z-index:0`），聊天卡片在上层（`z-index:1`）
- 尊重 `prefers-reduced-motion: reduce` 系统偏好：命中时只绘制一帧静态粒子，不做逐帧动画
- 页面切到后台标签（`visibilitychange` → `document.hidden`）时暂停动画循环，避免不必要的性能消耗；`resize` 做了防抖（200ms）重新计算粒子数量和画布尺寸

涉及文件：
- `web/chat.html` — `<body>` 内新增 `<canvas class="chat-page-bg" id="chat-page-bg">`，作为背景动效画布
- `web/css/style.css` — `.chat-page` 背景改为深空径向渐变，新增 `.chat-page-bg`（绝对定位铺满、`z-index:0`）；`.chat-shell` 加 `position:relative; z-index:1` 确保聊天卡片在动效之上
- `web/js/chat.js` — 文件末尾新增自执行的 `initPageBg()`：初始化 canvas、按屏幕面积动态计算粒子数量（上限 90 个）、每帧更新粒子位置+连线绘制，处理 resize/visibilitychange/reduced-motion

验证方式：在真实的 `chat.html`（通过本地静态服务器指向 `aiCompanion/web` 目录）中加载，截图确认粒子网络背景在聊天卡片周围正确渲染，卡片本身样式/内容未受影响；`node --check` 验证 JS 语法。
