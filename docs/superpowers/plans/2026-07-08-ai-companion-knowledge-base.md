# AI 陪伴机器人 · 子项目2「知识库摄取」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在自建后端地基上加知识库摄取——分片上传 Excel(1G) → 异步流水线解析为「每行一条」知识条目 → embedding 向量化(内存检索) + 结构化图谱抽取；后台提供上传/进度/条目预览/检索/图谱页。

**Architecture:** 沿用 aiCompanion Express+MySQL 单库风格。新增 6 张表(全部带 version_id 经 tenantScope 隔离)、10 个 `/api/kb/*` 路由、6 个 service 模块(uploadStore/excelParser/embedding/vectorStore/graphExtractor/ingestWorker)。摄取走同进程 setInterval 轮询 ingest_jobs；embedding 用 fetch 调云 API(占位 key)；测试用假 embedding 实现(确定性伪向量)覆盖全流程。

**Tech Stack:** Node.js、Express、mysql2、xlsx(SheetJS)、multer；原生 fetch 调 embedding API；无外部队列/向量库。

---

## 前置说明(执行者必读)

- **工作目录**：主工作区 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。所有后端在 `aiCompanion/server/`，前端在 `aiCompanion/web/`。
- **提交被坏钩子拦截**：仓库 `.git/hooks/pre-commit` 是遗留 Husky v4 坏钩子。所有 `git commit` 前缀 `HUSKY_SKIP_HOOKS=1`（钩子官方跳过开关，非 `--no-verify`）。
- **代码风格对齐**：db 在 `src/config/db.js`，中间件 `src/middleware/`，路由 `src/routes/`，service 层新增 `src/services/`；错误响应用 `{ error: '中文' }`(经 `utils/errors.js` 的 `fail(res,status,msg)`)；async 路由**必须**用 `utils/asyncHandler.js` 包裹。
- **地基约定**：所有业务表带 `version_id`；写查询经 `utils/tenantScope.js` 的 `scoped(versionId)` 层。version 中间件从请求头 `X-Version-Id` 拿版本并鉴权，挂 `req.versionId`。
- **数据库要求**：需可连 MySQL。执行者若无库，写完代码 `node --check` 通过即可，并在提交注明「未连库验证」。真跑测试需 `npm run migrate` 后 `npm test`。
- **测试方式**：Node 内置 `assert` + `http` 真实调用；不引入测试框架。embedding **不调真云 API**，用测试专用的假实现(确定性伪向量)覆盖流程。
- **占位密钥**：`.env.example` 加 `EMBEDDING_API_KEY`, `EMBEDDING_API_URL`, `EMBEDDING_MODEL`。真跑需要用户填。

---

## 文件结构

**后端新增/修改**：
- Create `aiCompanion/server/migrations/003_kb.sql` — 6 张 KB 表
- Create `aiCompanion/server/src/config/kb.js` — 分片大小、embedding 配置、检索 topk
- Create `aiCompanion/server/src/services/uploadStore.js` — 分片上传会话/写盘/合并
- Create `aiCompanion/server/src/services/excelParser.js` — SheetJS 流式解析
- Create `aiCompanion/server/src/services/embedding.js` — 云 API 向量化 + 重试；导出可替换句柄供测试注入
- Create `aiCompanion/server/src/services/vectorStore.js` — 内存向量索引，余弦 top-k
- Create `aiCompanion/server/src/services/graphExtractor.js` — 结构化行抽实体/关系
- Create `aiCompanion/server/src/services/ingestWorker.js` — 轮询 ingest_jobs，跑流水线
- Create `aiCompanion/server/src/routes/kb.js` — 所有 `/api/kb/*` 路由
- Modify `aiCompanion/server/src/app.js` — 挂 kb 路由 + 启动 worker + vectorStore.loadAll
- Modify `aiCompanion/server/package.json` — 加 xlsx / multer 依赖
- Modify `aiCompanion/server/.env.example` — 加 embedding 环境变量
- Create `aiCompanion/server/test/kb.run.js` — KB 集成测试(用假 embedding)
- Create `aiCompanion/server/test/fixtures/sample.xlsx.js` — 生成小样本 Excel 的脚本

**前端修改**：
- Modify `aiCompanion/web/js/pages/knowledge.js`(当前是占位) → 真实页
- Modify `aiCompanion/web/admin.html` — 引入 knowledge.js
- Modify `aiCompanion/web/js/app.js` — 路由到 knowledge 页

---

## Task 1: 依赖与配置

**Files:**
- Modify: `aiCompanion/server/package.json`
- Modify: `aiCompanion/server/.env.example`
- Create: `aiCompanion/server/src/config/kb.js`

- [ ] **Step 1: 加依赖**

修改 `aiCompanion/server/package.json` 的 `dependencies`，添加 xlsx 和 multer：
```json
"dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.10.1",
    "xlsx": "^0.18.5"
  },
```

- [ ] **Step 2: 加环境变量**

在 `aiCompanion/server/.env.example` 末尾追加：
```
# —— 知识库(KB)配置 ——
# embedding 云 API：以通义千问 text-embedding-v2 为例；换 OpenAI/智谱只改这三项
EMBEDDING_API_URL=https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding
EMBEDDING_API_KEY=your_api_key_here
EMBEDDING_MODEL=text-embedding-v2
EMBEDDING_DIM=1536

# 分片上传临时目录（相对 server 目录）
KB_UPLOAD_TMP_DIR=uploads/tmp

# worker 轮询间隔(ms)
KB_WORKER_INTERVAL=2000
```

- [ ] **Step 3: 创建 kb 配置模块**

`aiCompanion/server/src/config/kb.js`:
```js
// 知识库子系统配置。集中在此，方便测试替换。
const path = require('path');

module.exports = {
  chunkSize: 5 * 1024 * 1024,           // 前端分片大小(仅供前端参考)
  uploadTmpDir: path.resolve(__dirname, '..', '..', process.env.KB_UPLOAD_TMP_DIR || 'uploads/tmp'),
  batchSize: 50,                        // 每批 embedding 请求条数
  workerIntervalMs: parseInt(process.env.KB_WORKER_INTERVAL, 10) || 2000,
  searchDefaultTopK: 10,
  searchMaxTopK: 50,

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

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/server && node --check src/config/kb.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage"
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/package.json aiCompanion/server/.env.example aiCompanion/server/src/config/kb.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 依赖(xlsx/multer) + 环境变量 + kb 配置"
```

