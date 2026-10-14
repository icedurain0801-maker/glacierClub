'use strict';
// Fresh same-process isolated next-slot execution. Never a recovery entry point.
const crypto=require('node:crypto');
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {iso}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const {publishScheduledFirstClaim}=require('../worker/src/overseasScheduledClaimPublisher');
const {createIsolatedScheduledCandidateDeps}=require('../worker/src/overseasScheduledCandidateFactory');
const {createScheduledParentStore}=require('../server/src/db/overseasScheduledParentStore');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
async function runNextSlotExecution({repo,control,target,store,cursorReader,journal,previousRequest,request,record}){
  const pool=repo.pool,getOriginal=pool.getConnection,queryOriginal=pool.query;
  let connectionsVerified=0;
  pool.getConnection=async()=>{const c=await getOriginal.call(pool);try{await target.verifyConnection(c);connectionsVerified++;return c;}catch(e){c.release();throw e;}};
  pool.query=async(...args)=>{const c=await pool.getConnection();try{return await c.query(...args);}finally{c.release();}};
  try{
    await target.verifyConnection(control);
    const firstIds=[previousRequest.batch.admissions[0].parentRunId,...previousRequest.batch.admissions.map(a=>a.runId)],marks=firstIds.map(()=>'?').join(',');
    const oldContents=await repo.query(`SELECT DISTINCT c.id FROM po_contents c JOIN po_sync_run_contents rc ON rc.content_id=c.id WHERE rc.run_id IN (${marks}) ORDER BY c.id`,firstIds);
    const oldIds=oldContents.map(c=>c.id);
    const auditIds=(await repo.query('SELECT id FROM po_collection_runs ORDER BY id')).map(r=>r.id);
    const eventIds=(await repo.query('SELECT id FROM po_audit_events ORDER BY id')).map(r=>r.id);
    const byIds=async(table,ids)=>ids.length?repo.query(`SELECT * FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,ids):[];
    const oldFingerprint=async()=>hash(canonical(await Promise.all([
      repo.query(`SELECT * FROM po_sync_runs WHERE id IN (${marks}) ORDER BY id`,firstIds),
      ...['po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_run_contents'].map(t=>repo.query(`SELECT * FROM ${t} WHERE run_id IN (${marks}) ORDER BY 1,2`,firstIds)),
      repo.query(`SELECT DISTINCT cp.* FROM po_sync_checkpoints cp JOIN po_overseas_expected_tasks t ON t.checkpoint_id=cp.id WHERE t.run_id IN (${marks}) ORDER BY cp.id`,firstIds),
      byIds('po_contents',oldIds),
      oldIds.length?repo.query(`SELECT * FROM po_content_feed_memberships WHERE content_id IN (${oldIds.map(()=>'?').join(',')}) ORDER BY id`,oldIds):[],
      byIds('po_collection_runs',auditIds),byIds('po_audit_events',eventIds)
    ])));
    const beforeOld=await oldFingerprint();
    const sourceBefore=canonical(await repo.query('SELECT * FROM po_sources ORDER BY id'));
    const stateBefore=canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'));
    const children=[],proofs=[];
    require('../server/src/runtimeEnv').loadRuntimeEnv=()=>{};
    repo.advisoryLocks=new Map();
    for(const [index,a] of request.batch.admissions.entries()){
      const claim=await store.firstClaim(request,{runId:a.runId,leaseOwner:`isolated:next-slot:${index}`,leaseSeconds:300});
      assert(Number(claim.run.lease_epoch)===1&&Number(claim.run.attempts)===1,'NEXT_EXEC_FIRST_CLAIM_NOT_ORIGINAL');
      const c=await publishScheduledFirstClaim({repo,journal,proof:claim.proof});proofs.push(claim.proof);
      const ids=[0,1,2,3].map(n=>String(71001+index*1000+n)),priorRoot=index===0?'51001':'52001';
      const publishedAt=new Date((Date.parse(c.windowStart)+Date.parse(c.windowEnd))/2).toISOString();
      const base=new URL(c.siteUrl),requests=[],siteToken=`synthetic-next-slot-token:${c.siteId}`;
      const content=(id,body)=>({id,content:[{type:0,data:body}],createTime:publishedAt});
      const transport=async(value,options)=>{
        const u=new URL(value),login=u.pathname.endsWith('/login/token');
        assert(u.origin===base.origin&&/^\/api\/club\/v[12]\//.test(u.pathname),'NEXT_EXEC_TRANSPORT_SCOPE');
        // Authorization carries languageId; legacy business requests do not.
        // Record that distinction, never invent real provider site separation.
        if(login)assert(['gameId','gameVersion','languageId'].every(k=>u.searchParams.getAll(k).length===1&&u.searchParams.get(k)===base.searchParams.get(k))&&!u.searchParams.has('env'),'NEXT_EXEC_AUTH_CONTEXT');
        else assert(['env','gameId','gameVersion','languageId'].every(k=>!u.searchParams.has(k))&&options?.headers?.authorization===siteToken,'NEXT_EXEC_BOUND_SITE_TOKEN');
        requests.push({path:u.pathname,postId:u.searchParams.get('postId'),commentId:u.searchParams.get('commentId'),siteId:c.siteId,expectedLanguageId:base.searchParams.get('languageId'),actualLanguageId:u.searchParams.get('languageId'),siteTokenBound:!login});
        let payload;
        if(login)payload={code:0,data:{token:siteToken}};
        else if(u.pathname.endsWith('/user/context'))payload={code:0,data:{gameBoards:[{id:Number(c.boardId),name:'synthetic-next-slot'}]}};
        else if(u.pathname.endsWith('/auth/board'))payload={code:0,data:{id:Number(c.boardId),groups:[{id:10,name:'info',type:0,sections:[{id:11,name:'news'}]}]}};
        else if(u.pathname.endsWith('/merged-list')||u.pathname.endsWith('/post/list'))payload={code:0,data:{list:[{...content(ids[0],`new synthetic post ${index}`),title:'synthetic next slot',commentCount:2}],total:1,hasMore:false}};
        else if(u.pathname.endsWith('/post/')){assert(u.searchParams.get('postId')===ids[0],'NEXT_EXEC_DETAIL_ROOT');payload={code:0,data:{...content(ids[0],`new synthetic post detail ${index}`),title:'synthetic next slot',commentCount:2}};}
        else if(u.pathname.includes('/comment/')){
          const root=u.searchParams.get('postId');
          if(root===priorRoot){assert(!u.searchParams.get('commentId'),'NEXT_EXEC_HISTORY_REPLY_UNEXPECTED');payload={code:0,data:[],total:0,hasMore:false};}
          else {assert(root===ids[0],'NEXT_EXEC_COMMENT_SCOPE');
            if(u.searchParams.get('commentId')){assert(u.searchParams.get('commentId')===ids[1],'NEXT_EXEC_REPLY_SCOPE');payload={code:0,data:[content(ids[3],`new dynamic reply ${index}`)],total:1,hasMore:false};}
            else payload={code:0,data:[{...content(ids[1],`new comment ${index}`),commentCount:2,replies:[content(ids[2],`new inline reply ${index}`)]}],total:1,hasMore:false};
          }
        }else throw Object.assign(Error('NEXT_EXEC_UNKNOWN_PATH'),{code:'NEXT_EXEC_UNKNOWN_PATH'});
        return {ok:true,status:200,url:String(u),json:async()=>payload};
      };
      const options={baseDeps:{repo,connectors:{},credentialContext:{load:async(_s,kind)=>{if(kind==='account_password')throw Object.assign(Error('synthetic password unavailable'),{code:'CREDENTIAL_NOT_FOUND'});return {apiToken:'synthetic-next-slot-base-token'};},loadApiToken:async()=>'synthetic-next-slot-base-token'},ai:{configured:()=>true,profiles:{light:{version:'light-v1'}}},leaseOwner:'synthetic-next-worker',leaseSeconds:60,pageSize:20,pageBudget:2,pageTimeoutMs:1000,dailyRunTimeoutMs:15000,dailyFeedFetchConcurrency:1,dailyCommentFetchConcurrency:1,dailyReplyFetchConcurrency:1},journal,proof:claim.proof,transport,translationVersion:'translation-v1',analysisProfile:{name:'light',version:'light-v1'}};
      const sourceInput={id:c.sourceId,platform:'bigplayer_h5',region_code:'overseas'},runInput={id:c.runId,source_id:c.sourceId,account_id:c.accountId,site_id:c.siteId};
      const zero=async()=>canonical(await Promise.all(['po_collection_runs','po_audit_events','po_contents','po_sync_checkpoints','po_overseas_expected_tasks','po_sync_run_contents','po_analysis_jobs','po_translation_jobs'].map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1,2`))));
      const zeroBefore=await zero();
      for(const badRun of [{...runInput,id:a.parentRunId},{...runInput,lease_epoch:2},{...runInput,parent_run_id:'00000000-0000-0000-0000-000000000099'},{...runInput,window_start:new Date(Date.parse(c.windowStart)+1).toISOString()}]){
        const bad=createIsolatedScheduledCandidateDeps(options);try{try{await bad.resolveSourceDeps(sourceInput,badRun);assert(false,'NEXT_EXEC_BAD_RUN_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT','NEXT_EXEC_BAD_RUN_ERROR');}}finally{bad.closeOverseasCandidate();}
      }
      assert(requests.length===0&&await zero()===zeroBefore,'NEXT_EXEC_BAD_RUN_WRITES_OR_SENDS');
      const candidate=createIsolatedScheduledCandidateDeps(options);
      record({phase:'next_child_running',runId:c.runId,siteId:c.siteId,leaseEpoch:c.leaseEpoch});
      try{await require('../worker/src/worker').runSource(candidate,sourceInput,runInput);}finally{candidate.closeOverseasCandidate();}
      const [run]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[c.runId]);
      const links=await repo.query('SELECT rc.*,c.* FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? ORDER BY c.content_depth,c.external_id',[c.runId]);
      assert(run.status==='completed_authorized_scope'&&Number(run.lease_epoch)===1&&Number(run.discovered_count)===4&&Number(run.stored_count)===4&&run.lease_owner===null&&run.lease_until===null,'NEXT_EXEC_CHILD_TERMINAL');
      assert(links.length===4&&new Set(links.map(r=>r.id)).size===4&&links.every(r=>ids.includes(r.external_id)),'NEXT_EXEC_SCOPED_LINKS');
      const post=links.find(r=>r.external_id===ids[0]),comment=links.find(r=>r.external_id===ids[1]);
      assert(post&&Number(post.content_depth)===0&&comment&&Number(comment.content_depth)===1&&comment.parent_content_id===post.id&&comment.root_content_id===post.id&&links.filter(r=>[ids[2],ids[3]].includes(r.external_id)).every(r=>r.parent_content_id===comment.id&&r.root_content_id===post.id&&Number(r.content_depth)===2),'NEXT_EXEC_SCOPED_GRAPH');
      const tasks=await repo.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256',[c.runId]),history=tasks.filter(t=>t.origin==='history');
      assert(tasks.length>0&&tasks.every(t=>t.state==='completed')&&history.length===1&&JSON.parse(history[0].descriptor).rootPlatformContentId===priorRoot&&requests.some(r=>r.path.includes('/comment/')&&r.postId===priorRoot),'NEXT_EXEC_HISTORY_EMPTY_NOT_PROVEN');
      const [manifest]=await repo.query('SELECT * FROM po_overseas_stage_manifests WHERE run_id=?',[c.runId]);
      assert(manifest.coverage_status==='sealed'&&Number(manifest.history_sealed)===1&&Number(manifest.expansion_sealed)===1,'NEXT_EXEC_MANIFEST_NOT_SEALED');
      const cps=await repo.query('SELECT cp.* FROM po_sync_checkpoints cp JOIN po_overseas_expected_tasks t ON t.checkpoint_id=cp.id WHERE t.run_id=? ORDER BY cp.id',[c.runId]);
      assert(cps.length===tasks.length&&cps.every(cp=>cp.status==='completed'&&cp.cursor===null&&cp.lease_owner===null&&cp.lease_until===null),'NEXT_EXEC_CHECKPOINTS');
      for(const table of ['po_analysis_jobs','po_translation_jobs']){const jobs=await repo.query(`SELECT j.* FROM ${table} j JOIN po_sync_run_contents rc ON rc.content_id=j.content_id WHERE rc.run_id=? ORDER BY j.id`,[c.runId]);assert(jobs.length===4&&jobs.every(j=>j.status==='pending'&&Number(j.attempts)===0&&j.lease_owner===null),'NEXT_EXEC_PENDING_JOBS');}
      assert(await oldFingerprint()===beforeOld,'NEXT_EXEC_PREVIOUS_BATCH_CHANGED');
      const [runningParent]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[a.parentRunId]);
      assert(runningParent.status==='running'&&Number(runningParent.lease_epoch)===1&&Number(runningParent.attempts)===1&&runningParent.lease_owner===request.ownerId&&iso(runningParent.lease_until)===request.leaseUntil,'NEXT_EXEC_PARENT_START');
      children.push({runId:c.runId,siteId:c.siteId,leaseEpoch:1,discovered:4,stored:4,uniqueContentIds:links.map(r=>r.id),tasks:tasks.length,historyTasks:history.length,historyRoot:priorRoot,syntheticRequests:requests});
      record({phase:'next_child_terminal',...children.at(-1)});
    }
    const newIds=children.flatMap(c=>c.uniqueContentIds);
    assert(new Set(newIds).size===8&&newIds.every(id=>!oldIds.includes(id)),'NEXT_EXEC_NEW_OLD_CONTENT_OVERLAP');
    assert(sourceBefore===canonical(await repo.query('SELECT * FROM po_sources ORDER BY id'))&&stateBefore===canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id')),'NEXT_EXEC_CHILD_SOURCE_STATE_CHANGED');
    const parent=createScheduledParentStore({repo,request,journal,proofs,cursorReader}),result=await parent.finalize();
    assert(result.status==='completed_authorized_scope'&&result.discovered===8&&result.stored===8&&result.successfulCursorPublished,'NEXT_EXEC_PARENT_RESULT');
    const a=request.batch.admissions[0];
    const [state]=await repo.query('SELECT * FROM po_source_schedule_state WHERE source_id=?',[a.sourceId]);
    assert(state.lease_run_id===null&&state.lease_owner===null&&state.lease_until===null&&state.last_status==='completed_authorized_scope'&&Number(state.lease_epoch)===request.expectedState.leaseEpoch+1&&iso(state.last_scheduled_at)===a.scheduledAt&&iso(state.next_scheduled_at)===request.nextSlotAt,'NEXT_EXEC_SOURCE_STATE');
    const [parentRow]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[a.parentRunId]);
    assert(parentRow.status===result.status&&Number(parentRow.lease_epoch)===1&&Number(parentRow.attempts)===1&&Number(parentRow.discovered_count)===8&&Number(parentRow.stored_count)===8&&parentRow.finished_at&&parentRow.lease_owner===null&&parentRow.lease_until===null,'NEXT_EXEC_PARENT_TERMINAL');
    const events=(await repo.query("SELECT * FROM po_audit_events WHERE source_id=? AND event_type='overseas_isolated_parent_terminal'",[a.sourceId])).filter(e=>JSON.parse(e.detail).parentRunId===a.parentRunId);
    assert(events.length===1&&events[0].actor_type==='system'&&events[0].outcome==='success'&&canonical(JSON.parse(events[0].detail))===canonical(result),'NEXT_EXEC_PARENT_EVENT');
    const certified=[];
    for(const child of request.batch.admissions){const scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'].map(k=>[k,child[k]])),conn=await pool.getConnection();try{await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION READ ONLY');const e=await cursorReader.readInTransaction(conn,scope);assert(e&&e.parentRunId===child.parentRunId&&e.childRunId===child.runId&&e.cursorAt===child.windowEnd,'NEXT_EXEC_NEW_CERTIFICATION');certified.push(e);}finally{await conn.rollback();conn.release();}}
    assert(await oldFingerprint()===beforeOld,'NEXT_EXEC_PREVIOUS_BATCH_CHANGED_AFTER_PARENT');
    record({phase:'next_parent_terminal',result,certified});
    return {status:'PASS_ISOLATED_REAL_NEXT_SLOT_SYNTHETIC_EXECUTION',children,result,certified,previousBatchRowsSha256:beforeOld,previousBatchRowsUnchanged:true,connectionsVerified,actualRunSourceExecuted:true,connectorNormalizationExecuted:true,realNextSlotExecutedSynthetic:true,realNextSlotExecuted:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,secondConsumerStarted:false,productionActivationAllowed:false};
  }finally{pool.getConnection=getOriginal;pool.query=queryOriginal;}
}
module.exports={runNextSlotExecution};
