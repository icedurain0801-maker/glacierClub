'use strict';
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {iso}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const {createOverseasScheduledStageCoverageLedger}=require('../server/src/db/overseasStageCoverage');
const {createOverseasBoundAudit}=require('../server/src/db/overseasBoundAudit');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const tables=['po_sync_runs','po_source_schedule_state','po_sources','po_fixture_success_cursors','po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_checkpoints','po_sync_run_contents','po_contents','po_content_feed_memberships','po_collection_runs','po_audit_events'];
async function checkTerminalFields({repo,control,target,journal,claims,parent,reproduction=false}){
  await target.verifyConnection(control);
  const chosen=claims[0],contract=chosen.contract;
  const ledger=createOverseasScheduledStageCoverageLedger({repo,journal,proof:chosen.claim.proof});
  const audit=createOverseasBoundAudit({repo,journal,ledger,scheduledProof:chosen.claim.proof});
  const snapshot=async()=>{await target.verifyConnection(control);return canonical(await Promise.all(tables.map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1,2`))));};
  const [events]=await control.query("SELECT * FROM po_audit_events WHERE source_id=? AND event_type IN ('overseas_bound_audit','overseas_bound_terminal')",[contract.sourceId]);
  const binding=events.find(e=>JSON.parse(e.detail).syncRunId===contract.runId&&e.event_type==='overseas_bound_audit');
  const terminal=events.find(e=>JSON.parse(e.detail).syncRunId===contract.runId&&e.event_type==='overseas_bound_terminal');
  assert(binding&&terminal,'TERMINAL_FIXTURE_EVENTS_MISSING');
  const saved=JSON.parse(terminal.detail);
  const [[collection]]=await control.query('SELECT * FROM po_collection_runs WHERE id=?',[saved.auditId]);
  const [[source]]=await control.query('SELECT last_success_at,last_error FROM po_sources WHERE id=?',[contract.sourceId]);
  const sourceEffect={status:'success',lastSuccessAt:source.last_success_at==null?null:iso(source.last_success_at),lastError:source.last_error};
  const bindingKeys=Object.keys(JSON.parse(binding.detail)),bindingSet=new Set(bindingKeys);
  const known=[...bindingKeys,'status','errorCode','errorMessage','counterVersion','counts','linksSha256','sourceEffect','taskSetSha256','completionSetSha256','schemaSha256'].sort();
  assert(Object.keys(saved).sort().join(',')===known.join(','),'TERMINAL_FIXTURE_UNEXPECTED_KEYS');
  const before=await snapshot();
  assert((await audit.reconcile({contract,status:saved.status})).status==='accepted','TERMINAL_BASELINE_NOT_ACCEPTED');
  const cases=[];
  const detailCase=(name,value,expected,oldAccepted=false)=>cases.push({name,table:'po_audit_events',id:terminal.id,column:'detail',value:canonical(value),restore:terminal.detail,expected,oldAccepted});
  // Match the actual source exactly so the old sourceEffect hole is reproduced.
  detailCase('scheduled_exact_current_source_effect',{...saved,sourceEffect},'OVERSEAS_PARENT_CHILD_UNPROVEN',true);
  detailCase('extra_detail_field',{...saved,fixtureUnexpected:true},'OVERSEAS_AUDIT_EVIDENCE_INVALID',true);
  for(const [event,name] of [[terminal,'terminal_actor_type'],[binding,'binding_actor_type']])cases.push({name,table:'po_audit_events',id:event.id,column:'actor_type',value:'fixture',restore:event.actor_type,expected:'OVERSEAS_AUDIT_BINDING_UNPROVEN',oldAccepted:true});
  for(const column of ['analyzed_count','alerted_count'])for(const value of [1,null])cases.push({name:`collection_${column}_${value===null?'null':'one'}`,table:'po_collection_runs',id:collection.id,column,value,restore:collection[column],expected:'OVERSEAS_PARENT_CHILD_UNPROVEN',oldAccepted:true});
  if(!reproduction){
    for(const key of Object.keys(saved)){
      if(key==='sourceEffect')continue;
      const value=key==='counts'?{...saved.counts,discovered:saved.counts.discovered+1}:typeof saved[key]==='number'?saved[key]+1:saved[key]===null?'fixture-drift':`fixture-drift-${saved[key]}`;
      detailCase(`detail_${key}`,{...saved,[key]:value},bindingSet.has(key)?'OVERSEAS_AUDIT_BINDING_UNPROVEN':'OVERSEAS_PARENT_CHILD_UNPROVEN');
    }
    for(const key of Object.keys(saved.counts))detailCase(`counts_${key}`,{...saved,counts:{...saved.counts,[key]:saved.counts[key]+1}},'OVERSEAS_PARENT_CHILD_UNPROVEN');
    for(const key of Object.keys(saved)){const value={...saved};delete value[key];detailCase(`missing_${key}`,value,'OVERSEAS_AUDIT_EVIDENCE_INVALID');}
  }
  const observations=[];
  for(const entry of cases){
    await target.verifyConnection(control);
    // Table/column identifiers come only from the fixed local matrix above.
    await control.query(`UPDATE ${entry.table} SET ${entry.column}=? WHERE id=?`,[entry.value,entry.id]);
    const drift=await snapshot();
    try{
      if(reproduction){const answer=await audit.reconcile({contract,status:saved.status});assert(entry.oldAccepted&&answer.status==='accepted',`TERMINAL_REPRODUCTION_NOT_ACCEPTED_${entry.name}`);observations.push({name:entry.name,observed:answer.status,zeroWrites:true});}
      else{try{await parent.finalize();assert(false,`TERMINAL_DRIFT_ALLOWED_${entry.name}`);}catch(e){assert(e.code===entry.expected,`TERMINAL_WRONG_ERROR_${entry.name}_${e.code}`);observations.push({name:entry.name,errorCode:e.code,zeroWrites:true});}}
      assert(await snapshot()===drift,`TERMINAL_DRIFT_WROTE_${entry.name}`);
    }finally{await target.verifyConnection(control);await control.query(`UPDATE ${entry.table} SET ${entry.column}=? WHERE id=?`,[entry.restore,entry.id]);}
    assert(await snapshot()===before,`TERMINAL_RESTORE_CHANGED_${entry.name}`);
    assert((await audit.reconcile({contract,status:saved.status})).status==='accepted',`TERMINAL_RESTORE_NOT_ACCEPTED_${entry.name}`);
  }
  return {status:reproduction?'REPRODUCED_ISOLATED_TERMINAL_VALIDATION_GAPS':'PASS_ISOLATED_TERMINAL_FIELD_REJECTIONS',observations,legalDetailKeys:known,detailTopLevelFieldsTested:reproduction?null:Object.keys(saved).sort(),nestedCounterFieldsTested:reproduction?null:Object.keys(saved.counts).sort(),actualReadonlyAuditReconcile:reproduction,parentFinalizeAttempted:!reproduction,allTwelveTablesUnchangedAfterRestoration:true,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
}
module.exports={checkTerminalFields};