---

## Task 2: 数据库迁移(6 张 KB 表)

**Files:**
- Create: `aiCompanion/server/migrations/003_kb.sql`

- [ ] **Step 1: 写迁移 SQL**

`aiCompanion/server/migrations/003_kb.sql`:
```sql
USE ai_companion;

CREATE TABLE IF NOT EXISTS kb_documents (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  name       VARCHAR(255) NOT NULL,
  status     VARCHAR(16) NOT NULL DEFAULT 'uploading',  -- uploading|parsing|done|failed
  row_count  INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kb_docs_ver (version_id),
  FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|processing|done|failed
  total       INT NOT NULL DEFAULT 0,
  processed   INT NOT NULL DEFAULT 0,
  error       TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_status (status),
  INDEX idx_jobs_ver (version_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  row_index   INT NOT NULL,
  content     TEXT NOT NULL,
  raw_json    JSON NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entries_ver_doc (version_id, document_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_vectors (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  entry_id   INT NOT NULL UNIQUE,
  embedding  JSON NOT NULL,
  dim        INT  NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vec_ver (version_id),
  FOREIGN KEY (version_id) REFERENCES versions(id)          ON DELETE CASCADE,
  FOREIGN KEY (entry_id)   REFERENCES knowledge_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_entities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  document_id INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(64)  NOT NULL,
  props_json  JSON NULL,
  UNIQUE KEY uniq_entity (version_id, name, type),
  INDEX idx_ent_ver_doc (version_id, document_id),
  FOREIGN KEY (version_id)  REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_relations (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  version_id     INT NOT NULL,
  from_entity_id INT NOT NULL,
  to_entity_id   INT NOT NULL,
  relation       VARCHAR(64) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rel_ver (version_id),
  INDEX idx_rel_from (from_entity_id),
  INDEX idx_rel_to (to_entity_id),
  FOREIGN KEY (version_id)     REFERENCES versions(id)     ON DELETE CASCADE,
  FOREIGN KEY (from_entity_id) REFERENCES kb_entities(id)  ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id)   REFERENCES kb_entities(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: (可选，需 MySQL)执行迁移**

Run: `cd aiCompanion/server && npm install && npm run migrate`
Expected: 打印 `Running 003_kb.sql... ✓ done`。无库则跳过，提交注明。

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Administrator/AppData/Roaming/Code/User/project manage"
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/migrations/003_kb.sql
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 数据库迁移(6 张 KB 表)"
```

---

## Task 3: uploadStore 服务(分片上传)

**Files:**
- Create: `aiCompanion/server/src/services/uploadStore.js`

- [ ] **Step 1: 实现分片管理**

`aiCompanion/server/src/services/uploadStore.js`:
```js
// 分片上传会话管理：内存 Map 存元信息 + 本地磁盘存分片文件。
// 重启会话丢失（前端需重新 init 上传，可接受）。
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg  = require('../config/kb');

const sessions = new Map();  // uploadId -> { name, size, totalChunks, receivedIndexes:Set, dir, versionId, userId }

function ensureTmpRoot() {
  if (!fs.existsSync(cfg.uploadTmpDir)) fs.mkdirSync(cfg.uploadTmpDir, { recursive: true });
}

function init({ name, size, totalChunks, versionId, userId }) {
  ensureTmpRoot();
  const uploadId = crypto.randomBytes(12).toString('hex');
  const dir = path.join(cfg.uploadTmpDir, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  sessions.set(uploadId, {
    name, size, totalChunks, dir, versionId, userId,
    receivedIndexes: new Set(),
  });
  return uploadId;
}

function get(uploadId) { return sessions.get(uploadId); }

function saveChunk(uploadId, index, buffer) {
  const s = sessions.get(uploadId);
  if (!s) throw Object.assign(new Error('uploadId 不存在'), { status: 404 });
  fs.writeFileSync(path.join(s.dir, `${index}`), buffer);
  s.receivedIndexes.add(Number(index));
  return { received: s.receivedIndexes.size };
}

function missingChunks(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) return null;
  const missing = [];
  for (let i = 0; i < s.totalChunks; i++) if (!s.receivedIndexes.has(i)) missing.push(i);
  return missing;
}

// 合并所有分片到一个完整文件；返回最终文件路径。
function mergeChunks(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) throw Object.assign(new Error('uploadId 不存在'), { status: 404 });
  const missing = missingChunks(uploadId);
  if (missing.length > 0) {
    throw Object.assign(new Error(`缺少分片: ${missing.join(',')}`), { status: 400 });
  }
  const finalPath = path.join(s.dir, '__merged__' + path.extname(s.name || '.xlsx'));
  const out = fs.createWriteStream(finalPath);
  for (let i = 0; i < s.totalChunks; i++) {
    const chunk = fs.readFileSync(path.join(s.dir, `${i}`));
    out.write(chunk);
  }
  out.end();
  return finalPath;
}

// 清理该会话临时目录（解析完成后调用）
function cleanup(uploadId) {
  const s = sessions.get(uploadId);
  if (!s) return;
  try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* ignore */ }
  sessions.delete(uploadId);
}

module.exports = { init, get, saveChunk, missingChunks, mergeChunks, cleanup };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/uploadStore.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/uploadStore.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): uploadStore 分片上传服务"
```

---

## Task 4: excelParser 服务(SheetJS 解析)

**Files:**
- Create: `aiCompanion/server/src/services/excelParser.js`

- [ ] **Step 1: 实现流式解析**

