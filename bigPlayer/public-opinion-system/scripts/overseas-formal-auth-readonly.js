'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root,sha,loadOriginals}=require('./overseas-real-artifact-audit');
const {createBoundedTransport}=require('./overseas-real-small-batch');
async function main(){
  if(process.argv[2]!=='--execute')throw Object.assign(new Error('bounded real auth flag required'),{code:'EXECUTION_FLAG_REQUIRED'});
  require('../server/src/runtimeEnv').loadRuntimeEnv();process.env.NODE_TLS_REJECT_UNAUTHORIZED='1';
  const {Repository}=require('../server/src/db/repository'),{CredentialContext}=require('../server/src/services/credentialContext'),{createOverseasBigPlayerSiteSession}=require('../server/src/connectors/overseasBigPlayerSiteSession');
  const originals=loadOriginals(),repo=new Repository({...process.env,DB_POOL_SIZE:'1'}),budget=createBoundedTransport({maxRequests:3});
  const evidencePath=path.join(root,'.temp',`overseas-formal-auth-readonly-${Date.now()}.json`);
  const result={status:'INTENT',sourceId:originals.items.sourceId,readOnlyDatabase:true,contentRequests:0,requestBudget:3,
    sessionSha256:sha(fs.readFileSync(require.resolve('../server/src/connectors/overseasBigPlayerSiteSession'))),sites:[]};
  fs.writeFileSync(evidencePath,JSON.stringify(result),{flag:'wx'});
  try{
    const source=(await repo.listSources()).find(s=>s.id===result.sourceId),config=JSON.parse(source.config),account=await repo.getAccount(source.default_account_id);
    const registry=await repo.query('SELECT site_id,url,url_hash,enabled,auth_status FROM po_source_sites WHERE source_id=?',[result.sourceId]);
    const creds=new CredentialContext({repo}),token=await creds.loadApiToken(account,'api_token');
    const session=createOverseasBigPlayerSiteSession({transport:budget.transport});
    for(const original of originals.items.sites){
      const site=config.siteUrls.find(s=>(s.siteId||s.site_id)===original.siteId),r=registry.find(r=>r.site_id===original.siteId);
      if(!site||!r||site.url!==r.url||sha(site.url)!==r.url_hash||Number(r.enabled)!==1)throw Object.assign(new Error('registry changed'),{code:'SITE_REGISTRY_CHANGED'});
      const scoped={...source,account,account_id:account.id,siteId:original.siteId,siteUrl:site.url,config:{...config,baseUrl:site.url}};
      await session.tokenFor(scoped,token);
      result.sites.push({siteId:original.siteId,siteUrlSha256:r.url_hash,verified:true,persistedAuthStatus:r.auth_status});
    }
    result.status='FORMAL_COMMUNITY_AUTH_VERIFIED';
  }catch(e){result.status='NO_GO';result.errorCode=e.code||'AUTH_VERIFICATION_FAILED';process.exitCode=1;}
  finally{Object.assign(result,budget.evidence());fs.writeFileSync(evidencePath,JSON.stringify(result,null,2)+'\n');await repo.pool.end();}
  console.log(JSON.stringify({...result,evidencePath,evidenceSha256:sha(fs.readFileSync(evidencePath))},null,2));
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'NO_GO',errorCode:e.code||'AUTH_VERIFICATION_FAILED'}));process.exitCode=1;});
