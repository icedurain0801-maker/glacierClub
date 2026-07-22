# 知识库内嵌图片提取与展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从上传的 xlsx 里提取内嵌图片（非单元格文本 URL），精确关联到所在行，存本地磁盘，并让 C 端对话命中该行知识时把图片带出来（气泡下方缩略图+点击放大），B 端知识库预览列表同步显示。

**Architecture:** 新增独立模块 `imageExtractor.js`，解析 xlsx 内部 `xl/drawings/drawingN.xml` 的锚点坐标（`<xdr:row>`）定位图片所属行，通过 `_rels` 关系文件映射到 `xl/media/` 的具体图片文件，写入本地磁盘 `uploads/kb-images/<versionId>/<documentId>/`，落库 `kb_entry_images` 表。`ingestWorker` 在现有文本解析后调用该模块（互不干扰）。`ragContext.retrieve()` 与 B 端 `/api/kb/entries` 批量查图并追加 `images` 字段到返回结构（向后兼容追加，不改变现有字段）。前端在 `chat.js` 和 `knowledge.js` 渲染缩略图。

**Tech Stack:** Node.js + Express + MySQL(mysql2) + `jszip`（已是 `xlsx`/`multer` 的传递依赖，用于解压 xlsx 读 media/drawing XML）+ 原生 DOM/CSS（无前端框架，无 lightbox 库）。

**Design doc:** `docs/superpowers/specs/2026-07-14-ai-companion-kb-images-design.md`

---

## 项目背景速览（供零上下文工程师）

- 仓库根：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage`
- 后端目录：`aiCompanion/server`，前端目录：`aiCompanion/web`
- 知识库导入流程：B 端上传 xlsx(分片) → `kb.js` 路由建 `kb_documents`+`ingest_jobs` → `ingestWorker.js` 轮询处理 job → `excelParser.js` 读文本逐行入 `knowledge_entries` → `embedding.js` 向量化入 `kb_vectors`+`vectorStore`(内存) → `graphExtractor.js` 抽实体关系入 `kb_entities`/`kb_relations`/`kb_entity_aliases`/`kb_entry_entities`
- C 端对话：`chatService.js` 的 `handleChat` 调 `ragContext.retrieve()`(向量召回) + `kgContext`(图谱事实) → 拼 prompt → LLM → 存消息，返回 `{reply, refs}`；`refs` 数组里已有向后兼容追加的图谱事实项 `{type:'fact', text, entityId}`，本次要用同一手法追加图片
- 测试风格：每个子系统一个 `test/xxx.run.js`，用原生 `http.request` 发请求，`embedding._setImpl()`/`llm._setImpl()` 注入假实现，无第三方测试框架，`assert` 断言，`package.json` 里 `test:xxx` 脚本对应
- 依赖已装在 `aiCompanion/server/node_modules`；`.env` 在 `.gitignore`，跑测试前需要本机 MySQL 可连（`root`/空密码，见 `.env.example`）
- **husky pre-commit hook 在这个 worktree 环境下会误伤**（指向另一个不相关子项目 `SDK/admin-old` 的 lint-staged，worktree 缺它的 node_modules）。提交时统一加 `HUSKY_SKIP_HOOKS=1` 前缀，例如：`HUSKY_SKIP_HOOKS=1 git commit -m "..."`

---

## Task 1: 迁移 — `kb_entry_images` 表

**Files:**
- Create: `aiCompanion/server/migrations/006_kb_images.sql`

- [ ] **Step 1: 写迁移文件**

```sql
USE ai_companion;

-- 内嵌图片:一个知识条目(行)可关联 0~N 张图片。C 端对话命中该条目时随 refs 一起展示。
CREATE TABLE IF NOT EXISTS kb_entry_images (
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

- [ ] **Step 2: 跑迁移**

Run: `cd "aiCompanion/server" && npm run migrate`
Expected: 输出包含 `Running 006_kb_images.sql...` 和 `✓ done`，最后 `All migrations complete.`

- [ ] **Step 3: 验证表已创建且幂等**

Run: `cd "aiCompanion/server" && npm run migrate`（重复执行一次）
Expected: 不报错（`CREATE TABLE IF NOT EXISTS` 天然幂等），仍输出 `All migrations complete.`

- [ ] **Step 4: Commit**

```bash
cd "aiCompanion/server"
git add migrations/006_kb_images.sql
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 新增 kb_entry_images 表"
```

---

## Task 2: 配置 — 新增图片存储目录配置

**Files:**
- Modify: `aiCompanion/server/src/config/kb.js`

**当前内容（第 1-31 行，完整文件）：**

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

  llm: {
    apiUrl: process.env.LLM_API_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model:  process.env.LLM_MODEL  || 'qwen-plus',
    retries: 3,
    retryBaseMs: 500,
    maxMessageBytes: 4 * 1024,
    maxPromptBytes: 8 * 1024,
  },
};
```

- [ ] **Step 1: 新增 `kbImagesDir` 配置项**

用 Edit 工具，把：

```js
  uploadTmpDir: path.resolve(__dirname, '..', '..', process.env.KB_UPLOAD_TMP_DIR || 'uploads/tmp'),
  batchSize: 50,                        // 每批 embedding 请求条数
```

替换为：

```js
  uploadTmpDir: path.resolve(__dirname, '..', '..', process.env.KB_UPLOAD_TMP_DIR || 'uploads/tmp'),
  kbImagesDir: path.resolve(__dirname, '..', '..', process.env.KB_IMAGES_DIR || 'uploads/kb-images'),
  batchSize: 50,                        // 每批 embedding 请求条数
```

- [ ] **Step 2: 验证语法**

Run: `cd "aiCompanion/server" && node --check src/config/kb.js`
Expected: 无输出（无语法错误）

- [ ] **Step 3: Commit**

```bash
cd "aiCompanion/server"
git add src/config/kb.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 新增图片存储目录配置 kbImagesDir"
```

---

## Task 3: `imageExtractor.js` — xlsx 内嵌图片解析核心

这是本计划的核心模块。先写测试样本生成器（构造含内嵌图片的 xlsx），再写抽取逻辑，再接测试验证。

**Files:**
- Create: `aiCompanion/server/test/fixtures/generateWithImages.js`
- Create: `aiCompanion/server/src/services/imageExtractor.js`
- Create: `aiCompanion/server/test/imageExtractor.test.js`

### Step 1: 写内嵌图 xlsx 样本生成器

`xlsx` 库（SheetJS 社区版）不支持写入图片，需要用 `jszip` 手工拼 OOXML 结构。这个生成器造 4 行数据：第 1 行无图，第 2 行 1 张图，第 3 行 2 张图，第 4 行无图 —— 覆盖"部分行有图、部分行多图"的真实场景。

Create `aiCompanion/server/test/fixtures/generateWithImages.js`:

```js
// 生成含内嵌图片的小样本 Excel,用于图片提取集成测试。
// xlsx(SheetJS 社区版)不支持写图片,手工拼 OOXML zip 结构。
// 运行: node test/fixtures/generateWithImages.js
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');

