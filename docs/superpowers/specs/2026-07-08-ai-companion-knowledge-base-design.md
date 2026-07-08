# AI 陪伴机器人 · 子项目2：知识库摄取（RAG + 知识图谱）设计文档

日期：2026-07-08
状态：已通过设计评审，待用户 review

## 背景

AI 游戏陪伴机器人大需求的第二个子项目。地基（子项目1，`aiCompanion/`，Express+MySQL+JWT，多版本多租户 + RBAC）已完成并合并。本子项目在其上扩展知识库摄取能力：上传 Excel → 自动整合为知识库 → RAG 向量检索 + 知识图谱聚合，支持 1G 大文件上传。

不新建服务，直接在现有 `aiCompanion/server` 上扩展。所有业务表带 `version_id`，经现有 `tenantScope` 层按版本隔离。

## 已确认的关键决策（来自 brainstorming）

- **范围**：四块一次做全——Excel 解析入库 + RAG 向量检索 + 知识图谱 + 1G 分片上传。
- **云 API 密钥**：用户提供（embedding API + LLM API）。代码用环境变量占位，用户后填真值。
- **向量库**：向量存 MySQL（JSON 列），服务启动时按 version 加载进内存算余弦相似度。不引入 pgvector/Milvus 等外部服务。数据量中小（数万条内）够用，符合现有单库风格。
- **图谱存储**：实体/关系存 MySQL 表（kb_entities / kb_relations）。
- **大文件存储**：分片上传，分片写服务器本地临时磁盘，收齐后合并成完整文件，解析入库后删除。不用 OSS。
- **异步处理**：同进程异步 + 任务表轮询（ingest_jobs）。不引入 Redis/队列/独立 worker。worker 是 app.js 启动时的 setInterval 轮询循环，同进程、不阻塞请求。
- **Excel 解析语义**：每行 = 一条知识条目。首行为表头，之后每行拼成「列名:值」自然语言文本作为一条知识；整条文本做 embedding 向量化；从结构化行（列名:值）抽实体/关系存图谱表（不强依赖 LLM，省成本；复杂自由文本才可选调 LLM）。

## 整体架构与数据流

一条异步摄取流水线：

```
[前端] 分片上传 Excel(5MB/片)
   → POST /api/kb/uploads/init        建上传会话，返回 uploadId
   → POST /api/kb/uploads/:id/chunk   逐片上传(带 index)，写本地临时目录
   → POST /api/kb/uploads/:id/complete 合并分片成完整文件，建 document + ingest_job(pending)，立即返回 jobId

[后端同进程异步 worker] 轮询 ingest_jobs(pending)
   → 解析 Excel(SheetJS 流式读)：首行表头，每行拼「列名:值」文本
   → 每行写 knowledge_entries(version_id 隔离)
   → 每条文本调 embedding API → 向量存 kb_vectors
   → 从结构化行抽实体/关系 → kb_entities / kb_relations
   → 更新 job 进度(processed/total)，完成置 done / 失败置 failed+error

[前端] 轮询 GET /api/kb/jobs/:id 显示进度条，done 后刷新列表

[检索] GET /api/kb/search?q=  查询词 embedding → 内存余弦 → 返回 top-k 条目
```

关键点：
- 所有表带 `version_id`，经 tenantScope 隔离。
- 向量启动时从 kb_vectors 加载进内存（按 version 分组），检索算余弦。
- worker 是 app.js 启动时起的 setInterval 轮询循环，同进程、不阻塞请求。

## 数据模型（migrations/003_kb.sql）

新增 6 张业务表，全部带 `version_id`：

```sql
kb_documents                    上传的知识库文件(一个 Excel = 一个 doc)
  id, version_id, name,         -- 文件名
  status,                       -- uploading|parsing|done|failed
  row_count,                    -- 解析出的行数
  created_at

ingest_jobs                     摄取任务(异步流水线状态)
  id, version_id, document_id,
  status,                       -- pending|processing|done|failed
  total, processed,             -- 进度：总行数 / 已处理行数
  error,                        -- 失败原因(text)
  created_at, updated_at

knowledge_entries               知识条目(每行一条)
  id, version_id, document_id,
  row_index,                    -- 原 Excel 行号
  content,                      -- 「列名:值」拼成的文本
  raw_json,                     -- 原始行 {列名:值} JSON
  created_at

kb_vectors                      向量(与 entry 一对一)
  id, version_id, entry_id,
  embedding,                    -- JSON 数组(float[])，启动加载进内存
  dim,                          -- 向量维度
  created_at

kb_entities                     知识图谱-实体
  id, version_id, document_id,
  name,                         -- 实体名(如英雄名)
  type,                         -- 实体类型(列名/表名推断)
  props_json,                   -- 属性 {列名:值}
  UNIQUE(version_id, name, type)

kb_relations                    知识图谱-关系
  id, version_id,
  from_entity_id, to_entity_id,
  relation,                     -- 关系名
  created_at
```

分片临时文件存本地磁盘（`uploads/tmp/<uploadId>/`），不入库；合并后完整文件解析完即删。上传会话元信息放内存 Map（重启丢失可接受，失败重传即可）。

