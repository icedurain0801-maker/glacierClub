'use strict';
const {BigPlayerH5Connector}=require('./bigPlayerH5Connector');
const {completeDetailBlocks}=require('./lastNightDetailBlockContract');
const crypto=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function stripSecrets(value){
 if(Array.isArray(value))return value.map(stripSecrets);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|password|authorization|cookie|secret|credential)/i.test(key)
  && !['authorization','sessionid','apikey','credential','bearer','privatekey'].includes(key.replace(/[^a-z0-9]/gi,'').toLowerCase())).map(([key,child])=>[key,stripSecrets(child)]));
}
class LastNightCompleteDetailConnector extends BigPlayerH5Connector{
 async enrichQ1FeedItems(input){
  // Keep existing actual text-detail enrichment for normal posts. The old
  // implementation fetches each detail once; inspect the returned envelope
  // via a per-call collector, NOT by refetching its failed subset.
  const details=new Map(),original=this.requestQ1;
  this.requestQ1=async(...args)=>{const payload=await original.apply(this,args);if(args[0]==='/api/club/v1/auth/post/')details.set(String(args[3].postId),payload?.data);return payload;};
  let result;try{result=await super.enrichQ1FeedItems(input);}finally{this.requestQ1=original;}
  this.completeDetails=new Map();
  result.items=result.items.map(item=>{
   const provider=details.get(String(item.id));
   const nontext=Array.isArray(provider?.content)&&provider.content.length&&provider.content.every(block=>[1,5].includes(block?.type));
   if(item._contentIntegrity?.status==='detail_enriched'&&!nontext)return item;
   if(!nontext&&item._contentIntegrity?.code!=='DETAIL_RESPONSE_INVALID')fail('LAST_NIGHT_COMPLETE_DETAIL_FETCH_FAILED');
   const complete=completeDetailBlocks(details.get(String(item.id)),item.id);
   this.completeDetails.set(String(item.id),stripSecrets(complete.providerDetail));
   // Complete means authenticated, matching detail ID, nonempty validated
   // blocks, not "full text". Do not copy the list summary into body.
   return{...item,content:complete.providerDetail.content,_contentMedia:complete.media,
    _lastNightCompleteDetail:stripSecrets(complete.providerDetail),
    _contentIntegrity:{status:'detail_enriched',basis:'validated-provider-nontext-envelope',hasText:false,opaqueSemantics:complete.opaqueSemantics,
     aiInputScope:'title-only-no-media-or-opaque-inference',bodySource:complete.bodySource}};
  });
  return{...result,diagnostics:{attempted:result.items.length,enriched:result.items.length,fallback:0}};
 }
 async listFeedContents(input){
  if(input.source?.siteId!=='site-3bb48be7f9a82185d6a045e9a5cbd3d7')fail('LAST_NIGHT_COMPLETE_DETAIL_SITE_INVALID');
  const page=await super.listFeedContents(input);
  for(const item of page.items){
   const integrity=item.rawPayload?._contentIntegrity;
   if(this.completeDetails?.has(String(item.externalId))){
    item.rawPayload._contentIntegrity={...integrity,status:'detail_enriched',basis:'validated-provider-nontext-envelope',hasText:false,aiInputScope:'title-only-no-media-or-opaque-inference'};
    item.body='';item.rawPayload._lastNightAnalysisBasis={scope:'title-only',mediaAnalyzed:false,opaqueAnalyzed:false};
    // Recover exact detail blocks from enrichment without q1Body treating a
    // type5 arbitrary string as readable post text.
    const detail=this.completeDetails?.get(String(item.externalId));
    if(!detail)fail('LAST_NIGHT_COMPLETE_DETAIL_RAW_MISSING');item.rawPayload._lastNightProviderDetail=detail;
    item.rawPayload._lastNightProviderDetailSha256=crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex');
    item.rawPayload._lastNightAnalysisBasis.bodyTextAvailable=false;
    item.rawPayload._lastNightAnalysisBasis.explicitTitleAvailable=Boolean(String(item.title||'').trim());
    item.isDeleted=detail.isDeleted===true||detail.moderatorIsDelete===true||(detail.status!=null&&Number(detail.status)<0);
    item.fingerprint=crypto.createHash('sha256').update(JSON.stringify({title:item.title||'',author:item.authorName||'',content:detail.content,isDeleted:item.isDeleted})).digest('hex');
   }
  }
  return page;
 }
}
module.exports={LastNightCompleteDetailConnector,stripSecrets};
