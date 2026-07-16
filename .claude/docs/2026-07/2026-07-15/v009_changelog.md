# v009 变更文档 — C 端 chat.html Markdown 富文本样式改为方案 A（紧凑卡片风）

日期：2026-07-15

v008 上线的 markdown 富文本渲染此前用的是"方案 B · 聊天摘要风"（紫色小节文字+虚线米色引用+星级摘要行）。本次改为"方案 A · 紧凑卡片风"：标题变左侧蓝色竖条小标签、粗体保持纯黑加粗（不再加淡蓝底高亮）、引用块保留左侧蓝色竖线（白底）、列表项加绿色✓勾选图标、表格改回真实 `<table>`（蓝底白字表头，而非之前拆成的星级摘要行）。仅涉及样式层面调整：`web/js/chat.js` 的表格解析分支从"拆表头生成 rating-row"改为"生成完整 thead/tbody"；`web/css/style.css` 中 `.bubble.md` 系列选择器全部替换为方案 A 对应样式。解析器结构（`renderMarkdown`/`inlineMd`/`parseHeroCard`）与英雄卡片渲染逻辑未改动，混合场景（markdown+herocard）验证共存正常。