`aiCompanion/server/src/services/excelParser.js`:
```js
// Excel 解析：读取 xlsx/xls/csv，返回表头 + 逐行迭代器。
// 每行 → { rowIndex, obj:{列名:值}, content:'列名: 值\n列名: 值...' }
const XLSX = require('xlsx');

// 打开文件，返回 {sheetName, headers, rowCount, iterate()} 其中 iterate 是生成器
function open(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) return { sheetName, headers: [], rowCount: 0, iterate: function* () {} };

  const headers = rows[0].map(h => String(h == null ? '' : h).trim());
  const dataRows = rows.slice(1);
  const rowCount = dataRows.length;

  function* iterate() {
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `col${c}`;
        obj[key] = row[c] == null ? '' : row[c];
      }
      // 「列名: 值」逐行拼成自然语言文本
      const content = headers
        .map((h, c) => `${h || 'col' + c}: ${row[c] == null ? '' : row[c]}`)
        .join('\n');
      yield { rowIndex: i + 1, obj, content };
    }
  }

  return { sheetName, headers, rowCount, iterate };
}

module.exports = { open };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/excelParser.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/excelParser.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): excelParser 服务(SheetJS)"
```

---

## Task 5: embedding 服务(可测试替换)

**Files:**
- Create: `aiCompanion/server/src/services/embedding.js`

- [ ] **Step 1: 实现批量向量化**

`aiCompanion/server/src/services/embedding.js`:
```js
// embedding 云 API 封装：默认 fetch 调用；测试可替换 impl 为假实现（确定性伪向量）。
const cfg = require('../config/kb');

// 默认实现：调云 API（本仓库以通义千问 text-embedding 为例；换其他厂商改 request 结构即可）。
async function realEmbedBatch(texts) {
  const { apiUrl, apiKey, model, dim, retries, retryBaseMs } = cfg.embedding;
  if (!apiKey) throw new Error('EMBEDDING_API_KEY 未配置');

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: { texts } }),
      });
      if (!res.ok) throw new Error(`embedding API ${res.status}: ${await res.text()}`);
      const data = await res.json();
      // 通义响应结构：data.output.embeddings = [{embedding:[...], text_index:0}, ...]
      const arr = ((data && data.output && data.output.embeddings) || []).sort((a, b) => a.text_index - b.text_index);
      return arr.map(e => e.embedding);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, retryBaseMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// 当前生效的实现（可替换）
let impl = realEmbedBatch;

async function embedBatch(texts) { return impl(texts); }

// 测试注入：传 null 恢复真实实现
function _setImpl(fn) { impl = fn || realEmbedBatch; }

module.exports = { embedBatch, _setImpl };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/embedding.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/embedding.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): embedding 服务(可测试替换)"
```

---

## Task 6: vectorStore 服务(内存索引)

**Files:**
- Create: `aiCompanion/server/src/services/vectorStore.js`

- [ ] **Step 1: 实现内存索引 + 余弦检索**

`aiCompanion/server/src/services/vectorStore.js`:
```js
// 内存向量索引，按 version_id 分组。启动加载全部；后续增删同步。
const db = require('../config/db');

// versionId -> Array<{entryId, vec:Float32Array}>
const store = new Map();

function _get(versionId) {
  if (!store.has(versionId)) store.set(versionId, []);
  return store.get(versionId);
}

async function loadAll() {
  store.clear();
  const [rows] = await db.query('SELECT version_id, entry_id, embedding FROM kb_vectors');
  for (const r of rows) {
    let vec;
    try { vec = Float32Array.from(JSON.parse(r.embedding)); } catch { continue; }
    _get(r.version_id).push({ entryId: r.entry_id, vec });
  }
}

function add(versionId, entryId, embeddingArray) {
  _get(versionId).push({ entryId, vec: Float32Array.from(embeddingArray) });
}

function removeEntry(versionId, entryId) {
  const arr = _get(versionId);
  const idx = arr.findIndex(x => x.entryId === entryId);
  if (idx >= 0) arr.splice(idx, 1);
}

function removeDocument(versionId, entryIds) {
  const set = new Set(entryIds);
  const arr = _get(versionId);
  store.set(versionId, arr.filter(x => !set.has(x.entryId)));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 检索：仅在同 versionId 内做（隔离保证）
function search(versionId, queryVec, topK = 10) {
  const arr = _get(versionId);
  const qv = Float32Array.from(queryVec);
  const scored = arr.map(x => ({ entryId: x.entryId, score: cosine(qv, x.vec) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { loadAll, add, removeEntry, removeDocument, search, _store: store };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/vectorStore.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/vectorStore.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): vectorStore 内存索引与余弦检索"
```

---

## Task 7: graphExtractor 服务(结构化图谱抽取)

**Files:**
- Create: `aiCompanion/server/src/services/graphExtractor.js`

- [ ] **Step 1: 实现抽取逻辑**

