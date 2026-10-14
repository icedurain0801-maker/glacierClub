'use strict';
const crypto = require('node:crypto');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightScope');
const { legacyDailyIntent } = require('./lastNightLegacyDailyContract');
const { assertLastNightSiteUrl } = require('../../server/src/connectors/lastNightUrlContract');
const { withDeadlineConnection } = require('./lastNightDeadlineConnection');
const { SHARED_CLOSED_WINDOW } = require('./lastNightDailyRoute');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const dbTime = iso => iso.replace('T', ' ').replace('Z', '');
async function acquireLegacyDailyWinner({ pool, plan, persistEvidence, consume } = {}) {
  if (typeof persistEvidence !== 'function' || typeof consume !== 'function' || !plan?.accountId
    || !/^lastnight-independent:[a-f0-9-]{36}$/.test(plan.ownerId || '') || typeof plan.configSha256 !== 'string') fail('LAST_NIGHT_SLOT_APPROVAL_REQUIRED');
  let committing = false, committed = false;
  const commitState = { pending: false, acknowledged: false };
  return withDeadlineConnection(pool, async ({ query: q, bounded }) => {
    try {
      const [[identity]] = await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port,UTC_TIMESTAMP(3) AS db_now');
      if (identity?.identity !== plan.expectedIdentity || identity.db !== 'public_opinion' || Number(identity.port) !== 3306) fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
      const [[lock]] = await q('SELECT GET_LOCK(?,0) AS acquired', [`public-opinion-sync-account-${plan.accountId}`]);
      if (Number(lock?.acquired) !== 1) fail('LAST_NIGHT_DUPLICATE_EXECUTION');
      await q('SET SESSION innodb_lock_wait_timeout=3'); await q('START TRANSACTION');
      const [[state]] = await q('SELECT *, (lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE_ID]);
      const [[source]] = await q('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE', [SOURCE_ID]);
      const [[account]] = await q('SELECT id,source_id,game_id,community_id,enabled,platform FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE', [plan.accountId, SOURCE_ID]);
      if (!source || source.game_id !== GAME_ID || source.community_id !== COMMUNITY_ID || source.region_code !== 'overseas'
        || source.platform !== 'bigplayer_h5' || Number(source.enabled) !== 1 || source.community_status !== 'enabled'
        || account?.game_id !== GAME_ID || account.community_id !== COMMUNITY_ID || Number(account.enabled) !== 1 || account.platform !== 'bigplayer_h5') fail('LAST_NIGHT_SLOT_SCOPE_MISMATCH');
      if (crypto.createHash('sha256').update(source.config).digest('hex') !== plan.configSha256) fail('LAST_NIGHT_SLOT_CONFIG_CHANGED');
      if(source.active_window !== SHARED_CLOSED_WINDOW)fail('LAST_NIGHT_SLOT_ROUTE_NOT_TRANSFERRED');
      const intent = legacyDailyIntent({ sourceId: SOURCE_ID, scheduledAt: plan.scheduledAt, now: `${String(identity.db_now).replace(' ', 'T')}Z`,
        frequencySeconds: source.frequency_seconds, expectedScheduleVersion: plan.scheduleVersion, scheduleVersion: source.schedule_version });
      if (!state || Number(state.schedule_version) !== intent.scheduleVersion) fail('LAST_NIGHT_SLOT_VERSION_CHANGED');
      const config = JSON.parse(source.config);
      if (String(config.boardId) !== BOARD_ID || config.siteUrls?.length !== 3) fail('LAST_NIGHT_SLOT_SITE_CHANGED');
      const [registry] = await q('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE_ID]);
      const languages = new Set();
      for (const site of config.siteUrls) {
        const language = assertLastNightSiteUrl(site.url).searchParams.get('languageId');
        if (!['2','9','16'].includes(language) || languages.has(language) || site.enabled === false
          || registry.filter(row => row.site_id === site.siteId && row.url === site.url && Number(row.enabled) === 1).length !== 1) fail('LAST_NIGHT_SLOT_SITE_CHANGED');
        languages.add(language);
      }
      if (registry.length !== 3) fail('LAST_NIGHT_SLOT_SITE_CHANGED');
      const scheduledAt = dbTime(intent.scheduledAt);
      const [winner] = await q('SELECT id,status,lease_owner,lease_epoch,window_start,window_end FROM po_sync_runs WHERE source_id=? AND scheduled_at=? FOR UPDATE', [SOURCE_ID, scheduledAt]);
      if (winner.length) {
        await q('ROLLBACK');
        return { status: 'LAST_NIGHT_SLOT_ALREADY_OWNED', sourceId: SOURCE_ID, scheduledAt: intent.scheduledAt,
          winnerId: winner[0].id, winnerStatus: winner[0].status, httpRequests: 0, stored: 0, created: false };
      }
      const [active] = await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE", [SOURCE_ID, plan.accountId]);
      if (active.length || Number(state.active_lease)) fail('LAST_NIGHT_SLOT_ACTIVE_OWNER');
      const runId = crypto.randomUUID();
      const children = config.siteUrls.map(site => ({ id: crypto.randomUUID(), siteId: site.siteId, url: site.url }));
      const journal = { phase: 'daily_slot_prepared', sourceId: SOURCE_ID, accountId: plan.accountId, intent, runId, children,
        ownerId: plan.ownerId, beforeSchedule: state, config: source.config };
      await bounded(persistEvidence(journal));
      const [claimed] = await q('UPDATE po_source_schedule_state SET lease_run_id=?,lease_owner=?,lease_epoch=lease_epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE source_id=? AND lease_epoch=? AND lease_owner<=>? AND schedule_version=? AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))', [runId, plan.ownerId, SOURCE_ID, state.lease_epoch, state.lease_owner, intent.scheduleVersion]);
      if (claimed.affectedRows !== 1) fail('LAST_NIGHT_SLOT_CAS_FAILED');
      // Parent and children are born running in the SAME short transaction.
      // No queued child is exposed to shared consumers before ownership.
      await q("INSERT INTO po_sync_runs (id,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,lease_owner,lease_epoch,lease_until) VALUES (?,?,?,'running','incremental','scheduled',?,?,?, ?,UTC_TIMESTAMP(3),?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND))", [runId,SOURCE_ID,plan.accountId,scheduledAt,dbTime(intent.windowStart),dbTime(intent.windowEnd),intent.scheduleVersion,plan.ownerId]);
      for (const child of children) await q("INSERT INTO po_sync_runs (id,parent_run_id,site_id,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,lease_owner,lease_epoch,lease_until) VALUES (?,?,?,?,?,'running','incremental','scheduled_site',NULL,?,?,?,UTC_TIMESTAMP(3),?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND))", [child.id,runId,child.siteId,SOURCE_ID,plan.accountId,dbTime(intent.windowStart),dbTime(intent.windowEnd),intent.scheduleVersion,plan.ownerId]);
      const epoch = Number(state.lease_epoch) + 1;
      const [advance] = await q('UPDATE po_source_schedule_state SET last_scheduled_at=?,next_scheduled_at=? WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)', [scheduledAt,dbTime(intent.nextSlotAt),SOURCE_ID,runId,plan.ownerId,epoch]);
      if (advance.affectedRows !== 1) fail('LAST_NIGHT_SLOT_CAS_FAILED');
      const [runs] = await q('SELECT id,parent_run_id,site_id,status,window_start,window_end,lease_owner,lease_epoch FROM po_sync_runs WHERE id=? OR parent_run_id=? ORDER BY id FOR UPDATE', [runId,runId]);
      if (runs.length !== 4 || new Set(runs.map(row=>row.id)).size !== 4 || runs.some(row => row.status !== 'running'
        || row.lease_owner !== plan.ownerId || Number(row.lease_epoch) !== 1 || row.window_start !== dbTime(intent.windowStart) || row.window_end !== dbTime(intent.windowEnd))
        || children.some(child => !runs.some(row=>row.id===child.id && row.parent_run_id===runId && row.site_id===child.siteId))) fail('LAST_NIGHT_SLOT_VERIFY_FAILED');
      const token = { sourceId: SOURCE_ID, accountId: plan.accountId, parentId: runId, ownerId: plan.ownerId, epoch };
      await bounded(persistEvidence({ ...journal, phase: 'daily_slot_commit_prepared', token, runs }));
      committing=true; await q('COMMIT'); committed=true;
      await bounded(persistEvidence({ ...journal, phase: 'daily_slot_committed', token, runs }));
      committing=false;
      return await bounded(consume({ query:q,bounded,token,children,intent,source,account,commitState }));
    } catch(error) {
      if(commitState.pending) { error.code=commitState.acknowledged?'LAST_NIGHT_SLOT_PAGE_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_SLOT_PAGE_COMMIT_UNKNOWN';throw error; }
      if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_SLOT_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_SLOT_COMMIT_UNKNOWN';throw error;
    }
  },{timeoutMs:120000,code:'LAST_NIGHT_SLOT_TIMEOUT'}).catch(error=>{
    if(commitState.pending)error.code=commitState.acknowledged?'LAST_NIGHT_SLOT_PAGE_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_SLOT_PAGE_COMMIT_UNKNOWN';
    else if(committing)error.code=committed?'LAST_NIGHT_SLOT_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_SLOT_COMMIT_UNKNOWN';throw error;
  });
}
module.exports={acquireLegacyDailyWinner};
