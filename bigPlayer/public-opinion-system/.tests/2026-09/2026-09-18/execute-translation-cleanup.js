require('../../../server/src/runtimeEnv').loadRuntimeEnv();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Repository } = require('../../../server/src/db/repository');

const expectedSha = 'da5cc805838f80193e1cf998e2c210bfafbf544757c6769eb4ee60596dfdf54a';
const expectedCount = 9404;
const manifestPath = path.join(__dirname, 'v008_translation_cleanup_manifest.json');
const backupDirectory = 'C:/ProgramData/PublicOpinion/config/backups/translation-20260918';
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  if (!process.argv.includes('--execute')) throw new Error('CLEANUP_EXECUTION_FLAG_REQUIRED');
  if (hashFile(manifestPath) !== expectedSha) throw new Error('CLEANUP_MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ids = manifest.rows.map(row => String(row.id));
  if (ids.length !== expectedCount || new Set(ids).size !== expectedCount) throw new Error('CLEANUP_MANIFEST_COUNT_MISMATCH');

  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const manifestBackup = path.join(backupDirectory, `translation-cleanup-${stamp}-manifest.json`);
  fs.copyFileSync(manifestPath, manifestBackup, fs.constants.COPYFILE_EXCL);

  const repo = new Repository();
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('CREATE TEMPORARY TABLE cleanup_manifest_ids (id CHAR(36) PRIMARY KEY) ENGINE=MEMORY');
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500);
      await conn.query(`INSERT INTO cleanup_manifest_ids (id) VALUES ${batch.map(() => '(?)').join(',')}`, batch);
    }
    const [locked] = await conn.query("SELECT j.* FROM po_translation_jobs j JOIN cleanup_manifest_ids m ON m.id=j.id WHERE j.status<>'completed' FOR UPDATE");
    if (locked.length !== expectedCount) {
      await conn.rollback();
      console.log(JSON.stringify({ action: 'ROLLBACK_NO_DELETE', expectedCount, lockedCount: locked.length, manifestBackup, manifestSha256: hashFile(manifestBackup) }));
      return;
    }
    const snapshotPath = path.join(backupDirectory, `translation-cleanup-${stamp}-locked-rows.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify({ capturedAt: new Date().toISOString(), manifestSha256: expectedSha, rows: locked }), { flag: 'wx' });
    const [deleted] = await conn.query("DELETE j FROM po_translation_jobs j JOIN cleanup_manifest_ids m ON m.id=j.id WHERE j.status<>'completed'");
    if (Number(deleted.affectedRows) !== expectedCount) {
      await conn.rollback();
      console.log(JSON.stringify({ action: 'ROLLBACK_NO_DELETE', expectedCount, lockedCount: locked.length, deletedCount: Number(deleted.affectedRows), manifestBackup, manifestSha256: hashFile(manifestBackup), snapshotPath, snapshotSha256: hashFile(snapshotPath) }));
      return;
    }
    await conn.commit();
    const [rows] = await repo.query('SELECT status,COUNT(*) AS count FROM po_translation_jobs GROUP BY status');
    console.log(JSON.stringify({ action: 'COMMITTED_DELETE', expectedCount, deletedCount: Number(deleted.affectedRows), manifestBackup, manifestSha256: hashFile(manifestBackup), snapshotPath, snapshotSha256: hashFile(snapshotPath), remainingByStatus: rows }));
  } finally {
    try { await conn.rollback(); } catch {}
    conn.release();
    await repo.pool.end();
  }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
