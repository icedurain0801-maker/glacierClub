'use strict';
const { CredentialContext }=require('../../server/src/services/credentialContext');
const { SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID }=require('./lastNightScope');
const {assertLastNightSiteUrl}=require('../../server/src/connectors/lastNightUrlContract');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function resolveLastNightRuntime({repo,accountId,cipher,env,expectedIdentity}={}) {
  if(!repo?.query || !accountId || !expectedIdentity) fail('LAST_NIGHT_RESOLVER_CONFIG_INVALID');
  const [identity]=await repo.query('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
  if(identity?.identity!==expectedIdentity || identity.db!=='public_opinion'||Number(identity.port)!==3306) fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
  const sources=await repo.query(`SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s
    JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=?`,[SOURCE_ID]);
  const accounts=await repo.query('SELECT * FROM po_accounts WHERE id=? AND source_id=?',[accountId,SOURCE_ID]);
  const source=sources[0],account=accounts[0];
  let config;try {config=typeof source?.config==='string'?JSON.parse(source.config):source.config;}catch {fail('LAST_NIGHT_CONFIG_INVALID');}
  if(sources.length!==1||accounts.length!==1||source.game_id!==GAME_ID||source.community_id!==COMMUNITY_ID
    ||source.region_code!=='overseas'||source.platform!=='bigplayer_h5'||Number(source.enabled)!==1||source.community_status!=='enabled'
    ||String(config?.boardId)!==BOARD_ID||account.platform!=='bigplayer_h5'||Number(account.enabled)!==1) fail('LAST_NIGHT_RUNTIME_SCOPE_MISMATCH');
  if(!Array.isArray(config.siteUrls)||!config.siteUrls.length) fail('LAST_NIGHT_SITE_SCOPE_MISMATCH');
  for(const site of config.siteUrls) assertLastNightSiteUrl(site.url);
  const registry=await repo.query('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id',[SOURCE_ID]);
  const scopedRepo={getAccount:async id=>id===accountId?account:null,
    getCredentialByAccount:async(id,type)=>{
      if(id!==accountId||type!=='api_token') fail('LAST_NIGHT_CREDENTIAL_SCOPE_MISMATCH');
      const row=await repo.getCredentialByAccount(id,type,{includeSecret:true});
      if(!row||row.account_id!==accountId) fail('LAST_NIGHT_CREDENTIAL_SCOPE_MISMATCH');
      return row;
    }};
  const context=new CredentialContext({repo:scopedRepo,cipher,env,allowLegacySourceFallback:false});
  const token=await context.loadApiToken(account,'api_token');
  // Password rows do not force login/refresh. Resolve only existing api_token.
  return {source,account:{...account,game_id:GAME_ID,community_id:COMMUNITY_ID},registry,
    credentialContext:Object.freeze({loadApiToken:async subject=>{if(subject?.id!==accountId) fail('LAST_NIGHT_CREDENTIAL_SCOPE_MISMATCH');return token;}})};
}
module.exports={resolveLastNightRuntime};
