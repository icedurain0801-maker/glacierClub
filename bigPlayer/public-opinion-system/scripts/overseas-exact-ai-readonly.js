'use strict';
const fs=require('node:fs'),path=require('node:path');
const {root,sha}=require('./overseas-real-artifact-audit');
const RESULT=path.join(root,'.temp','overseas-exact-ai-84-originals-20261010.result.json');
const EXPECTED='1fc87d426a38a2731df8f050c6eba0246293aede43eb30bc54873a7bb4e666ac';
async function readOnly(repo){
  const bytes=fs.readFileSync(RESULT);if(sha(bytes)!==EXPECTED)throw Error('AI_RESULT_HASH_MISMATCH');
  const receipt=JSON.parse(bytes),ids=receipt.selected.map(x=>x.contentId);
  if(ids.length!==3||new Set(ids).size!==3)throw Error('INVALID_EXACT_SCOPE');
  const marks=ids.map(()=>'?').join(',');
  const records=await repo.query(`SELECT c.id,c.external_id,c.source_id,c.account_id,c.game_id,c.community_id,c.fingerprint,
    a.analysis_level,a.analysis_version,a.content_fingerprint AS analysis_fingerprint,a.model_name AS analysis_model,a.input_tokens AS analysis_input_tokens,a.output_tokens AS analysis_output_tokens,a.total_tokens AS analysis_total_tokens,
    j.id AS analysis_job_id,j.status AS analysis_status,j.lease_owner AS analysis_owner,j.lease_until AS analysis_lease,j.content_fingerprint AS analysis_job_fingerprint,
    t.target_language,t.translation_version,t.content_fingerprint AS translation_fingerprint,t.model_name AS translation_model,t.input_tokens AS translation_input_tokens,t.output_tokens AS translation_output_tokens,t.total_tokens AS translation_total_tokens,
    CHAR_LENGTH(t.translated_title) AS translated_title_chars,CHAR_LENGTH(t.translated_body) AS translated_body_chars,SHA2(COALESCE(t.translated_body,''),256) AS translated_body_sha256,
    tj.id AS translation_job_id,tj.status AS translation_status,tj.lease_owner AS translation_owner,tj.lease_until AS translation_lease,tj.content_fingerprint AS translation_job_fingerprint
    FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id AND a.analysis_level='light' AND a.analysis_version=?
    LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile='light' AND j.analysis_version=?
    LEFT JOIN po_content_translations t ON t.content_id=c.id AND t.target_language='zh-CN' AND t.translation_version=?
    LEFT JOIN po_translation_jobs tj ON tj.content_id=c.id AND tj.target_language='zh-CN' AND tj.translation_version=?
    WHERE c.source_id=? AND c.id IN (${marks}) ORDER BY c.external_id`,[receipt.policy.analysisVersion,receipt.policy.analysisVersion,receipt.policy.translationVersion,receipt.policy.translationVersion,receipt.sourceId,...ids]);
  const verified=records.length===3&&records.every(r=>receipt.selected.some(s=>s.contentId===r.id&&s.fingerprint===r.fingerprint)
    &&[r.analysis_fingerprint,r.analysis_job_fingerprint,r.translation_fingerprint,r.translation_job_fingerprint].every(f=>f===r.fingerprint)
    &&r.analysis_status==='completed'&&r.translation_status==='completed'&&!r.analysis_owner&&!r.translation_owner&&!r.analysis_lease&&!r.translation_lease&&r.translated_body_chars>0);
  return {status:verified?'EXACT_REAL_RESULTS_VERIFIED':'NO_GO',readOnly:true,receiptSha256:EXPECTED,contentCount:records.length,httpCalls:receipt.calls.length,
    inputTokens:records.reduce((n,r)=>n+Number(r.analysis_input_tokens)+Number(r.translation_input_tokens),0),
    outputTokens:records.reduce((n,r)=>n+Number(r.analysis_output_tokens)+Number(r.translation_output_tokens),0),
    totalTokens:records.reduce((n,r)=>n+Number(r.analysis_total_tokens)+Number(r.translation_total_tokens),0),records};
}
async function main(){
  require('../server/src/runtimeEnv').loadRuntimeEnv();const {Repository}=require('../server/src/db/repository');const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});
  try{const result=await readOnly(repo);console.log(JSON.stringify(result,null,2));if(result.status==='NO_GO')process.exitCode=1;}finally{await repo.pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'NO_GO',code:e.code||'READONLY_FAILED'}));process.exitCode=1;});
module.exports={readOnly};
