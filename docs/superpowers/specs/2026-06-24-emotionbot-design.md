# emotionBot 情感机器人 — 设计文档

> 创建日期：2026-06-24
> 状态：已通过 brainstorming 评审，待用户复核

## 1. 背景与目标

在仓库中新增一个与 `bigPlayer` 同级的顶层目录 `emotionBot/`，承载一个「情感机器人」产品的完整原型 + 可跑的本地后端。产品包含：

- **C 端**：用户使用的对话 App（移动端主体 + Web 宽屏适配）。
- **B 端**：运营/管理后台，含 RAG 知识库管理、数据分析看板、机器人配置管理、会话记录与人工审核。
- **本地后端**：对接用户自有的 **Anthropic 兼容 API**，实现真实对话 + RAG 检索，能在本地真实跑起来。

机器人定位（双场景，同一 App 内通过角色卡切换）：

1. **知识问答 / 客服**：基于 RAG 知识库回答业务/产品问题，回答附带来源引用。
2. **情绪陪伴 / 倾诉**：情绪支持、倾诉陪伴，用对应人设 prompt 驱动。

## 2. 技术栈（已确认）

| 子工程 | 技术栈 | 端口 |
|--------|--------|------|
| `client/` (C 端) | React + Vite | 5273 |
| `admin/` (B 端) | React + Vite + Antd + @antv/g2 | 5274 |
| `server/` (后端) | Express (ESM) | 3100 |

- C 端与 B 端**统一用 React**（不沿用 bigPlayer C 端纯 HTML 的约定）。
- 三个**独立工程**，各自 `package.json`、各自启动。**额外**在 `emotionBot/` 根加一个 `package.json`，用 `concurrently` 提供一键同时启动三者的脚本（`npm run dev`）。
- 后端对接用户自有的 **Anthropic 兼容 API**（`/v1/messages`），**embedding 调同一个 API**。
- **向量检索**：纯 JS 内存余弦相似度，无外部向量库依赖。
- **数据持久化**：内存 + JSON 文件落盘（重启不丢），不引数据库。

## 3. 目录结构

```
emotionBot/
  package.json              # 根：concurrently 一键起三个工程
  README.md                 # 启动说明（三工程 + .env 配置）
  .env.example              # API base/key/模型名 模板
  .gitignore                # 忽略 node_modules、.env、data/*.json

  client/                   # C 端对话 App
    package.json
    vite.config.js          # port 5273，/api 代理到 3100
    index.html
    src/
      main.jsx
      App.jsx               # 路由：入口/对话/历史/我的
      api/client.js         # fetch 封装 + SSE 流式读取
      pages/
        EntryPage.jsx       # 机器人角色卡选择（客服 / 情绪陪伴）
        ChatPage.jsx        # 对话页（气泡流、流式、来源引用、快捷回复）
        HistoryPage.jsx     # 会话历史列表
        ProfilePage.jsx     # 我的 / 设置
      components/
        PhoneFrame.jsx      # 手机壳外观（移动端主体）
        MessageBubble.jsx   # 气泡（含来源引用渲染）
        Composer.jsx        # 输入框 + 发送
        BotCard.jsx         # 角色卡
      styles/

  admin/                    # B 端后台
    package.json
    vite.config.js          # port 5274，/api 代理到 3100
    index.html
    src/
      main.jsx
      App.jsx               # Antd Layout + 路由
      api/admin.js
      pages/
        knowledge/          # RAG 知识库管理
          KbList.jsx        # 知识库列表
          KbDetail.jsx      # 文档上传/录入 + 分片预览 + 向量化状态
          RetrievalTest.jsx # 检索测试（query → 命中分片 + 得分）
        analytics/
          Dashboard.jsx     # 对话量/活跃/满意度/热门问题/负面情绪告警
        bots/
          BotConfig.jsx     # 人设/prompt/开场白/模型参数/绑定知识库/上下线
        sessions/
          SessionList.jsx   # 会话列表
          SessionDetail.jsx # 详情回放 + 敏感词标记 + 人工介入/改判
      components/

  server/                   # 本地后端
    package.json
    .env                    # 用户填（gitignore）
    src/
      index.js              # Express app + 路由挂载
      config.js             # 读 .env
      llm/
        anthropicClient.js  # 对接 Anthropic 兼容 API（messages + embedding）
        embeddings.js       # 调 API 生成向量
      rag/
        chunker.js          # 文档分片
        vectorStore.js      # 内存向量库 + 余弦相似度检索
      routes/
        chat.js             # POST /api/chat（SSE 流式，含 RAG 检索）
        knowledge.js        # 知识库 CRUD / 上传 / 向量化 / 检索测试
        bots.js             # 机器人配置 CRUD
        analytics.js        # 聚合数据（mock）
        sessions.js         # 会话记录 / 审核
      store/
        jsonStore.js        # JSON 文件读写封装
      data/                 # 落盘 JSON（gitignore）
        bots.json
        knowledge.json
        sessions.json
```

