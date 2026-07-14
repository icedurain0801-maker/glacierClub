// 摄取流水线：轮询 ingest_jobs(pending)，跑「解析 → 写条目 → 向量化 → 图谱抽取」，更新进度。
// 同进程 setInterval，crash-safe：一次只挑一个 job；异常置 failed 记 error，不中断循环。
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

  // kb_documents.name 存 JSON {path, originalName}，由上传路由 complete 时写入。
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

  // 分批：写条目 + 向量化。entryIdByRow 供图谱抽取写条目-实体关联。
  const entryIdByRow = new Map();
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
      entryIdByRow.set(r.rowIndex, ins.insertId);
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
