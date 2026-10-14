'use strict';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function completeDetailBlocks(detail,expectedId){
 if(!detail||Array.isArray(detail)||typeof detail!=='object'||String(detail.id??detail.postId??'')!==String(expectedId)
   || !Array.isArray(detail.content)||!detail.content.length)fail('LAST_NIGHT_DETAIL_BLOCK_INVALID');
 const media=[],opaque=[];
 for(const block of detail.content){
  // Existing q1HasTextContent explicitly defines type 1 as media. No local
  // evidence defines type 5; unknown block types are NOT guessed or dropped.
  if(![1,5].includes(block?.type))fail('LAST_NIGHT_DETAIL_BLOCK_TYPE_UNVERIFIED');
  if(typeof block.data!=='string'||!block.data.trim())fail('LAST_NIGHT_DETAIL_BLOCK_INVALID');
  if(block.type===5){opaque.push(structuredClone(block));continue;}
  let url;try{url=new URL(block.data);}catch{fail('LAST_NIGHT_DETAIL_MEDIA_UNVERIFIED');}
  if(url.protocol!=='https:'||url.username||url.password)fail('LAST_NIGHT_DETAIL_MEDIA_UNVERIFIED');media.push(url.toString());
 }
 return{providerDetail:structuredClone(detail),media:[...new Set(media)],opaqueBlocks:opaque,text:null,bodySource:opaque.length?'provider-detail-opaque-blocks':'provider-detail-media-only',
  aiTextAvailable:false,requiresApprovedMediaAnalysis:true,integrityKind:'complete-provider-nontext-envelope',opaqueSemantics:'uninterpreted'};
}
module.exports={completeDetailBlocks};