`aiCompanion/server/src/services/graphExtractor.js`:
```js
// 从结构化行抽实体/关系：首列作主实体；其它非空列的值若与另一行的主实体重名，则建立关系。
// 简单启发式，不调 LLM，适合表格类知识；复杂自由文本抽取后期再加。
const db = require('../config/db');

// upsertEntity: 依赖 UNIQUE(version_id, name, type)，冲突时用 INSERT ... ON DUPLICATE KEY UPDATE。
async function upsertEntity({ versionId, documentId, name, type, props }) {
  const propsJson = JSON.stringify(props || {});
  const [r] = await db.query(
    `INSERT INTO kb_entities (version_id, document_id, name, type, props_json)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE props_json=VALUES(props_json), document_id=VALUES(document_id)`,
    [versionId, documentId, name, type, propsJson]
  );
  // 拿 id：ON DUPLICATE 更新时 insertId 不可靠，查一遍
  const [rows] = await db.query(
    'SELECT id FROM kb_entities WHERE version_id=? AND name=? AND type=?',
    [versionId, name, type]
  );
  return rows[0] ? rows[0].id : null;
}

async function addRelation(versionId, fromId, toId, relation) {
  if (!fromId || !toId || fromId === toId) return;
  await db.query(
    'INSERT INTO kb_relations (version_id, from_entity_id, to_entity_id, relation) VALUES (?,?,?,?)',
    [versionId, fromId, toId, relation]
  );
}

// 主入口：传入 rows(已解析的 [{obj, rowIndex}]) 和 headers。
// 阶段一：为每行首列建主实体。阶段二：遍历其它列，若值命中已存在的主实体名，则建关系。
async function extract({ versionId, documentId, headers, rows }) {
  if (headers.length === 0) return { entityCount: 0, relationCount: 0 };
  const primaryCol = headers[0];
  const primaryType = primaryCol || 'entity';

  // 阶段一：主实体
  const nameToId = new Map();
  for (const r of rows) {
    const name = String(r.obj[primaryCol] || '').trim();
    if (!name) continue;
    const id = await upsertEntity({ versionId, documentId, name, type: primaryType, props: r.obj });
    if (id) nameToId.set(name, id);
  }

  // 阶段二：关系
  let relCount = 0;
  for (const r of rows) {
    const fromName = String(r.obj[primaryCol] || '').trim();
    const fromId = nameToId.get(fromName);
    if (!fromId) continue;
    for (let c = 1; c < headers.length; c++) {
      const col = headers[c];
      const val = String(r.obj[col] || '').trim();
      if (!val) continue;
      // 若值匹配任一主实体名（跨行同名 → 关系）
      const toId = nameToId.get(val);
      if (toId && toId !== fromId) {
        await addRelation(versionId, fromId, toId, col);
        relCount++;
      }
    }
  }

  return { entityCount: nameToId.size, relationCount: relCount };
}

module.exports = { extract, upsertEntity, addRelation };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/graphExtractor.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/graphExtractor.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): graphExtractor 结构化图谱抽取"
```

---

## Task 8: ingestWorker 服务(流水线轮询)

**Files:**
- Create: `aiCompanion/server/src/services/ingestWorker.js`

- [ ] **Step 1: 实现 worker**

`aiCompanion/server/src/services/ingestWorker.js`:
```js
// 摄取流水线：轮询 ingest_jobs(pending)，跑「解析 → 写条目 → 向量化 → 图谱抽取」，更新进度。
// 同进程 setInterval，crash-safe：一次只挑一个 job；异常置 failed 记 error，不中断循环。
const fs = require('fs');
const db = require('../config/db');
const cfg = require('../config/kb');
const excelParser = require('./excelParser');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');
const graphExtractor = require('./graphExtractor');

let timer = null;
let running = false;

// 拿一个 pending job（原子占位：UPDATE 到 processing）
async function claimNextJob() {
  const [rows] = await db.query('SELECT id FROM ingest_jobs WHERE status="pending" ORDER BY id LIMIT 1');
  if (rows.length === 0) return null;
  const id = rows[0].id;
  const [r] = await db.query(
    'UPDATE ingest_jobs SET status="processing", updated_at=NOW() WHERE id=? AND status="pending"',
    [id]
  );
  if (r.affectedRows === 0) return null;  // 被别人抢了
  const [full] = await db.query('SELECT * FROM ingest_jobs WHERE id=?', [id]);
  return full[0];
}

async function markDone(jobId) {
  await db.query('UPDATE ingest_jobs SET status="done", updated_at=NOW() WHERE id=?', [jobId]);
}
async function markFailed(jobId, err) {
  const msg = (err && (err.message || String(err))).slice(0, 500);
  await db.query('UPDATE ingest_jobs SET status="failed", error=?, updated_at=NOW() WHERE id=?', [msg, jobId]);
}
async function updateProgress(jobId, processed, total) {
  await db.query('UPDATE ingest_jobs SET processed=?, total=?, updated_at=NOW() WHERE id=?', [processed, total, jobId]);
}

async function processJob(job) {
  const versionId = job.version_id;
  const documentId = job.document_id;

  // 拿文件路径：kb_documents 存 name；上传阶段的 finalPath 记录到 documents 表的临时字段？这里改为约定路径
  // 我们在 uploadStore.mergeChunks 返回后由路由把路径写入 kb_documents 一个我们暂时没建的列。
  // 为避免 schema 改动，把 finalPath 存到 documents.name 之外——但更清晰的做法：documents 加 source_path 列。
  // 本任务实现：以 kb_documents.name（含合并后完整路径）读取；上传路由负责写入完整路径。
  const [docRows] = await db.query('SELECT name FROM kb_documents WHERE id=?', [documentId]);
  if (docRows.length === 0) throw new Error('kb_documents 记录不存在');
  const meta = JSON.parse(docRows[0].name || '{}');
  const filePath = meta.path;
  if (!filePath || !fs.existsSync(filePath)) throw new Error('文件不存在: ' + filePath);

  await db.query('UPDATE kb_documents SET status="parsing" WHERE id=?', [documentId]);

  const parsed = excelParser.open(filePath);
  const total = parsed.rowCount;
  await updateProgress(job.id, 0, total);

  // 收集所有行到内存（图谱抽取需要跨行匹配；1G 场景下先按需限制）
  const allRows = [];
  for (const row of parsed.iterate()) allRows.push(row);

  // 分批：写条目 + 向量化
  let processed = 0;
  for (let i = 0; i < allRows.length; i += cfg.batchSize) {
    const batch = allRows.slice(i, i + cfg.batchSize);
    // 写条目
    const entryIds = [];
    for (const r of batch) {
      const [ins] = await db.query(
        'INSERT INTO knowledge_entries (version_id, document_id, row_index, content, raw_json) VALUES (?,?,?,?,?)',
        [versionId, documentId, r.rowIndex, r.content, JSON.stringify(r.obj)]
      );
      entryIds.push(ins.insertId);
    }
    // 向量化
    const vectors = await embedding.embedBatch(batch.map(r => r.content));
    for (let k = 0; k < entryIds.length; k++) {
      const vec = vectors[k];
      if (!vec) continue;
      await db.query(
        'INSERT INTO kb_vectors (version_id, entry_id, embedding, dim) VALUES (?,?,?,?)',
        [versionId, entryIds[k], JSON.stringify(vec), vec.length]
      );
      vectorStore.add(versionId, entryIds[k], vec);
    }
    processed += batch.length;
    await updateProgress(job.id, processed, total);
  }

  // 图谱抽取
  await graphExtractor.extract({ versionId, documentId, headers: parsed.headers, rows: allRows });

  // 完成
  await db.query('UPDATE kb_documents SET status="done", row_count=? WHERE id=?', [total, documentId]);

  // 清理原始文件
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const job = await claimNextJob();
    if (!job) return;
    try {
      await processJob(job);
      await markDone(job.id);
    } catch (err) {
      console.error('[ingestWorker] job', job.id, 'failed:', err.message);
      try { await db.query('UPDATE kb_documents SET status="failed" WHERE id=?', [job.document_id]); } catch { /* ignore */ }
      await markFailed(job.id, err);
    }
  } catch (err) {
    console.error('[ingestWorker] tick error:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, cfg.workerIntervalMs);
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, _processJob: processJob };
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/services/ingestWorker.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/services/ingestWorker.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): ingestWorker 流水线轮询"
```

