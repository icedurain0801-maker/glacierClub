'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {canonical,createOverseasRunContractJournal}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createIsolatedOverseasCandidateDeps}=require('../worker/src/overseasBigPlayerCandidateFactory');
const {assertCandidateLegacyRecovery}=require('../worker/src/overseasCandidateLegacyRecovery');
const check=(yes,code)=>{if(!yes)throw Object.assign(Error(code),{code});};
const sha=v=>crypto.createHash('sha256').update(canonical(JSON.parse(JSON.stringify(v)))).digest('hex');
async function checkNonTargetSql({repo,root,directory}){
 const [[db]]=await repo.pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,DATABASE() AS db');
 check(Number(db.port)===13316&&Number(db.serverId)===20261036&&db.db==='po_overseas_fixture'&&path.resolve(db.datadir).toLowerCase()===path.join(directory,'data').toLowerCase(),'NONTARGET_ISOLATION');
 check(path.dirname(directory)===path.join(root,'.temp'),'NONTARGET_PATH');
 for(const p of [root,path.join(root,'.temp'),directory]){const s=fs.lstatSync(p);check(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(p)===p,'NONTARGET_PATH');}
 const journal=await createOverseasRunContractJournal({repositoryRoot:root,directory:fs.mkdtempSync(path.join(directory,'nontarget-journal-'))});
 const conn=await repo.pool.getConnection();let active=false,dead=false,candidate;
 const cases=[['domestic-bigplayer','bigplayer_h5','domestic',true],['discord','discord','overseas',true],['taptap','taptap','domestic',true],['facebook','facebook','overseas',true],['overseas-bigplayer','bigplayer_h5','overseas',false],['unknown-platform','future_platform','domestic',false],['unknown-region','bigplayer_h5','unknown',false],['wrongcase-region','bigplayer_h5','DOMESTIC',false]];
 const fixtures=[],queries=[];let transportCalls=0;
 const observed=Object.create(repo);observed.query=async(sql,params=[])=>{check(!/po_overseas_(stage_manifests|expected_tasks)/i.test(sql),'NONTARGET_CANDIDATE_SQL');queries.push(sql);return(await conn.query(sql,params))[0];};
 observed.pool={getConnection:async()=>{throw Error('NONTARGET_CONNECTION_ESCAPE');}};
 const baseDeps={repo:observed,connectors:{},unifiedScheduler:{mode:'off'}};
 const candidateHashes=async()=>{const out={};for(const table of ['po_overseas_stage_manifests','po_overseas_expected_tasks'])out[table]=sha((await conn.query(`SELECT * FROM ${table} ORDER BY run_id${table==='po_overseas_expected_tasks'?',task_identity_sha256':''}`))[0]);return out;};
 try{
  candidate=createIsolatedOverseasCandidateDeps({baseDeps,journal,manifestSha256:'a'.repeat(64),translationVersion:'nontarget-v1',transport:async()=>{transportCalls++;throw Error('Unexpected HTTP');}});
  await conn.beginTransaction();active=true;const before=await candidateHashes();
  for(const [name,platform,region,recover]of cases){
   const gameId=crypto.randomUUID(),communityId=crypto.randomUUID(),sourceId=crypto.randomUUID(),accountId=crypto.randomUUID(),runId=crypto.randomUUID();
   await conn.query('INSERT INTO po_games (id,region_code,enabled) VALUES (?,?,1)',[gameId,region]);
   await conn.query("INSERT INTO po_communities (id,game_id,status) VALUES (?,?,'enabled')",[communityId,gameId]);
   await conn.query("INSERT INTO po_sources (id,game_id,community_id,platform,config,enabled,default_account_id,auth_status) VALUES (?,?,?,?,?,1,?,'authorized')",[sourceId,gameId,communityId,platform,'{}',accountId]);
   await conn.query("INSERT INTO po_accounts (id,source_id,game_id,community_id,platform,enabled,auth_status) VALUES (?,?,?,?,?,1,'authorized')",[accountId,sourceId,gameId,communityId,platform]);
   await conn.query("INSERT INTO po_sync_runs (id,source_id,account_id,site_id,parent_run_id,trigger_type,status,sync_mode,scheduled_at,window_start,window_end,started_at,attempts,lease_epoch,lease_owner,lease_until,updated_at) VALUES (?,?,?,NULL,NULL,'manual','running','incremental',NULL,DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY),UTC_TIMESTAMP(3),DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 HOUR),1,1,'nontarget-fixture',DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND),DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))",[runId,sourceId,accountId]);
   fixtures.push({name,platform,region,recover,sourceId,runId,before:(await conn.query('SELECT * FROM po_sync_runs WHERE id=?',[runId]))[0][0]});
  }
  const overseasSql="SELECT r.* FROM po_sync_runs r JOIN po_sources s ON s.id=r.source_id JOIN po_games g ON g.id=s.game_id WHERE BINARY s.platform='bigplayer_h5' AND BINARY g.region_code='overseas' ORDER BY r.id";
  const overseasBefore=sha((await conn.query(overseasSql))[0]);
  const bulk=await assertCandidateLegacyRecovery(candidate.recoverCandidateLegacyRuns,observed)();check(bulk.recovered===4&&!bulk.overseasRecoveryPerformed,'NONTARGET_BULK_COUNTS');
  for(const f of fixtures){const after=(await conn.query('SELECT * FROM po_sync_runs WHERE id=?',[f.runId]))[0][0];
   if(f.recover){check(after.status==='queued'&&Number(after.lease_epoch)===2&&Number(after.attempts)===2&&after.lease_owner===null&&after.lease_until===null&&after.error_code==='SYNC_RUN_RECOVERED','NONTARGET_RECOVERY_TUPLE');
    const source={id:f.sourceId,platform:f.platform,region_code:f.region},r=await candidate.resolveSourceDeps(source,{id:f.runId});check(r.deps===baseDeps&&r.source===source,'NONTARGET_ROUTE_CHANGED');
   }else check(sha(after)===sha(f.before),'NONTARGET_UNPROVEN_IDENTITY_MUTATED');
  }
  check(overseasBefore===sha((await conn.query(overseasSql))[0]),'NONTARGET_EXISTING_OVERSEAS_CHANGED');
  const after=await candidateHashes();check(sha(before)===sha(after),'NONTARGET_CANDIDATE_TABLE_CHANGED');check(transportCalls===0&&queries.length===5,'NONTARGET_QUERY_BOUNDARY');
  await conn.rollback();active=false;
  return {status:'PASS_ISOLATED_NON_TARGET_SQL_ROUTE_ONLY',providerCollectionExecuted:false,recovered:bulk.recovered,platforms:fixtures.filter(f=>f.recover).map(f=>f.name),unprovenIdentityUnchanged:true,existingOverseasSha256:overseasBefore,candidateTableHashes:after,canonicalRouteQueries:4,candidateBusinessQueries:0,transportCalls,fixturesRolledBack:true,noDdlExecuted:true,productionTouched:false};
 }finally{if(active)try{await conn.rollback();}catch{dead=true;conn.destroy();}candidate?.closeOverseasCandidate();if(!dead)conn.release();}
}
module.exports={checkNonTargetSql};
