'use strict';
const crypto=require('node:crypto');
const {BigPlayerH5Connector}=require('./bigPlayerH5Connector');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const kind=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
// Field names also use an allowlist: arbitrary provider keys can be PII.
function detailShape(payload,postId){
 const data=payload?.data,keys=['id','postId','content','post','detail','data','title','type','status','isDeleted','moderatorIsDelete'];
 const fields=value=>Object.fromEntries(keys.filter(key=>value!=null&&Object.hasOwn(value,key)).map(key=>[key,kind(value[key])]));
 const content=data?.content;
 const blocks=Array.isArray(content)?content.slice(0,100):[];
 const hasText=value=>{
  if(typeof value==='string')return Boolean(value.trim())&&!/^(https?:)?\/\//i.test(value.trim());
  if(Array.isArray(value))return value.some(hasText);
  if(!value||typeof value!=='object'||Number(value.type)===1)return false;
  return ['text','value','content','data','desc','description','title','children','blocks'].some(key=>hasText(value[key]));
 };
 const mediaPresent=blocks.some(block=>Number(block?.type)===1)||Boolean(content&&typeof content==='object'&&['url','imageUrl','src','images','media'].some(key=>content[key]!=null));
 const id=data?.id??data?.postId;
 return{idHash:hash(postId),dataType:kind(data),dataFields:fields(data),idMatches:data?.id!=null?String(data.id)===String(postId):null,
  idPresent:id!=null,idMatch:id==null?null:String(id)===String(postId),textPresent:hasText(content),mediaPresent,
  rejectionClass:kind(data)!=='object'?'data_not_object':id==null?'id_missing':String(id)!==String(postId)?'id_mismatch':!hasText(content)?'no_text':'valid_text',
  shapeHash:hash(JSON.stringify({dataType:kind(data),fields:fields(data),contentType:kind(content),blocks:blocks.map(block=>({type:block?.type??null,fields:fields(block)}))})),
  postIdMatches:data?.postId!=null?String(data.postId)===String(postId):null,contentType:kind(content),contentEmpty:content==null||(typeof content==='string'&&!content.trim())||(Array.isArray(content)&&content.length===0),
  nestedPostFields:fields(data?.post),nestedDetailFields:fields(data?.detail),nestedDataFields:fields(data?.data),
  blockShapes:blocks.map(block=>({kind:kind(block),blockType:Number.isSafeInteger(block?.type)?block.type:null,
    fields:Object.fromEntries(['text','value','content','data','children','blocks','url','imageUrl','src'].filter(key=>block!=null&&Object.hasOwn(block,key)).map(key=>[key,kind(block[key])]))}))};
}
class LastNightDetailShapeConnector extends BigPlayerH5Connector{
 constructor(config,{fetchImpl,credentialContext,allowedHashes,persistShape}){
  super(config,{fetchImpl,credentialContext});
  if(!Array.isArray(allowedHashes)||allowedHashes.length!==6||new Set(allowedHashes).size!==6||allowedHashes.some(value=>! /^[a-f0-9]{64}$/.test(value))||typeof persistShape!=='function')fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_INVALID');
  this.allowedHashes=new Set(allowedHashes);this.persistShape=persistShape;this.seen=new Set();
 }
 async requestQ1(apiPath,source,apiToken,params,...rest){
  if(apiPath==='/api/club/v1/auth/post/'){
   const idHash=hash(params.postId);if(!this.allowedHashes.has(idHash)||this.seen.has(idHash))fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_INVALID');this.seen.add(idHash);
   const payload=await super.requestQ1(apiPath,source,apiToken,params,...rest);
   await this.persistShape({phase:'detail_response_shape',...detailShape(payload,params.postId)});return payload;
  }
  return super.requestQ1(apiPath,source,apiToken,params,...rest);
 }
 async enrichQ1FeedItems(input){
  const selected=input.items.filter(item=>this.allowedHashes.has(hash(item.id)));
  if(selected.length!==6)fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_CHANGED');
  const result=await super.enrichQ1FeedItems({...input,items:selected});
  const map=new Map(result.items.map(item=>[String(item.id),item]));
  // Diagnostic-only: non-target details are intentionally NOT fetched. This
  // page must fail integrity and cannot be committed even if all six succeed.
  return{items:input.items.map(item=>map.get(String(item.id))||{...item,_contentIntegrity:{status:'summary_fallback',code:'DIAGNOSTIC_NOT_REQUESTED'}}),diagnostics:{attempted:6,enriched:result.diagnostics.enriched,fallback:input.items.length-result.diagnostics.enriched}};
 }
}
module.exports={LastNightDetailShapeConnector,detailShape};
