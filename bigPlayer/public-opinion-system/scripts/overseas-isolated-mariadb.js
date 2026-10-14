'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process'),mysql=require('mysql2/promise');
const {Repository}=require('../server/src/db/repository');
const {createOverseasManualReceipt}=require('../worker/src/overseasManualReceipt');
const {recoverManualFirstRunBindings}=require('../worker/src/overseasManualFirstClaimRecovery');
const port=13316,serverId=20261036,bin='C:/xampp/mysql/bin',database='po_overseas_fixture';
const root=path.resolve(__dirname,'../../..'),temp=path.join(root,'.temp');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fail=code=>{throw Object.assign(Error(code),{code});};
const assert=(value,code)=>{if(!value)fail(code);};
function safeDirectory(directory){const stat=fs.lstatSync(directory);assert(stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(directory)===directory,'ISOLATED_DIRECTORY_MISMATCH');}
async function freePort(){const s=net.createServer();await new Promise((r,j)=>s.once('error',j).listen(port,'127.0.0.1',r));await new Promise(r=>s.close(r));}
async function connect(db){return mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',...(db?{database:db}:{}),dateStrings:true,timezone:'Z',connectTimeout:2000});}
async function main(){
 const certifiedModes={'--isolated-certified-cursor':'certified-cursor','--isolated-certified-cursor-ack-unknown':'certified-cursor-ack-unknown','--isolated-certified-cursor-partial':'certified-cursor-partial','--isolated-certified-next-slot':'certified-next-slot'};
 certifiedModes['--isolated-certified-next-slot-execution']='certified-next-slot-execution';
 const terminalModes={'--isolated-parent-all-failed':'all-failed','--isolated-parent-terminal-reproduction':'terminal-reproduction','--isolated-parent-terminal-fields':'terminal-fields'};
 terminalModes['--isolated-parent-historical-race']='historical-ancestor-race';
 const translationBudgetModes=['--isolated-translation-call-budget','--isolated-translation-budget-reproduction'];
 translationBudgetModes.push('--isolated-manual-audit-regression');
 translationBudgetModes.push('--isolated-accounting-used-reproduction','--isolated-accounting-delete-reproduction');
 translationBudgetModes.push('--isolated-call-accounting');
 if(process.argv.length!==3||!['--isolated','--scheduled-isolated','--scheduled-mainchain','--scheduled-budget','--scheduled-transport-error','--scheduled-inspection','--scheduled-budget20','--scheduled-second-page-error','--isolated-call-budget',...translationBudgetModes,'--isolated-parent','--isolated-parent-partial','--isolated-parent-ack-unknown','--isolated-parent-nonempty','--isolated-parent-unsealed','--isolated-parent-failed','--isolated-parent-manual','--isolated-parent-integrity','--isolated-ancestor-locks','--isolated-parent-comment-chain','--isolated-parent-historical-chain',...Object.keys(certifiedModes),...Object.keys(terminalModes)].includes(process.argv[2]))fail('ISOLATED_ONLY');
 const scheduledOnly=process.argv[2]!=='--isolated';
 safeDirectory(root);safeDirectory(temp);
 const installerText=fs.readFileSync(path.join(bin,'mysql_install_db.exe')).toString('latin1');
 assert(installerText.includes('--no-defaults %s --innodb-page-size=%d --bootstrap'),'INSTALLER_DEFAULTS_UNVERIFIED');
 await freePort();const space=fs.statfsSync(temp);assert(space.bavail*space.bsize>4*1024**3,'ISOLATED_SPACE_LOW');
 const directory=fs.mkdtempSync(path.join(temp,'overseas-real-db-')),dataDir=path.join(directory,'data'),pidFile=path.join(directory,'mysqld.pid');
 assert(fs.realpathSync(directory)===directory&&path.dirname(directory)===temp,'ISOLATED_DIRECTORY_MISMATCH');
 for(const file of [dataDir,pidFile,path.join(directory,'server.log')])assert(path.dirname(file)===directory,'ISOLATED_PATH_ESCAPE');
 let server,control,pool,closed=false,startError;const result={status:'NO_GO',productionTouched:false,port,serverId,directory,checks:[],serverStopped:false,initializerNoDefaultsBootstrapStringVerified:true};
 async function owns(){const [[r]]=await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,@@pid_file AS pidFile,VERSION() AS version');return r.port===port&&r.serverId===serverId&&path.resolve(r.datadir).toLowerCase()===dataDir.toLowerCase()&&path.resolve(r.pidFile).toLowerCase()===pidFile.toLowerCase()&&Number(fs.readFileSync(pidFile,'utf8').trim())===server.pid&&r.version==='10.4.14-MariaDB';}
 try{
  const init=spawnSync(path.join(bin,'mysql_install_db.exe'),[`--datadir=${dataDir}`,`--port=${port}`],{encoding:'utf8',timeout:60000,windowsHide:true,shell:false,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:`C:/Windows/System32;${bin}`}});
  fs.writeFileSync(path.join(directory,'init.stdout'),init.stdout||'',{flag:'wx'});fs.writeFileSync(path.join(directory,'init.stderr'),init.stderr||'',{flag:'wx'});assert(init.status===0,'ISOLATED_INIT_FAILED');
  const log=fs.openSync(path.join(directory,'server.log'),'wx');
  server=spawn(path.join(bin,'mysqld.exe'),['--no-defaults','--basedir=C:/xampp/mysql',`--datadir=${dataDir}`,'--bind-address=127.0.0.1',`--port=${port}`,`--server-id=${serverId}`,`--pid-file=${pidFile}`,'--skip-log-bin','--event-scheduler=OFF','--innodb-buffer-pool-size=64M','--max-connections=10','--max-allowed-packet=16M'],{windowsHide:true,shell:false,stdio:['ignore',log,log]});fs.closeSync(log);server.once('close',()=>{closed=true;});
  server.once('error',error=>{startError=error;});
  safeDirectory(dataDir);
  for(let i=0;i<100;i++){assert(!startError,'ISOLATED_SPAWN_FAILED');try{control=await connect();break;}catch{assert(server.exitCode===null,'ISOLATED_SERVER_EXIT');await sleep(200);}}
  assert(control&&await owns(),'ISOLATED_IDENTITY_MISMATCH');result.checks.push('independent_instance_identity');
  await control.query(`CREATE DATABASE ${database}`);await control.changeUser({database});
  const tables=[
   'po_games(id CHAR(36) PRIMARY KEY,region_code VARCHAR(20),enabled INT)',
   'po_communities(id CHAR(36) PRIMARY KEY,game_id CHAR(36),status VARCHAR(30))',
   'po_sources(id CHAR(36) PRIMARY KEY,game_id CHAR(36),community_id CHAR(36),platform VARCHAR(30),config JSON,enabled INT,default_account_id CHAR(36),auth_status VARCHAR(30),auth_expire_at DATETIME(3),collect_requested_at DATETIME)',
   'po_accounts(id CHAR(36) PRIMARY KEY,source_id CHAR(36),game_id CHAR(36),community_id CHAR(36),platform VARCHAR(30),enabled INT,auth_status VARCHAR(30),auth_expire_at DATETIME(3))',
   'po_credentials(id CHAR(36) PRIMARY KEY,source_id CHAR(36),account_id CHAR(36),credential_type VARCHAR(30),status VARCHAR(30),expire_at DATETIME(3),secret_cipher BLOB,updated_at DATETIME(3))',
   'po_source_sites(source_id CHAR(36),site_id VARCHAR(120),url TEXT,url_hash CHAR(64),enabled INT,PRIMARY KEY(source_id,site_id))',
   'po_sync_checkpoints(id CHAR(36) PRIMARY KEY,account_id CHAR(36),site_id VARCHAR(120),task_kind VARCHAR(30),task_key VARCHAR(200),sync_scope VARCHAR(30),root_platform_content_id VARCHAR(100),status VARCHAR(30),window_start VARCHAR(32),window_end VARCHAR(32),last_item_at DATETIME(3),INDEX(account_id,site_id,status))',
   "po_sync_runs(id CHAR(36) PRIMARY KEY,source_id CHAR(36),account_id CHAR(36),site_id VARCHAR(120),parent_run_id CHAR(36),trigger_type VARCHAR(30),status VARCHAR(40),sync_mode VARCHAR(30),scheduled_at DATETIME(3),window_start DATETIME(3),window_end DATETIME(3),started_at DATETIME(3),finished_at DATETIME(3),attempts INT NOT NULL DEFAULT 0,lease_epoch BIGINT NOT NULL DEFAULT 0,lease_owner VARCHAR(160),lease_until DATETIME(3),next_retry_at DATETIME(3),created_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),updated_at DATETIME(3) DEFAULT UTC_TIMESTAMP(3),CHECK(trigger_type='manual' AND scheduled_at IS NULL),INDEX(source_id,status))"
  ];for(const table of tables)await control.query(`CREATE TABLE ${table} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const ids=Array.from({length:5},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`),[sourceId,accountId,gameId,communityId,credentialId]=ids;
  const sites=['site-en','site-fr'].map((siteId,i)=>({siteId,url:`https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=${i+1}`,enabled:true}));
  await control.query('INSERT INTO po_games VALUES (?,\'overseas\',1)',[gameId]);await control.query("INSERT INTO po_communities VALUES (?,?,'enabled')",[communityId,gameId]);
  await control.query("INSERT INTO po_sources VALUES (?,?,?,?,?,1,?,'authorized',NULL,UTC_TIMESTAMP())",[sourceId,gameId,communityId,'bigplayer_h5',JSON.stringify({boardId:'100017',siteUrls:sites}),accountId]);
  await control.query("INSERT INTO po_accounts VALUES (?,?,?,?, 'bigplayer_h5',1,'authorized',NULL)",[accountId,sourceId,gameId,communityId]);
  await control.query("INSERT INTO po_credentials VALUES (?,?,?,'api_token','active',NULL,'synthetic-not-a-token',UTC_TIMESTAMP(3))",[credentialId,sourceId,accountId]);
  for(const s of sites)await control.query('INSERT INTO po_source_sites VALUES (?,?,?,?,1)',[sourceId,s.siteId,s.url,crypto.createHash('sha256').update(s.url).digest('hex')]);
  await require('./overseas-isolated-mainchain').installMainchainSchema(control);
  const user='po_overseas_fixture',password=crypto.randomBytes(24).toString('hex');await control.query(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY ?`,[password]);await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${database}.* TO '${user}'@'127.0.0.1'`);
  pool=mysql.createPool({host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'});
  const repo=Object.create(Repository.prototype);repo.pool=pool;repo.query=async(sql,params=[])=>{const [rows]=await pool.query(sql,params);return rows;};repo.claimDeadlockMaxAttempts=1;
  if(process.argv[2]==='--isolated-ancestor-locks'){
    result.ancestorLocks=await require('./overseas-isolated-ancestor-lock-checks').checkAncestorLocks({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId});
    result.status='PASS_ISOLATED_ANCESTOR_LOCK_PRIMITIVE';return;
  }
  if(process.argv[2]==='--isolated-call-budget'){
    result.callBudget=await require('./overseas-isolated-call-budget-checks').checkCallBudget({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId});
    result.status='PASS_ISOLATED_PERSISTENT_CALL_BUDGET';return;
  }
  if(process.argv[2]==='--isolated-manual-audit-regression'){
    result.manualAudit=await require('./overseas-isolated-manual-audit-checks').checkManualAudit({repo,control,root,directory,serverPid:server.pid,sourceId});
    result.status=result.manualAudit.status;return;
  }
  if(['--isolated-accounting-used-reproduction','--isolated-accounting-delete-reproduction'].includes(process.argv[2])){
    result.accounting=await require('./overseas-isolated-call-accounting-reproduction').reproduceAccounting({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId,deletion:process.argv[2]==='--isolated-accounting-delete-reproduction'});
    result.status=result.accounting.status;return;
  }
  if(process.argv[2]==='--isolated-call-accounting'){
    result.accounting=await require('./overseas-isolated-call-accounting-checks').checkCallAccounting({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId});result.status=result.accounting.status;return;
  }
  if(translationBudgetModes.includes(process.argv[2])){
    result.translationCallBudget=await require('./overseas-isolated-translation-budget-checks').checkTranslationCallBudget({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId,reproduction:process.argv[2]==='--isolated-translation-budget-reproduction'});
    result.status=result.translationCallBudget.status;return;
  }
  if(scheduledOnly){
    result.scheduled=await require('./overseas-isolated-scheduled-checks').checkScheduledAdmission({repo,control,root,directory,serverPid:server.pid,sourceId,accountId,gameId,communityId,sites,
      parentOnly:certifiedModes[process.argv[2]]||terminalModes[process.argv[2]]||({'--isolated-parent':true,'--isolated-parent-partial':'partial','--isolated-parent-ack-unknown':'ack-unknown','--isolated-parent-nonempty':'nonempty','--isolated-parent-unsealed':'unsealed','--isolated-parent-failed':'failed','--isolated-parent-manual':'manual','--isolated-parent-integrity':'integrity','--isolated-parent-comment-chain':'comment-chain','--isolated-parent-historical-chain':'historical-chain'})[process.argv[2]]||false,inspection:process.argv[2]==='--scheduled-inspection',mainchain:!['--scheduled-isolated','--scheduled-inspection'].includes(process.argv[2]),scenario:({'--scheduled-budget':'budget','--scheduled-transport-error':'transport-error','--scheduled-budget20':'budget20','--scheduled-second-page-error':'second-page-error'})[process.argv[2]]||'success'});
    result.checks.push('scheduled_admission_schema_before_write_and_atomic_failure_matrix');
    result.status='PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL';return;
  }
  const receiptDir=path.join(directory,'receipts');fs.mkdirSync(receiptDir);const receipt=await createOverseasManualReceipt({repositoryRoot:root,directory:receiptDir});
  const [[marker]]=await control.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[sourceId]);
  const request=await receipt.prepare({repo,sourceId,expectedMarker:marker.value,manifestSha256:'a'.repeat(64)});result.checks.push('actual_db_anchor_cursor_prepare');
  // Real SQL partial insert followed by injected client exception must roll back.
  const rollbackRepo=Object.create(Repository.prototype);rollbackRepo.pool={getConnection:async()=>{const c=await pool.getConnection();return {beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),async query(sql,params){if(sql.startsWith('INSERT INTO po_sync_runs')&&params[3]==='site-fr')fail('INJECTED_SECOND_SITE');return c.query(sql,params);}};}};
  try{await rollbackRepo.handoffOverseasManualMarker({request,receipt});fail('ROLLBACK_NOT_TESTED');}catch(e){assert(e.code==='INJECTED_SECOND_SITE','ROLLBACK_WRONG_ERROR');}
  assert((await repo.reconcileOverseasManualMarker({request,receipt})).status==='not_committed','REAL_ROLLBACK_FAILED');result.checks.push('real_innodb_multisite_rollback');
  const results=await Promise.all([repo.handoffOverseasManualMarker({request,receipt}),repo.handoffOverseasManualMarker({request,receipt})]);assert(results.filter(r=>r.status==='accepted').length===1&&results.filter(r=>r.status==='already_accepted').length===1,'CONCURRENT_HANDOFF_FAILED');result.checks.push('real_source_lock_concurrent_single_set');
  // New Node process reads real receipt and queries only the independent DB.
  const childCode=`const fs=require('node:fs'),mysql=require(${JSON.stringify(require.resolve('mysql2/promise'))});const {Repository}=require(${JSON.stringify(require.resolve('../server/src/db/repository'))});const {createOverseasManualReceipt}=require(${JSON.stringify(require.resolve('../worker/src/overseasManualReceipt'))});const {recoverManualFirstRunBindings}=require(${JSON.stringify(require.resolve('../worker/src/overseasManualFirstClaimRecovery'))});(async()=>{const c=JSON.parse(fs.readFileSync(0,'utf8'));const pool=mysql.createPool(c.db);try{const [[identity]]=await pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir');if(identity.port!==c.db.port||identity.serverId!==c.serverId)throw Error('identity');const repo=Object.create(Repository.prototype);repo.pool=pool;const receipt=await createOverseasManualReceipt(c.receipt);const bindings=await recoverManualFirstRunBindings({repo,receipt,requestIds:[c.requestId],manifestSha256:'a'.repeat(64)});process.stdout.write(JSON.stringify({scopes:bindings.length}));}finally{await pool.end();}})().catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1;});`;
  const child=spawnSync(process.execPath,['-e',childCode.replace("identity.serverId!==c.serverId)","identity.serverId!==c.serverId||require('node:path').resolve(identity.datadir).toLowerCase()!==c.dataDir.toLowerCase())")],{encoding:'utf8',windowsHide:true,timeout:15000,input:JSON.stringify({db:{host:'127.0.0.1',port,user,password,database,connectionLimit:1,dateStrings:true,timezone:'Z'},serverId,dataDir,receipt:{repositoryRoot:root,directory:receiptDir},requestId:request.requestId})});
  assert(child.status===0&&JSON.parse(child.stdout).scopes===2,'NEW_PROCESS_RECOVERY_FAILED');result.checks.push('new_node_real_sql_scope_recovery');
  const execution=spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{encoding:'utf8',windowsHide:true,shell:false,timeout:30000,
   input:JSON.stringify({db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir},requestId:request.requestId})});
  if(execution.status!==0){result.childErrorCode=/^[A-Z0-9_]+\s*$/.test(execution.stderr||'')?execution.stderr.trim():'ISOLATED_CHILD_FAILED';fail('NEW_PROCESS_MAINCHAIN_FAILED');}result.mainchain=JSON.parse(execution.stdout);
  assert(result.mainchain.actualRunSourceExecuted===true&&result.mainchain.stored===1,'NEW_PROCESS_MAINCHAIN_FAILED');result.checks.push('new_node_actual_run_source_page_jobs_terminal_real_sql');
  const progress=spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{encoding:'utf8',windowsHide:true,shell:false,timeout:30000,
   input:JSON.stringify({mode:'progress',db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir},requestId:request.requestId})});
  if(progress.status!==0){result.childErrorCode=/^[A-Z0-9_]+\s*$/.test(progress.stderr||'')?progress.stderr.trim():'ISOLATED_CHILD_FAILED';fail('NEW_PROCESS_PROGRESS_FAILED');}
  result.progress=JSON.parse(progress.stdout);assert(result.progress.allCompleted===true&&result.progress.firstContentJobsUnchanged===true,'NEW_PROCESS_PROGRESS_FAILED');
  result.checks.push('two_site_actual_progress_recovery_and_all_completed_no_side_effect');
  // Separate fresh marker/request: actual server commits, then client loses ACK.
  await control.query('UPDATE po_sources SET collect_requested_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL -1 SECOND) WHERE id=?',[sourceId]);
  await control.query("UPDATE po_sync_runs SET status='completed_full',lease_owner=NULL,lease_until=NULL,finished_at=UTC_TIMESTAMP(3)");
  const [[m2]]=await control.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[sourceId]);const request2=await receipt.prepare({repo,sourceId,expectedMarker:m2.value,manifestSha256:'a'.repeat(64)});
  const unknownRepo=Object.create(Repository.prototype);unknownRepo.pool={getConnection:async()=>{const c=await pool.getConnection();return {beginTransaction:()=>c.beginTransaction(),query:(sql,params)=>c.query(sql,params),async commit(){await c.commit();throw Error('synthetic-ack-loss');},rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy()};}};
  try{await unknownRepo.handoffOverseasManualMarker({request:request2,receipt});fail('UNKNOWN_NOT_TESTED');}catch(e){assert(e.code==='OVERSEAS_MANUAL_HANDOFF_COMMIT_UNKNOWN','UNKNOWN_WRONG_ERROR');}
  assert((await repo.reconcileOverseasManualMarker({request:request2,receipt})).status==='accepted','COMMIT_UNKNOWN_RECONCILE_FAILED');result.checks.push('real_commit_then_ack_loss_readonly_reconcile');
  const unclaimed=request2.bindings.find(b=>b.siteId==='site-fr');
  const claims=await Promise.all([repo.claimSyncRun({runId:unclaimed.runId,leaseOwner:'isolated-a'}),repo.claimSyncRun({runId:unclaimed.runId,leaseOwner:'isolated-b'})]);assert(claims.filter(Boolean).length===1,'REAL_CLAIM_CAS_FAILED');const won=claims.find(Boolean);assert(won.attempts===1&&won.lease_epoch===1,'REAL_CLAIM_EPOCH_FAILED');assert(await repo.renewSyncRunLease(won.id,won.lease_owner,30,1),'REAL_RENEW_FAILED');assert(!await repo.renewSyncRunLease(won.id,'other',30,1),'STALE_OWNER_RENEWED');result.checks.push('real_claim_cas_epoch_and_owner_renew');
  result.reclaim=await require('./overseas-isolated-reclaim-checks').checkReclaim({repo,receipt,request:request2,won,root,directory,
   childConfig:{db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir}}});
  result.checks.push('real_exact_reclaim_intent_epoch2_journal_old_owner_fencing');
  result.pageCrashes=await require('./overseas-isolated-page-crash-checks').checkPageCrashes({repo,receipt,root,directory,sourceId,
   childConfig:{db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir}}});
  result.checks.push('actual_owned_client_page_before_after_commit_interrupt_resume');
  await control.query('UPDATE po_sources SET collect_requested_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL -12 SECOND) WHERE id=?',[sourceId]);
  const [[ledgerMarker]]=await control.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[sourceId]);
  const ledgerRequest=await receipt.prepare({repo,sourceId,expectedMarker:ledgerMarker.value,manifestSha256:'a'.repeat(64)});
  await repo.handoffOverseasManualMarker({request:ledgerRequest,receipt});
  const ledgerChild=spawnSync(process.execPath,[path.join(__dirname,'overseas-isolated-mainchain.js'),'--isolated-child'],{encoding:'utf8',windowsHide:true,shell:false,timeout:30000,
   input:JSON.stringify({ledger:true,ledgerComments:true,db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir},requestId:ledgerRequest.requestId})});
  if(ledgerChild.status!==0){result.childErrorCode=/^[A-Z0-9_]+\s*$/.test(ledgerChild.stderr||'')?ledgerChild.stderr.trim():'ISOLATED_CHILD_FAILED';fail('NEW_LEDGER_MAINCHAIN_FAILED');}
  result.ledger=JSON.parse(ledgerChild.stdout);result.checks.push('actual_ledger_bound_audit_mainchain');
  assert(result.ledger.ledgerComments===true&&result.ledger.dynamicReplyExecuted===true&&result.ledger.leaseEpoch===1&&result.ledger.stored===4,'NEW_LEDGER_DYNAMIC_REPLY_NOT_PROVEN');
  result.checks.push('actual_epoch1_comment_inline_and_dynamic_reply_ledger_audit');
  for(const b of ledgerRequest.bindings)await repo.query("UPDATE po_sync_runs SET status='failed',lease_owner=NULL,lease_until=NULL,finished_at=UTC_TIMESTAMP(3),error_code='UNUSED_SYNTHETIC_SITE' WHERE id=? AND status='queued'",[b.runId]);
  result.ledgerRecovery=await require('./overseas-isolated-ledger-recovery-checks').checkLedgerSealRecovery({repo,receipt,root,directory,sourceId,
   childConfig:{db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir}}});
  result.checks.push('actual_ledger_seal_commit_interrupt_exact_intent_newnode_epoch2');
  result.ledgerCommentRecovery=[];
  for(const caseName of ['comments-before','comments-after'])result.ledgerCommentRecovery.push(await require('./overseas-isolated-ledger-recovery-checks').checkLedgerSealRecovery({repo,receipt,root,directory,sourceId,caseName,
   childConfig:{db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir}}}));
  result.checks.push('actual_ledger_comment_page_before_after_commit_newnode_reply_recovery');
  result.ledgerReplyRecovery=[];
  for(const caseName of ['reply-before','reply-after'])result.ledgerReplyRecovery.push(await require('./overseas-isolated-ledger-recovery-checks').checkLedgerSealRecovery({repo,receipt,root,directory,sourceId,caseName,
   childConfig:{db:{host:'127.0.0.1',port,user,password,database,connectionLimit:4,dateStrings:true,timezone:'Z'},serverId,dataDir,directory,serverPid:server.pid,receipt:{repositoryRoot:root,directory:receiptDir}}}));
  result.checks.push('actual_ledger_reply_page_before_after_commit_newnode_no_replay');
  result.ledgerMatrix=await require('./overseas-isolated-ledger-checks').checkLedgerMatrix({repo,receipt,root,directory,sourceId});
  result.checks.push('isolated_ledger_transaction_matrix_synthetic_fixtures');
  result.nonTarget=await require('./overseas-isolated-nontarget-checks').checkNonTargetSql({repo,root,directory});
  result.checks.push('actual_nontarget_bulk_recovery_and_canonical_route_no_candidate_sql');
  result.historyScales=await require('./overseas-isolated-ledger-history-checks').checkLedgerHistoryScales({repo,receipt,root,directory,sourceId});
  result.checks.push('isolated_history_scale_fixed_budget_rollback_measurement');
  result.status='PASS_ISOLATED_REAL_SQL_PARTIAL';result.requestId=request.requestId;result.newProcessScopes=2;
  result.syntheticTerminalSetupNotCompletionProof=true;result.actualRunSourceNotExecuted=false;
 }catch(error){result.errorCode=error.code||error.message;if(error.schemaReason)result.schemaReason=error.schemaReason;if(scheduledOnly&&error.schemaChecks)result.schemaChecks=error.schemaChecks;throw error;}
 finally{
  if(pool)await pool.end().catch(()=>{});
  if(control){try{if(server&&await owns())await control.query('SHUTDOWN');}catch(e){result.shutdownError=e.code||e.message;}await control.end().catch(()=>{});}
  for(let i=0;i<100&&!closed;i++)await sleep(200);result.serverStopped=closed;
  try{await freePort();result.portReleased=true;}catch{result.portReleased=false;}
  if(!result.serverStopped||!result.portReleased||result.shutdownError){result.status='NO_GO';process.exitCode=1;}
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});process.stdout.write(JSON.stringify(result)+'\n');
 }
}
main().catch(e=>{process.stderr.write((e.code||e.message)+'\n');process.exitCode=1;});
