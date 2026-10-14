'use strict';
const {createDrainController}=require('./workerDrainController');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function assessRollbackInventory(v) {
  const result=(recommendation,reasonCode)=>Object.freeze({format:'overseas-shared-rollback-assessment-v1',recommendation,reasonCode,automaticWriteAllowed:false,automaticRestartAllowed:false,productionActivationAllowed:false});
  const deny=code=>result('KEEP_STOPPED',code);
  if(!v||v.format!=='overseas-shared-rollback-inventory-v1'||v.classificationComplete!==true)return deny('ROLLBACK_INVENTORY_UNPROVEN');
  for(const k of ['pendingCandidateRunIds','unboundRunIds','unknownRunIds'])if(!Array.isArray(v[k])||v[k].some(id=>typeof id!=='string'||!id.trim()||id!==id.trim())||new Set(v[k]).size!==v[k].length)return deny('ROLLBACK_INVENTORY_INVALID');
  for(const k of ['candidateCheckpointCount','candidateLedgerCount','candidateJobCount'])if(!Number.isSafeInteger(v[k])||v[k]<0)return deny('ROLLBACK_INVENTORY_INVALID');
  if(['externalAdmissionsPaused','exclusiveConsumerStopped','allEntryPointsAccounted'].some(k=>v[k]!==true))return deny('ROLLBACK_ADMISSION_OR_EXCLUSIVITY_UNPROVEN');
  if(['pendingCandidateRunIds','unboundRunIds','unknownRunIds'].some(k=>v[k].length))return deny('ROLLBACK_INCOMPATIBLE_OR_UNKNOWN_WORK');
  if(['schemaCompatible','legacyReadsAndRecoveryCompatible','downstreamJobOwnershipCompatible'].some(k=>v[k]!==true))return deny('ROLLBACK_OLD_RELEASE_COMPATIBILITY_UNPROVEN');
  return result('OLD_RELEASE_REVIEWABLE','ROLLBACK_REQUIRES_MANAGER_EXACT_REVIEW');
}
// Explicit isolated lifecycle. Callbacks are test seams, not production proof.
// No timer, service, restart, second consumer, or modification of scheduler mode.
function createOverseasSharedRuntimeLifecycle({deps,scan,stopAdmissions,verifyQuiescent,readRollbackInventory}={}) {
  if(!deps?.repo||typeof deps.repo.pool?.end!=='function'||typeof deps.closeOverseasCandidate!=='function'||[scan,stopAdmissions,verifyQuiescent,readRollbackInventory].some(f=>typeof f!=='function'))throw new TypeError('Explicit isolated lifecycle dependencies required');
  const drain=deps.drainController||createDrainController();
  for(const k of ['request','isDraining','admit','whenIdle'])if(typeof drain[k]!=='function')throw new TypeError('Drain controller required');
  const runtimeDeps=Object.freeze({...deps,drainController:drain});
  let state=drain.isDraining()?'PAUSED':'OPEN',inflight=null,pausing=null,draining=null,closing=null,reading=null,closeRequested=false;
  const blocked=e=>{state='BLOCKED';throw e;};
  function run(){
    if(state!=='OPEN'||drain.isDraining())return Promise.resolve({skipped:true,reasonCode:'WORKER_ADMISSION_PAUSED'});
    if(inflight)return inflight;
    const ticket=drain.admit();if(!ticket)return Promise.resolve({skipped:true,reasonCode:'WORKER_ADMISSION_PAUSED'});
    const p=Promise.resolve().then(()=>scan(runtimeDeps)).finally(()=>{try{ticket.release();}finally{if(inflight===p)inflight=null;}});inflight=p;return p;
  }
  function pause(){
    if(pausing)return pausing;
    if(['CLOSED','BLOCKED'].includes(state))return Promise.reject(Object.assign(new Error('Pause unavailable'),{code:'OVERSEAS_SHARED_PAUSE_UNAVAILABLE'}));
    state='PAUSING';drain.request();pausing=Promise.resolve().then(()=>stopAdmissions()).then(()=>{state='DRAINING';return {status:state};}).catch(blocked);return pausing;
  }
  function settle(){
    if(draining)return draining;
    draining=(async()=>{await pause();const p=inflight;if(p)try{await p;}catch{}
      await drain.whenIdle();const evidence=await verifyQuiescent();
      if(!evidence||['scanIdle','pollIdle','renewalsIdle','commitLanesIdle','leaseReleased'].some(k=>evidence[k]!==true))fail('OVERSEAS_SHARED_DRAIN_UNPROVEN');
      state='DRAINED';return Object.freeze({status:state,productionActivationAllowed:false});})().catch(blocked);return draining;
  }
  function rollbackAssessment(){
    if(closeRequested||['CLOSED','BLOCKED'].includes(state))return Promise.reject(Object.assign(new Error('Rollback unavailable'),{code:'OVERSEAS_SHARED_ROLLBACK_UNAVAILABLE'}));
    if(reading)return reading;
    const p=(async()=>{await settle();return assessRollbackInventory(await readRollbackInventory());})().finally(()=>{if(reading===p)reading=null;});reading=p;return p;
  }
  function close(){
    if(closing)return closing;closeRequested=true;
    closing=(async()=>{await settle();const p=reading;if(p)try{await p;}catch{}
      await runtimeDeps.closeOverseasCandidate();await runtimeDeps.repo.pool.end();state='CLOSED';return Object.freeze({status:state});})().catch(blocked);return closing;
  }
  return Object.freeze({run,pause,drain:settle,rollbackAssessment,close,deps:runtimeDeps,status:()=>state,productionActivationAllowed:false});
}
module.exports={createOverseasSharedRuntimeLifecycle,assessRollbackInventory};
