# v008 实时聊天首条回复延迟优化

## 变更时间
- 2026-07-17

## 变更内容
- 调整 C 端实时聊天 SSE 链路，在首条可用回复生成后直接返回前端展示。
- 为 `chatService.handleChat` 增加 `skipPolish` 参数，仅在实时聊天场景下跳过二次 AI 润色。
- 保留消息入库、引用处理、对话质量评分入队逻辑，不影响后台评分模块和非实时接口。

## 涉及文件
- `server/src/services/chatService.js`
- `server/src/routes/public.js`

## 原因说明
- 之前 C 端聊天会在主回复生成后继续执行一次 `polishReplyThroughAi()` 二次改写。
- 前端只在 SSE `done` 事件时渲染机器人回复，因此用户会感知到“回答慢半拍”。

## 本次处理结果
- C 端实时聊天改为先显示首条可用回复，减少首屏等待时间。
- 后台管理、脚本测试、非 SSE 接口仍保持原有润色链路。

## 验证
- `node --check server/src/services/chatService.js`
- `node --check server/src/routes/public.js`
- `http://127.0.0.1:3100/api/ping` 返回正常
