'use strict';
const {run}=require('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v060-harness/lifecycle.cjs');
run(async context=>{
 const {identity,env,result,control,connect,repositories,fs,path,assert,deferred,waitForLock}=context;
 const manifest=identity.manifest,runtime=manifest.trees.overseas.runtime;
 for(const file of['C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v060-harness/daily-fixture.sql',...manifest.schemas.map(item=>{assert.equal(context.hashFile(item.path),item.sha256);return item.path;})])for(const statement of fs.readFileSync(file,'utf8').split(/;\s*(?:\r?\n|$)/).filter(s=>s.trim()))await control.query(statement);
 const[tables]=await control.query('SHOW TABLES');for(const row of tables)await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${context.database}.${Object.values(row)[0]} TO 'intent_fixture'@'127.0.0.1'`);
 const Repository=require(path.join(runtime,'server/src/db/repository')).Repository;
 const daily=require(path.join(runtime,'worker/src/overseasProductionDaily'));
 const {createOverseasPageJobs}=require(path.join(runtime,'worker/src/overseasBigPlayerPageJobs'));
 const service=require(path.join(runtime,'server/src/services/currentAnalysisIntent'));
 const repo=new Repository(env);repositories.push(repo);
 const h=await require('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v060-harness/daily-fixture.cjs')(context);
 const config=service.validateIntentConfig({schemaVersion:1,enabled:true,manifestSha256:service.BASE_SHA,writerCoverageEvidenceId:'synthetic_overseas_fixture',profile:'light',version:'fixture-v1',batchSize:10,scopeAllowlist:[h.scopeFields]});repo.currentAnalysisIntentConfig=config;
 const jobs=createOverseasPageJobs({analysisOptionsFor:async()=>({profile:'light',version:'fixture-v1',triggerReason:'all_content',matchedKeywords:[]}),translationOptions:{targetLanguage:'zh-CN',version:'translation-fixture-v1'},repairMissingJobs:true});
 async function commit(f,items,{hasMore=true,nextCursor='next-'+Date.now(),callback=jobs}={}){return daily.commitPage({...f,repo,page:{items,hasMore,nextCursor},jobs:callback});}
 async function content(external){return(await control.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=?',[h.source,external]))[0][0];}
 async function markActive(external,{translation=false,history=false}={}){
  const c=await content(external);const table=translation?'po_translation_jobs':'po_analysis_jobs';
  await control.query(`UPDATE ${table} SET status='running',lease_owner='synthetic-old-owner',lease_until=DATE_ADD(NOW(),INTERVAL 180 SECOND)${translation?'':",trigger_reason="+(history?"'risk_policy_backfill:synthetic'":"'all_content'")+",attempts=2"} WHERE content_id=?`,[c.id]);return c;
 }
 async function seed(f,raw){const result=await commit(f,[raw]);f.child.receipt=result.receipt;return content(raw.externalId);}
 async function onlyRows(table,id){return(await control.query(`SELECT * FROM ${table} WHERE content_id=? ORDER BY id`,[id]))[0];}
 async function rollbackCase(f,raw,callback){const before=await h.state();await assert.rejects(commit(f,[raw],{callback}));assert.deepEqual(await h.state(),before);}
 // Observe actual connection methods; pinned no-ops do not increment these.
 async function observe(callback){const get=repo.pool.getConnection.bind(repo.pool),trace={connections:[],begin:0,commit:0,rollback:0,sql:[]};repo.pool.getConnection=async()=>{const c=await get();trace.connections.push(c.threadId);const query=c.query.bind(c),begin=c.beginTransaction.bind(c),commit=c.commit.bind(c),rollback=c.rollback.bind(c),release=c.release.bind(c);c.query=async(sql,args)=>{trace.sql.push({connectionId:c.threadId,sql});return query(sql,args);};c.beginTransaction=async()=>{trace.begin++;return begin();};c.commit=async()=>{trace.commit++;return commit();};c.rollback=async()=>{trace.rollback++;return rollback();};c.release=()=>{c.query=query;c.beginTransaction=begin;c.commit=commit;c.rollback=rollback;c.release=release;release();};return c;};try{await callback(trace);}finally{repo.pool.getConnection=get;}return trace;}



 async function ledger(){return h.state();}
 async function modern(){const[columns]=await control.query('SHOW COLUMNS FROM po_contents');if(!columns.some(c=>c.Field==='board_id')){await control.query("ALTER TABLE po_contents ADD board_id VARCHAR(32),ADD board_name VARCHAR(255),ADD board_key VARCHAR(32) AS (COALESCE(board_id,'legacy')) PERSISTENT");await control.query('ALTER TABLE po_contents ADD UNIQUE KEY source_board_external(source_id,board_key,external_id)');await control.query('ALTER TABLE po_contents DROP INDEX po_contents_source_external_uk');}}
 async function makeF2(){const f=await h.fresh(),raw=h.raw();const c=await seed(f,raw);await markActive(raw.externalId);const changed=h.raw(raw.externalId,'QA F2 changed body');const second=await commit(f,[changed]);f.child.receipt=second.receipt;return{f,raw,c,changed};}
 async function auditProof(c){return onlyRows('po_overseas_current_intent_proof_audit',c.id);}
 async function wrapQuery(callback){const get=repo.pool.getConnection.bind(repo.pool);repo.pool.getConnection=async()=>{const c=await get(),q=c.query.bind(c),release=c.release.bind(c);c.query=(sql,args)=>callback(q,sql,args,c);c.release=()=>{c.query=q;c.release=release;release()};return c;};return()=>{repo.pool.getConnection=get};}
 await h.test(1,'legacy_actual_page_single_outer_connection_lock_once_receipt',async()=>{
  const f=await h.fresh(),raw=h.raw();const trace=await observe(async()=>{const r=await commit(f,[raw]);assert.equal(r.receipt.pages,1);assert.equal(r.receipt.cursor.startsWith('next-'),true);});
  assert.equal(trace.connections.length,1);assert.equal(trace.begin,1);assert.equal(trace.commit,1);assert.equal(trace.rollback,0);
  const contentQueries=trace.sql.filter(s=>/^SELECT \* FROM po_contents WHERE /.test(s.sql));assert(contentQueries.length);assert(contentQueries.every(s=>(s.sql.match(/FOR UPDATE/g)||[]).length===1));
  const c=await content(raw.externalId);for(const t of ['po_analysis_jobs','po_translation_jobs','po_current_analysis_intents','po_content_feed_memberships'])assert.equal((await onlyRows(t,c.id)).length,1);
  const[assoc]=await control.query('SELECT * FROM po_sync_run_contents WHERE content_id=?',[c.id]);assert(assoc.some(a=>a.run_id===f.child.run.id));
  const[[parent]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[f.intent.parentId]);assert.equal(parent.status,'running');assert.equal(parent.lease_owner,f.owner);return{realConnection:trace.connections[0],board:'legacy',begin:1,commit:1};
 });
 await modern();
 await h.test(2,'modern_board_source_fields_and_no_double_FOR_UPDATE',async()=>{
  const f=await h.fresh(),raw=h.raw();const trace=await observe(async()=>{await commit(f,[raw]);});const c=await content(raw.externalId);
  assert.equal(c.board_id,'100017');assert.equal(c.board_name,'synthetic board');assert.equal(c.board_key,'100017');assert.equal(c.account_id,h.account);assert.equal(c.community_id,h.community);
  assert(trace.sql.some(s=>s.sql.includes('board_key=?')));assert(trace.sql.filter(s=>/^SELECT \* FROM po_contents WHERE /.test(s.sql)).every(s=>(s.sql.match(/FOR UPDATE/g)||[]).length===1));
  assert.equal(trace.connections.length,1);assert.equal(trace.begin,1);assert.equal(trace.commit,1);
 });
 await h.test(3,'F2_F1_live_preserved_duplicate_and_same_owner_lease_proof_audit',async()=>{
  const p=await makeF2(),job=(await onlyRows('po_analysis_jobs',p.c.id))[0],i=(await onlyRows('po_current_analysis_intents',p.c.id))[0];
  assert.equal(job.content_fingerprint,p.c.fingerprint);assert.equal(job.lease_owner,'synthetic-old-owner');assert.equal(Number(i.generation),2);assert.equal(i.previous_fingerprint,p.c.fingerprint);assert.equal(i.current_fingerprint,(await content(p.raw.externalId)).fingerprint);assert.equal(i.applied_generation,null);
  const repeated=await commit(p.f,[p.changed]);p.f.child.receipt=repeated.receipt;assert.equal((await auditProof(p.c)).length,0);
  await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_ADD(lease_until,INTERVAL 40 SECOND),updated_at=DATE_ADD(updated_at,INTERVAL 1 SECOND) WHERE id=?',[job.id]);const renewed=(await onlyRows('po_analysis_jobs',p.c.id))[0];
  const trace=await observe(async()=>{await commit(p.f,[p.changed]);});assert.equal(trace.connections.length,1);assert.deepEqual((await onlyRows('po_analysis_jobs',p.c.id))[0],renewed);
  const updated=(await onlyRows('po_current_analysis_intents',p.c.id))[0],audits=await auditProof(p.c);assert.equal(audits.length,1);assert.equal(updated.applied_generation,null);assert.equal(updated.state,'pending');assert.equal(updated.previous_fingerprint,p.c.fingerprint);assert.equal(updated.generation,i.generation);
  const before=JSON.parse(audits[0].previous_job_json),after=JSON.parse(audits[0].current_job_json);const delta=Object.keys(after).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));assert.deepEqual(delta.sort(),['lease_until','updated_at']);assert.deepEqual(JSON.parse(updated.expected_job_json),after);
  assert.equal((await onlyRows('po_current_analysis_intent_audit',p.c.id)).length,0);return{generation:2,ownerPreserved:true,refreshOnly:delta};
 });
 await h.test(4,'stable_identity_changes_refuse_defer_zero_page_writes',async()=>{
  for(const mutation of ["lease_owner='qa-new-owner'","attempts=attempts+1","trigger_reason='qa-marker'","matched_keywords='[\"qa-new\"]'","next_retry_at=DATE_ADD(NOW(),INTERVAL 1 DAY)","completed_at=NOW()"]){const p=await makeF2();await control.query('UPDATE po_analysis_jobs SET '+mutation+' WHERE content_id=?',[p.c.id]);const before=await ledger();await assert.rejects(commit(p.f,[p.changed]),{code:'OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT'});assert.deepEqual(await ledger(),before);}
 });
 await h.test(5,'missing_capture_scope_force_manual_NULL_owner_rejected',async()=>{
  for(const kind of ['disabled','outside','force','manual','nullowner']){const f=await h.fresh(),raw=h.raw();const c=await seed(f,raw);await markActive(raw.externalId);const old=repo.currentAnalysisIntentConfig;
   if(kind==='manual')await control.query("UPDATE po_analysis_jobs SET lease_owner='q1-daily:qa:a:b:c' WHERE content_id=?",[c.id]);
   if(kind==='nullowner')await control.query('UPDATE po_analysis_jobs SET lease_owner=NULL WHERE content_id=?',[c.id]);
   if(kind==='disabled')repo.currentAnalysisIntentConfig={enabled:false};
   if(kind==='outside')repo.currentAnalysisIntentConfig={...config,scopeAllowlist:[{...h.scopeFields,account_id:null}]};
   const callback=kind==='force'?createOverseasPageJobs({analysisOptionsFor:async()=>({profile:'light',version:'fixture-v1',triggerReason:'all_content',force:true}),translationOptions:{targetLanguage:'zh-CN',version:'translation-fixture-v1'},repairMissingJobs:true}):jobs;
   const before=await ledger();try{await assert.rejects(commit(f,[h.raw(raw.externalId,'QA F2 denied '+kind)],{callback}),{code:'OVERSEAS_QUEUE_ACTIVE_VERSION_CONFLICT'});assert.deepEqual(await ledger(),before);}finally{repo.currentAnalysisIntentConfig=old;}
  }
 });
 await h.test(6,'translation_active_and_history_F1_whole_page_rollback',async()=>{
  for(const kind of ['translation','history']){const f=await h.fresh(),raw=h.raw();await seed(f,raw);await markActive(raw.externalId);if(kind==='translation')await markActive(raw.externalId,{translation:true});else await markActive(raw.externalId,{history:true});
   const old=await ledger();await assert.rejects(commit(f,[h.raw(raw.externalId,'QA refused F2 '+kind)]),{code:kind==='translation'?'OVERSEAS_TRANSLATION_ACTIVE_VERSION_CONFLICT':'OVERSEAS_QUEUE_HISTORY_VERSION_CONFLICT'});assert.deepEqual(await ledger(),old);}
 });
 await h.test(7,'board_window_site_account_fences_and_lower_bound',async()=>{
  for(const extra of [{boardId:'not-board'},{publishedAt:'2026-10-10T16:00:00.000Z'},{publishedAt:'2026-10-09T15:59:59.999Z'}]){const f=await h.fresh(),old=await ledger();await assert.rejects(commit(f,[h.raw(undefined,'QA boundary',extra)]),e=>['OVERSEAS_PRODUCTION_CONTENT_SCOPE','OVERSEAS_PRODUCTION_CONTENT_WINDOW'].includes(e.code));assert.deepEqual(await ledger(),old);}
  const f=await h.fresh();await commit(f,[h.raw(undefined,'QA lower bound',{publishedAt:'2026-10-09T16:00:00.000Z'})]);
  const g=await h.fresh(),raw=h.raw(),c=await seed(g,raw);await control.query('UPDATE po_contents SET account_id=NULL WHERE id=?',[c.id]);const old=await ledger();await assert.rejects(commit(g,[h.raw(raw.externalId,'QA account boundary')]),{code:'OVERSEAS_PRODUCTION_CONTENT_SCOPE'});assert.deepEqual(await ledger(),old);
  const s=await h.fresh();await control.query('UPDATE po_source_sites SET url_hash=? WHERE id=?',['0'.repeat(64),h.sites[0].id]);const before=await ledger();try{await assert.rejects(commit(s,[h.raw()]),{code:'OVERSEAS_PRODUCTION_SITE_CHANGED'});assert.deepEqual(await ledger(),before);}finally{await control.query('UPDATE po_source_sites SET url_hash=? WHERE id=?',[h.sha(h.sites[0].url),h.sites[0].id]);}
 });
 await h.test(8,'summary_fallback_recovery_ancestor_preserves_body_and_links',async()=>{
  const f=await h.fresh(),raw=h.raw(undefined,'QA full enriched body',{rawPayload:{boardId:'100017',_contentIntegrity:{status:'detail_enriched'}}});const c=await seed(f,raw);
  let r=await commit(f,[h.raw(raw.externalId,'QA summary',{rawPayload:{boardId:'100017',_contentIntegrity:{status:'summary_fallback'}}})]);f.child.receipt=r.receipt;assert.equal((await content(raw.externalId)).body,c.body);assert.equal((await content(raw.externalId)).fingerprint,c.fingerprint);
  r=await commit(f,[h.raw(raw.externalId,'QA ancestor must not overwrite',{recoveryContextAncestor:true})]);assert.equal((await content(raw.externalId)).body,c.body);assert.equal((await onlyRows('po_analysis_jobs',c.id)).length,1);assert.equal((await onlyRows('po_content_feed_memberships',c.id)).length,1);
 });
 await h.test(9,'proof_audit_permission_denied_atomic_entire_page_rollback',async()=>{
  const p=await makeF2();await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_ADD(lease_until,INTERVAL 30 SECOND) WHERE content_id=?',[p.c.id]);const old=await ledger();
  await control.query("REVOKE INSERT ON "+context.database+".po_overseas_current_intent_proof_audit FROM 'intent_fixture'@'127.0.0.1'");
  try{await assert.rejects(commit(p.f,[p.changed]),{code:'ER_TABLEACCESS_DENIED_ERROR'});assert.deepEqual(await ledger(),old);}finally{await control.query("GRANT INSERT ON "+context.database+".po_overseas_current_intent_proof_audit TO 'intent_fixture'@'127.0.0.1'");}
 });
 await h.test(10,'queue_permissions_and_receipt_SQL_constraint_rollback',async()=>{
  for(const table of ['po_analysis_jobs','po_translation_jobs']){const f=await h.fresh(),old=await ledger();await control.query("REVOKE INSERT ON "+context.database+"."+table+" FROM 'intent_fixture'@'127.0.0.1'");try{await assert.rejects(commit(f,[h.raw()]),{code:'ER_TABLEACCESS_DENIED_ERROR'});assert.deepEqual(await ledger(),old);}finally{await control.query("GRANT INSERT ON "+context.database+"."+table+" TO 'intent_fixture'@'127.0.0.1'");}}
  const f=await h.fresh(),old=await ledger(),undo=await wrapQuery(async(q,sql,args)=>sql.startsWith('UPDATE po_sync_runs SET error_message=')?q('UPDATE po_sync_runs SET id=NULL WHERE id=?',[f.child.run.id]):q(sql,args));
  try{await assert.rejects(commit(f,[h.raw()]),{code:'ER_BAD_NULL_ERROR'});assert.deepEqual(await ledger(),old);}finally{undo();}
 });
 await h.test(11,'KILL_real_transaction_after_proof_before_receipt_full_rollback',async()=>{
  const p=await makeF2();await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_ADD(lease_until,INTERVAL 30 SECOND) WHERE content_id=?',[p.c.id]);const old=await ledger(),reached=deferred(),resume=deferred();let thread;
  const undo=await wrapQuery(async(q,sql,args,c)=>{if(sql.startsWith('UPDATE po_sync_runs SET error_message=')){thread=c.threadId;reached.resolve();await resume.promise;}return q(sql,args)});
  const pending=commit(p.f,[p.changed]);pending.catch(()=>{});
  try{await Promise.race([reached.promise,pending.then(()=>{throw Error('QA proof/receipt barrier absent')})]);await control.query('KILL CONNECTION '+Number(thread));resume.resolve();await assert.rejects(pending);assert.deepEqual(await ledger(),old);}finally{resume.resolve();undo();}
  return{actualSQLKill:thread,proofAndBodyAndReceiptRollback:true};
 });
 // Lexical export only; original source bytes/main remain untouched.
 const vm=require('node:vm'),{createRequire}=require('node:module'),filename=path.join(runtime,'worker/src/overseasProductionDaily.js'),moduleObject={exports:{}};
 vm.runInNewContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(filename,'utf8')+'\nmodule.exports.__qaBounded=commitWithLockRetry;\n})',{console,setTimeout,clearTimeout,setInterval,clearInterval,process,Buffer,URL,AbortSignal})(createRequire(filename),moduleObject,moduleObject.exports,filename,path.dirname(filename));
 const bounded=moduleObject.exports.__qaBounded;
 await h.test(12,'actual_collectSite_real_lock_retry_same_fetched_page',async()=>{
  const f=await h.fresh(),raw=h.raw(),peer=await connect();await peer.beginTransaction();await peer.query('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[h.source]);
  let fetched=0,attempts=0,released=false;const page={items:[raw],hasMore:false,nextCursor:null},connected=deferred(),get=repo.pool.getConnection.bind(repo.pool);
  repo.pool.getConnection=async()=>{const c=await get();connected.resolve(c.threadId);await c.query('SET SESSION innodb_lock_wait_timeout=1');return c;};
  const connector={discoverFeeds:async()=>[f.feed],listFeedContents:async()=>{fetched++;return page}};
  const pending=daily.collectSite({connector,scoped:f.scope.source,account:f.scope.account,child:f.child,intent:f.intent,check:async()=>{},maxPages:1,commit:async(p,feed)=>bounded(async()=>{attempts++;assert.equal(p,page);try{return await daily.commitPage({...f,repo,page:p,feed,jobs});}catch(e){assert.equal(e.code,'ER_LOCK_WAIT_TIMEOUT');assert.equal(e.rollbackAcknowledged,true);if(!released){released=true;await peer.rollback();}throw e;}})});pending.catch(()=>{});
  try{await waitForLock('qa_daily_retry_source_lock',await connected.promise,peer.threadId,'po_source_schedule_state');const value=await pending;assert.equal(value.status,'completed');assert.equal(fetched,1);assert.equal(attempts,2);assert.equal(f.child.receipt.pages,1);assert.equal((await onlyRows('po_analysis_jobs',(await content(raw.externalId)).id)).length,1);}finally{await peer.rollback();repo.pool.getConnection=get;}
  return{fetchedPages:fetched,attempts,sameFetchedObject:true};
 });
 await h.test(13,'actual_COMMIT_then_simulated_ACK_error_unknown_no_retry',async()=>{
  const f=await h.fresh(),raw=h.raw(),oldReceipt=JSON.stringify(f.child.receipt),get=repo.pool.getConnection.bind(repo.pool);let fetched=0,attempts=0;
  repo.pool.getConnection=async()=>{const c=await get(),real=c.commit.bind(c);c.commit=async()=>{await real();throw Object.assign(Error('QA ACK delivery failure after actual COMMIT'),{code:'QA_ACK_LOSS'})};return c};
  const page={items:[raw],hasMore:false,nextCursor:null},connector={discoverFeeds:async()=>[f.feed],listFeedContents:async()=>{fetched++;return page}};
  try{await assert.rejects(daily.collectSite({connector,scoped:f.scope.source,account:f.scope.account,child:f.child,intent:f.intent,check:async()=>{},maxPages:1,commit:async(p,feed)=>bounded(async()=>{attempts++;return daily.commitPage({...f,repo,page:p,feed,jobs});})}),{code:'OVERSEAS_PRODUCTION_COMMIT_UNKNOWN'});}finally{repo.pool.getConnection=get;}
  assert.equal(fetched,1);assert.equal(attempts,1);assert.equal(JSON.stringify(f.child.receipt),oldReceipt);const c=await content(raw.externalId);assert(c);
  const [[run]]=await control.query('SELECT * FROM po_sync_runs WHERE id=?',[f.child.run.id]);const receipt=JSON.parse(run.error_message);assert.equal(receipt.pages,1);assert.equal(receipt.done,true);
  const old=await ledger();await assert.rejects(commit(f,[raw]),{code:'OVERSEAS_PRODUCTION_LEASE_LOST'});assert.deepEqual(await ledger(),old);
  return{realCommit:true,ACKErrorIsSimulated:true,actualNetworkLoss:false,fetched,attempts};
 });
 await h.test(14,'F2_F3_durable_generation_stale_receipt_refuses_then_idempotent',async()=>{
  const p=await makeF2(),r=await commit(p.f,[h.raw(p.raw.externalId,'QA F3 body')]);const i=(await onlyRows('po_current_analysis_intents',p.c.id))[0];assert.equal(Number(i.generation),3);assert.equal(i.current_fingerprint,(await content(p.raw.externalId)).fingerprint);assert.equal(i.applied_generation,null);
  const old=await ledger();await assert.rejects(commit(p.f,[h.raw(p.raw.externalId,'QA F3 body')]),{code:'OVERSEAS_PRODUCTION_LEASE_LOST'});assert.deepEqual(await ledger(),old);p.f.child.receipt=r.receipt;await commit(p.f,[h.raw(p.raw.externalId,'QA F3 body')]);assert.equal(Number((await onlyRows('po_current_analysis_intents',p.c.id))[0].generation),3);assert.equal((await onlyRows('po_analysis_jobs',p.c.id)).length,1);
 });
 await h.test(15,'sameF_completed_missing_analysis_old_skip_and_default_safe_guard',async()=>{
  const f=await h.fresh(),raw=h.raw(),c=await seed(f,raw);await control.query("UPDATE po_analysis_jobs SET status='completed',lease_owner=NULL,lease_until=NULL WHERE content_id=?",[c.id]);const old=(await onlyRows('po_analysis_jobs',c.id))[0];
  await commit(f,[raw]);assert.deepEqual((await onlyRows('po_analysis_jobs',c.id))[0],old);assert.equal((await onlyRows('po_analyses',c.id)).length,0);
  const p=await makeF2(),previous=repo.currentAnalysisIntentConfig;repo.currentAnalysisIntentConfig={enabled:false};const oldJob=(await onlyRows('po_analysis_jobs',p.c.id))[0];try{await assert.rejects(repo.enqueueAnalysisJob(p.c.id,{profile:'light',version:'fixture-v1',contentFingerprint:(await content(p.raw.externalId)).fingerprint,triggerReason:'all_content',force:true}),{code:'ANALYSIS_JOB_LEASE_ACTIVE'});assert.deepEqual((await onlyRows('po_analysis_jobs',p.c.id))[0],oldJob);}finally{repo.currentAnalysisIntentConfig=previous;}
 });
 await h.test(16,'additive_four_tables_proof_has_no_body_credentials_or_ACK',async()=>{
  const [tables]=await control.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('po_current_analysis_intents','po_current_analysis_intent_audit','po_current_analysis_repair_records','po_overseas_current_intent_proof_audit')",[context.database]);assert.equal(tables.length,4);assert(tables.every(t=>t.ENGINE==='InnoDB'));
  const[columns]=await control.query('SHOW COLUMNS FROM po_overseas_current_intent_proof_audit');assert.deepEqual(columns.map(c=>c.Field),['id','intent_id','generation','content_id','site_id','previous_job_json','current_job_json','created_at']);
  for(const s of manifest.schemas){const sql=fs.readFileSync(s.path,'utf8');assert(!/\b(?:ALTER|DROP|TRUNCATE)\s+TABLE/i.test(sql));}
 });
 result.pending.push({scope:'producer-only partial; not full recovery',items:['translation old active still full-page rollback','no overseas consumer replay wiring','sameF completed missing analysis old skip','manual NULL/orphan/expired special cases refused not repaired','force requestId/history lane and business date automation not implemented','loaded producer/consumer/Q1 identities unverified','translation ACL/realtime notification window','production DDL records and real scheduled collection recovery']});
}).catch(e=>{console.error(e.stack);process.exitCode=1});
