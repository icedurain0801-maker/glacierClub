'use strict';
// Fresh same-process manual first claims only. No recovery/progress/network.
const fs=require('node:fs'),path=require('node:path');
const {canonical,createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {iso,verifyPersistedOverseasContract}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const {createOverseasManualReceipt}=require('../worker/src/overseasManualReceipt');
const {handoffOverseasManualMarker}=require('../server/src/db/overseasManualHandoff');
const {createCandidateInitialClaim}=require('../worker/src/overseasCandidateInitialClaim');
const {createOverseasClaimedContracts}=require('../worker/src/overseasBigPlayerClaimedContracts');
const {createScheduledIsolatedTarget}=require('../server/src/db/overseasScheduledIsolatedTarget');
const {createOverseasStageCoverageLedger}=require('../server/src/db/overseasStageCoverage');
const {createOverseasStageCoverage}=require('../worker/src/overseasStageCoverage');
const {createOverseasBigPlayerPageStore}=require('../worker/src/overseasBigPlayerPageStore');
const {createOverseasBoundAudit}=require('../server/src/db/overseasBoundAudit');
const {schemaDescriptors}=require('../worker/src/overseasStageTaskIdentity');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const tables=['po_sync_runs','po_sources','po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_checkpoints','po_sync_run_contents','po_contents','po_content_feed_memberships','po_collection_runs','po_audit_events'];
async function checkManualAudit({repo,control,root,directory,serverPid,sourceId}){
 const target=createScheduledIsolatedTarget({repo,repositoryRoot:root,directory,serverPid});
 const originalPool=repo.pool,originalQuery=repo.query,acquire=originalPool.getConnection.bind(originalPool);
 const originalLockWait=repo.syncUpsertLockWaitSeconds;
 repo.syncUpsertLockWaitSeconds=3;
 let verifiedConnections=0;
 repo.pool={getConnection:async()=>{const c=await acquire();try{await target.verifyConnection(c);verifiedConnections++;return c;}catch(e){c.destroy();throw e;}}};
 repo.query=async(sql,params=[])=>{const c=await repo.pool.getConnection();try{return(await c.query(sql,params))[0];}finally{c.release();}};
 const transaction=async work=>{const c=await repo.pool.getConnection();try{await c.beginTransaction();const r=await work(c);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}};
 const snapshot=async()=>{const rows=[];for(const t of tables)rows.push(await repo.query(`SELECT * FROM ${t} ORDER BY 1,2`));return canonical(rows);};
 try{
  await target.verifyConnection(control);
  const receiptDir=path.join(directory,'manual-audit-receipts'),journalDir=path.join(directory,'manual-audit-journal');
  fs.mkdirSync(receiptDir);fs.mkdirSync(journalDir);
  const receipt=await createOverseasManualReceipt({repositoryRoot:root,directory:receiptDir});
  const [sourceRow]=await repo.query('SELECT * FROM po_sources WHERE id=?',[sourceId]);
  const manifestSha256='a'.repeat(64);
  const request=await receipt.prepare({repo,sourceId,expectedMarker:iso(sourceRow.collect_requested_at),manifestSha256});
  assert((await handoffOverseasManualMarker(repo,{request,receipt})).status==='accepted','MANUAL_AUDIT_HANDOFF_NOT_ACCEPTED');
  assert(request.bindings.length===2,'MANUAL_AUDIT_TWO_BINDINGS_REQUIRED');
  const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
  const claim=createCandidateInitialClaim({repo,manifestSha256,initialRunBindings:request.bindings});
  const contracts=createOverseasClaimedContracts({repo,journal,manifestSha256,initialRunBindings:request.bindings});
  const ledger=createOverseasStageCoverageLedger({journal,receipt,request});
  const coverage=createOverseasStageCoverage({repo,ledger}),audit=createOverseasBoundAudit({repo,journal,ledger});
  const page=createOverseasBigPlayerPageStore({repo,verifyRunContract:async c=>{await journal.read(c);await verifyPersistedOverseasContract(repo,c);return true;},stageCoverage:coverage});
  const outcomes=[];let successfulTime;
  for(const [index,b] of request.bindings.entries()){
   const run=await claim({runId:b.runId,accountId:b.accountId,leaseOwner:`isolated:manual-audit:${index}`,leaseSeconds:300});
   assert(run&&Number(run.lease_epoch)===1&&Number(run.attempts)===1,'MANUAL_AUDIT_FIRST_CLAIM_FAILED');
   const [account]=await repo.query('SELECT * FROM po_accounts WHERE id=?',[b.accountId]);
   const config=typeof sourceRow.config==='string'?JSON.parse(sourceRow.config):sourceRow.config;
   const source={...sourceRow,region_code:'overseas',siteId:b.siteId,siteUrl:b.siteUrl,account,config:{...config,baseUrl:b.siteUrl}};
   const c=await contracts.prepare({source,account,syncRunId:b.runId,windowStart:b.windowStart,windowEnd:b.windowEnd,leaseOwner:run.lease_owner,leaseEpoch:1});
   if(index===0){
    const descriptors=schemaDescriptors(c,[{boardId:c.boardId,feedKey:'synthetic-manual-empty'}]);
    await transaction(conn=>ledger.prepareSchema(conn,c,{schemaDescriptors:descriptors}));
    await transaction(conn=>ledger.prepareHistorySnapshot(conn,c));
    const d=descriptors[0],cp=await repo.claimSyncCheckpoint({...d,accountId:c.accountId,siteId:c.siteId,leaseOwner:c.leaseOwner,leaseSeconds:60});
    assert(cp,'MANUAL_AUDIT_CHECKPOINT_MISSING');
    await page.upsertContentPage({source,account,syncRunId:c.runId,leaseOwner:c.leaseOwner,leaseSeconds:60,runContract:c,...d,items:[],replyTargets:[],checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:null});
    assert((await transaction(conn=>ledger.sealExpansion(conn,c))).status==='completed_authorized_scope','MANUAL_AUDIT_SEAL_FAILED');
   }else{
    const [m]=await repo.query('SELECT COUNT(*) AS n FROM po_overseas_stage_manifests WHERE run_id=?',[c.runId]);
    assert(Number(m.n)===0,'MANUAL_AUDIT_FAILURE_MANIFEST_PRESENT');
   }
   const bound=await audit.create(c),status=index===0?'completed_authorized_scope':'failed';
   const saved=await audit.finish({proof:bound.auditProof,status,sourceStatus:index===0?'success':'failed',...(index===1?{errorCode:'FIXTURE_MANUAL_FAILED',errorMessage:'synthetic fresh manual failure',sourceErrorMessage:'synthetic fresh manual source failure'}:{})});
   const [actualSource]=await repo.query('SELECT last_success_at,last_error FROM po_sources WHERE id=?',[sourceId]);
   assert(saved.sourceEffect&&saved.sourceEffect.status===(index===0?'success':'failed')&&saved.sourceEffect.lastSuccessAt===(actualSource.last_success_at==null?null:iso(actualSource.last_success_at))&&saved.sourceEffect.lastError===actualSource.last_error,'MANUAL_AUDIT_SOURCE_EFFECT_MISMATCH');
   if(index===0){assert(actualSource.last_success_at!==null&&actualSource.last_error===null,'MANUAL_AUDIT_SUCCESS_SOURCE_POLICY');successfulTime=iso(actualSource.last_success_at);}
   else{assert(iso(actualSource.last_success_at)===successfulTime&&actualSource.last_error==='synthetic fresh manual source failure','MANUAL_AUDIT_FAILED_SOURCE_POLICY');assert(['schemaSha256','taskSetSha256','completionSetSha256'].every(k=>saved[k]===null),'MANUAL_AUDIT_FAILED_PROGRESS_NOT_NULL');}
   const events=await repo.query("SELECT * FROM po_audit_events WHERE source_id=? AND event_type IN ('overseas_bound_audit','overseas_bound_terminal')",[sourceId]);
   const selected=events.filter(e=>JSON.parse(e.detail).syncRunId===c.runId);
   const binding=selected.find(e=>e.event_type==='overseas_bound_audit'),terminal=selected.find(e=>e.event_type==='overseas_bound_terminal');
   assert(selected.length===2&&selected.every(e=>e.actor_type==='system')&&binding&&terminal,'MANUAL_AUDIT_EVENTS_INVALID');
   const bindingDetail=JSON.parse(binding.detail),terminalDetail=JSON.parse(terminal.detail);
   const keys=[...Object.keys(bindingDetail),'status','errorCode','errorMessage','counterVersion','counts','linksSha256','sourceEffect','taskSetSha256','completionSetSha256','schemaSha256'].sort();
   assert(Object.keys(terminalDetail).sort().join(',')===keys.join(',')&&terminalDetail.format===bindingDetail.format&&canonical(terminalDetail)===canonical(saved),'MANUAL_AUDIT_TERMINAL_PROTOCOL_CHANGED');
   const [collection]=await repo.query('SELECT * FROM po_collection_runs WHERE id=?',[bound.id]);
   assert(collection.analyzed_count!==null&&Number(collection.analyzed_count)===0&&collection.alerted_count!==null&&Number(collection.alerted_count)===0,'MANUAL_AUDIT_ANALYSIS_ALERT_NOT_ZERO');
   const before=await snapshot(),verdict=await audit.reconcile({contract:c,status}),after=await snapshot();
   assert(verdict.status==='accepted'&&verdict.automaticWriteAllowed===false&&before===after,'MANUAL_AUDIT_READONLY_RECONCILE_FAILED');
   outcomes.push({status,sourceStatus:saved.sourceEffect.status,exactTerminalKeys:keys.length,readonlyTenTableZeroWrite:true,nullProgress:index===1});
  }
  return{status:'PASS_ISOLATED_FRESH_MANUAL_AUDIT',outcomes,verifiedConnections,recoveryExecuted:false,progressRecoveryExecuted:false,realHttpExecuted:false,productionActivationAllowed:false};
 }finally{repo.pool=originalPool;repo.query=originalQuery;repo.syncUpsertLockWaitSeconds=originalLockWait;}
}
module.exports={checkManualAudit};
