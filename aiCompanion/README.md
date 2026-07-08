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
