'use strict';
const crypto=require('node:crypto');
const {withDeadlineConnection}=require('./lastNightDeadlineConnection');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const {checkpointHash,recoverFirstSite16Page}=require('./lastNightBoundedRecoveryPage');
const {diagnoseDetailPage}=require('./lastNightRecoveryFailureContract');
const {assertLastNightSiteUrl}=require('../../server/src/connectors/lastNightUrlContract');
const {targetLockQuery}=require('./lastNightTargetLockAdapter');
const {richContentQuery}=require('./lastNightRichContentQuery');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function forwardResume({pool,evidence,bindings,expectedIdentity,ownerId,inspectOnly=false,approvedHash,repo,runtime,connector,persistEvidence,persistPublic,diagnosticOnly=false}) {
 const cp=evidence?.afterCheckpoint;let precommitFailure=false;
 let cursor;try{cursor=JSON.parse(cp?.cursor);}catch{fail('LAST_NIGHT_FORWARD_CURSOR_INVALID');}
 if(evidence.sourceId!==SOURCE_ID || cp.account_id!==evidence.accountId || cp.site_id!=='site-3bb48be7f9a82185d6a045e9a5cbd3d7'
   || cp.status!=='idle' || cp.task_key!=='100017:home:merged::0:::' || cp.task_kind!=='q1_feed' || cp.sync_scope!=='posts' || cp.root_platform_content_id!==''
   || cursor.version!==2 || cursor.feedKey!==cp.task_key || cursor.offsetId!==20 || cursor.pageIndex!==2
   || !bindings?.baseSha || !bindings?.sessionSha || typeof persistEvidence!=='function' || typeof persistPublic!=='function'
   || (!inspectOnly && (!/^[a-f0-9]{64}$/.test(approvedHash||'') || !/^lastnight-independent:[a-f0-9-]{36}$/.test(ownerId||''))))fail('LAST_NIGHT_FORWARD_INPUT_INVALID');
 let ownerPending=false,ownerAck=false;const pageState={pending:false,acknowledged:false};
 return withDeadlineConnection(pool,async({query:rawQuery,bounded})=>{
  const q=richContentQuery(targetLockQuery(rawQuery,evidence.accountId));
  try{
   const [[identity]]=await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
   if(identity?.identity!==expectedIdentity || identity.db!=='public_opinion' || Number(identity.port)!==3306)fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
   const [[lock]]=await q('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${evidence.accountId}`]);
   if(Number(lock?.acquired)!==1)fail('LAST_NIGHT_DUPLICATE_EXECUTION');
   await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
   const [[state]]=await q('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
   const [[source]]=await q('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE',[SOURCE_ID]);
   const [[account]]=await q('SELECT * FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE',[evidence.accountId,SOURCE_ID]);
   const [registry]=await q('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE',[SOURCE_ID]);
   const [checkpoints]=await q('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[cp.id]);
   const [active]=await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID,evidence.accountId]);
   const [activeCp]=await q("SELECT id FROM po_sync_checkpoints WHERE account_id=? AND status='running' LIMIT 1 FOR UPDATE",[evidence.accountId]);
   let config;try{config=JSON.parse(source?.config);}catch{fail('LAST_NIGHT_FORWARD_CONFIG_CHANGED');}
   if(source?.game_id!==GAME_ID || source.community_id!==COMMUNITY_ID || source.region_code!=='overseas' || source.community_status!=='enabled'
     || source.platform!=='bigplayer_h5' || Number(source.enabled)!==1 || String(config.boardId)!==BOARD_ID
     || account?.id!==evidence.accountId || account.source_id!==SOURCE_ID || account.platform!=='bigplayer_h5' || Number(account.enabled)!==1
     || source.config!==evidence.sourceConfig || Number(source.schedule_version)!==Number(evidence.scheduleVersion)
     || Number(state?.schedule_version)!==Number(evidence.scheduleVersion))fail('LAST_NIGHT_FORWARD_CONFIG_CHANGED');
   const site=config.siteUrls?.find(row=>row.siteId===cp.site_id);
   const expectedSites=['legacy-8483a64ab230417e63c5e30d77b0a6f0','site-f069f4495d534693dd87b2485053e7cd','site-3bb48be7f9a82185d6a045e9a5cbd3d7'];
   if(account.game_id!==GAME_ID || account.community_id!==COMMUNITY_ID || !site || config.siteUrls?.length!==3 || registry.length!==3
     || new Set(config.siteUrls.map(row=>row.siteId)).size!==3
     || !config.siteUrls.every(row=>expectedSites.includes(row.siteId)&&registry.some(entry=>entry.site_id===row.siteId&&entry.url===row.url&&Number(entry.enabled)===1)))fail('LAST_NIGHT_FORWARD_SITE_CHANGED');
   for(const entry of config.siteUrls){const url=assertLastNightSiteUrl(entry.url);if(entry.enabled===false || url.searchParams.get('languageId')!==String([2,9,16][expectedSites.indexOf(entry.siteId)]))fail('LAST_NIGHT_FORWARD_SITE_CHANGED');}
   if(state.lease_run_id!==evidence.token.parentId || state.lease_owner!==evidence.token.ownerId || Number(state.lease_epoch)!==Number(evidence.token.epoch))fail('LAST_NIGHT_RESUME_OWNER_CHANGED');
   if(active.length || activeCp.length)fail('LAST_NIGHT_ACTIVE_RUN');
   if(checkpoints.length!==1 || JSON.stringify(checkpoints[0])!==JSON.stringify(cp) || cp.lease_owner!=null || cp.lease_until!=null)fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED');
   const snapshotHash=sha({bindings,state,source,account,registry,checkpoint:checkpoints[0]});
   if(inspectOnly && !diagnosticOnly){await q('ROLLBACK');return{status:'LAST_NIGHT_FORWARD_INSPECT_READY',snapshotHash,checkpointHash:checkpointHash(cp),offset:20,pageIndex:2,fullChainComplete:false};}
   if(snapshotHash!==approvedHash)fail('LAST_NIGHT_FORWARD_SNAPSHOT_CHANGED');
   if(diagnosticOnly){
    await q('ROLLBACK');
    const diagnosticSource={...runtime.source,siteId:cp.site_id,config:{...config,baseUrl:site.url}};
    await bounded(persistPublic({phase:'detail_shape_contract',offset:20,pageIndex:2,maxDetailRequests:6,ownerWrite:false,pageWrite:false,bodyExcluded:true,tokenExcluded:true}));
    const controller=new AbortController();
    try{
     await bounded(connector.listFeedContents({source:diagnosticSource,account:runtime.account,feed:{boardId:BOARD_ID,feedKey:cp.task_key,pageKind:'home',endpointKind:'merged',sectionId:'0'},cursor:cp.cursor,segmentId:cursor.segmentId,limit:20,dailyBounded:true,publishedFrom:cp.window_start,publishedTo:cp.window_end,signal:controller.signal}));
    }finally{controller.abort();}
    return{status:'LAST_NIGHT_DETAIL_SHAPE_RECORDED',offset:20,pageIndex:2,ownerChanged:false,pageCommitted:false,fullChainComplete:false};
   }
   const token={...evidence.token,ownerId,epoch:Number(state.lease_epoch)+1};
   const journal={sourceId:SOURCE_ID,accountId:evidence.accountId,bindings,snapshotHash,beforeToken:evidence.token,token,recoveryBase:evidence,
     sourceConfig:evidence.sourceConfig,scheduleVersion:evidence.scheduleVersion,afterCheckpoint:cp,checkpointHash:checkpointHash(cp),checkpointUnchanged:true,httpExecuted:false};
   await bounded(persistEvidence({...journal,phase:'forward_resume_prepared'}));
   const [change]=await q('UPDATE po_source_schedule_state SET lease_owner=?,lease_epoch=lease_epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND schedule_version=?',[ownerId,SOURCE_ID,state.lease_run_id,state.lease_owner,state.lease_epoch,state.schedule_version]);
   if(change.affectedRows!==1)fail('LAST_NIGHT_RESUME_OWNER_CHANGED');
   await bounded(persistEvidence({...journal,phase:'forward_resume_commit_prepared'}));
   ownerPending=true;await q('COMMIT');ownerAck=true;
   await bounded(persistEvidence({...journal,phase:'forward_resume_committed'}));ownerPending=false;
   // Public fixed contract must be durable BEFORE the first HTTP request.
   await bounded(persistPublic({phase:'detail_diagnostic_contract',fields:['idHash','contentType','integrityStatus','integrityCode','hasExternalId','accepted'],offset:20,pageIndex:2,bodyExcluded:true,tokenExcluded:true}));
   const wrapped={listFeedContents:async input=>{
     const page=await connector.listFeedContents(input);
     const diagnostics=diagnoseDetailPage(page.items);await bounded(persistPublic({phase:'detail_page_diagnostics',offset:20,pageIndex:2,items:diagnostics}));
     if(diagnostics.some(item=>!item.accepted)){precommitFailure=true;fail('LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED');}return page;
   }};
   try{return await recoverFirstSite16Page({query:q,bounded,snapshot:{source:{config:evidence.sourceConfig,schedule_version:evidence.scheduleVersion}},token,repo,runtime,connector:wrapped,
     feed:{boardId:BOARD_ID,feedKey:cp.task_key,pageKind:'home',endpointKind:'merged',sectionId:'0',groupId:null,type:null,orderType:null,isUltimate:null},
     resumeCheckpoint:cp,persistEvidence,recoveryCommitState:pageState});}
   catch(error){
    // Only an observed detail rejection BEFORE page transaction can authorize
    // another forward attempt. Never issue this receipt for timeout/ACK unknown.
    if(precommitFailure && !pageState.pending){
     await q('START TRANSACTION');
     const [[owned]]=await q('SELECT lease_run_id,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
     const [current]=await q('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[cp.id]);
     const [running]=await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID,evidence.accountId]);
     if(owned?.lease_run_id!==token.parentId || owned.lease_owner!==token.ownerId || Number(owned.lease_epoch)!==token.epoch || Number(owned.live)!==1
       || current.length!==1 || JSON.stringify(current[0])!==JSON.stringify(cp) || running.length)fail('LAST_NIGHT_FORWARD_FAILURE_RECHECK_FAILED');
     await q('ROLLBACK');
     await bounded(persistEvidence({...journal,phase:'forward_page_precommit_failed',httpExecuted:true,pageCommitAttempted:false,checkpointUnchanged:true,errorCode:'LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED'}));
    }
    throw error;
   }
  }catch(error){
   if(pageState.pending)error.code=pageState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';
   else if(ownerPending)error.code=ownerAck?'LAST_NIGHT_RESUME_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RESUME_COMMIT_UNKNOWN';
   else{try{await q('ROLLBACK');}catch{}}
   throw error;
  }
 },{timeoutMs:120000,code:'LAST_NIGHT_FORWARD_TIMEOUT'}).catch(error=>{
   if(pageState.pending)error.code=pageState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';
   else if(ownerPending)error.code=ownerAck?'LAST_NIGHT_RESUME_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RESUME_COMMIT_UNKNOWN';throw error;
 });
}
module.exports={forwardResume};
