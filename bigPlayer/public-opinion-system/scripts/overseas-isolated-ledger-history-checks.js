'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createOverseasClaimedContracts}=require('../worker/src/overseasBigPlayerClaimedContracts');
const {createOverseasStageCoverageLedger}=require('../server/src/db/overseasStageCoverage');
const {createOverseasStageCoverage}=require('../worker/src/overseasStageCoverage');
const {schemaDescriptors}=require('../worker/src/overseasStageTaskIdentity');
const {iso}=require('../worker/src/overseasBigPlayerNetworkContractVerifier');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const check=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function checkLedgerHistoryScales({repo,receipt,root,directory,sourceId}){
 const [[db]]=await repo.pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,DATABASE() AS db');
 check(Number(db.port)===13316&&Number(db.serverId)===20261036&&db.db==='po_overseas_fixture'&&path.resolve(db.datadir).toLowerCase()===path.join(directory,'data').toLowerCase(),'HISTORY_SCALE_ISOLATION');
 check(path.dirname(directory)===path.join(root,'.temp'),'HISTORY_SCALE_PATH');
 for(const p of [root,path.join(root,'.temp'),directory]){const s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(p)===p,'HISTORY_SCALE_PATH');}
 const originals=await repo.query("SELECT s.game_id,s.community_id,s.config,g.region_code FROM po_sources s JOIN po_games g ON g.id=s.game_id WHERE s.id=? AND s.platform='bigplayer_h5'",[sourceId]);
 check(originals.length===1&&originals[0].region_code==='overseas','HISTORY_SCALE_TEMPLATE');const original=originals[0];
 const config=typeof original.config==='string'?JSON.parse(original.config):original.config;
 const sites=require('../server/src/services/bigplayerSiteConfig').normalizeSiteUrls(config).siteUrls.filter(s=>s.enabled);check(sites.length>0,'HISTORY_SCALE_SITES');
 const results=[];
 for(const size of [100,1000,10000,10001]){
  const setupStarted=performance.now(),syntheticSource=crypto.randomUUID(),accountId=crypto.randomUUID(),historicalRunId=crypto.randomUUID();
  const copiedConfig={...config,siteUrls:sites.map(s=>({siteId:s.siteId,url:s.url,enabled:true}))};
  const setup=await repo.pool.getConnection();let destroyed=false;
  try{await setup.beginTransaction();
   await setup.query("INSERT INTO po_sources (id,game_id,community_id,platform,config,enabled,default_account_id,auth_status,collect_requested_at) VALUES (?,?,?,'bigplayer_h5',?,1,?,'authorized',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 SECOND))",[syntheticSource,original.game_id,original.community_id,JSON.stringify(copiedConfig),accountId]);
   await setup.query("INSERT INTO po_accounts (id,source_id,game_id,community_id,platform,enabled,auth_status) VALUES (?,?,?,?,'bigplayer_h5',1,'authorized')",[accountId,syntheticSource,original.game_id,original.community_id]);
   await setup.query("INSERT INTO po_credentials (id,source_id,account_id,credential_type,status,secret_cipher,updated_at) VALUES (?,?,?,'api_token','active',?,UTC_TIMESTAMP(3))",[crypto.randomUUID(),syntheticSource,accountId,'synthetic-not-a-token']);
   for(const site of sites)await setup.query('INSERT INTO po_source_sites (source_id,site_id,url,url_hash,enabled) VALUES (?,?,?,?,1)',[syntheticSource,site.siteId,site.url,sha(site.url)]);
   await setup.commit();
  }catch(error){try{await setup.rollback();}catch{destroyed=true;setup.destroy();}throw error;}finally{if(!destroyed)setup.release();}
  const [[marker]]=await repo.pool.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?",[syntheticSource]);
  const request=await receipt.prepare({repo,sourceId:syntheticSource,expectedMarker:marker.value,manifestSha256:'a'.repeat(64)});await repo.handoffOverseasManualMarker({request,receipt});
  const b=request.bindings.find(x=>x.siteId==='site-fr')||request.bindings[0];check(b,'HISTORY_SCALE_BINDING');
  // Historical run is explicit synthetic provenance, not collection completion.
  const dbTime=value=>iso(value).replace('T',' ').replace(/Z$/,'');
  await repo.query("INSERT INTO po_sync_runs (id,source_id,account_id,site_id,parent_run_id,trigger_type,status,sync_mode,scheduled_at,window_start,window_end,started_at,finished_at) VALUES (?,?,?,?,NULL,'manual','completed_authorized_scope','incremental',NULL,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",[historicalRunId,syntheticSource,accountId,b.siteId,dbTime(b.windowStart),dbTime(b.windowEnd)]);
  const scope={sourceId:syntheticSource,accountId,gameId:b.gameId,communityId:b.communityId,boardId:b.boardId,siteId:b.siteId,siteUrl:b.siteUrl,siteUrlSha256:b.siteUrlSha256};
  // Different UUID prefix per scale avoids cross-source primary-key collisions.
  const idPrefix=syntheticSource.slice(0,24);
  for(let offset=0;offset<size;offset+=200){
   const values=[],links=[],contentSql=[],linkSql=[];
   for(let i=offset;i<Math.min(offset+200,size);i++){
    const id=idPrefix+String(i+1).padStart(12,'0'),externalId=String(100000+i);
    contentSql.push('(?,?,?,?,?,?,?,0,0,?,?,?)');values.push(id,b.gameId,b.communityId,syntheticSource,accountId,externalId,'post','synthetic history',sha(`${syntheticSource}:${externalId}`),JSON.stringify({boardId:b.boardId,_overseasScope:scope}));
    linkSql.push("(?,?,'inserted','posts')");links.push(historicalRunId,id);
   }
   const conn=await repo.pool.getConnection();let dead=false;
   try{await conn.beginTransaction();await conn.query(`INSERT INTO po_contents (id,game_id,community_id,source_id,account_id,external_id,content_type,content_depth,is_deleted,body,fingerprint,raw_payload) VALUES ${contentSql.join(',')}`,values);
    await conn.query(`INSERT INTO po_sync_run_contents (run_id,content_id,change_type,sync_scope) VALUES ${linkSql.join(',')}`,links);await conn.commit();
   }catch(error){try{await conn.rollback();}catch{dead=true;conn.destroy();}throw error;}finally{if(!dead)conn.release();}
  }
  const [[seed]]=await repo.pool.query("SELECT COUNT(*) AS roots,SUM(EXISTS(SELECT 1 FROM po_sync_run_contents rc JOIN po_sync_runs r ON r.id=rc.run_id WHERE rc.content_id=c.id AND rc.sync_scope='posts' AND r.source_id=? AND r.account_id=? AND r.site_id=?)) AS proven FROM po_contents c WHERE c.source_id=? AND c.account_id=? AND c.content_depth=0 AND c.is_deleted=0",[syntheticSource,accountId,b.siteId,syntheticSource,accountId]);
  check(Number(seed.roots)===size&&Number(seed.proven)===size,'HISTORY_SCALE_SEED_COUNTS');
  const won=await repo.claimSyncRun({runId:b.runId,leaseOwner:`history-scale-${size}`,leaseSeconds:300});check(won&&Number(won.lease_epoch)===1,'HISTORY_SCALE_CLAIM');
  const journalDir=path.join(directory,`history-${size}-${crypto.randomUUID()}`);fs.mkdirSync(journalDir);
  const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:journalDir});
  const source={id:b.sourceId,game_id:b.gameId,community_id:b.communityId,platform:'bigplayer_h5',region_code:'overseas',siteId:b.siteId,siteUrl:b.siteUrl,config:{...copiedConfig,baseUrl:b.siteUrl}};
  const account={id:b.accountId,source_id:b.sourceId,game_id:b.gameId,community_id:b.communityId,platform:'bigplayer_h5'};
  const c=await createOverseasClaimedContracts({repo,journal,manifestSha256:b.manifestSha256,initialRunBindings:[b]}).prepare({source,account,syncRunId:b.runId,leaseOwner:won.lease_owner,leaseEpoch:1,windowStart:b.windowStart,windowEnd:b.windowEnd});
  const stats={sql:0,fullRootReads:0,taskInserts:0,commits:0,rollbacks:0,rrTransactions:0},observed=Object.create(repo);
  observed.pool={getConnection:async()=>{const conn=await repo.pool.getConnection();return new Proxy(conn,{get(target,key){
   if(key==='query')return async(sql,params)=>{stats.sql++;if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')stats.rrTransactions++;if(sql.startsWith('SELECT * FROM po_contents WHERE id='))stats.fullRootReads++;if(sql.startsWith('INSERT INTO po_overseas_expected_tasks'))stats.taskInserts++;return target.query(sql,params);};
   if(key==='commit')return async()=>{await target.commit();stats.commits++;};if(key==='rollback')return async()=>{await target.rollback();stats.rollbacks++;};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});}};
  const ledger=createOverseasStageCoverageLedger({journal,receipt,request}),coverage=createOverseasStageCoverage({repo:observed,ledger});
  const feed={boardId:b.boardId,feedKey:'synthetic-history-scale',pageKind:'home'};
  await coverage.transaction(conn=>ledger.prepareSchema(conn,c,{schemaDescriptors:schemaDescriptors(c,[feed])}));
  const baseline=process.memoryUsage();let peakRss=baseline.rss,peakHeapUsed=baseline.heapUsed;
  const sample=()=>{const m=process.memoryUsage();peakRss=Math.max(peakRss,m.rss);peakHeapUsed=Math.max(peakHeapUsed,m.heapUsed);};
  const sampler=setInterval(sample,50),before={...stats},started=performance.now();let outcome,errorCode=null,historyElapsedMs;
  try{outcome=await coverage.transaction(conn=>ledger.prepareHistorySnapshot(conn,c));}
  catch(error){errorCode=error.code||'UNCLASSIFIED_HISTORY_FAILURE';if(!['OVERSEAS_COVERAGE_HISTORY_BUDGET','OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET'].includes(errorCode))throw error;historyElapsedMs=performance.now()-started;await coverage.transaction(conn=>ledger.markPartial(conn,c,errorCode==='OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET'?'history_memory_budget':'history_budget'));}
  finally{sample();clearInterval(sampler);}
  historyElapsedMs??=performance.now()-started;
  const [[saved]]=await repo.pool.query('SELECT coverage_status,history_sealed,expected_count FROM po_overseas_stage_manifests WHERE run_id=?',[b.runId]);
  const [[tasks]]=await repo.pool.query("SELECT COUNT(*) AS history_tasks FROM po_overseas_expected_tasks WHERE run_id=? AND origin='history'",[b.runId]);
  if(errorCode)check(Number(tasks.history_tasks)===0&&Number(saved.history_sealed)===0&&saved.coverage_status==='partial'&&Number(saved.expected_count)===1,'HISTORY_SCALE_BUDGET_ROLLBACK');
  else check(size<=10000&&outcome?.status==='sealed'&&outcome.scannedCount===size&&outcome.elapsedMs<10000&&Number(tasks.history_tasks)===size&&Number(saved.history_sealed)===1&&Number(saved.expected_count)===size+1,'HISTORY_SCALE_SEALED_COUNTS');
  if(size===10001)check(errorCode==='OVERSEAS_COVERAGE_HISTORY_BUDGET','HISTORY_SCALE_LIMIT_NOT_ENFORCED');
  check(stats.rrTransactions>before.rrTransactions,'HISTORY_SCALE_RR_TRANSACTION');
  results.push({roots:size,syntheticSourceId:syntheticSource,accountId,requestId:request.requestId,runId:b.runId,historicalRunId,setupElapsedMs:started-setupStarted,measuredElapsedMs:historyElapsedMs,status:errorCode?'BUDGET_ROLLBACK_PARTIAL':'SEALED',errorCode,scannedCount:outcome?.scannedCount??null,fullRootReads:stats.fullRootReads-before.fullRootReads,attemptedTaskInserts:stats.taskInserts-before.taskInserts,durableHistoryTasks:Number(tasks.history_tasks),sqlQueries:stats.sql-before.sql,commits:stats.commits-before.commits,rollbacks:stats.rollbacks-before.rollbacks,baselineRss:baseline.rss,peakRss,baselineHeapUsed:baseline.heapUsed,peakHeapUsed,fixedMaxRoots:10000,fixedMaxMs:10000,snapshotSemantics:'RR enumeration plus existing FOR UPDATE revalidation'});
 }
 return {status:'ISOLATED_HISTORY_SCALE_CHECKS_COMPLETED',limits:require('../server/src/db/overseasHistoryBudget').limits,measurementNotes:'Node usage sampled every 50ms including partial cleanup; excludes MariaDB. SQL/commit/rollback include cleanup; elapsed excludes markPartial. Limits are cooperative checks, not hard OS bounds.',results,fixtureKind:'synthetic_independent_scope_real_sql_history_provenance',actualRunSourceExecuted:false,realHttpExecuted:false,productionActivationAllowed:false};
}
module.exports={checkLedgerHistoryScales};
