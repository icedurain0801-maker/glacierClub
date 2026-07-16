# v008 changelog

## 背景
- C 端聊天消息里的超链接只显示成普通文本，用户无法直接点击跳转。

## 本次修改
- `web/js/chat.js`
  - 新增 `renderInline`，支持两类链接：
    - 裸链：`https://...` / `www...`
    - Markdown 链接：`[标题](https://...)`
  - 链接统一输出为新窗口打开，带 `rel="noopener noreferrer"`。
- `web/css/style.css`
  - 补充聊天正文链接样式和 hover 状态。
- `web/chat.html`
  - 更新静态资源版本号，降低浏览器缓存导致旧脚本不生效的概率。

## 验证
- `node --check web/js/chat.js`
