# v007 变更文档 — C 端 chat.html 支持英雄卡片渲染

日期：2026-07-14

玩家询问某英雄具体介绍时，AI 回复改为渐变彩边卡片展示（头像/名称/阵营/稀有度星级/技能列表/台词），配色为通用金/灰色调（不限定单一英雄主题色）。协议：`chatService.js` 在 persona 后追加 `HERO_CARD_INSTRUCTION` 通用指令，要求 LLM 在识别到英雄介绍类问题时于自然语言回答后附加 \`\`\`herocard JSON 代码块；`chat.js` 新增 `parseHeroCard`/`renderHeroCard`，解析该代码块渲染卡片，JSON 不合法或无代码块时原样展示文本兜底，不丢内容。涉及文件：`server/src/services/chatService.js`（新增指令拼接）、`web/js/chat.js`（新增解析+渲染逻辑）、`web/css/style.css`（新增 `.hero-card` 系列样式）。B 端 sessions.js 会话详情展示未做改动，仍为原始文本。
