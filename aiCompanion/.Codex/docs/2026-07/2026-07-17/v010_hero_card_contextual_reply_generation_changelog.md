# v010 Hero Card Contextual Reply Generation

## 变更概述

- 英雄卡片回复改为统一走 `chatService` 的上下文生成链路，不再在 `heroCardService` 内拼固定开场白和固定“整体评价”模板。
- 当用户先查看英雄卡片、再继续追问“值不值得练 / 你觉得咋样 / 厉害吗 / 职业呢 / 台词呢 / 技能1呢”这类问题时，回复会继续沿用当前英雄上下文。
- 英雄卡片展示仍保留 `herocard` 结构化 block，但可见文本现在会直接回答当轮问题，并结合最近对话衔接，不再机械复述“这是 XX 的英雄档案”。

## 实现调整

- `server/src/services/heroCardService.js`
  - 保留英雄识别、历史上下文承接、字段查询、技能查询、结构化卡片载荷生成。
  - 删除旧的模板文案拼接函数及对应测试导出，避免继续产出固定前缀型回复。

- `server/src/services/chatService.js`
  - 新增英雄卡片上下文生成辅助逻辑：
    - 读取最近对话
    - 整理英雄事实约束
    - 调用模型生成自然回复
    - 在回复后追加 `herocard` block
  - 约束模型：
    - 必须直接回答当前问题
    - 必须和最近对话保持连续
    - 不得编造英雄事实
    - 不得使用固定卡片引导语

## 验证

- `node --check server/src/services/heroCardService.js`
- `node --check server/src/services/chatService.js`
- `node --check server/test/heroCardService.test.js`
- `node --check server/test/chatService.test.js`
- `node server/test/heroCardService.test.js`
- `node server/test/chatService.test.js`
- `GET http://127.0.0.1:3100/api/ping`