## 4. 数据模型（JSON 落盘）

**Bot（机器人配置）**
```
{ id, name, type: "qa" | "companion", avatar, systemPrompt,
  greeting, temperature, maxTokens, knowledgeBaseIds: [], online: bool, createdAt }
```

**KnowledgeBase（知识库）**
```
{ id, name, description, docCount, chunkCount, createdAt }
```

**Chunk（分片，含向量）**
```
{ id, kbId, docId, docName, text, embedding: [float], createdAt }
```

**Session（会话）**
```
{ id, botId, botType, userId, messages: [{role, content, sources?, ts}],
  satisfaction?: 1-5, sentiment?: "pos"|"neu"|"neg",
  flagged?: bool, humanIntervened?: bool, createdAt }
```

## 5. 关键流程

### 5.1 对话（RAG）
1. C 端 `ChatPage` 选定 bot，POST `/api/chat`（botId + 历史消息 + 新消息），走 SSE。
2. server：取 bot 配置 → 若 `type=qa` 且绑定知识库：调 embedding 接口把 query 向量化 → `vectorStore` 余弦相似度取 Top-K 分片 → 拼进 system/context。
3. 调 Anthropic 兼容 `/v1/messages`（stream=true），把 token 通过 SSE 透传给前端。
4. 回答结束：QA 类把命中来源（docName + 片段）作为 `sources` 一并返回；server 把整轮对话写入 `sessions.json`。

### 5.2 知识库向量化
1. B 端 `KbDetail` 上传/粘贴文档文本 → POST `/api/knowledge/:kbId/docs`。
2. server：`chunker` 按长度/分隔符分片 → 逐片调 embedding 接口 → 存入 `vectorStore` + `knowledge.json`。
3. 前端轮询/返回向量化状态（pending/done/failed）与 chunkCount。

### 5.3 检索测试
- `RetrievalTest` 输入 query → POST `/api/knowledge/:kbId/search` → 返回 Top-K 分片 + 相似度得分，供运营验证知识库质量。

### 5.4 数据分析
- `analytics` 路由对 `sessions.json` 做聚合（对话量按日、活跃用户数、满意度均值、热门问题聚类、负面情绪计数）。原型阶段允许 mock/半 mock 聚合。

### 5.5 会话审核
- `SessionList` 筛选（按 bot/情绪/是否 flagged）→ `SessionDetail` 回放消息流 → 标记敏感/人工改判，写回 `sessions.json`。

## 6. 环境配置

`.env`（server，参考 `.env.example`）：
```
EMOTIONBOT_API_BASE=https://your-anthropic-compatible-endpoint
EMOTIONBOT_API_KEY=sk-xxx
EMOTIONBOT_CHAT_MODEL=claude-opus-4-8
EMOTIONBOT_EMBED_MODEL=<embedding 模型名>
PORT=3100
```

> 注：API 为 Anthropic 兼容（`/v1/messages`）。若该端点的 embedding 子接口路径/格式与对话不同，在 `embeddings.js` 中适配；缺失时回退本地占位向量并在 README 标注。

## 7. 启动方式

```bash
cd emotionBot
cp .env.example server/.env   # 填入 API base / key / 模型名
npm install                   # 根装 concurrently
npm run dev                   # 同时起 server(3100) / client(5273) / admin(5274)
```
也可分别 `cd server && npm i && npm run dev` 等单独启动。

## 8. 验证标准

- 三个工程各自能 `npm run dev` 起来，根 `npm run dev` 一键起全部。
- 配好 `.env` 后，C 端能与真实 API 完成一轮流式对话。
- B 端能新建知识库、上传文档、看到分片与向量化状态、做检索测试看到命中得分。
- QA 类对话回答带来源引用。
- B 端四个模块页面均可访问、数据来自 server。
- 会话能在 B 端列表/详情中看到并可标记。
- 前端构建无报错（`vite build` 或 `node --check` 级别校验通过）。

## 9. 范围与 YAGNI

**包含**：上述 C 端 4 页 + B 端 4 模块 + server RAG/对话/审核/分析路由 + 内存向量检索 + JSON 落盘 + 一键启动。

**不包含**（明确排除）：真实用户登录鉴权体系、生产级向量库、数据库、多租户、消息推送、移动端原生打包、bigPlayer 既有模块的改动。

## 10. 协作约定

- 探索性/临时文件放仓库根 `.temp/`，不在 `emotionBot/` 内创建临时文件。
- 开发完成后在 `.claude/docs/2026-06/2026-06-24/` 下写变更文档。
