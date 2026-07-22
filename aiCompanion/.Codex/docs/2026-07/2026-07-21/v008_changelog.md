# v008 changelog

## 日期
2026-07-21

## 变更概述
- 修复 `巅峰竞技场攻略` 这类标题型知识问题在 C 端被翻译表、快速上手碎片抢答的问题。
- 收紧标题命中后的同篇文章保留逻辑，避免命中到标题后又把正文段落丢掉。
- 命中整篇文章时，优先将整理后的知识草稿交给 AI 重写，降低碎片上下文导致的乱答。

## 具体修改
- `server/src/services/ragContext.js`
  - 放宽 `hasTitleStyleMatch()`，支持 `中文标题 / English Title` 这类双语标题行。
- `server/src/services/chatService.js`
  - 新增知识条目 `Sheet/Row` 定位解析，用于保留标题附近的同篇正文行。
  - 新增翻译对照/术语表识别，过滤 `项目/中文/英文/日语` 这类无正文内容的干扰条目。
  - `filterRefsForAnswer()` 在命中标题后优先收敛到同篇文章，而不是继续混入别的 sheet 的碎片。
  - `handleChat()` 在命中整篇知识文章时，优先走 `literalKnowledgeReply -> AI polish` 路径。
- `server/test/chatService.test.js`
  - 新增 `巅峰竞技场攻略` 回归测试。
- `server/test/ragContext.test.js`
  - 新增双语标题行命中测试。

## 验证
- `node server/test/chatService.test.js`
- `node server/test/ragContext.test.js`
