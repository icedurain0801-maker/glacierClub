'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {runBoundedLastNight}=require('../worker/src/lastNightBoundedRuntime');
const {protectReadonlyRepository}=require('../worker/src/lastNightReadonlyGuard');
const {verifyInventory}=require('./lastnight-runtime-inventory');
const {enforceStrictTls}=require('../worker/src/lastNightTransportSafety');
const {createEvidenceJournal}=require('../worker/src/lastNightEvidenceJournal');
const {runRecovery}=require('../worker/src/lastNightRecovery');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(argv=process.argv) {
  const tls= enforceStrictTls();
  if(argv.length!==4||argv[2]!=='--approved-plan'||!path.isAbsolute(argv[3])) fail('LAST_NIGHT_EXPLICIT_PLAN_REQUIRED');
  const plan=JSON.parse(fs.readFileSync(argv[3],'utf8'));
  if(plan.approved!==true||plan.authorizationMode!=='lastnight-bounded-current-runtime'||plan.cliSha256!==sha(__filename)
    ||!path.isAbsolute(plan.envFile)||!path.isAbsolute(plan.output)||fs.existsSync(plan.output)) fail('LAST_NIGHT_APPROVED_PLAN_REQUIRED');
  const recovery=['restore-content','requeue-exact','observe-ai'].includes(plan.stage);
  if(!['metadata','collect','store-ai'].includes(plan.stage)&&!recovery) fail('LAST_NIGHT_STAGE_NOT_RELEASED');
  // Execution still requires the separately bound, approved plan and complete inventory.
  verifyInventory(plan);
  if(!plan.accountId||!plan.expectedIdentity||(!recovery&&!['direct-api-token','site-exchange'].includes(plan.tokenMode))
    ||!['2','9','16'].includes(String(plan.languageId))) fail('LAST_NIGHT_PLAN_INVALID');
  if(!recovery&&plan.stage!=='metadata'&&(!plan.publishedFrom||!plan.publishedTo||!Number.isFinite(Date.parse(plan.publishedFrom))
    ||!Number.isFinite(Date.parse(plan.publishedTo))||Date.parse(plan.publishedTo)<=Date.parse(plan.publishedFrom)
    ||Date.parse(plan.publishedTo)-Date.parse(plan.publishedFrom)>86400000)) fail('LAST_NIGHT_WINDOW_INVALID');
  if(plan.stage==='store-ai'||recovery) {
    const evidenceRoot=path.resolve(__dirname,'../../..','.temp/bigplayer-recovery-20261009');
    if(!path.isAbsolute(plan.evidenceDirectory||'')||!fs.existsSync(plan.evidenceDirectory)||!fs.statSync(plan.evidenceDirectory).isDirectory()) fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
    const relative=path.relative(evidenceRoot,fs.realpathSync(plan.evidenceDirectory));
    if(relative.startsWith('..')||path.isAbsolute(relative)) fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
  }
  process.loadEnvFile(plan.envFile);
  enforceStrictTls();
  if(process.env.DATABASE_URL||!process.env.DB_USER||process.env.DB_HOST!=='127.0.0.1'||Number(process.env.DB_PORT)!==3306||process.env.DB_NAME!=='public_opinion') fail('LAST_NIGHT_DB_TARGET_MISMATCH');
  process.env.PUBLIC_OPINION_SERVICE_MODE='1';process.env.PUBLIC_OPINION_ENV_FILE=plan.envFile;
  const {Repository}=require('../server/src/db/repository');
  const repo=new Repository({...process.env,DB_POOL_SIZE:'2',SYNC_UPSERT_MAX_RETRIES:'1'});
  const protectedStage=plan.stage==='store-ai'||recovery?null:protectReadonlyRepository(repo,plan.accountId);
  let persistEvidence;
  if(plan.stage==='store-ai'||recovery) {
    persistEvidence=createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:crypto.randomUUID()});
    const original=repo.pool.query.bind(repo.pool);repo.pool.query=(sql,params)=>original({sql,timeout:8000},params);
  }
  let report;
  try {
    report=recovery?await runRecovery({plan,repo,env:process.env,persistEvidence}):await runBoundedLastNight({plan,repo:protectedStage?.repo||repo,transport:globalThis.fetch,env:process.env,persistEvidence});
    report.dbGuard=protectedStage?.evidence||{mode:'exact_protected_store_candidate'};
    report.tls=tls;
  } finally {
    for(const connection of repo.pool.pool._allConnections.toArray()) connection.destroy();
    await repo.pool.end().catch(()=>{});
  }
  fs.writeFileSync(plan.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const accepted={metadata:['PASS_BOUNDED_STAGE'],collect:['PASS_BOUNDED_STAGE'],
    'store-ai':['STORE_COMMITTED_AI_COMPLETED'], 'requeue-exact':['EXACT_AI_QUEUED'],
    'observe-ai':['EXACT_AI_COMPLETED'],'restore-content':['EXISTING_CONTENT_RESTORED_NEW_HISTORY_RETAINED']};
  if(!accepted[plan.stage].includes(report.status)) fail(report.errorCode||'LAST_NIGHT_STAGE_FAILED');
  console.log(JSON.stringify({status:report.status,stage:plan.stage,requests:report.requests?.length||0,stored:report.stored}));
}
if(require.main===module) main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_FAILED');process.exitCode=1;});
module.exports={main};
