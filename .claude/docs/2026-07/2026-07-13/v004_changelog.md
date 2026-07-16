# v004 变更文档 — C 端 chat.html 改版为 Messenger 风格手机 UI

日期：2026-07-13

C 端匿名对话页（`aiCompanion/web/chat.html`）从 antd 5 桌面卡片风改版为 Facebook Messenger 风格的手机聊天界面：桌面预览固定 375×812 手机视口；header 增加返回键与 📞📹ⓘ 操作图标；用户气泡改为蓝紫渐变（18px 圆角带小尾巴）、bot 气泡浅灰并带小圆头像（取机器人名首字）；输入栏改为 Messenger 式 ✚📷🎤 图标 + 灰色胶囊输入框 + 蓝色发送键。涉及文件：`chat.html`、`css/style.css`（chat 段）、`js/chat.js`（appendMsg/appendThinking 增加头像行结构）。B 端 sessions.js 内嵌消息展示复用 `.msg/.bubble` 类，自动获得同款气泡样式。
