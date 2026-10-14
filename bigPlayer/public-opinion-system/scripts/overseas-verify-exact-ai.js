'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { root, sha, loadOriginals } = require('./overseas-real-artifact-audit');
const { normalizeSeverity, buildAnalysisReason } = require('../server/src/services/riskSeverityNormalizer');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const ACCOUNT = '75c8205f-37eb-4bdf-b6a4-f4f502e35658', GAME = '00000000-0000-0000-0000-000000000002', COMMUNITY = '00000000-0000-0000-0000-000000000102';
const IMPORT_PATH = path.join(root,'.temp','overseas-real-sample-import-1791602247059.json');
const IMPORT_SHA = '74ea03253954be84796995095509a96a831806a14f362dab29350971897752b1';
function selection() {
  const bytes = fs.readFileSync(IMPORT_PATH); if (sha(bytes) !== IMPORT_SHA) fail('IMPORT_RECEIPT_HASH_MISMATCH');
  const imported = JSON.parse(bytes), { items } = loadOriginals();
  const enriched = new Set(items.sites[0].items.filter(i=>i.rawPayload._contentIntegrity.status==='detail_enriched').map(i=>String(i.externalId)));
  const selected = imported.records.filter(r=>r.change==='inserted'&&enriched.has(r.externalId)).sort((a,b)=>a.externalId.localeCompare(b.externalId)).slice(0,3);
  if (selected.length!==3 || selected.some(r=>r.analysisJobs.length!==1||r.translationJobs.length!==1)) fail('EXACT_AI_SELECTION_INVALID');
  return selected;
}
function durableJson(filename,value){
  const fd=fs.openSync(filename,'wx');
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
async function transaction(repo, work) {
  const conn=await repo.pool.getConnection();let began=false,committing=false,dead=false;
  try {
    await conn.query('SET SESSION innodb_lock_wait_timeout=3');await conn.beginTransaction();began=true;
    const result=await work(conn);committing=true;await conn.commit();committing=false;began=false;return result;
  } catch(e) {
    if(committing){e.code='EXACT_AI_COMMIT_UNKNOWN';dead=true;conn.destroy();}
    else if(began){try{await conn.rollback();}catch{dead=true;conn.destroy();e.rollbackUnknown=true;}}
    throw e;
  } finally {if(!dead)conn.release();}
}
async function claim(repo, selected, owner, policy = {}) {
  if(!Array.isArray(selected)||!selected.length||selected.length>3||new Set(selected.map(e=>e.contentId)).size!==selected.length)fail('EXACT_AI_SELECTION_INVALID');
  return transaction(repo,async conn=>{
    const result=[];
    for(const entry of selected){
      const [[content]]=await conn.query('SELECT c.*,s.platform,g.region_code,g.name AS game_name,cm.name AS community_name FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id JOIN po_communities cm ON cm.id=c.community_id WHERE c.id=? FOR UPDATE',[entry.contentId]);
      if(!content||content.source_id!==SOURCE||content.account_id!==ACCOUNT||content.game_id!==GAME||content.community_id!==COMMUNITY||content.fingerprint!==entry.fingerprint||content.region_code!=='overseas'||content.is_deleted)fail('EXACT_AI_CONTENT_CHANGED');
      const jobs={};
      for(const [kind,table,id] of [['analysis','po_analysis_jobs',entry.analysisJobs[0].id],['translation','po_translation_jobs',entry.translationJobs[0].id]]){
        const [[job]]=await conn.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`,[id]);
        if(!job||job.content_id!==content.id||job.content_fingerprint!==content.fingerprint)fail('EXACT_AI_JOB_CHANGED');
        if(kind==='analysis' ? job.analysis_profile!=='light'||job.analysis_version!==policy.analysisVersion
          : job.target_language!=='zh-CN'||job.translation_version!==policy.translationVersion)fail('EXACT_AI_JOB_POLICY_CHANGED');
        if(job.status==='completed'){jobs[kind]={...job,skip:true};continue;}
        if(job.status!=='retryable'||String(job.next_retry_at).replace(/\.0+$/,'')!=='2099-01-01 00:00:00'||job.error_code!=='OVERSEAS_BOUNDED_VERIFICATION_HOLD'||job.lease_owner||job.lease_until)fail('EXACT_AI_JOB_NOT_HELD');
        // Keep the future retry fence during dispatch, including process crash
        // and lost claim ACK. Shared consumers cannot reclaim an expired lease.
        const [changed]=await conn.query(`UPDATE ${table} SET lease_owner=?,lease_until=DATE_ADD(NOW(),INTERVAL 900 SECOND),attempts=attempts+1 WHERE id=? AND status='retryable' AND next_retry_at='2099-01-01 00:00:00' AND error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD' AND content_fingerprint=? AND lease_owner IS NULL`,[owner,id,content.fingerprint]);
        if(changed.affectedRows!==1)fail('EXACT_AI_CLAIM_LOST');jobs[kind]={...job,lease_owner:owner};
      }
      result.push({content,jobs});
    }
    return result;
  });
}
async function saveAnalysis(repo, entry, analysis, owner) {
  return transaction(repo,async conn=>{
    const [[fence]]=await conn.query("SELECT j.id FROM po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id WHERE j.id=? AND j.status='retryable' AND j.next_retry_at='2099-01-01 00:00:00' AND j.error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD' AND j.analysis_profile='light' AND j.analysis_version=? AND j.lease_owner=? AND j.lease_until>NOW() AND j.content_fingerprint=c.fingerprint AND c.fingerprint=? AND c.source_id=? AND c.account_id=? AND c.game_id=? AND c.community_id=? AND c.is_deleted=0 AND EXISTS(SELECT 1 FROM po_games g WHERE g.id=c.game_id AND g.region_code='overseas' AND g.enabled=1) FOR UPDATE",[entry.jobs.analysis.id,entry.jobs.analysis.analysis_version,owner,entry.content.fingerprint,SOURCE,ACCOUNT,GAME,COMMUNITY]);
    if(!fence)fail('EXACT_AI_LEASE_LOST');
    const facade=Object.create(repo);facade.query=async(sql,args)=>(await conn.query(sql,args))[0];
    await repo.insertAnalysis.call(facade,entry.content.id,{...analysis,analysisLevel:'light',analysisVersion:entry.jobs.analysis.analysis_version,contentFingerprint:entry.content.fingerprint,triggerReason:'all_content'});
    await repo.addAiUsage.call(facade,{profile:'light',calls:1,inputTokens:analysis.inputTokens,outputTokens:analysis.outputTokens,totalTokens:analysis.totalTokens});
    const [changed]=await conn.query("UPDATE po_analysis_jobs SET status='completed',completed_at=NOW(),next_retry_at=NULL,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND lease_owner=? AND status='retryable' AND error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD'",[entry.jobs.analysis.id,owner]);
    if(changed.affectedRows!==1)fail('EXACT_AI_LEASE_LOST');
  });
}
async function saveTranslation(repo,entry,translation,owner){
  return transaction(repo,async conn=>{
    const [[fence]]=await conn.query("SELECT j.id FROM po_translation_jobs j JOIN po_contents c ON c.id=j.content_id WHERE j.id=? AND j.status='retryable' AND j.next_retry_at='2099-01-01 00:00:00' AND j.error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD' AND j.target_language='zh-CN' AND j.translation_version=? AND j.lease_owner=? AND j.lease_until>NOW() AND j.content_fingerprint=c.fingerprint AND c.fingerprint=? AND c.source_id=? AND c.account_id=? AND c.game_id=? AND c.community_id=? AND c.is_deleted=0 AND EXISTS(SELECT 1 FROM po_games g WHERE g.id=c.game_id AND g.region_code='overseas' AND g.enabled=1) FOR UPDATE",[entry.jobs.translation.id,entry.jobs.translation.translation_version,owner,entry.content.fingerprint,SOURCE,ACCOUNT,GAME,COMMUNITY]);
    if(!fence)fail('EXACT_AI_LEASE_LOST');
    const facade=Object.create(repo);facade.query=async(sql,args)=>(await conn.query(sql,args))[0];
    await repo.upsertContentTranslation.call(facade,entry.content.id,{...translation,targetLanguage:'zh-CN',translationVersion:entry.jobs.translation.translation_version,contentFingerprint:entry.content.fingerprint});
    const [changed]=await conn.query("UPDATE po_translation_jobs SET status='completed',completed_at=NOW(),next_retry_at=NULL,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND lease_owner=? AND status='retryable' AND error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD'",[entry.jobs.translation.id,owner]);
    if(changed.affectedRows!==1)fail('EXACT_AI_LEASE_LOST');
  });
}
async function main() {
  if(process.argv[2]!=='--execute')fail('EXECUTION_FLAG_REQUIRED');
  require('../server/src/runtimeEnv').loadRuntimeEnv();process.env.NODE_TLS_REJECT_UNAUTHORIZED='1';
  const {Repository}=require('../server/src/db/repository'),{AiAnalyzer}=require('../server/src/integrations/aiAnalyzer'),{AiTranslator}=require('../server/src/integrations/aiTranslator');
  const repo=new Repository({...process.env,DB_POOL_SIZE:'1'}), ai=new AiAnalyzer(process.env), translator=new AiTranslator(process.env,{reserveCall:limit=>repo.reserveTranslationCall(limit)});
  ai.maxRetries=0;translator.maxRetries=0;
  // Bounded validation consumes only light analysis; it does not create a deep job or notify anyone.
  if(!ai.configured('light')||!translator.configured()){await repo.pool.end();fail('EXACT_AI_NOT_CONFIGURED');}
  const selected=selection(),owner=`q1-daily:${process.pid}:${SOURCE}:2026-10-10:${crypto.randomUUID()}`;
  const evidencePath=path.join(root,'.temp','overseas-exact-ai-84-originals-20261010.json');
  const result={status:'INTENT',sourceId:SOURCE,owner,importReceiptSha256:IMPORT_SHA,contentBudget:3,httpBudget:6,maxRetries:0,selected,
    policy:{analysisProfile:'light',analysisVersion:ai.profiles.light.version,translationTarget:'zh-CN',translationVersion:process.env.AI_TRANSLATION_VERSION||'translation-v1'},
    implementationSha256:sha(fs.readFileSync(__filename)),calls:[],results:[],fee:null,feeBasis:'provider unit prices not supplied'};
  // One immutable execution reservation for this exact sample; existing intent
  // requires read-only reconciliation instead of another provider dispatch.
  try{durableJson(evidencePath,result);}catch(e){await repo.pool.end();throw e;}
  let revision=0;
  // Every revision is immutable and fsynced. A half-written newest revision
  // leaves all prior owner/claim/dispatch evidence available for reconciliation.
  const persist=()=>durableJson(evidencePath.replace(/\.json$/,`-progress-${String(++revision).padStart(3,'0')}.json`),result);
  const nativeFetch=globalThis.fetch;let stage=null,claimed=[];
  globalThis.fetch=async(url,options)=>{
    if(!stage||result.calls.length>=6||result.calls.filter(c=>c.contentId===stage.contentId).length>=2)fail('EXACT_AI_HTTP_BUDGET_EXCEEDED');
    const expected=new URL(stage.kind==='analysis'?ai.url:translator.url);
    if(new URL(url).origin!==expected.origin)fail('EXACT_AI_HTTP_ORIGIN_INVALID');
    const call={index:result.calls.length+1,...stage,status:'DISPATCH_INTENT'};result.calls.push(call);persist();
    try{const response=await nativeFetch(url,{...options,redirect:'manual'});const bytes=Buffer.from(await response.clone().arrayBuffer());
      Object.assign(call,{status:'RETURNED',httpStatus:response.status,responseSha256:sha(bytes),responseBytes:bytes.length});persist();return response;
    }catch(e){call.status='HTTP_OUTCOME_UNKNOWN';call.errorCode=e.code||e.name;persist();throw e;}
  };
  try {
    claimed=await claim(repo,selected,owner,result.policy);result.status='EXACT_JOBS_CLAIMED';persist();
    for(const entry of claimed){
      const content=entry.content, record={contentId:content.id,externalId:content.external_id,fingerprint:content.fingerprint};
      result.results.push(record);
      if(!entry.jobs.analysis.skip){
        stage={kind:'analysis',contentId:content.id};
        const [rawAnalysis]=await ai.analyzeBatch([{title:content.title,body:content.body,fingerprint:content.fingerprint,platform:content.platform,gameId:content.game_id,communityId:content.community_id,regionCode:content.region_code,gameName:content.game_name,communityName:content.community_name}],'light');
        const normalized=normalizeSeverity({...rawAnalysis,title:content.title,body:content.body});
        const analysis={...rawAnalysis,severity:normalized.severity,originalSeverity:normalized.originalSeverity,analysisReason:buildAnalysisReason(rawAnalysis.reason,normalized)};
        const resultFile=path.join(root,'.temp',`overseas-exact-ai-result-${entry.jobs.analysis.id}.json`);
        durableJson(resultFile,analysis);
        record.analysis={status:'HTTP_RETURNED',jobId:entry.jobs.analysis.id,resultPath:resultFile,resultSha256:sha(fs.readFileSync(resultFile)),model:analysis.modelName,usage:{inputTokens:analysis.inputTokens,outputTokens:analysis.outputTokens,totalTokens:analysis.totalTokens,estimated:analysis.usageEstimated}};persist();
        await saveAnalysis(repo,entry,analysis,owner);record.analysis.status='completed';persist();
      }else record.analysis={status:'completed',providerCallSkipped:true};
      if(!entry.jobs.translation.skip){
        stage={kind:'translation',contentId:content.id};const translation=await translator.translate(content);
        const resultFile=path.join(root,'.temp',`overseas-exact-translation-result-${entry.jobs.translation.id}.json`);
        durableJson(resultFile,translation);
        record.translation={status:'HTTP_RETURNED',jobId:entry.jobs.translation.id,resultPath:resultFile,resultSha256:sha(fs.readFileSync(resultFile)),model:translation.modelName,usage:translation.usage};persist();
        await saveTranslation(repo,entry,translation,owner);
        record.translation.status='completed';persist();
      }else record.translation={status:'completed',providerCallSkipped:true};
    }
    result.status='EXACT_AI_AND_TRANSLATION_COMPLETED';persist();
    const finalPath=evidencePath.replace(/\.json$/,'.result.json');durableJson(finalPath,result);
    console.log(JSON.stringify({status:result.status,contents:result.results.length,httpCalls:result.calls.length,evidencePath:finalPath,evidenceSha256:sha(fs.readFileSync(finalPath)),results:result.results.map(({contentId,externalId,analysis,translation})=>({contentId,externalId,analysisStatus:analysis.status,translationStatus:translation.status,analysisUsage:analysis.usage,translationUsage:translation.usage}))},null,2));
  }catch(e){
    result.status=e.code==='EXACT_AI_COMMIT_UNKNOWN'?'COMMIT_UNKNOWN':'EXACT_AI_STOPPED';result.errorCode=e.code||'EXACT_AI_FAILED';
    // Stop automatic retries of any remaining exact jobs, without touching a
    // completed result or another consumer's lease. Provider calls are never repeated here.
    if(e.code!=='EXACT_AI_COMMIT_UNKNOWN')for(const entry of claimed)for(const [kind,table]of [['analysis','po_analysis_jobs'],['translation','po_translation_jobs']]){
      try{await repo.query(`UPDATE ${table} SET lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=? AND status='retryable' AND error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD'`,[entry.jobs[kind].id,owner]);}catch{result.leaseCleanupUnconfirmed=true;}
    }
    try{persist();}catch{}throw e;
  }finally{globalThis.fetch=nativeFetch;try{await repo.pool.end();}catch{}}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'EXACT_AI_STOPPED',errorCode:e.code||'EXACT_AI_FAILED'}));process.exitCode=1;});
module.exports={selection,claim,saveAnalysis,saveTranslation,transaction};
