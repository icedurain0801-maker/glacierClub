'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {iso}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const {scheduledParentId,scheduledChildId}=require('../worker/src/overseasScheduledBatch');
const {createCertifiedFixtureTimeAnchorReader}=require('../worker/src/overseasScheduledTimeAnchor');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex'),nullable=v=>v==null?null:iso(v);
async function checkNextSlot({repo,control,target,cursorReader,store,request,result,journal,executeNext=false}){
  const ad=request.batch.admissions[0],fields=['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'],checks=[];
  const directory=require('../server/src/db/overseasScheduledIsolatedTarget').scheduledIsolationContext(target,repo).owned;
  const tracePath=path.join(directory,'next-slot-trace.jsonl');
  const record=v=>{fs.appendFileSync(tracePath,JSON.stringify(v)+'\n',{flag:'a'});process.stdout.write(JSON.stringify({nextSlotProgress:v})+'\n');};
  const tables=['po_sync_runs','po_source_schedule_state','po_sources','po_fixture_success_cursors','po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_checkpoints','po_sync_run_contents','po_contents','po_content_feed_memberships','po_collection_runs','po_audit_events'];
  const snapshot=async()=>canonical(await Promise.all(tables.map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1,2`))));
  async function clock(){await target.verifyConnection(control);const [[r]]=await control.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS now,@@in_transaction AS active");assert(Number(r.active)===0,'NEXT_SLOT_WAIT_OPEN_TRANSACTION');return iso(String(r.now).replace(/(\.\d{3})000$/,'$1'));}
  async function configEvidence(){await target.verifyConnection(control);const [[r]]=await control.query('SELECT config,frequency_seconds,schedule_version,schedule_effective_at FROM po_sources WHERE id=?',[ad.sourceId]);const config=typeof r.config==='string'?JSON.parse(r.config):r.config;return {configSha256:hash(canonical(config)),frequencySeconds:Number(r.frequency_seconds),scheduleVersion:Number(r.schedule_version),effectiveAt:iso(r.schedule_effective_at)};}
  async function readEvidence(scope){const c=await repo.pool.getConnection();try{await target.verifyConnection(c);await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION READ ONLY');return await cursorReader.readInTransaction(c,scope);}finally{await c.rollback();c.release();}}
  const configuration=await configEvidence();assert(configuration.frequencySeconds===3600&&configuration.configSha256===ad.configSha256,'NEXT_SLOT_CONFIGURATION_NOT_ORIGINAL');
  assert(result.status==='completed_authorized_scope'&&result.discovered===2&&result.stored===2,'NEXT_SLOT_FIRST_PARENT_NOT_NONEMPTY');
  const scopes=request.batch.admissions.map(a=>Object.freeze(Object.fromEntries(fields.map(k=>[k,a[k]])))),evidence=[];
  for(const [i,s] of scopes.entries()){const e=await readEvidence(s);assert(e&&e.cursorAt===request.batch.admissions[i].windowEnd&&e.parentRunId===ad.parentRunId,'NEXT_SLOT_FIRST_CURSOR_INVALID');evidence.push(e);}
  const memberships=await repo.query(`SELECT m.* FROM po_content_feed_memberships m JOIN po_sync_run_contents rc ON rc.content_id=m.content_id WHERE rc.run_id IN (${request.batch.admissions.map(()=>'?').join(',')}) AND rc.sync_scope='posts' ORDER BY m.id`,request.batch.admissions.map(a=>a.runId));assert(memberships.length===2,'NEXT_SLOT_MEMBERSHIP_REQUIRED');
  const started=performance.now(),clockBeforeWait=await clock();let clockAtBoundary=clockBeforeWait,polls=1;
  record({phase:'waiting',dbNow:clockAtBoundary,nextSlotAt:request.nextSlotAt,configuration,firstParentResult:result,firstCertifiedEvidence:evidence});
  while(clockAtBoundary<request.nextSlotAt){
    assert(performance.now()-started<3720000,'NEXT_SLOT_WAIT_TIMEOUT');assert(canonical(await configEvidence())===canonical(configuration),'NEXT_SLOT_CONFIG_CHANGED_DURING_WAIT');
    await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(50,Date.parse(request.nextSlotAt)-Date.parse(clockAtBoundary)))));
    clockAtBoundary=await clock();polls++;record({phase:clockAtBoundary>=request.nextSlotAt?'boundary':'waiting',dbNow:clockAtBoundary,nextSlotAt:request.nextSlotAt,polls});
  }
  const anchor=await createCertifiedFixtureTimeAnchorReader({repo,isolation:target,cursorReader})({sourceId:ad.sourceId});
  assert(anchor.scheduledAt===request.nextSlotAt&&anchor.anchorAt>=request.nextSlotAt,'NEXT_SLOT_BOUNDARY_SKIPPED');
  for(const [i,a] of request.batch.admissions.entries()){const site=anchor.siteWindows.find(s=>s.siteId===a.siteId);assert(site&&site.cursor===evidence[i].cursorAt&&site.windowStart===evidence[i].cursorAt&&site.windowEnd===anchor.parentWindowEnd,'NEXT_SLOT_CERTIFIED_WINDOW_INVALID');}
  const [state]=await repo.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[ad.sourceId]);assert(state&&state.lease_run_id===null&&state.lease_owner===null&&state.lease_until===null&&Number(state.lease_epoch)===request.expectedState.leaseEpoch+1&&iso(state.last_scheduled_at)===ad.scheduledAt&&iso(state.next_scheduled_at)===anchor.scheduledAt,'NEXT_SLOT_PREVIOUS_STATE_INVALID');
  const base={...ad,parentTriggerType:anchor.parentTriggerType,scheduledAt:anchor.scheduledAt,windowStart:anchor.parentWindowStart,windowEnd:anchor.parentWindowEnd},parentRunId=scheduledParentId(base);assert(parentRunId!==ad.parentRunId,'NEXT_SLOT_REUSED_PARENT');
  const nextRequest={batch:{format:'overseas-scheduled-batch-v1',parentWindowStart:anchor.parentWindowStart,parentWindowEnd:anchor.parentWindowEnd,admissions:request.batch.admissions.map(old=>{const site=anchor.siteWindows.find(s=>s.siteId===old.siteId);return {...old,parentRunId,runId:scheduledChildId(parentRunId,old.siteId),parentTriggerType:anchor.parentTriggerType,scheduledAt:anchor.scheduledAt,windowStart:site.windowStart,windowEnd:site.windowEnd};})},expectedState:{scheduleVersion:Number(state.schedule_version),leaseEpoch:Number(state.lease_epoch),leaseRunId:state.lease_run_id,leaseOwner:state.lease_owner,leaseUntil:state.lease_until,effectiveAt:iso(state.effective_at),lastScanAt:nullable(state.last_scan_at),lastScheduledAt:nullable(state.last_scheduled_at),nextScheduledAt:iso(state.next_scheduled_at)},ownerId:'isolated-next-slot',nextSlotAt:anchor.nextSlotAt,leaseUntil:new Date(Date.parse(anchor.anchorAt)+600000).toISOString()};
  const clean=await snapshot(),negativeEvidence=[];
  async function negative(sql,params,restore,restoreParams,label,errorCode){await target.verifyConnection(control);await control.query(sql,params);const drift=await snapshot();let actual;
    try{try{await store.admit(nextRequest,anchor);assert(false,'NEXT_SLOT_DRIFT_ADMITTED');}catch(e){assert(e.code===errorCode,`${label}_WRONG_ERROR_${e.code||e.message}`);actual=e.code;}assert(await snapshot()===drift,`${label}_ADMISSION_WROTE`);}finally{await control.query(restore,restoreParams);}
    assert(await snapshot()===clean,`${label}_RESTORE_CHANGED`);for(const [i,s] of scopes.entries())assert(canonical(await readEvidence(s))===canonical(evidence[i]),`${label}_RESTORED_CERTIFICATION_CHANGED`);
    negativeEvidence.push({label,errorCode:actual,admissionZeroWrites:true,restored:true});checks.push(label);record({phase:'negative_pass',label,errorCode:actual});
  }
  const [cursor]=await repo.query('SELECT * FROM po_fixture_success_cursors WHERE child_run_id=?',[ad.runId]);
  await negative('UPDATE po_fixture_success_cursors SET parent_run_id=? WHERE scope_sha=?',[crypto.randomUUID(),cursor.scope_sha],'UPDATE po_fixture_success_cursors SET parent_run_id=? WHERE scope_sha=?',[cursor.parent_run_id,cursor.scope_sha],'same_time_cursor_parent_drift','OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED');
  await negative('UPDATE po_fixture_success_cursors SET evidence_sha=? WHERE scope_sha=?',['f'.repeat(64),cursor.scope_sha],'UPDATE po_fixture_success_cursors SET evidence_sha=? WHERE scope_sha=?',[cursor.evidence_sha,cursor.scope_sha],'same_time_cursor_evidence_drift','OVERSEAS_CERTIFIED_CURSOR_UNPROVEN');
  const [parent]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[ad.parentRunId]);
  await negative('UPDATE po_sync_runs SET finished_at=? WHERE id=?',['2026-01-01 00:00:00.000',parent.id],'UPDATE po_sync_runs SET finished_at=? WHERE id=?',[parent.finished_at,parent.id],'parent_finished_after_anchor','OVERSEAS_CERTIFIED_CURSOR_ACK_EVIDENCE_CHANGED');
  const [child]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[ad.runId]);
  await negative('UPDATE po_sync_runs SET stored_count=stored_count+1 WHERE id=?',[child.id],'UPDATE po_sync_runs SET stored_count=? WHERE id=?',[child.stored_count,child.id],'child_counter_after_anchor','OVERSEAS_PARENT_CHILD_UNPROVEN');
  const [event]=await repo.query("SELECT * FROM po_audit_events WHERE source_id=? AND event_type='overseas_isolated_parent_terminal'",[ad.sourceId]),detail=JSON.parse(event.detail);
  await negative('UPDATE po_audit_events SET detail=? WHERE id=?',[canonical({...detail,evidenceSha:'f'.repeat(64)}),event.id],'UPDATE po_audit_events SET detail=? WHERE id=?',[event.detail,event.id],'parent_event_after_anchor','OVERSEAS_CERTIFIED_CURSOR_EVENT_UNPROVEN');
  const member=memberships[0];await negative('UPDATE po_content_feed_memberships SET first_seen_at=? WHERE id=?',['2026-01-01 00:00:00.000',member.id],'UPDATE po_content_feed_memberships SET first_seen_at=? WHERE id=?',[member.first_seen_at,member.id],'membership_row_after_anchor','OVERSEAS_CERTIFIED_CURSOR_ACK_EVIDENCE_CHANGED');
  const beforeAdmitClock=await clock(),admitted=await store.admit(nextRequest,anchor);assert(admitted.status==='admitted'&&admitted.parentRunId===parentRunId,'NEXT_SLOT_ADMISSION_FAILED');
  const [nextState]=await repo.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[ad.sourceId]),runs=await repo.query('SELECT * FROM po_sync_runs WHERE id=? OR parent_run_id=? ORDER BY id',[parentRunId,parentRunId]),manifests=await repo.query(`SELECT * FROM po_overseas_stage_manifests WHERE run_id IN (${nextRequest.batch.admissions.map(()=>'?').join(',')}) ORDER BY run_id`,nextRequest.batch.admissions.map(a=>a.runId));
  assert(Number(nextState.lease_epoch)===nextRequest.expectedState.leaseEpoch+1&&nextState.lease_run_id===parentRunId&&nextState.lease_owner===nextRequest.ownerId&&iso(nextState.last_scheduled_at)===anchor.scheduledAt&&iso(nextState.next_scheduled_at)===anchor.nextSlotAt&&runs.length===3&&runs.every(r=>r.status==='queued'&&Number(r.lease_epoch)===0)&&manifests.length===2&&manifests.every(m=>m.coverage_status==='admitted'),'NEXT_SLOT_ATOMIC_ROWS_INVALID');
  for(const a of nextRequest.batch.admissions){const r=runs.find(x=>x.id===a.runId);assert(r&&r.site_id===a.siteId&&iso(r.window_start)===a.windowStart&&iso(r.window_end)===a.windowEnd,'NEXT_SLOT_CHILD_WINDOW_INVALID');}
  for(const [i,s] of scopes.entries())assert(canonical(await readEvidence(s))===canonical(evidence[i]),'NEXT_SLOT_PRIOR_CERTIFICATION_CHANGED');assert(canonical(await configEvidence())===canonical(configuration),'NEXT_SLOT_CONFIGURATION_CHANGED');
  record({phase:'admitted',dbNow:beforeAdmitClock,nextAnchor:anchor,nextAdmission:admitted});
  const admissionResult={status:'PASS_ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION',checks:[...checks,'actual_db_clock_crosses_original_3600_next_slot','same_reader_nonnull_certified_anchor','normal_next_slot_atomic_admission'],firstParentResult:result,firstConfiguration:configuration,firstScheduledAt:ad.scheduledAt,expectedNextSlotAt:request.nextSlotAt,clockBeforeWait,clockAtBoundary,beforeAdmitClock,observedClockPolls:polls,waitElapsedMs:performance.now()-started,firstCertifiedEvidence:evidence,nextAnchor:anchor,nextRequest,nextAdmission:admitted,negativeEvidence,tracePath,traceSha256:hash(fs.readFileSync(tracePath)),realNextSlotAdmissionVerified:true,realNextSlotExecuted:false,nextSlotChildrenClaimed:false,nextSlotCollectionCompleted:false,frequencyChanged:false,databaseClockChanged:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  if(!executeNext)return admissionResult;
  const execution=await require('./overseas-isolated-next-slot-execution').runNextSlotExecution({repo,control,target,store,cursorReader,journal,previousRequest:request,request:nextRequest,record});
  return {...admissionResult,status:execution.status,execution,nextSlotChildrenClaimed:true,nextSlotCollectionCompleted:true,realNextSlotExecutedSynthetic:true,realNextSlotExecuted:false,traceSha256:hash(fs.readFileSync(tracePath))};
}
module.exports={checkNextSlot};
