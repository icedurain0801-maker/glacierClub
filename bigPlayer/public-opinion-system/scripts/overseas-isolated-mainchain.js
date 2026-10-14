'use strict';
// Explicit synthetic child only; never load buildDeps, env files or worker main.
const fs=require('node:fs'),path=require('node:path'),mysql=require('mysql2/promise');
const {Repository}=require('../server/src/db/repository');
const {createOverseasManualReceipt}=require('../worker/src/overseasManualReceipt');
const {recoverManualFirstRunBindings,createRecoveredIsolatedOverseasCandidateDeps}=require('../worker/src/overseasManualFirstClaimRecovery');
const {createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const assert=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
async function installMainchainSchema(control){
 const changes=[
  "po_games ADD name VARCHAR(120) DEFAULT 'synthetic'",
  "po_communities ADD name VARCHAR(120) DEFAULT 'synthetic'",
  "po_sources ADD display_name VARCHAR(120) DEFAULT 'synthetic', ADD frequency_seconds INT DEFAULT 300, ADD active_window JSON NULL, ADD last_success_at DATETIME(3), ADD last_error TEXT",
  "po_accounts ADD platform_account_id VARCHAR(160), ADD account_name VARCHAR(160), ADD metadata JSON NULL, ADD updated_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3)",
  "po_sync_runs ADD requested_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3), ADD last_request_at DATETIME(3), ADD discovered_count INT DEFAULT 0, ADD stored_count INT DEFAULT 0, ADD fetched_count INT DEFAULT 0, ADD inserted_count INT DEFAULT 0, ADD changed_count INT DEFAULT 0, ADD unchanged_count INT DEFAULT 0, ADD comment_count INT DEFAULT 0, ADD error_code VARCHAR(120), ADD error_message TEXT",
  "po_sync_checkpoints ADD sync_mode VARCHAR(30), ADD `cursor` TEXT, ADD items_fetched INT DEFAULT 0, ADD lease_owner VARCHAR(160), ADD lease_until DATETIME(3), ADD error_code VARCHAR(120), ADD error_message TEXT, ADD updated_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3), ADD UNIQUE KEY checkpoint_identity(account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end)"
 ];
 for(const change of changes)await control.query('ALTER TABLE '+change);
 const tables=[
  'po_contents(id CHAR(36) PRIMARY KEY,game_id CHAR(36),community_id CHAR(36),source_id CHAR(36),account_id CHAR(36),external_id VARCHAR(255),content_type VARCHAR(20),platform_author_id VARCHAR(160),root_content_id CHAR(36),parent_content_id CHAR(36),platform_parent_id VARCHAR(255),content_depth INT DEFAULT 0,is_deleted INT DEFAULT 0,author_name VARCHAR(160),title TEXT,body MEDIUMTEXT,media JSON,published_at DATETIME(3),source_url TEXT,engagement JSON,fingerprint CHAR(64),raw_payload JSON,first_seen_at DATETIME(3),last_seen_at DATETIME(3),UNIQUE KEY source_external(source_id,external_id),UNIQUE KEY source_fingerprint(source_id,fingerprint))',
  'po_sync_run_contents(sequence_no BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,run_id CHAR(36),content_id CHAR(36),change_type VARCHAR(20),sync_scope VARCHAR(20),fetched_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),UNIQUE KEY association(run_id,content_id,sync_scope),FOREIGN KEY(run_id) REFERENCES po_sync_runs(id),FOREIGN KEY(content_id) REFERENCES po_contents(id))',
  'po_content_feed_memberships(id CHAR(36) PRIMARY KEY,account_id CHAR(36),content_id CHAR(36),feed_key VARCHAR(255),page_kind VARCHAR(40),section_id VARCHAR(255),feed_metadata JSON,first_seen_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),last_seen_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),UNIQUE KEY membership(account_id,content_id,feed_key),FOREIGN KEY(content_id) REFERENCES po_contents(id))',
  "po_analysis_jobs(id CHAR(36) PRIMARY KEY,content_id CHAR(36),analysis_profile VARCHAR(20),analysis_version VARCHAR(80),content_fingerprint CHAR(64),trigger_reason VARCHAR(255),matched_keywords JSON,status VARCHAR(30) DEFAULT 'pending',attempts INT DEFAULT 0,next_retry_at DATETIME(3),error_code VARCHAR(120),error_message TEXT,lease_owner VARCHAR(160),lease_until DATETIME(3),created_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),updated_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),completed_at DATETIME(3),UNIQUE KEY job_identity(content_id,analysis_version,analysis_profile),FOREIGN KEY(content_id) REFERENCES po_contents(id))",
  "po_translation_jobs(id CHAR(36) PRIMARY KEY,content_id CHAR(36),target_language VARCHAR(20),translation_version VARCHAR(80),content_fingerprint CHAR(64),status VARCHAR(30) DEFAULT 'pending',attempts INT DEFAULT 0,next_retry_at DATETIME(3),error_code VARCHAR(120),error_message TEXT,lease_owner VARCHAR(160),lease_until DATETIME(3),created_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),updated_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),completed_at DATETIME(3),UNIQUE KEY job_identity(content_id,target_language,translation_version),FOREIGN KEY(content_id) REFERENCES po_contents(id))",
  "po_collection_runs(id CHAR(36) PRIMARY KEY,source_id CHAR(36),status VARCHAR(30),started_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),finished_at DATETIME(3),discovered_count INT DEFAULT 0,stored_count INT DEFAULT 0,analyzed_count INT DEFAULT 0,alerted_count INT DEFAULT 0,error_code VARCHAR(120),error_message TEXT)",
  'po_keyword_rules(id CHAR(36) PRIMARY KEY,game_id CHAR(36),community_id CHAR(36),platform VARCHAR(30),keyword VARCHAR(120),group_name VARCHAR(80),severity VARCHAR(20),threshold_count INT DEFAULT 1,enabled INT DEFAULT 1,created_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3))'
 ];
 for(const table of tables)await control.query('CREATE TABLE '+table+' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
 await control.query('CREATE TABLE po_audit_events (id CHAR(36) PRIMARY KEY,game_id CHAR(36),source_id CHAR(36),account_id CHAR(36),actor_type VARCHAR(30),event_type VARCHAR(80),outcome VARCHAR(30),detail LONGTEXT,created_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3)) ENGINE=InnoDB');
 for(const sql of require('../server/src/db/overseasStageCoverageSchema').statements)await control.query(sql);
}
async function runChild(c){
 assert(c.faultBoundary==null||['page_before_commit','page_after_commit','seal_after_commit','comments_before_commit','comments_after_commit','reply_before_commit','reply_after_commit'].includes(c.faultBoundary),'ISOLATED_FAULT_BOUNDARY');
 const ledgerRoots={'seal-after':960,'comments-before':970,'comments-after':980,'reply-before':990,'reply-after':1000};
 assert(c.ledgerCase==null||Object.hasOwn(ledgerRoots,c.ledgerCase),'ISOLATED_LEDGER_CASE');
 assert(!c.ledgerCase||(c.ledger===true&&c.ledgerComments===true&&['page-first','page-reclaim'].includes(c.mode)&&c.pageScenario==null),'ISOLATED_LEDGER_CASE_BINDING');
 assert(c.faultBoundary!=='seal_after_commit'||(c.ledgerCase==='seal-after'&&c.mode==='page-first'),'ISOLATED_LEDGER_SEAL_FAULT');
 if(c.faultBoundary?.startsWith('comments_'))assert(c.mode==='page-first'&&c.faultBoundary===`comments_${c.ledgerCase==='comments-before'?'before':'after'}_commit`&&['comments-before','comments-after'].includes(c.ledgerCase),'ISOLATED_LEDGER_COMMENT_FAULT');
 if(c.faultBoundary?.startsWith('reply_'))assert(c.mode==='page-first'&&['reply-before','reply-after'].includes(c.ledgerCase)&&c.faultBoundary===`reply_${c.ledgerCase==='reply-before'?'before':'after'}_commit`,'ISOLATED_LEDGER_REPLY_FAULT');
 assert(c.pageScenario==null||['before','after','two-page','comments'].includes(c.pageScenario),'ISOLATED_PAGE_SCENARIO');
 const root=path.resolve(__dirname,'../../..'),temp=path.join(root,'.temp');
 assert(c?.db?.host==='127.0.0.1'&&c.db.port===13316&&c.serverId===20261036
  &&c.db.database==='po_overseas_fixture'&&c.db.user==='po_overseas_fixture'&&c.db.connectionLimit===4,'ISOLATED_CHILD_CONFIG');
 assert(typeof c.directory==='string'&&path.dirname(c.directory)===temp&&c.dataDir===path.join(c.directory,'data')
  &&c.receipt?.repositoryRoot===root&&c.receipt.directory===path.join(c.directory,'receipts'),'ISOLATED_CHILD_PATH');
 for(const dir of [root,temp,c.directory,c.dataDir,c.receipt.directory]){
  const stat=fs.lstatSync(dir);assert(stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(dir)===dir,'ISOLATED_CHILD_PATH');
 }
 const pool=mysql.createPool(c.db);let candidate;
 try{
  const [[identity]]=await pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile,VERSION() AS version');
  assert(identity.port===13316&&identity.serverId===20261036&&identity.version==='10.4.14-MariaDB'
   &&path.resolve(identity.datadir).toLowerCase()===c.dataDir.toLowerCase()
   &&path.resolve(identity.pidFile).toLowerCase()===path.join(c.directory,'mysqld.pid').toLowerCase()
   &&Number(fs.readFileSync(identity.pidFile,'utf8').trim())===c.serverPid,'ISOLATED_CHILD_IDENTITY');
  const sqlCounts={claim:0,recoveryClaim:0,renew:0,content:0,analysis:0,translation:0,terminal:0,writes:0};
  const observe=sql=>{
   if(/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql))sqlCounts.writes++;
   if(sql.startsWith("UPDATE po_sync_runs SET status='running'"))sqlCounts.claim++;
   if(sql.startsWith('UPDATE po_sync_runs SET lease_owner=?,lease_epoch=lease_epoch+1,attempts=attempts+1'))sqlCounts.recoveryClaim++;
   if(sql.startsWith('UPDATE po_sync_runs SET lease_until'))sqlCounts.renew++;
   if(sql.startsWith('INSERT INTO po_contents'))sqlCounts.content++;
   if(sql.startsWith('INSERT INTO po_analysis_jobs'))sqlCounts.analysis++;
   if(sql.startsWith('INSERT INTO po_translation_jobs'))sqlCounts.translation++;
   if(/^UPDATE po_sync_runs SET status=\?,\s*finished_at/.test(sql))sqlCounts.terminal++;
  };
  // Observation only: every query/transaction still executes on mysql2.
  const observedPool={query:async(sql,params)=>{observe(sql);return pool.query(sql,params);},getConnection:async()=>{
   const conn=await pool.getConnection();let pageTxn=false,sealTxn=false,commentsTxn=false,replyTxn=false;return new Proxy(conn,{get(target,key){
    if(key==='query')return async(sql,params)=>{
     if(sql.startsWith('INSERT INTO po_contents')){pageTxn=true;const columns=sql.match(/^INSERT INTO po_contents \(([^)]+)\)/)?.[1].split(',').map(v=>v.trim());
      const externalIndex=columns?.indexOf('external_id');if(c.ledgerCase&&externalIndex>=0){const externalId=String(params?.[externalIndex]);if(externalId===String(ledgerRoots[c.ledgerCase]+1))commentsTxn=true;if(externalId===String(ledgerRoots[c.ledgerCase]+3))replyTxn=true;}}
     if(sql.startsWith('UPDATE po_overseas_stage_manifests SET expansion_sealed=1'))sealTxn=true;observe(sql);return target.query(sql,params);
    };
    if(key==='commit')return async()=>{
     if(replyTxn&&c.faultBoundary==='reply_before_commit'){process.stdout.write('LEDGER_REPLY_BEFORE_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     if(commentsTxn&&c.faultBoundary==='comments_before_commit'){process.stdout.write('LEDGER_COMMENTS_BEFORE_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     if(pageTxn&&c.faultBoundary==='page_before_commit'){process.stdout.write('PAGE_BEFORE_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     await target.commit();
     if(replyTxn&&c.faultBoundary==='reply_after_commit'){process.stdout.write('LEDGER_REPLY_AFTER_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     if(commentsTxn&&c.faultBoundary==='comments_after_commit'){process.stdout.write('LEDGER_COMMENTS_AFTER_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     if(sealTxn&&c.faultBoundary==='seal_after_commit'){process.stdout.write('LEDGER_SEAL_AFTER_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     if(pageTxn&&c.faultBoundary==='page_after_commit'){process.stdout.write('PAGE_AFTER_COMMIT\n');await new Promise(()=>{setInterval(()=>{},1000);});}
     pageTxn=false;sealTxn=false;commentsTxn=false;replyTxn=false;
    };
    if(key==='rollback')return async()=>{try{return await target.rollback();}finally{pageTxn=false;sealTxn=false;commentsTxn=false;replyTxn=false;}};
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   }});
  }};
  const repo=Object.create(Repository.prototype);Object.assign(repo,{pool:observedPool,advisoryLocks:new Map(),claimDeadlockMaxAttempts:1,syncUpsertLockWaitSeconds:3});
  repo.query=async(sql,params=[])=>{const [rows]=await observedPool.query(sql,params);
   // Observe the exact successful queued0 CAS; no reliance on ordinary claim wrapper.
   if(sql.startsWith("UPDATE po_sync_runs SET status='running'")&&rows.affectedRows===1)claimedOwner=params[0];return rows;};
  let claimedOwner;
  const actualClaim=repo.claimSyncRun.bind(repo);
  repo.claimSyncRun=async input=>{const claimed=await actualClaim(input);if(claimed)claimedOwner=claimed.lease_owner;return claimed;};
  // Optional board display write has no current-schema fallback; no other SQL is stubbed.
  repo.setRunBoardName=undefined;
  const receipt=await createOverseasManualReceipt(c.receipt);
  assert(c.mode===undefined||['progress','reclaim','page-first','page-reclaim'].includes(c.mode),'ISOLATED_CHILD_MODE');
  const request=await receipt.recover(c.requestId);
  const bindings=c.mode?request.bindings:await recoverManualFirstRunBindings({repo,receipt,requestIds:[c.requestId],manifestSha256:'a'.repeat(64)});
  assert(bindings.length===2,'ISOLATED_CHILD_SCOPES');const target=bindings.find(b=>b.siteId===(c.mode?'site-fr':'site-en'));assert(target,'ISOLATED_CHILD_TARGET');
  const isRecovery=['reclaim','page-reclaim'].includes(c.mode),isPage=Boolean(c.pageScenario);
  const journalDir=path.join(c.directory,c.ledgerCase?`ledger-${c.ledgerCase}-journal`:c.ledger?'ledger-journal':isPage?`page-${c.pageScenario}-journal`:c.mode==='reclaim'?'reclaim-journal':'journal');if(!c.mode||c.mode==='page-first')fs.mkdirSync(journalDir);
  const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
  async function evidence(siteId){
   const b=bindings.find(b=>b.siteId===siteId),out={};
   for(const [key,sql,params] of [
    ['run','SELECT * FROM po_sync_runs WHERE id=?',[b.runId]],
    ['checkpoints','SELECT * FROM po_sync_checkpoints WHERE site_id=? ORDER BY id',[siteId]],
    ['contents',"SELECT * FROM po_contents WHERE JSON_UNQUOTE(JSON_EXTRACT(raw_payload,'$._overseasScope.siteId'))=? ORDER BY id",[siteId]],
    ['links','SELECT * FROM po_sync_run_contents WHERE run_id=? ORDER BY sequence_no',[b.runId]],
    ['membership','SELECT m.* FROM po_content_feed_memberships m JOIN po_sync_run_contents rc ON rc.content_id=m.content_id WHERE rc.run_id=? ORDER BY m.id',[b.runId]],
    ['analysis','SELECT j.* FROM po_analysis_jobs j JOIN po_sync_run_contents rc ON rc.content_id=j.content_id WHERE rc.run_id=? ORDER BY j.id',[b.runId]],
    ['translation','SELECT j.* FROM po_translation_jobs j JOIN po_sync_run_contents rc ON rc.content_id=j.content_id WHERE rc.run_id=? ORDER BY j.id',[b.runId]]
   ])out[key]=(await pool.query(sql,params))[0];
   out.journal=fs.readFileSync(path.join(journalDir,`overseas-run-${b.runId}-epoch-1.json`),'utf8');
   return JSON.stringify(out);
  }
  let progressPlan,firstBefore,recoveryProof,intentReader;
  if(isRecovery){
   intentReader=await require('../worker/src/overseasRecoveryIntent').createOverseasRecoveryIntent({repositoryRoot:root,directory:path.join(c.directory,c.ledgerCase?`ledger-${c.ledgerCase}-intents`:isPage?`page-${c.pageScenario}-intents`:'intents'),receipt,journal});
   recoveryProof=await intentReader.read(c.intentId);assert(recoveryProof.scope.runId===target.runId,'REAL_RECLAIM_TARGET');
  }
  if(c.mode==='progress'){
   const {recoverManualProgress}=require('../worker/src/overseasManualProgressRecovery');
   progressPlan=await recoverManualProgress({repo,receipt,journal,requestIds:[c.requestId],manifestSha256:'a'.repeat(64)});
   assert(progressPlan.completedSites.length===1&&progressPlan.firstRunBindings.length===1&&progressPlan.firstRunBindings[0].runId===target.runId,'REAL_PROGRESS_PLAN');
   firstBefore=await evidence('site-en');
  }
  assert(c.ledgerComments==null||typeof c.ledgerComments==='boolean','ISOLATED_LEDGER_COMMENTS_FLAG');
  assert(!c.ledgerComments||c.ledger===true,'ISOLATED_LEDGER_COMMENTS_BINDING');
  const ledgerComments=c.ledgerComments===true,twoPage=c.pageScenario==='two-page',withComments=c.pageScenario==='comments'||ledgerComments;
  const postId=c.ledgerCase?ledgerRoots[c.ledgerCase]:c.ledger?950:isPage?(withComments?905:twoPage?903:c.pageScenario==='before'?901:902):c.mode==='reclaim'?789:c.mode==='progress'?456:123;
  const topCommentId=ledgerComments?postId+1:906,inlineReplyId=ledgerComments?postId+2:907,dynamicReplyId=postId+3;
  const expectedStored=ledgerComments?4:withComments?3:twoPage?2:1,expectedPosts=twoPage?2:1,feedOffsets=[],commentRequests=[];
  const publishedAt=new Date((Date.parse(target.windowStart)+Date.parse(target.windowEnd))/2).toISOString(),requests=[];
  const transport=async value=>{
   const u=new URL(value);assert(u.origin==='https://club-en.q1.com','SYNTHETIC_TRANSPORT_ORIGIN');requests.push(u.pathname);
   let payload;
   if(u.pathname.endsWith('/login/token'))payload={code:0,data:{token:'synthetic-site-token'}};
   else if(u.pathname.endsWith('/user/context'))payload={code:0,data:{gameBoards:[{id:100017,name:'synthetic'}]}};
   else if(u.pathname.endsWith('/auth/board'))payload={code:0,data:{id:100017,groups:[{id:10,name:'info',type:0,sections:[{id:11,name:'news'}]}]}};
   else if(u.pathname.includes('/comment/')){
    const root=u.searchParams.get('postId'),parent=u.searchParams.get('commentId');
    commentRequests.push({postId:root,commentId:parent,sortType:u.searchParams.get('sortType'),offsetId:u.searchParams.get('offsetId')});
    if(withComments&&root===String(postId)){
     if(ledgerComments&&parent===String(topCommentId))payload={code:0,data:[{id:dynamicReplyId,content:[{type:0,data:`synthetic dynamic reply ${dynamicReplyId}`}],createTime:publishedAt}],total:1,hasMore:false};
     else if(parent==null||parent==='')payload={code:0,data:[{id:topCommentId,content:[{type:0,data:`synthetic top comment ${topCommentId}`}],createTime:publishedAt,
      replies:[{id:inlineReplyId,content:[{type:0,data:`synthetic inline reply ${inlineReplyId}`}],createTime:publishedAt}],commentCount:ledgerComments?2:1}],total:1,hasMore:false};
     else throw Object.assign(Error('SYNTHETIC_REPLY_PARENT'),{code:'SYNTHETIC_REPLY_PARENT'});
    }else payload={code:0,data:[],total:0,hasMore:false};
   }
   else if(u.pathname.endsWith('/post/')){const id=twoPage?Number(u.searchParams.get('postId')):postId;payload={code:0,data:{id,title:`synthetic ${id}`,content:[{type:0,data:`synthetic body ${id}`}],createTime:publishedAt,commentCount:withComments?1:0}};}
   else if(u.pathname.endsWith('/merged-list')){const offset=Number(u.searchParams.get('offsetId')||0);feedOffsets.push(offset);const id=twoPage&&offset>0?904:postId;
    payload={code:0,data:{list:[{id,title:`synthetic ${id}`,content:[{type:0,data:`synthetic body ${id}`}],createTime:publishedAt,commentCount:withComments?1:0}],total:expectedPosts,hasMore:twoPage&&offset===0}};}
   else if(u.pathname.endsWith('/post/list'))payload=withComments?{code:0,data:{list:[{id:postId,title:`synthetic ${postId}`,content:[{type:0,data:`synthetic body ${postId}`}],createTime:publishedAt,commentCount:1}],total:1,hasMore:false}}:{code:0,data:{list:[],total:0,hasMore:false}};
   else throw Object.assign(Error('SYNTHETIC_TRANSPORT_PATH'),{code:'SYNTHETIC_TRANSPORT_PATH'});
   return {ok:true,status:200,url:String(u),json:async()=>payload};
  };
  const candidateOptions={baseDeps:{repo,connectors:{},credentialContext:{
   load:async(subject,kind)=>{if(kind==='account_password')throw Object.assign(Error('synthetic'),{code:'CREDENTIAL_NOT_FOUND'});return {apiToken:'synthetic-base-token'};},loadApiToken:async()=> 'synthetic-base-token'},
   ai:{configured:()=>true,profiles:{light:{version:'light-v1'}}},leaseOwner:`isolated-child-${process.pid}`,leaseSeconds:isPage||c.ledgerCase?3:300,pageSize:20,pageBudget:2,pageTimeoutMs:1000,dailyRunTimeoutMs:15000,
   dailyFeedFetchConcurrency:1,dailyCommentFetchConcurrency:1,dailyReplyFetchConcurrency:1},receipt,request,requestIds:[c.requestId],journal,manifestSha256:'a'.repeat(64),transport,translationVersion:'translation-v1'};
  if(c.ledger===true){
   const ledger=require('../server/src/db/overseasStageCoverage').createOverseasStageCoverageLedger({journal,receipt,request});
   candidateOptions.stageCoverage=require('../worker/src/overseasStageCoverage').createOverseasStageCoverage({repo,ledger});
   candidateOptions.boundAudit=require('../server/src/db/overseasBoundAudit').createOverseasBoundAudit({repo,journal,ledger});
   for(const check of [
    ()=>candidateOptions.stageCoverage.assertContext({repo:Object.create(repo),journal,receipt}),
    ()=>candidateOptions.stageCoverage.assertContext({repo,journal:{...journal},receipt}),
    ()=>candidateOptions.boundAudit.assertContext({repo,journal,ledger:{...ledger}})
   ]){let rejected=false;try{check();}catch(error){rejected=error.code==='OVERSEAS_COVERAGE_CONTEXT_CONFLICT'||error.code==='OVERSEAS_AUDIT_CONTEXT_CONFLICT';}assert(rejected,'REAL_LEDGER_CONTEXT_COPY_ACCEPTED');}
  }
  const recoveryFactory=require('../worker/src/overseasRecoveryCandidateFactory');
  candidate=isRecovery?(c.ledger?recoveryFactory.createStageCoveredRecoveryIsolatedCandidateDeps:recoveryFactory.createRecoveryIsolatedCandidateDeps)({proof:recoveryProof,...candidateOptions}):c.mode==='progress'?await require('../worker/src/overseasManualProgressRecovery').createProgressIsolatedCandidateDeps({plan:progressPlan,...candidateOptions}):await createRecoveredIsolatedOverseasCandidateDeps(candidateOptions);
  try{await require('../worker/src/worker').runSource(candidate,{id:target.sourceId,platform:'bigplayer_h5',region_code:'overseas'},
   {id:target.runId,source_id:target.sourceId,account_id:target.accountId,site_id:target.siteId});
  }catch(error){
   const [cp]=await pool.query('SELECT site_id,task_kind,task_key,status,items_fetched,error_code FROM po_sync_checkpoints ORDER BY id');
   fs.writeFileSync(path.join(c.directory,`child-diagnostic-${process.pid}.json`),JSON.stringify({errorCode:error.code||'CHILD_FAILURE',sqlCounts,requestPaths:requests,checkpoints:cp}),{flag:'wx'});throw error;
  }
  const [runs]=await pool.query('SELECT * FROM po_sync_runs WHERE id IN (?,?) ORDER BY site_id',bindings.map(b=>b.runId));const done=runs.find(r=>r.id===target.runId),other=runs.find(r=>r.site_id!==target.siteId);
  const expectedEpoch=isRecovery?recoveryProof.next.leaseEpoch:1;
  const ledgerContract={...target,leaseOwner:isRecovery?recoveryProof.next.leaseOwner:claimedOwner,leaseEpoch:expectedEpoch};
  if(c.ledger&&done?.status!=='completed_authorized_scope'){
   const [tasks]=await pool.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=?',[target.runId]);
   fs.writeFileSync(path.join(c.directory,`ledger-terminal-diagnostic-${process.pid}.json`),JSON.stringify({run:done,tasks,commentRequests}),{flag:'wx'});
  }
  assert(done?.status==='completed_authorized_scope'&&done.attempts===expectedEpoch&&done.lease_epoch===expectedEpoch&&done.lease_owner===null&&done.lease_until===null
   &&done.started_at&&done.finished_at&&done.started_at<=done.finished_at&&done.stored_count===expectedStored&&done.fetched_count===expectedPosts&&!done.error_code,'REAL_MAINCHAIN_TERMINAL');
  if(c.mode==='progress')assert(other?.status==='completed_authorized_scope'&&other.attempts===1&&other.lease_epoch===1,'REAL_PROGRESS_FIRST_NOT_RECLAIMED');
  else assert(other?.status==='queued'&&other.attempts===0&&other.lease_epoch===0&&other.lease_owner===null&&other.lease_until===null&&other.started_at===null&&other.finished_at===null,'REAL_MAINCHAIN_OTHER_SITE');
  const [contents]=await pool.query('SELECT * FROM po_contents WHERE external_id=?',[String(postId)]);assert(contents.length===1,'REAL_MAINCHAIN_CONTENT');const content=contents[0],scope=JSON.parse(content.raw_payload)._overseasScope;
  for(const key of ['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'])assert(scope?.[key]===target[key],'REAL_MAINCHAIN_CONTENT_SCOPE');
  for(const table of ['po_analysis_jobs','po_translation_jobs']){
   const [jobs]=await pool.query('SELECT * FROM '+table+' WHERE content_id=?',[content.id]);assert(jobs.length===1&&jobs[0].content_id===content.id&&jobs[0].content_fingerprint===content.fingerprint
    &&jobs[0].status==='pending'&&jobs[0].attempts===0&&jobs[0].lease_owner===null&&jobs[0].lease_until===null&&jobs[0].completed_at===null,'REAL_MAINCHAIN_JOBS');
  }
  const [[association]]=await pool.query('SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE run_id=? AND content_id=?',[target.runId,content.id]);assert(association.n===1,'REAL_MAINCHAIN_ASSOCIATION');
  const [[membership]]=await pool.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE content_id=?',[content.id]);assert(membership.n>=1,'REAL_MAINCHAIN_MEMBERSHIP');
  const [checkpoints]=await pool.query('SELECT * FROM po_sync_checkpoints WHERE site_id=? AND window_start=? AND window_end=?',[target.siteId,target.windowStart,target.windowEnd]);assert(checkpoints.length>0&&checkpoints.every(cp=>cp.site_id===target.siteId&&cp.status==='completed'&&cp.cursor===null&&cp.lease_owner===null&&cp.lease_until===null),'REAL_MAINCHAIN_CHECKPOINT');
  assert(checkpoints.filter(cp=>cp.sync_scope==='posts').reduce((sum,cp)=>sum+cp.items_fetched,0)===(withComments?3:expectedPosts),'REAL_MAINCHAIN_CHECKPOINT_COUNT');
  if(withComments){const commentIds=ledgerComments?[topCommentId,inlineReplyId,dynamicReplyId]:[topCommentId,inlineReplyId];
   const [comments]=await pool.query(`SELECT * FROM po_contents WHERE source_id=? AND external_id IN (${commentIds.map(()=>'?').join(',')}) ORDER BY external_id`,[target.sourceId,...commentIds.map(String)]);assert(comments.length===commentIds.length,'REAL_COMMENTS_COUNT');
   assert(comments[0].root_content_id===content.id&&comments[0].parent_content_id===content.id&&comments[0].content_depth===1
    &&comments[1].root_content_id===content.id&&comments[1].parent_content_id===comments[0].id&&comments[1].content_depth===2,'REAL_COMMENTS_ANCESTRY');
   if(ledgerComments)assert(comments[2].root_content_id===content.id&&comments[2].parent_content_id===comments[0].id&&comments[2].platform_parent_id===String(topCommentId)&&comments[2].content_depth===2,'REAL_DYNAMIC_REPLY_ANCESTRY');
   const [[unique]]=await pool.query('SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE run_id=?',[target.runId]);assert(unique.n===expectedStored,'REAL_MULTIFEED_UNIQUE_LINKS');
   const [[members]]=await pool.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE content_id=?',[content.id]);assert(members.n===3,'REAL_MULTIFEED_MEMBERSHIP');}
  if(ledgerComments){
   const commentCp=checkpoints.find(cp=>cp.task_kind==='comments'&&cp.root_platform_content_id===String(postId));
   const replyCp=checkpoints.find(cp=>cp.task_kind==='q1_reply'&&cp.task_key===`board:${target.boardId}:reply:${topCommentId}:0`);
   assert(commentCp&&commentCp.items_fetched===2&&replyCp&&replyCp.items_fetched===1&&replyCp.root_platform_content_id===String(postId),'REAL_LEDGER_DYNAMIC_REPLY_CHECKPOINT');
   if(!(isRecovery&&['seal-after','reply-after'].includes(c.ledgerCase)))assert(commentRequests.some(r=>r.postId===String(postId)&&r.commentId===String(topCommentId)&&r.sortType==='0'&&r.offsetId==='0'),'REAL_LEDGER_DYNAMIC_REPLY_TRANSPORT');
   if(isRecovery&&c.ledgerCase==='reply-after')assert(!commentRequests.some(r=>r.postId===String(postId)),'REAL_LEDGER_COMMITTED_REPLY_REPLAYED');
   const [tasks]=await pool.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256',[target.runId]);
   const dynamicTask=tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='q1_reply'&&d.commentId===String(topCommentId)&&d.rootPlatformContentId===String(postId);});
   assert(dynamicTask&&dynamicTask.origin==='reply'&&dynamicTask.state==='completed'&&dynamicTask.checkpoint_id===replyCp.id,'REAL_LEDGER_DYNAMIC_REPLY_TASK');
   const commentTask=tasks.find(t=>{const d=JSON.parse(t.descriptor);return d.taskKind==='comments'&&d.rootPlatformContentId===String(postId);});
   const originEvidence=JSON.parse(dynamicTask.origin_evidence),cpProof=JSON.parse(dynamicTask.completed_checkpoint_snapshot);
   const expectedOriginEpoch=isRecovery&&c.ledgerCase==='comments-before'?2:1;
   assert(commentTask&&originEvidence.parentTaskIdentity===commentTask.task_identity_sha256&&originEvidence.checkpointId===commentCp.id&&originEvidence.leaseEpoch===expectedOriginEpoch&&cpProof.id===replyCp.id&&cpProof.cursor===null,'REAL_LEDGER_DYNAMIC_REPLY_ORIGIN_PROOF');
   for(const table of ['po_analysis_jobs','po_translation_jobs']){
    const [jobs]=await pool.query(`SELECT j.* FROM ${table} j JOIN po_sync_run_contents rc ON rc.content_id=j.content_id WHERE rc.run_id=? ORDER BY j.content_id`,[target.runId]);
    assert(jobs.length===4&&new Set(jobs.map(j=>j.content_id)).size===4&&jobs.every(j=>j.status==='pending'&&j.attempts===0&&j.completed_at===null),'REAL_LEDGER_DYNAMIC_REPLY_JOBS');
   }
  }
  if(twoPage&&isRecovery){assert(JSON.stringify(feedOffsets)==='[1]','REAL_TWO_PAGE_CURSOR_NOT_RESUMED');
   const [second]=await pool.query('SELECT * FROM po_contents WHERE external_id=904');assert(second.length===1,'REAL_TWO_PAGE_SECOND_CONTENT');
   for(const table of ['po_analysis_jobs','po_translation_jobs']){const [jobs]=await pool.query('SELECT * FROM '+table+' WHERE content_id IN (?,?)',[content.id,second[0].id]);assert(jobs.length===2&&jobs.every(j=>j.status==='pending'),'REAL_TWO_PAGE_JOBS');}
   const [[links]]=await pool.query('SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE run_id=?',[target.runId]);assert(links.n===2,'REAL_TWO_PAGE_ASSOCIATIONS');}
  const [audits]=await pool.query('SELECT * FROM po_collection_runs');
  if(c.ledger){
   const [events]=await pool.query("SELECT * FROM po_audit_events WHERE event_type='overseas_bound_terminal' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.syncRunId'))=?",[target.runId]);
   assert(events.length===1,'REAL_LEDGER_TERMINAL_EVENT');const terminal=JSON.parse(events[0].detail);
   assert(terminal.counterVersion==='overseas-unique-links-v1'&&terminal.counts.discovered===expectedStored&&terminal.counts.stored===expectedStored
    &&audits.some(a=>a.id===terminal.auditId&&a.status==='success'&&a.stored_count===expectedStored),'REAL_LEDGER_BOUND_AUDIT');
   if(ledgerComments)assert(terminal.counts.posts===1&&terminal.counts.comments===1&&terminal.counts.replies===2,'REAL_LEDGER_EPOCH1_COMMENT_REPLY_COUNTER');
   const progress=await candidateOptions.stageCoverage.transaction(conn=>candidateOptions.stageCoverage.ledger.readProgress(conn,ledgerContract),true);
   assert(progress.coverageStatus==='sealed'&&progress.total===progress.completed&&progress.pending.length===0&&progress.historySealed&&progress.expansionSealed,'REAL_LEDGER_COMPLETION');
   assert((await candidateOptions.boundAudit.reconcile({contract:ledgerContract,status:'completed_authorized_scope'})).status==='accepted','REAL_LEDGER_RECONCILE');
   const ledgerPlan=await require('../worker/src/overseasManualProgressRecovery').recoverStageCoveredManualProgress({repo,receipt,journal,requestIds:[c.requestId],manifestSha256:target.manifestSha256,intentReader,intentIds:isRecovery?[recoveryProof.intentId]:[]});
   assert(ledgerPlan.completedSites.length===1&&ledgerPlan.completedSites[0].storedCount===expectedStored&&ledgerPlan.firstRunBindings.length===1,'REAL_LEDGER_EPOCH1_PROGRESS');
   if(ledgerComments){
    // Each tamper remains inside a rolled-back synthetic transaction. Never
    // mutate the completed evidence or reinterpret this as provider activity.
    const cProof=ledgerContract;
    const [links]=await pool.query('SELECT rc.content_id,rc.sync_scope,c.* FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=?',[target.runId]);
    const postLink=links.find(link=>link.sync_scope==='posts'),commentLink=links.find(link=>link.external_id===String(topCommentId));
    async function tamper(work,link,expected){
     const conn=await pool.getConnection(); let caught;
     try{await conn.beginTransaction();await work(conn);try{await candidateOptions.stageCoverage.ledger.verifyLinkedTasks(conn,cProof,[link],{completed:true});}catch(error){caught=error;}
      assert(caught?.code===expected,'REAL_LEDGER_LINK_TAMPER_NOT_REJECTED');
     }finally{try{await conn.rollback();}finally{conn.release();}}
    }
    await tamper(conn=>conn.query('DELETE FROM po_content_feed_memberships WHERE content_id=?',[postLink.content_id]),postLink,'OVERSEAS_COVERAGE_LINK_TASK_MISSING');
    await tamper(conn=>conn.query("UPDATE po_content_feed_memberships SET feed_metadata=JSON_SET(feed_metadata,'$.boardId','999') WHERE content_id=?",[postLink.content_id]),postLink,'OVERSEAS_COVERAGE_LINK_TASK_CONFLICT');
    await tamper(conn=>conn.query('UPDATE po_overseas_expected_tasks SET state=\'expected\' WHERE run_id=? AND JSON_UNQUOTE(JSON_EXTRACT(descriptor,\'$.taskKind\'))=\'comments\' AND JSON_UNQUOTE(JSON_EXTRACT(descriptor,\'$.rootPlatformContentId\'))=?',[target.runId,String(postId)]),commentLink,'OVERSEAS_COVERAGE_LINK_TASK_MISSING');
    assert((await candidateOptions.boundAudit.reconcile({contract:cProof,status:'completed_authorized_scope'})).status==='accepted','REAL_LEDGER_TAMPER_ROLLBACK_EVIDENCE');
   }
  }
  else if(isPage){assert(audits.some(a=>a.status==='running')&&audits.some(a=>a.status==='success'&&a.stored_count===(withComments?2:c.pageScenario==='after'?0:1)&&a.analyzed_count===0),'REAL_PAGE_RECOVERY_AUDIT');}
  else assert(audits.length===(c.mode==='reclaim'?3:c.mode==='progress'?2:1)&&audits.every(a=>a.status==='success'&&a.stored_count===1&&a.analyzed_count===0),'REAL_MAINCHAIN_AUDIT');
  const [[source]]=await pool.query('SELECT last_success_at FROM po_sources WHERE id=?',[target.sourceId]);assert(source.last_success_at,'REAL_MAINCHAIN_SOURCE_SUCCESS');
  assert(fs.readdirSync(journalDir).length===(isRecovery?expectedEpoch:c.mode==='progress'?2:1),'REAL_MAINCHAIN_JOURNAL');
  await journal.read({...target,leaseOwner:isRecovery?recoveryProof.next.leaseOwner:claimedOwner,leaseEpoch:expectedEpoch});
  assert(Object.entries(sqlCounts).every(([key,n])=>n>0||(isRecovery&&key==='claim')||(!isRecovery&&key==='recoveryClaim')
   ||(isRecovery&&['seal-after','reply-after'].includes(c.ledgerCase)&&['content','analysis','translation','renew'].includes(key))
   ||(isPage&&c.pageScenario==='after'&&['content','analysis','translation'].includes(key)))
   &&sqlCounts.terminal===1&&(isRecovery?sqlCounts.recoveryClaim===1:sqlCounts.claim===1),'REAL_MAINCHAIN_SQL_EXECUTION');
  if(isRecovery&&c.ledgerCase==='seal-after')assert(sqlCounts.content===0&&sqlCounts.analysis===0&&sqlCounts.translation===0&&!requests.some(p=>p.endsWith('/merged-list')||p.endsWith('/post/list')||p.endsWith('/post/')||p.includes('/comment/')),'REAL_LEDGER_SEAL_RESUME_REPLAYED_PAGE');
  if(c.mode==='progress'){
   assert(await evidence('site-en')===firstBefore,'REAL_PROGRESS_FIRST_CONTENT_JOB_CHANGED');
   const {recoverManualProgress,createProgressIsolatedCandidateDeps}=require('../worker/src/overseasManualProgressRecovery');
   const before={...sqlCounts},count=requests.length,stateBefore=[await evidence('site-en'),await evidence('site-fr')],plan=await recoverManualProgress({repo,receipt,journal,requestIds:[c.requestId],manifestSha256:'a'.repeat(64)});
   assert(plan.allCompleted&&plan.completedSites.length===2,'REAL_PROGRESS_ALL_COMPLETED');
   const settled=await createProgressIsolatedCandidateDeps({plan,...candidateOptions});
   assert(settled.allCompleted===true&&JSON.stringify(before)===JSON.stringify(sqlCounts)&&count===requests.length,'REAL_PROGRESS_ALL_COMPLETED_SIDE_EFFECT');
   assert(JSON.stringify(stateBefore)===JSON.stringify([await evidence('site-en'),await evidence('site-fr')]),'REAL_PROGRESS_ALL_COMPLETED_STATE_CHANGED');
  }
  return {scopes:2,actualRunSourceExecuted:true,syntheticTransport:true,realHttpExecuted:false,aiExecuted:false,translationExecuted:false,
   completedSite:target.siteId,leaseEpoch:expectedEpoch,queuedSite:c.mode==='progress'?null:other.site_id,allCompleted:c.mode==='progress',firstContentJobsUnchanged:c.mode==='progress',stored:expectedStored,analysisPending:expectedStored,translationPending:expectedStored,checkpointCount:checkpoints.length,sqlCounts,requestCount:requests.length,feedOffsets,ledgerComments,dynamicReplyExecuted:ledgerComments&&!(isRecovery&&['seal-after','reply-after'].includes(c.ledgerCase)),durableDynamicReplyProven:ledgerComments,commentRequests};
 }finally{try{candidate?.closeOverseasCandidate();}finally{await pool.end();}}
}
module.exports={installMainchainSchema,runChild};
if(require.main===module){
 assert(process.argv.length===3&&process.argv[2]==='--isolated-child','ISOLATED_CHILD_ONLY');
 runChild(JSON.parse(fs.readFileSync(0,'utf8'))).then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{process.stderr.write((error.code||'ISOLATED_CHILD_FAILED')+'\n');process.exitCode=1;});
}