// 1x1 像素 PNG,红/绿/蓝三张用于区分
const PNG_RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const PNG_GREEN = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PNG_BLUE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveWkH6oAAAAAElFTkSuQmCC', 'base64');

function oneCellAnchor(row, col, rId) {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="200000" cy="200000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${row * 10 + col}" name="p${row}_${col}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

async function main() {
  const zip = new JSZip();

  zip.file('[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
    '</Types>');

  zip.file('_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');

  zip.file('xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="heroes" sheetId="1" r:id="rId1"/></sheets></workbook>');

  zip.file('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>');

  // 表头 + 4 行数据: 亚瑟(无图) 妲己(1图) 后羿(2图) 庄周(无图)
  const rowsXml = [
    '<row r="1"><c r="A1" t="inlineStr"><is><t>英雄</t></is></c><c r="B1" t="inlineStr"><is><t>定位</t></is></c></row>',
    '<row r="2"><c r="A2" t="inlineStr"><is><t>亚瑟</t></is></c><c r="B2" t="inlineStr"><is><t>战士</t></is></c></row>',
    '<row r="3"><c r="A3" t="inlineStr"><is><t>妲己</t></is></c><c r="B3" t="inlineStr"><is><t>法师</t></is></c></row>',
    '<row r="4"><c r="A4" t="inlineStr"><is><t>后羿</t></is></c><c r="B4" t="inlineStr"><is><t>射手</t></is></c></row>',
    '<row r="5"><c r="A5" t="inlineStr"><is><t>庄周</t></is></c><c r="B5" t="inlineStr"><is><t>辅助</t></is></c></row>',
  ].join('');

  zip.file('xl/worksheets/sheet1.xml',
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetData>${rowsXml}</sheetData><drawing r:id="rId1"/></worksheet>`);

  zip.file('xl/worksheets/_rels/sheet1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>' +
    '</Relationships>');

  // 锚点: row 是 0-based。数据行2(妲己,0-based row=2) 1张图; 数据行3(后羿,0-based row=3) 2张图
  const anchors = [
    oneCellAnchor(2, 1, 'rId1'),  // 妲己行 -> image1
    oneCellAnchor(3, 1, 'rId2'),  // 后羿行 -> image2
    oneCellAnchor(3, 2, 'rId3'),  // 后羿行 -> image3(第2张)
  ].join('');

  zip.file('xl/drawings/drawing1.xml',
    '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    anchors + '</xdr:wsDr>');

  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image3.png"/>' +
    '</Relationships>');

  zip.file('xl/media/image1.png', PNG_RED);
  zip.file('xl/media/image2.png', PNG_GREEN);
  zip.file('xl/media/image3.png', PNG_BLUE);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const out = path.join(__dirname, 'sample_with_images.xlsx');
  fs.writeFileSync(out, buf);
  console.log('generated', out);
}

main();
```

- [ ] **Step 2: 运行生成器，确认产出文件**

Run: `cd "aiCompanion/server" && node test/fixtures/generateWithImages.js`
Expected: 输出 `generated .../test/fixtures/sample_with_images.xlsx`

- [ ] **Step 3: 写失败测试（先验证抽取模块尚不存在）**

Create `aiCompanion/server/test/imageExtractor.test.js`:

```js
// imageExtractor 单元测试:验证 drawing anchor 解析能精确定位图片所属行。
// 运行: node test/imageExtractor.test.js
require('dotenv').config();
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const imageExtractor = require('../src/services/imageExtractor');

async function main() {
  let passed = 0;
  const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

  const samplePath = path.join(__dirname, 'fixtures', 'sample_with_images.xlsx');
  if (!fs.existsSync(samplePath)) {
    require('./fixtures/generateWithImages');
  }

  try {
    let result;
    await test('extract() 返回按行分组的图片', async () => {
      result = await imageExtractor.extract(samplePath);
      // rowIndex 是从 1 开始的数据行号(表头之后第1行=1)
      // 数据行: 1=亚瑟(无图) 2=妲己(1图,0-based anchor row=2) 3=后羿(2图) 4=庄周(无图)
      assert.ok(result instanceof Map, 'extract 应返回 Map');
    });

    await test('无图行不在结果里', async () => {
      assert.strictEqual(result.has(1), false, '亚瑟行(rowIndex=1)应无图片');
      assert.strictEqual(result.has(4), false, '庄周行(rowIndex=4)应无图片');
    });

    await test('单图行返回1张', async () => {
      const imgs = result.get(2);
      assert.ok(imgs, '妲己行(rowIndex=2)应有图片');
      assert.strictEqual(imgs.length, 1);
      assert.ok(Buffer.isBuffer(imgs[0].buffer));
      assert.strictEqual(imgs[0].ext, 'png');
    });

    await test('多图行返回2张', async () => {
      const imgs = result.get(3);
      assert.ok(imgs, '后羿行(rowIndex=3)应有图片');
      assert.strictEqual(imgs.length, 2);
    });

    console.log(`\n${passed} 个测试全部通过`);
  } catch (err) {
    console.error('\n✗ 测试失败：', err.stack || err.message);
    process.exitCode = 1;
  }
}

main();
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd "aiCompanion/server" && node test/imageExtractor.test.js`
Expected: `Error: Cannot find module '../src/services/imageExtractor'`

### Step 5: 实现 `imageExtractor.js`

理解 xlsx 内部结构（已用真实样本验证过）：
- `xl/worksheets/sheet1.xml` 的 `<drawing r:id="rIdX"/>` 指向 drawing 文件
- `xl/worksheets/_rels/sheet1.xml.rels` 把该 `r:id` 映射到 `xl/drawings/drawingN.xml`
- `xl/drawings/drawingN.xml` 里每个 `<xdr:oneCellAnchor>`（或 `<xdr:twoCellAnchor>`）含 `<xdr:from><xdr:row>N</xdr:row>...` 锚点坐标（0-based），以及 `<xdr:pic>` 内的 `r:embed="rIdY"` 指向具体图片
- `xl/drawings/_rels/drawingN.xml.rels` 把 `rIdY` 映射到 `xl/media/imageN.png` 等具体文件

**行号换算**：anchor 的 `<xdr:row>` 是 0-based 且包含表头行。表头占 row=0，第一条数据行在 row=1。而 `excelParser.js`（Task 里已有代码，见 `aiCompanion/server/src/services/excelParser.js:29`）产出的 `rowIndex` 是从 1 开始的**数据行号**（不含表头，`i+1`，`i` 从 0 开始遍历 `dataRows`）。换算公式：`dataRowIndex = anchorRow`（因为表头是 row=0，第一条数据是 anchorRow=1，对应 excelParser 的 rowIndex=1）。即 **`rowIndex = anchorRow`**，无需 -1（表头本身占了 row=0 这个偏移）。

Create `aiCompanion/server/src/services/imageExtractor.js`:

```js
// 从 xlsx 内嵌图片(drawing 锚点)提取图片二进制,按数据行号分组。
// xlsx 本质是 zip;SheetJS 社区版无图片 API,用 jszip 直接读 zip 内部结构:
//   worksheet -> <drawing r:id> -> drawing rels -> drawingN.xml(锚点 row 坐标 + r:embed)
//   -> drawing rels -> media/imageN.png
// 行号换算:anchor <xdr:row> 是 0-based 且表头占 row=0,故与 excelParser 的 rowIndex(数据行,从1开始)刚好相等。
const fs = require('fs');
const JSZip = require('jszip');

function firstMatch(xml, re) {
  const m = xml.match(re);
  return m ? m[1] : null;
}

function allMatches(xml, re) {
  const out = [];
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(xml))) out.push(m);
  return out;
}

// 从 <Relationship Id="rIdX" ... Target="..."/> 里按 Id 找 Target
function relTarget(relsXml, rId) {
  const re = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`);
  let m = relsXml.match(re);
  if (m) return m[1];
  // 属性顺序可能反过来(Target 在前)
  const re2 = new RegExp(`Target="([^"]+)"[^>]*Id="${rId}"`);
  m = relsXml.match(re2);
  return m ? m[1] : null;
}

function extFromPath(p) {
  const m = p.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'png';
}

// 解析单个 drawing.xml,返回 [{row, embedRId}]
function parseAnchors(drawingXml) {
  const anchors = [];
  // 同时匹配 oneCellAnchor 和 twoCellAnchor,取 <xdr:from> 内的 row + 该锚点内的 r:embed
  const anchorBlocks = allMatches(drawingXml, /<xdr:(?:one|two)CellAnchor>([\s\S]*?)<\/xdr:(?:one|two)CellAnchor>/);
  for (const block of anchorBlocks) {
    const body = block[1];
    const rowStr = firstMatch(body, /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    const embedRId = firstMatch(body, /r:embed="(rId\d+)"/);
    if (rowStr != null && embedRId) {
      anchors.push({ row: parseInt(rowStr, 10), embedRId });
    }
  }
  return anchors;
}

// 主入口:输入 xlsx 文件路径,返回 Map<rowIndex, [{buffer, ext}]>。无图返回空 Map(不抛错)。
async function extract(filePath) {
  const result = new Map();
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);

  // 找第一个 worksheet 的 drawing 引用(知识库场景只处理第一张表,与 excelParser 一致)
  const sheetXml = await readIfExists(zip, 'xl/worksheets/sheet1.xml');
  if (!sheetXml) return result;
  const drawingRId = firstMatch(sheetXml, /<drawing r:id="(rId\d+)"\/>/);
  if (!drawingRId) return result;  // 该 sheet 没有 drawing,正常情况(无图 xlsx)

  const sheetRelsXml = await readIfExists(zip, 'xl/worksheets/_rels/sheet1.xml.rels');
  if (!sheetRelsXml) return result;
  const drawingTarget = relTarget(sheetRelsXml, drawingRId);  // 如 ../drawings/drawing1.xml
  if (!drawingTarget) return result;
  const drawingPath = normalizeZipPath('xl/worksheets', drawingTarget);  // -> xl/drawings/drawing1.xml

  const drawingXml = await readIfExists(zip, drawingPath);
  if (!drawingXml) return result;
  const anchors = parseAnchors(drawingXml);
  if (anchors.length === 0) return result;

  const drawingRelsPath = relsPathFor(drawingPath);  // xl/drawings/_rels/drawing1.xml.rels
  const drawingRelsXml = await readIfExists(zip, drawingRelsPath);
  if (!drawingRelsXml) return result;

  for (const { row, embedRId } of anchors) {
    const mediaTarget = relTarget(drawingRelsXml, embedRId);  // 如 ../media/image1.png
    if (!mediaTarget) continue;
    const mediaPath = normalizeZipPath('xl/drawings', mediaTarget);  // -> xl/media/image1.png
    const file = zip.file(mediaPath);
    if (!file) continue;
    const imgBuf = await file.async('nodebuffer');
    const ext = extFromPath(mediaPath);
    const rowIndex = row;  // 见文件头注释:anchor row 与 excelParser rowIndex 换算后相等
    if (!result.has(rowIndex)) result.set(rowIndex, []);
    result.get(rowIndex).push({ buffer: imgBuf, ext });
  }

  return result;
}

async function readIfExists(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  return f.async('string');
}

// 把 drawing/media 的相对路径(如 "../media/image1.png")相对 fromDir 解析成 zip 内的绝对路径
function normalizeZipPath(fromDir, relTarget) {
  const parts = fromDir.split('/').concat(relTarget.split('/'));
  const stack = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function relsPathFor(xmlPath) {
  const idx = xmlPath.lastIndexOf('/');
  const dir = xmlPath.slice(0, idx);
  const file = xmlPath.slice(idx + 1);
  return `${dir}/_rels/${file}.rels`;
}

module.exports = { extract };
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd "aiCompanion/server" && node test/imageExtractor.test.js`
Expected:
```
  ✓ extract() 返回按行分组的图片
  ✓ 无图行不在结果里
  ✓ 单图行返回1张
  ✓ 多图行返回2张

4 个测试全部通过
```

- [ ] **Step 7: 加测试脚本到 package.json**

**当前 `aiCompanion/server/package.json` 第 6-13 行：**

```json
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "migrate": "node migrations/run.js",
    "test": "node test/run.js",
    "test:kb": "node test/kb.run.js",
    "test:chat": "node test/chat.run.js",
    "test:kg": "node test/kg.run.js"
  },
```

用 Edit 工具替换为：

```json
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "migrate": "node migrations/run.js",
    "test": "node test/run.js",
    "test:kb": "node test/kb.run.js",
    "test:chat": "node test/chat.run.js",
    "test:kg": "node test/kg.run.js",
    "test:images": "node test/imageExtractor.test.js && node test/kb-images.run.js"
  },
