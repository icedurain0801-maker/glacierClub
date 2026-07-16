# v009 changelog

## 背景
- C 端机器人在知识不足或未完全命中时，容易先输出空洞铺垫，例如“这是个很核心的问题”“我能确认的是”，影响回答质量。

## 本次修改
- `server/src/services/chatService.js`
  - 新增直接回答约束，要求先给结论。
  - 明确禁止“这是个很核心的问题”“不过当前知识库还没完全收录”“我能确认的是”“我不敢给你乱讲”这类废话开头。
  - 要求信息不足时直接说缺哪部分，不再先解释内部判断过程。
- `server/prompts/c-end-robot-constraints.md`
  - 重写为干净 UTF-8 版本。
  - 将“知道什么说什么”的规则写入全局 C 端机器人约束，供所有版本统一遵循。

## 验证
- `node --check server/src/services/chatService.js`
- 重启后端后，`http://localhost:3100/api/ping` 返回正常。
