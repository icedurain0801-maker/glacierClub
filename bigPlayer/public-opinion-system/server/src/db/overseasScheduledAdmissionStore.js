'use strict';
const crypto=require('node:crypto');
const {canonical}=require('../../../worker/src/overseasBigPlayerRunContractJournal');
const {iso}=require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const {scheduledBatchOf,scheduledBatchHash}=require('../../../worker/src/overseasScheduledBatch');
const {scheduledAdmissionHash,assertScheduledRunPair}=require('../../../worker/src/overseasScheduledAdmission');
const {normalizeSiteUrls}=require('../services/bigplayerSiteConfig');
const brands=new WeakMap(),sha=s=>crypto.createHash('sha256').update(s).digest('hex'),empty=sha('[]');
const claims=new WeakMap();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const db=s=>iso(s).replace('T',' ').replace(/Z$/,''),nullable=s=>s==null?null:iso(s);
const scope=a=>Object.fromEntries(Object.entries(a).filter(([k])=>!['format','parentRunId','parentTriggerType','scheduledAt','scheduleVersion','configSha256'].includes(k)));
function requestOf(v){
  if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!=='batch,expectedState,leaseUntil,nextSlotAt,ownerId')fail('OVERSEAS_SCHEDULED_REQUEST_INVALID');
  const batch=scheduledBatchOf(v.batch),a=batch.admissions[0],e=v.expectedState;
  if(!e||Object.getPrototypeOf(e)!==Object.prototype||Object.keys(e).sort().join(',')!=='effectiveAt,lastScanAt,lastScheduledAt,leaseEpoch,leaseOwner,leaseRunId,leaseUntil,nextScheduledAt,scheduleVersion'
    ||e.scheduleVersion!==a.scheduleVersion||!Number.isSafeInteger(e.leaseEpoch)||e.leaseEpoch<0||e.leaseEpoch>=Number.MAX_SAFE_INTEGER
    ||e.leaseRunId!==null||e.leaseOwner!==null||e.leaseUntil!==null||!/^[A-Za-z0-9._:-]{1,160}$/.test(v.ownerId||''))fail('OVERSEAS_SCHEDULED_REQUEST_INVALID');
  const state=Object.freeze({...e,effectiveAt:iso(e.effectiveAt),lastScanAt:nullable(e.lastScanAt),lastScheduledAt:nullable(e.lastScheduledAt),nextScheduledAt:iso(e.nextScheduledAt)});
  const nextSlotAt=iso(v.nextSlotAt),leaseUntil=iso(v.leaseUntil);
  if(state.nextScheduledAt!==a.scheduledAt||nextSlotAt<=a.scheduledAt)fail('OVERSEAS_SCHEDULED_REQUEST_INVALID');
  return Object.freeze({batch,expectedState:state,ownerId:v.ownerId,nextSlotAt,leaseUntil,batchSha256:scheduledBatchHash(batch)});
}
function oldState(s,r){const e=r.expectedState;return s&&Number(s.schedule_version)===e.scheduleVersion&&Number(s.lease_epoch)===e.leaseEpoch
  &&s.lease_run_id===null&&s.lease_owner===null&&s.lease_until===null&&nullable(s.effective_at)===e.effectiveAt&&nullable(s.last_scan_at)===e.lastScanAt&&nullable(s.last_scheduled_at)===e.lastScheduledAt&&nullable(s.next_scheduled_at)===e.nextScheduledAt;}
function committedState(s,r){const a=r.batch.admissions[0];return s&&Number(s.schedule_version)===a.scheduleVersion&&Number(s.lease_epoch)===r.expectedState.leaseEpoch+1
  &&s.lease_run_id===a.parentRunId&&s.lease_owner===r.ownerId&&nullable(s.lease_until)===r.leaseUntil&&nullable(s.effective_at)===r.expectedState.effectiveAt
  &&nullable(s.last_scan_at)===r.expectedState.lastScanAt&&nullable(s.last_scheduled_at)===a.scheduledAt&&nullable(s.next_scheduled_at)===r.nextSlotAt;}