```

（`test:images` 提前引用 Task 5 才会创建的 `kb-images.run.js`；Task 5 完成前单独跑 `node test/imageExtractor.test.js` 即可，不影响本步。）

- [ ] **Step 8: Commit**

```bash
cd "aiCompanion/server"
git add test/fixtures/generateWithImages.js src/services/imageExtractor.js test/imageExtractor.test.js package.json
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): imageExtractor 解析 xlsx 内嵌图片 drawing 锚点"
```

---

## Task 4: `ingestWorker.js` — 接入图片抽取与落库

**Files:**
- Modify: `aiCompanion/server/src/services/ingestWorker.js`

**当前完整内容见上文 Read 结果（133 行）。关键改动点：**

- [ ] **Step 1: 引入 imageExtractor 与 cfg 的图片目录**

在文件顶部 require 区（第 3-10 行），把：

```js
const fs = require('fs');
const db = require('../config/db');
const cfg = require('../config/kb');
const excelParser = require('./excelParser');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');
const graphExtractor = require('./graphExtractor');
const kgContext = require('./kgContext');
```

替换为：

```js
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const cfg = require('../config/kb');
const excelParser = require('./excelParser');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');
const graphExtractor = require('./graphExtractor');
const kgContext = require('./kgContext');
const imageExtractor = require('./imageExtractor');
```

- [ ] **Step 2: 在图谱抽取后插入图片抽取逻辑**

原第 91-93 行：

```js
  // 图谱抽取(含别名与条目-实体关联)，完成后失效该版本的别名缓存
  await graphExtractor.extract({ versionId, documentId, headers: parsed.headers, rows: allRows, entryIdByRow });
  kgContext.invalidate(versionId);
