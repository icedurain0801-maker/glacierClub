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

  const finalPath = await uploadStore.mergeChunks(req.params.id);
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
router.get('/documents', ah(async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, status, row_count, created_at FROM kb_documents WHERE version_id=? ORDER BY id DESC',
    [req.versionId]
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
  // kb_entry_images 数据库记录靠外键级联删除,这里清理对应的磁盘图片目录
  const imgDir = path.join(cfg.kbImagesDir, String(req.versionId), String(req.params.id));
  try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch (err) { console.error('[kb] 图片目录清理失败:', imgDir, err.message); }
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
