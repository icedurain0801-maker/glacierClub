# v008 变更文档 — C 端 chat.html AI 回复支持 Markdown 富文本渲染

日期：2026-07-15

AI 回复不再原样显示 markdown 符号（`#`/`**`/`|---|`/`>`/`-`/`---`），改为轻量解析后渲染成"聊天摘要风"富文本（方案 B）：标题去符号感、改为紫色小节文字融入对话流；粗体转淡蓝底高亮；引用块转虚线边框米色提示卡；列表转紫色圆点；表格转两端对齐的星级摘要行；分隔线转渐变细线。涉及文件：`web/js/chat.js`（新增 `inlineMd`/`renderMarkdown` 解析器，`appendMsg` 中 bot 文本改用 `renderMarkdown` 而非 `escapeHtml` 直出）、`web/css/style.css`（新增 `.bubble.md` 系列样式，`.msg .bubble` 拆出 `white-space: pre-wrap` 例外规则避免与 `<p>`/`<br>` 排版冲突）。渲染器为轻量正则解析，非完整 CommonMark 实现，仅覆盖 LLM 常见输出结构；与此前上线的英雄卡片（```herocard```代码块）解析共存不冲突。