```

替换为（新增图片抽取块，紧跟图谱抽取后，两者互不依赖，图片抽取失败不影响图谱/文本主流程）：

```js
  // 图谱抽取(含别名与条目-实体关联)，完成后失效该版本的别名缓存
  await graphExtractor.extract({ versionId, documentId, headers: parsed.headers, rows: allRows, entryIdByRow });
  kgContext.invalidate(versionId);

  // 内嵌图片抽取:失败不影响文本/图谱主流程,记日志跳过即可
  try {
    const imagesByRow = await imageExtractor.extract(filePath);
    if (imagesByRow.size > 0) {
      const docDir = path.join(cfg.kbImagesDir, String(versionId), String(documentId));
      fs.mkdirSync(docDir, { recursive: true });
      for (const [rowIndex, images] of imagesByRow) {
        const entryId = entryIdByRow.get(rowIndex);
        if (!entryId) continue;
        for (let n = 0; n < images.length; n++) {
          const { buffer, ext } = images[n];
          const filename = `${rowIndex}_${n + 1}.${ext}`;
          fs.writeFileSync(path.join(docDir, filename), buffer);
          const url = `/kb-images/${versionId}/${documentId}/${filename}`;
          await db.query(
            'INSERT INTO kb_entry_images (entry_id, version_id, url) VALUES (?,?,?)',
            [entryId, versionId, url]
          );
        }
      }
    }
  } catch (err) {
    console.error('[ingestWorker] 图片抽取失败(不影响主流程):', err.message);
  }
```

- [ ] **Step 3: 语法检查**

Run: `cd "aiCompanion/server" && node --check src/services/ingestWorker.js`
Expected: 无输出

- [ ] **Step 4: 回归现有 kb 测试（确认无图 xlsx 导入不受影响）**

Run: `cd "aiCompanion/server" && node test/kb.run.js`
Expected: 最后一行 `10 个测试全部通过`（现有样本 `sample.xlsx` 无内嵌图片，`imageExtractor.extract` 应返回空 Map，走完 try 块什么都不做）

- [ ] **Step 5: Commit**

```bash
cd "aiCompanion/server"
git add src/services/ingestWorker.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): ingestWorker 接入图片抽取写盘落库"
```

---

## Task 5: 端到端集成测试 — 完整导入流程

**Files:**
- Create: `aiCompanion/server/test/kb-images.run.js`

- [ ] **Step 1: 写集成测试**

参考 `test/kb.run.js` 的请求封装风格（分片上传→手动 tick worker→查结果），用 Task 3 生成的 `sample_with_images.xlsx`。

Create `aiCompanion/server/test/kb-images.run.js`:

```js
// 知识库图片提取端到端测试:上传含内嵌图 xlsx -> ingest -> 验证落库+磁盘文件+级联删除。
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/db');
const cfg = require('../src/config/kb');
const embedding = require('../src/services/embedding');
const vectorStore = require('../src/services/vectorStore');
const ingestWorker = require('../src/services/ingestWorker');

const PORT = process.env.KB_IMG_TEST_PORT || 3195;

