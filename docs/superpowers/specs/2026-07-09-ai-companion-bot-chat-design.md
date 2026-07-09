# AI 陪伴机器人 · 子项目3：机器人 + 会话 + C 端对话 设计文档

日期：2026-07-09
状态：已通过设计评审，待用户 review

## 背景

AI 陪伴机器人大需求的最后一个子项目。子项目1(多版本+鉴权地基，`aiCompanion/server`)和子项目2(知识库摄取，含 embedding/vectorStore/kb 路由)已完成、上线、跑通所有集成测试。本子项目把地基和知识库串成一个能真跑的产品：C 端用户匿名对话，机器人挂 RAG 从当前版本知识库拿上下文回答，B 端配置机器人人设、看会话记录。

在现有 `aiCompanion/` 上继续扩展，不新建服务，不引入 npm 包，不引入队列/流式。

## 已确认的关键决策（来自 brainstorming）

- **C 端入口**：匿名使用。前端生成 `sessionKey`(crypto.randomUUID) 存 localStorage 关联会话；不需要账号。
- **机器人数量**：一个游戏版本一个机器人。数据库 UNIQUE(version_id) 约束强制。
- **LLM 服务**：单独 `services/llm.js`，仿 embedding.js 风格(fetch + 重试 + 可测试替换)。新环境变量 `LLM_API_URL / LLM_API_KEY / LLM_MODEL`。
- **RAG**：挂。C 端每次对话前调 vectorStore 检索当前版本知识库 top-K 条目，塞进 system prompt。
- **技术栈延续**：Express + MySQL + 原生 HTML/CSS/JS。不用队列、不用流式、不用 SSE/WebSocket。

## 整体架构

```
[C 端 chat.html] 匿名，前端生成 sessionKey 存 localStorage
   ↓ POST /api/public/chat  {versionId, sessionKey, message}
[后端]
   1. 查/建 chat_sessions(version_id, session_key)
   2. 存 user message → chat_messages
   3. 若机器人 rag_enabled: 调 embedding+vectorStore 检索 top_k 条目
   4. 拼 prompt: system(人设 + 参考知识) + 最近 N 条历史 + 本次 message
   5. 调 llm.chat(messages) 拿回复
   6. 存 assistant message → chat_messages (refs_json 记检索命中)
   7. 返回 {reply, refs:[{entryId, score, snippet}]}

[B 端后台]
   /机器人管理  → 当前版本机器人配置页
   /会话管理   → 当前版本会话列表 + 单会话消息详情
```

**关键设计点**：
1. C 端接口挂 `/api/public/*`，不经 auth 中间件；每接口自校验 versionId 存在且 status='active'。
2. 会话归属靠前端 sessionKey，不挂 user_id。同 key = 同会话；清 localStorage = 新会话。
3. 每版本一个机器人：`bots` 表 UNIQUE(version_id)；B 端配置页无列表/新建，就是编辑当前版本那一份。
4. RAG 内嵌函数调用：`require('./services/vectorStore')` + `require('./services/embedding')`，不发 HTTP 到自身。
5. 前端复用：B 端复用现有 admin.html 外壳，替换两个 placeholder；C 端全新 chat.html 独立。

**明确不做(YAGNI)**：
- 流式(SSE/WebSocket)回复——一次返回完整消息 + loading 就够
- 图谱在对话里参与——RAG 只用向量检索，图谱是后台展示用
- 多机器人/多角色/头像/表情包

## 数据模型 (migrations/004_bot_chat.sql)

新增 3 张业务表，全部带 `version_id`，经现有 tenantScope 隔离；删版本 CASCADE。

