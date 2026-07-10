# AI 陪伴机器人 · 子项目3「机器人+会话+C端对话」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在自建后端地基 + 知识库子系统上补齐 C 端匿名对话机器人:B 端配置机器人人设/会话查看、C 端 chat.html 匿名对话页、内嵌 RAG(检索当前版本知识库塞进 prompt)。

**Architecture:** 沿用 aiCompanion Express+MySQL 单库风格。新增 3 张表(带 version_id) + 3 个 service + 3 组路由(B 端 /api/bot、/api/sessions,C 端 /api/public/*) + C 端全新 chat.html。RAG 是函数调用,复用子项目 2 的 embedding+vectorStore。LLM 云 API fetch 调用,测试用假实现。

**Tech Stack:** Node.js、Express、mysql2;原生 fetch 调 LLM;无新增 npm 依赖;原生 HTML/CSS/JS。

---

## 前置说明(执行者必读)

- **工作目录**:主工作区 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。所有后端在 `aiCompanion/server/`,前端在 `aiCompanion/web/`。
- **提交被坏钩子拦截**:仓库 `.git/hooks/pre-commit` 是遗留 Husky v4 坏钩子。所有 `git commit` 前缀 `HUSKY_SKIP_HOOKS=1`。
- **代码风格对齐**:async 路由必须用 `utils/asyncHandler.js` 包裹;错误用 `utils/errors.js` 的 `fail(res, status, '中文')`;middleware 复用 `middleware/auth.js` + `middleware/version.js` + `middleware/requireSuperAdmin.js`。
- **地基已跑通**:MySQL(XAMPP MariaDB)本机可用,`.env` 已配。子项目 2 (embedding+vectorStore+kb 路由)完全就绪。
- **测试方式**:Node 内置 `assert` + `http` 真实调用,`llm._setImpl(fn)` 注入假实现,`embedding._setImpl(fn)` 沿用子项目 2 假实现。
- **占位密钥**:测试完全不需要真 LLM key;生产运行需用户填 `LLM_API_KEY`。
- **提交范围**:每个 task 只 `git add` 明确列出的文件,不加 `.` 或 `-A`(主工作区有别处未跟踪的东西)。

---

## 文件结构

**后端新增/修改**:
- Create `aiCompanion/server/migrations/004_bot_chat.sql` — 3 张表(bots/chat_sessions/chat_messages)
- Modify `aiCompanion/server/.env.example` — 加 LLM_API_URL / LLM_API_KEY / LLM_MODEL
- Modify `aiCompanion/server/src/config/kb.js` — 追加 llm 配置块
- Create `aiCompanion/server/src/services/llm.js` — LLM chat 封装
- Create `aiCompanion/server/src/services/ragContext.js` — 检索封装,返回 refs
- Create `aiCompanion/server/src/services/chatService.js` — 编排:session、prompt、LLM、消息落库
- Create `aiCompanion/server/src/routes/bot.js` — B 端 /api/bot
- Create `aiCompanion/server/src/routes/sessions.js` — B 端 /api/sessions
- Create `aiCompanion/server/src/routes/public.js` — C 端 /api/public/*
- Modify `aiCompanion/server/src/app.js` — 挂 3 组新路由
- Modify `aiCompanion/server/package.json` — 加 test:chat 脚本
- Create `aiCompanion/server/test/chat.run.js` — 集成测试

**前端**:
- Create `aiCompanion/web/chat.html` — C 端入口
- Create `aiCompanion/web/css/chat.css` — C 端样式
- Create `aiCompanion/web/js/chat.js` — C 端逻辑
- Modify `aiCompanion/web/js/pages/bots.js`(替换占位) — 机器人配置页
- Modify `aiCompanion/web/js/pages/sessions.js`(新建) — 会话列表+详情
- Modify `aiCompanion/web/admin.html` — 引入 bots.js/sessions.js
- Modify `aiCompanion/web/js/app.js` — navigate 加 bots/sessions 分支

**文档**:
- Modify `aiCompanion/README.md` — 追加子项目 3 章节
- Create `.claude/docs/2026-07/2026-07-10/v003_changelog.md`

---

## Task 1: 环境变量 + kb.js 追加 llm 配置

**Files:**
- Modify: `aiCompanion/server/.env.example`
- Modify: `aiCompanion/server/src/config/kb.js`
- Modify: `aiCompanion/server/.env` (本地,不入 git)

- [ ] **Step 1: `.env.example` 末尾追加**

```
# —— LLM 对话配置(以通义千问 qwen-plus 为例) ——
LLM_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
LLM_API_KEY=your_llm_key_here
LLM_MODEL=qwen-plus
```

- [ ] **Step 2: 本地 `.env` 追加(占位)**

同样追加上面三行,LLM_API_KEY 填 `placeholder_for_test`(测试用假 LLM,不需要真 key)。

- [ ] **Step 3: 修改 `src/config/kb.js`**

现有导出对象里有 `embedding: {...}`。在同级追加 `llm` 块:

现有对象末尾从:
```js
  embedding: {
    apiUrl: process.env.EMBEDDING_API_URL || '',
    apiKey: process.env.EMBEDDING_API_KEY || '',
    model:  process.env.EMBEDDING_MODEL  || 'text-embedding-v2',
    dim:    parseInt(process.env.EMBEDDING_DIM, 10) || 1536,
    retries: 3,
    retryBaseMs: 500,
  },
};
```

改为:
```js
  embedding: {
    apiUrl: process.env.EMBEDDING_API_URL || '',
    apiKey: process.env.EMBEDDING_API_KEY || '',
    model:  process.env.EMBEDDING_MODEL  || 'text-embedding-v2',
    dim:    parseInt(process.env.EMBEDDING_DIM, 10) || 1536,
    retries: 3,
    retryBaseMs: 500,
  },

  llm: {
    apiUrl: process.env.LLM_API_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model:  process.env.LLM_MODEL  || 'qwen-plus',
    retries: 3,
    retryBaseMs: 500,
    maxMessageBytes: 4 * 1024,  // 单条 user message 上限
    maxPromptBytes: 8 * 1024,   // 组装后 prompt 总长上限,超了砍历史
  },
};
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/server && node --check src/config/kb.js`
Expected: 无输出

- [ ] **Step 5: Commit(不提交 .env)**

```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage"
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/.env.example aiCompanion/server/src/config/kb.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): LLM 环境变量 + kb 配置追加 llm 块"
```

---

## Task 2: 数据库迁移 3 张表

**Files:**
- Create: `aiCompanion/server/migrations/004_bot_chat.sql`

- [ ] **Step 1: 建表 SQL**

`aiCompanion/server/migrations/004_bot_chat.sql`:
```sql
USE ai_companion;

CREATE TABLE IF NOT EXISTS bots (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_id    INT NOT NULL UNIQUE,
  persona       TEXT NOT NULL,
  welcome       VARCHAR(512) NOT NULL,
  rag_enabled   TINYINT(1) NOT NULL DEFAULT 1,
  rag_top_k     INT NOT NULL DEFAULT 5,
  history_turns INT NOT NULL DEFAULT 10,
  model         VARCHAR(64) NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  version_id    INT NOT NULL,
  session_key   VARCHAR(64) NOT NULL,
  title         VARCHAR(128) NULL,
  message_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ver_key (version_id, session_key),
  INDEX idx_sess_ver (version_id, id),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  session_id  INT NOT NULL,
  role        VARCHAR(16) NOT NULL,
  content     TEXT NOT NULL,
  refs_json   JSON NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_sess (session_id, id),
  FOREIGN KEY (version_id) REFERENCES versions(id)      ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 执行迁移**

Run: `cd aiCompanion/server && npm run migrate`
Expected: `Running 004_bot_chat.sql... ✓ done`

- [ ] **Step 3: 校验表建成**

Run: `"/c/xampp/mysql/bin/mysql.exe" -u root ai_companion -e "SHOW TABLES LIKE '%bot%'; SHOW TABLES LIKE 'chat%';"`
Expected: 列出 bots, chat_sessions, chat_messages

- [ ] **Step 4: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/migrations/004_bot_chat.sql
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): 迁移 004 建 bots/chat_sessions/chat_messages"
```

---

## Task 3: llm 服务

**Files:**
- Create: `aiCompanion/server/src/services/llm.js`

- [ ] **Step 1: 实现 llm.js**

`aiCompanion/server/src/services/llm.js`:
```js
// LLM chat completion 云 API 封装(默认走 OpenAI 兼容协议,如通义 dashscope 兼容模式)。
// 结构仿 embedding.js:默认实现 realChat + 可替换 impl + 重试。
const cfg = require('../config/kb');

// 默认实现:调云 API,消息数组格式 [{role, content}, ...]
async function realChat(messages, opts = {}) {
  const { apiUrl, apiKey, model, retries, retryBaseMs } = cfg.llm;
  if (!apiKey) throw new Error('LLM_API_KEY 未配置');

  const body = {
    model: opts.model || model,
    messages,
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      // OpenAI 兼容结构:choices[0].message.content
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('LLM 返回格式异常');
      return { content };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, retryBaseMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

let impl = realChat;
async function chat(messages, opts) { return impl(messages, opts); }
function _setImpl(fn) { impl = fn || realChat; }

module.exports = { chat, _setImpl };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/llm.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/llm.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): llm 服务(可测试替换)"
```

---

## Task 4: ragContext 服务(查询→refs)

**Files:**
- Create: `aiCompanion/server/src/services/ragContext.js`

- [ ] **Step 1: 实现 ragContext.js**

`aiCompanion/server/src/services/ragContext.js`:
```js
// RAG 上下文:用户查询 → embedding → vectorStore 余弦检索 → 拿条目详情 → 返回 refs 列表
const db = require('../config/db');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');

const SNIPPET_MAX = 200;   // C 端展示的 snippet 截取字数

// 检索。失败(embedding 报错等)则返回 [],由上层决定是否退化为无 RAG 对话。
async function retrieve(versionId, query, topK = 5) {
  try {
    const [qvec] = await embedding.embedBatch([query]);
    if (!qvec) return [];
    const hits = vectorStore.search(versionId, qvec, topK);
    if (hits.length === 0) return [];
    const ids = hits.map(h => h.entryId);
    const [rows] = await db.query(
      `SELECT id, content FROM knowledge_entries WHERE version_id=? AND id IN (${ids.map(() => '?').join(',')})`,
      [versionId, ...ids]
    );
    const byId = new Map(rows.map(r => [r.id, r.content]));
    return hits
      .filter(h => byId.has(h.entryId))
      .map(h => ({
        entryId: h.entryId,
        score: h.score,
        snippet: String(byId.get(h.entryId)).slice(0, SNIPPET_MAX),
      }));
  } catch (err) {
    console.error('[ragContext] retrieve failed:', err.message);
    return [];
  }
}

// 把 refs 拼成 prompt 里的「参考知识」文本块
function toContextBlock(refs) {
  if (!refs || refs.length === 0) return '';
  const items = refs.map((r, i) => `[${i + 1}] ${r.snippet}`).join('\n');
  return `\n\n以下是从知识库检索到的相关资料，若有相关内容请优先参考回答:\n${items}`;
}

module.exports = { retrieve, toContextBlock, SNIPPET_MAX };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/ragContext.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/ragContext.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): ragContext 服务(检索+refs 拼装)"
```

---

## Task 5: chatService 服务(编排)

**Files:**
- Create: `aiCompanion/server/src/services/chatService.js`

- [ ] **Step 1: 实现 chatService.js**

`aiCompanion/server/src/services/chatService.js`:
```js
// 编排:查/建 session → 存 user → RAG → 拼 prompt → LLM → 存 assistant。
// LLM 失败时回滚 user message,避免留孤儿。
const db = require('../config/db');
const cfg = require('../config/kb');
const llm = require('./llm');
const ragContext = require('./ragContext');

// 拿或建 bot 配置(不存在返回默认值,让 C 端 chat 能跑起来即使 B 端未配置)
async function getBot(versionId) {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [versionId]);
  if (rows.length > 0) return rows[0];
  return {
    persona: '你是一个热情耐心的游戏陪玩助手。',
    welcome: '你好,我是你的游戏陪玩助手,有什么想聊的?',
    rag_enabled: 1,
    rag_top_k: 5,
    history_turns: 10,
    model: null,
  };
}

// 拿或建 session,返回 {id, isNew}
async function findOrCreateSession(versionId, sessionKey, firstMessage) {
  const [rows] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
    [versionId, sessionKey]
  );
  if (rows.length > 0) return { id: rows[0].id, isNew: false };
  const title = String(firstMessage || '').slice(0, 30);
  try {
    const [ins] = await db.query(
      'INSERT INTO chat_sessions (version_id, session_key, title) VALUES (?,?,?)',
      [versionId, sessionKey, title]
    );
    return { id: ins.insertId, isNew: true };
  } catch (err) {
    // 并发插入导致 UNIQUE 冲突,重查一次
    if (err.code === 'ER_DUP_ENTRY') {
      const [again] = await db.query(
        'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
        [versionId, sessionKey]
      );
      return { id: again[0].id, isNew: false };
    }
    throw err;
  }
}

// 拿最近 N 条消息(按 id 升序返回)
async function loadHistory(sessionId, limit) {
  const [rows] = await db.query(
    'SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
    [sessionId, limit]
  );
  return rows.reverse();
}

// 拼 prompt:system + 历史 + 本次 user。超过 maxPromptBytes 就砍老历史。
function buildMessages(bot, history, userMessage, contextBlock) {
  const systemContent = bot.persona + contextBlock;
  const messages = [{ role: 'system', content: systemContent }];
  for (const m of history) messages.push({ role: m.role, content: m.content });
  messages.push({ role: 'user', content: userMessage });

  const totalBytes = () => messages.reduce((s, m) => s + Buffer.byteLength(m.content, 'utf8'), 0);
  while (totalBytes() > cfg.llm.maxPromptBytes && messages.length > 2) {
    // 保留 system(index 0)和最后一条 user,砍中间最老的
    messages.splice(1, 1);
  }
  return messages;
}

// 存消息,并把 session 的 message_count / updated_at 更新
async function saveMessage(versionId, sessionId, role, content, refs) {
  const [ins] = await db.query(
    'INSERT INTO chat_messages (version_id, session_id, role, content, refs_json) VALUES (?,?,?,?,?)',
    [versionId, sessionId, role, content, refs ? JSON.stringify(refs) : null]
  );
  await db.query(
    'UPDATE chat_sessions SET message_count = message_count + 1, updated_at = NOW() WHERE id=?',
    [sessionId]
  );
  return ins.insertId;
}

async function deleteMessage(messageId, sessionId) {
  await db.query('DELETE FROM chat_messages WHERE id=?', [messageId]);
  await db.query(
    'UPDATE chat_sessions SET message_count = GREATEST(message_count - 1, 0) WHERE id=?',
    [sessionId]
  );
}

// 主流程:一次对话
async function handleChat({ versionId, sessionKey, message }) {
  const bot = await getBot(versionId);
  const { id: sessionId } = await findOrCreateSession(versionId, sessionKey, message);

  // 存 user message
  const userMsgId = await saveMessage(versionId, sessionId, 'user', message, null);

  try {
    // RAG(失败退化为空 refs,不抛)
    let refs = [];
    let contextBlock = '';
    if (bot.rag_enabled) {
      refs = await ragContext.retrieve(versionId, message, bot.rag_top_k);
      contextBlock = ragContext.toContextBlock(refs);
    }

    // 历史(N 轮 = 2N 条 user+assistant;我们直接按条数取,简单)
    const history = await loadHistory(sessionId, bot.history_turns * 2);
    // 历史最后一条就是我们刚存的 user message,要排除
    const historyExcludingCurrent = history.filter(m => !(m.role === 'user' && m.content === message)).slice(-bot.history_turns * 2 + 1);

    const messages = buildMessages(bot, historyExcludingCurrent, message, contextBlock);

    // 调 LLM
    const { content: reply } = await llm.chat(messages, { model: bot.model || undefined });

    // 存 assistant
    await saveMessage(versionId, sessionId, 'assistant', reply, refs);

    return { reply, refs };
  } catch (err) {
    // LLM/其它失败 → 回滚 user message
    try { await deleteMessage(userMsgId, sessionId); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = {
  handleChat, getBot, findOrCreateSession, loadHistory, saveMessage, deleteMessage, buildMessages,
};
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/chatService.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/chatService.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): chatService 编排(session/RAG/LLM/回滚)"
```

---

## Task 6: /api/bot 路由(B 端)

**Files:**
- Create: `aiCompanion/server/src/routes/bot.js`

- [ ] **Step 1: 实现 bot.js**

`aiCompanion/server/src/routes/bot.js`:
```js
const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');

router.use(version);

// GET /api/bot — 拿当前版本机器人配置(无则返默认值,不入库)
router.get('/', ah(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM bots WHERE version_id=?', [req.versionId]);
  if (rows.length > 0) {
    const b = rows[0];
    return res.json({
      persona: b.persona,
      welcome: b.welcome,
      ragEnabled: !!b.rag_enabled,
      ragTopK: b.rag_top_k,
      historyTurns: b.history_turns,
      model: b.model,
    });
  }
  res.json({
    persona: '你是一个热情耐心的游戏陪玩助手。',
    welcome: '你好,我是你的游戏陪玩助手,有什么想聊的?',
    ragEnabled: true,
    ragTopK: 5,
    historyTurns: 10,
    model: null,
  });
}));

// PUT /api/bot — upsert
router.put('/', ah(async (req, res) => {
  const { persona, welcome, ragEnabled, ragTopK, historyTurns, model } = req.body || {};
  if (!persona || !welcome) return fail(res, 400, 'persona / welcome 必填');
  if (persona.length > 8000) return fail(res, 400, 'persona 过长(>8000)');
  if (welcome.length > 512) return fail(res, 400, 'welcome 过长(>512)');

  const topK = parseInt(ragTopK, 10);
  if (Number.isNaN(topK) || topK < 1 || topK > 20) return fail(res, 400, 'ragTopK 需在 1-20');
  const turns = parseInt(historyTurns, 10);
  if (Number.isNaN(turns) || turns < 1 || turns > 50) return fail(res, 400, 'historyTurns 需在 1-50');

  await db.query(
    `INSERT INTO bots (version_id, persona, welcome, rag_enabled, rag_top_k, history_turns, model)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       persona=VALUES(persona), welcome=VALUES(welcome),
       rag_enabled=VALUES(rag_enabled), rag_top_k=VALUES(rag_top_k),
       history_turns=VALUES(history_turns), model=VALUES(model)`,
    [req.versionId, persona, welcome, ragEnabled ? 1 : 0, topK, turns, model || null]
  );
  res.json({ ok: true });
}));

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/bot.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/bot.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): B 端 /api/bot 路由(GET/PUT upsert)"
```

---

## Task 7: /api/sessions 路由(B 端)

**Files:**
- Create: `aiCompanion/server/src/routes/sessions.js`

- [ ] **Step 1: 实现 sessions.js**

`aiCompanion/server/src/routes/sessions.js`:
```js
const router = require('express').Router();
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');

router.use(version);

// GET /api/sessions — 分页列表(最新在前)
router.get('/', ah(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const [rows] = await db.query(
    `SELECT id, session_key, title, message_count, created_at, updated_at
       FROM chat_sessions WHERE version_id=?
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [req.versionId, limit, offset]
  );
  res.json(rows);
}));

// GET /api/sessions/:id — 详情 + 全部消息
router.get('/:id', ah(async (req, res) => {
  const [sess] = await db.query(
    'SELECT id, session_key, title, message_count, created_at FROM chat_sessions WHERE id=? AND version_id=?',
    [req.params.id, req.versionId]
  );
  if (sess.length === 0) return fail(res, 404, '会话不存在');
  const [msgs] = await db.query(
    'SELECT id, role, content, refs_json, created_at FROM chat_messages WHERE session_id=? ORDER BY id',
    [req.params.id]
  );
  res.json({ session: sess[0], messages: msgs });
}));

// DELETE /api/sessions/:id
router.delete('/:id', ah(async (req, res) => {
  const [r] = await db.query('DELETE FROM chat_sessions WHERE id=? AND version_id=?', [req.params.id, req.versionId]);
  if (r.affectedRows === 0) return fail(res, 404, '会话不存在');
  res.json({ ok: true });
}));

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/sessions.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/sessions.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): B 端 /api/sessions 路由(列表/详情/删除)"
```

---

## Task 8: /api/public 路由(C 端匿名)

**Files:**
- Create: `aiCompanion/server/src/routes/public.js`

- [ ] **Step 1: 实现 public.js**

`aiCompanion/server/src/routes/public.js`:
```js
// C 端匿名对话:不经 auth 中间件,每接口自校验 versionId 存在且 status='active'。
const router = require('express').Router();
const db = require('../config/db');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const chatService = require('../services/chatService');

// 中间件:校验 versionId
async function requireVersion(req, res, next) {
  const raw = req.body?.versionId || req.query?.versionId;
  const versionId = parseInt(raw, 10);
  if (!versionId) return fail(res, 400, 'versionId 必填');
  const [rows] = await db.query('SELECT id FROM versions WHERE id=? AND status="active"', [versionId]);
  if (rows.length === 0) return fail(res, 404, '版本不存在');
  req.versionId = versionId;
  next();
}

// GET /api/public/bot — 只返 welcome
router.get('/bot', requireVersion, ah(async (req, res) => {
  const [rows] = await db.query('SELECT welcome FROM bots WHERE version_id=?', [req.versionId]);
  const welcome = rows[0]?.welcome || '你好,我是你的游戏陪玩助手,有什么想聊的?';
  res.json({ welcome });
}));

// GET /api/public/history — 恢复历史
router.get('/history', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.query.sessionKey || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const [sess] = await db.query(
    'SELECT id FROM chat_sessions WHERE version_id=? AND session_key=?',
    [req.versionId, sessionKey]
  );
  if (sess.length === 0) return res.json({ messages: [] });

  const [msgs] = await db.query(
    'SELECT role, content, refs_json, created_at FROM chat_messages WHERE session_id=? ORDER BY id DESC LIMIT ?',
    [sess[0].id, limit]
  );
  res.json({ messages: msgs.reverse() });
}));

// POST /api/public/chat — 核心
router.post('/chat', requireVersion, ah(async (req, res) => {
  const sessionKey = String(req.body?.sessionKey || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!sessionKey) return fail(res, 400, 'sessionKey 必填');
  if (!message) return fail(res, 400, '消息不能为空');
  if (Buffer.byteLength(message, 'utf8') > cfg.llm.maxMessageBytes) {
    return fail(res, 400, `单条消息超长(>${cfg.llm.maxMessageBytes} 字节)`);
  }

  try {
    const result = await chatService.handleChat({ versionId: req.versionId, sessionKey, message });
    res.json(result);
  } catch (err) {
    console.error('[public/chat] error:', err.message);
    return fail(res, 500, 'AI 服务暂时不可用,请稍后再试');
  }
}));

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/public.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/public.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): C 端 /api/public/* 匿名对话路由"
```

---

## Task 9: app.js 挂新路由

**Files:**
- Modify: `aiCompanion/server/src/app.js`

- [ ] **Step 1: 修改 app.js**

在现有 `app.use('/api/kb', ...)` 一行**下面**添加三行:

从:
```js
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/kb',       require('./routes/kb'));
```

改为:
```js
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/kb',       require('./routes/kb'));
app.use('/api/bot',      require('./routes/bot'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/public',   require('./routes/public'));
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/app.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): app.js 挂 /api/bot /api/sessions /api/public"
```

---

## Task 10: 集成测试

**Files:**
- Create: `aiCompanion/server/test/chat.run.js`
- Modify: `aiCompanion/server/package.json`

- [ ] **Step 1: 写测试脚本**

`aiCompanion/server/test/chat.run.js`:
```js
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const llm = require('../src/services/llm');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');

const PORT = process.env.CHAT_TEST_PORT || 3197;

// 假 LLM:回声形式,便于断言
llm._setImpl(async messages => {
  const last = messages[messages.length - 1];
  return { content: '回声:' + last.content };
});

// 假 embedding(与 kb.run.js 一致的确定性伪向量)
function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x*x, 0)) || 1;
  return v.map(x => x / norm);
}
embedding._setImpl(async texts => texts.map(t => fakeEmbed(t)));

function req(method, urlPath, { token, versionId, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: urlPath, headers }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: buf ? tryJson(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function tryJson(s) { try { return JSON.parse(s); } catch { return s; } }

async function main() {
  const server = app.listen(PORT);
  await vectorStore.loadAll();
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  try {
    // 登录
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;

    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;
    const v2 = me.body.versions[1] ? me.body.versions[1].id : v1;

    // 1) B 端保存机器人配置
    await test('PUT /api/bot 保存', async () => {
      const r = await req('PUT', '/api/bot', {
        token, versionId: v1,
        body: {
          persona: '你是妲己陪玩助手',
          welcome: '亲爱的~今天想聊什么呢?',
          ragEnabled: true, ragTopK: 3, historyTurns: 5,
        },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('GET /api/bot 读回', async () => {
      const r = await req('GET', '/api/bot', { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.persona, '你是妲己陪玩助手');
      assert.strictEqual(r.body.ragTopK, 3);
    });

    // 2) C 端 /api/public/bot
    await test('C 端 GET /api/public/bot', async () => {
      const r = await req('GET', `/api/public/bot?versionId=${v1}`);
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.welcome.includes('亲爱的'));
    });

    // 3) C 端第一次对话
    const key1 = 'session_test_' + Date.now();
    await test('C 端 chat 第一次:建 session + 存消息', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key1, message: '你好' },
      });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.reply.includes('回声'));
    });

    // 4) 同 sessionKey 再来
    await test('C 端 chat 第二次:历史累积', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key1, message: '再见' },
      });
      assert.strictEqual(r.status, 200);
      const h = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key1}`);
      assert.strictEqual(h.body.messages.length, 4);  // 2 轮 = 4 条
    });

    // 5) B 端会话列表看到
    await test('B 端 GET /api/sessions', async () => {
      const r = await req('GET', '/api/sessions', { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.some(s => s.session_key === key1));
    });

    // 6) B 端会话详情
    await test('B 端 GET /api/sessions/:id 拿全部消息', async () => {
      const list = await req('GET', '/api/sessions', { token, versionId: v1 });
      const sid = list.body.find(s => s.session_key === key1).id;
      const r = await req('GET', `/api/sessions/${sid}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.messages.length, 4);
    });

    // 7) 版本隔离:同 sessionKey 在 v2 建新 session
    if (v2 !== v1) {
      await test('版本隔离:v2 同 sessionKey 建新 session', async () => {
        const r = await req('POST', '/api/public/chat', {
          body: { versionId: v2, sessionKey: key1, message: '在 v2 说话' },
        });
        assert.strictEqual(r.status, 200);
        const h = await req('GET', `/api/public/history?versionId=${v2}&sessionKey=${key1}`);
        assert.strictEqual(h.body.messages.length, 2);  // 只这一轮
      });
    }

    // 8) LLM 失败时回滚 user message
    await test('LLM 失败回滚 user message', async () => {
      llm._setImpl(async () => { throw new Error('mock LLM 挂了'); });
      const key2 = 'session_fail_' + Date.now();
      const before = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key2}`);
      assert.strictEqual(before.body.messages.length, 0);
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: key2, message: '会失败的消息' },
      });
      assert.strictEqual(r.status, 500);
      const after = await req('GET', `/api/public/history?versionId=${v1}&sessionKey=${key2}`);
      assert.strictEqual(after.body.messages.length, 0, 'user message 应被回滚');
      // 恢复回声实现
      llm._setImpl(async messages => ({ content: '回声:' + messages[messages.length - 1].content }));
    });

    // 9) message 空返回 400
    await test('message 空 400', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: v1, sessionKey: 'x', message: '' },
      });
      assert.strictEqual(r.status, 400);
    });

    // 10) versionId 不存在 404
    await test('versionId 不存在 404', async () => {
      const r = await req('POST', '/api/public/chat', {
        body: { versionId: 999999, sessionKey: 'x', message: 'hi' },
      });
      assert.strictEqual(r.status, 404);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败:', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
```

- [ ] **Step 2: package.json 加脚本**

修改 `aiCompanion/server/package.json`,`scripts` 里追加 `test:chat`:
```json
"scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "migrate": "node migrations/run.js",
    "test": "node test/run.js",
    "test:kb": "node test/kb.run.js",
    "test:chat": "node test/chat.run.js"
  },
```

- [ ] **Step 3: 校验语法**

Run: `cd aiCompanion/server && node --check test/chat.run.js`
Expected: 无输出

- [ ] **Step 4: 跑测试**

Run: `cd aiCompanion/server && npm run test:chat`
Expected: `10 个测试全部通过`(或版本只有 1 个时 9 个测试通过)

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/test/chat.run.js aiCompanion/server/package.json
HUSKY_SKIP_HOOKS=1 git commit -m "test(aiCompanion/bot): 集成测试(bot/session/chat/RAG/版本隔离/LLM失败回滚)"
```

---

## Task 11: 前端机器人配置页

**Files:**
- Modify: `aiCompanion/web/js/pages/bots.js` (替换现有占位或新建)
- Modify: `aiCompanion/web/admin.html` (引入 bots.js)
- Modify: `aiCompanion/web/js/app.js` (navigate 加 bots 分支)

- [ ] **Step 1: 写 bots.js**

`aiCompanion/web/js/pages/bots.js`:
```js
window.pages = window.pages || {};

window.pages.bots = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let cfg;
  try {
    cfg = await window.api.apiFetch('/bot', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  content.innerHTML = `
    <h3>当前版本机器人配置</h3>
    <div class="hint">每个版本一个机器人。人设、开关、检索参数在此配置。</div>
    <table style="margin-top:12px;">
      <tr><th style="width:120px;">人设(persona)</th>
          <td><textarea id="bot-persona" rows="6" style="width:100%;padding:8px;border:1px solid #dcdfe6;border-radius:6px;font:inherit;">${escapeHtml(cfg.persona || '')}</textarea></td></tr>
      <tr><th>欢迎语(welcome)</th>
          <td><input id="bot-welcome" type="text" style="width:100%;height:34px;padding:0 10px;border:1px solid #dcdfe6;border-radius:6px;" value="${escapeHtml(cfg.welcome || '')}"></td></tr>
      <tr><th>启用 RAG</th>
          <td><label><input id="bot-rag" type="checkbox" ${cfg.ragEnabled ? 'checked' : ''}> 回答前检索知识库</label></td></tr>
      <tr><th>RAG 条数</th>
          <td><input id="bot-topk" type="number" min="1" max="20" value="${cfg.ragTopK || 5}" style="width:80px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"> (1-20)</td></tr>
      <tr><th>历史轮数</th>
          <td><input id="bot-turns" type="number" min="1" max="50" value="${cfg.historyTurns || 10}" style="width:80px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"> (1-50)</td></tr>
      <tr><th>LLM model 覆盖</th>
          <td><input id="bot-model" type="text" placeholder="留空使用 env 默认" value="${escapeHtml(cfg.model || '')}" style="width:240px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"></td></tr>
    </table>
    <div class="toolbar" style="margin-top:16px;">
      <button class="btn" id="bot-save">保存</button>
      <a class="btn plain" style="text-decoration:none;line-height:34px;padding:0 14px;" href="chat.html?versionId=${localStorage.getItem('currentVersionId')}" target="_blank">打开 C 端对话</a>
      <span id="bot-status" style="margin-left:12px;color:#909399;font-size:12px;"></span>
    </div>`;

  document.getElementById('bot-save').addEventListener('click', async () => {
    const status = document.getElementById('bot-status');
    status.textContent = '保存中…';
    try {
      await window.api.apiFetch('/bot', {
        method: 'PUT', withVersion: true,
        body: {
          persona: document.getElementById('bot-persona').value.trim(),
          welcome: document.getElementById('bot-welcome').value.trim(),
          ragEnabled: document.getElementById('bot-rag').checked,
          ragTopK: parseInt(document.getElementById('bot-topk').value, 10),
          historyTurns: parseInt(document.getElementById('bot-turns').value, 10),
          model: document.getElementById('bot-model').value.trim() || null,
        },
      });
      status.textContent = '✓ 已保存';
    } catch (err) { status.textContent = '保存失败: ' + err.message; }
  });

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
```

- [ ] **Step 2: 修改 admin.html**

找到现有 pages 脚本区,在 users.js 后追加 bots.js:

从:
```html
  <script src="js/pages/users.js"></script>
  <script src="js/pages/knowledge.js"></script>
```

改为:
```html
  <script src="js/pages/users.js"></script>
  <script src="js/pages/knowledge.js"></script>
  <script src="js/pages/bots.js"></script>
```

- [ ] **Step 3: 修改 app.js navigate**

找到:
```js
  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  if (page === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
```

改为:
```js
  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  if (page === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  if (page === 'bots' && window.pages.bots) return window.pages.bots(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/web && node --check js/pages/bots.js && node --check js/app.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/pages/bots.js aiCompanion/web/admin.html aiCompanion/web/js/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): 前端机器人配置页"
```

---

## Task 12: 前端会话列表+详情页

**Files:**
- Create: `aiCompanion/web/js/pages/sessions.js`
- Modify: `aiCompanion/web/admin.html` (引入)
- Modify: `aiCompanion/web/js/app.js` (navigate)

- [ ] **Step 1: 写 sessions.js**

`aiCompanion/web/js/pages/sessions.js`:
```js
window.pages = window.pages || {};

window.pages.sessions = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let list;
  try {
    list = await window.api.apiFetch('/sessions', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = list.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${escapeHtml(s.title || '(无标题)')}</td>
      <td>${s.message_count}</td>
      <td>${new Date(s.updated_at).toLocaleString()}</td>
      <td>
        <button class="btn small" data-view="${s.id}">查看</button>
        <button class="btn small plain" data-del="${s.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="hint">当前版本会话列表(匿名会话,由前端 sessionKey 关联)。</div>
    <table>
      <thead><tr><th>ID</th><th>标题</th><th>消息数</th><th>最近活动</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无会话</td></tr>'}</tbody>
    </table>
    <div id="sess-detail" style="margin-top:20px;"></div>`;

  content.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => viewSession(b.dataset.view)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delSession(b.dataset.del)));

  async function viewSession(id) {
    const detail = document.getElementById('sess-detail');
    detail.innerHTML = '加载中…';
    try {
      const data = await window.api.apiFetch(`/sessions/${id}`, { withVersion: true });
      const msgs = data.messages.map(m => {
        const cls = m.role === 'assistant' ? 'bot' : 'user';
        const who = m.role === 'assistant' ? '机器人' : '用户';
        let refsHtml = '';
        if (m.refs_json) {
          try {
            const refs = typeof m.refs_json === 'string' ? JSON.parse(m.refs_json) : m.refs_json;
            if (refs && refs.length) refsHtml = `<div style="margin-top:6px;font-size:11px;color:#909399;">参考: ${refs.map(r => `#${r.entryId}(${r.score.toFixed(3)})`).join(' ')}</div>`;
          } catch { /* ignore */ }
        }
        return `<div class="msg ${cls}"><b>${who}:</b><br>${escapeHtml(m.content)}${refsHtml}</div>`;
      }).join('');
      detail.innerHTML = `<h4>会话 #${id} 详情</h4><div class="chat-body" style="max-width:100%;border:1px solid #ebeef5;border-radius:8px;">${msgs}</div>`;
    } catch (err) { detail.innerHTML = '失败: ' + err.message; }
  }

  async function delSession(id) {
    if (!confirm('确认删除该会话及全部消息?')) return;
    try {
      await window.api.apiFetch(`/sessions/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.sessions(content);
    } catch (err) { alert('删除失败: ' + err.message); }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
```

- [ ] **Step 2: admin.html 引入**

在 bots.js 后追加:
```html
  <script src="js/pages/sessions.js"></script>
```

- [ ] **Step 3: app.js navigate 加分支**

在 bots 分支后加一行:
```js
  if (page === 'sessions' && window.pages.sessions) return window.pages.sessions(content);
```

最终 navigate 内部:
```js
  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  if (page === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  if (page === 'bots' && window.pages.bots) return window.pages.bots(content);
  if (page === 'sessions' && window.pages.sessions) return window.pages.sessions(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/web && node --check js/pages/sessions.js && node --check js/app.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/pages/sessions.js aiCompanion/web/admin.html aiCompanion/web/js/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): 前端会话列表+详情页"
```

---

## Task 13: C 端 chat.html 独立入口

**Files:**
- Create: `aiCompanion/web/chat.html`
- Create: `aiCompanion/web/css/chat.css`
- Create: `aiCompanion/web/js/chat.js`

- [ ] **Step 1: 写 chat.html**

`aiCompanion/web/chat.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0,user-scalable=no">
  <title>AI 陪伴机器人</title>
  <link rel="stylesheet" href="css/chat.css">
</head>
<body>
  <div class="chat-shell">
    <div class="chat-header">
      <span id="chat-title">陪玩助手</span>
    </div>
    <div class="chat-body" id="chat-body">
      <div class="chat-empty" id="chat-empty">加载中…</div>
    </div>
    <div class="chat-input">
      <textarea id="chat-input" placeholder="说点什么…(Enter 发送,Shift+Enter 换行)" rows="1"></textarea>
      <button id="chat-send">发送</button>
    </div>
  </div>
  <script src="js/chat.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 chat.css**

`aiCompanion/web/css/chat.css`:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #2c3e50; background: #f5f6fa; }

.chat-shell { max-width: 480px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; background: #fff; }
.chat-header { height: 52px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #ebeef5; font-size: 15px; font-weight: 600; }
.chat-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: #f5f6fa; }
.chat-empty { color: #909399; text-align: center; padding: 40px 0; font-size: 13px; }

.msg { max-width: 82%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.msg.user { align-self: flex-end; background: #ff6b6b; color: #fff; border-bottom-right-radius: 2px; }
.msg.bot { align-self: flex-start; background: #fff; border: 1px solid #ebeef5; border-bottom-left-radius: 2px; }
.msg .refs { margin-top: 6px; font-size: 11px; color: #909399; }
.msg.thinking { color: #909399; font-style: italic; }

.chat-input { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #ebeef5; background: #fff; }
.chat-input textarea { flex: 1; min-height: 40px; max-height: 120px; padding: 10px 12px; border: 1px solid #dcdfe6; border-radius: 20px; font: inherit; resize: none; outline: none; }
.chat-input textarea:focus { border-color: #ff6b6b; }
.chat-input button { width: 64px; height: 40px; align-self: flex-end; background: #ff6b6b; color: #fff; border: none; border-radius: 20px; cursor: pointer; font-size: 14px; }
.chat-input button:disabled { background: #f0a5a5; cursor: not-allowed; }
```

- [ ] **Step 3: 写 chat.js**

`aiCompanion/web/js/chat.js`:
```js
const API_BASE = (localStorage.getItem('apiBase') || 'http://localhost:3100') + '/api';

const params = new URLSearchParams(location.search);
const versionId = parseInt(params.get('versionId'), 10);

const bodyEl = document.getElementById('chat-body');
const emptyEl = document.getElementById('chat-empty');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const titleEl = document.getElementById('chat-title');

if (!versionId) {
  emptyEl.textContent = '需要 versionId 参数(如 chat.html?versionId=1)';
  sendBtn.disabled = true;
}

// sessionKey:每个 versionId 独立一份,存 localStorage
const sessionKeyStorage = `chat_sessionKey_v${versionId}`;
let sessionKey = localStorage.getItem(sessionKeyStorage);
if (!sessionKey && versionId) {
  sessionKey = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '_' + Math.random().toString(36).slice(2));
  localStorage.setItem(sessionKeyStorage, sessionKey);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'assistant' ? 'bot' : 'user');
  let refsHtml = '';
  if (refs && refs.length) {
    refsHtml = `<div class="refs">参考自 ${refs.length} 条知识:${refs.map(r => `#${r.entryId}(${r.score.toFixed(3)})`).join(' ')}</div>`;
  }
  div.innerHTML = escapeHtml(content) + refsHtml;
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
}

function appendThinking() {
  const div = document.createElement('div');
  div.className = 'msg bot thinking';
  div.textContent = '思考中…';
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
}

async function fetchJSON(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `请求失败(${res.status})`);
  return data;
}

async function boot() {
  if (!versionId) return;
  try {
    // 先取 welcome + 历史
    const [bot, history] = await Promise.all([
      fetchJSON(`/public/bot?versionId=${versionId}`),
      fetchJSON(`/public/history?versionId=${versionId}&sessionKey=${encodeURIComponent(sessionKey)}`),
    ]);
    if (history.messages.length === 0) {
      // 首次:显示欢迎语
      appendMsg('assistant', bot.welcome);
    } else {
      for (const m of history.messages) {
        const refs = m.refs_json ? (typeof m.refs_json === 'string' ? JSON.parse(m.refs_json) : m.refs_json) : null;
        appendMsg(m.role, m.content, refs);
      }
    }
  } catch (err) {
    emptyEl.textContent = '加载失败: ' + err.message;
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sendBtn.disabled) return;
  inputEl.value = '';
  autoResize();
  appendMsg('user', text);
  sendBtn.disabled = true;
  const thinking = appendThinking();

  try {
    const r = await fetchJSON('/public/chat', {
      method: 'POST',
      body: { versionId, sessionKey, message: text },
    });
    thinking.remove();
    appendMsg('assistant', r.reply, r.refs);
  } catch (err) {
    thinking.remove();
    appendMsg('assistant', '(出错: ' + err.message + ')');
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
inputEl.addEventListener('input', autoResize);

boot();
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/web && node --check js/chat.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/chat.html aiCompanion/web/css/chat.css aiCompanion/web/js/chat.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/bot): C 端 chat.html 匿名对话页(sessionKey+RAG refs)"
```

---

## Task 14: README + changelog

**Files:**
- Modify: `aiCompanion/README.md`
- Create: `.claude/docs/2026-07/2026-07-10/v003_changelog.md`

- [ ] **Step 1: 追加 README**

在 `aiCompanion/README.md` 末尾追加:

```markdown

## 子项目3:机器人+会话+C端对话(v003)

已实现:B 端机器人配置页(每版本一个)、会话列表+详情页、C 端 chat.html 匿名对话页(sessionKey 存 localStorage)、LLM 服务(fetch+重试+可测试替换)、内嵌 RAG(检索当前版本知识库塞进 prompt)。

### 使用
1. `.env` 追加 `LLM_API_URL / LLM_API_KEY / LLM_MODEL`(默认按通义千问 dashscope 兼容协议)。
2. `npm run migrate` 应用 004_bot_chat.sql。
3. `npm run test:chat` 跑集成测试(用假 LLM+假 embedding,无需真 key)。
4. `npm start` 启动。
5. 后台「机器人管理」保存人设 → 打开 `chat.html?versionId=1` 开始对话。

### 已知边界
- 单进程同步对话:一次请求阻塞到 LLM 返回,高并发场景需上流式或队列。
- 历史窗口按条数截断,不做摘要;长会话质量会下降。
- 匿名 session 无清理策略,`chat_sessions` 会长期累积;上生产前应加定时清理。
- refs 只带 snippet(截前 200 字),不开放完整条目查询接口给 C 端。
```

- [ ] **Step 2: 创建 changelog**

`.claude/docs/2026-07/2026-07-10/v003_changelog.md`:
```markdown
# v003 变更文档 · AI 陪伴机器人子项目3

新增机器人 + 会话管理 + C 端匿名对话:B 端机器人配置(每版本唯一)、会话列表+消息详情、C 端 chat.html(sessionKey 存 localStorage 关联会话)、LLM 云 API 封装、内嵌 RAG(每次对话前检索当前版本知识库塞进 prompt)。
```

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/README.md ".claude/docs/2026-07/2026-07-10/v003_changelog.md"
HUSKY_SKIP_HOOKS=1 git commit -m "docs(aiCompanion/bot): README 与 v003 变更文档"
```

---

## 最终验收

1. `cd aiCompanion/server && npm run migrate && npm start`
2. `cd aiCompanion/web && python -m http.server 8090`
3. `http://localhost:8090` admin/Admin123! 登录 → 「机器人管理」保存人设「你是妲己陪玩助手」欢迎语「亲爱的~」→ 保存
4. 「知识库管理」按子项目 2 流程上传 sample.xlsx
5. 「打开 C 端对话」按钮 → chat.html 打开 → 看到欢迎语 → 发问「妲己怎么克制」→ 看到回复 + 「参考自 N 条知识」(需真 LLM key)
6. 刷新页面 → 历史还在
7. 后台「会话管理」→ 看到该会话 + 消息详情
8. 切版本(右上角)→ 打开 chat.html?versionId=v2 → 是全新会话
9. `npm run test:chat` → 10/10 通过

---

**自审通过**:
- **spec 覆盖**:所有表 → Task 2;3 个 service → Task 3-5;3 组路由 → Task 6-8;app.js → Task 9;测试 → Task 10;前端 3 页(bot/session/chat) → Task 11-13;文档 → Task 14。全覆盖。
- **placeholder scan**:无 TBD/TODO/vague。
- **类型一致性**:`versionId` `sessionKey` `refs.entryId`(camelCase for API)vs DB `version_id` `session_key` `entry_id`(snake_case for storage);两侧映射清晰,routes 层做转换。llm/embedding `_setImpl` 签名一致。
