'use strict';
const fs=require('node:fs'),path=require('node:path');
const {recoverManualProgress}=require('../worker/src/overseasManualProgressRecovery');
const {createOverseasRecoveryIntent}=require('../worker/src/overseasRecoveryIntent');
const {createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createOverseasClaimedContracts}=require('../worker/src/overseasBigPlayerClaimedContracts');
const {createOverseasNetworkContractVerifier}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const {claimRecoveryRun,reconcileRecoveryClaim,finishRecoveryRun,reconcileRecoveryTerminal}=require('../server/src/db/overseasRecoveryClaim');
const assert=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
// Only called by identity-verified isolated parent with its synthetic rows.
async function checkReclaim({repo,receipt,request,won,root,directory,childConfig}){
 const journalDir=path.join(directory,'reclaim-journal'),intentDir=path.join(directory,'intents');fs.mkdirSync(journalDir);fs.mkdirSync(intentDir);
 const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
 const binding=request.bindings.find(b=>b.runId===won.id);assert(binding,'ISOLATED_RECLAIM_BINDING');
 const source={id:binding.sourceId,game_id:binding.gameId,community_id:binding.communityId,platform:'bigplayer_h5',region_code:'overseas',siteId:binding.siteId,siteUrl:binding.siteUrl,
  config:{boardId:binding.boardId,baseUrl:binding.siteUrl,siteUrls:request.bindings.map(b=>({siteId:b.siteId,url:b.siteUrl,enabled:true}))}};
 const account={id:binding.accountId,source_id:binding.sourceId,game_id:binding.gameId,community_id:binding.communityId,platform:'bigplayer_h5'};
 const input={source,account,syncRunId:won.id,leaseOwner:won.lease_owner,leaseEpoch:1,windowStart:binding.windowStart,windowEnd:binding.windowEnd};
 const manager=createOverseasClaimedContracts({repo,journal,manifestSha256:binding.manifestSha256,initialRunBindings:[binding]});
 const old=await manager.prepare(input);
 assert(await repo.renewSyncRunLease(won.id,won.lease_owner,1,1),'ISOLATED_EXPIRE_SETUP');
 await new Promise(resolve=>setTimeout(resolve,1250));
 const plan=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256});
 assert(plan.expiredSites.length===1,'ISOLATED_EXPIRED_PLAN');
 const intents=await createOverseasRecoveryIntent({repositoryRoot:root,directory:intentDir,receipt,journal});
 const proof=await intents.prepare({plan,runId:won.id}),same=await intents.prepare({plan,runId:won.id});
 assert(proof.intentId===same.intentId&&proof.next.leaseOwner===same.next.leaseOwner,'ISOLATED_INTENT_REPLAY');
 assert((await reconcileRecoveryClaim(repo,{proof})).status==='not_committed','ISOLATED_INTENT_BEFORE_CAS');
 const {createOverseasDispatchGuard,bindOverseasDispatchScope}=require('../worker/src/overseasBigPlayerDispatchGuard');
 bindOverseasDispatchScope(source,account,old);
 let transportCalls=0,respond;
 const guard=createOverseasDispatchGuard({repo,journal,manifestSha256:binding.manifestSha256,
  transport(){transportCalls++;return new Promise(resolve=>{respond=resolve;});}});
 // Isolated setup gives epoch1 a short live lease to test a real dispatched response.
 // Only fixture owner is renewed; no production consumer or upstream request.
 const rearmed=await repo.query('UPDATE po_sync_runs SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=? AND lease_owner=? AND lease_epoch=1',[won.id,won.lease_owner]);
 assert(rearmed?.affectedRows===1,'ISOLATED_DISPATCH_REARM');
 const delayed=guard.invoke(source,account,()=>guard.transport(new URL('/api/club/v1/fixture-delayed',binding.siteUrl)));
 for(let i=0;i<100&&!respond;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert(transportCalls===1&&respond,'ISOLATED_DELAYED_DISPATCH_NOT_STARTED');
 await new Promise(resolve=>setTimeout(resolve,1250));
 let continuePreparation;
 const preparation=new Promise(resolve=>{continuePreparation=resolve;});
 const staleDispatch=guard.invoke({...source},account,async()=>{await preparation;return guard.transport(new URL('/api/club/v1/fixture-stale',binding.siteUrl));});
 staleDispatch.catch(()=>{});
 const claims=await Promise.all([claimRecoveryRun(repo,{proof,runId:won.id,leaseSeconds:1}),claimRecoveryRun(repo,{proof,runId:won.id,leaseSeconds:1})]);
 assert(claims.filter(Boolean).length===1,'ISOLATED_EXACT_RECLAIM_RACE');const next=claims.find(Boolean);
 assert(next.lease_epoch===2&&next.attempts===2&&next.lease_owner===proof.next.leaseOwner,'ISOLATED_RECLAIM_EPOCH');
 continuePreparation();let staleDenied=false;
 try{await staleDispatch;}catch(error){staleDenied=error.code==='OVERSEAS_NETWORK_CONTRACT_UNVERIFIED';}
 assert(staleDenied&&transportCalls===1,'ISOLATED_STALE_DISPATCH_ALLOWED');
 respond({ok:true});await delayed;
 const {createOverseasBigPlayerPageStore:pageStore}=require('../worker/src/overseasBigPlayerPageStore');
 // Deliberately pass an earlier preflight result; the actual page transaction must re-fence.
 const previouslyVerified=pageStore({repo,verifyRunContract:async()=>true});
 let delayedWriteDenied=false;
 try{await previouslyVerified.upsertContentPage({source,account,syncRunId:won.id,leaseOwner:won.lease_owner,syncScope:'posts',items:[],runContract:old});}
 catch(error){delayedWriteDenied=error.code==='OVERSEAS_STORE_RUN_SCOPE_CONFLICT';}
 assert(delayedWriteDenied,'ISOLATED_DELAYED_RESPONSE_WRITE_ALLOWED');
 const reconcile=await reconcileRecoveryClaim(repo,{proof});assert(reconcile.status==='accepted'&&reconcile.live,'ISOLATED_INTENT_AFTER_CAS');
 const resumed=createOverseasClaimedContracts({repo,journal,manifestSha256:binding.manifestSha256,recoveryProofs:[proof]});
 const contract=await resumed.prepare({...input,leaseOwner:next.lease_owner,leaseEpoch:2});await journal.read(contract);
 assert(contract.siteUrl===old.siteUrl&&contract.windowStart===old.windowStart&&fs.readdirSync(journalDir).length===2,'ISOLATED_JOURNAL_LINEAGE');
 assert(!await repo.renewSyncRunLease(won.id,won.lease_owner,30,1),'ISOLATED_OLD_OWNER_RENEWED');
 assert(await repo.finishSyncRun(won.id,{status:'failed',leaseOwner:won.lease_owner,leaseEpoch:1})===null,'ISOLATED_OLD_OWNER_TERMINAL');
 let denied=false;try{await createOverseasNetworkContractVerifier({repo,journal,manifestSha256:binding.manifestSha256})(old);}catch{denied=true;}assert(denied,'ISOLATED_OLD_OWNER_NETWORK_ALLOWED');
 const {createOverseasBigPlayerPageStore}=require('../worker/src/overseasBigPlayerPageStore');
 const store=createOverseasBigPlayerPageStore({repo,verifyRunContract:createOverseasNetworkContractVerifier({repo,journal,manifestSha256:binding.manifestSha256})});
 denied=false;try{await store.upsertContentPage({source,account,syncRunId:won.id,leaseOwner:won.lease_owner,syncScope:'posts',items:[],runContract:old});}catch{denied=true;}assert(denied,'ISOLATED_OLD_OWNER_PAGE_ALLOWED');
 assert(await repo.renewSyncRunLease(won.id,next.lease_owner,1,2),'ISOLATED_RECLAIM_EXPIRE_SETUP');await new Promise(resolve=>setTimeout(resolve,1250));
 const thirdPlan=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256});
 const thirdProof=await intents.prepare({plan:thirdPlan,runId:won.id});
 const {spawn}=require('node:child_process');
 const interrupted=spawn(process.execPath,[path.join(__dirname,'overseas-isolated-claim-client.js'),'--isolated-child'],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 let marker='',clientError='';interrupted.stdout.on('data',data=>{marker+=String(data);});interrupted.stderr.on('data',data=>{clientError+=String(data);});
 const clientExited=new Promise(resolve=>{interrupted.once('exit',(code,signal)=>resolve({code,signal}));interrupted.once('error',error=>{clientError=error.code||'SPAWN_FAILED';resolve({error:true});});});
 async function awaitClientExit(){let timer;try{return await Promise.race([clientExited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('ISOLATED_CLIENT_EXIT_TIMEOUT'),{code:'ISOLATED_CLIENT_EXIT_TIMEOUT'})),5000);})]);}finally{clearTimeout(timer);}}
 interrupted.stdin.end(JSON.stringify({...childConfig,intentId:thirdProof.intentId}));
 for(let i=0;i<300&&!marker.includes('CLAIM_COMMITTED_JOURNAL_NOT_PUBLISHED')&&interrupted.exitCode===null;i++)await new Promise(resolve=>setTimeout(resolve,20));
 if(!marker.includes('CLAIM_COMMITTED_JOURNAL_NOT_PUBLISHED')){if(interrupted.exitCode===null)interrupted.kill();await awaitClientExit();throw Object.assign(Error('ISOLATED_CLAIM_CLIENT_MARKER'),{code:'ISOLATED_CLAIM_CLIENT_MARKER'});}
 assert(interrupted.pid!==childConfig.serverPid,'ISOLATED_CLIENT_PID_CONFLICT');
 interrupted.kill();await awaitClientExit();
 assert(!fs.existsSync(path.join(journalDir,`overseas-run-${won.id}-epoch-3.json`)),'ISOLATED_CRASH_JOURNAL_PRESENT');
 const claimRead=await reconcileRecoveryClaim(repo,{proof:thirdProof});assert(claimRead.status==='accepted','ISOLATED_CRASH_CLAIM_NOT_COMMITTED');
 const repair=require('../worker/src/overseasRecoveryJournalRepair').restoreCommittedRecoveryJournal;
 if(claimRead.live){
  let liveDenied=false;try{await repair({repo,intentReader:intents,intentId:thirdProof.intentId,intentIds:[proof.intentId],journal,receipt});}
  catch(error){liveDenied=error.code==='OVERSEAS_RECOVERY_JOURNAL_REPAIR_UNVERIFIED';}
  assert(liveDenied&&!fs.existsSync(path.join(journalDir,`overseas-run-${won.id}-epoch-3.json`)),'ISOLATED_LIVE_JOURNAL_REPAIR_ALLOWED');
 }
 await new Promise(resolve=>setTimeout(resolve,1250));
 const restored=await repair({repo,intentReader:intents,
  intentId:thirdProof.intentId,intentIds:[proof.intentId],journal,receipt});
 assert(restored.journalRestored&&restored.claimExecuted===false&&restored.httpExecuted===false,'ISOLATED_CRASH_JOURNAL_REPAIR');
 const beforeRepeat=fs.readdirSync(journalDir).sort().join(',');
 const repeat=await repair({repo,intentReader:intents,intentId:thirdProof.intentId,intentIds:[proof.intentId],journal,receipt});
 assert(repeat.alreadyPresent&&fs.readdirSync(journalDir).sort().join(',')===beforeRepeat,'ISOLATED_JOURNAL_REPAIR_REPLAY');
 const fourthPlan=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256});
 const fourthProof=await intents.prepare({plan:fourthPlan,runId:won.id});
 const child=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{
  encoding:'utf8',windowsHide:true,shell:false,timeout:30000,input:JSON.stringify({...childConfig,mode:'reclaim',intentId:fourthProof.intentId,requestId:request.requestId})});
 if(child.status!==0)throw Object.assign(Error('ISOLATED_NEW_PROCESS_RECLAIM_FAILED'),{code:/^[A-Z0-9_]+\s*$/.test(child.stderr||'')?child.stderr.trim():'ISOLATED_NEW_PROCESS_RECLAIM_FAILED'});
 const execution=JSON.parse(child.stdout);assert(execution.actualRunSourceExecuted===true&&execution.leaseEpoch===4&&execution.stored===1,'ISOLATED_NEW_PROCESS_RECLAIM_FAILED');
 const completed=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256,
  intentReader:intents,intentIds:[proof.intentId,thirdProof.intentId,fourthProof.intentId]});
 assert(completed.completedSites.length===1&&completed.completedSites[0].leaseEpoch===4,'ISOLATED_EPOCH4_COMPLETED_LINEAGE');
 let missingLineageDenied=false;
 try{await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256,
  intentReader:intents,intentIds:[thirdProof.intentId,fourthProof.intentId]});}catch(error){missingLineageDenied=error.code==='OVERSEAS_RECOVERY_LINEAGE_UNVERIFIED';}
 assert(missingLineageDenied,'ISOLATED_PARTIAL_LINEAGE_ALLOWED');
 // Separate remaining site: terminal ACK-loss fixture, not a collection-completion proof.
 const terminalBinding=request.bindings.find(b=>b.runId!==won.id);
 const terminalFirst=await repo.claimSyncRun({runId:terminalBinding.runId,leaseOwner:'isolated-terminal-ack',leaseSeconds:1});
 assert(terminalFirst&&terminalFirst.lease_epoch===1,'ISOLATED_TERMINAL_FIRST_CLAIM');
 await journal.create({...terminalBinding,leaseOwner:terminalFirst.lease_owner,leaseEpoch:1});
 await new Promise(resolve=>setTimeout(resolve,1250));
 const terminalPlan=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:binding.manifestSha256,
  intentReader:intents,intentIds:[proof.intentId,thirdProof.intentId,fourthProof.intentId]});
 const terminalProof=await intents.prepare({plan:terminalPlan,runId:terminalBinding.runId});
 const terminalRun=await claimRecoveryRun(repo,{proof:terminalProof,runId:terminalBinding.runId,leaseSeconds:30});
 assert(terminalRun&&terminalRun.lease_epoch===2,'ISOLATED_TERMINAL_SECOND_CLAIM');
 const beforeOther=JSON.stringify({audits:await repo.query('SELECT * FROM po_collection_runs ORDER BY id'),
  source:await repo.query('SELECT * FROM po_sources ORDER BY id'),checkpoints:await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id')});
 const unknownRepo=Object.create(repo);let destroys=0;
 unknownRepo.pool={getConnection:async()=>{const conn=await repo.pool.getConnection();return {
  query:(sql,params)=>conn.query(sql,params),beginTransaction:()=>conn.beginTransaction(),rollback:()=>conn.rollback(),release:()=>conn.release(),
  destroy(){destroys++;conn.destroy();},async commit(){await conn.commit();throw Object.assign(Error('synthetic-terminal-ack-loss'),{code:'SYNTHETIC_ACK_LOSS'});}
 };}};
 let terminalUnknown=false;
 try{await finishRecoveryRun(unknownRepo,{proof:terminalProof,runId:terminalBinding.runId,leaseOwner:terminalRun.lease_owner,leaseEpoch:2,status:'completed_authorized_scope'});}
 catch(error){terminalUnknown=error.code==='OVERSEAS_RECOVERY_TERMINAL_COMMIT_UNKNOWN';}
 assert(terminalUnknown&&destroys===1,'ISOLATED_TERMINAL_ACK_UNKNOWN');
 const terminalRead=await reconcileRecoveryTerminal(repo,{proof:terminalProof,status:'completed_authorized_scope'});
 assert(terminalRead.status==='accepted'&&terminalRead.automaticWriteAllowed===false,'ISOLATED_TERMINAL_ACK_RECONCILE');
 const afterOther=JSON.stringify({audits:await repo.query('SELECT * FROM po_collection_runs ORDER BY id'),
  source:await repo.query('SELECT * FROM po_sources ORDER BY id'),checkpoints:await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id')});
 assert(beforeOther===afterOther,'ISOLATED_TERMINAL_ACK_CHANGED_OTHER_STATE');
 return {epoch:2,intentReplay:true,exactCasWinners:1,lineageJournals:2,oldOwnerNetworkPageRenewTerminalDenied:true,naturalLeaseExpiry:true,
  actualRunSourceResumeExecuted:true,resumedEpoch:4,execution,clientCrashTested:true,clientCrashBoundary:'claim_commit_before_journal',journalRepairedFromExplicitIntent:true,
  collectionCompletionProved:true,syntheticTransport:true,epoch4CompletedLineageRead:true,partialLineageDenied:true,repairReplayNoNewFile:true,
  terminalAckLoss:{realCommit:true,readonlyAccepted:true,connectionDestroyed:true,auditSourceCheckpointsUnchanged:true,sqlFixtureOnly:true,collectionCompletionProved:false},
  realSqlDispatchRace:{staleTransportCalls:0,initiatedTransportCalls:1,delayedResponseTransactionFenceDenied:true}};
}
module.exports={checkReclaim};
