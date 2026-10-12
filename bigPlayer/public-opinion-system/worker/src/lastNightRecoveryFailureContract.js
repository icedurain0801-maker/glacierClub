'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Strict field allowlist: never serialize provider payload, body, URLs or auth.
function diagnoseDetailPage(items) {
 if(!Array.isArray(items))fail('LAST_NIGHT_DIAGNOSTIC_INPUT_INVALID');
 return items.map(item=>{
   const integrity=item?.rawPayload?._contentIntegrity;
   const type=['post','activity','info'].includes(item?.contentType)?item.contentType:'unsupported';
   const status=['detail_enriched','summary_fallback'].includes(integrity?.status)?integrity.status:'missing_or_invalid';
   const known=['DETAIL_RESPONSE_INVALID','DETAIL_FETCH_FAILED','DETAIL_REQUEST_FAILED','HTTP_ERROR','HTTP_401','HTTP_403','HTTP_404','HTTP_429','HTTP_500','HTTP_502','HTTP_503','HTTP_504','REQUEST_TIMEOUT'];
   return{idHash:item?.externalId==null?null:crypto.createHash('sha256').update(String(item.externalId)).digest('hex'),contentType:type,integrityStatus:status,
     integrityCode:known.includes(integrity?.code)?integrity.code:integrity?.code==null?null:'unclassified',hasExternalId:Boolean(item?.externalId),accepted:type!=='unsupported'&&status==='detail_enriched'&&Boolean(item?.externalId)};
 });
}
// Inputs MUST be authenticated journal objects by the caller. This pure proof
// is not a DB lease acquisition or a production admission gate.
function bindCommittedSession({base,session,approvedBaseSha,approvedSessionSha,baseSha,sessionSha}) {
 if(!/^[a-f0-9]{64}$/.test(baseSha||'') || !/^[a-f0-9]{64}$/.test(sessionSha||'')
   || baseSha!==approvedBaseSha || sessionSha!==approvedSessionSha || base?.phase!=='recovery_page_committed'
   || session?.phase!=='resume_committed' || base.sourceId!==SOURCE_ID || session.sourceId!==SOURCE_ID
   || session.accountId!==base.accountId || !base.afterCheckpoint || !base.sourceConfig
   || base.token?.parentId!==session.token?.parentId || base.token?.accountId!==session.token?.accountId
   || session.token?.accountId!==base.accountId || !session.token?.ownerId
   || Number(session.token.epoch)!==Number(base.token.epoch)+1)fail('LAST_NIGHT_FAILURE_SESSION_BINDING_INVALID');
 return{...base,token:{...session.token},failureRecovery:{baseSha,sessionSha,requiresLockedCheckpointRecheck:true,requiresNoActiveRun:true,productionAdmitted:false}};
}
function bindForwardSession({base,session,baseSha}) {
 const prior=session?.recoveryBase;
 const withoutToken=value=>{const {token,failureRecovery,...rest}=value||{};return rest;};
 if(session?.phase!=='forward_page_precommit_failed' || session.pageCommitAttempted!==false || session.errorCode!=='LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED' || session.bindings?.baseSha!==baseSha
   || JSON.stringify(withoutToken(prior))!==JSON.stringify(withoutToken(base))
   || session.accountId!==base.accountId || session.sourceId!==base.sourceId
   || JSON.stringify(session.beforeToken)!==JSON.stringify(prior.token)
   || session.token?.parentId!==base.token?.parentId || session.token?.accountId!==base.accountId
   || !/^lastnight-independent:[a-f0-9-]{36}$/.test(session.token?.ownerId||'')
   || !Number.isSafeInteger(session.token.epoch) || session.token.epoch!==Number(session.beforeToken.epoch)+1
   || Number(session.beforeToken.epoch)<=Number(base.token.epoch)
   || JSON.stringify(session.afterCheckpoint)!==JSON.stringify(base.afterCheckpoint)
   || session.httpExecuted!==true || session.checkpointUnchanged!==true)fail('LAST_NIGHT_FAILURE_SESSION_BINDING_INVALID');
 return{...base,token:session.token};
}
module.exports={diagnoseDetailPage,bindCommittedSession,bindForwardSession};
