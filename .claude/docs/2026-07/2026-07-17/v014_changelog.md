# v014 变更文档 — C 端 chat.html 页面背景改为海盗船长沙滩插画(替代深空粒子星域)

日期：2026-07-17

用户提供了一张 Last Light 海盗船长三人组沙滩场景插画，参考 Blablalink 社区首页"沙滩背景 + 角色铺开"的构图风格，要求把 chat.html 之前的深空粒子星域动效背景替换成这张沙滩插画：

- 图片素材保存至 `web/images/chat-page-bg.jpg`（原图为 2.5MB PNG，转 JPEG quality=85 后压缩到约 400KB，避免页面加载过重）
- `.chat-page` 背景由 Canvas 粒子星域动效改为静态背景图（`background: url('../images/chat-page-bg.jpg') center center / cover no-repeat`），按用户选择去掉了原有的星链粒子叠加动效，只保留沙滩图本身
- 移除 `chat.html` 中不再使用的 `<canvas class="chat-page-bg">` 元素
- 移除 `chat.js` 文件末尾整段 `initPageBg()` IIFE（Canvas 粒子绘制、resize 防抖、visibilitychange 暂停逻辑），聊天窗口本身样式与交互不受影响

涉及文件：
- `web/images/chat-page-bg.jpg`（新增）— 沙滩背景图
- `web/chat.html` — 移除 `<canvas id="chat-page-bg">`
- `web/css/style.css` — `.chat-page` 背景改为图片，移除 `.chat-page-bg` 相关定位样式
- `web/js/chat.js` — 移除 `initPageBg()` 粒子动效函数

验证方式：本地静态服务器加载真实 `chat.html`，截图确认沙滩背景图正确铺满页面、聊天卡片样式与交互未受影响，无残留的粒子动效或 canvas 元素。
