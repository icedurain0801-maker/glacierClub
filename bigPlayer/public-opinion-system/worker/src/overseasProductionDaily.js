'use strict';

// Dedicated production collection entry. It never imports worker.js, runs a
// global scan, executes AI, or claims another source's work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { normalizeRawContent } = require('../../server/src/connectors/baseConnector');
const { stripBoardInsert } = require('./overseasBigPlayerPageStore');
const { createOverseasPageJobs } = require('./overseasBigPlayerPageJobs');
const { createProxyFetch, networkFailure, retryNetwork } = require('./overseasProxyTransport');
const { computeSchedule } = require('./scheduleSlots');
const { collectComments, commentRootTasks, ensureCommentRootScope } = require('./overseasDailyComments');
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const ACCOUNT = '75c8205f-37eb-4bdf-b6a4-f4f502e35658';
const GAME = '00000000-0000-0000-0000-000000000002';
const COMMUNITY = '00000000-0000-0000-0000-000000000102';
const BOARD = '100017';
const LEASE_SECONDS = 300;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const dbTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(value)
  ? value.length === 19 ? value+'.000' : value : new Date(value).toISOString().slice(0, 23).replace('T', ' ');
function idFor(value) {
  const h = sha(`overseas-production-v1:${SOURCE}:${value}`);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function dailySlot(now = new Date()) {
  // The latest Beijing 02:00 slot, not the date according to the DB session.
  const shifted = new Date(+now + 8 * 3600000);
  let end = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 2) - 8 * 3600000;
  if (end > +now) end -= 86400000;
  const midnight = end - 2 * 3600000;
  return { scheduledAt: new Date(end).toISOString(), windowStart: new Date(midnight - 86400000).toISOString(), windowEnd: new Date(midnight).toISOString() };
}
function selectDueSlot(nextScheduledAt, now = new Date()) {
  const latest=dailySlot(now), next=nextScheduledAt ? +new Date(dbTime(nextScheduledAt).replace(' ','T')+'Z') : NaN;
  if(!Number.isFinite(next))return latest;
  if(next>+new Date(latest.scheduledAt))return null;
  return dailySlot(new Date(next));
}
function todaySlot(now = new Date()) {
  const local=new Date(+now+28800000),start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-28800000-86400000;
  return {scheduledAt:now.toISOString(),windowStart:new Date(start).toISOString(),windowEnd:now.toISOString(),kind:'today'};
}
function configuredSlot(source, state, now = new Date()) {
  const schedule = computeSchedule({ now, frequencySeconds: source.frequency_seconds,
    effectiveAt: source.schedule_effective_at, lastProcessedScheduledAt: state?.last_scheduled_at });
  if (!schedule.dueSlotAt) return null;
  // Preserve the overseas overlapping coverage window (previous Beijing
  // midnight through this slot). Content upserts deduplicate the overlap.
  const window = todaySlot(new Date(schedule.dueSlotAt));
  return { scheduledAt: schedule.dueSlotAt, windowStart: window.windowStart, windowEnd: window.windowEnd,
    frequencySeconds: Number(source.frequency_seconds), scheduleVersion: Number(source.schedule_version) };
}
function nextScheduledAt(intent, source) {
  return computeSchedule({ now: new Date(intent.scheduledAt), frequencySeconds: source.frequency_seconds }).nextSlotAt;
}
function durableJson(filename, value, exclusive = false) {
  const temporary = `${filename}.${crypto.randomUUID()}.staging`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  if (exclusive) { fs.linkSync(temporary,filename); fs.unlinkSync(temporary); }
  else fs.renameSync(temporary, filename);
}
function assertStateDirectory(directory) {
  const resolved = path.resolve(directory || '');
  const allowed = path.resolve('C:/ProgramData/PublicOpinion/overseas-daily/state');
  if (resolved.toLowerCase() !== allowed.toLowerCase()) fail('OVERSEAS_PRODUCTION_STATE_PATH_INVALID');
  // Creation belongs to activation/installation, never to dry-run or builds.
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(fs.realpathSync.native(current)).toLowerCase() !== current.toLowerCase()) fail('OVERSEAS_PRODUCTION_STATE_PATH_INVALID');
  }
  return resolved;
}
function assertSharedExclusion(manifestPath, processSnapshot) {
  const manifest = parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = ['worker/src/worker.js','worker/src/workerScanLease.js','server/src/db/repository.js','worker/src/schedulerCandidateLoader.js','worker/src/schedulerRepositoryAdapter.js'];
  if (manifest.sourceId !== SOURCE || manifest.files?.length !== expected.length || !path.isAbsolute(manifest.releaseRoot || '')
    || path.basename(manifest.releaseRoot) === 'worker-release-taptap-20260921-v055-formal1') fail('OVERSEAS_SHARED_EXCLUSION_NOT_ACTIVE');
  let newest = 0;
  for (const relative of expected) {
    const entry = manifest.files.find(item => item.path === relative);
    const filename = path.join(manifest.releaseRoot, relative);
    const stat = fs.lstatSync(filename);
    if (!entry || !stat.isFile() || stat.isSymbolicLink() || sha(fs.readFileSync(filename)) !== entry.sha256) fail('OVERSEAS_SHARED_EXCLUSION_NOT_ACTIVE');
    newest = Math.max(newest, stat.mtimeMs);
  }
  const snapshot = processSnapshot || parse(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
    "$s=Get-CimInstance Win32_Service -Filter \"Name='PublicOpinionWorker'\"; $p=@(Get-CimInstance Win32_Process -Filter \"ParentProcessId=$($s.ProcessId) AND Name='node.exe'\"); [pscustomobject]@{state=$s.State;processes=@($p | ForEach-Object { [pscustomobject]@{CommandLine=$_.CommandLine;CreationDate=$_.CreationDate.ToUniversalTime().ToString('o')} })} | ConvertTo-Json -Depth 4"], { encoding: 'utf8', windowsHide: true }));
  const workerPath = path.join(manifest.releaseRoot, 'worker/src/worker.js');
  const startedAt = +new Date(snapshot.processes?.[0]?.CreationDate);
  if (snapshot.state !== 'Running' || snapshot.processes?.length !== 1 || !Number.isFinite(startedAt)
    || !String(snapshot.processes[0].CommandLine).toLowerCase().includes(workerPath.toLowerCase())
    || startedAt < newest) fail('OVERSEAS_SHARED_EXCLUSION_NOT_ACTIVE');
  return manifest;
}
async function transaction(repo, operation) {
  const conn = await repo.pool.getConnection(); let begun = false, committing = false, broken = false;
  const query=conn.query.bind(conn);
  let stage='transaction_setup';
  conn.query=async (sql,params)=>{
    const template=String(sql);
    const verb=template.trim().match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'QUERY';
    const table=template.match(/\b(?:FROM|UPDATE|INTO)\s+(po_[a-z_]+)/i)?.[1]||'session';
    stage=`${verb}:${table}`;
    return query(sql,params);
  };
  try {
    await conn.query('SET SESSION innodb_lock_wait_timeout=3');
    await conn.beginTransaction(); begun = true;
    const result = await operation(conn);
    committing = true; await conn.commit(); begun = false; committing = false;
    return result;
  } catch (error) {
    error.transactionStage=stage;
    if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code))console.error(JSON.stringify({status:'transaction_lock_error',code:error.code,stage,connectionId:conn.threadId}));
    if (committing) { error.code = 'OVERSEAS_PRODUCTION_COMMIT_UNKNOWN'; broken = true; conn.destroy(); }
    else if (begun) {
      try { await conn.rollback(); error.rollbackAcknowledged=true; }
      catch { broken = true; conn.destroy(); error.code='OVERSEAS_PRODUCTION_ROLLBACK_FAILED'; }
    }
    throw error;
  } finally { conn.query=query; if (!broken) conn.release(); }
}
async function commitWithLockRetry(operation) {
  // The whole page transaction has rolled back on these two errors. Reuse
  // the already fetched page; never repeat HTTP or retry an unknown COMMIT.
  for(let attempt=0;;attempt++){
    try{return await operation();}
    catch(error){
      if(!error.rollbackAcknowledged||!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)||attempt>=2)throw error;
      await new Promise(resolve=>setTimeout(resolve,150*2**attempt));
    }
  }
}
async function loadScope(query, locked = false) {
  const [source] = await query(`SELECT s.*,g.region_code,g.enabled AS game_enabled,c.status AS community_status
    FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=?${locked ? ' LOCK IN SHARE MODE' : ''}`, [SOURCE]);
  const [account] = await query(`SELECT * FROM po_accounts WHERE id=?${locked ? ' LOCK IN SHARE MODE' : ''}`, [ACCOUNT]);
  const config = parse(source?.config || '{}');
  if (!source || source.platform !== 'bigplayer_h5' || source.region_code !== 'overseas' || source.game_id !== GAME
    || source.community_id !== COMMUNITY || source.default_account_id !== ACCOUNT || !Number(source.enabled)
    || !Number(source.game_enabled) || source.community_status !== 'enabled' || String(config.boardId) !== BOARD
    || account?.source_id !== SOURCE || account.game_id !== GAME || account.community_id !== COMMUNITY
    || account.platform !== source.platform || !Number(account.enabled)) fail('OVERSEAS_PRODUCTION_SCOPE_CHANGED');
  const sites = await query(`SELECT * FROM po_source_sites WHERE source_id=? ORDER BY site_id${locked ? ' LOCK IN SHARE MODE' : ''}`, [SOURCE]);
  if (sites.length !== 3 || config.siteUrls?.length !== 3) fail('OVERSEAS_PRODUCTION_SITE_CHANGED');
  const languages = new Set();
  for (const site of sites) {
    const configured = config.siteUrls.find(item => (item.siteId || item.site_id) === site.site_id);
    const url = new URL(site.url); languages.add(url.searchParams.get('languageId'));
    if (!Number(site.enabled) || !configured || configured.enabled === false || configured.url !== site.url
      || site.url_hash !== sha(site.url) || url.origin !== 'https://club-en.q1.com' || url.username || url.password || url.hash
      || url.searchParams.get('gameId') !== '2177' || url.searchParams.get('gameVersion') !== '2177-US-ZS'
      || url.searchParams.get('env') !== 'web' || !['2','9','16'].includes(url.searchParams.get('languageId'))) fail('OVERSEAS_PRODUCTION_SITE_CHANGED');
  }
  if (languages.size !== 3) fail('OVERSEAS_PRODUCTION_SITE_CHANGED');
  return { source, account, sites, configSha256: sha(JSON.stringify(config)) };
}
function receiptFor(intent, site) {
  return { operation: 'overseas-production-daily-v1', scheduledAt: intent.scheduledAt, configSha256: intent.configSha256,
    siteId: site.site_id, siteUrlSha256: sha(site.url), boardId: BOARD, cursor: null, pages: 0, phase: 'posts', done: false };
}
const LEGACY_HANDOFF_PARENT = '3653d4a7-b000-44ee-b60e-0be88f80efa0';
const LEGACY_HANDOFF_CHILDREN = new Map([
  ['94399681-ebb8-4b56-b7a4-cc736a209c79', ['legacy-8483a64ab230417e63c5e30d77b0a6f0','failed',4]],
  ['daf2880d-aa22-4c57-b97a-d911b9e01e4c', ['site-3bb48be7f9a82185d6a045e9a5cbd3d7','completed_authorized_scope',3]],
  ['7a921b05-6c06-4aa1-9fbd-aeb1c9d47eb7', ['site-f069f4495d534693dd87b2485053e7cd','completed_authorized_scope',1]]
]);
function productionReceipt(run) {
  try { const receipt=parse(run.error_message); return receipt?.operation==='overseas-production-daily-v1'?receipt:null; }
  catch { return null; }
}
function assertLegacyHandoff(intent, parent, children, sites) {
  if(intent.parentId!==LEGACY_HANDOFF_PARENT || intent.scheduledAt!=='2026-10-09T18:00:00.000Z'
    || parent.status!=='queued' || Number(parent.attempts)!==0 || Number(parent.lease_epoch)!==0
    || parent.lease_owner || parent.lease_until || children.length!==3)fail('OVERSEAS_PRODUCTION_LEGACY_CHILDREN_REQUIRE_HANDOFF');
  for(const child of children){
    const expected=LEGACY_HANDOFF_CHILDREN.get(child.id);
    if(!expected || child.site_id!==expected[0] || child.status!==expected[1] || Number(child.lease_epoch)!==expected[2]
      || child.source_id!==SOURCE || child.account_id!==ACCOUNT || child.parent_run_id!==parent.id
      || child.trigger_type!=='scheduled_site' || child.sync_mode!=='incremental' || child.lease_owner || child.lease_until
      || child.error_message || (child.status==='failed'?child.error_code!=='SYNC_RUN_POISONED':child.error_code!=null)
      || dbTime(child.window_start)!==dbTime(intent.windowStart) || dbTime(child.window_end)!==dbTime(intent.windowEnd)
      || !sites.some(site=>site.site_id===child.site_id))fail('OVERSEAS_PRODUCTION_LEGACY_CHILDREN_REQUIRE_HANDOFF');
  }
}
async function admit(repo, intent, owner, directory) {
  return transaction(repo, async conn => {
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const scope = await loadScope(q, true);
    if (scope.configSha256 !== intent.configSha256) fail('OVERSEAS_PRODUCTION_SCOPE_CHANGED');
    if (intent.scheduleVersion != null && (intent.scheduleVersion !== Number(scope.source.schedule_version)
      || intent.frequencySeconds !== Number(scope.source.frequency_seconds))) fail('OVERSEAS_PRODUCTION_SCHEDULE_CHANGED');
    const [state] = await q('SELECT *,lease_until>UTC_TIMESTAMP(3) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE]);
    if (!state || (Number(state.live) && state.lease_run_id !== intent.parentId)) fail('OVERSEAS_PRODUCTION_SOURCE_BUSY');
    const [parent] = intent.kind==='today' ? await q('SELECT * FROM po_sync_runs WHERE source_id=? AND id=? FOR UPDATE',[SOURCE,intent.parentId]) : await q('SELECT * FROM po_sync_runs WHERE source_id=? AND scheduled_at=? FOR UPDATE', [SOURCE, dbTime(intent.scheduledAt)]);
    if (parent && (parent.id !== intent.parentId || parent.account_id !== ACCOUNT || !(intent.kind==='today'?['manual']:['scheduled','scheduled_catchup']).includes(parent.trigger_type)
      || dbTime(parent.window_start)!==dbTime(intent.windowStart) || dbTime(parent.window_end)!==dbTime(intent.windowEnd))) fail('OVERSEAS_PRODUCTION_SLOT_CONFLICT');
    const previousChildren=parent?await q('SELECT * FROM po_sync_runs WHERE parent_run_id=? FOR UPDATE',[parent.id]):[];
    let handoff=null;
    if(previousChildren.length && previousChildren.some(run=>!productionReceipt(run))){
      if(Number(state.live))fail('OVERSEAS_PRODUCTION_SOURCE_BUSY');
      assertLegacyHandoff(intent,parent,previousChildren,scope.sites);
      // Keep the original rows and checkpoint cursors intact in a durable
      // private receipt before changing any run. Old feed cursors are not
      // compatible with the independent merged feed and are never imported.
      const checkpoints=await q('SELECT * FROM po_sync_checkpoints WHERE account_id=? AND window_start IN (?,?) AND window_end IN (?,?) FOR UPDATE',[ACCOUNT,intent.windowStart,dbTime(intent.windowStart),intent.windowEnd,dbTime(intent.windowEnd)]);
      if(checkpoints.some(row=>row.lease_owner||row.lease_until))fail('OVERSEAS_PRODUCTION_SOURCE_BUSY');
      const associations=await q('SELECT * FROM po_sync_run_contents WHERE run_id IN (?,?,?) ORDER BY sequence_no FOR UPDATE',previousChildren.map(run=>run.id));
      const filename=path.join(directory,`legacy-handoff-${Date.now()}-${crypto.randomUUID()}.json`);
      const snapshot={operation:'overseas-production-legacy-handoff-v1',sourceId:SOURCE,accountId:ACCOUNT,scheduledAt:intent.scheduledAt,parent,children:previousChildren,checkpoints,associations};
      durableJson(filename,snapshot,true);
      handoff={receiptFile:path.basename(filename),sha256:sha(fs.readFileSync(filename))};
    }else if(previousChildren.length && (previousChildren.length!==3 || new Set(previousChildren.map(run=>run.site_id)).size!==3
      || previousChildren.some(run=>run.source_id!==SOURCE||run.account_id!==ACCOUNT||!scope.sites.some(site=>site.site_id===run.site_id)
        || (run.id!==idFor(`${intent.scheduledAt}:${run.site_id}`) && !(intent.parentId===LEGACY_HANDOFF_PARENT
          && LEGACY_HANDOFF_CHILDREN.get(run.id)?.[0]===run.site_id && productionReceipt(run)?.legacyHandoff)))))fail('OVERSEAS_PRODUCTION_RECEIPT_CONFLICT');
    const runIds=new Map(scope.sites.map(site=>[site.site_id,previousChildren.find(run=>run.site_id===site.site_id)?.id||idFor(`${intent.scheduledAt}:${site.site_id}`)]));
    const active = await q("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','cancelling') AND (lease_until IS NULL OR lease_until>UTC_TIMESTAMP(3)) FOR UPDATE", [SOURCE]);
    const ownedIds = new Set([intent.parentId,...runIds.values()]);
    if(active.some(run=>!ownedIds.has(run.id)))fail('OVERSEAS_PRODUCTION_SOURCE_BUSY');
    if (parent?.status === 'completed') return { ...scope, alreadyCompleted: true };
    if (parent && ['pausing','cancelling','cancelled','canceled','awaiting_manual_verification'].includes(parent.status)) fail('OVERSEAS_PRODUCTION_CONTROL_PENDING');
    if (!parent) await q(`INSERT INTO po_sync_runs (id,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at)
      VALUES (?,?,?,'running','incremental',?,?,?,?,?,UTC_TIMESTAMP(3))`, [intent.parentId,SOURCE,ACCOUNT,intent.kind==='today'?'manual':'scheduled',intent.kind==='today'?null:dbTime(intent.scheduledAt),dbTime(intent.windowStart),dbTime(intent.windowEnd),scope.source.schedule_version]);
    await q("UPDATE po_sync_runs SET status='running',lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),lease_epoch=lease_epoch+1,attempts=attempts+1,finished_at=NULL WHERE id=?", [owner,LEASE_SECONDS,intent.parentId]);
    const children = [];
    for (const site of scope.sites) {
      const runId = runIds.get(site.site_id);
      let [run] = await q('SELECT * FROM po_sync_runs WHERE id=? FOR UPDATE', [runId]);
      if (!run) {
        await q(`INSERT INTO po_sync_runs (id,source_id,account_id,parent_run_id,site_id,status,sync_mode,trigger_type,window_start,window_end,schedule_version,started_at,error_message)
          VALUES (?,?,?,?,?,'running','incremental','scheduled_site',?,?,?,UTC_TIMESTAMP(3),?)`, [runId,SOURCE,ACCOUNT,intent.parentId,site.site_id,dbTime(intent.windowStart),dbTime(intent.windowEnd),scope.source.schedule_version,JSON.stringify(receiptFor(intent,site))]);
        [run] = await q('SELECT * FROM po_sync_runs WHERE id=?', [runId]);
      }
      if(handoff){
        const baseline=Object.fromEntries(['fetched_count','inserted_count','changed_count','unchanged_count','stored_count'].map(key=>[key,Number(run[key]||0)]));
        const receipt={...receiptFor(intent,site),legacyHandoff:{...handoff,baseline},dailyCounts:{observations:0,inserted:0,changed:0,unchanged:0,stored:0}};
        await q("UPDATE po_sync_runs SET error_message=?,status='partial',error_code=NULL WHERE id=? AND lease_epoch=?",[JSON.stringify(receipt),run.id,run.lease_epoch]);
        run.error_message=JSON.stringify(receipt);run.status='partial';
      }
      const receipt = parse(run.error_message);
      if (run.source_id !== SOURCE || run.account_id !== ACCOUNT || run.parent_run_id !== intent.parentId || run.site_id !== site.site_id
        || run.trigger_type !== 'scheduled_site' || receipt.operation !== 'overseas-production-daily-v1'
        || receipt.scheduledAt !== intent.scheduledAt || receipt.configSha256 !== intent.configSha256 || receipt.siteUrlSha256 !== sha(site.url)) fail('OVERSEAS_PRODUCTION_RECEIPT_CONFLICT');
      if (['pausing','cancelling','cancelled','canceled','awaiting_manual_verification'].includes(run.status)) fail('OVERSEAS_PRODUCTION_CONTROL_PENDING');
      if (run.status !== 'completed') await q("UPDATE po_sync_runs SET status='running',lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),lease_epoch=lease_epoch+1,attempts=attempts+1,finished_at=NULL WHERE id=?", [owner,LEASE_SECONDS,runId]);
      [run] = await q('SELECT * FROM po_sync_runs WHERE id=?', [runId]);
      children.push({ site, run, receipt });
    }
    await q('UPDATE po_source_schedule_state SET lease_run_id=?,lease_owner=?,lease_epoch=lease_epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE source_id=?', [intent.parentId,owner,LEASE_SECONDS,SOURCE]);
    const [claimed] = await q('SELECT lease_epoch FROM po_source_schedule_state WHERE source_id=?', [SOURCE]);
    return { ...scope, children, sourceEpoch: Number(claimed.lease_epoch) };
  });
}
async function fence(conn, intent, owner, sourceEpoch, child) {
  const [[state]] = await conn.query('SELECT *,lease_until>UTC_TIMESTAMP(3) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE]);
  if (!Number(state?.live) || state.lease_owner !== owner || state.lease_run_id !== intent.parentId || Number(state.lease_epoch) !== sourceEpoch) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
  const [[run]] = await conn.query('SELECT *,lease_until>UTC_TIMESTAMP(3) AS live FROM po_sync_runs WHERE id=? FOR UPDATE', [child.run.id]);
  if (!Number(run?.live) || run.status !== 'running' || run.lease_owner !== owner || Number(run.lease_epoch) !== Number(child.run.lease_epoch)
    || run.error_message !== JSON.stringify(child.receipt)) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
}
async function commitPage({ repo, scope, intent, owner, child, page, feed, jobs }) {
  return transaction(repo, async conn => {
    await fence(conn,intent,owner,scope.sourceEpoch,child);
    const q = async (sql, params = []) => (await conn.query(sql, params))[0];
    const fresh = await loadScope(q, true);
    if (fresh.configSha256 !== intent.configSha256) fail('OVERSEAS_PRODUCTION_SCOPE_CHANGED');
    const columns = await q("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='po_contents'");
    const modern = ['board_id','board_name','board_key'].every(key => columns.some(row => row.COLUMN_NAME === key));
    const syncScope = page.syncScope || 'posts';
    if (!['posts','comments'].includes(syncScope)) fail('OVERSEAS_PRODUCTION_CONTENT_SCOPE');
    if (syncScope==='comments') await ensureCommentRootScope(q,{sourceId:SOURCE,accountId:ACCOUNT,gameId:GAME,
      communityId:COMMUNITY,siteId:child.site.site_id,boardId:BOARD,postId:page.rootPlatformContentId});
    const items = [];
    for (const raw of page.items) {
      if (String(raw.boardId) !== BOARD || raw.contentType !== (syncScope === 'comments' ? 'comment' : 'post')) fail('OVERSEAS_PRODUCTION_CONTENT_SCOPE');
      const normalized = normalizeRawContent(raw);
      if (!normalized.publishedAt || (!raw.recoveryContextAncestor && (+normalized.publishedAt < +new Date(intent.windowStart) || +normalized.publishedAt >= +new Date(intent.windowEnd)))) fail('OVERSEAS_PRODUCTION_CONTENT_WINDOW');
      if (raw.recoveryContextAncestor && syncScope !== 'comments') fail('OVERSEAS_PRODUCTION_CONTENT_SCOPE');
      const [existing] = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE',[SOURCE,normalized.externalId]);
      if (existing && (existing.account_id !== ACCOUNT || existing.game_id !== GAME || existing.community_id !== COMMUNITY)) fail('OVERSEAS_PRODUCTION_CONTENT_SCOPE');
      const oldPayload = parse(existing?.raw_payload || '{}');
      const preserveDetail = existing && oldPayload._contentIntegrity?.status === 'detail_enriched' && raw.rawPayload?._contentIntegrity?.status === 'summary_fallback';
      items.push({ ...raw, ...normalized, ...(preserveDetail ? {title:existing.title,body:existing.body,authorName:existing.author_name,
        fingerprint:existing.fingerprint,media:parse(existing.media||'[]'),rawPayload:oldPayload} : {rawPayload:{...raw.rawPayload,boardId:BOARD}}),
        boardId:modern?BOARD:null,boardName:modern?raw.boardName:null });
    }
    const pinned = { query: async (sql, params = []) => {
      const adapted = modern ? { sql, params } : stripBoardInsert(sql,params);
      if (/^SELECT \* FROM po_contents WHERE /.test(sql)) {
        adapted.sql += ' FOR UPDATE';
        const result = await conn.query(adapted.sql,adapted.params);
        for (const row of result[0]) {
          const payload = parse(row.raw_payload || '{}');
          const boards = [row.board_id,payload.boardId,payload.board_id,payload._overseasScope?.boardId,payload._lastNightScope?.boardId].filter(value => value != null);
          if (row.source_id !== SOURCE || row.account_id !== ACCOUNT || row.game_id !== GAME || row.community_id !== COMMUNITY
            || boards.some(value => String(value) !== BOARD)) fail('OVERSEAS_PRODUCTION_CONTENT_SCOPE');
        }
        return result;
      }
      return conn.query(adapted.sql,adapted.params);
    }, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
    const facade = Object.create(repo); facade.pool = { getConnection: async () => pinned };
    facade.query = async (sql,params) => (await pinned.query(sql,params))[0];
    const scopedFeed = { ...feed, feedKey: `overseas:${child.site.site_id}:${feed.feedKey}`, siteId: child.site.site_id,
      siteUrlSha256: sha(child.site.url), languageId: new URL(child.site.url).searchParams.get('languageId'), boardId: BOARD };
    const committed = await repo._upsertContentPageAttempt.call(facade,{ account:scope.account,source:scope.source,
      syncRunId:child.run.id,leaseOwner:owner,leaseSeconds:LEASE_SECONDS,syncScope,
      rootPlatformContentId:page.rootPlatformContentId||'',items,feed:scopedFeed });
    await jobs({ facade,contents:committed.contents,items });
    // Association IDs remain attached to the preserved old runs. Count the
    // independent daily observations in its own atomic receipt even when an
    // observed content was already associated with the old collector.
    const counts=child.receipt.dailyCounts||{observations:0,inserted:0,changed:0,unchanged:0,stored:0};
    const observed = committed.contents.filter((_entry,index)=>!items[index].recoveryContextAncestor);
    const delta={observations:observed.length,inserted:0,changed:0,unchanged:0,stored:committed.storedCount};
    for(const entry of observed)if(Object.hasOwn(delta,entry.change))delta[entry.change]++;
    let patch = page.receiptPatch;
    if (syncScope === 'posts' && !page.hasMore) {
      const candidates = await q(`SELECT c.external_id,JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.siteId')) AS site_id
        FROM po_contents c JOIN po_content_feed_memberships m ON m.content_id=c.id AND m.account_id=c.account_id
        WHERE c.source_id=? AND c.account_id=? AND c.game_id=? AND c.community_id=? AND c.content_type='post'
        AND c.is_deleted=0 AND JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.boardId'))=?
        AND JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.siteId')) IS NOT NULL ORDER BY c.published_at DESC,c.id`,[SOURCE,ACCOUNT,GAME,COMMUNITY,BOARD]);
      // Legacy faulty runs attached the same English root to all three sites.
      // Resolve those duplicates to the original English site; never send
      // the same root through three language comment queues.
      const commentTasks=commentRootTasks(candidates,scope.sites,child.site.site_id);
      patch={phase:'comments',commentTasks,done:commentTasks.length===0};
    }
    if (syncScope === 'comments' && !patch) fail('OVERSEAS_COMMENT_CHECKPOINT_REQUIRED');
    const receipt = { ...child.receipt, ...(syncScope==='posts'?{cursor:page.nextCursor,pages:child.receipt.pages+1}:{}), ...patch,
      commentObservations:Number(child.receipt.commentObservations||0)+(syncScope==='comments'?observed.length:0),
      dailyCounts:Object.fromEntries(Object.keys(counts).map(key=>[key,Number(counts[key])+delta[key]])) };
    if (syncScope==='comments') await q('UPDATE po_sync_runs SET fetched_count=fetched_count+?,inserted_count=inserted_count+?,changed_count=changed_count+?,unchanged_count=unchanged_count+?,discovered_count=discovered_count+?,stored_count=stored_count+? WHERE id=?',[delta.observations,delta.inserted,delta.changed,delta.unchanged,delta.observations,delta.stored,child.run.id]);
    await q("UPDATE po_sync_runs SET error_message=?,error_code=NULL,status=?,finished_at=IF(?,UTC_TIMESTAMP(3),NULL),lease_owner=IF(?,NULL,lease_owner),lease_until=IF(?,NULL,lease_until) WHERE id=?", [JSON.stringify(receipt),receipt.done?'completed':'running',receipt.done,receipt.done,receipt.done,child.run.id]);
    await q('UPDATE po_sync_runs SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE id=? AND lease_owner=?', [LEASE_SECONDS,intent.parentId,owner]);
    await q('UPDATE po_source_schedule_state SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE source_id=? AND lease_owner=? AND lease_epoch=?', [LEASE_SECONDS,SOURCE,owner,scope.sourceEpoch]);
    return { receipt, storedCount:committed.storedCount, contentIds:committed.contents.map(entry => entry.content.id) };
  });
}
async function collectSite({ connector, scoped, account, child, intent, commit, check, maxPages = 10, signal }) {
  if (child.receipt.done) return { siteId:child.site.site_id,status:'completed',pages:0 };
  await check();
  const feeds = await connector.discoverFeeds({ source:scoped,account,signal });
  const feed = feeds.find(item => item.endpointKind === 'merged');
  if (!feed || String(feed.boardId) !== BOARD) fail('OVERSEAS_PRODUCTION_FEED_SCOPE');
  if (child.receipt.phase==='comments') return collectComments({connector,scoped,account,child,intent,feed,check,commit,signal});
  for (let index = 0; index < maxPages; index++) {
    await check();
    const page = await connector.listFeedContents({ source:scoped,account,signal,feed,cursor:child.receipt.cursor,limit:20,
      segmentId:child.run.id,dailyBounded:true,publishedFrom:intent.windowStart,publishedTo:intent.windowEnd });
    if (!Array.isArray(page.items) || typeof page.hasMore !== 'boolean' || (page.hasMore && (!page.nextCursor || page.nextCursor === child.receipt.cursor))) fail('OVERSEAS_PRODUCTION_PAGINATION_INVALID');
    const committed = await commit(page,feed);
    child.receipt = committed.receipt; // Cursor advances only after DB COMMIT ACK.
    if (!page.hasMore) {
      if (child.receipt.phase==='comments') return collectComments({connector,scoped,account,child,intent,feed,check,commit,signal});
      return { siteId:child.site.site_id,status:'completed',pages:index+1 };
    }
  }
  fail('OVERSEAS_PRODUCTION_PAGE_BUDGET');
}
async function finish(repo,intent,owner,scope,errorCode = null) {
  return transaction(repo,async conn => {
    const q = async (sql,params = []) => (await conn.query(sql,params))[0];
    const [state] = await q('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE]);
    if (state?.lease_owner !== owner || Number(state.lease_epoch) !== scope.sourceEpoch) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
    if (errorCode) await q("UPDATE po_sync_runs SET status='partial',error_code=?,finished_at=UTC_TIMESTAMP(3),lease_owner=NULL,lease_until=NULL WHERE parent_run_id=? AND status='running' AND lease_owner=?",[errorCode,intent.parentId,owner]);
    const ids=scope.children.map(child=>child.run.id);
    const children = await q(`SELECT id,status,error_message,fetched_count,inserted_count,changed_count,unchanged_count,stored_count FROM po_sync_runs WHERE parent_run_id=? AND id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`,[intent.parentId,...ids]);
    const complete = children.length === 3 && children.every(child => child.status === 'completed');
    const countKeys={fetched_count:'observations',inserted_count:'inserted',changed_count:'changed',unchanged_count:'unchanged',stored_count:'stored'};
    for (const child of children) {
      const receipt=productionReceipt(child);
      if (!receipt?.dailyCounts || receipt.phase!=='comments') continue;
      if (!receipt.legacyHandoff) {
        const associations=await q(`SELECT rc.change_type,COUNT(*) AS total,SUM(c.content_type='comment') AS comments
          FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? GROUP BY rc.change_type`,[child.id]);
        const counted={observations:0,inserted:0,changed:0,unchanged:0,stored:0};
        receipt.commentObservations=0;
        for (const row of associations) {
          counted.observations+=Number(row.total);
          if (Object.hasOwn(counted,row.change_type)) counted[row.change_type]+=Number(row.total);
          receipt.commentObservations+=Number(row.comments);
        }
        counted.stored=counted.inserted+counted.changed;
        receipt.dailyCounts=counted;
        child.error_message=JSON.stringify(receipt);
        await q('UPDATE po_sync_runs SET error_message=? WHERE id=?',[child.error_message,child.id]);
      }
      const values=Object.entries(countKeys).map(([column,key])=>Number(receipt.dailyCounts[key]||0)+Number(receipt.legacyHandoff?.baseline?.[column]||0));
      await q('UPDATE po_sync_runs SET fetched_count=?,inserted_count=?,changed_count=?,unchanged_count=?,stored_count=?,comment_count=? WHERE id=?', [...values,Number(receipt.commentObservations||0),child.id]);
    }
    const sum = key => children.reduce((total,child) => {
      const receipt=productionReceipt(child);
      return total+Number(receipt?.dailyCounts?.[countKeys[key]]??(Number(child[key]||0)-Number(receipt?.legacyHandoff?.baseline?.[key]||0)));
    },0);
    await q('UPDATE po_sync_runs SET status=?,error_code=?,finished_at=UTC_TIMESTAMP(3),lease_owner=NULL,lease_until=NULL,fetched_count=?,inserted_count=?,changed_count=?,unchanged_count=?,stored_count=? WHERE id=? AND lease_owner=?',[complete?'completed':'partial',complete?null:errorCode||'OVERSEAS_PRODUCTION_INCOMPLETE',sum('fetched_count'),sum('inserted_count'),sum('changed_count'),sum('unchanged_count'),sum('stored_count'),intent.parentId,owner]);
    const advanceSchedule=complete&&intent.kind!=='today';
    await q('UPDATE po_source_schedule_state SET lease_owner=NULL,lease_until=NULL,lease_run_id=NULL,last_status=?,last_reason_code=?,last_scan_at=UTC_TIMESTAMP(3),last_scheduled_at=IF(?,?,last_scheduled_at),next_scheduled_at=IF(?,?,next_scheduled_at) WHERE source_id=? AND lease_owner=? AND lease_epoch=?',[complete?'completed':'partial',complete?null:errorCode,advanceSchedule,dbTime(intent.scheduledAt),advanceSchedule,dbTime(nextScheduledAt(intent,scope.source)),SOURCE,owner,scope.sourceEpoch]);
    if (complete) await q('UPDATE po_sources SET last_success_at=UTC_TIMESTAMP(3) WHERE id=?',[SOURCE]);
    return { status:complete?'completed':'partial',sourceId:SOURCE,parentId:intent.parentId,children:children.length,observations:sum('fetched_count') };
  });
}
async function renew(repo,intent,owner,scope) {
  return transaction(repo,async conn=>{
    const [state] = await conn.query('UPDATE po_source_schedule_state SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)',[LEASE_SECONDS,SOURCE,intent.parentId,owner,scope.sourceEpoch]);
    if (state.affectedRows !== 1) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
    const [runs] = await conn.query("UPDATE po_sync_runs SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE (id=? OR parent_run_id=?) AND status='running' AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3)",[LEASE_SECONDS,intent.parentId,intent.parentId,owner]);
    const [[stale]] = await conn.query("SELECT COUNT(*) AS total FROM po_sync_runs WHERE (id=? OR parent_run_id=?) AND status='running' AND (lease_owner<>? OR lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))",[intent.parentId,intent.parentId,owner]);
    if (!runs.affectedRows || Number(stale.total)) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
  });
}
async function main(argv = process.argv.slice(2), {refreshToday=false} = {}) {
  if (argv.length !== 1 || !['--dry-run','--preflight','--execute'].includes(argv[0])) fail('OVERSEAS_PRODUCTION_ARGUMENTS');
  if (argv[0] === '--dry-run') { console.log(JSON.stringify({status:'PREPARED_NOT_ACTIVE',sourceId:SOURCE,...dailySlot(),networkRequests:0,databaseWrites:0})); return; }
  require('../../server/src/runtimeEnv').loadRuntimeEnv();
  // This process must retain certificate verification even when the shared
  // service environment contains the legacy opt-out. Do not edit shared env.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  if (process.env.OVERSEAS_DAILY_EXECUTION_ENABLED !== 'true') fail('OVERSEAS_PRODUCTION_EXECUTION_DISABLED');
  const guardPath = process.env.OVERSEAS_SHARED_EXCLUSION_MANIFEST;
  const check = async () => assertSharedExclusion(guardPath);
  await check();
  const directory = assertStateDirectory(process.env.OVERSEAS_DAILY_STATE_DIRECTORY);
  if(fs.existsSync(path.join(directory,'STOP')))fail('OVERSEAS_PRODUCTION_STOPPED');
  const { Repository } = require('../../server/src/db/repository');
  const { CredentialContext } = require('../../server/src/services/credentialContext');
  const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
  const { createOverseasBigPlayerSiteSession } = require('../../server/src/connectors/overseasBigPlayerSiteSession');
  const { AiAnalyzer } = require('../../server/src/integrations/aiAnalyzer');
  const repo = new Repository({...process.env,DB_POOL_SIZE:'3'});
  if(argv[0]==='--preflight'){
    try{const current=await loadScope(repo.query.bind(repo));console.log(JSON.stringify({status:'PRODUCTION_PREFLIGHT_PASS',sourceId:SOURCE,sites:current.sites.length,networkRequests:0,databaseWrites:0}));}
    finally{await repo.pool.end();}return;
  }
  const owner = `overseas-daily:${crypto.randomUUID()}`;
  let lockConn, locked = false, intent, scope, intentPath, started = false, uncertain = false, timer, heartbeatError, heartbeat, pageCommitInProgress = false;
  const controller = new AbortController();
  const stop = () => controller.abort(); process.once('SIGINT',stop); process.once('SIGTERM',stop);
  try {
    lockConn = await repo.pool.getConnection();
    const [[lock]] = await lockConn.query('SELECT GET_LOCK(?,0) AS acquired',[`po-overseas-production:${SOURCE}`]);
    if (Number(lock.acquired) !== 1) fail('OVERSEAS_PRODUCTION_BUSY'); locked = true;
    const initial = await loadScope(repo.query.bind(repo));
    const existing = fs.readdirSync(directory).filter(name => refreshToday?/^today-\d{13}\.json$/.test(name):/^slot-\d{13}\.json$/.test(name)).sort();
    for (const name of existing) {
      const previous = parse(fs.readFileSync(path.join(directory,name),'utf8'));
      if (previous.status !== 'completed') { intent = previous; intentPath = path.join(directory,name); break; }
    }
    if (!intent) {
      const [schedule]=await repo.query('SELECT last_scheduled_at,next_scheduled_at FROM po_source_schedule_state WHERE source_id=?',[SOURCE]);
      const slot=refreshToday?todaySlot():configuredSlot(initial.source,schedule);
      if(!slot)return {status:'caught_up'};
      intentPath = path.join(directory,`${refreshToday?'today':'slot'}-${+new Date(slot.scheduledAt)}.json`);
      if (fs.existsSync(intentPath)) intent = parse(fs.readFileSync(intentPath,'utf8'));
      else {
        const [legacy] = await repo.query('SELECT id,status,account_id,trigger_type,window_start,window_end FROM po_sync_runs WHERE source_id=? AND scheduled_at=?',[SOURCE,dbTime(slot.scheduledAt)]);
        if(legacy && (legacy.account_id!==ACCOUNT || !['scheduled','scheduled_catchup'].includes(legacy.trigger_type)
          || dbTime(legacy.window_start)!==dbTime(slot.windowStart) || dbTime(legacy.window_end)!==dbTime(slot.windowEnd)))fail('OVERSEAS_PRODUCTION_SLOT_CONFLICT');
        intent = {format:'overseas-production-slot-v1',status:'intent',sourceId:SOURCE,accountId:ACCOUNT,...slot,
          parentId:legacy?.id||idFor(slot.scheduledAt),configSha256:initial.configSha256}; durableJson(intentPath,intent,true);
      }
    }
    if (intent.format !== 'overseas-production-slot-v1' || intent.sourceId !== SOURCE || intent.accountId !== ACCOUNT
      || !/^[a-f0-9-]{36}$/.test(intent.parentId||'') || intent.configSha256 !== initial.configSha256) fail('OVERSEAS_PRODUCTION_INTENT_CONFLICT');
    if (intent.status === 'commit_unknown') fail('OVERSEAS_PRODUCTION_RECONCILE_REQUIRED');
    scope = await admit(repo,intent,owner,directory); started = !scope.alreadyCompleted;
    if (scope.alreadyCompleted) { durableJson(intentPath,{...intent,status:'completed'}); console.log(JSON.stringify({status:'already_completed',parentId:intent.parentId})); return {status:'already_completed'}; }
    timer = setInterval(()=>{
      if (heartbeat || heartbeatError || pageCommitInProgress) return;
      heartbeat = renew(repo,intent,owner,scope).catch(error=>{heartbeatError=error;controller.abort();}).finally(()=>{heartbeat=null;});
    },30000);
    const jobs = createOverseasPageJobs({repairMissingJobs:true,analysisOptionsFor:()=>({profile:'light',version:new AiAnalyzer(process.env).profiles.light.version,triggerReason:'all_content'}),translationOptions:{targetLanguage:'zh-CN',version:process.env.AI_TRANSLATION_VERSION||'translation-v1'}});
    const credentialContext = new CredentialContext({repo});
    let sent = 0;
    const outboundFetch = process.env.OVERSEAS_DAILY_PROXY_URL ? createProxyFetch(process.env.OVERSEAS_DAILY_PROXY_URL) : fetch;
    const maxRequests = Math.min(1000,Math.max(1,Number(process.env.OVERSEAS_DAILY_MAX_REQUESTS)||84));
    const maxPages = Math.min(100,Math.max(1,Number(process.env.OVERSEAS_DAILY_MAX_PAGES_PER_SITE)||10));
    for (const child of scope.children) {
      if (controller.signal.aborted) fail('OVERSEAS_PRODUCTION_STOPPED');
      const siteUrl = new URL(child.site.url);
      const transport = async (input,options = {}) => {
        await check();
        if(heartbeatError)throw heartbeatError;
        if(fs.existsSync(path.join(directory,'STOP')))fail('OVERSEAS_PRODUCTION_STOPPED');
        const [live] = await repo.query(`SELECT r.id FROM po_sync_runs r JOIN po_source_schedule_state st ON st.source_id=r.source_id
          JOIN po_sources s ON s.id=r.source_id JOIN po_accounts a ON a.id=r.account_id
          WHERE r.id=? AND r.source_id=? AND r.account_id=? AND r.status='running' AND r.lease_owner=? AND r.lease_epoch=? AND r.lease_until>UTC_TIMESTAMP(3)
          AND st.lease_run_id=? AND st.lease_owner=? AND st.lease_epoch=? AND st.lease_until>UTC_TIMESTAMP(3)
          AND s.enabled=1 AND a.enabled=1`,[child.run.id,SOURCE,ACCOUNT,owner,child.run.lease_epoch,intent.parentId,owner,scope.sourceEpoch]);
        if(!live)fail('OVERSEAS_PRODUCTION_LEASE_LOST');
        const url = new URL(input);
        if (url.origin !== siteUrl.origin || controller.signal.aborted) fail('OVERSEAS_PRODUCTION_REQUEST_SCOPE');
        // Community-token authorization alone does not bind a language feed.
        // Send the actual site's explicit context on every API request.
        for (const key of ['env','gameId','gameVersion','languageId']) url.searchParams.set(key,siteUrl.searchParams.get(key));
        return retryNetwork(async()=>{
          if (++sent > maxRequests) fail('OVERSEAS_PRODUCTION_HTTP_BUDGET');
          const signals = [controller.signal,AbortSignal.timeout(15000)]; if(options.signal)signals.push(options.signal);
          return outboundFetch(url,{...options,signal:AbortSignal.any(signals)});
        },{signal:controller.signal});
      };
      // Three bounded 15-second transport attempts must fit inside the outer
      // authorization/page deadline, including retry backoff.
      const session = createOverseasBigPlayerSiteSession({transport,timeoutMs:60000});
      const connector = new BigPlayerH5Connector({...process.env,BIGPLAYER_H5_ENABLED:'true',BIGPLAYER_H5_ALLOWED_HOSTS:'club-en.q1.com',BIGPLAYER_H5_TIMEOUT_MS:'60000'},{credentialContext,overseasSiteSession:session,fetchImpl:transport});
      const scoped = {...scope.source,account:scope.account,siteId:child.site.site_id,site_id:child.site.site_id,siteUrl:child.site.url,config:{...parse(scope.source.config),baseUrl:child.site.url}};
      await collectSite({connector,scoped,account:scope.account,child,intent,maxPages,signal:controller.signal,check:async()=>{
        if (heartbeatError) throw heartbeatError;
        // The transport verifies shared exclusion immediately before every
        // HTTP request. Keep the page lock check here without repeating the
        // expensive Windows process inventory before that same request.
        const [[owned]] = await lockConn.query('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[`po-overseas-production:${SOURCE}`]);
        if (!Number(owned.owned)) fail('OVERSEAS_PRODUCTION_LEASE_LOST');
      },commit:async(page,feed)=>{
        // Both page commit and renewal lock the source/run rows. Do not let
        // our own heartbeat time out behind a page's atomic queue writes.
        // Page commit renews these same leases before COMMIT.
        pageCommitInProgress = true;
        try {
          if (heartbeat) await heartbeat;
          if (heartbeatError) throw heartbeatError;
          const result = await commitWithLockRetry(()=>commitPage({repo,scope,intent,owner,child,page,feed,jobs}));
          durableJson(intentPath,{...intent,status:'collecting',sentRequests:sent,lastCommittedSite:child.site.site_id,lastCommittedPages:result.receipt.pages});
          return result;
        } finally { pageCommitInProgress = false; }
      }});
    }
    clearInterval(timer); timer=null; if(heartbeat)await heartbeat;
    if(heartbeatError)throw heartbeatError;
    const result = await finish(repo,intent,owner,scope); started = false;
    durableJson(intentPath,{...intent,status:result.status,result,sentRequests:sent});
    console.log(JSON.stringify({...result,sentRequests:sent,aiExecuted:false}));
    return result;
  } catch (error) {
    clearInterval(timer); timer=null; if(heartbeat)await heartbeat;
    if(heartbeatError && error.code!=='OVERSEAS_PRODUCTION_COMMIT_UNKNOWN')error=heartbeatError;
    const diagnostic=[]; for(let current=error,depth=0;current&&depth<6;current=current.cause,depth++)diagnostic.push({code:current.code||current.name,page:current.page,capability:current.capability});
    console.error(JSON.stringify({status:'collection_error',causes:diagnostic}));
    const causeCode=networkFailure(error);
    if(causeCode!==error.code)error=Object.assign(new Error(causeCode),{code:causeCode,cause:error});
    uncertain = error.code === 'OVERSEAS_PRODUCTION_COMMIT_UNKNOWN';
    if (intentPath && uncertain) durableJson(intentPath,{...intent,status:'commit_unknown'});
    if (started && !uncertain && error.code !== 'OVERSEAS_PRODUCTION_LEASE_LOST') {
      try { await finish(repo,intent,owner,scope,/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'OVERSEAS_PRODUCTION_FAILED'); }
      catch (cleanupError) {
        if(cleanupError.code==='OVERSEAS_PRODUCTION_COMMIT_UNKNOWN')durableJson(intentPath,{...intent,status:'commit_unknown'});
        throw cleanupError;
      }
    }
    throw error;
  } finally {
    clearInterval(timer);
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    if (lockConn) { try { if(locked)await lockConn.query('SELECT RELEASE_LOCK(?)',[`po-overseas-production:${SOURCE}`]);lockConn.release(); } catch {lockConn.destroy();} }
    await repo.pool.end();
  }
}
async function runScheduled(argv=process.argv.slice(2), execute=main) {
  return execute(argv);
}
if (require.main === module) runScheduled().catch(error=>{console.error(JSON.stringify({status:'failed',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'OVERSEAS_PRODUCTION_FAILED'}));process.exitCode=1;});
module.exports = { dailySlot,selectDueSlot,todaySlot,configuredSlot,nextScheduledAt,idFor,collectSite,commitPage,assertSharedExclusion,main,runScheduled };
