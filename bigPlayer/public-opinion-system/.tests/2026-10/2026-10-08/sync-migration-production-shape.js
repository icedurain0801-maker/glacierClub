'use strict';
// Only an owned, freshly initialized MariaDB process is writable. Input is schema, never production data.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const mysql=require('mysql2/promise');
const project=path.resolve(__dirname,'../../..');
require(path.join(project,'server/src/runtimeEnv')).loadRuntimeEnv=()=>false;
const {runMigrations}=require(path.join(project,'server/src/db/migrate'));
const {Repository}=require(path.join(project,'server/src/db/repository'));
const {bigPlayerBoardSchemaReady}=require(path.join(project,'shared/bigPlayerBoardSchema'));
const {syncStage,enqueueDailyAnalysis}=require(path.join(project,'worker/src/worker'));
const port=43308,serverId=20261009,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const input=process.argv[2];if(!input)throw Error('Pass non-sensitive production-schema-baseline.json');
const baseline=JSON.parse(fs.readFileSync(input));
const m29='029_bigplayer_site_run_evidence.sql',m30='030_bigplayer_board_scope.sql';
const sql30=fs.readFileSync(path.join(project,'migrations',m30),'utf8');
const statements=sql30.replace(/--[^\r\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
const envFor=db=>({DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:db});
async function main(){
  const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(port,'127.0.0.1',resolve));await new Promise(r=>probe.close(r));
  const base=path.resolve(project,'../../.temp/po-closeout-20261008');fs.mkdirSync(base,{recursive:true});
  const fixture=fs.mkdtempSync(path.join(base,'migration-shape-')),data=path.join(fixture,'data');
  const initLog=fs.openSync(path.join(fixture,'init.log'),'w');
  await new Promise((resolve,reject)=>{const child=spawn('C:/xampp/mysql/bin/mysql_install_db.exe',[`--datadir=${data}`,`--port=${port}`],{windowsHide:true,stdio:['ignore',initLog,initLog]});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('init failed')));});fs.closeSync(initLog);
  const log=fs.openSync(path.join(fixture,'server.log'),'w');
  const child=spawn('C:/xampp/mysql/bin/mysqld.exe',['--no-defaults','--basedir=C:/xampp/mysql',`--datadir=${data}`,'--bind-address=127.0.0.1',`--port=${port}`,`--server-id=${serverId}`,'--skip-log-bin'],{windowsHide:true,stdio:['ignore',log,log]});
  const exited=new Promise(resolve=>child.once('exit',resolve));let conn;let identityVerified=false;const repositories=[];
  try{
    for(let i=0;i<100;i++){try{conn=await mysql.createConnection({host:'127.0.0.1',port,user:'root',multipleStatements:true,dateStrings:true});break;}catch{if(child.exitCode!==null)throw Error('DB exited');await sleep(100);}}
    assert.ok(conn);const [[identity]]=await conn.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir');assert.equal(identity.port,port);assert.equal(identity.serverId,serverId);assert.equal(path.resolve(identity.datadir).toLowerCase(),data.toLowerCase());console.log('ISOLATED_IDENTITY',JSON.stringify({fixture,...identity}));
    identityVerified=true;
    async function clone(db){
      assert.match(db,/^migration_qa_[a-z0-9_]+$/);await conn.query('CREATE DATABASE `'+db+'`');
      // COM_CHANGE_USER clears mysql2 prepared statements bound to the previous schema.
      await conn.changeUser({database:db});
      assert.equal((await conn.query('SELECT DATABASE() AS db'))[0][0].db,db);
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      for(const row of baseline.schema){assert.match(row.table,/^po_[a-z0-9_]+$/);assert.ok(row.sql.startsWith('CREATE TABLE `'+row.table+'`'));await conn.query(row.sql);}
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
      for(const version of baseline.ledger)await conn.execute('INSERT INTO po_schema_migrations(version) VALUES (?)',[version]);
      for(const [g,c,region] of [['game-o','community-o','overseas'],['game-d','community-d','domestic']]){
        await conn.execute('INSERT INTO po_games(id,name,kind,enabled,identifiers,region_code) VALUES (?,?,\'owned\',1,\'{}\',?)',[g,g,region]);
        await conn.execute('INSERT INTO po_communities(id,game_id,name,status,sort_order) VALUES (?,?,?,\'enabled\',0)',[c,g,c]);
      }
      for(const [s,g,c,platform,board]of [['source-o','game-o','community-o','bigplayer_h5','100017'],['source-d','game-d','community-d','bigplayer_h5','2'],['source-discord','game-o','community-o','discord',null]]){
        await conn.execute('INSERT INTO po_sources(id,game_id,community_id,platform,source_type,display_name,enabled,frequency_seconds,config,auth_status,default_account_id) VALUES (?,?,?,?,\'owned_community\',?,1,21600,?,\'authorized\',?)',[s,g,c,platform,s,JSON.stringify({boardId:board,baseUrl:platform==='bigplayer_h5'?'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS':'https://discord.com'}),'account-'+s]);
        await conn.execute('INSERT INTO po_accounts(id,game_id,community_id,source_id,platform,platform_account_id,account_name,metadata,enabled,auth_status) VALUES (?,?,?,?,?,?,?,\'{}\',1,\'authorized\')',['account-'+s,g,c,s,platform,s,s]);
        await conn.execute('INSERT INTO po_credentials(id,source_id,account_id,credential_type,secret_ref,secret_cipher,status) VALUES (?,?,?,\'api_token\',\'fixture\',\'fixture-not-a-real-secret\',\'active\')',['credential-'+s,s,'account-'+s]);
        await conn.execute('INSERT INTO po_source_schedule_state(source_id,effective_at) VALUES (?,UTC_TIMESTAMP(3))',[s]);
        await conn.execute('INSERT INTO po_contents(id,game_id,community_id,source_id,external_id,content_type,body,source_url,engagement,fingerprint) VALUES (?,?,?,?,\'same-external\',\'post\',\'preserve-fixture\',\'https://fixture.invalid\',\'{}\',?)',['content-'+s,g,c,s,'fingerprint-'+s]);
      }
      return db;
    }
    const migrate=(db,file)=>runMigrations({env:envFor(db),only:file,logger:{log(){}}});
    const db=await clone('migration_qa_main');const repo=new Repository(envFor(db));repositories.push(repo);
    const original=(await conn.query('SELECT id,body,fingerprint,external_id FROM po_contents ORDER BY id'))[0];
    await assert.rejects(()=>repo.enqueueManualSourceSync({sourceId:'source-o'}),e=>e.code==='UNIFIED_SCHEDULER_SCHEMA_NOT_READY');
    await assert.rejects(()=>migrate(db,m30),e=>e.code==='BOARD_MIGRATION_CONTRACT_NOT_READY');
    await migrate(db,m29);await migrate(db,m29);
    await assert.rejects(()=>repo.enqueueManualSourceSync({sourceId:'source-o'}),e=>e.code==='UNIFIED_SCHEDULER_SCHEMA_NOT_READY');
    await migrate(db,m30);await migrate(db,m30);assert.equal(await bigPlayerBoardSchemaReady(conn),true);
    assert.deepEqual((await conn.query('SELECT id,body,fingerprint,external_id FROM po_contents ORDER BY id'))[0],original);
    const admitted=await repo.enqueueManualSourceSync({sourceId:'source-o'});assert.equal(admitted.run.source_id,'source-o');assert.equal(String(admitted.run.board_id),'100017');
    const [runs]=await conn.query('SELECT source_id,board_id,community_id FROM po_sync_runs');assert.equal(runs.length,1);assert.equal(runs[0].community_id,'community-o');
    console.log('PASS missing-schema admission rejects, explicit 029 then 030, repeat skip validates, target-only source/board admission, legacy rows preserved');
    for(let stop=1;stop<=statements.length;stop++){
      const name=await clone('migration_qa_stop_'+stop);await migrate(name,m29);
      for(let i=0;i<stop;i++){
        await conn.query(statements[i]);
        const [[row]]=await conn.query("SELECT COUNT(DISTINCT index_name) AS n FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_contents' AND non_unique=0 AND index_name IN ('po_contents_source_external_uk','po_contents_source_board_external_uk')");assert.ok(row.n>=1,'unique identity never absent');
      }
      await migrate(name,m30);await migrate(name,m30);assert.equal(await bigPlayerBoardSchemaReady(conn),true);
      assert.deepEqual((await conn.query('SELECT id,body,fingerprint,external_id FROM po_contents ORDER BY id'))[0],original);
    }
    console.log('PASS every 030 statement interruption replay; at least one external identity unique index always retained');
    const statements29=fs.readFileSync(path.join(project,'migrations',m29),'utf8').replace(/--[^\r\n]*/g,'').split(';').map(x=>x.trim()).filter(Boolean);
    for(let stop=1;stop<=statements29.length;stop++){
      const name=await clone('migration_qa_29_stop_'+stop);
      for(let i=0;i<stop;i++)await conn.query(statements29[i]);
      await migrate(name,m29);await migrate(name,m29);
      assert.deepEqual((await conn.query('SELECT id,body,fingerprint,external_id FROM po_contents ORDER BY id'))[0],original);
    }
    for(const [suffix,file,ddl] of [
      ['bad_time',m29,'ALTER TABLE po_sync_runs ADD last_request_at VARCHAR(20) NULL'],
      ['generated_snapshot',m29,"ALTER TABLE po_sync_runs ADD site_url_snapshot TEXT AS ('fixed-url') VIRTUAL"],
      ['bad_board',m30,'ALTER TABLE po_contents ADD board_id VARCHAR(16) NULL'],
      ['bad_default',m30,"ALTER TABLE po_contents ADD board_id VARCHAR(32) NULL DEFAULT 'wrong-board'"],
      ['bad_generated',m30,"ALTER TABLE po_contents ADD board_id VARCHAR(32) NULL, ADD board_key VARCHAR(32) AS (COALESCE(board_id,'wrong')) PERSISTENT"]
    ]){
      const name=await clone('migration_qa_'+suffix);if(file===m30)await migrate(name,m29);
      await conn.query(ddl);await assert.rejects(()=>migrate(name,file),e=>e.code==='BOARD_MIGRATION_CONTRACT_NOT_READY');
      assert.equal((await conn.execute('SELECT COUNT(*) AS n FROM po_schema_migrations WHERE version=?',[file]))[0][0].n,0);
    }
    console.log('PASS every 029 interruption replay; malformed columns/generated expression reject without ledger');
    const locked=await clone('migration_qa_lock');
    const blocker=await mysql.createConnection({host:'127.0.0.1',port,user:'root',database:locked});
    try{
      await blocker.beginTransaction();await blocker.query('SELECT id FROM po_sync_runs LIMIT 1');
      const started=Date.now();await assert.rejects(()=>migrate(locked,m29),e=>e.code==='ER_LOCK_WAIT_TIMEOUT');
      console.log('LOCK_WAIT_TIMEOUT_MS',Date.now()-started);
      assert.equal((await conn.execute('SELECT COUNT(*) AS n FROM po_schema_migrations WHERE version=?',[m29]))[0][0].n,0);
    }finally{await blocker.rollback();await blocker.end();}
    await migrate(locked,m29);
    console.log('PASS metadata lock timeout leaves no ledger; retry after lock release succeeds');
    const wrong=await clone('migration_qa_wrong_index');await migrate(wrong,m29);
    await conn.query('ALTER TABLE po_contents ADD INDEX po_contents_source_board_external_uk(external_id)');
    await assert.rejects(()=>migrate(wrong,m30),e=>e.code==='BOARD_MIGRATION_CONTRACT_NOT_READY');
    const [[old]]=await conn.query("SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='po_contents' AND index_name='po_contents_source_external_uk'");assert.ok(old.n>0);
    console.log('PASS same-name malformed index blocks before removing legacy protection');
    await conn.changeUser({database:db});
    const source={id:'source-o',game_id:'game-o',community_id:'community-o',platform:'bigplayer_h5',region_code:'overseas',config:{boardId:'100017'}};
    let fetches=0;
    const claimed=await repo.claimSyncRun({runId:admitted.run.id,leaseOwner:'isolated-worker',leaseSeconds:30});assert.ok(claimed);
    const [[account]]=await conn.query("SELECT * FROM po_accounts WHERE id='account-source-o'");
    const stage=await syncStage({repo,credentialContext:{},leaseOwner:claimed.lease_owner,leaseSeconds:30,pageBudget:1,pageSize:20},{source,account,scope:'posts',syncMode:'incremental',syncRunId:admitted.run.id,connector:{async listPosts(input){
      assert.equal(input.source.id,'source-o');assert.equal(input.source.config.boardId,'100017');fetches++;
      return {items:[{externalId:'worker-fixture',contentType:'post',body:'isolated worker fixture',sourceUrl:'https://fixture.invalid/post',publishedAt:'2026-10-08T00:00:00Z'}],nextCursor:null,hasMore:false};
    }}});
    assert.equal(fetches,1);assert.equal(stage.completed,true);assert.equal(stage.stored,1);
    const [[stored]]=await conn.query("SELECT c.id,c.source_id,c.board_id,r.run_id FROM po_contents c JOIN po_sync_run_contents r ON r.content_id=c.id WHERE c.external_id='worker-fixture'");
    assert.equal(stored.source_id,'source-o');assert.equal(stored.board_id,'100017');assert.equal(stored.run_id,admitted.run.id);
    const queued=await enqueueDailyAnalysis({repo,ai:{configured(){return true;},selectProfile(){return {version:'fixture-v1'};}}},source,stage.entries);
    assert.equal(queued.enqueued,1);
    assert.equal((await conn.execute('SELECT COUNT(*) AS n FROM po_analysis_jobs WHERE content_id=?',[stored.id]))[0][0].n,1);
    assert.equal((await conn.query("SELECT COUNT(*) AS n FROM po_contents WHERE source_id IN ('source-d','source-discord')"))[0][0].n,2);
    console.log('PASS real Worker syncStage and Repository persist exact source/board; AI job persists with fake provider; domestic/Discord fixtures unchanged (no external API calls)');
    for(const board of ['2','3'])await conn.execute("INSERT INTO po_contents(id,game_id,community_id,source_id,external_id,content_type,body,source_url,engagement,fingerprint,board_id) VALUES (?, 'game-o','community-o','source-o','same-external','post','same-body','https://fixture.invalid','{}','same-body',?)",['board-'+board,board]);
    await assert.rejects(()=>conn.query('ALTER TABLE po_contents ADD UNIQUE KEY po_contents_source_external_uk(source_id,external_id)'),e=>e.code==='ER_DUP_ENTRY');
    await assert.rejects(()=>conn.query("INSERT INTO po_contents(id,game_id,source_id,external_id,content_type,body,source_url,engagement,fingerprint,board_id) VALUES ('duplicate','game-o','source-o','same-external','post','x','https://fixture.invalid','{}','x','2')"),e=>e.code==='ER_DUP_ENTRY');
    await conn.query('ALTER TABLE po_sync_runs DROP INDEX po_sync_runs_site_request_idx');
    await assert.rejects(()=>migrate(db,m29),e=>e.code==='BOARD_MIGRATION_CONTRACT_NOT_READY');
    console.log('PASS board same-external isolation, duplicate same-board rejects, destructive down-index fails without deleting data, forged ledger does not bypass schema validation');
    fs.writeFileSync(path.join(fixture,'PASS.json'),JSON.stringify({status:'PASS',identity,baselineTables:baseline.schema.length,interruptionPoints:statements.length,targetRunId:admitted.run.id},null,2));
  }finally{
    for(const repo of repositories)await repo.pool.end();
    if(conn){if(identityVerified){try{await conn.query('SHUTDOWN');}catch{}}await conn.end().catch(()=>{});}
    if(child.exitCode===null){await Promise.race([exited,sleep(3000)]);if(child.exitCode===null)child.kill();}await exited;fs.closeSync(log);console.log('OWNED_ISOLATED_DB_STOPPED',fixture);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