说明：
1. kb_documents 与 ingest_jobs 分开：一个文件一个 doc，一次摄取一个 job，便于重新摄取。
2. 向量存 JSON 列，启动按 version 加载进内存 Map 算余弦。
3. 图谱 entities/relations 从结构化行抽，不强依赖 LLM。

## API 接口

全部经 auth + version 中间件，写操作需版本权限：

```
POST   /api/kb/uploads/init          {name, size, totalChunks} → {uploadId}
POST   /api/kb/uploads/:id/chunk     multipart: index + 分片二进制 → {received}
POST   /api/kb/uploads/:id/complete  → 合并、建 document+ingest_job → {jobId, documentId}
GET    /api/kb/jobs/:id               → {status, total, processed, error}
GET    /api/kb/documents              → 该版本知识库文件列表
DELETE /api/kb/documents/:id          → 删文件及其 entries/vectors/entities/relations
GET    /api/kb/entries?documentId=    → 某文件的知识条目(分页)
GET    /api/kb/search?q=&limit=       → 语义检索：查询词向量化→内存余弦→top-k
GET    /api/kb/graph?documentId=      → 图谱数据 {entities, relations}
```

## 后端文件结构

```
server/src/
  routes/kb.js               # 所有 /api/kb 路由
  services/
    uploadStore.js           # 分片会话管理、写盘、合并
    excelParser.js           # SheetJS 流式解析：表头 + 每行→{列名:值}+文本
    embedding.js             # 调 embedding 云API(占位 key)，批量向量化 + 重试
    vectorStore.js           # 向量内存索引：加载、增删、余弦 top-k
    graphExtractor.js        # 从结构化行抽 entities/relations
    ingestWorker.js          # 轮询 ingest_jobs，跑完整流水线，更新进度
  config/kb.js               # 分片大小、embedding模型/维度、检索topk等配置
migrations/003_kb.sql        # 6 张表
test/kb.run.js               # 集成测试
```

依赖新增：`xlsx`(SheetJS)、`multer`(接收分片 multipart)。embedding 用 fetch 调云 API，不装 SDK。

`app.js` 增两处：挂 `/api/kb` 路由、启动时 `ingestWorker.start()` + `vectorStore.loadAll()`。

前端：现有后台「知识库管理」占位页替换为真实页——上传(分片+进度条)、文件列表、条目预览、检索测试框、图谱简单展示。对应文件 `web/js/pages/knowledge.js`。

## 错误处理

- **分片上传**：分片乱序/缺失 → complete 校验分片数，缺片返回 400 并列出缺哪片；磁盘写失败 → 500；uploadId 不存在(重启丢失) → 404，前端重新 init。
- **摄取流水线**：任一步失败(解析错/embedding报错/超时) → job 置 failed + 记 error，不中断 worker 循环（继续下一 job）；单行解析失败跳过并计数，不整批失败。
- **embedding API**：批量调用 + 失败重试(最多3次退避)；key 无效 → job failed 且 error 提示「检查 EMBEDDING_API_KEY」。
- **1G 内存**：Excel 流式逐行解析 + 分批向量化(如每 50 行一批)，不一次性加载整表进内存，避免 OOM。
- 统一错误格式沿用地基 `{ error: { code, message } }`（注：地基实际实现为 `{ error: '中文消息' }`，本子项目沿用地基现有 fail 风格）。

## 测试策略

沿用仓库轻量风格：
- **后端 `test/kb.run.js`**：Node 断言 + 真实 HTTP，覆盖：
  - 分片 init→chunk×N→complete 全流程，校验文件合并正确
  - 缺片时 complete 返回 400
  - 小 Excel(几行)跑完整摄取，轮询 job 到 done，校验 entries/vectors/entities 落库
  - 检索：插入已知条目，查询返回预期 top-k
  - 版本隔离：A 版本上传的知识库，B 版本检索/列表查不到
  - embedding 用**假实现**(确定性伪向量)跑通流程，不依赖真 key；真 key 单独手测
- **前端**：`node --check` 语法校验
- 提供小样本 Excel 测试夹具

## 验收标准

后台知识库页上传 Excel → 进度条走到 100% → 文件列表出现该文件 → 条目预览看到「列名:值」文本 → 检索框输关键词返回相关条目 → 图谱展示实体关系。1G 文件能分片上传且不 OOM。

## 与地基（子项目1）的衔接

- 所有新表带 version_id，读写经 tenantScope 层。
- 后台左侧「知识库管理」占位页由本子项目填充。
- 复用地基的 auth / version / requireSuperAdmin 中间件与 fail 错误 helper。
- 数据库迁移新增 003_kb.sql，沿用现有 migrations/run.js 机制。

## 已知边界

- embedding/LLM 依赖用户提供的云 API key，未提供时摄取会失败（job failed，错误提示明确）。
- 内存向量检索适合中小数据量（数万条内）；超大规模需后续换 pgvector/专业向量库。
- 图谱抽取以结构化行为主，自由文本深度抽取（LLM）为可选增强，非本期重点。
