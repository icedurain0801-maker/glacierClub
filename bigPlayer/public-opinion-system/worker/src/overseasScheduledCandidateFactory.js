'use strict';
// Explicit isolated execution of one already-claimed scheduled child. No
// timers, scheduler activation, env loading, new claim or production consumer.
const {canonical,contractOf}=require('./overseasBigPlayerRunContractJournal');
const {iso}=require('./overseasBigPlayerNetworkContractVerifier');
const {scheduledFirstClaimContext}=require('../../server/src/db/overseasScheduledAdmissionStore');
const {createSharedWorkerIdentityLoader}=require('./sharedWorkerIdentityLoader');
const {contextOf}=require('../../server/src/connectors/overseasBigPlayerSiteSession');
const {createOverseasDispatchGuard}=require('./overseasBigPlayerDispatchGuard');
const {createOverseasBigPlayerAdapter}=require('./overseasBigPlayerAdapter');
const {createOverseasPageJobs}=require('./overseasBigPlayerPageJobs');
const {createOverseasScheduledStageCoverageLedger}=require('../../server/src/db/overseasStageCoverage');
const {createOverseasStageCoverage}=require('./overseasStageCoverage');
const {createOverseasBoundAudit}=require('../../server/src/db/overseasBoundAudit');
const {matchRules}=require('../../server/src/pipeline/ruleEngine');
const fail=code=>{throw Object.assign(Error(code),{code});};
function createIsolatedScheduledCandidateDeps({baseDeps,journal,proof,transport,translationVersion,analysisProfile}={}){
  const repo=baseDeps?.repo,ctx=scheduledFirstClaimContext(proof,repo),c=proof.contract;
  if(baseDeps?.unifiedScheduler?.mode==='enabled'||typeof transport!=='function'||transport===globalThis.fetch
    ||typeof translationVersion!=='string'||!translationVersion.trim()
    ||analysisProfile?.name!=='light'||typeof analysisProfile.version!=='string'||!analysisProfile.version.trim())fail('OVERSEAS_SCHEDULED_FACTORY_INVALID');
  const spec=Object.freeze({...analysisProfile});
  const ledger=createOverseasScheduledStageCoverageLedger({repo,journal,proof});
  const coverage=createOverseasStageCoverage({repo,ledger});
  const audit=createOverseasBoundAudit({repo,journal,ledger,scheduledProof:proof});
  const loadIdentity=createSharedWorkerIdentityLoader({repo});
  const dispatch=createOverseasDispatchGuard({repo,journal,manifestSha256:c.manifestSha256,transport,scheduledProof:proof});
  const verify=async value=>{await journal.read(value);await ctx.verify(value);return true;};
  const read=async input=>{
    const s=contextOf({...input.source,account:input.account});
    const expected=contractOf({...c,runId:input.syncRunId||input.syncRun?.id,sourceId:input.source.id,accountId:input.account.id,
      gameId:input.account.game_id,communityId:input.account.community_id,siteId:s.siteId,boardId:s.boardId,siteUrl:s.base.toString(),
      leaseOwner:input.leaseOwner,leaseEpoch:input.leaseEpoch,
      windowStart:new Date(input.windowStart??input.collectionWindow?.publishedFrom).toISOString(),
      windowEnd:new Date(input.windowEnd??input.collectionWindow?.publishedTo).toISOString()});
    if(canonical(expected)!==canonical(c))fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
    await verify(expected);return expected;
  };
  // Existing Repository methods execute on one pinned transaction. Their
  // internal query helper must never escape to the pool between fresh fences.
  const mutate=async(method,args)=>{
    const conn=await repo.pool.getConnection();let started=false,committing=false,destroyed=false;
    try{
      await conn.beginTransaction();started=true;await ctx.fence(conn,c,{lock:true});
      if(method==='claimSyncCheckpoint'){
        const input=args[0];
        if(input.accountId!==c.accountId||input.siteId!==c.siteId||input.leaseOwner!==c.leaseOwner
          ||iso(input.windowStart)!==c.windowStart||iso(input.windowEnd)!==c.windowEnd)
          fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      }else if(method==='releaseSyncCheckpoint'){
        const [[cp]]=await conn.query('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[args[0]]);
        if(!cp||cp.account_id!==c.accountId||cp.site_id!==c.siteId||cp.lease_owner!==c.leaseOwner
          ||args[1]?.leaseOwner!==c.leaseOwner||iso(cp.window_start)!==c.windowStart||iso(cp.window_end)!==c.windowEnd)
          fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      }else if(method==='markSyncRunRequest'&&(args[0]!==c.runId||args[1]?.leaseOwner!==c.leaseOwner||Number(args[1]?.leaseEpoch)!==c.leaseEpoch))
        fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      const facade=Object.create(repo);facade.query=async(sql,params)=>(await conn.query(sql,params))[0];
      const result=await repo[method].apply(facade,args);
      await ctx.fence(conn,c,{lock:true});
      committing=true;await conn.commit();committing=false;started=false;return result;
    }catch(e){if(committing){destroyed=true;conn.destroy();fail('OVERSEAS_SCHEDULED_FACTORY_COMMIT_UNKNOWN');}
      if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}throw e;
    }finally{if(!destroyed)conn.release();}
  };
  let claimed=false,routed=false,adapter;
  const blocked=new Set(['createRun','enqueueSyncRun','createSyncRun','finishSyncRun','finishScheduledSiteRun','finishRun','markSourceRun',
    'deferSyncRun','settleSyncRunControl','resetSyncCheckpoint']);
  const writes=new Set(['claimSyncCheckpoint','releaseSyncCheckpoint','markSyncRunRequest']);
  return Object.freeze({...baseDeps,productionActivationAllowed:false,unifiedScheduler:Object.freeze({mode:'off'}),
    resolveSourceDeps:async(source,run)=>{
      if(routed||!run||source?.id!==c.sourceId||run.id!==c.runId)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      for(const [key,value] of Object.entries({lease_owner:c.leaseOwner,lease_epoch:c.leaseEpoch,window_start:c.windowStart,window_end:c.windowEnd,
        trigger_type:'scheduled_site',parent_run_id:ctx.admission.parentRunId})){
        if(Object.hasOwn(run,key)){
          const supplied=key.startsWith('window_')?require('./overseasBigPlayerNetworkContractVerifier').iso(run[key]):run[key];
          if(supplied!==value)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
        }
      }
      for(const [key,value] of Object.entries({leaseOwner:c.leaseOwner,leaseEpoch:c.leaseEpoch,windowStart:c.windowStart,windowEnd:c.windowEnd,
        triggerType:'scheduled_site',parentRunId:ctx.admission.parentRunId})){
        if(Object.hasOwn(run,key)&&(key.startsWith('window')?iso(run[key]):run[key])!==value)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      }
      const identity=await loadIdentity(source,run);
      if(identity.run?.trigger_type!=='scheduled_site'||identity.run.parent_run_id!==ctx.admission.parentRunId
        ||identity.run.site_id!==c.siteId)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
      await verify(c);
      if(typeof baseDeps.ai?.configured!=='function'||!baseDeps.ai.configured('light')||!spec?.version)fail('OVERSEAS_QUEUE_POLICY_REQUIRED');
      const rules=await repo.loadKeywordRules(c.gameId,'bigplayer_h5',c.communityId);
      const jobs=createOverseasPageJobs({analysisOptionsFor:({content,raw})=>{
        const hit=matchRules({title:raw.title??content.title,body:raw.body??content.body,authorName:raw.authorName??content.author_name},rules);
        return {profile:'light',version:spec.version,triggerReason:hit.needAI?'keyword_match':'all_content',matchedKeywords:hit.matchedKeywords||[]};
      },translationOptions:{targetLanguage:'zh-CN',version:translationVersion}});
      adapter=createOverseasBigPlayerAdapter({repo,credentialContext:baseDeps.credentialContext,transport:dispatch.transport,
        dispatchGuard:dispatch,verifyRunContract:verify,beforeCommit:jobs,stageCoverage:coverage,scheduledProof:proof});
      const routedRepo=new Proxy(repo,{get(target,key){
        if(key==='upsertContentPage')return adapter.pageStore.upsertContentPage;
        if(key==='claimSyncRun')return async input=>{
          if(claimed||input.runId!==c.runId)fail('OVERSEAS_SCHEDULED_FACTORY_CLAIM_REPLAY');
          claimed=true;await verify(c);return (await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[c.runId]))[0];
        };
        // Observe the existing lease; this first-claim capability grants no
        // extension of parent/source leases or epoch recovery.
        if(key==='renewSyncRunLease')return async(id,owner,_seconds,epoch)=>{
          if(id!==c.runId||owner!==c.leaseOwner||Number(epoch)!==c.leaseEpoch)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
          await verify(c);return true;
        };
        if(key==='setRunBoardName')return undefined;
        if(['getSyncRunControl','settleSyncRunControl','updateAccount'].includes(key))return undefined;
        if(key==='updateSourceAuth')return async id=>{
          if(id!==c.sourceId)fail('OVERSEAS_SCHEDULED_FACTORY_SCOPE_CONFLICT');
          await verify(c);return {observedOnly:true};
        };
        if(blocked.has(key))return ()=>fail('OVERSEAS_SCHEDULED_FACTORY_ORDINARY_WRITE_BLOCKED');
        if(writes.has(key))return (...args)=>mutate(key,args);
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }});
      routed=true;
      return {source:identity.source,deps:{...baseDeps,repo:routedRepo,leaseOwner:c.leaseOwner,
        connectors:{...baseDeps.connectors,bigplayer_h5:adapter.connector},overseasAtomicPageJobs:true,overseasStageCoverage:coverage,
        getOverseasRunContract:read,verifyOverseasNetworkContract:verify,prepareOverseasClaimedRun:read,
        resolveOverseasClaimedSource:async s=>({...s,siteId:c.siteId,site_id:c.siteId,siteUrl:c.siteUrl,
          config:{...(typeof s.config==='string'?JSON.parse(s.config):s.config),baseUrl:c.siteUrl}}),
        createOverseasBoundAudit:async input=>audit.create(await read(input)),finishOverseasBoundRun:input=>audit.finish(input)}};
    },closeOverseasCandidate:()=>adapter?.close()});
}
module.exports={createIsolatedScheduledCandidateDeps};
