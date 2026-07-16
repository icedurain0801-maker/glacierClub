# v001 changelog

## 时间
- 2026-07-15

## 变更范围
- C 端聊天英雄详情卡片
- 后端英雄详情结构化取数
- 聊天页英雄卡片样式优化

## 本次改动
- 新增 `server/src/services/heroCardService.js`
  - 识别英雄详情类提问
  - 从知识库 `英雄档案list` 与对应详情 sheet 直接构建英雄卡片数据
  - 返回固定 `herocard` 结构，包含头像、名称、阵营、职业、稀有度、四个技能、技能图、英雄台词
- 更新 `server/src/services/chatService.js`
  - 在通用 RAG/LLM 之前优先处理英雄详情卡片请求
  - 英雄卡片回复不再附带 refs
- 更新 `web/js/chat.js`
  - 扩展 `herocard` 渲染结构
  - 支持头像、稀有度、阵营/职业、四技能图文、英雄台词展示
  - 英雄卡片场景下隐藏额外 refs 与 refs 图片
- 更新 `web/css/style.css`
  - 重做英雄卡片视觉样式
  - 提升信息层级与文字可读性
- 新增 `server/test/heroCardService.test.js`
  - 覆盖英雄别名识别、技能图 fallback、卡片字段构建
- 更新 `server/src/services/heroCardService.js`
  - 技能描述改为只保留基础效果
  - 兼容同一单元格内“基础效果 + 升星/追加效果”混排的 Excel 明细
  - 移除返回载荷中的内部优先级字段
- 更新 `server/test/heroCardService.test.js`
  - 新增基础效果截断用例
  - 覆盖真实技能明细混排行为

## 验证结果
- `node server/test/heroCardService.test.js` 通过
- `node server/test/liveTools.test.js` 通过
- `node server/test/ragContext.test.js` 通过
- 本地接口验证：
  - `POST /api/public/chat` 发送“介绍一下薇珀”可返回 `herocard`
  - 四个技能描述均只保留基础效果，不再包含额外/升星段落
- 本地页面验证：
  - `http://localhost:8080/chat.html?versionId=1` 可展示薇珀英雄卡片
  - 卡片中包含 4 个技能项、5 张图片（头像 1 + 技能图 4）
