'use strict';
const { loadOriginals } = require('./overseas-real-artifact-audit');
async function inventory(repo) {
  const { items } = loadOriginals();
  const sourceId = items.sourceId;
  const ids = [...new Set(items.sites.flatMap(s => s.items.map(i => String(i.externalId))))];
  const marks = ids.map(() => '?').join(',');
  const tables = ['po_contents', 'po_content_feed_memberships', 'po_sync_runs', 'po_sync_run_contents', 'po_source_sites', 'po_analysis_jobs', 'po_translation_jobs', 'po_source_sync_state'];
  const columns = await repo.query(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')}) ORDER BY TABLE_NAME,ORDINAL_POSITION`, tables);
  const indexes = await repo.query(`SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(() => '?').join(',')}) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`, tables);
  const contents = await repo.query(`SELECT id,source_id,account_id,game_id,community_id,external_id,content_type,fingerprint,is_deleted,CHAR_LENGTH(body) AS body_chars,SHA2(COALESCE(body,''),256) AS body_sha256,SHA2(COALESCE(raw_payload,''),256) AS raw_sha256,JSON_UNQUOTE(JSON_EXTRACT(raw_payload,'$._contentIntegrity.status')) AS integrity,JSON_EXTRACT(raw_payload,'$._overseasScope') AS overseas_scope,JSON_EXTRACT(raw_payload,'$._lastNightScope') AS historical_scope FROM po_contents WHERE source_id=? AND external_id IN (${marks}) ORDER BY external_id,id`, [sourceId, ...ids]);
  const contentIds = contents.map(x => x.id), cm = contentIds.map(() => '?').join(',');
  const memberships = contentIds.length ? await repo.query(`SELECT account_id,content_id,feed_key,page_kind,section_id,feed_metadata FROM po_content_feed_memberships WHERE content_id IN (${cm}) ORDER BY content_id,feed_key`, contentIds) : [];
  const analysis = contentIds.length ? await repo.query(`SELECT id,content_id,analysis_profile,analysis_version,content_fingerprint,status,lease_owner,lease_until,error_code FROM po_analysis_jobs WHERE content_id IN (${cm}) ORDER BY content_id`, contentIds) : [];
  const translations = contentIds.length ? await repo.query(`SELECT id,content_id,target_language,translation_version,content_fingerprint,status,lease_owner,lease_until,error_code FROM po_translation_jobs WHERE content_id IN (${cm}) ORDER BY content_id`, contentIds) : [];
  const activeRuns = await repo.query("SELECT id,source_id,account_id,site_id,status,trigger_type,sync_mode,window_start,window_end,lease_owner,lease_epoch,lease_until,parent_run_id,scheduled_at,schedule_version FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','cancelling') ORDER BY created_at LIMIT 100", [sourceId]);
  const sourceState = columns.some(x => x.TABLE_NAME === 'po_source_sync_state') ? await repo.query('SELECT * FROM po_source_sync_state WHERE source_id=?', [sourceId]) : [];
  return { status: 'READONLY_INVENTORY_COMPLETED', capturedAt: new Date().toISOString(), sourceId, externalIds: ids, columns, indexes, contents, memberships, analysis, translations, activeRuns, sourceState };
}
async function main() {
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const { Repository } = require('../server/src/db/repository');
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '1' });
  try { console.log(JSON.stringify(await inventory(repo), null, 2)); }
  finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(e => { console.error(JSON.stringify({ status: 'NO_GO', errorCode: e.code || 'INVENTORY_FAILED' })); process.exitCode = 1; });
module.exports = { inventory };
