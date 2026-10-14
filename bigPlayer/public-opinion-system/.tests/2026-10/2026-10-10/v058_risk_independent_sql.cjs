'use strict';
// Fresh loopback MariaDB fixture only. Never reads production env or starts scheduler.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process'),{createRequire}=require('node:module');
const root=path.resolve('C:/Users/Administrator/AppData/Roaming/Code/User/project manage'),project=path.join(root,'bigPlayer/public-opinion-system'),temp=path.join(root,'.temp');
const mysql=createRequire(path.join(project,'package.json'))('mysql2/promise');
const bin='C:/xampp/mysql/bin',serverId=20261059,database='po_qa_v058_fixture';
const tailOnly=process.env.QA_V058_TAIL==='1';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
async function availablePort(){const s=net.createServer();await new Promise((r,j)=>s.once('error',j).listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function freePort(port){const s=net.createServer();await new Promise((r,j)=>s.once('error',j).listen(port,'127.0.0.1',r));await new Promise(r=>s.close(r));}
async function main(){
  assert.deepEqual(process.argv.slice(2,4),['--isolated','--candidate']);assert.equal(process.argv.length,5);
  const mf=path.resolve(process.argv[4]);assert.equal(hash(mf),'18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234');
  const manifest=JSON.parse(fs.readFileSync(mf,'utf8'));assert.equal(manifest.productionChanged,false);
  const verifyHashes=()=>{let count=0;for(const [name,tree]of Object.entries(manifest.trees)){assert(tree.runtime.toLowerCase().startsWith((temp+path.sep).toLowerCase()));for(const file of tree.files){assert.equal(hash(path.join(tree.runtime,file.path)),file.sha256,name+':'+file.path);count++;}}assert.equal(hash(mf),'18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234');return count;};
  const verifiedFiles=verifyHashes();for(const dir of[root,temp,__dirname,path.dirname(mf)]){assert(!fs.lstatSync(dir).isSymbolicLink());assert.equal(fs.realpathSync(dir).toLowerCase(),dir.toLowerCase());}
  assert(fs.statfsSync(temp).bavail*fs.statfsSync(temp).bsize>4*1024**3);
  assert(fs.readFileSync(path.join(bin,'mysql_install_db.exe')).toString('latin1').includes('--no-defaults %s --innodb-page-size=%d --bootstrap'));
  const port=await availablePort(),directory=fs.mkdtempSync(path.join(temp,'qa-v058-risk-')),dataDir=path.join(directory,'data'),pidFile=path.join(directory,'mysqld.pid');
  fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({datadir:dataDir,port,serverId,runnerPid:process.pid,startedAt:new Date().toISOString(),productionTouched:false},null,2),{flag:'wx'});
  const result={status:'FAIL',productionTouched:false,externalNetwork:false,candidateManifestSha256:hash(mf),verifiedFiles,directory,port,serverId,checks:[],lockEvidence:[],httpEvidence:[],methodHashes:[]};
  let server,control,apiApp,api,shared,consumer,connection,closed=false;
  async function owns(){const[[row]]=await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile,VERSION() AS version');return row.port===port&&row.serverId===serverId&&path.resolve(row.datadir).toLowerCase()===dataDir.toLowerCase()&&path.resolve(row.pidFile).toLowerCase()===pidFile.toLowerCase()&&row.version==='10.4.14-MariaDB'&&Number(fs.readFileSync(pidFile,'utf8').trim())===server.pid&&JSON.parse(fs.readFileSync(path.join(directory,'owner.json'),'utf8')).runnerPid===process.pid;}
  try{
    const init=spawnSync(path.join(bin,'mysql_install_db.exe'),[`--datadir=${dataDir}`,`--port=${port}`],{encoding:'utf8',timeout:60000,windowsHide:true,shell:false,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:`C:/Windows/System32;${bin}`}});
    fs.writeFileSync(path.join(directory,'init.log'),`${init.stdout||''}\n${init.stderr||''}`,{flag:'wx'});assert.equal(init.status,0);
    const log=fs.openSync(path.join(directory,'server.log'),'wx');
    server=spawn(path.join(bin,'mysqld.exe'),['--no-defaults','--basedir=C:/xampp/mysql',`--datadir=${dataDir}`,'--bind-address=127.0.0.1',`--port=${port}`,`--server-id=${serverId}`,`--pid-file=${pidFile}`,'--skip-log-bin','--event-scheduler=OFF','--innodb-buffer-pool-size=64M','--max-connections=20'],{windowsHide:true,shell:false,stdio:['ignore',log,log]});fs.closeSync(log);server.once('close',()=>{closed=true});let spawnError;server.once('error',e=>{spawnError=e});
    for(let i=0;i<100&&!control;i++){assert(!spawnError);assert.equal(server.exitCode,null);try{control=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',connectTimeout:1000,dateStrings:true});}catch{await pause(200)}}
    assert(control&&await owns(),'owned isolated instance identity');result.checks.push('owned_fresh_no_defaults_instance');
    await control.query(`CREATE DATABASE ${database}`);await control.changeUser({database});
    const schema=fs.readFileSync(path.join(project,'.tests/2026-10/2026-10-10/risk-normalization-schema.sql'),'utf8');for(const s of schema.split(/;\s*(?:\r?\n|$)/).filter(s=>s.trim()))await control.query(s);
    const password=crypto.randomBytes(24).toString('hex');await control.query("CREATE USER 'producer_fixture'@'127.0.0.1' IDENTIFIED BY ?",[password]);await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.* TO 'producer_fixture'@'127.0.0.1'`);
    const env={DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:database,DB_USER:'producer_fixture',DB_PASSWORD:password,DB_POOL_SIZE:'4',PUBLIC_OPINION_SERVICE_MODE:'1',PUBLIC_OPINION_ENV_FILE:path.join(directory,'fixture.env'),AI_ANALYSIS_ENABLED:'1',AI_ANALYSIS_URL:'http://127.0.0.1:1/forbidden',AI_ANALYSIS_TOKEN:'synthetic-never-transmitted',AI_ANALYSIS_LIGHT_MODEL:'fixture',AI_ANALYSIS_LIGHT_VERSION:'fixture-v1'};
    fs.writeFileSync(env.PUBLIC_OPINION_ENV_FILE,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{flag:'wx'});
    for(const k of Object.keys(process.env))if(!['SystemRoot','WINDIR','PATH'].includes(k))delete process.env[k];Object.assign(process.env,env);
    global.fetch=async()=>{throw new Error('external requests forbidden')};
    apiApp=require(path.join(manifest.trees.api.runtime,'server/src/app'));api=apiApp.repo;
    const {Repository:Shared}=require(path.join(manifest.trees.collection.runtime,'server/src/db/repository'));shared=new Shared(env);
    const {Repository:Consumer}=require(path.join(manifest.trees.analysis.runtime,'server/src/db/repository'));consumer=new Consumer(env);
    await new Promise((r,j)=>apiApp.server.once('error',j).listen(0,'127.0.0.1',r));const httpPort=apiApp.server.address().port;result.httpPort=httpPort;
    assert.equal(await consumer.acquireAdvisoryLock('po-analysis-consumer',0),true);
    connection=await mysql.createConnection({host:'127.0.0.1',port,database,user:env.DB_USER,password,dateStrings:true});await connection.query('SET SESSION innodb_lock_wait_timeout=15');
    const game=crypto.randomUUID(),community=crypto.randomUUID(),source=crypto.randomUUID();
    await control.query("INSERT INTO po_games(id,name,kind,identifiers,region_code) VALUES (?,'fixture','owned','{}','domestic')",[game]);
    await control.query("INSERT INTO po_communities(id,game_id,name) VALUES (?,?,'fixture')",[community,game]);
    await control.query("INSERT INTO po_sources(id,game_id,community_id,platform,source_type,display_name,enabled,config) VALUES (?,?,?,'bigplayer_h5','owned_community','fixture',1,'{}')",[source,game,community]);
    let count=0;
    async function fixture(repo=api,{status='pending',reason='ordinary',liveLease=false,profile='light',createJob=true}={}){
      const content=crypto.randomUUID(),fp=crypto.createHash('sha256').update(`fixture-${++count}`).digest('hex');
      await control.query("INSERT INTO po_contents(id,game_id,community_id,source_id,external_id,content_type,title,body,media,published_at,engagement,fingerprint,source_url) VALUES (?,?,?,?,?,'post','fixture',?,'[]',NOW(),'{}',?,'https://example.invalid/fixture')",[content,game,community,source,String(count),'fixture body '.repeat(10),fp]);
      const input={profile,version:'fixture-v1',contentFingerprint:fp,triggerReason:'ordinary',matchedKeywords:['old']};let job;
      if(createJob){job=await repo.enqueueAnalysisJob(content,input);await control.query("UPDATE po_analysis_jobs SET status=?,trigger_reason=?,attempts=3,error_code='fixture_old',error_message='fixture_old',next_retry_at=DATE_ADD(NOW(),INTERVAL 1 DAY),completed_at=NOW(),lease_owner=?,lease_until=IF(?,DATE_ADD(NOW(),INTERVAL 180 SECOND),NULL) WHERE id=?",[status,reason,liveLease?'fixture-old-owner':null,liveLease?1:0,job.id]);}
      return{content,fp,input,job};
    }
    async function state(f){return{contents:(await control.query('SELECT * FROM po_contents WHERE id=?',[f.content]))[0],jobs:(await control.query('SELECT * FROM po_analysis_jobs WHERE content_id=? ORDER BY id',[f.content]))[0],analyses:(await control.query('SELECT * FROM po_analyses WHERE content_id=?',[f.content]))[0],audits:(await control.query('SELECT * FROM po_audit_events ORDER BY id'))[0]};}
    const force=f=>({...f.input,triggerReason:'manual_reanalysis',force:true,matchedKeywords:['new']});
    async function request(f){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:httpPort,path:`/api/public-opinion/contents/${f.content}/reanalyze`,method:'POST'},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{const body=JSON.parse(Buffer.concat(chunks));result.httpEvidence.push({contentId:f.content,status:res.statusCode,code:body.error?.code,analysisStatus:body.data?.analysisStatus});resolve({status:res.statusCode,body})}catch(e){reject(e)}})});req.once('error',reject);req.setTimeout(20000,()=>req.destroy(new Error('fixture HTTP timeout')));req.end()})}

    // QA-authored cases; employee initialization and lock-observer plumbing reused.
    if(!tailOnly) {
    for(const [name,repo] of [['api',api],['shared',shared]]) {
      const f=await fixture(repo,{status:'running',liveLease:true});
      const newFp=crypto.createHash('sha256').update(name+'current body changed').digest('hex');
      await control.query('UPDATE po_contents SET body=?,fingerprint=? WHERE id=?',['QA current body changed',newFp,f.content]);
      const before=await state(f);
      const current={...f.input,contentFingerprint:newFp};
      assert.equal((await repo.enqueueAnalysisJob(f.content,current)).enqueueDisposition,'preserved_active');
      await assert.rejects(repo.enqueueAnalysisJob(f.content,{...current,force:true}),{code:'ANALYSIS_JOB_LEASE_ACTIVE'});
      await assert.rejects(repo.enqueueAnalysisJob(f.content,f.input),{code:'ANALYSIS_CONTENT_CHANGED'});
      assert.deepEqual(await state(f),before);
      assert.equal(before.jobs.length,1);assert.equal(before.jobs[0].content_fingerprint,f.fp);
      if(name==='api'){const http=await request(f);assert.equal(http.status,409);assert.equal(http.body.error.code,'ANALYSIS_JOB_LEASE_ACTIVE');assert.deepEqual(await state(f),before);}
      result.checks.push(name+'_changed_current_body_preserves_active_old_job_no_precise_requeue');
      for(const config of [{status:'pending',liveLease:true},{status:'running',liveLease:false}]) {
        const leased=await fixture(repo,config),saved=await state(leased);
        await assert.rejects(repo.enqueueAnalysisJob(leased.content,force(leased)),{code:'ANALYSIS_JOB_LEASE_ACTIVE'});
        assert.deepEqual(await state(leased),saved);
        result.checks.push(name+'_'+config.status+'_'+(config.liveLease?'future_lease':'expired_running')+'_force_unchanged');
      }
      const history=await fixture(repo,{status:'completed',reason:'risk_policy_backfill:qa_v058'}),old=await state(history);
      assert.equal((await repo.enqueueAnalysisJob(history.content,history.input)).enqueueDisposition,'preserved_history');
      await assert.rejects(repo.enqueueAnalysisJob(history.content,force(history)),{code:'RISK_HISTORY_JOB_PROTECTED'});
      assert.deepEqual(await state(history),old);
      if(name==='api'){const h=await request(history);assert.equal(h.status,409);assert.equal(h.body.error.code,'RISK_HISTORY_JOB_PROTECTED');assert.deepEqual(await state(history),old);}
      result.checks.push(name+'_history_exact_marker_and_force_http_protection');
      for(const createJob of [true,false]){
        const f=await fixture(repo,{createJob,status:'completed'}),old=await state(f);
        await connection.beginTransaction();
        const j=await repo.enqueueAnalysisJob(f.content,force(f),connection);assert.equal(j.status,'pending');
        assert.deepEqual(await state(f),old);await connection.rollback();assert.deepEqual(await state(f),old);
        result.checks.push(name+'_borrowed_connection_'+(createJob?'update':'insert')+'_outer_rollback');
      }
    }
    {const f=await fixture(api,{status:'completed'});const r=await request(f);assert.equal(r.status,202);assert.equal(r.body.data.jobId,f.job.id);const s=await state(f);assert.equal(s.jobs[0].status,'pending');assert.equal(s.jobs[0].attempts,0);assert.equal(s.jobs[0].lease_owner,null);result.checks.push('actual_http_idle_force_202_exact_job');}
    // Fresh SQL consumer affected history integration, not the old 16-case matrix.
    async function claimFixture(history=false){
      const f=await fixture(consumer);
      await control.query("UPDATE po_analysis_jobs SET attempts=0,next_retry_at=NULL,error_code=NULL,error_message=NULL,completed_at=NULL,trigger_reason=? WHERE id=?",[history?'risk_policy_backfill:qa_v058':'ordinary',f.job.id]);
      const [claim]=await consumer.claimAnalysisJobs({profile:'light',version:'fixture-v1',leaseOwner:'qa-v058-owner',leaseSeconds:180,contentIds:[f.content],limit:1});assert(claim);
      const snapshot=await consumer.freezeLeasedAnalysisSnapshot(claim);assert(snapshot&&Object.isFrozen(snapshot));
      const input={sentiment:'neutral',severity:'normal',negativeScore:0,confidence:.8,qualityScore:.95,recommendHome:true,analysisLevel:'light',analysisVersion:'fixture-v1',contentFingerprint:f.fp,modelName:'fixture',summary:'QA result'};
      return {...f,snapshot,input};
    }
    {const f=await claimFixture();await control.query('UPDATE po_contents SET fingerprint=? WHERE id=?',['d'.repeat(64),f.content]);const before=await state(f);
      assert.equal((await consumer.commitLeasedAnalysisSnapshot(f.snapshot,f.input)).committed,false);
      assert.equal((await consumer.failLeasedAnalysisSnapshot(f.snapshot,{status:'failed',errorCode:'QA'})).changed,false);
      assert.deepEqual(await state(f),before);result.checks.push('changed_content_fence_commit_and_fail_no_write');
    }
    {const f=await claimFixture(true),before=await state(f);
      const options={cacheEntry:{...f.input,cacheKey:crypto.randomBytes(32).toString('hex'),profile:'light',version:'fixture-v1'},qualityCandidate:f.input,deepJob:{profile:'deep',version:'qa-deep-v1',contentFingerprint:f.fp},runId:'qa-v058'};
      const totals=async()=>({cache:(await control.query('SELECT * FROM po_analysis_cache'))[0],quality:(await control.query('SELECT * FROM po_quality_candidates'))[0]});
      const oldTotals=await totals(),get=consumer.pool.getConnection.bind(consumer.pool);let wrapped,query;
      consumer.pool.getConnection=async()=>{const c=await get();wrapped=c;query=c.query.bind(c);c.query=async(sql,args)=>{const ret=await query(sql,args);if(sql.startsWith('INSERT INTO po_audit_events')&&args?.includes('analysis_lease_result_committed'))throw Object.assign(new Error('QA injected final audit failure'),{code:'QA_FINAL_AUDIT_FAILURE'});return ret};return c};
      try{await assert.rejects(consumer.commitLeasedAnalysisSnapshot(f.snapshot,f.input,options),{code:'QA_FINAL_AUDIT_FAILURE'});}
      finally{consumer.pool.getConnection=get;if(wrapped)wrapped.query=query;}
      assert.deepEqual(await state(f),before);assert.deepEqual(await totals(),oldTotals);
      result.checks.push('history_deep_cache_quality_audit_finish_same_connection_rollback');
      assert.equal((await consumer.commitLeasedAnalysisSnapshot(f.snapshot,f.input,options)).committed,true);
      const after=await state(f),deep=after.jobs.find(j=>j.analysis_profile==='deep'),parent=after.jobs.find(j=>j.id===f.snapshot.id);
      assert.equal(parent.status,'completed');assert.equal(deep.status,'pending');assert.equal(deep.trigger_reason,'risk_policy_backfill:qa_v058');
      assert.equal(deep.content_fingerprint,f.fp);assert.equal(after.analyses.length,1);
      assert.equal((await totals()).cache.length,oldTotals.cache.length+1);assert.equal((await totals()).quality.length,oldTotals.quality.length+1);
      const hist=after.audits.filter(a=>a.event_type==='risk_policy_reanalysis_enqueued'&&JSON.parse(a.detail).contentId===f.content);
      assert.equal(hist.length,1);assert.equal(JSON.parse(hist[0].detail).notificationPolicy,'suppressed');assert.equal(JSON.parse(hist[0].detail).parentJobId,parent.id);
      result.checks.push('history_deep_inherits_parent_before_finish_atomic_success');
    }
    for(const name of ['api','analysis','collection']){
      const {AlertEngine}=require(path.join(manifest.trees[name].runtime,'server/src/pipeline/alertEngine'));
      const fail=()=>{throw new Error('QA historical guard reached side effect')};
      const engine=new AlertEngine(new Proxy({}, {get:()=>fail}),new Proxy({}, {get:()=>fail}),{});
      for(const entry of ['process','processAiUrgent'])for(const target of ['content','analysis']){
        const input={game:{id:game},content:{id:'qa',published_at:new Date().toISOString()},analysis:{sentiment:'negative',severity:'urgent'},hit:{hitGroups:[{}]}};
        input[target].triggerReason='risk_policy_backfill:'; // malformed reserved marker must suppress too.
        assert.deepEqual(await engine[entry](input),[]);
        result.checks.push(name+'_'+entry+'_'+target+'_malformed_history_suppresses_all_effects');
      }
    }
    }
    // Actual frozen worker exports in a dependency-controlled VM; no worker main.
    {const vm=require('node:vm'),runtime=manifest.trees.analysis.runtime;
      const sandbox={module:{exports:{}},exports:{},process:{env:{}},console,Buffer,setInterval,clearInterval,setTimeout,clearTimeout};
      sandbox.require=name=>{if(name.startsWith('node:'))return require(name);if(name.endsWith('/runtimeEnv'))return {loadRuntimeEnv(){}};if(name.endsWith('/riskPolicyHistory'))return require(path.join(runtime,'shared/riskPolicyHistory'));if(name.endsWith('/riskSeverityNormalizer'))return {normalizeAnalysisResult:a=>a};if(name.endsWith('/q1DailyJob'))return {sanitizeMessage:a=>a};if(name.endsWith('/ruleEngine'))return {matchRules:()=>({needAI:true,matchedKeywords:['qa']})};return {}};
      vm.runInNewContext(fs.readFileSync(path.join(runtime,'worker/src/worker.js'),'utf8'),sandbox);
      const required=['enqueueAnalysisJob','claimAnalysisJobs','freezeLeasedAnalysisSnapshot','commitLeasedAnalysisSnapshot','failLeasedAnalysisSnapshot'];
      for(const entry of ['processDownstream','processPersistentAnalysisJobs','processAnalysisBacklog']){
        if(tailOnly && entry !== 'processAnalysisBacklog') continue;
        const misses=entry==='processDownstream'?required:['commitLeasedAnalysisSnapshot'];
        for(const missing of misses){const calls=[];const repo=Object.fromEntries([...required,'insertAnalysis','upsertAnalysisCache','insertQualityCandidate','reconcilePositiveRiskAlerts','loadKeywordRules'].map(k=>[k,async()=>{calls.push(k);return []}]));
          delete repo[missing];const deps={repo,ai:{configured:()=>{calls.push('configured');return true},analyzeBatch:async()=>{calls.push('AI')},selectProfile:name=>({name,version:'fixture-v1'})},alertEngine:{process:async()=>{calls.push('alert')}}};
          await assert.rejects(sandbox.module.exports[entry](deps,{id:source,game_id:game,community_id:community,platform:'fixture'},[{change:'inserted',content:{id:'qa'},raw:{title:'qa',body:'qa',fingerprint:'qa'}}]),{code:'ANALYSIS_LEASE_FENCE_REQUIRED'});
          assert.deepEqual(calls.filter(name=>name!=='configured'),[]);assert(calls.filter(name=>name==='configured').length<=1);result.checks.push('worker_'+entry+'_missing_'+missing+'_no_fallback');
        }
      }
    }
    async function waitForLock(label,waitingId,blockingId,table){for(let i=0;i<100;i++){const[rows]=await control.query('SELECT w.requesting_trx_id,w.blocking_trx_id,r.trx_mysql_thread_id AS waiting_connection,b.trx_mysql_thread_id AS blocking_connection FROM information_schema.INNODB_LOCK_WAITS w JOIN information_schema.INNODB_TRX r ON r.trx_id=w.requesting_trx_id JOIN information_schema.INNODB_TRX b ON b.trx_id=w.blocking_trx_id');if(rows.some(x=>Number(x.waiting_connection)===Number(waitingId)&&Number(x.blocking_connection)===Number(blockingId))){result.lockEvidence.push({label,source:'INNODB_LOCK_WAITS',waitingId,blockingId,table});return;}const[eng]=await control.query('SHOW ENGINE INNODB STATUS');const txt=eng[0].Status,blocks=txt.split(/---TRANSACTION /);const waiter=blocks.find(b=>b.includes(`MySQL thread id ${waitingId},`)&&b.includes('LOCK WAIT')&&b.includes('lock_mode X')&&b.includes('waiting')&&b.includes('`'+database+'`.`'+table+'`'));const blocker=blocks.find(b=>b.includes(`MySQL thread id ${blockingId},`)&&/[1-9]\d* row lock\(s\)/.test(b));if(waiter&&blocker){fs.writeFileSync(path.join(directory,label+'.engine.txt'),txt);result.lockEvidence.push({label,source:'SHOW ENGINE INNODB STATUS',waitingId,blockingId,table});return}await pause(40)}throw new Error('no actual lock wait '+label)}
    // Consumer owns content+job through its result transaction; real API force waits
    // and then sees completed state, requeues without being overwritten by finish.
    {const f=await fixture(consumer,{status:'pending'});await control.query("UPDATE po_analysis_jobs SET attempts=0,next_retry_at=NULL,error_code=NULL,error_message=NULL,completed_at=NULL WHERE id=?",[f.job.id]);const[claim]=await consumer.claimAnalysisJobs({profile:'light',version:'fixture-v1',leaseOwner:'fixture-consumer',leaseSeconds:180,contentIds:[f.content],limit:1});assert(claim);const snapshot=await consumer.freezeLeasedAnalysisSnapshot(claim);assert(snapshot);const reached=deferred(),resume=deferred(),producerConnected=deferred();const getC=consumer.pool.getConnection.bind(consumer.pool),getA=api.pool.getConnection.bind(api.pool);let wrapped;
      consumer.pool.getConnection=async()=>{const c=await getC(),query=c.query.bind(c);wrapped=c;c.query=async(sql,args)=>{const ret=await query(sql,args);if(sql.startsWith('INSERT INTO po_audit_events')&&args?.includes('analysis_lease_result_committed')){reached.resolve();await resume.promise}return ret};return c};
      api.pool.getConnection=async()=>{const c=await getA();producerConnected.resolve(c.threadId);return c};
      const input={sentiment:'neutral',severity:'normal',negativeScore:0,confidence:.7,qualityScore:.9,analysisLevel:'light',analysisVersion:'fixture-v1',contentFingerprint:f.fp,modelName:'fixture',summary:'fixture'};const pending=consumer.commitLeasedAnalysisSnapshot(snapshot,input,{runId:'fixture'});pending.catch(()=>{});let forced;
      try{await Promise.race([reached.promise,pending.then(()=>{throw new Error('pause not reached')})]);forced=request(f);forced.catch(()=>{});await waitForLock('consumer_then_actual_api_force',await producerConnected.promise,wrapped.threadId,'po_contents');const s=await state(f);assert.equal(s.analyses.length,0);assert.equal(s.jobs[0].status,'running');}
      finally{resume.resolve();consumer.pool.getConnection=getC;api.pool.getConnection=getA}
      assert.equal((await pending).committed,true);const response=await forced;assert.equal(response.status,202);const after=await state(f);assert.equal(after.analyses.length,1);assert.equal(after.jobs[0].status,'pending');assert.equal(after.jobs[0].trigger_reason,'manual_reanalysis');assert.equal(after.jobs[0].lease_owner,null);if(wrapped)delete wrapped.query;result.checks.push('real_consumer_commit_then_http_force_waits_content_lock_and_force_survives');
    }
    // Outer producer owns content+job while safe force waits. Both actual helper
    // calls serialize, and the later force marker/keywords win after commit.
    {const f=await fixture(shared,{status:'completed'});await connection.beginTransaction();await shared.enqueueAnalysisJob(f.content,{...force(f),triggerReason:'first_force',matchedKeywords:['first']},connection);const connected=deferred(),get=api.pool.getConnection.bind(api.pool);api.pool.getConnection=async()=>{const c=await get();connected.resolve(c.threadId);return c};const pending=api.enqueueAnalysisJob(f.content,{...force(f),triggerReason:'later_force',matchedKeywords:['later']});pending.catch(()=>{});try{await waitForLock('shared_then_actual_api_force',await connected.promise,connection.threadId,'po_contents');}finally{api.pool.getConnection=get;await connection.commit()}const written=await pending;assert.equal(written.trigger_reason,'later_force');assert.deepEqual(JSON.parse(written.matched_keywords),['later']);assert.equal((await state(f)).jobs[0].trigger_reason,'later_force');result.checks.push('real_two_producers_content_job_lock_order_later_force_survives');}
    assert.equal(verifyHashes(),verifiedFiles);result.candidateHashesAfter='unchanged';result.status='PASS_INDEPENDENT_ISOLATED_AFFECTED_SCOPE';
  }catch(error){result.error=error.code||error.message;result.message=error.message;result.stack=error.stack?.split('\n').slice(1,5).join('\n');process.exitCode=1}
  finally{
    if(apiApp?.server.listening)await new Promise(r=>apiApp.server.close(r));
    if(connection){await connection.rollback().catch(()=>{});await connection.end().catch(()=>{})}
    if(consumer)await consumer.releaseAdvisoryLock('po-analysis-consumer').catch(()=>{});
    for(const repo of[api,shared,consumer])if(repo)await repo.pool.end().catch(()=>{});
    if(control){try{if(server&&await owns()){result.identityBeforeShutdown=true;await control.query('SHUTDOWN')}else result.identityLost=true}catch(e){result.shutdownError=e.code||e.message}await control.end().catch(()=>{})}
    for(let i=0;i<100&&!closed;i++)await pause(200);result.serverStopped=closed;try{await freePort(port);result.portReleased=true}catch{result.portReleased=false}
    if(result.httpPort){try{await freePort(result.httpPort);result.httpPortReleased=true}catch{result.httpPortReleased=false}}
    if(!closed||!result.portReleased||result.shutdownError||result.identityLost||result.httpPortReleased===false){result.status='FAIL';process.exitCode=1}
    fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }
}
main().catch(e=>{console.error(e.stack||e.code||e.message);process.exitCode=1});