---

## Task 9: kb 路由(所有 /api/kb/*)

**Files:**
- Create: `aiCompanion/server/src/routes/kb.js`

说明：上一任务里 processJob 读的是 `kb_documents.name` 里存的 JSON `{ path, originalName }`。上传路由 complete 时按此格式写入。

- [ ] **Step 1: 实现路由**

`aiCompanion/server/src/routes/kb.js`:
```js
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const uploadStore = require('../services/uploadStore');
const embedding = require('../services/embedding');
const vectorStore = require('../services/vectorStore');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 所有 kb 接口都要 version 隔离
router.use(version);

// —— 分片上传 ——
router.post('/uploads/init', ah(async (req, res) => {
  const { name, size, totalChunks } = req.body || {};
  if (!name || !size || !totalChunks) return fail(res, 400, 'name/size/totalChunks 必填');
  const uploadId = uploadStore.init({
    name, size, totalChunks: parseInt(totalChunks, 10),
    versionId: req.versionId, userId: req.user.id,
  });
  res.status(201).json({ uploadId, chunkSize: cfg.chunkSize });
}));

router.post('/uploads/:id/chunk', upload.single('chunk'), ah(async (req, res) => {
  const s = uploadStore.get(req.params.id);
  if (!s) return fail(res, 404, 'uploadId 不存在，请重新 init');
  if (s.versionId !== req.versionId) return fail(res, 403, '版本不匹配');
  const index = parseInt(req.body.index, 10);
  if (Number.isNaN(index) || !req.file) return fail(res, 400, 'index 或分片数据缺失');
  const r = uploadStore.saveChunk(req.params.id, index, req.file.buffer);
  res.json(r);
}));

router.post('/uploads/:id/complete', ah(async (req, res) => {
  const s = uploadStore.get(req.params.id);
  if (!s) return fail(res, 404, 'uploadId 不存在');
  if (s.versionId !== req.versionId) return fail(res, 403, '版本不匹配');
  const missing = uploadStore.missingChunks(req.params.id);
  if (missing.length > 0) return fail(res, 400, `缺少分片: ${missing.join(',')}`);

  const finalPath = uploadStore.mergeChunks(req.params.id);
  const meta = JSON.stringify({ path: finalPath, originalName: s.name });
  const [docIns] = await db.query(
    'INSERT INTO kb_documents (version_id, name, status) VALUES (?,?,"pending")',
    [req.versionId, meta]
  );
  const documentId = docIns.insertId;
  const [jobIns] = await db.query(
    'INSERT INTO ingest_jobs (version_id, document_id, status) VALUES (?,?,"pending")',
    [req.versionId, documentId]
  );
  // 只清空 session Map，保留磁盘目录（processJob 完成后再删）
  const sessionsMap = uploadStore.get(req.params.id);
  if (sessionsMap) sessionsMap.receivedIndexes = new Set();  // 已合并，索引不再需要
  res.status(201).json({ documentId, jobId: jobIns.insertId });
}));

// —— 任务进度 ——
router.get('/jobs/:id', ah(async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, status, total, processed, error FROM ingest_jobs WHERE id=? AND version_id=?',
    [req.params.id, req.versionId]
  );
  if (rows.length === 0) return fail(res, 404, '任务不存在');
  res.json(rows[0]);
}));

// —— 文档列表/删除 ——
router.get('/documents', ah(async (_req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, status, row_count, created_at FROM kb_documents WHERE version_id=? ORDER BY id DESC',
    [_req.versionId]
  );
  // 把 name JSON 拆开
  const out = rows.map(r => {
    let meta = {}; try { meta = JSON.parse(r.name); } catch { /* ignore */ }
    return { id: r.id, name: meta.originalName || r.name, status: r.status, rowCount: r.row_count, createdAt: r.created_at };
  });
  res.json(out);
}));

router.delete('/documents/:id', ah(async (req, res) => {
  // 收集 entryIds 从内存索引移除
  const [entries] = await db.query('SELECT id FROM knowledge_entries WHERE version_id=? AND document_id=?', [req.versionId, req.params.id]);
  const entryIds = entries.map(e => e.id);
  const [r] = await db.query('DELETE FROM kb_documents WHERE version_id=? AND id=?', [req.versionId, req.params.id]);
  if (r.affectedRows === 0) return fail(res, 404, '文档不存在');
  vectorStore.removeDocument(req.versionId, entryIds);
  res.json({ ok: true });
}));

// —— 条目预览 ——
router.get('/entries', ah(async (req, res) => {
  const documentId = parseInt(req.query.documentId, 10);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  if (!documentId) return fail(res, 400, 'documentId 必填');
  const [rows] = await db.query(
    'SELECT id, row_index, content, raw_json FROM knowledge_entries WHERE version_id=? AND document_id=? ORDER BY row_index LIMIT ? OFFSET ?',
    [req.versionId, documentId, limit, offset]
  );
  res.json(rows);
}));

// —— 检索 ——
router.get('/search', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const topK = Math.min(parseInt(req.query.limit, 10) || cfg.searchDefaultTopK, cfg.searchMaxTopK);
  if (!q) return fail(res, 400, 'q 必填');
  const [qvec] = await embedding.embedBatch([q]);
  if (!qvec) return fail(res, 500, '查询向量化失败');
  const hits = vectorStore.search(req.versionId, qvec, topK);
  if (hits.length === 0) return res.json([]);
  const ids = hits.map(h => h.entryId);
  const [rows] = await db.query(
    `SELECT id, document_id, row_index, content FROM knowledge_entries WHERE version_id=? AND id IN (${ids.map(() => '?').join(',')})`,
    [req.versionId, ...ids]
  );
  const byId = new Map(rows.map(r => [r.id, r]));
  res.json(hits.map(h => ({ score: h.score, entry: byId.get(h.entryId) || null })));
}));

// —— 图谱 ——
router.get('/graph', ah(async (req, res) => {
  const documentId = parseInt(req.query.documentId, 10);
  if (!documentId) return fail(res, 400, 'documentId 必填');
  const [entities] = await db.query(
    'SELECT id, name, type FROM kb_entities WHERE version_id=? AND document_id=?',
    [req.versionId, documentId]
  );
  const ids = entities.map(e => e.id);
  let relations = [];
  if (ids.length > 0) {
    const [r] = await db.query(
      `SELECT id, from_entity_id, to_entity_id, relation FROM kb_relations
        WHERE version_id=? AND from_entity_id IN (${ids.map(() => '?').join(',')})`,
      [req.versionId, ...ids]
    );
    relations = r;
  }
  res.json({ entities, relations });
}));

module.exports = router;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/routes/kb.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/routes/kb.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): kb 路由(上传/进度/文档/条目/检索/图谱)"
```

