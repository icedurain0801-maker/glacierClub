'use strict';
const {assertRecoveryIntentProof,assertRecoveryIntentContext}=require('./overseasRecoveryIntent');
const {isTrustedRunContractJournal}=require('./overseasBigPlayerRunContractJournal');
const {claimRecoveryRun,finishRecoveryRun,releaseRecoveryCheckpoint}=require('../../server/src/db/overseasRecoveryClaim');
const fail=()=>{throw Object.assign(Error('Recovery candidate invalid'),{code:'OVERSEAS_RECOVERY_CANDIDATE_INVALID'});};
const recoveryRepositories=new WeakMap();
function assertRecoveryClaimRepository(repo,{proof,journal}={}){
 const context=recoveryRepositories.get(repo);
 if(!context||context.proof!==proof||context.journal!==journal)fail();
 assertRecoveryIntentProof(proof);assertRecoveryIntentContext(proof,{journal});return true;
}
// Caller must possess the exact immutable intent. No scan, production activation,
// live-owner adoption or journal recreation from current config.
function assembleRecovery({proof,...options},stageCovered=false){
 assertRecoveryIntentProof(proof);
 assertRecoveryIntentContext(proof,{journal:options.journal,receipt:options.receipt});
 if(!isTrustedRunContractJournal(options.journal)||options.manifestSha256!==proof.scope.manifestSha256
  ||['initialContracts','initialRunBindings','recoveryProofs'].some(k=>Object.hasOwn(options,k)))fail();
 const original=options.baseDeps?.repo;if(!original)fail();let claimed=false;
 const routed=new Proxy(original,{get(target,key){
  // PageStore calls this with a same-connection facade as `this`; binding it
  // to original would escape the page transaction and wait on its own locks.
  if(key==='_upsertContentPageAttempt')return target[key];
  if(key==='claimSyncRun')return async input=>{
   if(input.runId!==proof.scope.runId||claimed)fail();claimed=true;
   return claimRecoveryRun(target,{proof,runId:input.runId,leaseSeconds:input.leaseSeconds});
  };
  if(key==='finishSyncRun')return (runId,patch)=>finishRecoveryRun(target,{proof,runId,...patch});
  if(key==='releaseSyncCheckpoint')return (checkpointId,patch)=>releaseRecoveryCheckpoint(target,{proof,checkpointId,...patch,leaseEpoch:proof.next.leaseEpoch});
  // Preserve dynamic receiver for every Repository method. PageStore facade
  // also invokes enqueueAnalysisJob/TranslationJob inside the pinned transaction.
  return Reflect.get(target,key,target);
 }});
 recoveryRepositories.set(routed,{proof,journal:options.journal});
 if(stageCovered){
  const {stageCoverage,boundAudit,request,...rest}=options;
  if(!require('./overseasStageCoverage').isOverseasStageCoverage(stageCoverage)
   ||!require('../../server/src/db/overseasBoundAudit').isOverseasBoundAudit(boundAudit))fail();
  stageCoverage.assertContext({repo:original,journal:options.journal,receipt:options.receipt});
  boundAudit.assertContext({repo:original,journal:options.journal,ledger:stageCoverage.ledger});
  const ledger=require('../../server/src/db/overseasStageCoverage').createOverseasStageCoverageLedger({journal:options.journal,receipt:options.receipt,request});
  const rebuiltCoverage=require('./overseasStageCoverage').createOverseasStageCoverage({repo:routed,ledger});
  const rebuiltAudit=require('../../server/src/db/overseasBoundAudit').createOverseasBoundAudit({repo:routed,journal:options.journal,ledger});
  return require('./overseasBigPlayerCandidateFactory').createStageCoveredIsolatedCandidateDeps({...rest,
   stageCoverage:rebuiltCoverage,boundAudit:rebuiltAudit,baseDeps:{...options.baseDeps,repo:routed},recoveryProofs:[proof]});
 }
 if(options.stageCoverage||options.boundAudit)fail();
 return require('./overseasBigPlayerCandidateFactory').createIsolatedOverseasCandidateDeps({...options,
  baseDeps:{...options.baseDeps,repo:routed},recoveryProofs:[proof]});
}
function createRecoveryIsolatedCandidateDeps(options={}){return assembleRecovery(options,false);}
function createStageCoveredRecoveryIsolatedCandidateDeps(options={}){return assembleRecovery(options,true);}
module.exports={createRecoveryIsolatedCandidateDeps,createStageCoveredRecoveryIsolatedCandidateDeps,assertRecoveryClaimRepository};
