# v001 Changelog

## Answer Post-processing

- 收紧 `server/src/services/chatService.js` 里知识库命中回答的后处理，补充回答清洗逻辑。
- 补充 `server/test/chatService.test.js` 回归用例，覆盖中文/英文回答清洗与泛化追问收尾裁剪。
- 本地验证：
  - `node server/test/chatService.test.js`
  - `node server/test/ragContext.test.js`
  - `node server/test/liveTools.test.js`

## Follow-up Context Fix

- 收紧 `server/src/services/chatService.js` 的通用追问承接：
  - 仅对代词、短省略追问做上下文继承，避免串题。
  - 从最近用户问题中提取明确主题词，并将 `他是几人的游戏` 这类问题改写成完整问句后再用于检索和生成。
  - 当 KB / KG 都未命中时，新增已消歧追问的轻量兜底回复链，避免再次反问用户“他是谁”。
- 封掉脏知识直出：
  - 将 `icon的图标ID`、资源 ID、纯图标说明识别为垃圾知识行。
  - 在 ref 过滤、direct knowledge reply、literal knowledge reply 三层一起拦截，避免命中后直接乱答。
- 补充 `server/test/chatService.test.js` 回归用例，覆盖：
  - 垃圾 `icon` 行不再进入回答。
  - `你知道王者荣耀吗` -> `他是几人的游戏` 的通用承接改写。
- 本地验证：
  - `node server/test/chatService.test.js`
  - `node server/test/ragContext.test.js`
  - `node server/test/liveTools.test.js`
  - 实际请求 `POST /api/public/chat` 验证：
    - 首问：`你知道王者荣耀吗`
    - 追问：`他是几人的游戏`
    - 当前返回：`王者荣耀是5对5的游戏，即每队5人，共10人参与一场对战。`
# v001 Changelog

## Non-game Routing Fix

- 调整 `server/src/services/chatService.js` 的主路由，先判断当前问题是否属于游戏域，再决定是否使用知识库 / 图谱内容。
- 非游戏问题不再被游戏知识库、英雄卡、版本上下文污染；有实时需求时优先联网搜索，没有实时需求时走普通自然回答。
- 新增“搜索失败后的短追问承接”，像“这也不知道吗”“再查一下”“不是能联网吗”会自动继承上一条真实问题继续搜索。
- `buildMessages(...)` 新增通用域提示词模式，非游戏问题会去掉当前游戏版本上下文，避免普通问题被答成游戏话术。
- 补充 `server/test/chatService.test.js` 回归用例，覆盖非游戏问题识别、搜索失败追问承接、非游戏提示词隔离。
- 本地验证：
  - `node server/test/chatService.test.js`
  - `node -e "require('./server/src/services/chatService')"`

## Hero Context Carryover Fix

- Adjusted `server/src/services/heroCardService.js` so hero follow-up resolution can inherit the current hero from recent assistant replies, not only recent user messages.
- Added parsing for:
  - fenced ````herocard```` payloads
  - recent hero skill reply headers like `卡西迪「极速奇袭」`
- Follow-up questions such as `这个英雄怎么样` now keep the current hero context after a hero card response instead of falling through to unrelated alias mapping content.
- Added regression assertions in `server/test/heroCardService.test.js` for:
  - `shouldCarryHeroFromHistory('这个英雄怎么样')`
  - extracting hero names from assistant `herocard` replies
  - extracting hero names from assistant skill replies
- Local verification:
  - `node server/test/chatService.test.js`
  - `node -e "const svc=require('./server/src/services/heroCardService'); const t=svc.__test__; console.log(t.shouldCarryHeroFromHistory('这个英雄怎么样')); console.log(t.extractHeroNameFromAssistantReply('这是卡西迪的英雄档案，头像、阵营、稀有度、技能和英雄台词都在下面。\\n\\n```herocard\\n{\"name\":\"卡西迪\",\"skills\":[]}\\n```'));"`
  - `node server/test/heroCardService.test.js` still has the pre-existing `selectCareerIcon(...)` fixture failure and is unrelated to this carryover fix.

## Context Carryover Guardrail

- Broadened generic follow-up carryover in `server/src/services/chatService.js` so constraint-style追问会继承上一轮主题，而不是被当成新问题。
- Tightened KB answer gating so unrelated refs cannot survive the final answer filter for compound follow-up queries.
- Added regression coverage in `server/test/chatService.test.js` for:
  - `给我推荐一下深圳的露营地` -> `有没有6个人的，下雨天也能露营的地方`
  - unrelated game KB snippets must not be returned for that follow-up
- Local verification:
  - `node server/test/chatService.test.js`
  - `node -e "require('./server/src/services/chatService')"`

## Hero Skill Aggregate Follow-up Fix

- 调整 `server/src/services/heroCardService.js`：
  - 新增 `isAllSkillsQuery(...)`，识别“所有技能/全部技能/all skills”这类聚合追问。
  - 当问题是“所有技能的X星效果”时，不再复用上一轮单技能上下文，直接走全技能升星效果汇总回答。
- 补充 `server/test/heroCardService.test.js` 的识别用例，覆盖：
  - `所有技能的二星效果呢`
  - `她的技能二星效果咋样`
- 本地验证：
  - `node server/test/chatService.test.js`
  - `node -e "require('./server/src/services/heroCardService')"`
  - 定向校验：`所有技能的二星效果呢` 不再承接上一条单技能上下文

## Knowledge Reply Relevance Guard

- 调整 `server/src/services/chatService.js`：
  - 去掉知识库命中后的原文直出旁路，命中知识内容后也继续走模型整理，不再把 sheet / 项目 / 多语言原始行直接返回给玩家。
  - 新增问题意图与字段类型对齐过滤：问英雄整体表现时，台词/语音类字段不再被当作可回答依据；只有技能、定位、职业、阵营、稀有度、简介、阵容等相关字段才允许进入答案上下文。
  - 在系统提示中补充约束：回答必须和当前问题直接相关，不能拿不相干的知识字段凑答案。
- 补充 `server/test/chatService.test.js` 回归用例，覆盖：
  - `索尼克这个英雄咋样` 不能用“英雄台词”字段作答
  - 同问题命中职业/技能字段时可以保留参考
- 本地验证：
  - `node server/test/chatService.test.js`
  - `node -e "require('./server/src/services/chatService')"`
