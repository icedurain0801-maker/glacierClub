'use strict';
// Called only by the owned synthetic 13316 runner after firstClaim publication.
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createIsolatedScheduledCandidateDeps}=require('../worker/src/overseasScheduledCandidateFactory');
// Synthetic child must not load the developer .env when worker exports load.
require('../server/src/runtimeEnv').loadRuntimeEnv=()=>{};
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function runScheduledMainchain({repo,journal,proof,contract:c,request,findings,scenario='success'}){
  assert(['success','budget','transport-error','budget20','second-page-error'].includes(scenario),'SYNTHETIC_SCENARIO');
  const multi=['budget20','second-page-error'].includes(scenario),secondPageEvidence=[];
  const paths=[],publishedAt=new Date((Date.parse(c.windowStart)+Date.parse(c.windowEnd))/2).toISOString();
  const transport=async value=>{
    const u=new URL(value);assert(u.origin==='https://club-en.q1.com','SYNTHETIC_ORIGIN');paths.push(u.pathname);let payload;
    if(multi&&(u.pathname.endsWith('/merged-list')||u.pathname.endsWith('/post/list')))process.stderr.write(JSON.stringify({syntheticFeedRequest:u.pathname,query:Object.fromEntries(u.searchParams)})+'\n');
    const content=(id,body)=>({id,content:[{type:0,data:multi?`${body} ${id}`:body}],createTime:publishedAt});
    if(u.pathname.endsWith('/login/token'))payload={code:0,data:{token:'synthetic-site-token'}};
    else if(u.pathname.endsWith('/user/context'))payload={code:0,data:{gameBoards:[{id:100017,name:'synthetic'}]}};
    else if(u.pathname.endsWith('/auth/board'))payload={code:0,data:{id:100017,groups:[{id:10,name:'info',type:0,sections:[{id:11,name:'news'}]}]}};
    else if(u.pathname.endsWith('/merged-list')||u.pathname.endsWith('/post/list')){
      if(scenario==='transport-error')throw Object.assign(Error('synthetic feed transport failure'),{code:'SYNTHETIC_TRANSPORT_FAILURE'});
      const offset=Number(u.searchParams.get('offsetId')||0);
      if(multi){
        assert(Number(u.searchParams.get('pageSize'))===20&&[0,20].includes(offset),'SYNTHETIC_PAGE20_REQUEST');
        if(offset===20){
          const rows=await repo.query("SELECT * FROM po_sync_checkpoints WHERE site_id=? AND task_kind='q1_feed' AND task_key<>'board:100017:synthetic-release'",[c.siteId]);
          const feedIdentity={path:u.pathname,sectionId:u.searchParams.get('sectionId'),type:u.searchParams.get('type'),isUltimate:u.searchParams.get('isUltimate')},key=JSON.stringify(feedIdentity);
          const safe=rows.filter(cp=>{
            if(!cp.cursor)return false;const cursor=JSON.parse(cp.cursor),parts=cursor.feedKey.split(':');
            return cursor.offsetId===20&&parts[4]===feedIdentity.sectionId&&(parts[5]||null)===feedIdentity.type;
          });
          if(!safe.length)process.stderr.write(JSON.stringify({unsafeSecondRequest:feedIdentity,rows:rows.map(cp=>({taskKey:cp.task_key,cursor:cp.cursor}))})+'\n');
          assert(safe.length>0,'SECOND_REQUEST_BEFORE_SAFE_PAGE_COMMIT');
          const links=await repo.query('SELECT content_id FROM po_sync_run_contents WHERE run_id=?',[c.runId]);
          assert(links.length>=20,'SECOND_REQUEST_MISSING_COMMITTED_LINKS');
          secondPageEvidence.push({key,cursors:safe.map(cp=>({taskKey:cp.task_key,cursor:cp.cursor,items:cp.items_fetched,lastItem:cp.last_item_at}))});
          if(scenario==='second-page-error')throw Object.assign(Error('synthetic second feed page failure'),{code:'SYNTHETIC_SECOND_PAGE_FAILURE'});
        }
        payload={code:0,data:{list:Array.from({length:20},(_,i)=>({...content(2300+offset+i,'synthetic post'),title:'synthetic',commentCount:0})),total:60,hasMore:true,nextOffset:offset+20}};
      }else payload={code:0,data:{list:[{...content(2300+offset*10,'synthetic post'),title:'synthetic',commentCount:scenario==='budget'?0:2}],total:scenario==='budget'?2:1,hasMore:scenario==='budget',...(scenario==='budget'?{nextOffset:1}:{})}};
    }
    else if(u.pathname.endsWith('/post/'))payload={code:0,data:{...content(multi?Number(u.searchParams.get('postId')):2300,'synthetic post detail'),title:'synthetic',commentCount:multi?0:2}};
    else if(u.pathname.includes('/comment/')){
      if(scenario==='budget'||multi)payload={code:0,data:[],total:0,hasMore:false};
      else {assert(u.searchParams.get('postId')==='2300','SYNTHETIC_COMMENT_ROOT');
      if(u.searchParams.get('commentId')==='2301')payload={code:0,data:[content(2303,'synthetic dynamic reply')],total:1,hasMore:false};
      else payload={code:0,data:[{...content(2301,'synthetic top comment'),commentCount:2,replies:[content(2302,'synthetic inline reply')]}],total:1,hasMore:false};}
    }else throw Object.assign(Error('SYNTHETIC_PATH'),{code:'SYNTHETIC_PATH'});
    return {ok:true,status:200,url:String(u),json:async()=>payload};
  };
  const sourceBefore=canonical(await repo.query('SELECT * FROM po_sources ORDER BY id'));
  const stateBefore=canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'));
  const parentBefore=canonical(await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId]));
  repo.advisoryLocks=new Map();
  const options={baseDeps:{repo,connectors:{},credentialContext:{load:async(_subject,kind)=>{
    if(kind==='account_password')throw Object.assign(Error('Synthetic password unavailable'),{code:'CREDENTIAL_NOT_FOUND'});
    return {apiToken:'synthetic-base-token'};
  },loadApiToken:async()=>'synthetic-base-token'},
    ai:{configured:()=>true,profiles:{light:{version:'light-v1'}}},leaseOwner:'synthetic-worker',leaseSeconds:60,
    pageSize:scenario==='budget'?10000:20,pageBudget:scenario==='budget'?1:2,pageTimeoutMs:multi?20000:1000,dailyRunTimeoutMs:multi?120000:15000,dailyFeedFetchConcurrency:1,dailyCommentFetchConcurrency:1,dailyReplyFetchConcurrency:1},
    journal,proof,transport,translationVersion:'translation-v1',analysisProfile:{name:'light',version:'light-v1'}};
  for(const invalid of [{...options,proof:{...proof}},{...options,baseDeps:{...options.baseDeps,repo:Object.create(repo)}}]){
    try{createIsolatedScheduledCandidateDeps(invalid);assert(false,'COPIED_FACTORY_PROOF_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FIRST_CLAIM_UNTRUSTED','FACTORY_PROOF_WRONG_ERROR');}
  }
  const candidate=createIsolatedScheduledCandidateDeps(options);
  const sourceInput={id:c.sourceId,platform:'bigplayer_h5',region_code:'overseas'};
  const runInput={id:c.runId,source_id:c.sourceId,account_id:c.accountId,site_id:c.siteId};
  const zeroBefore=canonical(await Promise.all(['po_collection_runs','po_audit_events','po_contents','po_sync_checkpoints'].map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1`))));
  for(const badRun of [null,{...runInput,id:request.batch.admissions[0].parentRunId},{...runInput,lease_epoch:2},
    {...runInput,trigger_type:'manual'},{...runInput,lease_owner:'forged'},{...runInput,window_start:new Date(Date.parse(c.windowStart)+1).toISOString()},
    {...runInput,leaseEpoch:2},{...runInput,triggerType:'manual'},{...runInput,windowStart:new Date(Date.parse(c.windowStart)+1).toISOString()}]){
    const rejected=createIsolatedScheduledCandidateDeps(options);
    try{await rejected.resolveSourceDeps(sourceInput,badRun);assert(false,'INVALID_FACTORY_RUN_ALLOWED');}
    catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT','INVALID_FACTORY_RUN_WRONG_ERROR');}
    finally{rejected.closeOverseasCandidate();}
  }
  assert(paths.length===0&&zeroBefore===canonical(await Promise.all(['po_collection_runs','po_audit_events','po_contents','po_sync_checkpoints'].map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1`)))),'FACTORY_BAD_RUN_WRITES_OR_SENDS');
  const probe=createIsolatedScheduledCandidateDeps(options),routed=await probe.resolveSourceDeps(sourceInput,runInput);
  const ordinary=await routed.deps.repo.claimSyncRun({runId:c.runId});assert(ordinary.id===c.runId,'FACTORY_CLAIM_OBSERVATION');
  try{await routed.deps.repo.claimSyncRun({runId:c.runId});assert(false,'FACTORY_DOUBLE_CLAIM_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FACTORY_CLAIM_REPLAY','FACTORY_REPLAY_WRONG_ERROR');}
  for(const method of ['createRun','finishRun','finishScheduledSiteRun','markSourceRun']){
    try{await routed.deps.repo[method](c.runId);assert(false,'FACTORY_ORDINARY_WRITE_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FACTORY_ORDINARY_WRITE_BLOCKED','FACTORY_ORDINARY_WRITE_WRONG_ERROR');}
  }
  try{await routed.deps.repo.claimSyncCheckpoint({accountId:'wrong',siteId:c.siteId,leaseOwner:c.leaseOwner,windowStart:c.windowStart,windowEnd:c.windowEnd});assert(false,'FACTORY_WRONG_CP_ALLOWED');}
  catch(e){assert(e.code==='OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT','FACTORY_WRONG_CP_ERROR');}
  const testCp=await routed.deps.repo.claimSyncCheckpoint({accountId:c.accountId,siteId:c.siteId,leaseOwner:c.leaseOwner,leaseSeconds:60,
    taskKind:'q1_feed',taskKey:'board:100017:synthetic-release',syncScope:'posts',rootPlatformContentId:'',windowStart:c.windowStart,windowEnd:c.windowEnd});
  const oldTz=process.env.TZ;process.env.TZ='Asia/Shanghai';
  try{
    const released=await routed.deps.repo.releaseSyncCheckpoint(testCp.id,{leaseOwner:c.leaseOwner,status:'idle',cursor:'synthetic-safe-cursor'});
    assert(released.status==='idle'&&released.lease_owner===null&&released.cursor==='synthetic-safe-cursor','SHANGHAI_CHECKPOINT_RELEASE');
  }finally{if(oldTz===undefined)delete process.env.TZ;else process.env.TZ=oldTz;}
  probe.closeOverseasCandidate();
  let executionError;
  const runTz=process.env.TZ;process.env.TZ='Asia/Shanghai';
  try{
    const execution=multi?{...candidate,resolveSourceDeps:async(...args)=>{
      const resolved=await candidate.resolveSourceDeps(...args);
      if(scenario==='budget20'){
        resolved.deps.connectors.bigplayer_h5.feedMaxPages=2;
        assert(resolved.deps.connectors.bigplayer_h5.feedMaxPages===2,'SYNTHETIC_EXPLICIT_BUDGET_NOT_SET');
      }
      return resolved;
    }}:candidate;
    await require('../worker/src/worker').runSource(execution,sourceInput,runInput);
  }catch(e){executionError=e;}finally{candidate.closeOverseasCandidate();if(runTz===undefined)delete process.env.TZ;else process.env.TZ=runTz;}
  const run=(await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[c.runId]))[0];
  if(scenario!=='success'){
    const cps=await repo.query("SELECT * FROM po_sync_checkpoints WHERE site_id=? AND task_key<>'board:100017:synthetic-release'",[c.siteId]);
    const tasks=await repo.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=?',[c.runId]);
    const links=await repo.query('SELECT * FROM po_sync_run_contents WHERE run_id=?',[c.runId]);
    const audits=await repo.query('SELECT * FROM po_collection_runs ORDER BY id');
    assert(run.status==='partial'&&run.lease_owner===null&&run.lease_until===null&&run.finished_at,'FAILURE_SCENARIO_TERMINAL');
    assert(cps.length>0&&cps.every(cp=>cp.lease_owner===null&&cp.lease_until===null),'FAILURE_CHECKPOINT_LEAK');
    assert(tasks.some(t=>t.state==='expected')&&audits.length===1&&audits[0].status==='partial'&&run.discovered_count===links.length,'FAILURE_AUDIT_COVERAGE_COUNTS');
    if(scenario==='transport-error')assert(links.length===0&&cps.every(cp=>cp.status==='failed'&&cp.cursor===null),'TRANSPORT_FAILURE_UNSAFE_CURSOR');
    else if(multi){
      const feeds=cps.filter(cp=>cp.task_kind==='q1_feed'),expectedOffset=scenario==='budget20'?40:20;
      process.stderr.write(JSON.stringify({page20CheckpointEvidence:feeds.map(cp=>({status:cp.status,cursor:cp.cursor,items:cp.items_fetched,last:cp.last_item_at})),links:links.length})+'\n');
      if(secondPageEvidence.length!==3||new Set(secondPageEvidence.map(x=>x.key)).size!==3)process.stderr.write(JSON.stringify({secondPageEvidence,feedCount:feeds.length,runError:run.error_message})+'\n');
      assert(secondPageEvidence.length===3&&new Set(secondPageEvidence.map(x=>x.key)).size===3,'SECOND_PAGE_FEED_IDENTITY_EVIDENCE');
      assert(feeds.length===3&&feeds.every(cp=>cp.status==='failed'&&JSON.parse(cp.cursor).offsetId===expectedOffset
        &&Number(cp.items_fetched)===20),'PAGE20_SAFE_CHECKPOINT_FAILED');
      if(scenario==='second-page-error')for(const cp of feeds){
        const before=secondPageEvidence.flatMap(e=>e.cursors).find(x=>x.taskKey===cp.task_key);
        assert(before&&cp.cursor===before.cursor&&cp.items_fetched===before.items&&cp.last_item_at===before.lastItem,'SECOND_PAGE_CHANGED_SAFE_SNAPSHOT');
      }
      assert(links.length===expectedOffset&&run.stored_count===links.length,'PAGE20_PERSISTENT_COUNTS');
      for(const table of ['po_analysis_jobs','po_translation_jobs']){
        const jobs=await repo.query(`SELECT * FROM ${table} ORDER BY id`);
        assert(jobs.length===links.length&&jobs.every(j=>j.status==='pending'&&j.attempts===0&&j.lease_owner===null),'PAGE20_PENDING_JOBS');
      }
      if(scenario==='budget20')assert(run.error_message.includes('provider_pagination_budget_exhausted')
        &&feeds.every(cp=>JSON.parse(cp.cursor).segmentPagesFetched===2),'PAGE20_EXPLICIT_BUDGET_DIAGNOSTIC');
    }else {
      assert(executionError===undefined&&run.error_code==='PARTIAL_SYNC'&&links.length===1,'BUDGET_TERMINAL_NOT_BOUNDARY');
      assert(cps.every(cp=>cp.status==='failed'&&cp.cursor!==null&&JSON.parse(cp.cursor).offsetId===1),'BUDGET_SAFE_CURSOR_MISSING');
      assert(run.error_message.includes('provider_pagination_budget_exhausted'),'BUDGET_BOUNDARY_DIAGNOSTIC_MISSING');
    }
    assert(sourceBefore===canonical(await repo.query('SELECT * FROM po_sources ORDER BY id'))&&stateBefore===canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'))
      &&parentBefore===canonical(await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId])),'FAILURE_PARENT_SOURCE_CHANGED');
    findings.push(`actual_runSource_${scenario}_shanghai_checkpoint_safe_release_partial_audit`);
    return {status:'PASS_ISOLATED_SCHEDULED_FAILURE_PATH_PARTIAL',checks:findings,scenario,actualRunSourceExecuted:true,syntheticTransport:true,realHttpExecuted:false,aiExecuted:false,
      executionError:executionError?.code||null,childStatus:run.status,contents:links.length,checkpointStatuses:cps.map(cp=>cp.status),secondPageEvidence,
      explicitFeedMaxPages:scenario==='budget20'?2:null,default500PageBudgetTested:false,recoveryExecuted:false,epoch2Executed:false,productionActivationAllowed:false};
  }
  if(executionError)throw executionError;
  if(run.status!=='completed_authorized_scope'){
    process.stderr.write(JSON.stringify({syntheticRun:run,status:run.status,requestPaths:paths,tasks:await repo.query('SELECT descriptor,state FROM po_overseas_expected_tasks WHERE run_id=?',[c.runId])})+'\n');
  }
  assert(run.status==='completed_authorized_scope'&&Number(run.lease_epoch)===1&&run.lease_owner===null&&run.lease_until===null,'SCHEDULED_RUNSOURCE_TERMINAL');
  const contents=await repo.query('SELECT * FROM po_contents ORDER BY content_depth,external_id');
  assert(contents.length===4&&contents[1].parent_content_id===contents[0].id&&contents[2].parent_content_id===contents[1].id&&contents[3].parent_content_id===contents[1].id,'SCHEDULED_RUNSOURCE_GRAPH');
  const tasks=await repo.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=?',[c.runId]);
  assert(tasks.length>=4&&tasks.every(t=>t.state==='completed'),'SCHEDULED_RUNSOURCE_TASKS');
  const cps=await repo.query("SELECT * FROM po_sync_checkpoints WHERE site_id=? AND task_key<>'board:100017:synthetic-release'",[c.siteId]);
  assert(cps.length===tasks.length&&cps.every(cp=>cp.status==='completed'&&cp.cursor===null&&cp.lease_owner===null),'SCHEDULED_RUNSOURCE_CHECKPOINTS');
  for(const table of ['po_analysis_jobs','po_translation_jobs']){
    const jobs=await repo.query(`SELECT * FROM ${table} ORDER BY id`);
    assert(jobs.length===4&&jobs.every(j=>j.status==='pending'&&j.attempts===0&&j.lease_owner===null),'SCHEDULED_RUNSOURCE_PENDING_JOBS');
  }
  assert(run.discovered_count===4&&run.stored_count===4,'SCHEDULED_RUNSOURCE_COUNTS');
  assert(sourceBefore===canonical(await repo.query('SELECT * FROM po_sources ORDER BY id'))&&stateBefore===canonical(await repo.query('SELECT * FROM po_source_schedule_state ORDER BY source_id'))
    &&parentBefore===canonical(await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[request.batch.admissions[0].parentRunId])),'SCHEDULED_RUNSOURCE_PARENT_SOURCE_CHANGED');
  findings.push('actual_scheduled_factory_runSource_connector_normalization_four_contents_tasks_jobs_child_terminal');
  findings.push('factory_invalid_run_scope_zero_write_send_double_claim_and_ordinary_write_rejection');
  findings.push('actual_owned_checkpoint_release_sql_datetime_in_shanghai_preserves_safe_cursor');
  return {status:'PASS_ISOLATED_SCHEDULED_CHILD_MAINCHAIN_PARTIAL',checks:findings,actualRunSourceExecuted:true,connectorPageNormalizationExecuted:true,
    syntheticTransport:true,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,parentAggregateExecuted:false,productionActivationAllowed:false,requestCount:paths.length,contents:4,tasks:tasks.length};
}
module.exports={runScheduledMainchain};
