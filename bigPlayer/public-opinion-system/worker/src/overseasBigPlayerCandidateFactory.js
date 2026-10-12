'use strict';
const {createSharedWorkerIdentityLoader}=require('./sharedWorkerIdentityLoader');
const {createSourceDepsResolver}=require('./overseasBigPlayerSourceRouter');
const {createOverseasNetworkContractVerifier}=require('./overseasBigPlayerNetworkContractVerifier');
const {createOverseasClaimedContracts}=require('./overseasBigPlayerClaimedContracts');
const {createOverseasBigPlayerAdapter}=require('./overseasBigPlayerAdapter');
const {createOverseasDispatchGuard}=require('./overseasBigPlayerDispatchGuard');
const {createOverseasPageJobs}=require('./overseasBigPlayerPageJobs');
const {matchRules}=require('../../server/src/pipeline/ruleEngine');
const {normalizeSiteUrls}=require('../../server/src/services/bigplayerSiteConfig');
// Explicit assembly only. No env loading, ordinary buildDeps activation, timers
// or second consumer. Caller supplies bounded isolated repo/transport.
function createIsolatedOverseasCandidateDeps({baseDeps,journal,manifestSha256,transport,initialContracts=[],initialRunBindings=[],recoveryProofs=[],translationVersion,stageCoverage,boundAudit}={}) {
  if(baseDeps?.unifiedScheduler?.mode==='enabled')throw Object.assign(new Error('Candidate scheduled admission is not implemented'),{code:'OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE'});
  if(boundAudit!=null&&!require('../../server/src/db/overseasBoundAudit').isOverseasBoundAudit(boundAudit))throw new TypeError('Trusted bound audit required');
  if(stageCoverage!=null&&!require('./overseasStageCoverage').isOverseasStageCoverage(stageCoverage))throw new TypeError('Trusted stage coverage required');
  if(typeof transport!=='function'||transport===globalThis.fetch||typeof baseDeps?.repo?.loadKeywordRules!=='function'
    ||typeof translationVersion!=='string'||!translationVersion.trim())throw new TypeError('Isolated candidate dependencies required');
  const verify=createOverseasNetworkContractVerifier({repo:baseDeps.repo,journal,manifestSha256});
  const dispatchGuard=createOverseasDispatchGuard({repo:baseDeps.repo,journal,manifestSha256,transport});
  const contracts=createOverseasClaimedContracts({repo:baseDeps.repo,journal,manifestSha256,initialContracts,initialRunBindings,recoveryProofs});
  let candidateClaim;
  if(recoveryProofs.length){
    if(recoveryProofs.length!==1)throw new TypeError('One exact recovery repository required');
    require('./overseasRecoveryCandidateFactory').assertRecoveryClaimRepository(baseDeps.repo,{proof:recoveryProofs[0],journal});
    candidateClaim=input=>baseDeps.repo.claimSyncRun(input);
  }else candidateClaim=require('./overseasCandidateInitialClaim').createCandidateInitialClaim({repo:baseDeps.repo,manifestSha256,initialRunBindings});
  const adapters=new Set();
  const resolve=createSourceDepsResolver({baseDeps,loadIdentity:createSharedWorkerIdentityLoader({repo:baseDeps.repo}),
    loadRunContract:(_identity,input)=>contracts.read(input),verifyNetworkContract:verify,
    createOverseasAdapter:async identity=>{
      if(typeof baseDeps.ai?.configured!=='function'||!baseDeps.ai.configured('light'))throw Object.assign(new Error('Analysis policy unavailable'),{code:'OVERSEAS_QUEUE_POLICY_REQUIRED'});
      // Reuse actual main-chain version and keyword rules, no alternate algorithm.
      const light=require('./worker').profileSpec(baseDeps.ai,'light');
      if(typeof light?.version!=='string'||!light.version.trim())throw Object.assign(new Error('Analysis policy unavailable'),{code:'OVERSEAS_QUEUE_POLICY_REQUIRED'});
      const lightVersion=light.version;
      const source=identity.source,rules=await baseDeps.repo.loadKeywordRules(source.game_id,source.platform,source.community_id);
      const jobs=createOverseasPageJobs({analysisOptionsFor:({content,raw})=>{
        const hit=matchRules({title:raw.title??content.title,body:raw.body??content.body,authorName:raw.authorName??content.author_name},rules);
        return {profile:'light',version:lightVersion,triggerReason:hit.needAI?'keyword_match':'all_content',matchedKeywords:hit.matchedKeywords||[]};
      },translationOptions:{targetLanguage:'zh-CN',version:translationVersion}});
      const adapter=createOverseasBigPlayerAdapter({repo:baseDeps.repo,credentialContext:baseDeps.credentialContext,
        transport:dispatchGuard.transport,dispatchGuard,verifyRunContract:verify,beforeCommit:jobs,stageCoverage});
      adapters.add(adapter);return adapter;
    }});
  return Object.freeze({...baseDeps,productionActivationAllowed:false,
    // Do not retain a mutable scheduler reference that can activate old writes
    // after the candidate's assembly-time rejection.
    unifiedScheduler:Object.freeze({...baseDeps.unifiedScheduler,mode:'off'}),
    inspectOverseasScheduledReadiness:require('./overseasScheduledReadiness').createOverseasScheduledReadiness({repo:baseDeps.repo}),
    recoverCandidateLegacyRuns:require('./overseasCandidateLegacyRecovery').createOverseasCandidateLegacyRecovery({repo:baseDeps.repo}),
    resolveSourceDeps:async(source,run)=>{
      const denied=()=>{throw Object.assign(Error('Candidate source fence invalid'),{code:'OVERSEAS_CANDIDATE_SOURCE_FENCE_INVALID'});};
      if(typeof source?.id!=='string'||!source.id)denied();
      const persisted=await baseDeps.repo.query('SELECT s.id,s.platform,g.region_code FROM po_sources s JOIN po_games g ON g.id=s.game_id WHERE s.id=? LIMIT 2',[source.id]);
      if(!Array.isArray(persisted)||persisted.length!==1||persisted[0].id!==source.id||!require('./sharedWorkerIdentityLoader').DEFAULT_PLATFORMS.includes(persisted[0].platform)
        ||!['domestic','overseas'].includes(persisted[0].region_code))denied();
      for(const key of ['platform','region_code'])if(Object.hasOwn(source,key)&&source[key]!==persisted[0][key])denied();
      const routed=await resolve({...source,platform:persisted[0].platform,region_code:persisted[0].region_code},run);
      if(routed.deps===baseDeps)return {deps:baseDeps,source};
      const claimRepo=new Proxy(routed.deps.repo,{get(target,key,receiver){if(key==='claimSyncRun')return candidateClaim;return Reflect.get(target,key,receiver);}});
      return {...routed,deps:{...routed.deps,repo:claimRepo,...(stageCoverage?{overseasStageCoverage:stageCoverage}:{}),...(boundAudit?{
        createOverseasBoundAudit:async input=>boundAudit.create(await contracts.read(input)),
        finishOverseasBoundRun:input=>boundAudit.finish(input)
      }:{}),prepareOverseasClaimedRun:input=>contracts.prepare(input),
        resolveOverseasClaimedSource:async(source,run)=>{
          const config=typeof source.config==='string'?JSON.parse(source.config):source.config;
          const sites=normalizeSiteUrls(config).siteUrls.filter(site=>site.enabled&&site.siteId===run.site_id);
          if(sites.length!==1)throw Object.assign(new Error('Claimed site unavailable'),{code:'OVERSEAS_CLAIMED_CONTRACT_INVALID'});
          // Current config selects only the expected candidate URL. Journal and
          // persisted verifier must still prove it before any network operation.
          return {...source,siteId:run.site_id,site_id:run.site_id,siteUrl:sites[0].url,config:{...config,baseUrl:sites[0].url}};
        }}};
    },closeOverseasCandidate:()=>{for(const adapter of adapters)adapter.close();adapters.clear();}});
}
function createStageCoveredIsolatedCandidateDeps(options={}) {
  const {stageCoverage,boundAudit}=options;
  if(!require('./overseasStageCoverage').isOverseasStageCoverage(stageCoverage)
    ||!require('../../server/src/db/overseasBoundAudit').isOverseasBoundAudit(boundAudit))throw new TypeError('Stage-covered candidate dependencies required');
  stageCoverage.assertContext({repo:options.baseDeps?.repo,journal:options.journal,receipt:options.receipt});
  boundAudit.assertContext({repo:options.baseDeps?.repo,journal:options.journal,ledger:stageCoverage.ledger});
  return createIsolatedOverseasCandidateDeps(options);
}
module.exports={createIsolatedOverseasCandidateDeps,createStageCoveredIsolatedCandidateDeps};
