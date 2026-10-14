'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Restores rich-content evidence after the frozen legacy normalizer, without
// changing shared normalization or issuing any additional writes.
function richContentQuery(query){const inputState=new Map();return async(sql,params=[])=>{
 if(sql.startsWith('INSERT INTO po_contents ')){
  const columns=sql.match(/^INSERT INTO po_contents \(([^)]+)\)/)?.[1].split(',').map(value=>value.trim());
  if(!columns)fail('LAST_NIGHT_RICH_INSERT_INVALID');
  const values=sql.match(/ VALUES \((.*?)\)(?: ON DUPLICATE|$)/)?.[1].split(',').map(value=>value.trim());
  if(!values||values.length!==columns.length||values.some((value,index)=>value!=='?'&&index<params.length)
    || values.filter(value=>value==='?').length!==params.length)fail('LAST_NIGHT_RICH_INSERT_INVALID');
  const at=key=>columns.indexOf(key),rawIndex=at('raw_payload');let raw;
  try{raw=typeof params[rawIndex]==='string'?JSON.parse(params[rawIndex]):params[rawIndex];}catch{fail('LAST_NIGHT_RICH_INSERT_INVALID');}
  const detail=raw?._lastNightProviderDetail;
  if(detail){
   if(['id','source_id','account_id','game_id','community_id','external_id','title','author_name','body','is_deleted','fingerprint','raw_payload'].some(key=>at(key)<0)
     || params[at('game_id')]!==GAME_ID || params[at('community_id')]!==COMMUNITY_ID || !params[at('account_id')]
     || detail.content.some(block=>![1,5].includes(block?.type)||typeof block.data!=='string'||!block.data.trim()))fail('LAST_NIGHT_RICH_INSERT_INVALID');
   if(params[at('source_id')]!==SOURCE_ID||raw._lastNightAnalysisBasis?.bodyTextAvailable!==false||!Array.isArray(detail.content)||!detail.content.length
     || String(detail.id??detail.postId)!==String(params[at('external_id')])||raw._lastNightProviderDetailSha256!==crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex'))fail('LAST_NIGHT_RICH_INSERT_INVALID');
   const next=[...params],deleted=detail.isDeleted===true||detail.moderatorIsDelete===true||(detail.status!=null&&Number(detail.status)<0);
   next[at('body')]='';next[at('is_deleted')]=deleted?1:0;
   next[at('fingerprint')]=crypto.createHash('sha256').update(JSON.stringify({title:next[at('title')]||'',author:next[at('author_name')]||'',content:detail.content,isDeleted:deleted})).digest('hex');
   if(at('id')>=0)inputState.set(next[at('id')],{deleted,empty:!String(next[at('title')]||'').trim(),fingerprint:next[at('fingerprint')]});
   return query(sql,next);
  }
 }
 if(sql.startsWith('INSERT INTO po_analysis_jobs ')){
  const known=inputState.get(params[1]);
  if(known){const next=[...params];next[4]=known.fingerprint;next[5]='lastnight_explicit_title_only';
   if(known.deleted||known.empty){
    // Explicit INSERT includes the failure reason for NEW jobs. Existing jobs
    // (including running/completed) are preserved, never forced to failed.
    return query("INSERT INTO po_analysis_jobs (id,content_id,analysis_profile,analysis_version,content_fingerprint,trigger_reason,matched_keywords,status,error_code) VALUES (?,?,?,?,?,?,?,'failed',?) ON DUPLICATE KEY UPDATE id=id",
     [...next.slice(0,7),known.deleted?'LAST_NIGHT_CONTENT_DELETED':'LAST_NIGHT_NO_ANALYZABLE_TEXT']);
   }
   return query(sql,next);
  }
 }
 return query(sql,params);
};}
module.exports={richContentQuery};
