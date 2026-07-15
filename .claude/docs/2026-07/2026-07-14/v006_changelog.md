# v006 变更文档 — C 端 chat.html 输入栏改为两行布局

日期：2026-07-14

底部输入栏由"图标+输入框+发送键"单行布局改为两行：第一行输入框独占并跟随发送键（Instagram 风），第二行放 ✚📷🎤😊 工具图标。涉及文件：`chat.html`（`.chat-input` 拆分为 `.chat-input-row1`/`.chat-input-row2`）、`css/style.css`（对应新增两行 flex 布局样式）。`chat.js` 按 ID 引用 `#chat-input`/`#chat-send`，结构调整无需改动。
