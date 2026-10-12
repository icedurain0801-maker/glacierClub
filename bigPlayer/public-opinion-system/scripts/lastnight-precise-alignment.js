'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyInventory}=require('./lastnight-runtime-inventory');
const {preciseAlignment}=require('../worker/src/lastNightPreciseAlignment');
const {createEvidenceJournal}=require('../worker/src/lastNightEvidenceJournal');
const {enforceStrictTls}=require('../worker/src/lastNightTransportSafety');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(argv=process.argv) {
  enforceStrictTls();
  if(argv.length!==4||argv[2]!=='--approved-plan'||!path.isAbsolute(argv[3]))fail('LAST_NIGHT_EXPLICIT_PLAN_REQUIRED');
  const plan=JSON.parse(fs.readFileSync(argv[3],'utf8'));
  if(plan.approved!==true||plan.authorizationMode!=='lastnight-bounded-current-runtime'||plan.alignmentCliSha256!==sha(__filename)
    ||!['inspect-alignment','apply-alignment'].includes(plan.stage)||!path.isAbsolute(plan.output)||fs.existsSync(plan.output)||!path.isAbsolute(plan.envFile))fail('LAST_NIGHT_APPROVED_PLAN_REQUIRED');
  verifyInventory(plan);
  const root=path.resolve(__dirname,'../../..','.temp/bigplayer-recovery-20261009');
  if(plan.stage==='apply-alignment') {
    if(!path.isAbsolute(plan.evidenceDirectory||'')||!fs.statSync(plan.evidenceDirectory).isDirectory())fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
    const relative=path.relative(root,fs.realpathSync(plan.evidenceDirectory));if(relative.startsWith('..')||path.isAbsolute(relative))fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
  }
  process.loadEnvFile(plan.envFile);enforceStrictTls();
  if(process.env.DATABASE_URL||!process.env.DB_USER||process.env.DB_HOST!=='127.0.0.1'||Number(process.env.DB_PORT)!==3306||process.env.DB_NAME!=='public_opinion')fail('LAST_NIGHT_DB_TARGET_MISMATCH');
  const {Repository}=require('../server/src/db/repository');const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});
  let report;
  try{report=await preciseAlignment({pool:repo.pool,accountId:plan.accountId,expectedIdentity:plan.expectedIdentity,approvedPlanHash:plan.alignmentPlanHash,
    inspectOnly:plan.stage==='inspect-alignment',persistEvidence:plan.stage==='apply-alignment'?createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:crypto.randomUUID()}):undefined});}
  catch(error){report={status:'NO_GO',errorCode:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_ALIGNMENT_FAILED'};}
  finally{for(const connection of repo.pool.pool._allConnections.toArray())connection.destroy();await repo.pool.end().catch(()=>{});}
  fs.writeFileSync(plan.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  if(report.status==='NO_GO')fail(report.errorCode);console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_ALIGNMENT_FAILED');process.exitCode=1;});
module.exports={main};
