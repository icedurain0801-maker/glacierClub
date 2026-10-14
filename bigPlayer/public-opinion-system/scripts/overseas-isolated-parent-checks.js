'use strict';
const { canonical } = require('../worker/src/overseasBigPlayerRunContractJournal');
const { scheduledFirstClaimContext } = require('../server/src/db/overseasScheduledAdmissionStore');
const { publishScheduledFirstClaim } = require('../worker/src/overseasScheduledClaimPublisher');
const { createOverseasScheduledStageCoverageLedger } = require('../server/src/db/overseasStageCoverage');
const { createOverseasStageCoverage } = require('../worker/src/overseasStageCoverage');
const { createOverseasBigPlayerPageStore } = require('../worker/src/overseasBigPlayerPageStore');
const { createOverseasBoundAudit } = require('../server/src/db/overseasBoundAudit');
const { schemaDescriptors } = require('../worker/src/overseasStageTaskIdentity');
const { statements, createScheduledParentStore } = require('../server/src/db/overseasScheduledParentStore');
const assert = (v,code) => { if(!v)throw Object.assign(Error(code),{code}); };
async function checkParent({repo,control,target,store,request,journal,cursorReader,scenario='success'}){
  if(scenario==='certified-cursor-partial')scenario='partial';
  if(!cursorReader)for(const sql of statements)await control.query(sql);
  if(scenario==='all-failed'){
    await target.verifyConnection(control);
    await control.query("UPDATE po_sources SET last_success_at='2025-12-31 23:00:00.000',last_error='prior_synthetic_error' WHERE id=?",[request.batch.admissions[0].sourceId]);
  }
  const transaction=async work=>{const c=await repo.pool.getConnection();try{await target.verifyConnection(c);await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}};
  const claims=[];
  for(const [index,admission] of request.batch.admissions.entries()){
    const claim=await store.firstClaim(request,{runId:admission.runId,leaseOwner:`isolated:parent:${index}`,leaseSeconds:300});
    const contract=await publishScheduledFirstClaim({repo,journal,proof:claim.proof});claims.push({claim,contract});
  }
  const historicalChain=['historical-chain','historical-ancestor-race'].includes(scenario),historical=new Map();
  if(historicalChain){
    await target.verifyConnection(control);
    for(const [index,{contract:c}] of claims.entries()){
      const crypto=require('node:crypto'),priorRunId=crypto.randomUUID(),rootId=crypto.randomUUID(),commentId=crypto.randomUUID();
      const postId=String(61001+index*1000),externalCommentId=String(Number(postId)+1),replyId=String(Number(postId)+2);
      const end=new Date(Date.parse(c.windowStart)-3600000),start=new Date(end.getTime()-3600000);
      await control.query("INSERT INTO po_sync_runs(id,source_id,account_id,site_id,parent_run_id,trigger_type,status,sync_mode,scheduled_at,window_start,window_end) VALUES (?,?,?,?,NULL,'manual','completed_authorized_scope','incremental',NULL,?,?)",[priorRunId,c.sourceId,c.accountId,c.siteId,start,end]);
      const scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'].map(k=>[k,c[k]]));
      for(const depth of [0,1])await control.query('INSERT INTO po_contents(id,source_id,account_id,game_id,community_id,external_id,content_type,content_depth,root_content_id,parent_content_id,platform_parent_id,fingerprint,raw_payload,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[depth?commentId:rootId,c.sourceId,c.accountId,c.gameId,c.communityId,depth?externalCommentId:postId,depth?'comment':'post',depth,depth?rootId:null,depth?rootId:null,depth?postId:null,crypto.createHash('sha256').update(depth?externalCommentId:postId).digest('hex'),JSON.stringify({boardId:c.boardId,_overseasScope:scope}),end]);
      // Prior synthetic association proves site only, not a successful batch.
      await control.query("INSERT INTO po_sync_run_contents(run_id,content_id,change_type,sync_scope) VALUES (?,?,'inserted','posts')",[priorRunId,rootId]);
      historical.set(c.runId,{priorRunId,rootId,commentId,postId,externalCommentId,replyId});
    }
  }
  const historicalIds=[...historical.values()].flatMap(h=>[h.rootId,h.commentId]);
  const historySnapshot=async()=>historicalIds.length?canonical(await repo.query(`SELECT * FROM po_contents WHERE id IN (${historicalIds.map(()=>'?').join(',')}) ORDER BY id`,historicalIds)):null;
  const historyBefore=await historySnapshot();
  for(const {claim,contract} of claims){
    const ctx=scheduledFirstClaimContext(claim.proof,repo),ledger=createOverseasScheduledStageCoverageLedger({repo,journal,proof:claim.proof});
    const coverage=createOverseasStageCoverage({repo,ledger}),audit=createOverseasBoundAudit({repo,journal,ledger,scheduledProof:claim.proof});
    const page=createOverseasBigPlayerPageStore({repo,verifyRunContract:async value=>{await journal.read(value);return true;},stageCoverage:coverage,scheduledProof:claim.proof});
    const [account]=await repo.query('SELECT * FROM po_accounts WHERE id=?',[contract.accountId]);
    const [sourceRow]=await repo.query('SELECT * FROM po_sources WHERE id=?',[contract.sourceId]);
    const config=typeof sourceRow.config==='string'?JSON.parse(sourceRow.config):sourceRow.config;
    const source={...sourceRow,region_code:'overseas',siteId:contract.siteId,siteUrl:contract.siteUrl,account,config:{...config,baseUrl:contract.siteUrl}};
    const descriptors=schemaDescriptors(contract,[{boardId:contract.boardId,feedKey:'synthetic-a'},{boardId:contract.boardId,feedKey:'synthetic-b'}]);
    await transaction(c=>ledger.prepareSchema(c,contract,{schemaDescriptors:descriptors}));
    await transaction(c=>ledger.prepareHistorySnapshot(c,contract));
    if(historicalChain){
      const h=historical.get(contract.runId),[tasks]=await control.query("SELECT * FROM po_overseas_expected_tasks WHERE run_id=? AND origin='history'",[contract.runId]);
      assert(tasks.length===1&&JSON.parse(tasks[0].origin_evidence).contentId===h.rootId,'PARENT_HISTORICAL_TASK_ORIGIN');
    }
    const chain=scenario==='comment-chain',nonempty=['nonempty','terminal-fields','terminal-reproduction','certified-next-slot','certified-next-slot-execution'].includes(scenario)||chain,postId=contract.siteId===request.batch.admissions[0].siteId?'51001':'52001';
    const publishedAt=new Date((Date.parse(contract.windowStart)+Date.parse(contract.windowEnd))/2);
    const item={externalId:postId,boardId:contract.boardId,contentType:'post',contentDepth:0,body:`parent fixture ${postId}`,publishedAt,fingerprint:require('node:crypto').createHash('sha256').update(postId).digest('hex'),rawPayload:{boardId:contract.boardId}};
    for(const [index,descriptor] of descriptors.entries()){
      await ctx.verify(contract);
      const cp=await repo.claimSyncCheckpoint({...descriptor,accountId:contract.accountId,siteId:contract.siteId,leaseOwner:contract.leaseOwner,leaseSeconds:60});
      assert(cp,'PARENT_EMPTY_CP_NOT_CLAIMED');
      await page.upsertContentPage({source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseSeconds:60,runContract:contract,...descriptor,items:nonempty&&index===0?[item]:[],replyTargets:[],checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:nonempty&&index===0?publishedAt:null});
    }
    if(historicalChain){
      const h=historical.get(contract.runId),pending=(await transaction(c=>ledger.readProgress(c,contract))).pending;
      assert(pending.length===1&&pending[0].taskKind==='comments'&&pending[0].rootPlatformContentId===h.postId,'PARENT_HISTORICAL_COMMENT_TASK');
      const commit=async(descriptor,items,replyTargets)=>{
        const cp=await repo.claimSyncCheckpoint({...descriptor,accountId:contract.accountId,siteId:contract.siteId,leaseOwner:contract.leaseOwner,leaseSeconds:60});assert(cp,'PARENT_HISTORICAL_CP');
        await page.upsertContentPage({source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseSeconds:60,runContract:contract,...descriptor,items,replyTargets,checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:items.length?publishedAt:null});
      };
      await commit(pending[0],[],[{postId:h.postId,commentId:h.externalCommentId,sortType:0}]);
      const replies=(await transaction(c=>ledger.readProgress(c,contract))).pending;
      assert(replies.length===1&&replies[0].taskKind==='q1_reply'&&replies[0].rootPlatformContentId===h.postId&&replies[0].commentId===h.externalCommentId&&replies[0].sortType===0,'PARENT_HISTORICAL_REPLY_TASK');
      await commit(replies[0],[{...item,externalId:h.replyId,contentType:'comment',contentDepth:2,platformParentId:h.externalCommentId,rootPlatformContentId:h.postId,body:`historical reply ${h.replyId}`,fingerprint:require('node:crypto').createHash('sha256').update(h.replyId).digest('hex')}],[]);
      const [reply]=await repo.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=?',[contract.sourceId,h.replyId]);
      assert(reply&&reply.parent_content_id===h.commentId&&reply.root_content_id===h.rootId&&Number(reply.content_depth)===2,'PARENT_HISTORICAL_GRAPH');
      const progress=await transaction(c=>ledger.readProgress(c,contract));assert(progress.total===4&&progress.completed===4&&progress.pending.length===0,'PARENT_HISTORICAL_COVERAGE');
    }
    if(nonempty){
      const progress=await transaction(c=>ledger.readProgress(c,contract));
      for(const descriptor of progress.pending){
        const cp=await repo.claimSyncCheckpoint({...descriptor,accountId:contract.accountId,siteId:contract.siteId,leaseOwner:contract.leaseOwner,leaseSeconds:60});
        assert(cp,'PARENT_NONEMPTY_COMMENT_CP');
        const commentId=String(Number(postId)+1),comment={...item,externalId:commentId,contentType:'comment',contentDepth:1,platformParentId:postId,rootPlatformContentId:postId,body:`comment ${commentId}`,fingerprint:require('node:crypto').createHash('sha256').update(commentId).digest('hex')};
        await page.upsertContentPage({source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseSeconds:60,runContract:contract,...descriptor,items:chain?[comment]:[],replyTargets:chain?[{postId,commentId,sortType:0}]:[],checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:chain?publishedAt:null});
      }
      if(chain){
        const replies=(await transaction(c=>ledger.readProgress(c,contract))).pending;
        assert(replies.length===1&&replies[0].taskKind==='q1_reply','PARENT_CHAIN_DYNAMIC_REPLY_TASK');
        for(const descriptor of replies){
          const cp=await repo.claimSyncCheckpoint({...descriptor,accountId:contract.accountId,siteId:contract.siteId,leaseOwner:contract.leaseOwner,leaseSeconds:60});assert(cp,'PARENT_CHAIN_REPLY_CP');
          const replyId=String(Number(postId)+2),reply={...item,externalId:replyId,contentType:'comment',contentDepth:2,platformParentId:String(Number(postId)+1),rootPlatformContentId:postId,body:`reply ${replyId}`,fingerprint:require('node:crypto').createHash('sha256').update(replyId).digest('hex')};
          await page.upsertContentPage({source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseSeconds:60,runContract:contract,...descriptor,items:[reply],replyTargets:[],checkpointId:cp.id,expectedCursor:cp.cursor,hasMore:false,lastItemAt:publishedAt});
        }
        const graph=await repo.query('SELECT * FROM po_contents WHERE source_id=? AND external_id IN (?,?,?)',[contract.sourceId,postId,String(Number(postId)+1),String(Number(postId)+2)]);
        const post=graph.find(x=>Number(x.content_depth)===0),comment=graph.find(x=>Number(x.content_depth)===1),reply=graph.find(x=>Number(x.content_depth)===2);
        assert(graph.length===3&&post&&comment&&reply&&comment.parent_content_id===post.id&&comment.root_content_id===post.id&&reply.parent_content_id===comment.id&&reply.root_content_id===post.id,'PARENT_CHAIN_GRAPH_INVALID');
        const complete=await transaction(c=>ledger.readProgress(c,contract));assert(complete.total===4&&complete.completed===4&&complete.pending.length===0,'PARENT_CHAIN_COVERAGE_INVALID');
      }
    }
    const second=contract.siteId===request.batch.admissions[1].siteId;
    if(!(scenario==='unsealed'&&second))assert((await transaction(c=>ledger.sealExpansion(c,contract))).status==='completed_authorized_scope','PARENT_CHILD_SEAL_FAILED');
    const childStatus=scenario==='all-failed'?'failed':second&&['partial','failed','manual','unsealed'].includes(scenario)?({partial:'partial',failed:'failed',manual:'awaiting_manual_verification',unsealed:'completed_authorized_scope'})[scenario]:'completed_authorized_scope';
    const bound=await audit.create(contract);await audit.finish({proof:bound.auditProof,status:childStatus,sourceStatus:childStatus.startsWith('completed')?'success':childStatus,...(scenario==='all-failed'?{errorCode:'FIXTURE_CHILD_FAILED',errorMessage:'synthetic terminal failure'}:{})});
    const terminalStatus=scenario==='unsealed'&&second?'partial':childStatus;
    assert((await audit.reconcile({contract,status:terminalStatus})).status==='accepted','PARENT_CHILD_TERMINAL_FAILED');
  }
  const parent=createScheduledParentStore({repo,request,journal,proofs:claims.map(x=>x.claim.proof),cursorReader});
  if(scenario==='terminal-reproduction')return require('./overseas-isolated-terminal-checks').checkTerminalFields({repo,control,target,journal,claims,parent,reproduction:true});
  if(scenario==='all-failed'){
    const ad=request.batch.admissions[0];
    const [[priorSource]]=await control.query('SELECT last_success_at FROM po_sources WHERE id=?',[ad.sourceId]);
    const result=await parent.finalize();
    const [children]=await control.query('SELECT * FROM po_sync_runs WHERE parent_run_id=? ORDER BY id',[ad.parentRunId]);
    const [[cursor]]=await control.query('SELECT COUNT(*) AS n FROM po_fixture_success_cursors');
    const [[state]]=await control.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[ad.sourceId]);
    const [[source]]=await control.query('SELECT last_success_at,last_error FROM po_sources WHERE id=?',[ad.sourceId]);
    const [events]=await control.query("SELECT * FROM po_audit_events WHERE event_type='overseas_isolated_parent_terminal'");
    const [audits]=await control.query('SELECT * FROM po_collection_runs ORDER BY id');
    const [[parentRow]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[ad.parentRunId]);
    assert(children.length===2&&children.every(c=>c.status==='failed'&&c.error_code==='FIXTURE_CHILD_FAILED'&&c.error_message==='synthetic terminal failure'&&c.finished_at!==null&&c.lease_owner===null&&c.lease_until===null),'PARENT_ALL_FAILED_CHILDREN');
    assert(result.status==='partial'&&!result.successfulCursorPublished&&result.discovered===0&&result.stored===0&&Number(cursor.n)===0,'PARENT_ALL_FAILED_CURSOR_OR_STATUS');
    assert(state.lease_run_id===null&&state.lease_owner===null&&state.lease_until===null&&state.last_status==='partial'&&state.last_reason_code==='child_not_successful','PARENT_ALL_FAILED_STATE');
    assert(source.last_success_at===priorSource.last_success_at&&source.last_error==='isolated_parent_partial'&&events.length===1&&canonical(JSON.parse(events[0].detail))===canonical(result),'PARENT_ALL_FAILED_SOURCE_EVENT');
    assert(audits.length===2&&audits.every(r=>r.status==='failed'&&r.error_code==='FIXTURE_CHILD_FAILED'&&r.error_message==='synthetic terminal failure'&&r.finished_at!==null&&Number(r.discovered_count)===0&&Number(r.stored_count)===0&&r.analyzed_count!==null&&Number(r.analyzed_count)===0&&r.alerted_count!==null&&Number(r.alerted_count)===0),'PARENT_ALL_FAILED_AUDITS');
    assert(parentRow.status==='partial'&&parentRow.finished_at!==null&&parentRow.lease_owner===null&&parentRow.lease_until===null&&Number(parentRow.discovered_count)===0&&Number(parentRow.stored_count)===0,'PARENT_ALL_FAILED_PARENT');
    return {status:'PASS_ISOLATED_PARENT_ALL_FAILED',result,childStatuses:children.map(c=>c.status),priorNonNullSourceSuccessAt:priorSource.last_success_at,sourceSuccessAtPreserved:true,parentPolicy:'current_aggregate_all_nonsuccess_partial_not_failed',successfulCursorRows:0,allFailedVerified:true,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }
  if(['certified-next-slot','certified-next-slot-execution'].includes(scenario)){
    const result=await parent.finalize();assert(result.discovered===2&&result.stored===2,'NEXT_SLOT_FIRST_PARENT_COUNTERS');
    return require('./overseas-isolated-next-slot-checks').checkNextSlot({repo,control,target,store,cursorReader,request,result,journal,executeNext:scenario==='certified-next-slot-execution'});
  }
  if(['partial','failed','manual','unsealed'].includes(scenario)){
    const result=await parent.finalize();
    const [[cursor]]=await control.query('SELECT COUNT(*) AS n FROM po_fixture_success_cursors');
    const [[state]]=await control.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[request.batch.admissions[0].sourceId]);
    assert(result.status==='partial'&&!result.successfulCursorPublished&&Number(cursor.n)===0&&state.lease_run_id===null,'PARENT_PARTIAL_ADVANCED_CURSOR');
    if(cursorReader){
      const ad=request.batch.admissions[0],scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'].map(k=>[k,ad[k]])),key=require('node:crypto').createHash('sha256').update(canonical(Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId'].map(k=>[k,ad[k]])))).digest('hex');
      await control.query('INSERT INTO po_fixture_success_cursors VALUES (?,?,?,?,?,?)',[key,ad.windowEnd.replace('T',' ').replace('Z',''),ad.parentRunId,'b'.repeat(64),ad.runId,'c'.repeat(64)]);
      const c=await repo.pool.getConnection();try{await target.verifyConnection(c);await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION READ ONLY');try{await cursorReader.readInTransaction(c,scope);assert(false,'CERTIFIED_PARTIAL_REGISTERED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED','CERTIFIED_PARTIAL_WRONG_ERROR');}await c.rollback();}finally{c.release();}
      await control.query('DELETE FROM po_fixture_success_cursors WHERE scope_sha=?',[key]);
    }
    return {status:'PASS_ISOLATED_PARENT_PARTIAL_EMPTY',checks:['normal_success_and_nonsuccess_bound_children','partial_parent_atomic_release_zero_success_cursor',...(cursorReader?['partial_parent_synthetic_cursor_no_registry_rejected']:[])],result,partialRegistrationVerified:Boolean(cursorReader),partialMatrixVerified:true,partialShape:scenario==='partial'?'sealed_empty_child_marked_partial_not_unsealed_failure':scenario,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }
  if(scenario==='ack-unknown'||scenario==='certified-cursor-ack-unknown'){
    const get=repo.pool.getConnection.bind(repo.pool);let injected=false;
    repo.pool.getConnection=async()=>{const c=await get();return new Proxy(c,{get(t,key){if(key==='commit')return async()=>{await t.commit();injected=true;throw Error('PARENT_ACK_LOSS');};const v=t[key];return typeof v==='function'?v.bind(t):v;}});};
    try{try{await parent.finalize();assert(false,'PARENT_UNKNOWN_NOT_INJECTED');}catch(e){assert(e.code==='OVERSEAS_PARENT_COMMIT_UNKNOWN','PARENT_UNKNOWN_WRONG_ERROR');}}finally{repo.pool.getConnection=get;}
    const [[row]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId]);
    const [[cursor]]=await control.query('SELECT COUNT(*) AS n FROM po_fixture_success_cursors');
    const [[event]]=await control.query("SELECT COUNT(*) AS n FROM po_audit_events WHERE event_type='overseas_isolated_parent_terminal'");
    assert(injected&&row.status==='completed_authorized_scope'&&Number(cursor.n)===2&&Number(event.n)===1,'PARENT_UNKNOWN_DURABLE_ATOMICITY');
    if(cursorReader){const scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'].map(k=>[k,claims[0].contract[k]]));
      const c=await repo.pool.getConnection();try{await target.verifyConnection(c);await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION READ ONLY');try{await cursorReader.readInTransaction(c,scope);assert(false,'CERTIFIED_UNKNOWN_ACK_REGISTERED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED','CERTIFIED_UNKNOWN_ACK_WRONG_ERROR');}await c.rollback();}finally{c.release();}
    }
    try{await parent.finalize();assert(false,'PARENT_UNKNOWN_REPLAY_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_PARENT_FENCE_LOST','PARENT_UNKNOWN_REPLAY_WRONG_ERROR');}
    return {status:'PASS_ISOLATED_PARENT_COMMIT_UNKNOWN_EMPTY',checks:['actual_commit_ack_loss_no_result','durable_atomic_parent_cursor_event','original_proofs_no_second_finalize',...(cursorReader?['unknown_parent_ack_no_registered_cursor_reader']:[])],ackUnknownRegistrationVerified:Boolean(cursorReader),commitUnknownVerified:true,automaticResumeVerified:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }
  const snapshot=async()=>canonical(await Promise.all(['po_sync_runs','po_source_schedule_state','po_sources','po_fixture_success_cursors','po_audit_events'].map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1`))));
  const before=await snapshot();
  if(scenario==='terminal-fields'){
    const terminalFieldResult=await require('./overseas-isolated-terminal-checks').checkTerminalFields({repo,control,target,journal,claims,parent});
    const result=await parent.finalize();
    const [cursors]=await control.query('SELECT * FROM po_fixture_success_cursors ORDER BY scope_sha');
    const [[state]]=await control.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[request.batch.admissions[0].sourceId]);
    const [[parentRow]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId]);
    assert(result.status==='completed_authorized_scope'&&result.discovered===2&&result.stored===2&&cursors.length===2&&parentRow.status==='completed_authorized_scope'&&parentRow.finished_at!==null&&parentRow.lease_owner===null&&parentRow.lease_until===null&&state.lease_run_id===null&&state.lease_owner===null&&state.lease_until===null,'TERMINAL_FIELDS_NORMAL_FINALIZE_FAILED');
    return {status:'PASS_ISOLATED_PARENT_TERMINAL_FIELDS',terminalFieldResult,result,cursors,terminalDetailFieldsVerified:true,rawDatabaseEveryColumnVerified:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }
  const membershipRaceEvidence=[];
  let historicalRaceResult;
  if(scenario==='historical-ancestor-race')historicalRaceResult=await require('./overseas-isolated-historical-race-checks').checkHistoricalRace({repo,control,target,parent,claims,historical});
  if(historicalChain){
    const ancestorId=[...historical.values()][0].commentId;
    await control.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ancestorId]);const drift=await snapshot();
    try{await parent.finalize();assert(false,'PARENT_HISTORICAL_DELETED_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','PARENT_HISTORICAL_DELETED_WRONG_ERROR');}
    assert(await snapshot()===drift,'PARENT_HISTORICAL_DELETED_PARENT_WRITES');await control.query('UPDATE po_contents SET is_deleted=0 WHERE id=?',[ancestorId]);
  }
  if(scenario==='comment-chain'){
    const [ancestor]=await repo.query('SELECT * FROM po_contents WHERE content_depth=1 ORDER BY id LIMIT 1');assert(ancestor,'PARENT_CHAIN_ANCESTOR_MISSING');
    await control.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ancestor.id]);const drift=await snapshot();
    try{await parent.finalize();assert(false,'PARENT_CHAIN_DELETED_ANCESTOR_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','PARENT_CHAIN_DELETED_WRONG_ERROR');}
    assert(await snapshot()===drift,'PARENT_CHAIN_DELETED_PARENT_WRITES');await control.query('UPDATE po_contents SET is_deleted=0 WHERE id=?',[ancestor.id]);
    // Observe the original finalize after the entire current ancestor closure.
    const childIds=claims.map(x=>x.contract.runId);
    const contentIds=(await repo.query(`SELECT DISTINCT content_id FROM po_sync_run_contents WHERE run_id IN (${childIds.map(()=>'?').join(',')}) ORDER BY content_id`,childIds)).map(x=>x.content_id);
    assert(contentIds.length===6,'PARENT_MEMBERSHIP_EXPECTED_SIX_CONTENTS');
    const memberId=require('node:crypto').randomUUID(),insertSql='INSERT INTO po_content_feed_memberships(id,account_id,content_id,feed_key) VALUES (?,?,?,?)';
    const insertParams=[memberId,ancestor.account_id,ancestor.id,`fixture-parent-${memberId}`];
    const get=repo.pool.getConnection.bind(repo.pool),writer=await get(),lockedIds=[];
    let barrierHit=false,writerTransaction=false;const baseline=await snapshot();
    try{
      await target.verifyConnection(writer);await writer.query('SET SESSION innodb_lock_wait_timeout=1');
      const [[memberBaseline]]=await writer.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(memberBaseline.n)===0,'PARENT_MEMBERSHIP_NOT_FRESH');
      const [[writerConnection]]=await writer.query('SELECT CONNECTION_ID() AS id');
      repo.pool.getConnection=async()=>{const c=await get();return new Proxy(c,{get(t,k){
        if(k==='query')return async(sql,p)=>{
          if(sql==='SELECT id FROM po_content_feed_memberships WHERE account_id=? AND content_id=? ORDER BY id FOR UPDATE'&&!barrierHit){
            barrierHit=true;assert(canonical(lockedIds)===canonical([...contentIds].sort()),'PARENT_MEMBERSHIP_BARRIER_BEFORE_COMPLETE_LOCKS');
            const [[parentConnection]]=await t.query('SELECT CONNECTION_ID() AS id');assert(parentConnection.id!==writerConnection.id,'PARENT_MEMBERSHIP_WRITER_NOT_DISTINCT');
            await writer.beginTransaction();writerTransaction=true;let timeoutCode=null;
            try{await writer.query(insertSql,insertParams);assert(false,'PARENT_MEMBERSHIP_INSERT_BYPASSED_LOCK');}catch(e){assert(e.code==='ER_LOCK_WAIT_TIMEOUT','PARENT_MEMBERSHIP_INSERT_WRONG_ERROR');timeoutCode=e.code;}
            const [[ownCount]]=await writer.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(ownCount.n)===0,'PARENT_MEMBERSHIP_TIMEOUT_WRITER_RESIDUE');
            await writer.rollback();writerTransaction=false;
            const [[count]]=await control.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(count.n)===0,'PARENT_MEMBERSHIP_TIMEOUT_PARTIAL_INSERT');
            membershipRaceEvidence.push({barrier:'actual_parent_finalize_after_all_sorted_ancestor_current_locks',parentConnectionId:parentConnection.id,writerConnectionId:writerConnection.id,lockedContentIds:[...lockedIds],targetContentId:ancestor.id,errorCode:timeoutCode,rowsBeforeInsert:Number(memberBaseline.n),rowsInWriterTransactionAfterTimeout:Number(ownCount.n),rowsAfterTimeout:Number(count.n)});
            // Fixture sentinel invokes the normal rollback path before writes.
            throw Object.assign(Error('PARENT_MEMBERSHIP_BARRIER_RELEASE'),{code:'PARENT_MEMBERSHIP_BARRIER_RELEASE'});
          }
          const result=await t.query(sql,p);if(sql==='SELECT * FROM po_contents WHERE id=? FOR UPDATE')lockedIds.push(p[0]);return result;
        };const v=t[k];return typeof v==='function'?v.bind(t):v;
      }});};
      try{await parent.finalize();assert(false,'PARENT_MEMBERSHIP_BARRIER_NOT_REJECTED');}catch(e){assert(e.code==='PARENT_MEMBERSHIP_BARRIER_RELEASE','PARENT_MEMBERSHIP_BARRIER_WRONG_ERROR');}finally{repo.pool.getConnection=get;}
      assert(barrierHit&&await snapshot()===baseline,'PARENT_MEMBERSHIP_BARRIER_PARENT_WRITES');
      await writer.beginTransaction();writerTransaction=true;const [inserted]=await writer.query(insertSql,insertParams);assert(inserted.affectedRows===1,'PARENT_MEMBERSHIP_RELEASED_INSERT_FAILED');
      await writer.commit();writerTransaction=false;
      const [[count]]=await control.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(count.n)===1,'PARENT_MEMBERSHIP_RELEASED_INSERT_NOT_DURABLE');
      const [removed]=await control.query('DELETE FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(removed.affectedRows===1,'PARENT_MEMBERSHIP_SYNTHETIC_CLEANUP_FAILED');
      Object.assign(membershipRaceEvidence[0],{rowsAfterRelease:Number(count.n),syntheticMembershipRemoved:true});assert(await snapshot()===baseline,'PARENT_MEMBERSHIP_RELEASE_CHANGED_PARENT');
    }finally{repo.pool.getConnection=get;if(writerTransaction)await writer.rollback().catch(()=>{});writer.release();}
  }
  const integrityChecks=[];
  if(membershipRaceEvidence.length)integrityChecks.push('actual_parent_finalize_membership_insert_timeout_zero_insert_zero_parent_writes','released_parent_transaction_allows_insert_then_synthetic_membership_cleanup');
  if(scenario==='integrity'){
    async function rejection(expected,code){const baseline=await snapshot();try{await parent.finalize();assert(false,code);}catch(e){assert(e.code===expected,`${code}_WRONG_ERROR`);}assert(await snapshot()===baseline,`${code}_WROTE`);integrityChecks.push(code);}
    const childId=request.batch.admissions[1].runId,parentId=request.batch.admissions[0].parentRunId;
    // Temporarily remove batch membership, preserving the actual child row,
    // tasks and audit. No delete and no reconstruction of claim proof.
    await control.query('UPDATE po_sync_runs SET parent_run_id=NULL WHERE id=?',[childId]);
    await rejection('OVERSEAS_SCHEDULED_PARENT_SET_CHANGED','missing_child_membership_rejected');
    await control.query('UPDATE po_sync_runs SET parent_run_id=? WHERE id=?',[parentId,childId]);
    const extraId=require('node:crypto').randomUUID();
    await control.query("INSERT INTO po_sync_runs(id,source_id,account_id,site_id,parent_run_id,trigger_type,status,sync_mode,window_start,window_end,schedule_version) SELECT ?,source_id,account_id,'fixture-extra',parent_run_id,trigger_type,'queued',sync_mode,window_start,window_end,schedule_version FROM po_sync_runs WHERE id=?",[extraId,childId]);
    await rejection('OVERSEAS_SCHEDULED_PARENT_SET_CHANGED','extra_child_rejected');
    // The extra row is a disposable synthetic fixture with no dependents.
    await control.query('DELETE FROM po_sync_runs WHERE id=?',[extraId]);
    const [event]=await repo.query("SELECT * FROM po_audit_events WHERE event_type='overseas_bound_terminal' ORDER BY id LIMIT 1");
    const original=JSON.parse(event.detail);
    for(const field of ['linksSha256','taskSetSha256','completionSetSha256','schemaSha256','contractSha256']){
      await control.query('UPDATE po_audit_events SET detail=? WHERE id=?',[canonical({...original,[field]:'f'.repeat(64)}),event.id]);
      await rejection(field==='contractSha256'?'OVERSEAS_AUDIT_BINDING_UNPROVEN':'OVERSEAS_PARENT_CHILD_UNPROVEN',`terminal_${field}_drift_rejected`);
      await control.query('UPDATE po_audit_events SET detail=? WHERE id=?',[event.detail,event.id]);
    }
    assert(await snapshot()===before,'PARENT_INTEGRITY_FIXTURE_NOT_RESTORED');
  }
  if(scenario==='nonempty'){
    const [membership]=await repo.query('SELECT * FROM po_content_feed_memberships ORDER BY id LIMIT 1');
    assert(membership,'PARENT_NONEMPTY_MEMBERSHIP_MISSING');
    await control.query("UPDATE po_content_feed_memberships SET feed_metadata='{}' WHERE id=?",[membership.id]);
    const drift=await snapshot();
    try{await parent.finalize();assert(false,'PARENT_MEMBERSHIP_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_COVERAGE_LINK_TASK_CONFLICT','PARENT_MEMBERSHIP_WRONG_ERROR');}
    assert(await snapshot()===drift,'PARENT_MEMBERSHIP_DRIFT_WROTE');
    await control.query('UPDATE po_content_feed_memberships SET feed_metadata=? WHERE id=?',[typeof membership.feed_metadata==='string'?membership.feed_metadata:JSON.stringify(membership.feed_metadata),membership.id]);
  }
  const [cp]=await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id LIMIT 1');
  await control.query('UPDATE po_sync_checkpoints SET items_fetched=items_fetched+1 WHERE id=?',[cp.id]);
  const drift=await snapshot();
  try{await parent.finalize();assert(false,'PARENT_CP_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT','PARENT_CP_DRIFT_WRONG_ERROR');}
  assert(await snapshot()===drift,'PARENT_CP_DRIFT_WROTE');
  await control.query('UPDATE po_sync_checkpoints SET items_fetched=? WHERE id=?',[cp.items_fetched,cp.id]);
  assert(await snapshot()===before,'PARENT_FIXTURE_RESTORE_FAILED');
  const parentId=request.batch.admissions[0].parentRunId;
  await control.query("UPDATE po_sync_runs SET lease_owner='drift' WHERE id=?",[parentId]);
  const ownerDrift=await snapshot();
  try{await parent.finalize();assert(false,'PARENT_OWNER_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_PARENT_FENCE_LOST','PARENT_OWNER_WRONG_ERROR');}
  assert(await snapshot()===ownerDrift,'PARENT_OWNER_DRIFT_WROTE');
  await control.query('UPDATE po_sync_runs SET lease_owner=? WHERE id=?',[request.ownerId,parentId]);
  // A newer certified cursor is never overwritten. Synthetic preexisting row,
  // not a claim that this fixture itself certifies a later successful batch.
  const hash=v=>require('node:crypto').createHash('sha256').update(v).digest('hex');
  const ad=request.batch.admissions[0],key=hash(canonical(Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId'].map(k=>[k,ad[k]]))));
  await control.query('INSERT INTO po_fixture_success_cursors VALUES (?,?,?,?,?,?)',[key,ad.windowEnd.replace('T',' ').replace('Z',''),parentId,'b'.repeat(64),ad.runId,'c'.repeat(64)]);
  const newer=await snapshot();
  try{await parent.finalize();assert(false,'PARENT_CURSOR_REGRESSION_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_PARENT_CURSOR_NOT_ADVANCING','PARENT_CURSOR_WRONG_ERROR');}
  assert(await snapshot()===newer,'PARENT_CURSOR_REGRESSION_WROTE');
  await control.query('DELETE FROM po_fixture_success_cursors WHERE scope_sha=?',[key]);
  assert(await snapshot()===before,'PARENT_CURSOR_FIXTURE_NOT_RESTORED');
  // Deterministic failure after cursor + parent/state/source writes: all roll back.
  const originalGet=repo.pool.getConnection.bind(repo.pool);let injected=false;
  repo.pool.getConnection=async()=>{const c=await originalGet();return new Proxy(c,{get(t,key){if(key==='query')return async(sql,p)=>{if(sql.startsWith('INSERT INTO po_audit_events')&&p?.[5]==='overseas_isolated_parent_terminal'){injected=true;throw Object.assign(Error('PARENT_TAIL_FAULT'),{code:'PARENT_TAIL_FAULT'});}return t.query(sql,p);};const v=t[key];return typeof v==='function'?v.bind(t):v;}});};
  try{try{await parent.finalize();assert(false,'PARENT_TAIL_FAULT_NOT_HIT');}catch(e){assert(e.code==='PARENT_TAIL_FAULT','PARENT_TAIL_WRONG_ERROR');}}finally{repo.pool.getConnection=originalGet;}
  assert(injected&&await snapshot()===before,'PARENT_TAIL_PARTIAL_WRITE');
  const race=await Promise.allSettled([parent.finalize(),parent.finalize()]);
  assert(race.filter(x=>x.status==='fulfilled').length===1&&race.filter(x=>x.status==='rejected').length===1,'PARENT_RACE_NOT_SINGLE_WINNER');
  const result=race.find(x=>x.status==='fulfilled').value;
  if(cursorReader)return require('./overseas-isolated-certified-cursor-checks').checkCertifiedCursor({repo,control,target,cursorReader,request,result});
  const [cursors]=await control.query('SELECT * FROM po_fixture_success_cursors ORDER BY scope_sha');
  const [[state]]=await control.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[request.batch.admissions[0].sourceId]);
  const [[parentRow]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId]);
  assert(cursors.length===2&&parentRow.status==='completed_authorized_scope'&&parentRow.lease_owner===null&&state.lease_run_id===null&&state.lease_owner===null,'PARENT_ATOMIC_TERMINAL_INVALID');
  if(scenario==='nonempty')assert(result.discovered===2&&result.stored===2,'PARENT_NONEMPTY_COUNTERS');
  if(scenario==='comment-chain')assert(result.discovered===6&&result.stored===6,'PARENT_CHAIN_COUNTERS');
  if(historicalChain){
    assert(result.discovered===2&&result.stored===2&&await historySnapshot()===historyBefore,'PARENT_HISTORICAL_COUNTERS_OR_MUTATION');
    const childIds=claims.map(x=>x.contract.runId),links=await repo.query(`SELECT rc.*,c.content_depth FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id IN (${childIds.map(()=>'?').join(',')})`,childIds);
    assert(links.length===2&&links.every(x=>Number(x.content_depth)===2&&x.sync_scope==='comments'&&x.change_type==='inserted'&&!historicalIds.includes(x.content_id)),'PARENT_HISTORICAL_CURRENT_LINK_SET');
    for(const {contract:c} of claims){
      const h=historical.get(c.runId),[reply]=await repo.query('SELECT id FROM po_contents WHERE source_id=? AND external_id=?',[c.sourceId,h.replyId]);
      const ownLinks=links.filter(x=>x.run_id===c.runId),[child]=await repo.query('SELECT discovered_count,stored_count FROM po_sync_runs WHERE id=?',[c.runId]);
      assert(ownLinks.length===1&&ownLinks[0].content_id===reply.id&&Number(child.discovered_count)===1&&Number(child.stored_count)===1,'PARENT_HISTORICAL_CHILD_COUNTS');
      const prior=await repo.query('SELECT rc.*,r.source_id,r.account_id,r.site_id,r.parent_run_id FROM po_sync_run_contents rc JOIN po_sync_runs r ON r.id=rc.run_id WHERE rc.content_id=?',[h.rootId]);
      assert(prior.length===1&&prior[0].run_id===h.priorRunId&&prior[0].sync_scope==='posts'&&prior[0].change_type==='inserted'&&prior[0].source_id===c.sourceId&&prior[0].account_id===c.accountId&&prior[0].site_id===c.siteId&&prior[0].parent_run_id===null&&!childIds.includes(prior[0].run_id),'PARENT_HISTORICAL_PRIOR_SITE_LINK');
    }
    const comments=[...historical.values()].map(h=>h.commentId),[count]=await repo.query(`SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE content_id IN (${comments.map(()=>'?').join(',')})`,comments);
    if(historicalRaceResult){assert(Number(count.n)===0,'HISTORICAL_RACE_COMMENT_LINKED');historicalRaceResult.normalParentFinalizeVerified=true;return{...historicalRaceResult,result,cursors,historicalAncestorCount:4,newReplyCount:2,currentBatchUniqueLinks:2};}
    assert(Number(count.n)===0,'PARENT_HISTORICAL_COMMENT_WAS_LINKED');
    return {status:'PASS_ISOLATED_PARENT_HISTORICAL_COMMENT_REPLY_CHAIN',checks:['four_preexisting_ancestors_unchanged','synthetic_prior_root_site_links_not_completion_proof','history_comments_then_dynamic_reply_four_tasks_each','two_current_depth2_links_only','deleted_historical_intermediate_zero_parent_writes','parent_state_source_cursor_event_atomic'],result,cursors,historicalParentChainVerified:true,historicalAncestorsNotCurrentBatchLinked:true,historicalRootHasSyntheticPriorRunSiteAssociation:true,syntheticPriorRunAssociationIsCompletionProof:false,historicalAncestorCount:4,newReplyCount:2,currentBatchUniqueLinks:2,ancestorConcurrencyVerified:false,membershipConcurrencyVerified:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }
  return {status:scenario==='comment-chain'?'PASS_ISOLATED_PARENT_COMMENT_REPLY_CHAIN':scenario==='integrity'?'PASS_ISOLATED_PARENT_INTEGRITY_FIELDS':scenario==='nonempty'?'PASS_ISOLATED_PARENT_NONEMPTY_POSTS':'PASS_ISOLATED_PARENT_EMPTY_TWO_SITE',checks:['normal_two_site_first_claim_proofs','two_feed_tasks_each_sealed_bound_terminal','checkpoint_snapshot_drift_zero_parent_writes','parent_owner_drift_zero_writes','cursor_non_advancing_zero_writes','tail_audit_fault_full_rollback','concurrent_finalize_single_winner','parent_state_source_cursor_event_atomic',...integrityChecks,...(scenario==='comment-chain'?['dynamic_reply_registration_and_four_completed_tasks_each','two_durable_post_comment_reply_graphs_six_unique_links','deleted_intermediate_ancestor_zero_parent_writes']:[]),...(scenario==='nonempty'?['two_unique_posts_comment_tasks_completed','membership_metadata_drift_zero_parent_writes']:[])],result,cursors,commentReplyChainVerified:scenario==='comment-chain',historicalParentChainVerified:false,emptyFeedLastItemAt:null,cursorMeaning:'certified_complete_window_end_not_last_content_time',realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,partialMatrixVerified:false,cursorRegressionVerified:true,commitUnknownVerified:false,ancestorConcurrencyVerified:false,membershipRaceEvidence,membershipConcurrencyVerified:membershipRaceEvidence.length===1,membershipConcurrencyScope:membershipRaceEvidence.length?'actual_parent_finalize_content_fk_insert_barrier':null,productionActivationAllowed:false};
}
module.exports={checkParent};
