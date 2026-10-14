'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { planSiteRegistryRepair } = require('../server/src/services/siteRegistryRepair');
const fail = code => { throw Object.assign(new Error(code), { code }); };
async function main() {
  const sourceId = process.argv[2], applyHash = process.argv[3];
  if (!/^[a-f0-9-]{36}$/.test(sourceId || '') || (applyHash && !/^[a-f0-9]{64}$/.test(applyHash))) fail('REPAIR_ARGUMENTS_INVALID');
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  const { Repository } = require('../server/src/db/repository'), repo = new Repository();
  const conn = await repo.pool.getConnection();
  try {
    await conn.query('SET SESSION innodb_lock_wait_timeout=3');
    await conn.beginTransaction();
    const [[identity]] = await conn.query('SELECT DATABASE() AS db,@@port AS port');
    if (identity.db !== 'public_opinion' || Number(identity.port) !== 3306) fail('REPAIR_DB_MISMATCH');
    const [[source]] = await conn.query('SELECT id,platform,config,enabled,default_account_id FROM po_sources WHERE id=? FOR UPDATE', [sourceId]);
    if (!source || Number(source.enabled) !== 1) fail('REPAIR_SOURCE_INVALID');
    const [active] = await conn.query("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE", [sourceId]);
    if (active.length) fail('REPAIR_ACTIVE_RUN');
    const [leases] = await conn.query('SELECT lease_until>UTC_TIMESTAMP(3) AS active FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [sourceId]);
    if (leases.some(row => Number(row.active))) fail('REPAIR_ACTIVE_SCHEDULE_LEASE');
    const [checkpoints] = await conn.query('SELECT cp.id,cp.site_id,cp.`cursor`,cp.lease_until>UTC_TIMESTAMP(3) AS active FROM po_sync_checkpoints cp JOIN po_accounts a ON a.id=cp.account_id WHERE a.source_id=? FOR UPDATE', [sourceId]);
    if (checkpoints.some(row => Number(row.active))) fail('REPAIR_ACTIVE_CHECKPOINT');
    const [registry] = await conn.query('SELECT site_id,url,url_hash,enabled,auth_status,capabilities FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [sourceId]);
    const plan = planSiteRegistryRepair(source, registry);
    const report = { sourceId, planHash: plan.hash, existingSites: registry.length, retainedSiteIds: plan.retainedSiteIds, addedSiteIds: plan.additions.map(s => s.siteId), historyAndCheckpointsChanged: false };
    if (!applyHash) { await conn.rollback(); console.log(JSON.stringify({ ...report, status: 'INSPECTED' })); return; }
    if (applyHash !== plan.hash) fail('REPAIR_PLAN_CHANGED');
    const backupRoot = path.resolve(__dirname, '../../../.temp/source-site-repair');
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.writeFileSync(path.join(backupRoot, `${sourceId}-${Date.now()}.json`), JSON.stringify({ source, registry, checkpoints, planHash: plan.hash }, null, 2), { flag: 'wx' });
    for (const site of plan.additions) {
      await conn.query('INSERT INTO po_source_sites (id,source_id,site_id,url,url_hash,enabled,auth_status,capabilities) VALUES (?,?,?,?,?,?,?,?)', [crypto.randomUUID(), sourceId, site.siteId, site.url, crypto.createHash('sha256').update(site.url).digest('hex'), site.enabled ? 1 : 0, site.authStatus, JSON.stringify(site.capabilities)]);
    }
    await conn.query('UPDATE po_sources SET config=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [plan.afterConfig, sourceId]);
    const [after] = await conn.query('SELECT site_id,url,url_hash,enabled,auth_status,capabilities FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [sourceId]);
    if (planSiteRegistryRepair({ ...source, config: plan.afterConfig }, after).additions.length) fail('REPAIR_VERIFY_FAILED');
    for (const old of registry) if (JSON.stringify(after.find(row => row.site_id === old.site_id)) !== JSON.stringify(old)) fail('REPAIR_HISTORY_IDENTITY_CHANGED');
    await conn.commit();
    console.log(JSON.stringify({ ...report, status: 'COMMITTED' }));
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); await repo.pool.end(); }
}
if (require.main === module) main().catch(e => { console.error(e.code || 'REPAIR_FAILED'); process.exitCode = 1; });
