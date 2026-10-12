'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('./lastNightScope');
const {assertLastNightSiteUrl}=require('../../server/src/connectors/lastNightUrlContract');
const {withDeadlineConnection}=require('./lastNightDeadlineConnection');
const {applyLastNightSiteAlignment}=require('./lastNightSiteAlignment');
const {inspectSiteAlignment}=require('./lastNightAlignmentContract');
const IDS=Object.freeze({'2':'site-8483a64ab230417e63c5e30d77b0a6f0','9':'site-f069f4495d534693dd87b2485053e7cd','16':'site-3bb48be7f9a82185d6a045e9a5cbd3d7'});
const LEGACY='legacy-8483a64ab230417e63c5e30d77b0a6f0';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function buildAlignment(source,registry) {
  if(source?.id!==SOURCE_ID||source.game_id!==GAME_ID||source.community_id!==COMMUNITY_ID||source.platform!=='bigplayer_h5'
    ||source.region_code!=='overseas'||source.community_status!=='enabled'||Number(source.enabled)!==1||typeof source.config!=='string')fail('LAST_NIGHT_ALIGNMENT_SCOPE_INVALID');
  const config=JSON.parse(source.config);if(String(config.boardId)!=='100017'||config.siteUrls?.length!==3)fail('LAST_NIGHT_ALIGNMENT_SCOPE_INVALID');
  const byLanguage=new Map();
  for(const site of config.siteUrls) {
    const language=assertLastNightSiteUrl(site.url).searchParams.get('languageId');
    if(byLanguage.has(language)||site.siteId!==IDS[language]||site.enabled===false)fail('LAST_NIGHT_ALIGNMENT_PLAN_CHANGED');
    byLanguage.set(language,site);
  }
  if(registry.length!==1||registry[0].site_id!==LEGACY||registry[0].url!==byLanguage.get('2').url||Number(registry[0].enabled)!==1)fail('LAST_NIGHT_ALIGNMENT_PLAN_CHANGED');
  const afterConfig=JSON.stringify({...config,siteUrls:config.siteUrls.map(site=>site===byLanguage.get('2')?{...site,siteId:LEGACY}:site)});
  const additions=['9','16'].map(language=>byLanguage.get(language));
  const planHash=sha(JSON.stringify({sourceId:SOURCE_ID,beforeConfig:source.config,registry,afterConfig,additions}));
  return{afterConfig,additions,planHash};
}
async function preciseAlignment({pool,accountId,expectedIdentity,approvedPlanHash,persistEvidence,inspectOnly=false,timeoutMs=15000}={}) {
  if(!accountId||!expectedIdentity||(!inspectOnly&&(!/^[a-f0-9]{64}$/.test(approvedPlanHash||'')||typeof persistEvidence!=='function')))fail('LAST_NIGHT_ALIGNMENT_PLAN_REQUIRED');
  let committing=false,committed=false;
  return withDeadlineConnection(pool,async({query:q,bounded})=>{
    try {
      const [[identity]]=await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
      if(identity?.identity!==expectedIdentity||identity.db!=='public_opinion'||Number(identity.port)!==3306)fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
      const [[lock]]=await q('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${accountId}`]);
      if(Number(lock.acquired)!==1)fail('LAST_NIGHT_DUPLICATE_EXECUTION');
      await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
      const [[source]]=await q('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE',[SOURCE_ID]);
      const [accounts]=await q('SELECT id,source_id,platform,enabled FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE',[accountId,SOURCE_ID]);
      if(accounts.length!==1||accounts[0].platform!=='bigplayer_h5'||Number(accounts[0].enabled)!==1)fail('LAST_NIGHT_ALIGNMENT_ACCOUNT_MISMATCH');
      const [active]=await q("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID]);
      if(active.length)fail('LAST_NIGHT_ACTIVE_RUN');
      const [leases]=await q('SELECT lease_until,(lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
      if(leases.length!==1||Number(leases[0].active_lease))fail('LAST_NIGHT_ACTIVE_LEASE');
      const [registry]=await q('SELECT site_id,url,url_hash,enabled,auth_status,capabilities FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE',[SOURCE_ID]);
      const plan=buildAlignment(source,registry);
      if(inspectOnly){await q('ROLLBACK');return{status:'ALIGNMENT_PLAN_READY',planHash:plan.planHash,beforeConfigSha256:sha(source.config),legacySiteId:LEGACY,addSiteIds:plan.additions.map(site=>site.siteId)};}
      if(plan.planHash!==approvedPlanHash)fail('LAST_NIGHT_ALIGNMENT_PLAN_CHANGED');
      const journal={phase:'alignment_prepared',sourceId:SOURCE_ID,accountId,beforeConfig:source.config,beforeRegistry:registry,afterConfig:plan.afterConfig,planHash:plan.planHash};
      await bounded(persistEvidence(journal));
      const [historyRuns]=await q('SELECT DISTINCT site_id FROM po_sync_runs WHERE source_id=? AND site_id IS NOT NULL',[SOURCE_ID]);
      const [historyCheckpoints]=await q('SELECT DISTINCT cp.site_id FROM po_sync_checkpoints cp JOIN po_accounts a ON a.id=cp.account_id WHERE a.source_id=? AND cp.site_id IS NOT NULL',[SOURCE_ID]);
      const history=[...historyRuns,...historyCheckpoints].map(row=>row.site_id);
      const existingPlan=inspectSiteAlignment(source,registry,history);
      const pinned={query:q,beginTransaction:async()=>{},rollback:async()=>{},release:()=>{},commit:async()=>{
        const [[current]]=await q('SELECT config FROM po_sources WHERE id=? FOR UPDATE',[SOURCE_ID]);
        if(current?.config!==plan.afterConfig)fail('LAST_NIGHT_ALIGNMENT_VERIFY_FAILED');
      }};
      // Reuse existing legacy-preserving config CAS and two registry inserts.
      // Its commit is held until our protected evidence and postconditions finish.
      await applyLastNightSiteAlignment({pool:{getConnection:async()=>pinned},approvedPlanHash:existingPlan.planHash});
      const [after]=await q('SELECT site_id,url,url_hash,enabled,auth_status,capabilities FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE',[SOURCE_ID]);
      const configured=JSON.parse(plan.afterConfig).siteUrls;
      if(after.length!==3||configured.some(site=>!after.some(row=>row.site_id===site.siteId&&row.url===site.url&&Number(row.enabled)===1))
        ||JSON.stringify(after.find(row=>row.site_id===LEGACY))!==JSON.stringify(registry[0]))fail('LAST_NIGHT_ALIGNMENT_VERIFY_FAILED');
      await bounded(persistEvidence({...journal,afterRegistry:after}));
      committing=true;await q('COMMIT');committed=true;
      await bounded(persistEvidence({...journal,phase:'alignment_committed',afterRegistry:after}));
      return{status:'LAST_NIGHT_ALIGNMENT_COMMITTED',sourceId:SOURCE_ID,planHash:plan.planHash,legacySiteId:LEGACY,insertedSites:2,historicalIdentityChanged:false};
    }catch(error){if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_ALIGNMENT_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_ALIGNMENT_COMMIT_UNKNOWN';throw error;}
  },{timeoutMs,code:'LAST_NIGHT_ALIGNMENT_TIMEOUT'}).catch(error=>{if(committing)error.code=committed?'LAST_NIGHT_ALIGNMENT_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_ALIGNMENT_COMMIT_UNKNOWN';throw error;});
}
module.exports={buildAlignment,preciseAlignment,IDS,LEGACY};
