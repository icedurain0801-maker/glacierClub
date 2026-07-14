# AI 陪伴机器人知识库 · 内嵌图片提取与展示设计

## 背景与目标

知识库的 Excel/CSV 导入目前只处理文本（`excelParser.js` 逐行拼成 `列名: 值`），Excel 单元格里内嵌的图片（如英雄头像、出装图）完全被忽略。需求是：把这些内嵌图片提取出来，与所在行绑定，在 C 端对话命中该行知识时把图片一起带出来展示。

**范围确认**：
- 图片来源仅限 xlsx **内嵌图片**（插入到单元格/浮层），不是单元格里的图片 URL 文本
- 用途：C 端对话配图（RAG 命中带图的行 → 回复下方出图）
- 存储：本地磁盘（项目当前没有对象存储/图床，不引入新的外部依赖）
- 一行可关联 0~多张图片
- B 端知识库预览列表同样要显示图片，方便核对导入效果

**技术可行性已验证**：`xlsx@0.18.5`（SheetJS 社区版）没有图片 API，但 xlsx 本质是 zip。用项目已有的传递依赖 `jszip` 解压后，可以：
1. 从 `xl/media/` 读出图片二进制
2. 解析 `xl/drawings/drawingN.xml` 的 anchor 坐标（`<xdr:row>`），精确得到每张图所属的行
3. 通过 drawing 的 `_rels` 关系文件，把 anchor 引用的 `r:embed` 映射到具体的 media 文件

已用手工构造的内嵌图 xlsx 样本实测跑通整条链路（抽图 + 行定位 + 与 SheetJS 文本解析互不干扰）。

## 架构总览

新增独立模块 `imageExtractor.js`，与现有 `excelParser.js`（读文本）、`graphExtractor.js`（抽实体关系）并列，职责单一：输入 xlsx 文件路径，输出「行号 → 图片列表」映射，并负责把图片写入磁盘、落库。三条处理逻辑互不依赖，任一失败不影响其他两条。

```
ingestWorker.processJob(job)
  ├─ excelParser.open() + 逐行 INSERT knowledge_entries         (现有,不动)
  ├─ imageExtractor.extract({ filePath, versionId, documentId, entryIdByRow })  (新增)
  │     → 解析 drawing anchor,得到 rowIndex → [{buffer, ext}]
  │     → 写入 uploads/kb-images/<versionId>/<documentId>/<rowIndex>_<n>.<ext>
  │     → INSERT kb_entry_images(entry_id, version_id, url)
  ├─ embedding.embedBatch() + INSERT kb_vectors                  (现有,不动)
  └─ graphExtractor.extract()                                    (现有,不动)
```

调用时机：放在 ingestWorker 现有流程里，紧跟条目写入之后（此时已有 entryIdByRow 映射，KG 阶段已在用同一个映射）。

## 数据模型

新迁移 `006_kb_images.sql`：

```sql
CREATE TABLE kb_entry_images (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  entry_id   INT NOT NULL,
  version_id INT NOT NULL,
  url        VARCHAR(255) NOT NULL,   -- 相对路径,如 /kb-images/3/17/2_1.png
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_entry (entry_id),
  FOREIGN KEY (entry_id)   REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES versions(id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

一个 entry 对应 0~N 条记录（一行多图）。`ON DELETE CASCADE` 保证删条目/删版本时记录自动清理；物理文件由代码显式删除（见下）。

## 存储布局

- 磁盘路径：`aiCompanion/server/uploads/kb-images/<versionId>/<documentId>/<rowIndex>_<n>.<ext>`
  - 按 versionId/documentId 分目录，删文档时整目录 `fs.rmSync(dir, {recursive:true})` 一次清干净，不用逐张删
  - `cfg.kbImagesDir` 新增配置项，与现有 `cfg.uploadTmpDir` 同级风格
- 与现有分片上传临时文件不同：**图片长期保留**，不会像原始 xlsx 一样处理完就删（C 端要长期引用）
- 静态访问：`app.js` 新增 `app.use('/kb-images', express.static(cfg.kbImagesDir))`

## 检索链路与 refs 扩展

`ragContext.js` 的 `retrieve()` 命中 entry 后，批量查一次图片（避免 N+1）：

```js
const [imgRows] = await db.query(
  `SELECT entry_id, url FROM kb_entry_images WHERE entry_id IN (${ids.map(()=>'?').join(',')})`,
  ids
);
```

每条 ref 从 `{entryId, score, snippet}` 扩展为 `{entryId, score, snippet, images: [...]}`（无图为 `images: []`）。这是**追加字段**，向后兼容——延续第一阶段 KG 融合时 `{type:'fact'}` 的扩展手法，旧前端忽略陌生字段不受影响。

**图片 URL 不进 LLM prompt 文本**（`toContextBlock`/`buildMessages` 不变）——LLM 是纯文本模型，喂图片 URL 进去没有意义。图片只走 refs 通道，由前端在展示层处理。

同理，B 端 `/api/kb/entries` 预览接口也批量查一次 `kb_entry_images`，返回结果里给每条 entry 加 `images` 字段。

## 前端展示

**C 端 `chat.js`**：`appendMsg` 现有的 `#entryId (score)` 文字标签不变，新增：refs 里 `images` 非空时，气泡下方渲染缩略图（60×60，`object-fit:cover`），点击弹出全屏遮罩看原图，点遮罩关闭。手写 DOM+CSS，不引入 lightbox 库，与 `chat.js` 现有原生拼接风格一致。

**B 端 `knowledge.js`**：条目预览列表每行内容旁展示缩略图（来自接口新增的 `images` 字段），方便管理员核对导入效果。

## 测试计划

新增 `test/kb-images.run.js`，覆盖：
1. 构造内嵌图 xlsx（多行，含无图行、单图行、多图行）→ 导入 → 验证 `kb_entry_images` 落库行数与行号对应正确
2. 图片文件确实写入磁盘对应目录，静态路由可访问
3. `ragContext.retrieve()` 返回的 refs 含正确的 `images` 数组
4. B 端 `/api/kb/entries` 返回结果含 `images` 字段
5. 删除文档后，`kb_entry_images` 记录级联删除 + 磁盘目录被清理

回归：现有 `test/run.js`、`test/kb.run.js`、`test/chat.run.js`、`test/kg.run.js` 应保持全绿（图片抽取失败不应影响文本/图谱主流程，需补一个「无图 xlsx 导入正常」的场景验证隔离性）。

## 关键文件清单

| 文件 | 动作 |
|---|---|
| `server/migrations/006_kb_images.sql` | 新增 |
| `server/src/services/imageExtractor.js` | 新增(核心:drawing anchor 解析) |
| `server/src/services/ingestWorker.js` | 改(调用 imageExtractor) |
| `server/src/services/ragContext.js` | 改(retrieve 批量查图,toContextBlock 不变) |
| `server/src/config/kb.js` | 改(新增 kbImagesDir 配置) |
| `server/src/app.js` | 改(新增 /kb-images 静态路由) |
| `server/src/routes/kb.js` | 改(entries 预览接口带 images) |
| `server/test/kb-images.run.js` | 新增 |
| `web/js/chat.js` | 改(缩略图渲染+放大遮罩) |
| `web/js/pages/knowledge.js` | 改(预览列表带图) |
