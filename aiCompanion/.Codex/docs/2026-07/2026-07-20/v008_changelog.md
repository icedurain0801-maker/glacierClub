# v008 变更记录

## 变更内容

- 调整 C 端聊天输入区附件预览位置：已选图片 / 视频缩略标签从输入区底部移动到输入框上方展示。
- 保持状态提示区仍位于工具按钮下方，不影响原有发送状态与错误提示展示。
- 优化附件标签宽度约束，长文件名在单行内省略，避免撑破输入区布局。

## 验证

- `http://127.0.0.1:8080/chat.html?versionId=1` 返回 `200`
- 检查 `web/chat.html` 输入区 DOM 顺序：
  - `emoji-panel`
  - `chat-input-preview`
  - `chat-input-row1`
  - `chat-input-row2`
  - `chat-input-status`
