require('../../../server/src/runtimeEnv').loadRuntimeEnv();
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Repository } = require('../../../server/src/db/repository');
const repo = new Repository();
async function main() {
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT j.* FROM po_translation_jobs j JOIN po_contents c ON c.id=j.content_id WHERE c.published_at<'2026-09-10 16:00:00' AND j.status<>'completed' ORDER BY j.id FOR UPDATE");
    const snapshot = JSON.stringify({ capturedAt: new Date().toISOString(), boundaryUtc: '2026-09-10 16:00:00', expected: 9185, rows });
    const backup = 'C:/ProgramData/PublicOpinion/config/backups/translation-20260918/jobs-preview.json';
    fs.writeFileSync(backup, snapshot, { flag: 'wx' });
    const hash = crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex');
    await conn.rollback();
    console.log(JSON.stringify({ backup, sha256: hash, expected: 9185, actual: rows.length, action: 'ROLLBACK_NO_DELETE', reason: rows.length === 9185 ? 'preview_only' : 'approved_count_mismatch' }));
  } finally { try { await conn.rollback(); } finally { conn.release(); } }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => repo.pool.end());
