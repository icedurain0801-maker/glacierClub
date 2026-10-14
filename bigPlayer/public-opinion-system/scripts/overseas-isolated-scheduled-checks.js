'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createScheduledIsolatedTarget}=require('../server/src/db/overseasScheduledIsolatedTarget');
const {createOverseasScheduledAdmissionStore}=require('../server/src/db/overseasScheduledAdmissionStore');
const {createScheduledTimeAnchorReader}=require('../worker/src/overseasScheduledTimeAnchor');
const {scheduledParentId,scheduledChildId}=require('../worker/src/overseasScheduledBatch');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
async function checkScheduledAdmission({repo,control,root,directory,serverPid,sourceId,accountId,gameId,communityId,sites,mainchain=false,inspection=false,parentOnly=false,scenario='success'}){
  repo.syncUpsertLockWaitSeconds=3;
  const target=createScheduledIsolatedTarget({repo,repositoryRoot:root,directory,serverPid});await target.verifyConnection(control);
  assert(sites.length===2,'ISOLATED_TWO_SITES_REQUIRED');
  const snapshot=async()=>canonical(await Promise.all(['po_sync_runs','po_source_schedule_state','po_overseas_stage_manifests','po_overseas_expected_tasks','po_contents','po_sync_checkpoints','po_sync_run_contents','po_content_feed_memberships','po_analysis_jobs','po_translation_jobs','po_collection_runs','po_audit_events'].map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1`))));
  const findings=[];
  const before=await repo.query('SELECT COUNT(*) AS total FROM po_sync_runs');
  const certified=['certified-cursor','certified-cursor-ack-unknown','certified-cursor-partial','certified-next-slot','certified-next-slot-execution'].includes(parentOnly);
  let cursorReader;
  if(certified){const parent=require('../server/src/db/overseasScheduledParentStore');for(const sql of parent.statements)await control.query(sql);cursorReader=parent.createCertifiedFixtureCursorReader({repo,isolation:target});}
  const unready=createOverseasScheduledAdmissionStore({repo,isolation:target,...(certified?{cursorReader}:{})});
  // Only identity/schema reads; no arbitrary request can bypass the anchor.
  const [[clock]]=await control.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS now");
  const now=new Date(String(clock.now).replace(' ','T')+'Z'),compute=require('../worker/src/scheduleSlots').computeSchedule;
  const effective=new Date(+now-2*86400000).toISOString();const schedule=compute({now,frequencySeconds:3600,effectiveAt:effective});
  await control.query('ALTER TABLE po_sources ADD schedule_version INT NOT NULL DEFAULT 1,ADD schedule_effective_at DATETIME(3)');
  await control.query('UPDATE po_sources SET frequency_seconds=3600,schedule_effective_at=? WHERE id=?',[effective.replace('T',' ').replace('Z',''),sourceId]);
  await control.query(`CREATE TABLE po_source_schedule_state(source_id CHAR(36) PRIMARY KEY,schedule_version INT,effective_at DATETIME(3),last_scheduled_at DATETIME(3),next_scheduled_at DATETIME(3),last_scan_at DATETIME(3),lease_run_id CHAR(36),lease_owner VARCHAR(160),lease_epoch BIGINT DEFAULT 0,lease_until DATETIME(3),last_status VARCHAR(30),last_reason_code VARCHAR(80)) ENGINE=InnoDB`);
  await control.query('INSERT INTO po_source_schedule_state(source_id,schedule_version,effective_at,next_scheduled_at,lease_epoch) VALUES (?,1,?,?,0)',[sourceId,effective.replace('T',' ').replace('Z',''),schedule.dueSlotAt.replace('T',' ').replace('Z','')]);
  const anchor=await (certified?require('../worker/src/overseasScheduledTimeAnchor').createCertifiedFixtureTimeAnchorReader({repo,isolation:target,cursorReader}):createScheduledTimeAnchorReader({repo}))({sourceId});
  const config={boardId:'100017',siteUrls:sites};const base={format:'overseas-scheduled-admission-v1',sourceId,accountId,gameId,communityId,boardId:'100017',manifestSha256:'a'.repeat(64),configSha256:hash(canonical(config)),parentTriggerType:anchor.parentTriggerType,scheduledAt:anchor.scheduledAt,scheduleVersion:1,windowStart:anchor.parentWindowStart,windowEnd:anchor.parentWindowEnd};
  const requestAt=a=>{const b={...base,parentTriggerType:a.parentTriggerType,scheduledAt:a.scheduledAt,windowStart:a.parentWindowStart,windowEnd:a.parentWindowEnd};const parentRunId=scheduledParentId(b);return {batch:{format:'overseas-scheduled-batch-v1',parentWindowStart:a.parentWindowStart,parentWindowEnd:a.parentWindowEnd,admissions:sites.map(s=>({...b,parentRunId,runId:scheduledChildId(parentRunId,s.siteId),siteId:s.siteId,siteUrl:s.url,siteUrlSha256:hash(s.url),windowStart:a.siteWindows.find(w=>w.siteId===s.siteId).windowStart}))},expectedState:{scheduleVersion:1,leaseEpoch:0,leaseRunId:null,leaseOwner:null,leaseUntil:null,effectiveAt:effective,lastScanAt:a.lastScanAt,lastScheduledAt:null,nextScheduledAt:a.scheduledAt},ownerId:'isolated-scheduled',nextSlotAt:a.nextSlotAt,leaseUntil:new Date(Date.parse(a.anchorAt)+600000).toISOString()};};
  const request=requestAt(anchor);
  const requestDir=path.join(directory,'scheduled-requests');fs.mkdirSync(requestDir);
  const requestModule=require('../worker/src/overseasScheduledRequestJournal');
  const requestJournal=await requestModule.createScheduledRequestJournal({repositoryRoot:root,directory:requestDir});
  const requestRecord=await requestJournal.prepare(request);
  const firstIntent=inspection?await requestJournal.prepareIntent({record:requestRecord,runId:request.batch.admissions[0].runId}):undefined;
  const secondIntent=inspection?await requestJournal.prepareIntent({record:requestRecord,runId:request.batch.admissions[1].runId}):undefined;
  const baseline=await snapshot();
  try{await unready.admit(request,anchor);assert(false,'SCHEMA_GUARD_NOT_TESTED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_SCHEMA_NOT_READY','SCHEMA_GUARD_WRONG_ERROR');}
  assert((await repo.query('SELECT COUNT(*) AS total FROM po_sync_runs'))[0].total===before[0].total,'SCHEMA_GUARD_WROTE');findings.push('schema_before_admission_zero_run_writes');
  assert(await snapshot()===baseline,'SCHEMA_GUARD_STATE_CHANGED');
  await target.verifyConnection(control);
  const [oldChecks]=await control.query("SELECT CONSTRAINT_NAME AS name,CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='po_sync_runs'");
  assert(oldChecks.length===1&&/^[A-Za-z0-9_]+$/.test(oldChecks[0].name),'ISOLATED_OLD_CHECK_UNKNOWN');
  assert(oldChecks[0].clause.includes("'manual'")&&oldChecks[0].clause.includes('scheduled_at'),'ISOLATED_OLD_CHECK_CHANGED');
  await control.query(`ALTER TABLE po_sync_runs DROP CONSTRAINT \`${oldChecks[0].name}\`,ADD schedule_version INT NOT NULL DEFAULT 1`);
  await control.query("ALTER TABLE po_sync_runs MODIFY trigger_type VARCHAR(30) NOT NULL,ADD UNIQUE KEY os_slot(source_id,scheduled_at),ADD UNIQUE KEY os_child(parent_run_id,site_id),ADD CONSTRAINT po_os_sched_trigger CHECK((trigger_type IN ('manual','scheduled_site') AND scheduled_at IS NULL) OR (trigger_type IN ('scheduled','scheduled_catchup') AND scheduled_at IS NOT NULL))");
  // installMainchainSchema already installed the candidate two-table definitions.
  await require('../server/src/db/overseasScheduledSchemaGuard').verifyScheduledIsolationSchema(control);
  const guard=require('../server/src/db/overseasScheduledSchemaGuard').verifyScheduledIsolationSchema;
  const strictCheck="(trigger_type IN ('manual','scheduled_site') AND scheduled_at IS NULL) OR (trigger_type IN ('scheduled','scheduled_catchup') AND scheduled_at IS NOT NULL)";
  for(const clause of ["trigger_type IN ('manual','scheduled','scheduled_catchup','scheduled_site')",`(${strictCheck}) OR 1=1`,"(trigger_type IN ('manual','scheduled_site') AND scheduled_at IS NOT NULL) OR (trigger_type IN ('scheduled','scheduled_catchup') AND scheduled_at IS NULL)"]){
    await target.verifyConnection(control);await control.query(`ALTER TABLE po_sync_runs DROP CONSTRAINT po_os_sched_trigger,ADD CONSTRAINT po_os_sched_trigger CHECK(${clause})`);
    try{await guard(control);assert(false,'WEAK_SCHEMA_GUARD_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_SCHEMA_NOT_READY','WEAK_SCHEMA_GUARD_WRONG_ERROR');}
  }
  await control.query(`ALTER TABLE po_sync_runs DROP CONSTRAINT po_os_sched_trigger,ADD CONSTRAINT po_os_sched_trigger CHECK(${strictCheck})`);
  await control.query('ALTER TABLE po_sync_runs DROP INDEX os_slot,ADD UNIQUE KEY os_slot(source_id(8),scheduled_at)');
  try{await guard(control);assert(false,'PREFIX_UNIQUE_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_SCHEMA_NOT_READY','PREFIX_UNIQUE_WRONG_ERROR');}
  await control.query('ALTER TABLE po_sync_runs DROP INDEX os_slot,ADD UNIQUE KEY os_slot(source_id,scheduled_at),MODIFY scheduled_at DATETIME(0)');
  try{await guard(control);assert(false,'TIME_PRECISION_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_SCHEMA_NOT_READY','TIME_PRECISION_WRONG_ERROR');}
  await control.query('ALTER TABLE po_sync_runs MODIFY scheduled_at DATETIME(3)');await guard(control);findings.push('actual_weak_check_or_true_reverse_null_prefix_unique_and_precision_rejected');
  const second=request.batch.admissions[1].runId;
  const faultRepo=Object.create(repo);faultRepo.pool={getConnection:async()=>{const c=await repo.pool.getConnection();return new Proxy(c,{get(t,k){if(k==='query')return async(sql,params=[])=>{if(sql.startsWith('INSERT INTO po_sync_runs')&&params[0]===second)throw Object.assign(Error('Injected child insert'),{code:'ISOLATED_SECOND_CHILD_FAULT'});return c.query(sql,params);};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});}};
  const faultTarget=createScheduledIsolatedTarget({repo:faultRepo,repositoryRoot:root,directory,serverPid});
  const faultAnchor=await createScheduledTimeAnchorReader({repo:faultRepo})({sourceId});
  const sameRequest=requestAt(faultAnchor);
  const beforeFault=await snapshot();
  try{await createOverseasScheduledAdmissionStore({repo:faultRepo,isolation:faultTarget}).admit(sameRequest,faultAnchor);assert(false,'CHILD_FAULT_NOT_TESTED');}catch(e){assert(e.code==='ISOLATED_SECOND_CHILD_FAULT','CHILD_FAULT_WRONG_ERROR');}
  assert((await repo.query('SELECT COUNT(*) AS total FROM po_sync_runs'))[0].total===before[0].total,'CHILD_FAULT_PARTIAL_RUNS');
  assert((await repo.query('SELECT COUNT(*) AS total FROM po_overseas_stage_manifests'))[0].total===0,'CHILD_FAULT_PARTIAL_MANIFESTS');findings.push('actual_second_child_insert_full_rollback');
  assert(await snapshot()===beforeFault,'CHILD_FAULT_FULL_BASELINE_CHANGED');
  const store=createOverseasScheduledAdmissionStore({repo,isolation:target,...(certified?{cursorReader}:{})});
  if(certified){
    const beforeBinding=await snapshot();
    for(const invalid of [{...cursorReader},null]){
      try{createOverseasScheduledAdmissionStore({repo,isolation:target,cursorReader:invalid});assert(false,'CERTIFIED_READER_COPY_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED','CERTIFIED_READER_COPY_ERROR');}
    }
    const other=require('../server/src/db/overseasScheduledParentStore').createCertifiedFixtureCursorReader({repo,isolation:target});
    try{await createOverseasScheduledAdmissionStore({repo,isolation:target,cursorReader:other}).admit(request,anchor);assert(false,'CERTIFIED_READER_MIX_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_ANCHOR_UNTRUSTED','CERTIFIED_READER_MIX_ERROR');}
    const legacy=createOverseasScheduledAdmissionStore({repo,isolation:target});
    try{await legacy.admit(request,anchor);assert(false,'CERTIFIED_LEGACY_MIX_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_ANCHOR_UNTRUSTED','CERTIFIED_LEGACY_MIX_ERROR');}
    const ad=request.batch.admissions[0],key=hash(canonical(Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId'].map(k=>[k,ad[k]]))));
    await control.query('INSERT INTO po_fixture_success_cursors VALUES (?,?,?,?,?,?)',[key,ad.windowEnd.replace('T',' ').replace('Z',''),ad.parentRunId,'b'.repeat(64),ad.runId,'c'.repeat(64)]);
    const drift=await snapshot();
    try{await store.admit(request,anchor);assert(false,'CERTIFIED_ANCHOR_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED',`CERTIFIED_ANCHOR_DRIFT_ERROR_${e.code||e.message}`);}
    assert(await snapshot()===drift,'CERTIFIED_ANCHOR_DRIFT_WROTE');await control.query('DELETE FROM po_fixture_success_cursors WHERE scope_sha=?',[key]);
    assert(await snapshot()===beforeBinding,'CERTIFIED_BINDING_TEST_WROTE');findings.push('certified_same_reader_bootstrap_and_anchor_drift_zero_write');
  }
  const admitted=await store.admit(request,anchor);assert(admitted.status==='admitted','SCHEDULED_ADMISSION_FAILED');
  assert((await store.reconcile(request)).status==='accepted','SCHEDULED_RECONCILE_FAILED');
  assert((await store.admit(request,anchor)).status==='already_admitted','SCHEDULED_REPLAY_FAILED');findings.push('actual_parent_two_children_admission_and_cas_replay');
  const journalDir=path.join(directory,'scheduled-journal');fs.mkdirSync(journalDir);
  const journal=await require('../worker/src/overseasBigPlayerRunContractJournal').createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
  if(parentOnly)return require('./overseas-isolated-parent-checks').checkParent({repo,control,target,store,request,journal,cursorReader,scenario:parentOnly===true?'success':parentOnly});
  if(inspection){
    const beforeQueued=await snapshot();
    const queuedBefore=await store.inspectFirstClaim({requestJournal,record:requestRecord,runId:request.batch.admissions[1].runId,journal});
    assert(queuedBefore.status==='not_claimed'&&queuedBefore.automaticWriteAllowed===false&&queuedBefore.automaticClaimAllowed===false,'QUEUED_INSPECTION_DISPOSITION_FAILED');
    assert(await snapshot()===beforeQueued,'QUEUED_INSPECTION_CHANGED_DB');
    await repo.query("UPDATE po_overseas_stage_manifests SET expected_count=1 WHERE run_id=?",[request.batch.admissions[1].runId]);
    const beforeDrift=await snapshot();
    const drifted=await store.inspectFirstClaim({requestJournal,record:requestRecord,runId:request.batch.admissions[1].runId,journal});
    assert(drifted.status==='unknown'&&drifted.diagnostic==='scheduled_admission_pristine_conflict'&&drifted.automaticWriteAllowed===false,'QUEUED_INSPECTION_DRIFT_NOT_REJECTED');
    assert(await snapshot()===beforeDrift,'QUEUED_DRIFT_INSPECTION_CHANGED_DB');
    await repo.query("UPDATE po_overseas_stage_manifests SET expected_count=0 WHERE run_id=?",[request.batch.admissions[1].runId]);
    assert(await snapshot()===beforeQueued,'INSPECTION_FIXTURE_NOT_RESTORED');
    findings.push('readonly_queued_claim_inspection_requires_parent_batch_manifest_task_pristine');
  }
  const stateBefore=canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'));
  const claimRepo=Object.create(repo);claimRepo.pool={getConnection:async()=>{const c=await repo.pool.getConnection();return new Proxy(c,{get(t,k){if(k==='query')return async(sql,params=[])=>{if(sql.startsWith('UPDATE po_overseas_stage_manifests SET coverage_status'))throw Object.assign(Error('Injected manifest open'),{code:'ISOLATED_MANIFEST_OPEN_FAULT'});return c.query(sql,params);};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});}};
  const claimTarget=createScheduledIsolatedTarget({repo:claimRepo,repositoryRoot:root,directory,serverPid}),beforeClaimFault=await snapshot();
  try{await createOverseasScheduledAdmissionStore({repo:claimRepo,isolation:claimTarget}).firstClaim(request,{runId:request.batch.admissions[0].runId,leaseOwner:'isolated:fault'});assert(false,'CLAIM_FAULT_NOT_TESTED');}catch(e){assert(e.code==='ISOLATED_MANIFEST_OPEN_FAULT','CLAIM_FAULT_WRONG_ERROR');}
  assert(await snapshot()===beforeClaimFault,'CLAIM_FAULT_PARENT_CHILD_MANIFEST_PARTIAL');findings.push('actual_manifest_open_fault_parent_child_full_rollback');
  const durableFirst=inspection?{requestJournal,record:requestRecord,intent:firstIntent}:{};
  if(inspection)assert((await store.reconcileFirstClaimIntent(durableFirst)).status==='not_committed','INTENT_PRECLAIM_RECONCILE');
  const raced=await Promise.allSettled([store.firstClaim(request,{runId:request.batch.admissions[0].runId,leaseOwner:'isolated:first',...durableFirst}),store.firstClaim(request,{runId:request.batch.admissions[0].runId,leaseOwner:'isolated:race',...durableFirst})]);
  assert(raced.filter(r=>r.status==='fulfilled').length===1&&raced.filter(r=>r.status==='rejected'&&r.reason.code==='OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT').length===1,'FIRST_CLAIM_CONCURRENT_WINNER_FAILED');
  const claim=raced.find(r=>r.status==='fulfilled').value;
  assert(claim.run.status==='running'&&Number(claim.run.lease_epoch)===1&&claim.proof.contract.leaseOwner===claim.run.lease_owner,'SCHEDULED_FIRST_CLAIM_FAILED');
  if(inspection){
    const gateModule=require('../server/src/db/overseasScheduledExecutionGate'),input={repo,isolation:target,contract:claim.proof.contract};
    const beforeGate=await snapshot();let gate,next;
    try{
      gate=await gateModule.acquireOverseasScheduledExecutionGate(input);
      assert(await gateModule.assertOverseasScheduledExecutionGate(gate,input),'EXECUTION_GATE_NOT_HELD');
      try{await gateModule.acquireOverseasScheduledExecutionGate(input);assert(false,'EXECUTION_GATE_DOUBLE_OWNER');}
      catch(e){assert(e.code==='OVERSEAS_SCHEDULED_GATE_BUSY','EXECUTION_GATE_COMPETITOR_ERROR');}
      try{await gateModule.assertOverseasScheduledExecutionGate({...gate},input);assert(false,'EXECUTION_GATE_COPY_ALLOWED');}
      catch(e){assert(e.code==='OVERSEAS_SCHEDULED_GATE_BRAND_INVALID','EXECUTION_GATE_COPY_ERROR');}
      await gate.close();
      try{await gate.verify();assert(false,'EXECUTION_GATE_CLOSED_ALLOWED');}
      catch(e){assert(e.code==='OVERSEAS_SCHEDULED_GATE_CLOSED','EXECUTION_GATE_CLOSED_ERROR');}
      next=await gateModule.acquireOverseasScheduledExecutionGate(input);assert(await next.verify(),'EXECUTION_GATE_REACQUIRE_FAILED');
    }finally{await next?.close();await gate?.close();}
    let timeoutDestroyed=false,timeoutReleased=false;
    const timeoutRepo=Object.create(repo);timeoutRepo.pool={getConnection:async()=>{
      const conn=await repo.pool.getConnection();return new Proxy(conn,{get(t,key){
        if(key==='query')return (sql,params)=>sql.startsWith('SELECT GET_LOCK(')?new Promise(()=>{}):conn.query(sql,params);
        if(key==='destroy')return ()=>{timeoutDestroyed=true;conn.destroy();};
        if(key==='release')return ()=>{timeoutReleased=true;conn.release();};
        const value=Reflect.get(t,key,t);return typeof value==='function'?value.bind(t):value;
      }});
    }};
    const timeoutTarget=createScheduledIsolatedTarget({repo:timeoutRepo,repositoryRoot:root,directory,serverPid});
    try{await gateModule.acquireOverseasScheduledExecutionGate({repo:timeoutRepo,isolation:timeoutTarget,contract:claim.proof.contract});assert(false,'EXECUTION_GATE_TIMEOUT_NOT_TESTED');}
    catch(e){assert(e.code==='OVERSEAS_SCHEDULED_GATE_TIMEOUT','EXECUTION_GATE_TIMEOUT_ERROR');}
    assert(timeoutDestroyed&&!timeoutReleased,'EXECUTION_GATE_TIMEOUT_UNCERTAIN_SESSION_RETURNED');
    assert(await snapshot()===beforeGate,'EXECUTION_GATE_BUSINESS_WRITE');
    findings.push('isolated_execution_gate_two_connection_exclusion_close_reacquire_no_business_write_not_integrated');
    findings.push('isolated_execution_gate_injected_silent_query_timeout_destroys_session_no_pool_return');
  }
  const afterFirst=await snapshot();
  try{await store.firstClaim(request,{runId:request.batch.admissions[0].runId,leaseOwner:'isolated:duplicate'});assert(false,'DUPLICATE_FIRST_CLAIM_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FIRST_CLAIM_CONFLICT','DUPLICATE_FIRST_CLAIM_WRONG_ERROR');}
  assert(await snapshot()===afterFirst,'DUPLICATE_FIRST_CLAIM_CHANGED');
  let destroyed=false,rollbackAfterCommit=false,committed=false;
  const unknownRepo=Object.create(repo);unknownRepo.pool={getConnection:async()=>{const c=await repo.pool.getConnection();return new Proxy(c,{get(t,k){if(k==='commit')return async()=>{await c.commit();committed=true;throw Error('synthetic-ack-loss');};if(k==='destroy')return ()=>{destroyed=true;c.destroy();};if(k==='rollback')return async()=>{if(committed)rollbackAfterCommit=true;return c.rollback();};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});}};
  const unknownTarget=createScheduledIsolatedTarget({repo:unknownRepo,repositoryRoot:root,directory,serverPid});
  let unknownProof;
  try{unknownProof=await createOverseasScheduledAdmissionStore({repo:unknownRepo,isolation:unknownTarget}).firstClaim(request,{runId:request.batch.admissions[1].runId,leaseOwner:'isolated:second',...(inspection?{requestJournal,record:requestRecord,intent:secondIntent}:{})});assert(false,'CLAIM_ACK_UNKNOWN_NOT_TESTED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_ADMISSION_COMMIT_UNKNOWN','CLAIM_ACK_UNKNOWN_WRONG_ERROR');}
  const secondClaim=(await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[1].runId]))[0];
  assert(destroyed&&!rollbackAfterCommit&&unknownProof===undefined&&secondClaim.lease_owner!==claim.run.lease_owner&&Number(secondClaim.lease_epoch)===1&&secondClaim.status==='running','SCHEDULED_SECOND_CHILD_ACK_FENCE_FAILED');
  assert(canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'))===stateBefore,'FIRST_CLAIM_SOURCE_STATE_CHANGED');
  assert((await store.reconcile(request)).status==='accepted','PROGRESSED_ADMISSION_RECONCILE_FAILED');
  const {scheduledFirstClaimContext}=require('../server/src/db/overseasScheduledAdmissionStore');
  assert(scheduledFirstClaimContext(claim.proof,repo).admission.runId===claim.run.id,'FIRST_CLAIM_PROOF_NOT_BOUND');
  const context=scheduledFirstClaimContext(claim.proof,repo);assert(Object.isFrozen(context),'FIRST_CLAIM_CONTEXT_MUTABLE');
  try{context.repo={};assert(false,'FIRST_CLAIM_CONTEXT_REPLACED');}catch(e){assert(e instanceof TypeError,'FIRST_CLAIM_CONTEXT_MUTATION_WRONG_ERROR');}
  for(const [proof,other] of [[{...claim.proof},repo],[claim.proof,{}]]){try{scheduledFirstClaimContext(proof,other);assert(false,'COPIED_CLAIM_PROOF_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED','COPIED_PROOF_WRONG_ERROR');}}
  findings.push('actual_parent_child_manifest_epoch1_claim_two_sites_and_duplicate_fence');
  findings.push('actual_two_connection_claim_single_winner_and_commit_ack_unknown_no_proof');
  const contract=await require('../worker/src/overseasScheduledClaimPublisher').publishScheduledFirstClaim({repo,journal,proof:claim.proof});
  if(inspection){
    const child=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'overseas-scheduled-request-read-child.js'),root,requestDir,requestRecord.requestSha256],
      {encoding:'utf8',timeout:10000,windowsHide:true,shell:false});
    assert(child.status===0,'NEW_PROCESS_REQUEST_READ_FAILED');
    const childEvidence=JSON.parse(child.stdout);
    assert(childEvidence.requestSha256===requestRecord.requestSha256&&canonical(childEvidence.request)===canonical(request)
      &&childEvidence.automaticWriteAllowed===false,'NEW_PROCESS_REQUEST_EVIDENCE_CHANGED');
    const restarted=await requestModule.createScheduledRequestJournal({repositoryRoot:root,directory:requestDir});
    const recovered=await restarted.recover(requestRecord.requestSha256);
    const recoveredIntent=await restarted.readIntent({record:recovered,runId:request.batch.admissions[1].runId});
    assert(recoveredIntent.nextOwner===secondIntent.nextOwner,'RESTART_INTENT_OWNER_CHANGED');
    const ackResult=await store.reconcileFirstClaimIntent({requestJournal:restarted,record:recovered,intent:recoveredIntent});
    assert(ackResult.status==='committed_verified'&&ackResult.automaticClaimAllowed===false,'UNKNOWN_ACK_INTENT_RECONCILE_FAILED');
    try{await store.reconcileFirstClaimIntent({requestJournal:restarted,record:recovered,intent:{...recoveredIntent}});assert(false,'COPIED_INTENT_ALLOWED');}
    catch(e){assert(e.code==='OVERSEAS_SCHEDULED_REQUEST_EVIDENCE_INVALID','COPIED_INTENT_WRONG_ERROR');}
    assert(canonical(requestModule.scheduledRequestEvidence(recovered,restarted))===canonical(request),'RESTART_ORIGINAL_REQUEST_CHANGED');
    const beforeInspect=await snapshot();
    const accepted=await store.inspectFirstClaim({requestJournal:restarted,record:recovered,runId:contract.runId,journal});
    const missing=await store.inspectFirstClaim({requestJournal:restarted,record:recovered,runId:request.batch.admissions[1].runId,journal});
    assert(accepted.status==='claimed_journal_verified'&&missing.status==='claimed_without_journal','INSPECTION_DISPOSITION_FAILED');
    for(const result of [accepted,missing])assert(result.automaticWriteAllowed===false&&result.automaticClaimAllowed===false,'INSPECTION_GRANTED_WRITE');
    for(const record of [{...recovered},recovered]){
      try{await store.inspectFirstClaim({requestJournal:record===recovered?requestJournal:restarted,record,runId:contract.runId,journal});assert(false,'COPIED_REQUEST_RECORD_ALLOWED');}
      catch(e){assert(e.code==='OVERSEAS_SCHEDULED_REQUEST_EVIDENCE_INVALID','COPIED_REQUEST_RECORD_ERROR');}
    }
    try{require('../server/src/db/overseasScheduledAdmissionStore').scheduledFirstClaimContext(accepted,repo);assert(false,'INSPECTION_AS_CLAIM_ALLOWED');}
    catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED','INSPECTION_AS_CLAIM_ERROR');}
    assert(await snapshot()===beforeInspect,'READONLY_INSPECTION_CHANGED_DB');
    findings.push('original_request_journal_reopen_readonly_claim_inspection_missing_ack_journal_no_write_capability');
    return {status:'PASS_ISOLATED_SCHEDULED_INSPECTION_ONLY',checks:findings,restartJournalReadExecuted:true,newNodeProcessRequestReadExecuted:true,recoveryExecuted:false,epoch2Executed:false,
      automaticClaimAllowed:false,realHttpExecuted:false,productionActivationAllowed:false};
  }
  if(mainchain)return require('./overseas-isolated-scheduled-mainchain').runScheduledMainchain({repo,control,journal,proof:claim.proof,contract,request,findings,scenario});
  const ledger=require('../server/src/db/overseasStageCoverage').createOverseasScheduledStageCoverageLedger({repo,journal,proof:claim.proof});
  try{require('../server/src/db/overseasBoundAudit').createOverseasBoundAudit({repo,journal,ledger});assert(false,'SCHEDULED_AUDIT_PROOF_OMISSION_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_COVERAGE_CONTEXT_CONFLICT','SCHEDULED_AUDIT_OMISSION_WRONG_ERROR');}
  const coverage=require('../worker/src/overseasStageCoverage').createOverseasStageCoverage({repo,ledger});
  try{require('../worker/src/overseasBigPlayerPageStore').createOverseasBigPlayerPageStore({repo,verifyRunContract:async()=>true,stageCoverage:coverage});assert(false,'SCHEDULED_PAGE_PROOF_OMISSION_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_COVERAGE_CONTEXT_CONFLICT','SCHEDULED_PAGE_OMISSION_WRONG_ERROR');}
  const auditFactory=require('../server/src/db/overseasBoundAudit').createOverseasBoundAudit;
  const pageFactory=require('../worker/src/overseasBigPlayerPageStore').createOverseasBigPlayerPageStore;
  const beforeBrands=await snapshot();
  for(const proof of [undefined,null,{...claim.proof},{}]){
    for(const construct of [()=>auditFactory({repo,journal,ledger,scheduledProof:proof}),
      ()=>pageFactory({repo,verifyRunContract:async()=>true,stageCoverage:coverage,scheduledProof:proof})]){
      try{construct();assert(false,'INVALID_SCHEDULED_PROOF_ALLOWED');}catch(e){assert(['OVERSEAS_COVERAGE_CONTEXT_CONFLICT','OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED'].includes(e.code),'INVALID_SCHEDULED_PROOF_WRONG_ERROR');}
    }
  }
  for(const construct of [()=>auditFactory({repo:Object.create(repo),journal,ledger,scheduledProof:claim.proof}),
    ()=>auditFactory({repo,journal:{...journal},ledger,scheduledProof:claim.proof}),
    ()=>require('../server/src/db/overseasStageCoverage').assertCoverageSafetyContext({}, {repo,scheduledProof:claim.proof})]){
    try{construct();assert(false,'CROSS_CONTEXT_PROOF_ALLOWED');}catch(e){assert(['OVERSEAS_COVERAGE_CONTEXT_CONFLICT','OVERSEAS_AUDIT_BRAND_REQUIRED','OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED'].includes(e.code),'CROSS_CONTEXT_PROOF_WRONG_ERROR');}
  }
  assert(await snapshot()===beforeBrands,'INVALID_PROOF_CONSTRUCTOR_CHANGED_DB');
  findings.push('missing_null_copied_cross_mode_cross_repo_cross_journal_proof_constructors_zero_writes');
  const descriptors=require('../worker/src/overseasStageTaskIdentity').schemaDescriptors(contract,[{boardId:'100017',feedKey:'synthetic-a'},{boardId:'100017',feedKey:'synthetic-b'}]);
  const transaction=async(fn,readonly=false)=>{const c=await repo.pool.getConnection();try{await target.verifyConnection(c);if(readonly)await c.query('START TRANSACTION READ ONLY');else await c.beginTransaction();const v=await fn(c);if(readonly)await c.rollback();else await c.commit();return v;}catch(e){await c.rollback();throw e;}finally{c.release();}};
  const beforeBootstrap=await snapshot();let taskInserts=0;
  try{await transaction(c=>ledger.prepareSchema(new Proxy(c,{get(t,k){if(k==='query')return async(sql,params)=>{if(sql.startsWith('INSERT INTO po_overseas_expected_tasks')&&++taskInserts===2)throw Object.assign(Error('Injected second schema task'),{code:'ISOLATED_SCHEMA_TASK_FAULT'});return c.query(sql,params);};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}}),contract,{schemaDescriptors:descriptors}));assert(false,'SCHEMA_BOOTSTRAP_FAULT_NOT_TESTED');}catch(e){assert(e.code==='ISOLATED_SCHEMA_TASK_FAULT','SCHEMA_BOOTSTRAP_FAULT_WRONG_ERROR');}
  assert(taskInserts===2&&await snapshot()===beforeBootstrap,'SCHEMA_BOOTSTRAP_PARTIAL');
  assert((await transaction(c=>ledger.prepareSchema(c,contract,{schemaDescriptors:descriptors}))).status==='open','SCHEMA_BOOTSTRAP_FAILED');
  const afterBootstrap=await snapshot();assert((await transaction(c=>ledger.prepareSchema(c,contract,{schemaDescriptors:descriptors}))).status==='open','SCHEMA_BOOTSTRAP_REPLAY_FAILED');
  assert(await snapshot()===afterBootstrap,'SCHEMA_BOOTSTRAP_REPLAY_CHANGED');
  const progress=await transaction(c=>ledger.readProgress(c,contract),true);assert(progress.total===2&&progress.completed===0,'SCHEDULED_LEDGER_READ_FAILED');
  await target.verifyConnection(control);await control.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',['synthetic-wrong-parent',request.batch.admissions[0].parentRunId]);
  try{await context.verify(contract);assert(false,'PARENT_FENCE_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST','PARENT_FENCE_WRONG_ERROR');}
  await control.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',[request.ownerId,request.batch.admissions[0].parentRunId]);
  await context.verify(contract);findings.push('actual_scheduled_journal_fresh_fence_schema_bootstrap_rollback_idempotence');
  const audit=require('../server/src/db/overseasBoundAudit').createOverseasBoundAudit({repo,journal,ledger,scheduledProof:claim.proof});
  const originalPool=repo.pool;
  const auditBaseline=async()=>canonical(await repo.query('SELECT * FROM po_collection_runs ORDER BY id'))+canonical(await repo.query('SELECT * FROM po_audit_events ORDER BY id'))+await snapshot();
  const beforeTail=await auditBaseline();let injectedTail=false;
  // Same connection drift after audit INSERT: final fresh fence must reject
  // and roll back both the injected parent change and all audit writes.
  repo.pool={getConnection:async()=>{const c=await originalPool.getConnection();return new Proxy(c,{get(t,k){if(k==='query')return async(sql,params)=>{const result=await c.query(sql,params);if(sql.startsWith('INSERT INTO po_audit_events')&&!injectedTail){injectedTail=true;await c.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',['synthetic-tail-drift',request.batch.admissions[0].parentRunId]);}return result;};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});}};
  try{await audit.create(contract);assert(false,'AUDIT_TAIL_FENCE_NOT_TESTED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST','AUDIT_TAIL_WRONG_ERROR');}finally{repo.pool=originalPool;}
  assert(injectedTail&&await auditBaseline()===beforeTail,'AUDIT_TAIL_PARTIAL_WRITES');
  findings.push('actual_audit_create_tail_parent_drift_full_rollback');
  const account=(await repo.query('SELECT * FROM po_accounts WHERE id=?',[accountId]))[0];
  const source={...(await repo.query('SELECT * FROM po_sources WHERE id=?',[sourceId]))[0],region_code:'overseas',siteId:contract.siteId,siteUrl:contract.siteUrl,account,
    config:{...config,baseUrl:contract.siteUrl}};
  const dispatchModule=require('../worker/src/overseasBigPlayerDispatchGuard');let sends=0;
  const dispatch=dispatchModule.createOverseasDispatchGuard({repo,journal,manifestSha256:contract.manifestSha256,scheduledProof:claim.proof,
    transport:async()=>{sends++;return {ok:true,status:200,json:async()=>({code:0,data:[]})};}});
  dispatchModule.bindOverseasDispatchScope(source,account,contract);
  let injectedDispatch=false;
  repo.pool={getConnection:async()=>{const c=await originalPool.getConnection();return new Proxy(c,{get(t,k){if(k==='query')return async(sql,params)=>{const result=await c.query(sql,params);if(sql.includes('r.id AS r_id')&&!injectedDispatch){injectedDispatch=true;await c.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',['synthetic-dispatch-drift',request.batch.admissions[0].parentRunId]);}return result;};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});}};
  const beforeDispatch=await snapshot();
  try{await dispatch.invoke(source,account,()=>dispatch.transport('https://club-en.q1.com/api/club/v1/auth/post/'));assert(false,'DISPATCH_TAIL_NOT_TESTED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST','DISPATCH_TAIL_WRONG_ERROR');}finally{repo.pool=originalPool;}
  assert(injectedDispatch&&sends===0&&await snapshot()===beforeDispatch,'DISPATCH_TAIL_SENT_OR_CHANGED_DB');
  await dispatch.invoke(source,account,()=>dispatch.transport('https://club-en.q1.com/api/club/v1/auth/post/'));
  assert(sends===1,'SYNTHETIC_DISPATCH_NOT_EXECUTED');
  findings.push('actual_scheduled_dispatch_tail_parent_drift_zero_synthetic_sends_and_rollback');
  const requestPaths=[];
  const connectorDispatch=dispatchModule.createOverseasDispatchGuard({repo,journal,manifestSha256:contract.manifestSha256,scheduledProof:claim.proof,
    transport:async value=>{const u=new URL(value);requestPaths.push(u.pathname);let payload;
      if(u.pathname==='/api/club/v1/login/token')payload={code:0,data:{token:'synthetic-site-token'}};
      else if(u.pathname==='/api/club/v1/auth/post/')payload={code:0,data:{id:1200}};
      else if(u.pathname==='/api/club/v1/auth/comment/1200')payload={code:0,data:[{id:u.searchParams.get('commentId')?'1202':'1201'}],total:1,hasMore:false};
      else throw Object.assign(Error('SYNTHETIC_PATH_NOT_ALLOWED'),{code:'SYNTHETIC_PATH_NOT_ALLOWED'});
      return {ok:true,status:200,url:String(u),json:async()=>payload};}});
  const adapter=require('../worker/src/overseasBigPlayerAdapter').createOverseasBigPlayerAdapter({repo,transport:connectorDispatch.transport,dispatchGuard:connectorDispatch,
    credentialContext:{loadApiToken:async()=>'synthetic-base-token'}});
  await transaction(c=>ledger.prepareHistorySnapshot(c,contract));
  const page=pageFactory({repo,verifyRunContract:async c=>{await journal.read(c);return true;},stageCoverage:coverage,scheduledProof:claim.proof});
  const publishedAt=new Date((Date.parse(contract.windowStart)+Date.parse(contract.windowEnd))/2);
  const makeItem=(id,depth=0,parent=null)=>({externalId:String(id),boardId:'100017',contentType:depth?'comment':'post',contentDepth:depth,
    platformParentId:parent===null?null:String(parent),rootPlatformContentId:depth?'1200':null,body:`synthetic ${id}`,publishedAt,
    fingerprint:hash(String(id)),rawPayload:{boardId:'100017'}});
  async function pageInput(descriptor,items,replyTargets=[]){
    await context.verify(contract);
    const cp=await repo.claimSyncCheckpoint({...descriptor,accountId,siteId:contract.siteId,leaseOwner:contract.leaseOwner,leaseSeconds:60});
    assert(cp,'SCHEDULED_PAGE_CHECKPOINT_NOT_CLAIMED');
    return {source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseSeconds:60,runContract:contract,
      ...descriptor,items,replyTargets,checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:publishedAt};
  }
  const postPayload=await adapter.connector.requestQ1('/api/club/v1/auth/post/',source,'synthetic-base-token',{postId:'1200'},1,'posts');
  assert(postPayload.data.id===1200,'SYNTHETIC_CONNECTOR_POST');
  const postInput=await pageInput(descriptors[0],[makeItem(postPayload.data.id)]);
  const beforePage=await auditBaseline()+canonical(await repo.query('SELECT * FROM po_contents ORDER BY id'))+canonical(await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id'));
  const badPage=pageFactory({repo,verifyRunContract:async()=>true,stageCoverage:coverage,scheduledProof:claim.proof,
    beforeCommit:async({facade})=>{await facade.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',['synthetic-page-drift',request.batch.admissions[0].parentRunId]);}});
  try{await badPage.upsertContentPage(postInput);assert(false,'PAGE_TAIL_NOT_TESTED');}catch(e){if(e.code!=='OVERSEAS_SCHEDULED_FENCE_LOST')throw e;}
  assert(await auditBaseline()+canonical(await repo.query('SELECT * FROM po_contents ORDER BY id'))+canonical(await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id'))===beforePage,'PAGE_PARENT_DRIFT_PARTIAL_WRITE');
  await page.upsertContentPage(postInput);
  let p=await transaction(c=>ledger.readProgress(c,contract),true);
  const comment=p.pending.find(d=>d.taskKind==='comments'&&d.rootPlatformContentId==='1200');assert(comment,'POST_DID_NOT_REGISTER_COMMENTS_SAME_PAGE');
  const commentPayload=await adapter.connector.requestQ1('/api/club/v1/auth/comment/1200',source,'synthetic-base-token',{},1,'comments');
  await page.upsertContentPage(await pageInput(comment,[makeItem(commentPayload.data[0].id,1,1200)],[{postId:'1200',commentId:'1201',sortType:0}]));
  p=await transaction(c=>ledger.readProgress(c,contract),true);
  const reply=p.pending.find(d=>d.taskKind==='q1_reply');assert(reply,'COMMENTS_DID_NOT_REGISTER_REPLY_SAME_PAGE');
  const replyPayload=await adapter.connector.requestQ1('/api/club/v1/auth/comment/1200',source,'synthetic-base-token',{commentId:'1201'},1,'comments');
  await page.upsertContentPage(await pageInput(reply,[makeItem(replyPayload.data[0].id,2,1201)]));
  adapter.close();
  assert(requestPaths.filter(p=>p==='/api/club/v1/login/token').length===1&&requestPaths.length===4,'SYNTHETIC_CONNECTOR_SESSION_REQUESTS');
  await page.upsertContentPage(await pageInput(descriptors[1],[]));
  await transaction(c=>ledger.prepareHistorySnapshot(c,contract));
  const seal=await transaction(c=>ledger.sealExpansion(c,contract));assert(seal.status==='completed_authorized_scope','SCHEDULED_PAGE_CHAIN_NOT_SEALED');
  const graph=await repo.query('SELECT * FROM po_contents ORDER BY content_depth');
  assert(graph.length===3&&graph[1].root_content_id===graph[0].id&&graph[1].parent_content_id===graph[0].id&&graph[2].root_content_id===graph[0].id&&graph[2].parent_content_id===graph[1].id,'SCHEDULED_PAGE_CHAIN_GRAPH');
  findings.push('actual_scheduled_page_parent_drift_rollback_posts_comments_reply_same_page_tasks_checkpoint_seal');
  await control.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',['synthetic-audit-parent-drift',request.batch.admissions[0].parentRunId]);
  const beforeAuditFault=canonical(await repo.query('SELECT * FROM po_collection_runs ORDER BY id'))+canonical(await repo.query('SELECT * FROM po_audit_events ORDER BY id'));
  try{await audit.create(contract);assert(false,'AUDIT_PARENT_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST','AUDIT_PARENT_DRIFT_WRONG_ERROR');}
  assert(canonical(await repo.query('SELECT * FROM po_collection_runs ORDER BY id'))+canonical(await repo.query('SELECT * FROM po_audit_events ORDER BY id'))===beforeAuditFault,'AUDIT_PARENT_DRIFT_WROTE');
  await control.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',[request.ownerId,request.batch.admissions[0].parentRunId]);
  const sourceBefore=canonical(await repo.query('SELECT last_success_at,last_error FROM po_sources WHERE id=?',[sourceId]));
  const bound=await audit.create(contract);await audit.finish({proof:bound.auditProof,status:'completed_authorized_scope',sourceStatus:'success'});
  const reconciled=await audit.reconcile({contract,status:'completed_authorized_scope'});assert(reconciled.status==='accepted'&&reconciled.automaticWriteAllowed===false,'SCHEDULED_TERMINAL_READONLY_RECONCILE_FAILED');
  const child=(await repo.query('SELECT discovered_count,stored_count FROM po_sync_runs WHERE id=?',[contract.runId]))[0];
  assert(child.discovered_count===3&&child.stored_count===3&&sourceBefore===canonical(await repo.query('SELECT last_success_at,last_error FROM po_sources WHERE id=?',[sourceId])),'SCHEDULED_CHILD_COUNTER_OR_SOURCE_EFFECT');
  try{await context.verify(contract);assert(false,'TERMINAL_GRANTED_LIVE_FENCE');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FENCE_LOST','TERMINAL_LIVE_FENCE_WRONG_ERROR');}
  findings.push('actual_scheduled_child_success_unique_three_content_counts_atomic_terminal_readonly_reconcile_no_source_effect');
  return {status:'PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL',checks:findings,scheduledClaimExecuted:true,recoveryExecuted:false,ledgerExecuted:true,scheduledPageExecuted:true,syntheticTransportExecuted:true,connectorRequestQ1Executed:true,connectorPageNormalizationExecuted:false,runSourceAssemblyExecuted:false,realHttpExecuted:false,aiExecuted:false,productionActivationAllowed:false};
}
module.exports={checkScheduledAdmission};