---

## Task 10: app.js 挂载 + 启动 worker

**Files:**
- Modify: `aiCompanion/server/src/app.js`

- [ ] **Step 1: 修改 app.js**

将 `aiCompanion/server/src/app.js` 修改为：
```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/kb',       require('./routes/kb'));

app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3100;
if (require.main === module) {
  // 启动前加载向量索引并启动 worker
  const vectorStore = require('./services/vectorStore');
  const ingestWorker = require('./services/ingestWorker');
  vectorStore.loadAll()
    .then(() => { ingestWorker.start(); })
    .catch(err => console.error('[startup] loadAll failed:', err.message));

  app.listen(PORT, () => console.log(`AI Companion server on http://localhost:${PORT}`));
}

module.exports = app;
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check src/app.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/src/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): app.js 挂 /api/kb + 启动 worker/向量加载"
```

---

## Task 11: 生成测试样本 Excel 脚本

**Files:**
- Create: `aiCompanion/server/test/fixtures/generate.js`

- [ ] **Step 1: 写生成脚本**

`aiCompanion/server/test/fixtures/generate.js`:
```js
// 生成小样本 Excel 用于集成测试。运行：node test/fixtures/generate.js
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const rows = [
  ['英雄', '定位', '克制', '推荐出装'],
  ['亚瑟',  '战士',  '妲己',   '不祥征兆'],
  ['妲己',  '法师',  '亚瑟',   '回响法杖'],
  ['后羿',  '射手',  '妲己',   '破晓'],
  ['庄周',  '辅助',  '',       '极寒风暴'],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'heroes');