function fakeEmbed(text, dim = 64) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) v[i % dim] += (text.charCodeAt(i) % 97) / 97;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
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
      const boundary = '----kbimgtest' + Date.now();
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
    const adminUser = process.env.SUPER_ADMIN_USERNAME || 'admin';
    const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!';
    const login = await req('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;
    const me = await req('GET', '/api/auth/me', { token });
    const v1 = me.body.versions[0].id;

    require('./fixtures/generateWithImages');
    const samplePath = path.join(__dirname, 'fixtures', 'sample_with_images.xlsx');
    const fileBuf = fs.readFileSync(samplePath);

    let documentId, jobId;
    await test('上传含内嵌图 xlsx', async () => {
      const init = await req('POST', '/api/kb/uploads/init', {
        token, versionId: v1, body: { name: 'sample_with_images.xlsx', size: fileBuf.length, totalChunks: 1 },
      });
      assert.strictEqual(init.status, 201);
      const up = await req('POST', `/api/kb/uploads/${init.body.uploadId}/chunk`, {
        token, versionId: v1,
        form: { fields: { index: '0' }, file: { name: 'chunk', filename: 'c0', buffer: fileBuf } },
      });
      assert.strictEqual(up.status, 200);
      const done = await req('POST', `/api/kb/uploads/${init.body.uploadId}/complete`, { token, versionId: v1, body: {} });
      assert.strictEqual(done.status, 201);
      documentId = done.body.documentId;
      jobId = done.body.jobId;
    });

    await test('worker 处理完成', async () => {
      await ingestWorker.tick();
      const r = await req('GET', `/api/kb/jobs/${jobId}`, { token, versionId: v1 });
      assert.strictEqual(r.body.status, 'done', 'job 应为 done, 实际 ' + r.body.status + ' error=' + r.body.error);
    });

    let entries;
    await test('条目落库(4行)', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 4);
      entries = r.body;
    });

    await test('图片按行精确关联落库', async () => {
      const [rows] = await db.query(
        `SELECT ee.entry_id, ee.url, e.row_index FROM kb_entry_images ee
           JOIN knowledge_entries e ON e.id = ee.entry_id WHERE e.version_id=? AND e.document_id=?`,
        [v1, documentId]
      );
      const byRow = new Map();
      for (const r of rows) {
        if (!byRow.has(r.row_index)) byRow.set(r.row_index, []);
        byRow.get(r.row_index).push(r.url);
      }
      assert.strictEqual(byRow.has(1), false, '亚瑟行(row_index=1)不应有图');
      assert.strictEqual(byRow.get(2).length, 1, '妲己行应有1张图');
      assert.strictEqual(byRow.get(3).length, 2, '后羿行应有2张图');
      assert.strictEqual(byRow.has(4), false, '庄周行不应有图');
    });

    await test('图片文件确实写入磁盘', async () => {
      const [rows] = await db.query('SELECT url FROM kb_entry_images WHERE version_id=?', [v1]);
      assert.ok(rows.length >= 3);
      for (const r of rows) {
        const diskPath = path.join(cfg.kbImagesDir, r.url.replace(/^\/kb-images\//, ''));
        assert.ok(fs.existsSync(diskPath), '文件应存在: ' + diskPath);
      }
    });

    await test('静态路由可访问图片', async () => {
      const [rows] = await db.query('SELECT url FROM kb_entry_images WHERE version_id=? LIMIT 1', [v1]);
      const r = await req('GET', rows[0].url, {});
      assert.strictEqual(r.status, 200);
    });

    await test('B端条目预览接口返回 images 字段', async () => {
      const r = await req('GET', `/api/kb/entries?documentId=${documentId}`, { token, versionId: v1 });
      const withImg = r.body.find(e => e.row_index === 2);
      assert.ok(Array.isArray(withImg.images), 'entries 应带 images 字段');
      assert.strictEqual(withImg.images.length, 1);
      const noImg = r.body.find(e => e.row_index === 1);
      assert.deepStrictEqual(noImg.images, [], '无图行 images 应为空数组');
    });

    await test('删除文档级联清理数据库与磁盘', async () => {
      const docDir = path.join(cfg.kbImagesDir, String(v1), String(documentId));
      assert.ok(fs.existsSync(docDir), '删除前目录应存在');
      const r = await req('DELETE', `/api/kb/documents/${documentId}`, { token, versionId: v1 });
      assert.strictEqual(r.status, 200);
      const [rows] = await db.query('SELECT id FROM kb_entry_images WHERE version_id=? AND entry_id IN (SELECT id FROM knowledge_entries WHERE document_id=?)', [v1, documentId]);
      assert.strictEqual(rows.length, 0, 'kb_entry_images 应级联删除');
      assert.strictEqual(fs.existsSync(docDir), false, '磁盘目录应被清理');
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

- [ ] **Step 2: 跑测试（预期先失败，因为 Task 6/7 的 route/静态路由尚未实现）**

Run: `cd "aiCompanion/server" && node test/kb-images.run.js`
Expected: 前 3 项通过（上传/worker/条目），"图片按行精确关联落库"这项应该通过（因为 Task 4 已完成落库），但 "B端条目预览接口返回 images 字段" 和 "静态路由可访问图片" 应失败（`undefined` 或 404），"删除文档级联清理...磁盘" 也会失败（Task 6 才实现磁盘清理）。这是预期的——继续做 Task 6/7 后回来重跑。

**注：此 Step 只是中间检查点，不要求此刻全绿。继续 Task 6、7 后在 Task 8 统一验证全绿。**

---

## Task 6: 静态路由 + 删除文档时清理磁盘

**Files:**
- Modify: `aiCompanion/server/src/app.js`
- Modify: `aiCompanion/server/src/routes/kb.js`

- [ ] **Step 1: `app.js` 新增静态路由**

**当前第 1-8 行：**

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     require('./routes/auth'));
```

用 Edit 把：

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     require('./routes/auth'));
```

替换为：

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cfg = require('./config/kb');

const app = express();
app.use(cors({ exposedHeaders: ['X-Version-Id'] }));
app.use(express.json({ limit: '10mb' }));
app.use('/kb-images', express.static(cfg.kbImagesDir));

app.use('/api/auth',     require('./routes/auth'));
```

- [ ] **Step 2: `kb.js` 顶部新增 `fs`/`path` require**

**当前第 1-12 行：**

```js
const router = require('express').Router();
const multer = require('multer');
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const uploadStore = require('../services/uploadStore');
const embedding = require('../services/embedding');
const vectorStore = require('../services/vectorStore');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
```

替换为：

```js
const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const multer = require('multer');
const db = require('../config/db');
const version = require('../middleware/version');
const ah = require('../utils/asyncHandler');
const { fail } = require('../utils/errors');
const cfg = require('../config/kb');
const uploadStore = require('../services/uploadStore');
const embedding = require('../services/embedding');
const vectorStore = require('../services/vectorStore');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
```

- [ ] **Step 3: `kb.js` 删除文档时清理 `kb_entry_images` 磁盘目录**

**当前第 83-91 行（行号因 Step 2 新增了 2 行 require 而整体下移，用内容定位）：**

```js
router.delete('/documents/:id', ah(async (req, res) => {
  // 收集 entryIds 从内存索引移除
  const [entries] = await db.query('SELECT id FROM knowledge_entries WHERE version_id=? AND document_id=?', [req.versionId, req.params.id]);
  const entryIds = entries.map(e => e.id);
  const [r] = await db.query('DELETE FROM kb_documents WHERE version_id=? AND id=?', [req.versionId, req.params.id]);
  if (r.affectedRows === 0) return fail(res, 404, '文档不存在');
  vectorStore.removeDocument(req.versionId, entryIds);
  res.json({ ok: true });
}));
```

替换为（`kb_entry_images` 记录靠外键 `ON DELETE CASCADE` 自动清理，这里只需删磁盘目录）：

```js
router.delete('/documents/:id', ah(async (req, res) => {
  // 收集 entryIds 从内存索引移除
  const [entries] = await db.query('SELECT id FROM knowledge_entries WHERE version_id=? AND document_id=?', [req.versionId, req.params.id]);
  const entryIds = entries.map(e => e.id);
  const [r] = await db.query('DELETE FROM kb_documents WHERE version_id=? AND id=?', [req.versionId, req.params.id]);
  if (r.affectedRows === 0) return fail(res, 404, '文档不存在');
  vectorStore.removeDocument(req.versionId, entryIds);
  // kb_entry_images 数据库记录靠外键级联删除,这里清理对应的磁盘图片目录
  const imgDir = path.join(cfg.kbImagesDir, String(req.versionId), String(req.params.id));
  try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch { /* ignore */ }
  res.json({ ok: true });
}));
```

- [ ] **Step 4: `kb.js` 条目预览接口(`/entries`)追加 `images` 字段**

**当前第 93-104 行（改动前，Step 3 已加了 fs/path require，行号会往后偏移 2 行，用内容定位而非行号）：**

```js
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
```

替换为（批量查图，避免 N+1；无图 entry 得到 `images: []`）：

```js
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
  if (rows.length === 0) return res.json([]);
  const ids = rows.map(r => r.id);
  const [imgRows] = await db.query(
    `SELECT entry_id, url FROM kb_entry_images WHERE entry_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const imagesByEntry = new Map();
  for (const img of imgRows) {
    if (!imagesByEntry.has(img.entry_id)) imagesByEntry.set(img.entry_id, []);
    imagesByEntry.get(img.entry_id).push(img.url);
  }
  res.json(rows.map(r => ({ ...r, images: imagesByEntry.get(r.id) || [] })));
}));
```

- [ ] **Step 5: 语法检查**

Run: `cd "aiCompanion/server" && node --check src/app.js && node --check src/routes/kb.js`
Expected: 无输出

- [ ] **Step 6: Commit**

```bash
cd "aiCompanion/server"
git add src/app.js src/routes/kb.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): 图片静态路由 + 删文档清盘 + entries接口带images"
```

---

## Task 7: `ragContext.js` — RAG refs 追加图片

**Files:**
- Modify: `aiCompanion/server/src/services/ragContext.js`

**当前完整内容（42 行，见上文 Read 结果）。**

- [ ] **Step 1: `retrieve()` 批量查图并追加到 refs**

把第 1-32 行：

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
```

替换为（新增一次批量查图，追加 `images` 字段；查图失败不影响主检索——包在同一个 try 里，图查询异常会被外层 catch 兜底降级为无图但仍返回文字 refs，这里为了让"图查询失败不拖累文字检索"更明确，单独 try/catch 图片这一小段）：

```js
// RAG 上下文:用户查询 → embedding → vectorStore 余弦检索 → 拿条目详情 → 返回 refs 列表
const db = require('../config/db');
const embedding = require('./embedding');
const vectorStore = require('./vectorStore');

const SNIPPET_MAX = 200;   // C 端展示的 snippet 截取字数

// 批量查 entry 关联的图片,返回 Map<entryId, string[]>。查询失败返回空 Map(不影响文字检索)。
async function loadImagesByEntry(ids) {
  try {
    const [imgRows] = await db.query(
      `SELECT entry_id, url FROM kb_entry_images WHERE entry_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const map = new Map();
    for (const img of imgRows) {
      if (!map.has(img.entry_id)) map.set(img.entry_id, []);
      map.get(img.entry_id).push(img.url);
    }
    return map;
  } catch (err) {
    console.error('[ragContext] loadImagesByEntry failed:', err.message);
    return new Map();
  }
}

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
    const imagesByEntry = await loadImagesByEntry(ids);
    return hits
      .filter(h => byId.has(h.entryId))
      .map(h => ({
        entryId: h.entryId,
        score: h.score,
        snippet: String(byId.get(h.entryId)).slice(0, SNIPPET_MAX),
        images: imagesByEntry.get(h.entryId) || [],
      }));
  } catch (err) {
    console.error('[ragContext] retrieve failed:', err.message);
    return [];
  }
}
```

**`toContextBlock()` 与 `module.exports` 保持不变**——图片不进 LLM prompt 文本，只追加在 refs 结构里。

- [ ] **Step 2: 语法检查**

Run: `cd "aiCompanion/server" && node --check src/services/ragContext.js`
Expected: 无输出

- [ ] **Step 3: 回归 chat 与 kg 测试（确认 refs 结构追加字段不破坏现有断言）**

Run: `cd "aiCompanion/server" && node test/chat.run.js && node test/kg.run.js`
Expected: 两个都以 `全部通过` 结尾（`chat.run.js` 11 个测试，`kg.run.js` 12 个测试）。现有测试对 refs 的断言都是检查特定字段存在/特定值，不会因为多了 `images` 字段而失败(向后兼容追加原则)。

- [ ] **Step 4: Commit**

```bash
cd "aiCompanion/server"
git add src/services/ragContext.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/kb): ragContext.retrieve 追加 images 字段到 refs"
```

---

## Task 8: 端到端集成测试收尾 — 全绿验证

**Files:**
- 无新文件，重跑 Task 5 创建的测试并确认全部通过

- [ ] **Step 1: 重跑图片集成测试**

Run: `cd "aiCompanion/server" && node test/kb-images.run.js`
Expected:
```
  ✓ 上传含内嵌图 xlsx
  ✓ worker 处理完成
  ✓ 条目落库(4行)
  ✓ 图片按行精确关联落库
  ✓ 图片文件确实写入磁盘
  ✓ 静态路由可访问图片
  ✓ B端条目预览接口返回 images 字段
  ✓ 删除文档级联清理数据库与磁盘

8 个测试全部通过
```

若某一项仍失败，回退到对应 Task（静态路由失败→查 Task 6 Step 1；images 字段缺失→查 Task 6 Step 4；级联清理失败→查 Task 6 Step 2）排查，不要跳过继续往后做。

- [ ] **Step 2: 全量回归（Task 3/4/6/7 的语法检查已做过，这里跑完整套件）**

Run:
```bash
cd "aiCompanion/server"
node test/run.js && node test/kb.run.js && node test/chat.run.js && node test/kg.run.js && node test/imageExtractor.test.js && node test/kb-images.run.js
```
Expected: 依次输出各套件的"N 个测试全部通过"，无 `✗ 测试失败` 字样，整体命令 exit code 为 0。

- [ ] **Step 3: 更新 `.env.example` 说明新配置项（可选环境变量，有默认值不强制要求）**

**当前 `aiCompanion/server/.env.example` 第 24-26 行：**

```
# 分片上传临时目录（相对 server 目录）
KB_UPLOAD_TMP_DIR=uploads/tmp
```

替换为：

```
# 分片上传临时目录（相对 server 目录）
KB_UPLOAD_TMP_DIR=uploads/tmp

# 知识库内嵌图片存储目录（相对 server 目录，长期保留不清理）
KB_IMAGES_DIR=uploads/kb-images
```

- [ ] **Step 4: Commit**

```bash
cd "aiCompanion/server"
git add .env.example
HUSKY_SKIP_HOOKS=1 git commit -m "docs(aiCompanion/kb): .env.example 补充 KB_IMAGES_DIR 说明"
```

---

## Task 9: C 端 `chat.js` — 缩略图渲染 + 点击放大

**Files:**
- Modify: `aiCompanion/web/js/chat.js`
- Modify: `aiCompanion/web/css/style.css`

- [ ] **Step 1: `chat.js` 的 `appendMsg` 增加图片渲染**

**当前第 30-42 行：**

```js
function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'assistant' ? 'bot' : 'user');
  let refsHtml = '';
  if (refs && refs.length) {
    refsHtml = `<div class="refs">参考 ${refs.length} 条: ${refs.map(r => `<span class="ref-item">#${r.entryId} (${r.score.toFixed(3)})</span>`).join('')}</div>`;
  }
  div.innerHTML = `<div class="bubble">${escapeHtml(content)}</div>${refsHtml}`;
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
}
```

替换为（新增 `imagesHtml`；用 `flatMap` 收集所有 ref 里的图片 URL 去重后渲染；点击调用全局 `showFullImage`）：

```js
function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'assistant' ? 'bot' : 'user');
  let refsHtml = '';
  let imagesHtml = '';
  if (refs && refs.length) {
    refsHtml = `<div class="refs">参考 ${refs.length} 条: ${refs.map(r => `<span class="ref-item">#${r.entryId} (${r.score.toFixed(3)})</span>`).join('')}</div>`;
    const imgUrls = [...new Set(refs.flatMap(r => r.images || []))];
    if (imgUrls.length > 0) {
      imagesHtml = `<div class="ref-images">${imgUrls.map(url =>
        `<img class="ref-thumb" src="${API_ORIGIN}${escapeHtml(url)}" onclick="showFullImage('${API_ORIGIN}${escapeHtml(url)}')">`
      ).join('')}</div>`;
    }
  }
  div.innerHTML = `<div class="bubble">${escapeHtml(content)}</div>${imagesHtml}${refsHtml}`;
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
}

// 全屏遮罩看原图,点遮罩关闭
function showFullImage(url) {
  const old = document.getElementById('img-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'img-overlay';
  overlay.className = 'img-overlay';
  overlay.innerHTML = `<img src="${url}">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}
window.showFullImage = showFullImage;
```

- [ ] **Step 2: 图片 URL 需要拼 server origin（`chat.js` 现在用相对路径 API_BASE 拼接的是 `/api` 前缀，图片走的是根路径 `/kb-images`，需要单独一个 `API_ORIGIN`）**

**当前第 1 行：**

```js
const API_BASE = (localStorage.getItem('apiBase') || 'http://localhost:3100') + '/api';
```

替换为：

```js
const API_ORIGIN = localStorage.getItem('apiBase') || 'http://localhost:3100';
const API_BASE = API_ORIGIN + '/api';
```

- [ ] **Step 3: 新增缩略图/遮罩 CSS**

在 `aiCompanion/web/css/style.css` 第 514 行（`.msg .refs { ... }` 规则）后插入新规则。

**定位当前内容（第 513-523 行）：**

```css
.msg.bot.thinking .bubble { color: var(--text-tertiary); font-style: italic; }
.msg .refs { font-size: 11px; color: var(--text-tertiary); padding: 0 6px; }
.msg .refs .ref-item {
  display: inline-block;
  background: var(--primary-bg);
  color: var(--primary-active);
  padding: 1px 6px;
  border-radius: 8px;
  margin-right: 4px;
  font-size: 11px;
}
```

用 Edit 工具，在这段末尾（`}`  之后）追加：

```css
.msg .ref-images { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 6px; }
.msg .ref-images .ref-thumb {
  width: 60px; height: 60px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border-secondary);
  cursor: pointer;
  transition: transform .15s ease;
}
.msg .ref-images .ref-thumb:hover { transform: scale(1.05); }
.img-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 3000; cursor: zoom-out;
}
.img-overlay img { max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
```

- [ ] **Step 4: 手动验证（无自动化前端测试，走一次真实 UI 流程）**

Run:
```bash
cd "aiCompanion/server" && npm start
```
在浏览器打开 `aiCompanion/web/chat.html?versionId=<你的versionId>`（用之前上传含图资料的那个 versionId），提问一个能命中带图行的问题，检查：
1. 回复气泡下方出现缩略图
2. 点击缩略图，全屏遮罩显示原图
3. 点击遮罩空白处，遮罩关闭

Expected: 三步行为符合描述。若缩略图不出现，检查浏览器 Network 面板确认 `/api/public/chat` 返回的 `refs[].images` 是否非空，以及图片 URL 是否 200。

- [ ] **Step 5: Commit**

```bash
cd "aiCompanion/web"
git add js/chat.js css/style.css
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/web): C端对话气泡下方渲染图片缩略图+点击放大"
```

---

## Task 10: B 端 `knowledge.js` — 预览列表带图

**Files:**
- Modify: `aiCompanion/web/js/pages/knowledge.js`

- [ ] **Step 1: `previewDoc` 渲染 images**

**当前第 140-153 行：**

```js
  async function previewDoc(id) {
    const detail = document.getElementById('kb-detail');
    detail.innerHTML = '<div class="card">加载中…</div>';
    try {
      const entries = await window.api.apiFetch(`/kb/entries?documentId=${id}&limit=20`, { withVersion: true });
      detail.innerHTML = `
        <div class="card">
          <div class="card-title">📄 条目预览 (前 20 条)</div>
          ${entries.map(e => `
            <div style="background:#fafafa;border:1px solid var(--border-secondary);border-radius:6px;padding:12px 14px;margin-bottom:8px;white-space:pre-wrap;font-size:13px;color:var(--text-secondary);">${escapeHtml(e.content)}</div>
          `).join('')}
        </div>`;
    } catch (err) { detail.innerHTML = `<div class="card">失败: ${err.message}</div>`; }
  }
```

替换为（每条内容旁展示图片，取 `apiBase` 拼绝对 URL）：

```js
  async function previewDoc(id) {
    const detail = document.getElementById('kb-detail');
    detail.innerHTML = '<div class="card">加载中…</div>';
    try {
      const entries = await window.api.apiFetch(`/kb/entries?documentId=${id}&limit=20`, { withVersion: true });
      const apiOrigin = localStorage.getItem('apiBase') || 'http://localhost:3100';
      detail.innerHTML = `
        <div class="card">
          <div class="card-title">📄 条目预览 (前 20 条)</div>
          ${entries.map(e => `
            <div style="background:#fafafa;border:1px solid var(--border-secondary);border-radius:6px;padding:12px 14px;margin-bottom:8px;">
              <div style="white-space:pre-wrap;font-size:13px;color:var(--text-secondary);">${escapeHtml(e.content)}</div>
              ${(e.images && e.images.length) ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                  ${e.images.map(url => `<img src="${apiOrigin}${escapeHtml(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-secondary);">`).join('')}
                </div>` : ''}
            </div>
          `).join('')}
        </div>`;
    } catch (err) { detail.innerHTML = `<div class="card">失败: ${err.message}</div>`; }
  }
```

- [ ] **Step 2: 手动验证**

Run: `cd "aiCompanion/server" && npm start`，打开 B 端知识库管理页面，对之前上传的含图文档点「预览」。
Expected: 条目预览列表里，有图的行下方出现 60×60 缩略图，无图的行没有多余空白。

- [ ] **Step 3: Commit**

```bash
cd "aiCompanion/web"
git add js/pages/knowledge.js
HUSKY_SKIP_HOOKS=1 git commit -m "feat(aiCompanion/web): B端知识库预览列表显示条目图片"
```

---

## Task 11: 收尾 — 全量回归 + 更新变更文档

**Files:**
- Create: `.claude/docs/2026-07/2026-07-14/v001_changelog.md`（若当天已有 v001，改用下一个可用序号，先用 Bash 检查该目录）

- [ ] **Step 1: 确认当天变更文档序号**

Run: `ls ".claude/docs/2026-07/2026-07-14/" 2>/dev/null || echo "目录不存在,用 v001"`
Expected: 如果目录不存在或为空，用 `v001_changelog.md`；如果已有 `v001_changelog.md`，用 `v002_changelog.md`，以此类推。

- [ ] **Step 2: 写变更文档**

Create（文件名按 Step 1 结果确定）`.claude/docs/2026-07/2026-07-14/v001_changelog.md`（内容示例，若序号不同只改文件名不改内容）:

```markdown
# v001 变更文档 · AI 陪伴机器人子项目5（知识库内嵌图片提取与展示）

从上传的 xlsx 内嵌图片(drawing 锚点解析,非单元格URL文本)提取图片,精确关联到所在行,存本地磁盘(uploads/kb-images/),新增 kb_entry_images 表。RAG 检索(ragContext.retrieve)与 B 端条目预览(/api/kb/entries)追加 images 字段到返回结构(向后兼容追加)。C 端对话气泡下方渲染缩略图,点击全屏放大;B 端预览列表同步显示。新增迁移 006_kb_images.sql,新增服务 imageExtractor.js。集成测试 8/8,全量回归通过。
```

- [ ] **Step 3: 最终全量回归**

Run:
```bash
cd "aiCompanion/server"
node test/run.js && node test/kb.run.js && node test/chat.run.js && node test/kg.run.js && node test/imageExtractor.test.js && node test/kb-images.run.js
```
Expected: 全部套件输出"N 个测试全部通过"，无失败。

- [ ] **Step 4: Commit**

```bash
git add ".claude/docs/2026-07/2026-07-14/"
HUSKY_SKIP_HOOKS=1 git commit -m "docs(aiCompanion/bot): v001 变更文档 - 知识库内嵌图片提取与展示"
```

---

## Plan Self-Review Notes（写计划时已自查，记录于此供执行者参考）

- **Spec 覆盖检查**：设计文档 6 个部分(架构总览/数据模型/存储布局/检索链路/前端展示/测试计划)在 Task 1-11 均有对应任务覆盖，无遗漏。
- **行号换算风险点**：Task 3 Step 5 里 anchor row → excelParser rowIndex 的换算(`rowIndex = anchorRow`)是全计划最容易出错的地方，已在 Task 3 的测试样本里显式构造"表头+4数据行，图分别锚定在第2/3数据行"来验证换算正确，执行时如果 Task 3 Step 6 测试不过，优先怀疑这个换算公式。
- **迁移编号**：确认当前最新迁移是 `005_kg.sql`，故本计划用 `006_kb_images.sql`（设计文档草稿曾误写 007，已在设计文档定稿时修正为 006，本计划保持一致）。
- **一致性检查**：`imageExtractor.extract()` 返回类型统一为 `Map<rowIndex, [{buffer, ext}]>`，Task 3/4/5 三处引用签名一致。`kb_entry_images.url` 字段格式统一为 `/kb-images/<versionId>/<documentId>/<filename>`，Task 4(写入)/6(静态路由挂载点)/7(读取)/9/10(前端拼接)四处保持一致。
