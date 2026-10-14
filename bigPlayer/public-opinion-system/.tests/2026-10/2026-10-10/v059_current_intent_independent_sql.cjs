'use strict';
const {run}=require('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v059-harness/lifecycle.cjs');
const helpers=require('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v059-harness/fixture-helpers.cjs');
const httpHelper=require('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/qa-v059-harness/http-helper.cjs');
run(async context=>{
  const {identity,env,result,control,connect,repositories,httpServers,directory,fs,path,assert,deferred,waitForLock}=context;
  const manifest=identity.manifest;
  const migration=manifest.intentSchema;
  assert(migration?.path && migration.sha256,'frozen schema identity required');
  assert.equal(context.hashFile(migration.path),migration.sha256);
  // Existing board contract; old generic fixture omitted API writer columns.
  // Fixture-only compatibility DDL, separate from the frozen intent schema.
  await control.query('ALTER TABLE po_contents ADD COLUMN board_id VARCHAR(32) NULL, ADD COLUMN board_name VARCHAR(255) NULL');
  for(const statement of fs.readFileSync(migration.path,'utf8').split(/;\s*(?:\r?\n|$)/).filter(s=>s.trim())) await control.query(statement);
  for (const table of ['po_current_analysis_intents','po_current_analysis_intent_audit','po_current_analysis_repair_records']) await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${context.database}.${table} TO 'intent_fixture'@'127.0.0.1'`);
  // Frozen source trees deliberately omit dependencies. Resolve only packages from
  // the already-frozen predecessor dependency tree; no install or network access.
  const Module=require('node:module');
  const baseline=path.resolve('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-current-intent-v069');
  process.env.NODE_PATH=path.join(baseline,'runtime-analysis/node_modules');Module._initPaths();
  const Collection=require(path.join(manifest.trees.collection.runtime,'server/src/db/repository')).Repository;
  const Consumer=require(path.join(manifest.trees.analysis.runtime,'server/src/db/repository')).Repository;
  const service=require(path.join(manifest.trees.analysis.runtime,'server/src/services/currentAnalysisIntent'));
  const collection=new Collection(env),consumer=new Consumer(env);
  repositories.push(collection,consumer);
  const h=await helpers(context);
  const {scope,make,state,current,currentJob,updateBody,test,fingerprint}=h;
  const config=service.validateIntentConfig({schemaVersion:1,enabled:true,manifestSha256:service.BASE_SHA,writerCoverageEvidenceId:'synthetic_isolated_writer_coverage',profile:'light',version:'fixture-v1',batchSize:10,scopeAllowlist:[scope]});
  collection.currentAnalysisIntentConfig=config;consumer.currentAnalysisIntentConfig=config;
  process.env.PO_CURRENT_ANALYSIS_INTENT_CONFIG=JSON.stringify(config);
  fs.appendFileSync(env.PUBLIC_OPINION_ENV_FILE,'PO_CURRENT_ANALYSIS_INTENT_CONFIG='+JSON.stringify(config)+'\n');
  const apiApp=require(path.join(manifest.trees.api.runtime,'server/src/app'));repositories.push(apiApp.repo);
  await new Promise((resolve,reject)=>apiApp.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  apiApp.server.fixturePort=apiApp.server.address().port;httpServers.push(apiApp.server);
  const request=httpHelper(context);
  assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);
  async function intents(f){return(await control.query('SELECT * FROM po_current_analysis_intents WHERE content_id=? ORDER BY id',[f.content]))[0];}
  async function audits(f){return(await control.query('SELECT * FROM po_current_analysis_intent_audit WHERE content_id=? ORDER BY id',[f.content]))[0];}
  async function one(f){const rows=await intents(f);assert.equal(rows.length,1);return rows[0];}
  async function replay(f,options={}) {const intent=await one(f);return(await service.replayCurrentAnalysisIntents(consumer,{intentIds:[intent.id],...options})).results[0];}
  async function record(f){const intent=await one(f);return{intentId:intent.id,contentId:f.content,generation:Number(intent.generation),currentFingerprint:intent.current_fingerprint,oldFingerprint:intent.previous_fingerprint,scope:JSON.parse(intent.scope_json),expectedJob:JSON.parse(intent.expected_job_json),expectedAnalysis:JSON.parse(intent.expected_analysis_json)};}
  function freeze(row,fields){return row?Object.fromEntries(fields.map(key=>[key,row[key]??null])):null;}
  async function exactPlan(f,{fromIntent=false}={}) {
    const [[content]]=await control.query("SELECT c.*,g.region_code,s.enabled AS source_enabled,g.enabled AS game_enabled,cm.status AS community_status,JSON_EXTRACT(s.config,'$.deleted') AS source_deleted FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id JOIN po_communities cm ON cm.id=c.community_id WHERE c.id=?",[f.content]);
    const job=await currentJob(f),[[analysis]]=await control.query('SELECT * FROM po_analyses WHERE content_id=?',[f.content]);
    const plan={schemaVersion:1,planId:'fixture_plan_'+f.external,manifestSha256:service.BASE_SHA,writerCoverageEvidenceId:config.writerCoverageEvidenceId,expiresAt:'2099-01-01 00:00:00.000',records:[{recordId:'fixture_record_'+f.external,content:freeze(content,service.CONTENT_FIELDS),currentFingerprint:content.fingerprint,oldFingerprint:job?.content_fingerprint??null,expectedJob:freeze(job,service.JOB_FIELDS),expectedAnalysis:freeze(analysis,service.ANALYSIS_FIELDS)}]};
    plan.sha256=service.exactPlanSha(plan);config.reviewedPlanSha256=[...(config.reviewedPlanSha256||[]),plan.sha256];return plan;
  }
  function input(snapshot){return{sentiment:'neutral',severity:'normal',negativeScore:0,confidence:.7,qualityScore:.8,analysisLevel:snapshot.analysis_profile,analysisVersion:snapshot.analysis_version,contentFingerprint:snapshot.content_fingerprint,modelName:'synthetic',summary:'synthetic'};}
  async function claim(f){const previous=consumer.currentAnalysisIntentConfig;consumer.currentAnalysisIntentConfig={enabled:false};let jobs;try{jobs=await consumer.claimAnalysisJobs({profile:f.input.profile,version:f.input.version,leaseOwner:'fixture-new-owner',leaseSeconds:180,contentIds:[f.content],limit:1});}finally{consumer.currentAnalysisIntentConfig=previous;}assert.equal(jobs.length,1);return consumer.freezeLeasedAnalysisSnapshot(jobs[0]);}
  async function intentState(f){return{body:await state(f),intents:await intents(f),audits:await audits(f)};}

  const ApiRepo=apiApp.repo.constructor;
  async function ledger(f){return{...await intentState(f),repair:(await control.query('SELECT * FROM po_current_analysis_repair_records ORDER BY plan_sha256,record_id'))[0]};}
  async function totalCache(){return(await control.query('SELECT * FROM po_analysis_cache ORDER BY cache_key'))[0];}
  async function hookPool(repo,callback){const original=repo.pool.getConnection.bind(repo.pool),restores=[];repo.pool.getConnection=async()=>{const c=await original(),q=c.query.bind(c);restores.push(()=>{c.query=q});c.query=(sql,args)=>callback(q,sql,args,c);return c};return()=>{repo.pool.getConnection=original;restores.forEach(fn=>fn())};}
  for(const [id,name,repo] of [[1,'collection',collection],[2,'analysis',consumer],[3,'api',apiApp.repo]])await test(id,name+'_body_intent_atomic_capture_and_fault_rollback',async()=>{
    repo.currentAnalysisIntentConfig=config;
    const f=await make(consumer,{status:'running',lease:'future'}),before=await ledger(f);
    const undo=await hookPool(repo,async(q,sql,args)=>{const value=await q(sql,args);if(sql.startsWith('INSERT INTO po_current_analysis_intents'))throw Object.assign(new Error('QA capture fault'),{code:'QA_CAPTURE_FAULT'});return value});
    try{await assert.rejects(updateBody(repo,f),{code:'QA_CAPTURE_FAULT'});}finally{undo();}
    assert.deepEqual(await ledger(f),before);
    const changed=await updateBody(repo,f);const i=await one(f);assert.equal(i.current_fingerprint,changed.fp);assert.equal(i.previous_fingerprint,f.fp);assert.equal(i.state,'pending');assert.deepEqual(await currentJob(f),before.body.po_analysis_jobs[0]);
    // Same generation capture must be idempotent even through the real body writer.
    await updateBody(repo,f);assert.equal((await one(f)).generation,i.generation);
    const old=repo.currentAnalysisIntentConfig;repo.currentAnalysisIntentConfig={...config,scopeAllowlist:[scope,{...scope,account_id:null}]};
    try{const [[sourceRow]]=await control.query('SELECT * FROM po_sources WHERE id=?',[h.source]);const external='qa-insert-'+name;
      const raw={externalId:external,contentType:'post',title:'QA',body:'QA insert atomic body',media:[],publishedAt:'2026-10-10 00:00:00',sourceUrl:'https://example.invalid/qa',engagement:{},fingerprint:fingerprint(external)};
      const inserted=await repo.insertContent(sourceRow,raw);const stored=await one({content:inserted.id});assert.equal(stored.current_fingerprint,raw.fingerprint);assert.equal(JSON.parse(stored.scope_json).account_id,null);
    }finally{repo.currentAnalysisIntentConfig=old;}
  });
  await test(4,'F2_old_F1_claim_commit_fail_rejected_intent_survives',async()=>{
    const f=await make(consumer),snapshot=await claim(f);await updateBody(collection,f);const before=await ledger(f),cache=await totalCache();
    assert.equal((await consumer.claimAnalysisJobs({profile:'light',version:'fixture-v1',leaseOwner:'qa-no-old-reclaim',contentIds:[f.content],limit:1})).length,0);
    assert.equal((await consumer.commitLeasedAnalysisSnapshot(snapshot,input(snapshot))).committed,false);
    assert.equal((await consumer.failLeasedAnalysisSnapshot(snapshot,{status:'failed',errorCode:'QA'})).changed,false);
    // enabled claim/replay may mark deferred_active; frozen data and result surfaces must stay unchanged.
    const after=await ledger(f);assert.deepEqual(after.body,before.body);assert.deepEqual(after.audits,before.audits);assert.deepEqual(after.repair,before.repair);assert.equal(after.intents[0].current_fingerprint,before.intents[0].current_fingerprint);assert.notEqual(after.intents[0].state,'applied');assert.deepEqual(await totalCache(),cache);
  });
  await test(5,'future_pending_retryable_and_running_intents_deferred',async()=>{
    for(const status of ['running','pending','retryable']){const f=await make(consumer,{status,lease:'future'});await updateBody(collection,f);const old=await currentJob(f),i=await one(f);assert.equal((await replay(f)).disposition,'deferred_active');assert.deepEqual(await currentJob(f),old);assert.equal((await one(f)).generation,i.generation);assert.equal((await audits(f)).length,0);}
  });
  await test(6,'renewed_F1_then_expiry_eventual_exact_F2_claim_commit',async()=>{
    const f=await make(consumer,{status:'running',lease:'future'});await updateBody(collection,f);await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_ADD(lease_until,INTERVAL 20 SECOND) WHERE id=?',[f.job.id]);assert.equal((await replay(f)).disposition,'deferred_active');
    await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_SUB(NOW(),INTERVAL 30 SECOND),attempts=attempts+1 WHERE id=?',[f.job.id]);
    assert.equal((await replay(f)).disposition,'requeued_current');assert.equal((await currentJob(f)).id,f.job.id);assert.equal((await currentJob(f)).content_fingerprint,(await current(f)).fingerprint);
    const s=await claim(f);assert.equal((await consumer.commitLeasedAnalysisSnapshot(s,input(s))).committed,true);const old=await ledger(f);assert.equal((await replay(f)).disposition,'already_applied');assert.deepEqual(await ledger(f),old);
  });
  await test(7,'same_fingerprint_expired_running_existing_reclaim',async()=>{
    const f=await make(consumer,{status:'running',lease:'expired'}),old=await currentJob(f);const s=await claim(f);assert.equal(s.attempts,old.attempts+1);assert.equal(s.content_fingerprint,f.fp);assert.notEqual(s.lease_owner,old.lease_owner);assert.equal((await intents(f)).length,0);
  });
  await test(8,'NULL_running_owner_blocked_and_NULL_fingerprint_exact_CAS',async()=>{
    const f=await make(consumer,{status:'running'});await control.query("UPDATE po_analysis_jobs SET lease_owner='qa-null-owner' WHERE id=?",[f.job.id]);await updateBody(collection,f);const before=await currentJob(f);assert.equal((await replay(f)).disposition,'blocked_orphan');assert.deepEqual(await currentJob(f),before);
    const g=await make(consumer,{status:'running',lease:'expired'});const oldJob=await currentJob(g);await assert.rejects(control.query('UPDATE po_analysis_jobs SET content_fingerprint=NULL WHERE id=?',[g.job.id]),{code:'ER_BAD_NULL_ERROR'});assert.deepEqual(await currentJob(g),oldJob);await updateBody(collection,g);const p=await exactPlan(g);p.records[0].oldFingerprint=null;p.sha256=service.exactPlanSha(p);config.reviewedPlanSha256.push(p.sha256);const beforeG=await ledger(g);await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan:p}),{code:'CURRENT_INTENT_PLAN_CONFLICT'});assert.deepEqual(await ledger(g),beforeG);
  });
  await test(9,'reviewed_no_intent_legacy_exact_plan_persistent_ACK',async()=>{
    const f=await make(consumer,{status:'running',lease:'expired'}),old=collection.currentAnalysisIntentConfig;collection.currentAnalysisIntentConfig={enabled:false};
    try{await updateBody(collection,f);}finally{collection.currentAnalysisIntentConfig=old;}assert.equal((await intents(f)).length,0);
    const p=await exactPlan(f);const value=await service.repairCurrentAnalysisJobsExact(consumer,{plan:p});assert.equal(value.results[0].disposition,'requeued_current');assert.equal((await currentJob(f)).id,f.job.id);const after=await ledger(f);assert.equal((await one(f)).state,'applied');
    assert.equal((await service.repairCurrentAnalysisJobsExact(consumer,{plan:p})).results[0].disposition,'already_applied');assert.deepEqual(await ledger(f),after);assert.equal((await audits(f)).length,1);
  });
  await test(10,'full_frozen_job_identity_peer_conflicts_reject_all_writes',async()=>{
    const peer=await connect(),mutations=[["lease_owner","lease_owner='qa-other'"],["lease_until","lease_until=DATE_SUB(lease_until,INTERVAL 1 SECOND)"],["attempts","attempts=attempts+1"],["profile","analysis_profile='deep'"],["version","analysis_version='qa-other'"],["fingerprint","content_fingerprint='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'"],["trigger","trigger_reason='qa-other'"],["updated_at","updated_at=DATE_SUB(updated_at,INTERVAL 1 SECOND)"]];
    for(const [field,sql]of mutations){const f=await make(consumer,{status:'running',lease:'expired'});await updateBody(collection,f);const p=await exactPlan(f);await peer.query('UPDATE po_analysis_jobs SET '+sql+' WHERE id=?',[f.job.id]);const old=await ledger(f);await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan:p}),e=>['CURRENT_INTENT_PLAN_CONFLICT','CURRENT_INTENT_IDENTITY_CONFLICT'].includes(e.code));assert.deepEqual(await ledger(f),old);}return {realPeerMutations:mutations.map(m=>m[0]),affectedRows0:'not demonstrated'};
  });
  await test(11,'F3_and_scope_plan_conflicts_bounded_quarantine',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const p=await exactPlan(f);await updateBody(collection,f,{fp:fingerprint(f.external+'QA-F3'),body:'QA F3 body'});const old=await ledger(f);await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan:p}),{code:'CURRENT_INTENT_PLAN_CONFLICT'});assert.deepEqual(await ledger(f),old);
    const g=await make(consumer,{status:'completed'});await updateBody(collection,g);const plan=await exactPlan(g);await control.query('UPDATE po_contents SET account_id=NULL WHERE id=?',[g.content]);const before=await ledger(g);await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan}),{code:'CURRENT_INTENT_PLAN_CONFLICT'});assert.deepEqual(await ledger(g),before);assert.equal((await replay(g)).disposition,'blocked_scope');assert.deepEqual(await state(g),before.body);
  });
  await test(12,'gate_busy_and_lost_ownership_reject_zero_writes',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const old=await ledger(f),peer=await connect();
    await consumer.releaseAdvisoryLock('po-analysis-consumer');await peer.query("SELECT GET_LOCK('po-analysis-consumer',0)");assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),false);await assert.rejects(replay(f),{code:'ANALYSIS_SCOPE_LEASE_LOST'});assert.deepEqual(await ledger(f),old);await peer.query("SELECT RELEASE_LOCK('po-analysis-consumer')");assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);
    const gate=consumer.advisoryLocks.get('po-analysis-consumer');await gate.query("SELECT RELEASE_LOCK('po-analysis-consumer')");await assert.rejects(replay(f),{code:'ANALYSIS_SCOPE_LEASE_LOST'});assert.deepEqual(await ledger(f),old);await consumer.releaseAdvisoryLock('po-analysis-consumer');assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);
  });
  await test(13,'audit_ACK_plan_records_same_gate_atomic_KILL_rollback',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const p=await exactPlan(f),old=await ledger(f),gate=consumer.advisoryLocks.get('po-analysis-consumer'),q=gate.query.bind(gate),reached=deferred(),resume=deferred();
    gate.query=async(sql,args)=>{const value=await q(sql,args);if(sql.startsWith('INSERT INTO po_current_analysis_repair_records')){reached.resolve();await resume.promise;}return value};
    const pending=service.repairCurrentAnalysisJobsExact(consumer,{plan:p});pending.catch(()=>{});
    try{await Promise.race([reached.promise,pending.then(()=>{throw Error('QA repair record barrier missing')})]);await control.query('KILL CONNECTION '+Number(gate.threadId));}
    finally{resume.resolve();}
    await assert.rejects(pending);assert.deepEqual(await ledger(f),old);consumer.advisoryLocks.delete('po-analysis-consumer');gate.destroy();assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);
    return {fault:'real KILL after audit+ACK+repair record SQL, before commit',gateThread:gate.threadId};
  });
  await test(14,'audit_SQL_privilege_failure_and_lock_timeout_rollback',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const old=await ledger(f);
    await control.query("REVOKE INSERT ON "+context.database+".po_current_analysis_intent_audit FROM 'intent_fixture'@'127.0.0.1'");
    try{await assert.rejects(replay(f),e=>e.code==='ER_TABLEACCESS_DENIED_ERROR');assert.deepEqual(await ledger(f),old);}finally{await control.query("GRANT INSERT ON "+context.database+".po_current_analysis_intent_audit TO 'intent_fixture'@'127.0.0.1'");}
    const peer=await connect();await peer.beginTransaction();await peer.query('SELECT * FROM po_contents WHERE id=? FOR UPDATE',[f.content]);const gate=consumer.advisoryLocks.get('po-analysis-consumer');await gate.query('SET SESSION innodb_lock_wait_timeout=1');
    try{await assert.rejects(replay(f),{code:'ER_LOCK_WAIT_TIMEOUT'});assert.deepEqual(await ledger(f),old);}finally{await peer.rollback();await gate.query('SET SESSION innodb_lock_wait_timeout=3');}
  });
  await test(15,'real_deadlock_gate_replay_rolls_back_exact_one_retry',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const i=await one(f),old=await ledger(f),peer=await connect();await peer.beginTransaction();await peer.query('SELECT * FROM po_current_analysis_intents WHERE id=? FOR UPDATE',[i.id]);
    for(let n=0;n<20;n++)await peer.query("INSERT INTO po_current_analysis_repair_records(plan_sha256,plan_id,record_id,intent_id,generation,disposition) VALUES (?,'qa-deadlock',?,?,1,'qa-weight')",['e'.repeat(64),'qa-weight-'+n,i.id]);
    const gate=consumer.advisoryLocks.get('po-analysis-consumer'),pending=replay(f);pending.catch(()=>{});
    try{await waitForLock('qa_deadlock_gate_waits_intent',gate.threadId,peer.threadId,'po_current_analysis_intents');await peer.query('SELECT * FROM po_contents WHERE id=? FOR UPDATE',[f.content]);await assert.rejects(pending,{code:'ER_LOCK_DEADLOCK'});}finally{await peer.rollback();}
    assert.deepEqual(await ledger(f),old);assert.equal((await replay(f)).disposition,'requeued_current');return{boundedRetries:1,error:'ER_LOCK_DEADLOCK',actualVictim:'gate replay'};
  });
  await test(16,'F2_repair_F3_body_actual_lock_generation_and_old_ACK',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const p=await exactPlan(f),gate=consumer.advisoryLocks.get('po-analysis-consumer'),q=gate.query.bind(gate),reached=deferred(),resume=deferred(),connected=deferred();
    gate.query=async(sql,args)=>{const v=await q(sql,args);if(sql.startsWith('INSERT INTO po_current_analysis_repair_records')){reached.resolve();await resume.promise;}return v};
    const get=collection.pool.getConnection.bind(collection.pool);collection.pool.getConnection=async()=>{const c=await get();connected.resolve(c.threadId);return c};
    const repair=service.repairCurrentAnalysisJobsExact(consumer,{plan:p});repair.catch(()=>{});let body;
    try{await Promise.race([reached.promise,repair.then(()=>{throw Error('QA barrier absent')})]);body=updateBody(collection,f,{fp:fingerprint(f.external+'race-F3'),body:'QA racing F3 longer body'});body.catch(()=>{});await waitForLock('qa_F3_writer_waits_F2_ACK_commit',await connected.promise,gate.threadId,'po_contents');}
    finally{resume.resolve();gate.query=q;collection.pool.getConnection=get;}
    assert.equal((await repair).results[0].disposition,'requeued_current');await body;const latest=await one(f);assert.equal(Number(latest.generation),2);assert.equal(latest.state,'pending');const old=await ledger(f);
    assert.equal((await service.repairCurrentAnalysisJobsExact(consumer,{plan:p})).results[0].disposition,'already_applied');assert.deepEqual(await ledger(f),old);assert.equal((await replay(f)).disposition,'requeued_current');assert.equal((await currentJob(f)).content_fingerprint,latest.current_fingerprint);assert.equal((await audits(f)).length,2);
  });
  await test(17,'body_committed_without_downstream_new_repo_replays_intent',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const stored=await one(f),restarted=new Consumer(env);restarted.currentAnalysisIntentConfig=config;repositories.push(restarted);assert.equal((await currentJob(f)).content_fingerprint,f.fp);
    await consumer.releaseAdvisoryLock('po-analysis-consumer');assert.equal(await restarted.acquireAdvisoryLock('po-analysis-consumer',0),true);
    try{assert.equal((await service.replayCurrentAnalysisIntents(restarted,{intentIds:[stored.id]})).results[0].disposition,'requeued_current');assert.equal((await currentJob(f)).content_fingerprint,stored.current_fingerprint);}finally{await restarted.releaseAdvisoryLock('po-analysis-consumer');assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);}
  });
  await test(18,'disabled_and_outside_scope_body_writes_no_intent',async()=>{
    for(const cfg of [{enabled:false},{...config,scopeAllowlist:[{...scope,region_code:'overseas'}]}]){const f=await make(consumer,{status:'completed'}),previous=collection.currentAnalysisIntentConfig;collection.currentAnalysisIntentConfig=cfg;try{const changed=await updateBody(collection,f);assert.equal((await current(f)).fingerprint,changed.fp);assert.equal((await intents(f)).length,0);}finally{collection.currentAnalysisIntentConfig=previous;}}
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const old=await ledger(f);await assert.rejects(service.replayCurrentAnalysisIntents(consumer,{intentIds:[(await one(f)).id],config:{...config,scopeAllowlist:[{...scope,region_code:'overseas'}]}}),{code:'CURRENT_INTENT_CONFIG_OVERRIDE'});assert.deepEqual(await ledger(f),old);
  });
  await test(19,'actual_insert_and_page_NULL_community_commit_zero_intent',async()=>{
    await control.query('UPDATE po_sources SET community_id=NULL WHERE id=?',[h.source]);await control.query('UPDATE po_accounts SET community_id=NULL WHERE id=?',[h.account]);
    const [[src]]=await control.query('SELECT * FROM po_sources WHERE id=?',[h.source]),[[acc]]=await control.query('SELECT * FROM po_accounts WHERE id=?',[h.account]);
    try{for(const mode of ['insert','page']){const raw={externalId:'qa-null-'+mode,contentType:'post',title:'QA',body:'QA null community body',media:[],publishedAt:'2026-10-10 00:00:00',engagement:{},sourceUrl:'https://example.invalid/qa',fingerprint:fingerprint('null-'+mode)};
      const c=mode==='insert'?await collection.insertContent(src,raw):(await collection.upsertContentPage({account:acc,syncScope:'posts',items:[raw],hasMore:false})).contents[0].content;
      assert.equal(c.community_id,null);assert.equal(c.body,raw.body);assert.equal((await intents({content:c.id})).length,0);}
    }finally{await control.query('UPDATE po_sources SET community_id=? WHERE id=?',[h.community,h.source]);await control.query('UPDATE po_accounts SET community_id=? WHERE id=?',[h.community,h.account]);}
  });
  await test(20,'bad_intent_does_not_poison_actual_enabled_normal_claim',async()=>{
    const bad=await make(consumer,{status:'completed'});await updateBody(collection,bad);await control.query('UPDATE po_contents SET account_id=NULL WHERE id=?',[bad.content]);const i=await one(bad);await control.query("UPDATE po_current_analysis_intents SET updated_at='2000-01-01 00:00:00.000' WHERE id=?",[i.id]);
    const good=await make(consumer),before=await currentJob(bad);const rows=await consumer.claimAnalysisJobs({profile:'light',version:'fixture-v1',leaseOwner:'qa-good-claim',contentIds:[good.content],limit:1});assert.equal(rows.length,1);assert.equal(rows[0].content_id,good.content);assert.deepEqual(await currentJob(bad),before);assert.equal((await one(bad)).state,'blocked_scope');
  });
  await test(21,'changed_body_history_marker_protected_actual_API',async()=>{
    const f=await make(consumer,{status:'completed',reason:'risk_policy_backfill:qa_history'});await updateBody(collection,f);const old=await currentJob(f);assert.equal((await replay(f)).disposition,'deferred_history');assert.deepEqual(await currentJob(f),old);
    const currentFp=(await current(f)).fingerprint;assert.equal((await apiApp.repo.enqueueAnalysisJob(f.content,{...f.input,contentFingerprint:currentFp})).enqueueDisposition,'preserved_history');assert.deepEqual(await currentJob(f),old);
    const r=await request(apiApp.server,f.content);assert.equal(r.status,409);assert.equal(r.body.error.code,'RISK_HISTORY_JOB_PROTECTED');assert.deepEqual(await currentJob(f),old);assert.notEqual((await one(f)).state,'applied');
  });
  await test(22,'F2_intent_active_HTTP409_then_repair_ordinary_new_force202',async()=>{
    const f=await make(consumer,{status:'running',lease:'future'});await updateBody(collection,f);const old=await ledger(f);const r=await request(apiApp.server,f.content);assert.equal(r.status,409);assert.deepEqual(await ledger(f),old);
    await control.query('UPDATE po_analysis_jobs SET lease_until=DATE_SUB(NOW(),INTERVAL 10 SECOND) WHERE id=?',[f.job.id]);assert.equal((await replay(f)).disposition,'requeued_current');const s=await claim(f);assert.equal((await consumer.commitLeasedAnalysisSnapshot(s,input(s))).committed,true);
    assert.equal((await request(apiApp.server,f.content)).status,202);assert.equal((await currentJob(f)).content_fingerprint,(await current(f)).fingerprint);
  });
  await test(23,'source_disabled_deleted_content_manual_and_failed_budget_blocked',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const old=await currentJob(f);await control.query('UPDATE po_sources SET enabled=0 WHERE id=?',[h.source]);try{assert.equal((await replay(f)).disposition,'blocked_scope');assert.deepEqual(await currentJob(f),old);}finally{await control.query('UPDATE po_sources SET enabled=1 WHERE id=?',[h.source]);}
    const del=await make(consumer,{status:'completed'});await updateBody(collection,del);await control.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[del.content]);assert.equal((await replay(del)).disposition,'blocked_scope');
    const manual=await make(consumer,{status:'running',lease:'expired'});await control.query("UPDATE po_analysis_jobs SET lease_owner='q1-daily:qa:a:b:c' WHERE id=?",[manual.job.id]);await updateBody(collection,manual);const before=await currentJob(manual);assert.equal((await replay(manual)).disposition,'blocked_manual');assert.deepEqual(await currentJob(manual),before);
    const failed=await make(consumer,{status:'failed'});await updateBody(collection,failed,{fp:failed.fp,body:'QA same fingerprint failed body'});assert.equal((await replay(failed)).disposition,'blocked_failed_budget');assert.equal((await currentJob(failed)).status,'failed');assert.notEqual((await one(failed)).state,'applied');
  });
  await test(24,'empty_overbound_unreviewed_plan_and_missing_identity_zero_writes',async()=>{
    const f=await make(consumer,{status:'completed'});await updateBody(collection,f);const old=await ledger(f);
    for(const bad of [{...config,version:''},{...config,batchSize:11},{...config,manifestSha256:'0'.repeat(64)},{...config,scopeAllowlist:[]}])assert.throws(()=>service.validateIntentConfig(bad),{code:'CURRENT_INTENT_CONFIG_INVALID'});
    for(const ids of [[],Array.from({length:11},(_,n)=>'qa-'+n)])await assert.rejects(service.replayCurrentAnalysisIntents(consumer,{intentIds:ids}),{code:'CURRENT_INTENT_BATCH_INVALID'});
    await assert.rejects(service.replayCurrentAnalysisIntents(consumer,{records:[{}]}),{code:'CURRENT_INTENT_PLAN_REQUIRED'});
    const plan=await exactPlan(f);const unreviewed={...plan,planId:'qa_unreviewed'};unreviewed.sha256=service.exactPlanSha(unreviewed);
    await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan:unreviewed}),{code:'CURRENT_INTENT_PLAN_INVALID'});
    const bad={...plan,records:[{...plan.records[0],expectedJob:null}]};bad.sha256=service.exactPlanSha(bad);config.reviewedPlanSha256.push(bad.sha256);
    await assert.rejects(service.repairCurrentAnalysisJobsExact(consumer,{plan:bad}),{code:'CURRENT_INTENT_PLAN_CONFLICT'});assert.deepEqual(await ledger(f),old);
  });
  result.pending.push({scope:'not implemented/not independently covered',items:['actual affectedRows=0 after locked full CAS','force requestId durable idempotency','independent history lane and eventual history F2','automatic published/business date window','legacy Q1 writer','loaded API/shared and translation ACL','realtime external notification window','legacy longer body/raw fingerprint semantics','production schema/records and domestic-overseas recovery']});
}).catch(error=>{console.error(error.stack);process.exitCode=1;});
