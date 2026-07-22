# v007 变更记录

## 变更内容

- C 端聊天输入框支持单附件发送：用户现在可以先上传 `1` 张图片或 `1` 个视频，再输入文本，一次性提交给机器人。
- 前端重建 `web/js/chat.js` 的发送链路，支持：
  - 图片 / 视频单附件校验与预览
  - 视频首帧本地提取为预览图
  - `multipart/form-data` 发送到 `/api/public/chat`
  - SSE 阶段状态展示与错误提示
- 后端 `POST /api/public/chat` 新增单附件接收与解析：
  - `multer` 落盘上传
  - 图片 / 视频类型与大小限制
  - 视频预览帧校验
  - 调用多模态分析得到附件摘要与标签
- 聊天主流程新增媒体上下文接线：
  - 原始用户文本仍按原文入库
  - 模型侧会把“用户文本 + 附件识别摘要”合并理解
  - 系统提示词中显式注入附件内容概括，避免只按文字回复
- 补齐连续追问相关 helper 导出与判断，修复 `chatService.followup` 回归测试依赖缺失问题。
- 新增 `server/test/chatMediaPrompt.test.js`，覆盖媒体摘要拼装、增强查询生成、系统提示词注入顺序。
- `server/package.json` 新增脚本：`npm run test:chat-media`

## 验证

- `node --check server/src/services/chatService.js`
- `node --check server/src/routes/public.js`
- `node --check server/src/services/chatMediaService.js`
- `node --check web/js/chat.js`
- `npm run test:followup`
- `npm run test:chat-media`
- 在线烟测：
  - `http://127.0.0.1:3100/api/ping` 返回正常
  - `http://127.0.0.1:8080/admin.html` 返回 `200`
  - `http://127.0.0.1:8080/chat.html?versionId=1` 返回 `200`