const out = path.join(__dirname, 'sample.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });
XLSX.writeFile(wb, out);
console.log('generated', out);
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check test/fixtures/generate.js`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/test/fixtures/generate.js
HUSKY_SKIP_HOOKS=1 git commit -m "test(aiCompanion/kb): 样本 Excel 生成脚本"
```

---

## Task 12: KB 集成测试

**Files:**
- Create: `aiCompanion/server/test/kb.run.js`

说明：测试前 `node test/fixtures/generate.js` 生成 sample.xlsx；测试中注入假 embedding（把文本简单哈希成固定维度伪向量）跑通完整流程，不依赖真云 API。

- [ ] **Step 1: 写测试脚本**

`aiCompanion/server/test/kb.run.js`:
```js
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const ingestWorker = require('../src/services/ingestWorker');

const PORT = process.env.KB_TEST_PORT || 3198;

// 假 embedding：把文本按字符 charCode 求和分散到固定维度，确定性
function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x*x, 0)) || 1;
  return v.map(x => x / norm);
}
embedding._setImpl(async texts => texts.map(t => fakeEmbed(t)));

function req(method, urlPath, { token, versionId, body, form } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (versionId) headers['X-Version-Id'] = String(versionId);
    let data;
    if (form) {
      const boundary = '----kbtest' + Date.now();
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const parts = [];
      for (const [k, v] of Object.entries(form.fields || {})) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
      }
      if (form.file) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${form.file.name}"; filename="${form.file.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
      }
      const head = Buffer.from(parts.join(''), 'utf8');
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      data = Buffer.concat(form.file ? [head, form.file.buffer, tail] : [head, tail]);
      headers['Content-Length'] = data.length;
    } else if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
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
    // 登录：用地基 seed 的超管
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;

    // 拿两个版本
    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;
    const v2 = me.body.versions[1] ? me.body.versions[1].id : v1;

    // 生成样本
    require('./fixtures/generate');
    const samplePath = path.join(__dirname, 'fixtures', 'sample.xlsx');
    const fileBuf = fs.readFileSync(samplePath);

    // 1) 分片上传（就切 2 片测试分片流程）
    let uploadId, documentId, jobId;
    await test('分片 init', async () => {
      const r = await req('POST', '/api/kb/uploads/init', {
        token, versionId: v1,
        body: { name: 'sample.xlsx', size: fileBuf.length, totalChunks: 2 },
      });
      assert.strictEqual(r.status, 201);
      uploadId = r.body.uploadId;
      assert.ok(uploadId);
    });

    const half = Math.floor(fileBuf.length / 2);
    const p1 = fileBuf.slice(0, half);
    const p2 = fileBuf.slice(half);

    await test('分片0上传', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '0' }, file: { name: 'chunk', filename: 'chunk0', buffer: p1 } },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('缺片 complete 返回 400', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(r.status, 400);
    });

    await test('分片1上传', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '1' }, file: { name: 'chunk', filename: 'chunk1', buffer: p2 } },
      });
      assert.strictEqual(r.status, 200);
    });

    await test('complete 建 job', async () => {
      const r = await req('POST', `/api/kb/uploads/${uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(r.status, 201);
      documentId = r.body.documentId;
      jobId = r.body.jobId;
      assert.ok(documentId && jobId);
    });

    // 2) 手动跑 worker(不等 setInterval)
    await test('worker 跑通', async () => {
      await ingestWorker.tick();
      const r = await req('GET', `/api/kb/jobs/${jobId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.status, 'done', 'job 应为 done，实际 ' + r.body.status + ' error=' + r.body.error);
    });

    // 3) 条目 / 检索 / 图谱
    await test('条目落库', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 4);
      assert.ok(r.body[0].content.includes('英雄:'));
    });

    await test('检索返回结果', async () => {
      const r = await req('GET', `/api/kb/search?q=${encodeURIComponent('妲己')}&limit=3`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.length > 0);
    });

    await test('图谱：4 个实体，含关系', async () => {
      const r = await req('GET', `/api/kb/graph?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.entities.length, 4);
      assert.ok(r.body.relations.length >= 2, '至少 2 条克制关系');
    });

    // 4) 版本隔离
    await test('v2 看不到 v1 的文档', async () => {
      const r = await req('GET', '/api/kb/documents', { token, versionId: v2 });
      assert.strictEqual(r.status, 200);
      assert.ok(!r.body.some(d => d.id === documentId));
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

main();
```

- [ ] **Step 2: 校验语法**

Run: `cd aiCompanion/server && node --check test/kb.run.js`
Expected: 无输出

- [ ] **Step 3: 加 test:kb 脚本**

修改 `aiCompanion/server/package.json` 的 scripts：
```json
"scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "migrate": "node migrations/run.js",
    "test": "node test/run.js",
    "test:kb": "node test/kb.run.js"
  },
```

- [ ] **Step 4: (可选，需 MySQL+已迁移) 跑测试**

Run: `cd aiCompanion/server && npm run test:kb`
Expected: `10 个测试全部通过`

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/server/test/kb.run.js aiCompanion/server/package.json
HUSKY_SKIP_HOOKS=1 git commit -m "test(aiCompanion/kb): 集成测试(分片/摄取/检索/图谱/隔离)"
```

---

## Task 13: 前端知识库管理页

**Files:**
- Modify: `aiCompanion/web/js/pages/knowledge.js` (若不存在则新建)
- Modify: `aiCompanion/web/admin.html` (引入 knowledge.js)
- Modify: `aiCompanion/web/js/app.js` (路由到 knowledge 页)

- [ ] **Step 1: 写知识库管理页**

`aiCompanion/web/js/pages/knowledge.js`:
```js
window.pages = window.pages || {};

const CHUNK_SIZE = 5 * 1024 * 1024;

window.pages.knowledge = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let docs = [];
  try {
    docs = await window.api.apiFetch('/kb/documents', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = docs.map(d => `
    <tr>
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.status}</td>
      <td>${d.rowCount}</td>
      <td>
        <button class="btn small" data-preview="${d.id}">预览</button>
        <button class="btn small plain" data-del="${d.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="toolbar">
      <input type="file" id="kb-file" accept=".xlsx,.xls,.csv" />
      <button class="btn" id="kb-upload">上传</button>
      <span id="kb-progress"></span>
    </div>
    <table>
      <thead><tr><th>ID</th><th>文件名</th><th>状态</th><th>行数</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无文档</td></tr>'}</tbody>
    </table>

    <h3 style="margin-top:24px;">检索测试</h3>
    <div class="toolbar">
      <input id="kb-q" type="text" placeholder="输入检索词" style="flex:1;height:34px;padding:0 10px;border:1px solid #dcdfe6;border-radius:6px;" />
      <button class="btn" id="kb-search">检索</button>
    </div>
    <div id="kb-hits"></div>
    <div id="kb-detail"></div>`;

  document.getElementById('kb-upload').addEventListener('click', uploadFile);
  document.getElementById('kb-search').addEventListener('click', doSearch);
  content.querySelectorAll('[data-preview]').forEach(b =>
    b.addEventListener('click', () => previewDoc(b.dataset.preview)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delDoc(b.dataset.del, content)));

  async function uploadFile() {
    const file = document.getElementById('kb-file').files[0];
    if (!file) return alert('请选择文件');
    const progress = document.getElementById('kb-progress');
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    progress.textContent = `准备上传（${totalChunks} 片）…`;

    let init;
    try {
      init = await window.api.apiFetch('/kb/uploads/init', {
        method: 'POST', withVersion: true,
        body: { name: file.name, size: file.size, totalChunks },
      });
    } catch (err) { progress.textContent = '初始化失败: ' + err.message; return; }

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      const fd = new FormData();
      fd.append('index', i);
      fd.append('chunk', chunk, 'chunk' + i);
      const res = await fetch(
        (localStorage.getItem('apiBase') || 'http://localhost:3100') + `/api/kb/uploads/${init.uploadId}/chunk`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('token'),
            'X-Version-Id': localStorage.getItem('currentVersionId'),
          },
          body: fd,
        }
      );
      if (!res.ok) { progress.textContent = `分片 ${i} 上传失败`; return; }
      progress.textContent = `已上传 ${i + 1}/${totalChunks} 片`;
    }

    let done;
    try {
      done = await window.api.apiFetch(`/kb/uploads/${init.uploadId}/complete`, {
        method: 'POST', withVersion: true, body: {},
      });
    } catch (err) { progress.textContent = 'complete 失败: ' + err.message; return; }

    progress.textContent = '合并完成，摄取中…';
    pollJob(done.jobId, progress);
  }

  async function pollJob(jobId, progress) {
    for (let n = 0; n < 600; n++) {  // 最多轮询 10 分钟
      await new Promise(r => setTimeout(r, 1000));
      let j;
      try { j = await window.api.apiFetch(`/kb/jobs/${jobId}`, { withVersion: true }); }
      catch (err) { progress.textContent = '进度查询失败: ' + err.message; return; }
      progress.textContent = `摄取 ${j.processed}/${j.total} (${j.status})`;
      if (j.status === 'done') { window.pages.knowledge(content); return; }
      if (j.status === 'failed') { progress.textContent = '失败: ' + j.error; return; }
    }
    progress.textContent = '超时未完成';
  }

  async function previewDoc(id) {
    const detail = document.getElementById('kb-detail');
    detail.innerHTML = '加载中…';
    try {
      const entries = await window.api.apiFetch(`/kb/entries?documentId=${id}&limit=20`, { withVersion: true });
      detail.innerHTML = '<h4>条目预览(前20)</h4>' +
        entries.map(e => `<div class="placeholder-box" style="padding:12px;text-align:left;white-space:pre-wrap;">${escapeHtml(e.content)}</div>`).join('');
    } catch (err) { detail.innerHTML = '失败: ' + err.message; }
  }

  async function delDoc(id, contentEl) {
    if (!confirm('确认删除该文档？')) return;
    try {
      await window.api.apiFetch(`/kb/documents/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.knowledge(contentEl);
    } catch (err) { alert('删除失败: ' + err.message); }
  }

  async function doSearch() {
    const q = document.getElementById('kb-q').value.trim();
    const hits = document.getElementById('kb-hits');
    if (!q) return;
    hits.innerHTML = '检索中…';
    try {
      const rs = await window.api.apiFetch(`/kb/search?q=${encodeURIComponent(q)}&limit=10`, { withVersion: true });
      hits.innerHTML = '<h4>检索结果</h4>' + (rs.length === 0 ? '(无匹配)' :
        rs.map(h => `<div class="placeholder-box" style="padding:12px;text-align:left;">
          <div style="color:#909399;font-size:12px;">score: ${h.score.toFixed(4)}</div>
          <div style="white-space:pre-wrap;">${escapeHtml((h.entry && h.entry.content) || '')}</div>
        </div>`).join(''));
    } catch (err) { hits.innerHTML = '检索失败: ' + err.message; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
```

- [ ] **Step 2: admin.html 引入**

修改 `aiCompanion/web/admin.html`，在其它 pages 脚本旁边加一行：
```html
<script src="js/pages/knowledge.js"></script>
```

- [ ] **Step 3: app.js 路由**

修改 `aiCompanion/web/js/app.js` 的 `navigate` 函数，将 knowledge 分支从占位换成真实调用：
找到：
```js
  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
```
改为：
```js
  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  if (page === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
```

- [ ] **Step 4: 校验语法**

Run: `cd aiCompanion/web && node --check js/pages/knowledge.js && node --check js/app.js`
Expected: 无输出

- [ ] **Step 5: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/web/js/pages/knowledge.js aiCompanion/web/admin.html aiCompanion/web/js/app.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 前端知识库管理页(上传/预览/检索)"
```

---

## Task 14: README 与变更文档

**Files:**
- Modify: `aiCompanion/README.md`
- Create: `.claude/docs/2026-07/2026-07-08/v002_changelog.md`

- [ ] **Step 1: 追加 README**

在 `aiCompanion/README.md` 末尾追加：
```markdown

## 子项目2：知识库(v002)

已实现：分片上传 Excel(1G)、异步摄取流水线(解析→写条目→embedding向量化→图谱抽取)、版本隔离检索、图谱查询、前端知识库管理页。

### 使用
1. `.env` 填 `EMBEDDING_API_URL` `EMBEDDING_API_KEY` `EMBEDDING_MODEL`。
2. `npm run migrate` 应用 003_kb.sql。
3. `npm start` 启动后 worker 自动运行。
4. `npm run test:kb` 跑集成测试(用假 embedding，无需真 key)。

### 已知边界
- 内存向量索引适合数万条内；超大规模需换 pgvector。
- 图谱抽取以结构化行为主(首列作主实体，跨行同名建关系)；自由文本深度抽取(LLM)未做。
- 摄取失败会在 `ingest_jobs.error` 里记录，job 状态置 failed。
```

- [ ] **Step 2: 变更文档**

`.claude/docs/2026-07/2026-07-08/v002_changelog.md`:
```markdown
# v002 变更文档 · AI 陪伴机器人子项目2

新增知识库摄取子系统：分片上传 Excel(支持 1G) → 异步流水线解析为「每行一条」知识条目 + embedding 向量化(内存检索) + 结构化图谱抽取。前端补齐知识库管理页(上传/预览/检索)。
```

- [ ] **Step 3: Commit**

```bash
HUSKY_SKIP_HOOKS=1 git add aiCompanion/README.md ".claude/docs/2026-07/2026-07-08/v002_changelog.md"
HUSKY_SKIP_HOOKS=1 git commit -m "docs(aiCompanion/kb): README 更新与 v002 变更文档"
```

---

## 最终验收(需 MySQL + embedding key)

1. `cp aiCompanion/server/.env.example aiCompanion/server/.env`，填 DB 和 embedding。
2. `cd aiCompanion/server && npm install && npm run migrate && npm start`。
3. `cd aiCompanion/web && python -m http.server 8090`；浏览器 `http://localhost:8090`，admin/Admin123! 登录。
4. 切到「知识库管理」→ 上传 sample.xlsx(或自制 Excel)→ 看到摄取进度条 → 完成后文件列表出现。
5. 「预览」看到「英雄:亚瑟 定位:战士...」的条目。
6. 检索框输入「妲己」→ 返回相关条目 + 分数。
7. 切换到另一个版本 → 看不到刚上传的文档(隔离生效)。
8. `npm run test:kb` → 10 个测试通过(用假 embedding)。