```
bots                                每版本一个机器人配置
  id, version_id UNIQUE,            -- 一版本一行，唯一约束
  persona TEXT,                     -- 人设(system prompt 主体)
  welcome VARCHAR(512),             -- 首句欢迎语
  rag_enabled TINYINT DEFAULT 1,    -- 是否 RAG
  rag_top_k INT DEFAULT 5,          -- RAG 检索条数(1-20)
  history_turns INT DEFAULT 10,     -- 送 LLM 的历史轮数(1-50)
  model VARCHAR(64) NULL,           -- LLM model 名(空则用 env 默认)
  updated_at

chat_sessions                       会话
  id, version_id,
  session_key VARCHAR(64),          -- 前端生成的 UUID
  title VARCHAR(128) NULL,          -- 首条用户消息截前 30 字
  message_count INT DEFAULT 0,
  created_at, updated_at
  UNIQUE(version_id, session_key)

chat_messages                       会话消息(user/assistant 交替)
  id, version_id, session_id,
  role VARCHAR(16),                 -- 'user' | 'assistant'
  content TEXT,
  refs_json JSON NULL,              -- assistant 消息附检索命中 [{entryId, score, snippet}]
  created_at
  INDEX(session_id, id)
```

关键说明：
1. `bots.UNIQUE(version_id)` 数据库层强制「每版本一个」；写入用 `INSERT ... ON DUPLICATE KEY UPDATE`(沿用 graphExtractor 的 upsertEntity 模式)。
2. session_key 前端生成，UNIQUE(version_id, session_key) 兜底。
3. title 用第一条 user message 截前 30 字自动填，方便后台会话列表识别。
4. refs_json 存本次回复引用的知识条目，C 端可显示「参考自」，后台可核查 RAG 效果。
5. **不建 users 外键**：C 端匿名，session 跟 user 无关。跟子项目 1 users 是分离分支。
6. 删除策略：删版本 → CASCADE 三张表；删会话 → CASCADE 删消息。

## API 接口

```
—— B 端(经 auth + version 中间件)——
GET    /api/bot                     → 当前版本机器人配置(不存在则返回默认值)
PUT    /api/bot                     → 保存机器人配置(upsert)
GET    /api/sessions                → 当前版本会话列表(分页，最新在前)
GET    /api/sessions/:id            → 单个会话详情 + 全部消息
DELETE /api/sessions/:id            → 删会话及消息

—— C 端(公开，不经 auth，只校验 versionId 存在)——
POST   /api/public/chat             {versionId, sessionKey, message}
                                    → {reply, refs:[{entryId, score, snippet}]}
GET    /api/public/bot?versionId=   → {welcome} 只返 C 端展示需要的
GET    /api/public/history?versionId=&sessionKey=&limit=50
                                    → 恢复历史消息(前端刷新页能延续)
```

设计要点：
- `/api/public/*` 是新分支，不挂 auth；每接口自校验 versionId 存在、status='active'。
- `/api/public/chat` 是核心：单请求走完 (查/建 session → 存 user msg → RAG → 拼 prompt → 调 LLM → 存 assistant msg → 返回)。同步返回。
- `/api/public/bot` 不返 persona 和 model——那是内部配置，不给 C 端看，只返 welcome 给会话开头。
- B 端 `PUT /api/bot` upsert 语义：一个接口搞定新建和更新。

## 后端文件结构

```
server/src/
  services/
    llm.js                # LLM chat 云 API 封装(fetch+重试+可测试替换，仿 embedding.js)
    ragContext.js         # 组合 embedding+vectorStore+entries 查询，返回 refs 列表
    chatService.js        # 编排：会话上下文查询、prompt 拼装、调 LLM、消息落库
  routes/
    bot.js                # B 端 /api/bot
    sessions.js           # B 端 /api/sessions
    public.js             # C 端 /api/public/*
migrations/004_bot_chat.sql # 3 张表
config/kb.js              # 追加 llm 配置块 (apiUrl/apiKey/model/retries/retryBaseMs)
.env.example              # 追加 LLM_API_URL / LLM_API_KEY / LLM_MODEL
test/chat.run.js          # 集成测试
```

依赖：不新增 npm 包，复用现有(fetch/mysql2/express)。

`app.js` 追加两行：挂 `/api/bot` `/api/sessions` `/api/public`。

## 前端文件

```
web/
  chat.html               # C 端入口页(全新)
  css/chat.css            # C 端样式(移动优先，375px 基准)
  js/chat.js              # C 端逻辑：sessionKey 管理、消息渲染、发送、历史恢复
  js/pages/bots.js        # 替换 bots 占位页 → 机器人配置页
  js/pages/sessions.js    # 替换 sessions 占位页 → 会话列表+详情
```

