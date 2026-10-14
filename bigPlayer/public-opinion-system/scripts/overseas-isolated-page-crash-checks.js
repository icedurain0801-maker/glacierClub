'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const {createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {recoverManualProgress}=require('../worker/src/overseasManualProgressRecovery');
const {createOverseasRecoveryIntent}=require('../worker/src/overseasRecoveryIntent');
const check=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function checkPageCrashes({repo,receipt,root,directory,sourceId,childConfig}){
 const results=[];
 for(const phase of ['before','after','two-page','comments']){
  await repo.query('UPDATE po_sources SET collect_requested_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL -1 SECOND) WHERE id=?',[sourceId]);
  const [marker]=await repo.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[sourceId]);
  const request=await receipt.prepare({repo,sourceId,expectedMarker:marker.value,manifestSha256:'a'.repeat(64)});
  await repo.handoffOverseasManualMarker({request,receipt});
  const committed=phase!=='before',config={...childConfig,requestId:request.requestId,pageScenario:phase,mode:'page-first',faultBoundary:committed?'page_after_commit':'page_before_commit'};
  const child=spawn(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let output='',spawnError;child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',()=>{});
  let didExit=false;const exited=new Promise(resolve=>{child.once('exit',()=>{didExit=true;resolve();});child.once('error',error=>{spawnError=error;didExit=true;resolve();});});
  child.stdin.end(JSON.stringify(config));
  const expected=committed?'PAGE_AFTER_COMMIT':'PAGE_BEFORE_COMMIT';
  for(let i=0;i<500&&!output.includes(expected)&&child.exitCode===null&&!spawnError;i++)await pause(20);
  const observed=output.includes(expected);check(child.pid!==childConfig.serverPid,'ISOLATED_PAGE_CLIENT_PID');
  if(!didExit&&!spawnError)child.kill();
  let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>{if(!didExit)child.kill();reject(Object.assign(Error('ISOLATED_PAGE_CLIENT_EXIT_TIMEOUT'),{code:'ISOLATED_PAGE_CLIENT_EXIT_TIMEOUT'}));},15000);})]);}finally{clearTimeout(timer);}
  check(observed,'ISOLATED_PAGE_FAULT_MARKER');
  const binding=request.bindings.find(b=>b.siteId==='site-fr'),postId=phase==='comments'?905:phase==='two-page'?903:phase==='before'?901:902;
  const contents=await repo.query('SELECT * FROM po_contents WHERE external_id=?',[String(postId)]);
  check(contents.length===(committed?1:0),'ISOLATED_PAGE_COMMIT_STATE');
  const rows=await repo.query('SELECT * FROM po_sync_run_contents WHERE run_id=?',[binding.runId]);
  check(rows.length===(committed?1:0),'ISOLATED_PAGE_ASSOCIATION_STATE');
  if(!committed){for(const table of ['po_analysis_jobs','po_translation_jobs','po_content_feed_memberships']){
   const [{n}]=await repo.query(`SELECT COUNT(*) AS n FROM ${table} x JOIN po_contents c ON c.id=x.content_id WHERE c.external_id=?`,[String(postId)]);
   check(Number(n)===0,'ISOLATED_PAGE_ROLLBACK_'+table);
  }
   const cps=await repo.query('SELECT * FROM po_sync_checkpoints WHERE site_id=? AND window_start=? AND window_end=?',[binding.siteId,binding.windowStart,binding.windowEnd]);
   check(cps.length>0&&cps.every(cp=>Number(cp.items_fetched)===0&&cp.cursor===null),'ISOLATED_PAGE_ROLLBACK_CURSOR');
  }
  const [pageCheckpoint]=await repo.query("SELECT * FROM po_sync_checkpoints WHERE site_id=? AND window_start=? AND window_end=? AND task_kind='q1_feed' AND items_fetched=1",[binding.siteId,binding.windowStart,binding.windowEnd]);
  if(phase==='two-page')check(pageCheckpoint?.cursor&&JSON.parse(pageCheckpoint.cursor).offsetId===1&&pageCheckpoint.status==='running','ISOLATED_TWO_PAGE_CURSOR_NOT_COMMITTED');
  const snapshot=committed?JSON.stringify({content:contents,analysis:await repo.query('SELECT * FROM po_analysis_jobs WHERE content_id=?',[contents[0].id]),
   translation:await repo.query('SELECT * FROM po_translation_jobs WHERE content_id=?',[contents[0].id])}):null;
  const persistedPage=committed?JSON.stringify({associations:rows,membership:await repo.query('SELECT * FROM po_content_feed_memberships WHERE content_id=? ORDER BY id',[contents[0].id]),
   checkpoint:phase==='after'?pageCheckpoint:null}):null;
  const journalDir=path.join(directory,`page-${phase}-journal`),intentDir=path.join(directory,`page-${phase}-intents`);fs.mkdirSync(intentDir);
  const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
  let expired=false;
  for(let i=0;i<100;i++){
   const [run]=await repo.query('SELECT (lease_until<UTC_TIMESTAMP(3)) AS expired FROM po_sync_runs WHERE id=?',[binding.runId]);
   const [cp]=await repo.query('SELECT COUNT(*) AS n FROM po_sync_checkpoints WHERE site_id=? AND window_start=? AND window_end=? AND lease_until>=UTC_TIMESTAMP(3)',[binding.siteId,binding.windowStart,binding.windowEnd]);
   if(Number(run.expired)===1&&Number(cp.n)===0){expired=true;break;}await pause(100);
  }
  check(expired,'ISOLATED_PAGE_LEASE_EXPIRY');
  const plan=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:'a'.repeat(64)});
  const reader=await createOverseasRecoveryIntent({repositoryRoot:root,directory:intentDir,receipt,journal}),proof=await reader.prepare({plan,runId:binding.runId});
  const resumed=spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{encoding:'utf8',windowsHide:true,shell:false,timeout:30000,
   input:JSON.stringify({...childConfig,requestId:request.requestId,pageScenario:phase,mode:'page-reclaim',intentId:proof.intentId})});
  check(resumed.status===0,'ISOLATED_PAGE_RESUME_'+(resumed.stderr||'FAILED').trim());const execution=JSON.parse(resumed.stdout);
  check(execution.leaseEpoch===2&&execution.stored===(phase==='comments'?3:phase==='two-page'?2:1)&&execution.sqlCounts.recoveryClaim===1,'ISOLATED_PAGE_RESUME_COUNTS');
  if(snapshot&&phase!=='comments'){const content=contents[0];check(snapshot===JSON.stringify({content:await repo.query('SELECT * FROM po_contents WHERE external_id=?',[String(postId)]),
   analysis:await repo.query('SELECT * FROM po_analysis_jobs WHERE content_id=?',[content.id]),translation:await repo.query('SELECT * FROM po_translation_jobs WHERE content_id=?',[content.id])}),'ISOLATED_PAGE_COMMITTED_STATE_CHANGED');}
  if(persistedPage&&phase!=='comments'){check(persistedPage===JSON.stringify({associations:await repo.query('SELECT * FROM po_sync_run_contents WHERE run_id=? AND content_id=?',[binding.runId,contents[0].id]),
   membership:await repo.query('SELECT * FROM po_content_feed_memberships WHERE content_id=? ORDER BY id',[contents[0].id]),
   checkpoint:phase==='after'?(await repo.query('SELECT * FROM po_sync_checkpoints WHERE id=?',[pageCheckpoint.id]))[0]:null}),'ISOLATED_PAGE_COMMITTED_CURSOR_LINKS_CHANGED');}
  const completed=await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:'a'.repeat(64),intentReader:reader,intentIds:[proof.intentId]});
  check(completed.completedSites.length===1&&completed.completedSites[0].storedCount===execution.stored,'ISOLATED_PAGE_COMPLETED_PROOF');
  if(phase==='comments'){
   const [reply]=await repo.query('SELECT * FROM po_contents WHERE external_id=907');
   await repo.query('UPDATE po_contents SET parent_content_id=root_content_id WHERE id=?',[reply.id]);
   let ancestorDenied=false;try{await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:'a'.repeat(64),intentReader:reader,intentIds:[proof.intentId]});}catch{ancestorDenied=true;}
   await repo.query('UPDATE po_contents SET parent_content_id=? WHERE id=?',[reply.parent_content_id,reply.id]);check(ancestorDenied,'ISOLATED_COMMENT_BAD_ANCESTOR_ACCEPTED');
   const [membership]=await repo.query('SELECT * FROM po_content_feed_memberships WHERE content_id=? LIMIT 1',[contents[0].id]);
   await repo.query("UPDATE po_content_feed_memberships SET feed_metadata=JSON_SET(feed_metadata,'$.boardId','wrong') WHERE id=?",[membership.id]);
   let feedDenied=false;try{await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:'a'.repeat(64),intentReader:reader,intentIds:[proof.intentId]});}catch{feedDenied=true;}
   await repo.query('UPDATE po_content_feed_memberships SET feed_metadata=? WHERE id=?',[membership.feed_metadata,membership.id]);check(feedDenied,'ISOLATED_BAD_MEMBERSHIP_ACCEPTED');
   const [cp]=await repo.query("SELECT * FROM po_sync_checkpoints WHERE site_id=? AND window_start=? AND window_end=? AND task_kind='comments' AND root_platform_content_id='905'",[binding.siteId,binding.windowStart,binding.windowEnd]);
   check(cp,'ISOLATED_COMMENT_CHECKPOINT_MISSING');await repo.query('UPDATE po_sync_checkpoints SET task_key=? WHERE id=?',[`board:${binding.boardId}:wrong`,cp.id]);
   let taskDenied=false;try{await recoverManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:'a'.repeat(64),intentReader:reader,intentIds:[proof.intentId]});}catch{taskDenied=true;}
   await repo.query('UPDATE po_sync_checkpoints SET task_key=? WHERE id=?',[cp.task_key,cp.id]);check(taskDenied,'ISOLATED_BAD_COMMENT_TASK_ACCEPTED');
  }
  // Unused other site is explicitly terminalized as a failed SQL fixture, not completion proof.
  const first=request.bindings.find(b=>b.siteId==='site-en');
  const queued=await repo.claimSyncRun({runId:first.runId,leaseOwner:'isolated-page-other',leaseSeconds:30});
  check(queued,'ISOLATED_PAGE_OTHER_CLAIM');
  // Explicit terminal fixture: no claim-completion proof for this unrelated queued site.
  await repo.finishSyncRun(first.runId,{status:'failed',errorCode:'ISOLATED_UNUSED_SITE',leaseOwner:queued.lease_owner,leaseEpoch:1});
  results.push({phase,clientInterrupted:true,actualDatabaseCommitExecuted:committed,durableStored:execution.stored,resumedEpoch:2,
   originalAuditIncomplete:true,committedContentJobsUnchanged:committed&&phase!=='comments',execution,singlePageFixture:phase!=='two-page',realCursorResumed:phase==='two-page',
   syntheticCommentsAndMultifeed:phase==='comments',completedLineageRead:true,commentAncestorMembershipTaskTamperDenied:phase==='comments',otherSiteTerminalFixture:true});
 }
 return results;
}
module.exports={checkPageCrashes};
