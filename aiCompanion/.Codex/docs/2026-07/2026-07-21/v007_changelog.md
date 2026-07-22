# v007 changelog

## 日期
2026-07-21

## 变更概述
- 修复 Excel 知识库中“标题型条目”被回答过滤阶段误伤的问题。
- 修复图标/素材/网盘类噪音条目误入知识回答的问题。
- 清理 literal knowledge reply 中泄漏的 `Sheet:` 元数据行。

## 具体修改
- `server/src/services/chatService.js`
  - `filterRefsForAnswer()` 新增标题命中优先排序，避免标题行被 `metadataPenalty` 过滤掉。
  - 扩充 `isKnownPlanningOrUiNoiseRef()`，过滤 `icon id`、`ID查询网盘`、`研发素材`、`UI素材` 等非知识内容。
  - `getLiteralKnowledgeReply()` 允许标题命中行参与拼装，并保留标题后续正文。
  - `shouldKeepKnowledgeHeadingLine()` 不再把 `Sheet:` 保留到最终回答文本中。
- `server/test/chatService.test.js`
  - 新增“新手竞技场攻略”回归测试，覆盖标题保留、素材噪音过滤、元数据去除。

## 验证
- `node server/test/chatService.test.js`
- `node server/test/ragContext.test.js`
- 手工验证 `新手竞技场攻略` 检索链：
  - 过滤后结果包含标题行 `10493`
  - 图标素材噪音行 `10555` 被排除
  - literal reply 以标题行开头，不再包含 `Sheet:`
