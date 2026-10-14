require('../../../server/src/runtimeEnv').loadRuntimeEnv();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Repository } = require('../../../server/src/db/repository');
const repo = new Repository();
async function main() {
  const rows = await repo.query("SELECT j.id,j.content_id,j.status,j.attempts,j.created_at,c.published_at,c.community_id,c.content_type,j.lease_owner,j.lease_until FROM po_translation_jobs j JOIN po_contents c ON c.id=j.content_id WHERE c.published_at<'2026-09-10 16:00:00' AND j.status<>'completed' ORDER BY j.id");
  const statusCounts = {};
  for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  const manifest = path.join(__dirname, 'v008_translation_cleanup_manifest.json');
  const capturedAt = new Date().toISOString();
  fs.writeFileSync(manifest, JSON.stringify({ capturedAt, boundaryUtc: '2026-09-10 16:00:00', boundaryBeijing: '2026-09-11 00:00:00', condition: "status <> 'completed'", count: rows.length, statusCounts, rows }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ capturedAt, count: rows.length, statusCounts, manifest, sha256: crypto.createHash('sha256').update(fs.readFileSync(manifest)).digest('hex'), distinctContents: new Set(rows.map(row => row.content_id)).size, firstId: rows[0]?.id, lastId: rows.at(-1)?.id }));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => repo.pool.end());
