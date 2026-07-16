# v012 changelog

## 本次变更

- 调整聊天链路里的联网搜索触发规则。
- 当知识库未命中，且用户输入是短实体词/主题词时，也会触发联网搜索兜底，不再只对完整问句触发。
- 典型覆盖场景：
  - `马斯克`
  - `OpenAI o3`
  - 其他“只有一个主题名，但用户显然在问这个对象是什么”的输入

## 验证

- 补充 `server/test/liveTools.test.js`
- 新增对 `isStandaloneSearchTopic` 和 `shouldUseWebSearch('马斯克')` 的断言