B 端复用现有 admin.html 外壳，替换两个 placeholder，同时把 `app.js` 的 navigate 加 bots/sessions 两条真实分支。

## 错误处理

**C 端 `/api/public/chat`**：
- versionId 无效 → 404 `版本不存在`
- message 空 → 400 `消息不能为空`
- sessionKey 空 → 400
- **LLM API 失败**(网络/key/超时) → 500 `AI 服务暂时不可用`，同时**回滚 user message**避免留孤儿
- **RAG 检索失败**(embedding 抖动) → 不中断，退化为「不带上下文的普通对话」，refs 返回空数组；error 记 console
- 单条消息长度上限 4KB(超了 400，不入库，防刷屏)

**B 端 `PUT /api/bot`**：
- persona、welcome 必填(400)
- rag_top_k 范围 1-20、history_turns 范围 1-50(超范围 400)
- upsert `INSERT ... ON DUPLICATE KEY UPDATE`，并发写不出问题

**B 端会话操作**：
- 会话 id 不存在或不属于当前版本 → 404
- 删会话 CASCADE 自动删消息

**LLM 服务**：
- 复用 embedding.js 重试模式(3 次退避)
- key 无效 → 抛具体错误
- `llm._setImpl(fn)` 提供测试注入

**RAG 上下文安全边界**：
- 检索结果不参与 SQL 拼接，只塞进 prompt 文本
- 单次 RAG 最多 top_k 条(≤20 硬上限)
- prompt 组装超过 8KB 会截断历史(先砍老消息保留新消息)

## 测试策略

沿用轻量风格：

**后端 `test/chat.run.js`**：
- 用**假 LLM 实现**(`llm._setImpl(async msgs => ({content: '回声:' + msgs[msgs.length-1].content}))`)
- 用假 embedding(沿用子项目 2 的确定性伪向量)
- 不依赖真云 API
- 覆盖：
  1. 超管登录 → `PUT /api/bot` 建机器人配置
  2. C 端 `/api/public/chat` 第一次：自动建 session，存 user+assistant 消息
  3. C 端第二次同 sessionKey：发现已有 session，历史累积
  4. RAG：先按子项目 2 流程上传一个知识文档，再对话验证 refs 非空且包含相关条目
  5. B 端 `GET /api/sessions` 列表看到该会话，`GET /api/sessions/:id` 拿到全部消息
  6. **版本隔离**：v1 sessionKey 在 v2 请求不复用(建新 session)
  7. LLM 失败时 user message 被回滚(mock 抛错验证)

**前端**：`node --check` 语法校验

## 验收标准

后台机器人页保存人设 → 打开 C 端 `chat.html?versionId=1` → 看到欢迎语 → 发问「妲己怎么克制」→ 看到回复 + 参考知识条目 → 刷新页面历史还在 → 后台会话页看到这条会话和全部消息 → 切版本发现独立 session。

## 与子项目 1/2 的衔接

- 所有新表带 version_id，读写经现有 tenantScope 层(或纯 SQL 加 WHERE version_id=?，沿用 kb 路由风格)。
- 复用现有 auth / version / requireSuperAdmin 中间件与 fail 错误 helper。
- 复用子项目 2 的 embedding 和 vectorStore 服务作为 RAG 底座——函数调用，不 HTTP。
- 数据库迁移新增 004_bot_chat.sql，沿用现有 migrations/run.js 机制。
- 后台外壳复用；C 端新页 chat.html 独立。

## 已知边界

- 单进程同步对话：一次 LLM 调用阻塞整个请求(通常 1-3 秒)。高并发场景需上流式或队列，本期不做。
- 历史窗口固定按条数(bot.history_turns)，超长时会砍老消息不做摘要；长会话质量会下降。
- refs_json 存的是检索到的**条目 id + 分数 + snippet**，不冗余存条目全文。C 端展示用 snippet(截前 200 字)，不开放 `/api/public/entries/:id`。若后期确需完整条目再加。
- 匿名 session 没有清理策略——`chat_sessions` 会长期累积。本期不做定时清理任务；上生产前应加。
