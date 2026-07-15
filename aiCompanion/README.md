# AI 陪伴机器人 · 子项目1（多版本+鉴权地基）

游戏陪伴机器人的 B 端后台地基。版本 = 游戏×地区多租户，账号全局、按版本授权。

## 运行后端
```
cd aiCompanion/server
cp .env.example .env   # 填 MySQL 连接
npm install
npm run migrate        # 建库建表 + 超管(admin/Admin123!) + 示例版本
npm start              # http://localhost:3100
npm test               # 集成测试（需已迁移）
```

## 运行前端
```
cd aiCompanion/web
python -m http.server 8090
# 访问 http://localhost:8090 ，用 admin / Admin123! 登录
```
前端默认连 `http://localhost:3100`，如需改：浏览器 localStorage 设 `apiBase`。

## 本子项目范围
- 已实现：登录、右上角版本切换、版本管理、用户权限管理、多版本数据隔离中间件。
- 占位：会话/机器人管理（子项目 3 实现）。

## 子项目2：知识库(v002)

已实现：分片上传 Excel、异步摄取流水线(解析→写条目→embedding向量化→图谱抽取)、版本隔离检索、图谱查询、前端知识库管理页。

### 使用
1. `.env` 填 `EMBEDDING_API_URL` `EMBEDDING_API_KEY` `EMBEDDING_MODEL`。
2. `npm run migrate` 应用 003_kb.sql。
3. `npm start` 启动后 worker 自动运行。
4. `npm run test:kb` 跑集成测试(用假 embedding，无需真 key)。

### 已知边界
- **单文件建议 ≤ 200MB / ~20 万行**：当前 excelParser 用 SheetJS `readFile` 全量入内存，ingestWorker 又把全部行 push 到 `allRows` 供图谱跨行匹配；1G 文件在 Node 默认堆(1.5-2G)下会 OOM。原始「支持 1G」需求本期未真正落地，需换 exceljs 流式 API + 图谱两遍扫描才能做到；后续子项目再迭代。
- 内存向量索引适合数万条内；超大规模需换 pgvector。
- 图谱抽取以结构化行为主(首列作主实体，跨行同名建关系)；自由文本深度抽取(LLM)未做。
- 摄取失败会在 `ingest_jobs.error` 里记录，job 状态置 failed，需删掉文档重传(entries/vectors 无事务，中途崩溃会留孤儿)。

## 子项目3:机器人+会话+C端对话(v003)

已实现:B 端机器人配置页(每版本一个)、会话列表+详情页、C 端 chat.html 匿名对话页(sessionKey 存 localStorage)、LLM 服务(fetch+重试+可测试替换)、内嵌 RAG(检索当前版本知识库塞进 prompt)。

### 使用
1. `.env` 追加 `LLM_API_URL / LLM_API_KEY / LLM_MODEL`(默认按通义千问 dashscope 兼容协议)。
2. `npm run migrate` 应用 004_bot_chat.sql。
3. `npm run test:chat` 跑集成测试(用假 LLM+假 embedding,无需真 key,11/11 通过)。
4. `npm start` 启动。
5. 后台「机器人管理」保存人设 → 打开 `chat.html?versionId=1` 开始对话。

### 已知边界
- 单进程同步对话:一次请求阻塞到 LLM 返回,高并发场景需上流式或队列。
- 历史窗口按条数截断,不做摘要;长会话质量会下降。
- 匿名 session 无清理策略,`chat_sessions` 会长期累积;上生产前应加定时清理。
- refs 只带 snippet(截前 200 字),不开放完整条目查询接口给 C 端。

## 子项目5:知识库内嵌图片提取与展示

已实现:从上传的 xlsx **内嵌图片**(drawing 锚点,非单元格 URL 文本)提取图片,精确关联到所在行,存本地磁盘;RAG 检索(`ragContext.retrieve`)与 B 端条目预览(`/api/kb/entries`)追加 `images` 字段;C 端对话气泡下方渲染缩略图+点击全屏放大;B 端预览列表同步显示,方便核对导入效果。

### 使用
1. `npm run migrate` 应用 `006_kb_images.sql`。
2. 图片默认存 `uploads/kb-images/`(相对 server 目录,长期保留不清理),可用 `.env` 的 `KB_IMAGES_DIR` 改。
3. `npm run test:images` 跑单元测试(`imageExtractor` 解析)+ 端到端集成测试(上传→ingest→静态路由→级联删除)。

### 已知边界
- **`/kb-images` 静态路由无鉴权**,`versionId`/`documentId` 为可枚举的自增整数——已与项目方确认接受(当前是内网部署,非公网多租户 SaaS),后续若对外开放需补签名 URL 或至少改用不可枚举路径。
- 只处理 xlsx **第一个逻辑 sheet**(按 `workbook.xml` 的 `<sheets>` 顺序解析物理文件,不是硬编码 `sheet1.xml`,与 `excelParser.js` 解析依据一致),多 sheet 场景其余 sheet 的图片不会被提取。
- 图片解析用正则直接读 OOXML 内部 XML(非完整 XML parser),已覆盖常见的 `editAs="oneCell"` 等属性变体;`mc:AlternateContent` 兼容性包裹等更冷门的锚点写法暂未覆盖，遇到时会静默少提取图片而不是报错。
