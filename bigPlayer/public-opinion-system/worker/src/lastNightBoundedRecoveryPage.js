'use strict';
const crypto = require('node:crypto');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightScope');
const { CHILDREN } = require('./lastNightCatchupHandoff');
const { legacyInsert, legacyItem, assertLegacyContent } = require('./lastNightLegacyContentContract');
const { normalizeIndependentPost } = require('./lastNightIndependentContent');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const FROM = '2026-10-02T03:07:34.810Z', TO = '2026-10-09T03:07:34.810Z';
async function assertRecoveryToken(q, token) {
  const [[state]] = await q('SELECT lease_run_id,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE_ID]);
  if (!state || state.lease_run_id !== token.parentId || state.lease_owner !== token.ownerId || Number(state.lease_epoch) !== Number(token.epoch) || Number(state.live) !== 1) fail('LAST_NIGHT_RECOVERY_SOURCE_LEASE_LOST');
}
async function recoverFirstSite16Page({ query: q, bounded, snapshot, token, repo, connector, runtime, feed, persistEvidence, failedCheckpoint = null, resumeCheckpoint = null, recoveryCommitState = {} }) {
  // Smallest executable forward-only stage. Old children, site9 and unknown
  // legacy body/raw/fingerprint are NEVER overwritten or retrospectively marked.
  const language = failedCheckpoint ? '2' : '16';
  const checkpointInput = failedCheckpoint || resumeCheckpoint;
  const siteId = Object.values(CHILDREN).find(row => row[0] === language)[2];
  const taskKey = failedCheckpoint ? '100017:circle:activity:552:564:5::1' : '100017:home:merged::0:::';
  if (feed?.feedKey !== taskKey || String(feed.boardId) !== BOARD_ID) fail('LAST_NIGHT_RECOVERY_FEED_CHANGED');
  const site = JSON.parse(snapshot.source.config).siteUrls.find(row => row.siteId === siteId);
  if (!site) fail('LAST_NIGHT_RECOVERY_SITE_CHANGED');
  const runId = crypto.randomUUID(), checkpointId = checkpointInput?.id || crypto.randomUUID(); let committed = false, committing = false;
  if(checkpointInput && (checkpointInput.account_id !== token.accountId || checkpointInput.site_id !== siteId
    || checkpointInput.task_key !== taskKey || checkpointInput.task_kind !== 'q1_feed' || checkpointInput.sync_scope !== 'posts'
    || checkpointInput.root_platform_content_id !== '' || checkpointInput.window_start !== FROM || checkpointInput.window_end !== TO
    || checkpointInput.lease_owner != null || checkpointInput.lease_until != null || !['failed','idle'].includes(checkpointInput.status))) fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED');
  const scope = { sourceId: SOURCE_ID, accountId: token.accountId, siteId, runId, checkpointId, publishedFrom: FROM, publishedTo: TO, feedKey: feed.feedKey };
  const source = { ...runtime.source, siteId, config: { ...JSON.parse(runtime.source.config), baseUrl: site.url } };
  // Source lease is already durable and the caller still owns account GET_LOCK.
  await q('START TRANSACTION'); await assertRecoveryToken(q, token);
  const [existingCheckpoints] = checkpointInput
    ? await q('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[checkpointId])
    : await q('SELECT id FROM po_sync_checkpoints WHERE account_id=? AND site_id=? LIMIT 1 FOR UPDATE', [token.accountId, siteId]);
  if (checkpointInput ? checkpointHash(existingCheckpoints[0]) !== checkpointHash(checkpointInput) : existingCheckpoints.length) { await q('ROLLBACK'); fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED'); }
  await q('ROLLBACK');
  const controller = new AbortController();
  let page;
  try {
    page = await bounded(connector.listFeedContents({ source, account: runtime.account, feed, cursor: checkpointInput?.cursor || null,
      segmentId: checkpointInput ? JSON.parse(checkpointInput.cursor).segmentId : runId,
      limit: failedCheckpoint ? 50 : 20, dailyBounded: true, publishedFrom: FROM, publishedTo: TO, signal: controller.signal }));
  } finally { controller.abort(); }
  if (!page || !Array.isArray(page.items) || page.items.length > (failedCheckpoint ? 50 : 20) || typeof page.hasMore !== 'boolean'
    || (page.hasMore && (!page.nextCursor || page.nextCursor === checkpointInput?.cursor))) fail('LAST_NIGHT_RECOVERY_PAGE_INVALID');
  const items = page.items.map(item => normalizeIndependentPost(item, feed));
  if (new Set(items.map(item => item.externalId)).size !== items.length || items.some(item => !Number.isFinite(+new Date(item.publishedAt))
    || +new Date(item.publishedAt) < +new Date(FROM) || +new Date(item.publishedAt) >= +new Date(TO))) fail('LAST_NIGHT_RECOVERY_WINDOW_MISMATCH');
  const before = [], newItems = [], reused = []; const account = { ...runtime.account, game_id: GAME_ID, community_id: COMMUNITY_ID };
  try {
    await q('START TRANSACTION'); await assertRecoveryToken(q, token);
    const [[config]] = await q('SELECT config FROM po_sources WHERE id=? FOR UPDATE', [SOURCE_ID]);
    if (config?.config !== snapshot.source.config) fail('LAST_NIGHT_RECOVERY_CONFIG_CHANGED');
    const [active] = await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE", [SOURCE_ID, token.accountId]);
    if (active.length) fail('LAST_NIGHT_ACTIVE_RUN');
    const [cp] = checkpointInput ? await q('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[checkpointId])
      : await q('SELECT id FROM po_sync_checkpoints WHERE account_id=? AND site_id=? LIMIT 1 FOR UPDATE', [token.accountId, siteId]);
    if (checkpointInput ? checkpointHash(cp[0]) !== checkpointHash(checkpointInput) : cp.length) fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED');
    for (const item of [...items].sort((a,b) => a.externalId.localeCompare(b.externalId))) {
      const [[row]] = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE', [SOURCE_ID, item.externalId]);
      if (row) {
        if (row.game_id !== GAME_ID || row.community_id !== COMMUNITY_ID || row.account_id !== token.accountId || row.content_type !== 'post') fail('LAST_NIGHT_RECOVERY_EXISTING_SCOPE_MISMATCH');
        assertLegacyContent(row,token.accountId,{allowUnmarked:true});
        const [memberships] = await q('SELECT feed_key,feed_metadata FROM po_content_feed_memberships WHERE account_id=? AND content_id=? FOR UPDATE',[token.accountId,row.id]);
        for(const membership of memberships) {
          let metadata;try{metadata=typeof membership.feed_metadata==='string'?JSON.parse(membership.feed_metadata):membership.feed_metadata;}catch{fail('LAST_NIGHT_RECOVERY_MEMBERSHIP_CONFLICT');}
          if(!String(membership.feed_key).startsWith('100017:') || (metadata?.boardId!=null && String(metadata.boardId)!==BOARD_ID))fail('LAST_NIGHT_RECOVERY_MEMBERSHIP_CONFLICT');
        }
        before.push(row); reused.push(row);
      } else newItems.push(item);
    }
    const journal = { phase: 'recovery_page_prepared', ...scope, token, before, incoming: items, nextCursor: page.nextCursor, hasMore: page.hasMore, historyPolicy: 'reuse-no-overwrite' };
    await bounded(persistEvidence(journal));
    await q("INSERT INTO po_sync_runs (id,source_id,account_id,site_id,status,sync_mode,trigger_type,window_start,window_end,started_at,lease_owner,lease_epoch,lease_until,schedule_version) VALUES (?,?,?,?,'running','incremental','manual',?,?,UTC_TIMESTAMP(3),?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND),?)", [runId,SOURCE_ID,token.accountId,siteId,FROM.replace('T',' ').replace('Z',''),TO.replace('T',' ').replace('Z',''),token.ownerId,snapshot.source.schedule_version]);
    if(checkpointInput) {
      const [claim] = await q("UPDATE po_sync_checkpoints SET status='running',lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE id=? AND account_id=? AND site_id=? AND task_kind='q1_feed' AND task_key=? AND sync_scope='posts' AND root_platform_content_id='' AND window_start=? AND window_end=? AND status=? AND error_code<=>? AND `cursor`<=>? AND updated_at<=>? AND lease_owner IS NULL AND lease_until IS NULL",[token.ownerId,checkpointId,token.accountId,siteId,feed.feedKey,FROM,TO,checkpointInput.status,checkpointInput.error_code,checkpointInput.cursor,checkpointInput.updated_at]);
      if(claim.affectedRows !== 1)fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED');
    } else await q("INSERT INTO po_sync_checkpoints (id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end,sync_mode,status,lease_owner,lease_until) VALUES (?,?,?,'q1_feed',?,'posts','',?,?,'incremental','running',?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND))", [checkpointId,token.accountId,siteId,feed.feedKey,FROM,TO,token.ownerId]);
    const pinned = { query: (sql, params) => { const adapted = legacyInsert(sql, params); return q(adapted.sql, adapted.params); }, beginTransaction: async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{} };
    const facade = Object.create(repo); facade.pool = { getConnection: async()=>pinned };
    const stored = await repo._upsertContentPageAttempt.call(facade, { account, syncRunId: runId, syncScope: 'posts',items:newItems.map(legacyItem),feed,leaseOwner:token.ownerId });
    if (stored.contents.length !== newItems.length || stored.contents.some(entry => !entry?.content)) fail('LAST_NIGHT_RECOVERY_STORE_INCOMPLETE');
    for (const row of reused) {
      await q("INSERT IGNORE INTO po_sync_run_contents (run_id,content_id,change_type,sync_scope) VALUES (?,?,'unchanged','posts')", [runId,row.id]);
      // Scope association is evidence for THIS request, not provider raw repair.
      await q('INSERT INTO po_content_feed_memberships (id,account_id,content_id,feed_key,page_kind,section_id,feed_metadata) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id', [crypto.randomUUID(),token.accountId,row.id,feed.feedKey,feed.pageKind,feed.sectionId,JSON.stringify(feed)]);
      const [[after]] = await q('SELECT * FROM po_contents WHERE id=? FOR UPDATE',[row.id]);
      if (JSON.stringify(after) !== JSON.stringify(row)) fail('LAST_NIGHT_RECOVERY_HISTORY_CHANGED');
    }
    const aiFacade = Object.create(repo); aiFacade.query = async(sql,params)=>(await q(sql,params))[0];
    for (const entry of stored.contents) await repo.enqueueAnalysisJob.call(aiFacade, entry.content.id, { contentFingerprint:entry.content.fingerprint,version:'sentiment-v1',profile:'light' });
    const [checkpointUpdate] = await q("UPDATE po_sync_checkpoints SET `cursor`=?,status=?,items_fetched=items_fetched+?,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND status='running' AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3)", [page.nextCursor,page.hasMore?'idle':'completed',items.length,checkpointId,token.ownerId]);
    if(checkpointUpdate.affectedRows !== 1) fail('LAST_NIGHT_RECOVERY_CHECKPOINT_LEASE_LOST');
    const status = page.hasMore ? 'partial' : 'completed_authorized_scope';
    const [runUpdate] = await q('UPDATE po_sync_runs SET status=?,finished_at=UTC_TIMESTAMP(3),fetched_count=?,unchanged_count=unchanged_count+?,lease_owner=NULL,lease_until=NULL,error_code=? WHERE id=? AND status=\'running\' AND lease_owner=? AND lease_epoch=1 AND lease_until>UTC_TIMESTAMP(3)', [status,items.length,reused.length,page.hasMore?'LAST_NIGHT_RECOVERY_PAGE_BUDGET':null,runId,token.ownerId]);
    if(runUpdate.affectedRows !== 1) fail('LAST_NIGHT_RECOVERY_RUN_LEASE_LOST');
    await assertRecoveryToken(q, token);
    const [[afterCheckpoint]] = await q('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[checkpointId]);
    if(!afterCheckpoint || afterCheckpoint.status !== (page.hasMore?'idle':'completed') || afterCheckpoint.cursor !== page.nextCursor)fail('LAST_NIGHT_RECOVERY_CHECKPOINT_VERIFY_FAILED');
    await bounded(persistEvidence({ ...journal,phase:'recovery_page_commit_prepared',created:stored.contents.map(entry=>entry.content),reused:reused.map(row=>({id:row.id,fingerprint:row.fingerprint})),status,afterCheckpoint,sourceConfig:snapshot.source.config,scheduleVersion:snapshot.source.schedule_version }));
    committing=true; recoveryCommitState.pending=true;recoveryCommitState.acknowledged=false;await q('COMMIT'); committed=true;recoveryCommitState.acknowledged=true;
    const evidence = await bounded(persistEvidence({ ...journal,phase:'recovery_page_committed',status,created:stored.contents.map(entry=>entry.content),afterCheckpoint,sourceConfig:snapshot.source.config,scheduleVersion:snapshot.source.schedule_version }));
    recoveryCommitState.pending=false;
    return { status:'LAST_NIGHT_BOUNDED_RECOVERY_PAGE_COMMITTED',...scope,language,pageStatus:status,hasMore:page.hasMore,nextCursor:page.nextCursor,newCount:newItems.length,reusedCount:reused.length,
      evidence,site9Regrabbed:false,fullChainComplete:false,periodicUniqueOwnerEstablished:false };
  } catch(error) {
    if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';throw error;
  }
}
function checkpointHash(cp) { return crypto.createHash('sha256').update(JSON.stringify(['id','account_id','site_id','task_kind','task_key','sync_scope','root_platform_content_id','window_start','window_end','status','cursor','items_fetched','lease_owner','lease_until','error_code','updated_at'].map(key=>[key,cp?.[key]]))).digest('hex'); }
module.exports={assertRecoveryToken,recoverFirstSite16Page,checkpointHash};