function createOverseasScheduledAdmissionStore({repo,isolation,cursorReader}={}){
  if(typeof repo?.pool?.getConnection!=='function')fail('OVERSEAS_SCHEDULED_STORE_REQUIRED');
  require('./overseasScheduledIsolatedTarget').assertScheduledIsolatedTarget(isolation,repo);
  if(cursorReader!==undefined)require('./overseasScheduledParentStore').assertCertifiedFixtureCursorReader(cursorReader,repo,isolation);
  const rows=async(c,s,p=[]) => (await c.query(s,p))[0];
  async function transaction(work,readonly=false,readCommitted=false){const c=await repo.pool.getConnection();let started=false,committing=false,destroyed=false;
    try{await isolation.verifyConnection(c);await require('./overseasScheduledSchemaGuard').verifyScheduledIsolationSchema(c);await c.query(readCommitted?'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED':'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      if(readonly)await c.query('START TRANSACTION READ ONLY');else{await c.query('SET SESSION innodb_lock_wait_timeout=3');await c.query('SET SESSION max_statement_time=10');await c.beginTransaction();}started=true;
      const result=await work(c);if(readonly)await c.rollback();else{committing=true;await c.commit();committing=false;}started=false;return result;
    }catch(e){if(committing){destroyed=true;c.destroy();fail('OVERSEAS_SCHEDULED_ADMISSION_COMMIT_UNKNOWN');}if(started)try{await c.rollback();}catch{destroyed=true;c.destroy();}throw e;
    }finally{if(!destroyed){if(readCommitted)try{await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');}catch{destroyed=true;c.destroy();}if(!destroyed)c.release();}}}
  async function readBatch(c,r,lock=false){const a=r.batch.admissions[0],suffix=lock?' FOR UPDATE':'';
    const parents=await rows(c,'SELECT * FROM po_sync_runs WHERE source_id=? AND scheduled_at=? LIMIT 2'+suffix,[a.sourceId,db(a.scheduledAt)]);
    const children=await rows(c,'SELECT * FROM po_sync_runs WHERE parent_run_id=? ORDER BY site_id LIMIT 101'+suffix,[a.parentRunId]);
    const manifests=await rows(c,`SELECT * FROM po_overseas_stage_manifests WHERE run_id IN (${r.batch.admissions.map(()=>'?').join(',')}) ORDER BY run_id`+suffix,r.batch.admissions.map(b=>b.runId));
    if(!parents.length&&!children.length&&!manifests.length)return {status:'absent'};
    if(parents.length!==1||parents[0].id!==a.parentRunId||children.length!==r.batch.admissions.length||manifests.length!==children.length)return {status:'conflict'};
    const parent=parents[0];if(nullable(parent.window_start)!==r.batch.parentWindowStart||nullable(parent.window_end)!==r.batch.parentWindowEnd)return {status:'conflict'};
    for(const b of r.batch.admissions){const child=children.find(x=>x.id===b.runId),m=manifests.find(x=>x.run_id===b.runId);
      try{assertScheduledRunPair(b,{parent,child});}catch{return {status:'conflict'};}
      if(!m||m.receipt_id!==r.batchSha256||m.scope_sha256!==sha(canonical(scope(b)))||m.manifest_sha256!==b.manifestSha256||m.admission_json!==canonical(b)||m.admission_sha256!==scheduledAdmissionHash(b))return {status:'conflict'};}
    return {status:'present',parent,children,manifests};}
  async function pristine(c,found,{lock=true}={}){
    for(const row of [found.parent,...found.children])if(row.status!=='queued'||Number(row.lease_epoch)!==0||Number(row.attempts)!==0
      ||[row.lease_owner,row.lease_until,row.started_at,row.finished_at,row.next_retry_at].some(x=>x!==null))fail('OVERSEAS_SCHEDULED_ADMISSION_CONFLICT');
    for(const m of found.manifests){if(m.coverage_status!=='admitted'||Number(m.created_epoch)!==0||Number(m.updated_epoch)!==0||m.schema_snapshot!=='[]'||m.schema_sha256!==empty
      ||Number(m.expected_count)!==0||m.expected_set_sha256!==empty||Number(m.history_sealed)!==0||Number(m.expansion_sealed)!==0||m.history_snapshot_at!==null||m.coverage_reason!==null)fail('OVERSEAS_SCHEDULED_ADMISSION_CONFLICT');
      const tasks=await rows(c,'SELECT task_identity_sha256 FROM po_overseas_expected_tasks WHERE run_id=? LIMIT 1'+(lock?' FOR UPDATE':''),[m.run_id]);if(tasks.length)fail('OVERSEAS_SCHEDULED_ADMISSION_CONFLICT');}}
  async function currentSource(c,r,lock=true){const a=r.batch.admissions[0];const sources=await rows(c,`SELECT s.id,s.game_id,s.community_id,s.platform,s.config,s.enabled,s.default_account_id,s.schedule_version,s.schedule_effective_at,s.frequency_seconds,s.auth_status,
    (s.auth_expire_at IS NOT NULL AND s.auth_expire_at<=UTC_TIMESTAMP(3)) AS auth_expired,g.region_code,g.enabled AS game_enabled,cm.game_id AS community_game,cm.status AS community_status
    FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities cm ON cm.id=s.community_id WHERE s.id=?`+(lock?' FOR UPDATE':''),[a.sourceId]);const s=sources[0];
    if(sources.length!==1||s.game_id!==a.gameId||s.community_id!==a.communityId||s.community_game!==a.gameId||s.platform!=='bigplayer_h5'||s.region_code!=='overseas'
      ||Number(s.enabled)!==1||Number(s.game_enabled)!==1||s.community_status!=='enabled'||s.default_account_id!==a.accountId||Number(s.schedule_version)!==a.scheduleVersion
      ||nullable(s.schedule_effective_at)!==r.expectedState.effectiveAt||s.auth_status!=='authorized'||Number(s.auth_expired)!==0)fail('OVERSEAS_SCHEDULED_SCOPE_CHANGED');
    const frequency=Number(s.frequency_seconds);if(!require('../../../worker/src/scheduleSlots').ALLOWED_FREQUENCIES.includes(frequency))fail('OVERSEAS_SCHEDULED_SLOT_CHANGED');
    let config;try{config=typeof s.config==='string'?JSON.parse(s.config):s.config;}catch{fail('OVERSEAS_SCHEDULED_CONFIG_CHANGED');}
    if(!config||Array.isArray(config)||(Object.hasOwn(config,'deleted')&&config.deleted!==false)||String(config.boardId)!==a.boardId||sha(canonical(config))!==a.configSha256)fail('OVERSEAS_SCHEDULED_CONFIG_CHANGED');return {config,frequency};}
  async function identity(c,r,config,lock=true){const suffix=lock?' FOR UPDATE':'',a=r.batch.admissions[0];const accounts=await rows(c,`SELECT id,source_id,game_id,community_id,platform,enabled,auth_status,(auth_expire_at IS NOT NULL AND auth_expire_at<=UTC_TIMESTAMP(3)) AS expired FROM po_accounts WHERE id=?`+suffix,[a.accountId]),account=accounts[0];
    if(accounts.length!==1||account.source_id!==a.sourceId||account.game_id!==a.gameId||account.community_id!==a.communityId||account.platform!=='bigplayer_h5'||Number(account.enabled)!==1||account.auth_status!=='authorized'||Number(account.expired)!==0)fail('OVERSEAS_SCHEDULED_ACCOUNT_CHANGED');
    const creds=await rows(c,`SELECT id,status,(expire_at IS NOT NULL AND expire_at<=UTC_TIMESTAMP(3)) AS expired,(secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS present FROM po_credentials WHERE source_id=? AND account_id=? AND credential_type='api_token' AND status='active' ORDER BY id LIMIT 2`+suffix,[a.sourceId,a.accountId]);
    if(creds.length!==1||creds[0].status!=='active'||Number(creds[0].expired)!==0||Number(creds[0].present)!==1)fail('OVERSEAS_SCHEDULED_CREDENTIAL_INVALID');
    const registry=await rows(c,'SELECT site_id,url,url_hash,enabled FROM po_source_sites WHERE source_id=? AND enabled=1 ORDER BY site_id LIMIT 101'+suffix,[a.sourceId]);
    const configured=normalizeSiteUrls(config).siteUrls.filter(s=>s.enabled);
    if(registry.length!==r.batch.admissions.length||configured.length!==registry.length)fail('OVERSEAS_SCHEDULED_REGISTRY_CHANGED');
    for(const b of r.batch.admissions)if(configured.filter(s=>s.siteId===b.siteId&&s.url===b.siteUrl).length!==1||registry.filter(s=>s.site_id===b.siteId&&s.url===b.siteUrl&&s.url_hash===b.siteUrlSha256&&Number(s.enabled)===1).length!==1)fail('OVERSEAS_SCHEDULED_REGISTRY_CHANGED');}
  async function admit(input,anchor){const r=requestOf(input),a=r.batch.admissions[0];
    const certifiedContext=require('../../../worker/src/overseasScheduledTimeAnchor').scheduledTimeAnchorAdmissionContext(anchor,repo,isolation,cursorReader);
    if(anchor.sourceId!==a.sourceId||anchor.scheduleVersion!==a.scheduleVersion||anchor.effectiveAt!==r.expectedState.effectiveAt||anchor.lastScanAt!==r.expectedState.lastScanAt||anchor.lastScheduledAt!==r.expectedState.lastScheduledAt
      ||anchor.scheduledAt!==a.scheduledAt||anchor.nextSlotAt!==r.nextSlotAt||anchor.parentTriggerType!==a.parentTriggerType||anchor.parentWindowStart!==r.batch.parentWindowStart||anchor.parentWindowEnd!==r.batch.parentWindowEnd)fail('OVERSEAS_SCHEDULED_ANCHOR_MISMATCH');
    if(anchor.siteWindows.length!==r.batch.admissions.length||r.batch.admissions.some(b=>anchor.siteWindows.filter(s=>s.siteId===b.siteId&&s.siteUrl===b.siteUrl&&s.windowStart===b.windowStart&&s.windowEnd===b.windowEnd).length!==1))fail('OVERSEAS_SCHEDULED_CURSOR_MISMATCH');
    return transaction(async c=>{
    // Candidate lock order: active run range -> source -> state -> identity/sites -> manifests/tasks.
    const active=await rows(c,"SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','paused','cancelling') ORDER BY id LIMIT 102 FOR UPDATE",[a.sourceId]);
    const own=new Set([a.parentRunId,...r.batch.admissions.map(b=>b.runId)]);if(active.length>101||active.some(x=>!own.has(x.id)))fail('OVERSEAS_SCHEDULED_RUN_ACTIVE');
    const {config,frequency}=await currentSource(c,r);
    const states=await rows(c,"SELECT *,DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS db_now FROM po_source_schedule_state WHERE source_id=? FOR UPDATE",[a.sourceId]);if(states.length!==1)fail('OVERSEAS_SCHEDULED_STATE_MISSING');const state=states[0];
    const now=iso(String(state.db_now).replace(/(\.\d{3})000$/,'$1'));if(a.scheduledAt>now)fail('OVERSEAS_SCHEDULED_SLOT_NOT_DUE');
    if(now<anchor.anchorAt||frequency!==anchor.frequencySeconds)fail('OVERSEAS_SCHEDULED_ANCHOR_MISMATCH');
    const schedule=require('../../../worker/src/scheduleSlots').computeSchedule({now:new Date(anchor.anchorAt),frequencySeconds:frequency,effectiveAt:r.expectedState.effectiveAt,lastProcessedScheduledAt:r.expectedState.lastScheduledAt});
    if(schedule.dueSlotAt!==a.scheduledAt||schedule.nextSlotAt!==r.nextSlotAt||schedule.triggerType!==a.parentTriggerType)fail('OVERSEAS_SCHEDULED_SLOT_CHANGED');
    const expectedWindow=schedule.window?{start:schedule.window.windowStartAt,end:Date.parse(anchor.anchorAt)>Date.parse(schedule.window.windowEndAt)?anchor.anchorAt:schedule.window.windowEndAt}:{start:new Date(Date.parse(anchor.anchorAt)-7*86400000).toISOString(),end:anchor.anchorAt};
    if(r.batch.parentWindowStart!==expectedWindow.start||r.batch.parentWindowEnd!==expectedWindow.end)fail('OVERSEAS_SCHEDULED_WINDOW_CHANGED');
    if(r.leaseUntil<=now||Date.parse(r.leaseUntil)-Date.parse(now)>3600000)fail('OVERSEAS_SCHEDULED_LEASE_INVALID');
    await identity(c,r,config);
    if(certifiedContext)for(const b of [...r.batch.admissions].sort((x,y)=>x.siteId.localeCompare(y.siteId))){
      const expected=certifiedContext.sites.find(x=>x.siteId===b.siteId),scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'].map(k=>[k,b[k]]));
      if(!expected||canonical(scope)!==canonical(expected.scope))fail('OVERSEAS_SCHEDULED_CERTIFIED_SCOPE_CHANGED');
      const evidence=await cursorReader.readInTransaction(c,expected.scope,{lock:true});if(canonical(evidence)!==expected.evidence)fail('OVERSEAS_SCHEDULED_CERTIFIED_CURSOR_CHANGED');
    }
    const found=await readBatch(c,r,true);
    if(found.status==='conflict')fail('OVERSEAS_SCHEDULED_ADMISSION_CONFLICT');
    if(found.status==='present'){await pristine(c,found);if(!committedState(state,r))fail('OVERSEAS_SCHEDULED_STATE_CHANGED');return {status:'already_admitted',parentRunId:a.parentRunId,batchSha256:r.batchSha256};}
    if(!oldState(state,r))fail('OVERSEAS_SCHEDULED_STATE_CHANGED');
    if(!certifiedContext)for(const b of r.batch.admissions){const cursors=await rows(c,"SELECT MAX(last_item_at) AS last_successful_cursor FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND status='completed' AND last_item_at IS NOT NULL AND task_key LIKE ?",[b.accountId,b.siteId,`board:${b.boardId}:%`]);
      if(cursors.length!==1||nullable(cursors[0].last_successful_cursor)!==anchor.siteWindows.find(s=>s.siteId===b.siteId).cursor)fail('OVERSEAS_SCHEDULED_CURSOR_CHANGED');}
    await c.query("INSERT INTO po_sync_runs (created_at,requested_at,id,source_id,account_id,parent_run_id,site_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,finished_at,attempts,lease_epoch,lease_owner,lease_until,next_retry_at) VALUES (UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?,?,?,NULL,NULL,'queued','incremental',?,?,?,?,?,NULL,NULL,0,0,NULL,NULL,NULL)",[a.parentRunId,a.sourceId,a.accountId,a.parentTriggerType,db(a.scheduledAt),db(r.batch.parentWindowStart),db(r.batch.parentWindowEnd),a.scheduleVersion]);
    for(const b of r.batch.admissions){await c.query("INSERT INTO po_sync_runs (created_at,requested_at,id,source_id,account_id,parent_run_id,site_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,finished_at,attempts,lease_epoch,lease_owner,lease_until,next_retry_at) VALUES (UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?,?,?,?,?,'queued','incremental','scheduled_site',NULL,?,?,?,NULL,NULL,0,0,NULL,NULL,NULL)",[b.runId,b.sourceId,b.accountId,b.parentRunId,b.siteId,db(b.windowStart),db(b.windowEnd),b.scheduleVersion]);
      await c.query("INSERT INTO po_overseas_stage_manifests (run_id,receipt_id,scope_sha256,manifest_sha256,schema_snapshot,schema_sha256,expected_set_sha256,coverage_status,created_epoch,updated_epoch,admission_json,admission_sha256) VALUES (?,?,?,?,'[]',?,?,'admitted',0,0,?,?)",[b.runId,r.batchSha256,sha(canonical(scope(b))),b.manifestSha256,empty,empty,canonical(b),scheduledAdmissionHash(b)]);}
    const [changed]=await c.query("UPDATE po_source_schedule_state SET lease_run_id=?,lease_owner=?,lease_epoch=lease_epoch+1,lease_until=?,last_scheduled_at=?,next_scheduled_at=? WHERE source_id=? AND schedule_version=? AND lease_epoch=? AND effective_at=? AND last_scheduled_at<=>? AND next_scheduled_at=? AND next_scheduled_at<=UTC_TIMESTAMP(3) AND lease_run_id IS NULL AND lease_owner IS NULL AND lease_until IS NULL",[a.parentRunId,r.ownerId,db(r.leaseUntil),db(a.scheduledAt),db(r.nextSlotAt),a.sourceId,a.scheduleVersion,r.expectedState.leaseEpoch,db(r.expectedState.effectiveAt),r.expectedState.lastScheduledAt==null?null:db(r.expectedState.lastScheduledAt),db(r.expectedState.nextScheduledAt)]);
    if(Number(changed.affectedRows)!==1)fail('OVERSEAS_SCHEDULED_STATE_CHANGED');const created=await readBatch(c,r,true);if(created.status!=='present')fail('OVERSEAS_SCHEDULED_ADMISSION_CONFLICT');await pristine(c,created);
    const final=await rows(c,'SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[a.sourceId]);if(final.length!==1||!committedState(final[0],r))fail('OVERSEAS_SCHEDULED_STATE_CHANGED');return {status:'admitted',parentRunId:a.parentRunId,batchSha256:r.batchSha256};},false,Boolean(certifiedContext));}
  async function reconcile(input){const r=requestOf(input),a=r.batch.admissions[0];return transaction(async c=>{const found=await readBatch(c,r),states=await rows(c,'SELECT * FROM po_source_schedule_state WHERE source_id=?',[a.sourceId]);
    const advisory={automaticWriteAllowed:false,automaticClaimAllowed:false,productionActivationAllowed:false};
    if(states.length!==1||found.status==='conflict')return {status:'unknown',...advisory};
    if(found.status==='absent'&&oldState(states[0],r))return {status:'not_committed',...advisory};
    if(found.status==='present'&&committedState(states[0],r))return {status:'accepted',parentRunId:a.parentRunId,batchSha256:r.batchSha256,...advisory};return {status:'unknown',...advisory};},true);}
  const queued=row=>row&&row.status==='queued'&&row.lease_epoch!==null&&Number(row.lease_epoch)===0&&row.attempts!==null&&Number(row.attempts)===0
    &&[row.lease_owner,row.lease_until,row.started_at,row.finished_at,row.next_retry_at].every(v=>v===null);
  const parentRunning=(row,r)=>row&&row.status==='running'&&Number(row.lease_epoch)===1&&Number(row.attempts)===1&&row.lease_owner===r.ownerId
    &&nullable(row.lease_until)===r.leaseUntil&&row.started_at!==null&&row.finished_at===null&&row.next_retry_at===null;
  async function freshFence(c,r,b,expected,value,{lock=true}={}){
    const contract=require('../../../worker/src/overseasBigPlayerRunContractJournal').contractOf(value);
    if(canonical(contract)!==canonical(expected))fail('OVERSEAS_SCHEDULED_FENCE_UNTRUSTED');
    await isolation.verifyConnection(c);await require('./overseasScheduledSchemaGuard').verifyScheduledIsolationSchema(c);
    const [[tx]]=await c.query('SELECT @@in_transaction AS active');if(Number(tx?.active)!==1)fail('OVERSEAS_SCHEDULED_FENCE_TRANSACTION_REQUIRED');
    const suffix=lock?' FOR UPDATE':'',ids=[b.parentRunId,b.runId].sort();
    const runs=await rows(c,'SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id IN (?,?) ORDER BY id'+suffix,ids);
    const parent=runs.find(x=>x.id===b.parentRunId),child=runs.find(x=>x.id===b.runId);
    try{assertScheduledRunPair(b,{parent,child});}catch{fail('OVERSEAS_SCHEDULED_FENCE_LOST');}
    if(runs.length!==2||!parentRunning(parent,r)||Number(parent.live)!==1||nullable(parent.window_start)!==r.batch.parentWindowStart||nullable(parent.window_end)!==r.batch.parentWindowEnd
      ||child.status!=='running'||child.lease_owner!==contract.leaseOwner||Number(child.lease_epoch)!==1||Number(child.attempts)!==1||Number(child.live)!==1
      ||child.started_at===null||child.finished_at!==null||child.next_retry_at!==null||nullable(child.lease_until)>r.leaseUntil)fail('OVERSEAS_SCHEDULED_FENCE_LOST');
    const {config}=await currentSource(c,r,lock);
    const states=await rows(c,'SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=?'+suffix,[b.sourceId]);
    if(states.length!==1||!committedState(states[0],r)||Number(states[0].live)!==1)fail('OVERSEAS_SCHEDULED_FENCE_LOST');
    await identity(c,r,config,lock);
    const ms=await rows(c,'SELECT * FROM po_overseas_stage_manifests WHERE run_id=?'+suffix,[b.runId]),m=ms[0];
    if(ms.length!==1||m.receipt_id!==r.batchSha256||m.scope_sha256!==sha(canonical(scope(b)))||m.manifest_sha256!==b.manifestSha256
      ||m.admission_json!==canonical(b)||m.admission_sha256!==scheduledAdmissionHash(b)||Number(m.created_epoch)!==1||Number(m.updated_epoch)!==1||!['open','sealed','partial'].includes(m.coverage_status))fail('OVERSEAS_SCHEDULED_FENCE_LOST');
    return contract;
  }
  async function parentAggregateFence(c,r){
    await isolation.verifyConnection(c);await require('./overseasScheduledSchemaGuard').verifyScheduledIsolationSchema(c);
    const [[tx]]=await c.query('SELECT @@in_transaction AS active');if(Number(tx?.active)!==1)fail('OVERSEAS_SCHEDULED_FENCE_TRANSACTION_REQUIRED');
    const a=r.batch.admissions[0],ids=[a.parentRunId,...r.batch.admissions.map(x=>x.runId)].sort();
    const runs=await rows(c,`SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,ids);
    const siblings=await rows(c,'SELECT id FROM po_sync_runs WHERE parent_run_id=? ORDER BY id LIMIT 101 FOR UPDATE',[a.parentRunId]);
    if(runs.length!==ids.length||siblings.length!==r.batch.admissions.length||siblings.some(x=>!ids.includes(x.id)))fail('OVERSEAS_SCHEDULED_PARENT_SET_CHANGED');
    const parent=runs.find(x=>x.id===a.parentRunId);
    if(!parentRunning(parent,r)||Number(parent.live)!==1||nullable(parent.window_start)!==r.batch.parentWindowStart||nullable(parent.window_end)!==r.batch.parentWindowEnd)fail('OVERSEAS_SCHEDULED_PARENT_FENCE_LOST');
    const {config}=await currentSource(c,r);
    const states=await rows(c,'SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[a.sourceId]);
    if(states.length!==1||!committedState(states[0],r)||Number(states[0].live)!==1)fail('OVERSEAS_SCHEDULED_PARENT_FENCE_LOST');
    await identity(c,r,config);
    const found=await readBatch(c,r,true);if(found.status!=='present')fail('OVERSEAS_SCHEDULED_PARENT_SET_CHANGED');
    return found;
  }
  async function terminalFence(c,r,b,expected,value){
    const contract=require('../../../worker/src/overseasBigPlayerRunContractJournal').contractOf(value);
    if(canonical(contract)!==canonical(expected))fail('OVERSEAS_SCHEDULED_FENCE_UNTRUSTED');
    await isolation.verifyConnection(c);await require('./overseasScheduledSchemaGuard').verifyScheduledIsolationSchema(c);
    const [[tx]]=await c.query('SELECT @@in_transaction AS active');if(Number(tx?.active)!==1)fail('OVERSEAS_SCHEDULED_FENCE_TRANSACTION_REQUIRED');
    const runs=await rows(c,'SELECT * FROM po_sync_runs WHERE id IN (?,?) ORDER BY id',[b.parentRunId,b.runId]);
    const parent=runs.find(x=>x.id===b.parentRunId),child=runs.find(x=>x.id===b.runId);
    try{assertScheduledRunPair(b,{parent,child});}catch{fail('OVERSEAS_SCHEDULED_TERMINAL_UNPROVEN');}
    if(runs.length!==2||nullable(parent.window_start)!==r.batch.parentWindowStart||nullable(parent.window_end)!==r.batch.parentWindowEnd
      ||!['completed_full','completed_authorized_scope','partial','failed','awaiting_manual_verification'].includes(child.status)||Number(child.lease_epoch)!==1||Number(child.attempts)!==1
      ||child.started_at===null||child.finished_at===null||child.lease_owner!==null||child.lease_until!==null||child.next_retry_at!==null)fail('OVERSEAS_SCHEDULED_TERMINAL_UNPROVEN');
    const ms=await rows(c,'SELECT * FROM po_overseas_stage_manifests WHERE run_id=?',[b.runId]),m=ms[0];
    if(ms.length!==1||m.receipt_id!==r.batchSha256||m.scope_sha256!==sha(canonical(scope(b)))||m.manifest_sha256!==b.manifestSha256||m.admission_json!==canonical(b)
      ||m.admission_sha256!==scheduledAdmissionHash(b)||Number(m.created_epoch)!==1||Number(m.updated_epoch)!==1||!['open','sealed','partial'].includes(m.coverage_status))fail('OVERSEAS_SCHEDULED_TERMINAL_UNPROVEN');
    // Immutable historical evidence only. Never grants new claim or mutation.
    return contract;
  }
  async function inspectFirstClaim({requestJournal,record,runId,journal}={}){
    const input=require('../../../worker/src/overseasScheduledRequestJournal').scheduledRequestEvidence(record,requestJournal);
    const r=requestOf(input),b=r.batch.admissions.find(a=>a.runId===runId);
    const advisory={automaticWriteAllowed:false,automaticClaimAllowed:false,productionActivationAllowed:false};
    if(!b||!require('../../../worker/src/overseasBigPlayerRunContractJournal').isTrustedRunContractJournal(journal))
      fail('OVERSEAS_SCHEDULED_INSPECTION_INVALID');
    return transaction(async c=>{
      const found=await readBatch(c,r),states=await rows(c,'SELECT * FROM po_source_schedule_state WHERE source_id=?',[b.sourceId]);
      if(found.status!=='present'||states.length!==1||!committedState(states[0],r))return {status:'unknown',...advisory};
      const child=found.children.find(x=>x.id===b.runId);
      if(queued(child)){
        // A queued child is only an inspection result when the complete
        // admitted batch is still pristine.  Do not infer "not claimed" from
        // one child while another child/manifest/task has progressed.
        try{
          if(!queued(found.parent)||found.children.length!==r.batch.admissions.length
            ||found.children.some(row=>!queued(row)))
            return {status:'unknown',diagnostic:'scheduled_admission_pristine_conflict',...advisory};
          await pristine(c,found,{lock:false});
        }catch(error){
          if(error?.code==='OVERSEAS_SCHEDULED_ADMISSION_CONFLICT')
            return {status:'unknown',diagnostic:'scheduled_admission_pristine_conflict',...advisory};
          throw error;
        }
        return {status:'not_claimed',...advisory};
      }
      if(!child||child.status!=='running'||Number(child.lease_epoch)!==1||Number(child.attempts)!==1
        ||typeof child.lease_owner!=='string'||child.started_at===null||child.finished_at!==null||child.next_retry_at!==null)
        return {status:'manual_review',...advisory};
      let saved;try{saved=await journal.recover({runId,leaseEpoch:1});}
      catch(e){if(e.code==='OVERSEAS_CONTRACT_EVIDENCE_MISSING')return {status:'claimed_without_journal',...advisory};throw e;}
      const contract=saved.contract;
      if(canonical(Object.fromEntries(Object.entries(contract).filter(([k])=>!['leaseOwner','leaseEpoch'].includes(k))))!==canonical(scope(b))
        ||contract.leaseEpoch!==1||contract.leaseOwner!==child.lease_owner)return {status:'unknown',...advisory};
      try{await freshFence(c,r,b,contract,contract,{lock:false});}
      catch(e){if(['OVERSEAS_SCHEDULED_FENCE_LOST','OVERSEAS_SCHEDULED_STATE_CHANGED','OVERSEAS_SCHEDULED_SOURCE_CHANGED'].includes(e.code))return {status:'manual_review',...advisory};throw e;}
      if(canonical(saved.contract)!==canonical(contract))return {status:'unknown',...advisory};
      return {status:'claimed_journal_verified',runId,contractSha256:saved.contractSha256,...advisory};
    },true);
  }
  async function reconcileFirstClaimIntent({requestJournal,record,intent}={}){
    const input=require('../../../worker/src/overseasScheduledRequestJournal').scheduledFirstIntentEvidence(intent,{requestJournal,record});
    const r=requestOf(input),b=r.batch.admissions.find(a=>a.runId===intent.runId);
    const advisory={automaticWriteAllowed:false,automaticClaimAllowed:false,productionActivationAllowed:false};
    return transaction(async c=>{
      const found=await readBatch(c,r),states=await rows(c,'SELECT * FROM po_source_schedule_state WHERE source_id=?',[b.sourceId]);
      if(found.status!=='present'||states.length!==1||!committedState(states[0],r))return {status:'unknown',...advisory};
      const child=found.children.find(x=>x.id===b.runId),m=found.manifests.find(x=>x.run_id===b.runId);
      if(queued(child)&&m.coverage_status==='admitted'&&Number(m.created_epoch)===0&&Number(m.updated_epoch)===0){
        const tasks=await rows(c,'SELECT task_identity_sha256 FROM po_overseas_expected_tasks WHERE run_id=? LIMIT 1',[b.runId]);
        return {status:tasks.length?'unknown':'not_committed',...advisory};
      }
      if(!child||child.lease_owner!==intent.nextOwner||Number(child.lease_epoch)!==1||Number(child.attempts)!==1)
        return {status:'unknown',...advisory};
      const expected=require('../../../worker/src/overseasBigPlayerRunContractJournal').contractOf({...scope(b),leaseOwner:intent.nextOwner,leaseEpoch:1});
      try{await freshFence(c,r,b,expected,expected,{lock:false});}
      catch(e){if(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST')return {status:'manual_review',...advisory};throw e;}
      // Known durable owner tuple resolves commit ambiguity only. It is not
      // registered as a write capability or a replacement for claim Journal.
      return {status:'committed_verified',intentId:intent.intentId,runId:b.runId,...advisory};
    },true);
  }
  async function firstClaim(input,{runId,leaseOwner,leaseSeconds=300,requestJournal,record,intent}={}){
    const r=requestOf(input),b=r.batch.admissions.find(a=>a.runId===runId);
    if(!b||!/^[A-Za-z0-9._:-]{1,120}$/.test(leaseOwner||'')||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_INVALID');
    let owner=`${leaseOwner}:${crypto.randomUUID()}`;
    if(intent!==undefined){
      const original=require('../../../worker/src/overseasScheduledRequestJournal').scheduledFirstIntentEvidence(intent,{requestJournal,record});
      if(canonical(requestOf(original))!==canonical(r)||intent.runId!==runId||intent.leaseSeconds!==leaseSeconds)fail('OVERSEAS_SCHEDULED_FIRST_INTENT_CONFLICT');
      owner=intent.nextOwner;
    }
    const result=await transaction(async c=>{
      const ids=[b.parentRunId,...r.batch.admissions.map(a=>a.runId)].sort();
      const known=await rows(c,`SELECT id FROM po_sync_runs WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,ids);
      if(known.length!==ids.length)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      const children=await rows(c,'SELECT id FROM po_sync_runs WHERE parent_run_id=? ORDER BY id LIMIT 101 FOR UPDATE',[b.parentRunId]);
      const parents=await rows(c,'SELECT id FROM po_sync_runs WHERE source_id=? AND scheduled_at=? LIMIT 2 FOR UPDATE',[b.sourceId,db(b.scheduledAt)]);
      if(children.length!==r.batch.admissions.length||children.some(x=>!ids.includes(x.id))||parents.length!==1||parents[0].id!==b.parentRunId)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      const {config}=await currentSource(c,r);
      const states=await rows(c,"SELECT *,DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS db_now FROM po_source_schedule_state WHERE source_id=? FOR UPDATE",[b.sourceId]);
      if(states.length!==1||!committedState(states[0],r))fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_FENCE');
      const now=iso(String(states[0].db_now).replace(/(\.\d{3})000$/,'$1'));
      if(r.leaseUntil<=now)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_FENCE');
      const until=new Date(Math.min(Date.parse(now)+leaseSeconds*1000,Date.parse(r.leaseUntil))).toISOString();
      await identity(c,r,config);const found=await readBatch(c,r,true);
      if(found.status!=='present'||!queued(found.children.find(x=>x.id===b.runId))||(!queued(found.parent)&&!parentRunning(found.parent,r)))fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      await pristine(c,{parent:found.children.find(x=>x.id===b.runId),children:[],manifests:[found.manifests.find(x=>x.run_id===b.runId)]});
      if(queued(found.parent)){
        const [changed]=await c.query("UPDATE po_sync_runs SET status='running',started_at=?,attempts=1,lease_owner=?,lease_epoch=1,lease_until=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued' AND attempts=0 AND lease_epoch=0 AND lease_owner IS NULL AND lease_until IS NULL AND started_at IS NULL AND finished_at IS NULL AND next_retry_at IS NULL",[db(now),r.ownerId,db(r.leaseUntil),b.parentRunId]);
        if(Number(changed.affectedRows)!==1)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      }
      const [changed]=await c.query("UPDATE po_sync_runs SET status='running',started_at=?,attempts=1,lease_owner=?,lease_epoch=1,lease_until=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='queued' AND attempts=0 AND lease_epoch=0 AND lease_owner IS NULL AND lease_until IS NULL AND started_at IS NULL AND finished_at IS NULL AND next_retry_at IS NULL",[db(now),owner,db(until),b.runId]);
      if(Number(changed.affectedRows)!==1)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      const [opened]=await c.query("UPDATE po_overseas_stage_manifests SET coverage_status='open',created_epoch=1,updated_epoch=1,updated_at=UTC_TIMESTAMP(3) WHERE run_id=? AND admission_sha256=? AND coverage_status='admitted' AND created_epoch=0 AND updated_epoch=0",[b.runId,scheduledAdmissionHash(b)]);
      if(Number(opened.affectedRows)!==1)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      const final=await readBatch(c,r,true),run=final.children?.find(x=>x.id===b.runId),m=final.manifests?.find(x=>x.run_id===b.runId);
      if(final.status!=='present'||!parentRunning(final.parent,r)||!run||run.status!=='running'||run.lease_owner!==owner||Number(run.lease_epoch)!==1||Number(run.attempts)!==1
        ||nullable(run.lease_until)!==until||!m||m.coverage_status!=='open'||Number(m.created_epoch)!==1||Number(m.updated_epoch)!==1)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT');
      return {run,contract:require('../../../worker/src/overseasBigPlayerRunContractJournal').contractOf({...scope(b),leaseOwner:owner,leaseEpoch:1})};
    });
    // COMMIT-unknown publishes no proof. This capability is not restart evidence.
    const proof=Object.freeze({format:'overseas-scheduled-first-claim-v1',contract:result.contract,batchSha256:r.batchSha256,productionActivationAllowed:false});
    claims.set(proof,Object.freeze({repo,isolation,request:r,admission:b,
      parentAggregateFence:conn=>parentAggregateFence(conn,r),
      fence:(conn,value,options)=>freshFence(conn,r,b,proof.contract,value,options),
      terminalFence:(conn,value)=>terminalFence(conn,r,b,proof.contract,value),
      verify:value=>transaction(conn=>freshFence(conn,r,b,proof.contract,value,{lock:false}),true)}));return Object.freeze({run:result.run,proof});
  }
  const store=Object.freeze({admit,reconcile,firstClaim,inspectFirstClaim,reconcileFirstClaimIntent,productionActivationAllowed:false});brands.set(store,repo);return store;
}
function assertScheduledAdmissionStore(store,repo){if(!brands.has(store)||brands.get(store)!==repo)fail('OVERSEAS_SCHEDULED_STORE_UNTRUSTED');return store;}
function scheduledFirstClaimContext(proof,repo){const context=claims.get(proof);if(!context||context.repo!==repo)fail('OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED');return context;}
module.exports={createOverseasScheduledAdmissionStore,assertScheduledAdmissionStore,requestOf,scheduledFirstClaimContext};
