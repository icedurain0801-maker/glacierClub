'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../../..'),root=path.resolve(project,'../..'),temp=path.join(root,'.temp');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const artifacts=[];
function load(p,expected){const b=fs.readFileSync(p),h=sha(b);if(expected)assert.equal(h,expected);artifacts.push({path:p,sha256:h});return JSON.parse(b);}
const manifestPath=path.join(project,'.Codex/docs/2026-10/2026-10-10/v053_real_recovery_frozen_manifest.json');
const manifest=load(manifestPath,'6f64e566460313792bba2c80ec62b299ea1f81f0c39ec6be9bd1f77f8b1d47b5');
const verifyManifest=()=>{for(const entry of [...manifest.files,...manifest.evidence])assert.equal(sha(fs.readFileSync(entry.path)),entry.sha256);};
verifyManifest();
const auth=load(path.join(temp,'overseas-formal-auth-readonly-1791602990594.json'),'bf9169b698dc8d73c31ea9b6fae73268485b3110ec30210e0744ddb02977078c');
assert.equal(auth.status,'FORMAL_COMMUNITY_AUTH_VERIFIED');assert.equal(auth.attemptCount,3);assert.equal(auth.sentCount,3);assert.equal(auth.blockedCount,0);assert.equal(auth.contentRequests,0);
assert.equal(auth.sessionSha256,sha(fs.readFileSync(path.join(project,'server/src/connectors/overseasBigPlayerSiteSession.js'))));
assert.equal(auth.sites.length,3);assert.ok(auth.sites.every(s=>s.verified));assert.deepEqual(auth.sites.map(s=>s.persistedAuthStatus),['authorized','unknown','unknown']);
assert.ok(auth.requests.every(r=>r.status===200&&r.capability==='/api/club/v1/auth/user/context'));
const base=path.join(temp,'overseas-exact-ai-84-originals-20261010');
const intent=load(base+'.json','ac1ebe3f470ccb65e11089c1ce6538c93eda932ba6a79e1b44a56668f2d25826');
const final=load(base+'.result.json','1fc87d426a38a2731df8f050c6eba0246293aede43eb30bc54873a7bb4e666ac');
const original=load(path.join(temp,'overseas-real-sample-import-1791602247059.json'),'74ea03253954be84796995095509a96a831806a14f362dab29350971897752b1');
const originalItems=load(path.join(root,'bigPlayer/.temp/overseas-real-small-batch-items-1791599835385.json'),'b2f84e03b7c675b05843aa4bd8fe127730d58ca4ba7655c07ba7bb5aaba8acca');
assert.equal(intent.status,'INTENT');assert.equal(final.status,'EXACT_AI_AND_TRANSLATION_COMPLETED');
assert.equal(final.owner,intent.owner);assert.deepEqual(final.selected,intent.selected);assert.equal(final.selected.length,3);
assert.equal(final.contentBudget,3);assert.equal(final.httpBudget,6);assert.equal(final.maxRetries,0);
assert.equal(final.implementationSha256,sha(fs.readFileSync(path.join(project,'scripts/overseas-verify-exact-ai.js'))));
assert.equal(final.calls.length,6);assert.equal(final.results.length,3);
const selectedIds=final.selected.map(s=>s.contentId);
assert.equal(new Set(selectedIds).size,3);
for(const s of final.selected){const old=original.records.find(r=>r.contentId===s.contentId);assert.ok(old);assert.equal(old.change,'inserted');assert.deepEqual(old,s);assert.equal(originalItems.sites[0].items.find(i=>String(i.externalId)===s.externalId).rawPayload._contentIntegrity.status,'detail_enriched');}
for(const [i,c]of final.calls.entries()){assert.equal(c.index,i+1);assert.equal(c.status,'RETURNED');assert.equal(c.httpStatus,200);assert.ok(selectedIds.includes(c.contentId));}
const rawResults=new Map(),totals={analysis:{inputTokens:0,outputTokens:0,totalTokens:0},translation:{inputTokens:0,outputTokens:0,totalTokens:0}};
for(const r of final.results){
  const s=final.selected.find(s=>s.contentId===r.contentId);assert.ok(s);assert.equal(r.fingerprint,s.fingerprint);
  for(const kind of ['analysis','translation']){
    const e=r[kind];assert.equal(e.status,'completed');assert.equal(e.jobId,s[kind+'Jobs'][0].id);
    const p=path.resolve(e.resultPath);assert.equal(path.dirname(p),temp);
    const raw=load(p,e.resultSha256);rawResults.set(e.jobId,raw);
    assert.equal(final.calls.filter(c=>c.contentId===r.contentId&&c.kind===kind).length,1);
    for(const k of ['inputTokens','outputTokens','totalTokens'])totals[kind][k]+=e.usage[k];
  }
}
const revisions=fs.readdirSync(temp).filter(n=>/^overseas-exact-ai-84-originals-20261010-progress-\d{3}\.json$/.test(n)).sort();
let priorCalls=0;const preDispatch=new Set();
for(const [index,n]of revisions.entries()){
  assert.ok(n.endsWith(`-${String(index+1).padStart(3,'0')}.json`));const r=load(path.join(temp,n));
  assert.equal(r.owner,final.owner);assert.deepEqual(r.selected,final.selected);assert.ok(r.calls.length>=priorCalls&&r.calls.length<=6);priorCalls=r.calls.length;
  for(const c of r.calls)if(c.status==='DISPATCH_INTENT')preDispatch.add(c.index);
}
assert.equal(preDispatch.size,6);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp,revisions.at(-1)))),final);
async function run(){
  require(path.join(project,'server/src/runtimeEnv')).loadRuntimeEnv();
  const{Repository}=require(path.join(project,'server/src/db/repository'));
  const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});let conn;const trace=[];
  const q=async(sql,params=[])=>{assert.ok(/^SELECT\b/.test(sql));assert.ok(!/FOR UPDATE|OUTFILE|DUMPFILE/.test(sql));trace.push({sql,parameterCount:params.length});return(await conn.query({sql,timeout:15000},params))[0];};
  try{
    conn=await repo.pool.getConnection();await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const cm=selectedIds.map(()=>'?').join(',');
    const content=await q(`SELECT id,source_id,account_id,game_id,community_id,fingerprint FROM po_contents WHERE id IN (${cm})`,selectedIds);assert.equal(content.length,3);
    for(const c of content){assert.equal(c.source_id,final.sourceId);assert.equal(c.account_id,'75c8205f-37eb-4bdf-b6a4-f4f502e35658');assert.equal(c.game_id,'00000000-0000-0000-0000-000000000002');assert.equal(c.community_id,'00000000-0000-0000-0000-000000000102');assert.equal(c.fingerprint,final.selected.find(s=>s.contentId===c.id).fingerprint);}
    const analysis=await q(`SELECT content_id,analysis_level,analysis_version,content_fingerprint,model_name,input_tokens,output_tokens,total_tokens,SHA2(COALESCE(summary,''),256) AS summary_sha FROM po_analyses WHERE content_id IN (${cm})`,selectedIds);
    const translations=await q(`SELECT content_id,target_language,translation_version,content_fingerprint,model_name,input_tokens,output_tokens,total_tokens,SHA2(COALESCE(translated_title,''),256) AS title_sha,SHA2(COALESCE(translated_body,''),256) AS body_sha FROM po_content_translations WHERE content_id IN (${cm}) AND target_language=? AND translation_version=?`,[...selectedIds,final.policy.translationTarget,final.policy.translationVersion]);
    assert.equal(analysis.length,3);assert.equal(translations.length,3);
    const jobs=[];
    for(const kind of ['analysis','translation']){
      const jids=final.results.map(r=>r[kind].jobId),marks=jids.map(()=>'?').join(',');
      const rows=await q(`SELECT id,content_id,content_fingerprint,status,lease_owner,lease_until,error_code,next_retry_at,attempts,completed_at FROM po_${kind}_jobs WHERE id IN (${marks})`,jids);
      assert.equal(rows.length,3);
      for(const j of rows){const s=final.selected.find(s=>s.contentId===j.content_id);assert.ok(s);assert.equal(j.id,s[kind+'Jobs'][0].id);assert.equal(j.content_fingerprint,s.fingerprint);assert.equal(j.status,'completed');assert.equal(j.lease_owner,null);assert.equal(j.lease_until,null);assert.equal(j.next_retry_at,null);assert.equal(j.error_code,null);assert.equal(j.attempts,1);assert.ok(j.completed_at);}
      jobs.push(...rows);
    }
    for(const r of final.results)for(const kind of ['analysis','translation']){
      const e=r[kind],raw=rawResults.get(e.jobId),row=(kind==='analysis'?analysis:translations).find(x=>x.content_id===r.contentId);
      assert.ok(row);assert.equal(row.content_fingerprint,r.fingerprint);assert.equal(row.model_name,e.model);
      for(const[k,db]of[['inputTokens','input_tokens'],['outputTokens','output_tokens'],['totalTokens','total_tokens']])assert.equal(Number(row[db]),e.usage[k]);
      if(kind==='analysis'){assert.equal(row.analysis_level,'light');assert.equal(row.analysis_version,final.policy.analysisVersion);assert.equal(row.summary_sha,sha(raw.summary||''));}
      else{assert.equal(row.target_language,'zh-CN');assert.equal(row.translation_version,final.policy.translationVersion);assert.equal(row.title_sha,sha(raw.translatedTitle||''));assert.equal(row.body_sha,sha(raw.translatedBody||''));}
    }
    const allIds=original.records.map(r=>r.contentId),am=allIds.map(()=>'?').join(',');
    const remaining=[];
    for(const kind of ['analysis','translation']){
      const rows=await q(`SELECT id,content_id,status,error_code,next_retry_at,lease_owner,lease_until FROM po_${kind}_jobs WHERE content_id IN (${am}) AND error_code=?`,[...allIds,'OVERSEAS_BOUNDED_VERIFICATION_HOLD']);
      assert.equal(rows.length,6);for(const j of rows){assert.equal(j.status,'retryable');assert.ok(j.next_retry_at.startsWith('2099-01-01'));assert.equal(j.lease_owner,null);assert.equal(j.lease_until,null);}remaining.push(...rows);
    }
    const usage=await q("SELECT usage_date,profile,call_count,input_tokens,output_tokens,total_tokens FROM po_ai_usage_daily WHERE usage_date=UTC_DATE() AND profile=?",['light']);
    // Aggregate ledger may include other legitimate consumers; no before snapshot means no exact delta assertion.
    assert.equal(usage.length,1);assert.ok(Number(usage[0].call_count)>=3);
    const translationBudget=await q('SELECT usage_date,call_count FROM po_translation_call_budget WHERE usage_date=UTC_DATE()');
    assert.equal(translationBudget.length,1);assert.ok(Number(translationBudget[0].call_count)>=3);
    await conn.rollback();
    verifyManifest();
    const output={result:'EXACT_AI_REAL_RESULTS_READONLY_VERIFIED',capturedAt:new Date().toISOString(),artifacts,manifestVerifiedBeforeAfter:true,manifestFiles:manifest.files.length,manifestEvidence:manifest.evidence.length,formalSessionReceiptVerified:true,auth,content,analysis,translations,jobs,remainingHeldJobs:remaining,usageAggregate:usage,translationBudgetAggregate:translationBudget,usageDeltaIndependentlyVerified:false,totals,progressRevisions:revisions.length,preDispatchIntents:preDispatch.size,sqlTrace:trace,snapshotReadOnly:true,closedWithRollback:true,qaHttpCalls:0,qaAiCalls:0};
    const p=path.join(temp,`qa-v046-exact-ai-readonly-${Date.now()}.json`);fs.writeFileSync(p,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({result:output.result,evidencePath:p,sha256:sha(fs.readFileSync(p)),contents:3,httpCalls:6,completedJobs:jobs.length,remainingHeldJobs:remaining.length,totals,usageDeltaIndependentlyVerified:false},null,2));
  }finally{if(conn)conn.release();await repo.pool.end();}
}
run().catch(e=>{console.error(JSON.stringify({result:'QA_FAILED',code:e.code||'AUDIT_FAILED',assertion:e.code==='ERR_ASSERTION'?e.message:undefined}));process.exitCode=1;});
