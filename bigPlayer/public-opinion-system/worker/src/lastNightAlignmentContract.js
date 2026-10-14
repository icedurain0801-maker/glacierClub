'use strict';
const crypto=require('node:crypto');
const {normalizeSiteUrls,normalizeUrl}=require('../../server/src/services/bigplayerSiteConfig');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function inspectSiteAlignment(source,registry,historicalSiteIds=[]) {
  if(source?.id!==SOURCE_ID||source.game_id!==GAME_ID||source.community_id!==COMMUNITY_ID||source.region_code!=='overseas'||source.platform!=='bigplayer_h5'||Number(source.enabled)!==1||source.community_status!=='enabled')fail('LAST_NIGHT_SCOPE_MISMATCH');
  const raw=typeof source.config==='string'?JSON.parse(source.config):source.config;
  if(String(raw.boardId)!==BOARD_ID)fail('LAST_NIGHT_SCOPE_MISMATCH');
  const config=normalizeSiteUrls(raw),sites=config.siteUrls.filter(site=>site.enabled),rows=registry||[];
  if(sites.length!==3||config.siteUrls.length!==3)fail('LAST_NIGHT_SITE_COUNT_MISMATCH');
  const byId=new Map(rows.map(row=>[String(row.site_id),row]));
  if(byId.size!==rows.length)fail('LAST_NIGHT_REGISTRY_DUPLICATE');
  if(rows.length===3&&sites.every(site=>{const row=byId.get(site.siteId);return row&&Number(row.enabled)===1&&normalizeUrl(row.url)===site.url;})) {
    if(historicalSiteIds.some(id=>id!=null&&!byId.has(String(id))))fail('LAST_NIGHT_HISTORY_IDENTITY_UNSAFE');
    return{status:'aligned',sites};
  }
  if(rows.length!==1||Number(rows[0].enabled)!==1||!String(rows[0].site_id).startsWith('legacy-'))fail('LAST_NIGHT_SITE_IDENTITY_UNSAFE');
  const legacy=rows[0],legacyUrl=normalizeUrl(legacy.url),matches=sites.filter(site=>site.url===legacyUrl);
  if(!Array.isArray(raw.siteUrls)||raw.siteUrls.some(site=>!site||typeof site!=='object'||!String(site.siteId||'').trim())||matches.length!==1||sites.some(site=>site.siteId===String(legacy.site_id)))fail('LAST_NIGHT_SITE_IDENTITY_UNSAFE');
  const referenced=new Set(historicalSiteIds.filter(Boolean).map(String));
  if([...referenced].some(id=>id!==String(legacy.site_id)))fail('LAST_NIGHT_HISTORY_IDENTITY_UNSAFE');
  const corrected=raw.siteUrls.map((site,index)=>sites[index].url===legacyUrl?{...site,siteId:String(legacy.site_id)}:site);
  const planHash=crypto.createHash('sha256').update(JSON.stringify({sourceId:SOURCE_ID,before:config.siteUrls.map(site=>[site.siteId,site.url]),after:corrected.map((site,index)=>[site.siteId,sites[index].url]),registry:[String(legacy.site_id),legacyUrl],historicalSiteIds:[...referenced].sort()})).digest('hex');
  return{status:'alignment_required',legacySiteId:String(legacy.site_id),missingSiteIds:corrected.filter(site=>site.siteId!==String(legacy.site_id)).map(site=>site.siteId),plannedConfig:{...raw,siteUrls:corrected},planHash};
}
module.exports={inspectSiteAlignment};
