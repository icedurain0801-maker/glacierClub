# v003 变更记录

## 变更内容

- 修复 C 端聊天中弱相关知识图片误展示问题：普通文本问答不再默认把命中知识条目的配图直接挂到回复下方。
- 收紧 RAG 弱命中过滤规则：对“英雄台词”“素材图”“角色背景版/版式说明”等弱相关素材型条目增加抑制，避免因词面重叠混入当前问题。
- 新增回归测试，覆盖“玩法问题误召回台词配图条目”的场景。

## 验证

- `node server/test/ragContext.test.js`
- `node --check server/src/services/ragContext.js`
- `node --check web/js/chat.js`
- 用 `ragContext.retrieve(1, "圣武好像一直处于下风怎么办", 8)` 复查，当前不再返回 `#9443`
