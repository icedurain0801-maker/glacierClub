# v005 变更文档 — C 端 chat.html「思考中」状态改版为通用俏皮款

日期：2026-07-14

C 端匿名对话页的"思考中"加载态从纯文字（"思考中…"）改为动态阶段提示：粉紫渐变气泡 + bot 头像左右摇摆动画，图标与文案每 1.8s 轮换（🔍查询资料中 → 📚整合资料中 → ✍️梳理回答中）。文案不含任何具体人设名称（如"妲己"），因机器人人设由后台按 versionId 配置，需保持通用。涉及文件：`css/style.css`（新增 `.msg-line.thinking`/`.thinking-text`/`.thinking-icon` 动画）、`js/chat.js`（`appendThinking` 改为轮换阶段 + `setInterval`，新增 `removeThinking` 负责清理定时器）。
