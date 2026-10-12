'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const {createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createOverseasRecoveryIntent}=require('../worker/src/overseasRecoveryIntent');
const {recoverStageCoveredManualProgress}=require('../worker/src/overseasManualProgressRecovery');
const check=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function checkLedgerSealRecovery({repo,receipt,root,directory,sourceId,childConfig,caseName='seal-after'}){
 const cases={'seal-after':{root:960,fault:'seal_after_commit',marker:'LEDGER_SEAL_AFTER_COMMIT'},'comments-before':{root:970,fault:'comments_before_commit',marker:'LEDGER_COMMENTS_BEFORE_COMMIT'},'comments-after':{root:980,fault:'comments_after_commit',marker:'LEDGER_COMMENTS_AFTER_COMMIT'},'reply-before':{root:990,fault:'reply_before_commit',marker:'LEDGER_REPLY_BEFORE_COMMIT'},'reply-after':{root:1000,fault:'reply_after_commit',marker:'LEDGER_REPLY_AFTER_COMMIT'}};
 check(Object.hasOwn(cases,caseName),'LEDGER_RECOVERY_CASE');const scenario=cases[caseName],isSeal=caseName==='seal-after',isBefore=caseName==='comments-before',isReply=caseName.startsWith('reply-'),replyCommitted=caseName==='reply-after';
 const [[identity]]=await repo.pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir');
 check(Number(identity.port)===13316&&Number(identity.serverId)===20261036&&path.resolve(identity.datadir).toLowerCase()===path.join(directory,'data').toLowerCase(),'LEDGER_RECOVERY_ISOLATION');
 check(path.dirname(directory)===path.join(root,'.temp'),'LEDGER_RECOVERY_PATH');
 for(const p of [root,path.join(root,'.temp'),directory]){const s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(p)===p,'LEDGER_RECOVERY_PATH');}
 await repo.query('UPDATE po_sources SET collect_requested_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=?',[15+Object.keys(cases).indexOf(caseName),sourceId]);
 const [[marker]]=await repo.pool.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[sourceId]);
 const request=await receipt.prepare({repo,sourceId,expectedMarker:marker.value,manifestSha256:'a'.repeat(64)});await repo.handoffOverseasManualMarker({request,receipt});
 const b=request.bindings.find(x=>x.siteId==='site-fr');check(b,'LEDGER_RECOVERY_SITE');
 const config={...childConfig,requestId:request.requestId,ledger:true,ledgerComments:true,ledgerCase:caseName,mode:'page-first',faultBoundary:scenario.fault};
 const child=spawn(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
 let output='',didExit=false;child.stdout.on('data',d=>{output+=String(d);});child.stderr.on('data',()=>{});
 const exited=new Promise(resolve=>{child.once('exit',()=>{didExit=true;resolve();});child.once('error',()=>{didExit=true;resolve();});});
 child.stdin.end(JSON.stringify(config));let observed=false;
 try{for(let i=0;i<750&&!didExit;i++){if(output.includes(scenario.marker)){observed=true;break;}await pause(20);}}
 finally{if(!didExit){check(child.pid&&child.pid!==childConfig.serverPid,'LEDGER_RECOVERY_CHILD_PID');child.kill();}let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('LEDGER_CHILD_EXIT_TIMEOUT'),{code:'LEDGER_CHILD_EXIT_TIMEOUT'})),5000);})]);}finally{clearTimeout(timer);}}
 check(observed,'LEDGER_SEAL_CRASH_MARKER');
 const [before]=await repo.query('SELECT m.*,r.status AS run_status,r.lease_epoch FROM po_overseas_stage_manifests m JOIN po_sync_runs r ON r.id=m.run_id WHERE m.run_id=?',[b.runId]);
 check(before?.coverage_status===(isSeal?'sealed':'open')&&Number(before.history_sealed)===1&&Number(before.expansion_sealed)===(isSeal?1:0)&&before.run_status==='running'&&Number(before.lease_epoch)===1,'LEDGER_FAULT_MANIFEST_PERSISTED');
 async function durable(){return JSON.stringify({tasks:await repo.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256',[b.runId]),links:await repo.query('SELECT * FROM po_sync_run_contents WHERE run_id=? ORDER BY sequence_no',[b.runId])});}
 const dataBefore=await durable(),saved=JSON.parse(dataBefore);
 if(isSeal)check(saved.links.length===4&&saved.tasks.length>0&&saved.tasks.every(t=>t.state==='completed'),'LEDGER_SEAL_DURABLE');
 else if(isReply){
  check(saved.links.length===(replyCommitted?4:3),'LEDGER_REPLY_ATOMIC_LINKS');
  const commentTask=saved.tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='comments'&&d.rootPlatformContentId===String(scenario.root);});
  const replyTask=saved.tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='q1_reply'&&d.commentId===String(scenario.root+1)&&d.rootPlatformContentId===String(scenario.root);});
  check(commentTask?.state==='completed'&&replyTask?.state===(replyCommitted?'completed':'expected')&&JSON.parse(replyTask.origin_evidence).leaseEpoch===1,'LEDGER_REPLY_ATOMIC_TASKS');
  if(replyCommitted)check(Number(replyTask.completed_epoch)===1,'LEDGER_REPLY_COMPLETED_EPOCH1');
  const cps=await repo.query("SELECT * FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='q1_reply' AND task_key=? AND root_platform_content_id=? AND window_start=? AND window_end=?",[b.accountId,b.siteId,`board:${b.boardId}:reply:${scenario.root+1}:0`,String(scenario.root),b.windowStart,b.windowEnd]);
  check(cps.length===1&&cps[0].status===(replyCommitted?'completed':'running')&&Number(cps[0].items_fetched)===(replyCommitted?1:0)&&cps[0].cursor===null,'LEDGER_REPLY_ATOMIC_CP');
  const found=await repo.query('SELECT id,external_id,parent_content_id,root_content_id,content_depth FROM po_contents WHERE source_id=? AND external_id=?',[sourceId,String(scenario.root+3)]);
  check(found.length===(replyCommitted?1:0),'LEDGER_REPLY_ATOMIC_CONTENT');
  if(replyCommitted){const parent=await repo.query('SELECT id FROM po_contents WHERE source_id=? AND external_id=?',[sourceId,String(scenario.root+1)]);check(parent.length===1&&found[0].parent_content_id===parent[0].id&&Number(found[0].content_depth)===2,'LEDGER_REPLY_ATOMIC_ANCESTRY');}
  else for(const table of ['po_analysis_jobs','po_translation_jobs']){const [n]=await repo.query(`SELECT COUNT(*) AS n FROM ${table} j JOIN po_contents c ON c.id=j.content_id WHERE c.source_id=? AND c.external_id=?`,[sourceId,String(scenario.root+3)]);check(Number(n.n)===0,'LEDGER_REPLY_ROLLBACK_JOBS');}
 }
 else{
  check(saved.links.length===(isBefore?1:3),'LEDGER_COMMENTS_ATOMIC_LINKS');
  const commentTask=saved.tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='comments'&&d.rootPlatformContentId===String(scenario.root);});
  const replyTask=saved.tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='q1_reply'&&d.commentId===String(scenario.root+1);});
  check(commentTask&&commentTask.state===(isBefore?'expected':'completed')&&(isBefore?!replyTask:replyTask?.state==='expected'),'LEDGER_COMMENTS_ATOMIC_TASKS');
  const cps=await repo.query("SELECT * FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind='comments' AND root_platform_content_id=? AND window_start=? AND window_end=?",[b.accountId,b.siteId,String(scenario.root),b.windowStart,b.windowEnd]);
  check(cps.length===1&&cps[0].status===(isBefore?'running':'completed')&&Number(cps[0].items_fetched)===(isBefore?0:2)&&cps[0].cursor===null,'LEDGER_COMMENTS_ATOMIC_CP');
  const found=await repo.query('SELECT external_id FROM po_contents WHERE source_id=? AND external_id IN (?,?,?) ORDER BY external_id',[sourceId,String(scenario.root+1),String(scenario.root+2),String(scenario.root+3)]);
  check(found.length===(isBefore?0:2),'LEDGER_COMMENTS_ATOMIC_CONTENTS');
 }
 const committedIds=saved.links.map(x=>x.content_id);check(committedIds.length>0,'LEDGER_COMMITTED_IDS_EMPTY');
 async function committedJobs(){const out={};for(const table of ['po_analysis_jobs','po_translation_jobs']){out[table]=await repo.query(`SELECT * FROM ${table} WHERE content_id IN (${committedIds.map(()=>'?').join(',')}) ORDER BY content_id,id`,committedIds);check(out[table].length===committedIds.length,'LEDGER_COMMITTED_JOBS_MISSING');}return JSON.stringify(out);}
 const jobsBefore=await committedJobs();
 for(let i=0;i<100;i++){const [r]=await repo.query('SELECT (lease_until<UTC_TIMESTAMP(3)) AS expired FROM po_sync_runs WHERE id=?',[b.runId]);if(Number(r.expired)===1)break;check(i<99,'LEDGER_RECOVERY_EXPIRY');await pause(100);}
 const journalDir=path.join(directory,`ledger-${caseName}-journal`),intentDir=path.join(directory,`ledger-${caseName}-intents`);fs.mkdirSync(intentDir);
 const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
 const plan=await recoverStageCoveredManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:b.manifestSha256});check(plan.expiredSites.some(x=>x.binding.runId===b.runId),'LEDGER_RECOVERY_PLAN_EXPIRED');
 const reader=await createOverseasRecoveryIntent({repositoryRoot:root,directory:intentDir,receipt,journal}),proof=await reader.prepare({plan,runId:b.runId});
 const resumed=spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{windowsHide:true,shell:false,encoding:'utf8',timeout:30000,input:JSON.stringify({...childConfig,ledger:true,ledgerComments:true,ledgerCase:caseName,mode:'page-reclaim',requestId:request.requestId,intentId:proof.intentId})});
 check(resumed.status===0,'LEDGER_NEWNODE_RECOVERY_'+(resumed.stderr||'FAILED').trim());const execution=JSON.parse(resumed.stdout);
 check(execution.leaseEpoch===2&&execution.stored===4&&execution.sqlCounts.recoveryClaim===1,'LEDGER_NEWNODE_EXACT_RECOVERY');
 if(isSeal){check(execution.sqlCounts.content===0&&execution.sqlCounts.analysis===0&&execution.sqlCounts.translation===0,'LEDGER_NEWNODE_NO_REPLAY_WRITES');check(dataBefore===await durable(),'LEDGER_RECOVERY_DURABLE_CHANGED');}
 else{
  const roots=execution.commentRequests.filter(x=>x.postId===String(scenario.root)&&!x.commentId),replies=execution.commentRequests.filter(x=>x.postId===String(scenario.root)&&x.commentId===String(scenario.root+1));
  check(roots.length===(isBefore?1:0)&&replies.length===(replyCommitted?0:1),'LEDGER_COMMENT_REPLY_RECOVERY_HTTP_REPLAY');
  const current=JSON.parse(await durable()),reply=current.tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='q1_reply'&&d.commentId===String(scenario.root+1);});
  check(current.links.length===4&&reply?.state==='completed'&&Number(reply.completed_epoch)===(replyCommitted?1:2)&&JSON.parse(reply.origin_evidence).leaseEpoch===(isBefore?2:1),'LEDGER_REPLY_ORIGIN_COMPLETION_EPOCH');
  if(replyCommitted)check(JSON.stringify(current.links)===JSON.stringify(saved.links),'LEDGER_REPLY_COMMITTED_LINKS_CHANGED');
  for(const t of saved.tasks.filter(x=>x.state==='completed'))check(JSON.stringify(current.tasks.find(x=>x.task_identity_sha256===t.task_identity_sha256))===JSON.stringify(t),'LEDGER_COMMITTED_TASK_CHANGED');
 }
 check(jobsBefore===await committedJobs(),'LEDGER_COMMITTED_JOBS_CHANGED');
 const completed=await recoverStageCoveredManualProgress({repo,receipt,journal,requestIds:[request.requestId],manifestSha256:b.manifestSha256,intentReader:reader,intentIds:[proof.intentId]});check(completed.completedSites.some(x=>x.runId===b.runId&&x.leaseEpoch===2&&x.storedCount===4),'LEDGER_NEWNODE_COMPLETED_LINEAGE');
 const old=await repo.query("SELECT r.* FROM po_collection_runs r JOIN po_audit_events e ON JSON_UNQUOTE(JSON_EXTRACT(e.detail,'$.auditId'))=r.id WHERE e.event_type='overseas_bound_audit' AND JSON_UNQUOTE(JSON_EXTRACT(e.detail,'$.syncRunId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(e.detail,'$.leaseEpoch'))='1'",[b.runId]);check(old.length===1&&old[0].status==='running'&&old[0].finished_at===null,'LEDGER_OLD_AUDIT_AUTOMATICALLY_FINISHED');
 for(const unused of request.bindings.filter(x=>x.runId!==b.runId))await repo.query("UPDATE po_sync_runs SET status='failed',finished_at=UTC_TIMESTAMP(3),error_code='UNUSED_SYNTHETIC_SITE' WHERE id=? AND status='queued'",[unused.runId]);
 return {case:caseName,actualRunSourceExecuted:true,ownedClientInterrupted:true,newNodeRecovery:true,exactIntentId:proof.intentId,leaseEpoch:2,uniqueStored:4,committedJobsUnchanged:true,commentsPageCommittedBeforeInterrupt:caseName==='comments-after',replyPageInterrupted:isReply,replyPageCommittedBeforeInterrupt:replyCommitted,oldAuditManualReview:true,execution,realHttpExecuted:false,productionActivationAllowed:false};
}
module.exports={checkLedgerSealRecovery};
