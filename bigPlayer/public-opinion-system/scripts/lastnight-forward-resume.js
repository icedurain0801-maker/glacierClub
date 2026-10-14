'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verifyInventory}=require('./lastnight-runtime-inventory');
const {forwardResume}=require('../worker/src/lastNightForwardResume');
const {bindCommittedSession,bindForwardSession}=require('../worker/src/lastNightRecoveryFailureContract');
const {createEvidenceJournal}=require('../worker/src/lastNightEvidenceJournal');
const {enforceStrictTls}=require('../worker/src/lastNightTransportSafety');
const {resolveLastNightRuntime}=require('../worker/src/lastNightRuntimeResolver');
const {BigPlayerH5Connector,q1PageData}=require('../server/src/connectors/bigPlayerH5Connector');
const {LastNightDetailShapeConnector}=require('../server/src/connectors/lastNightDetailShapeConnector');
const {LastNightCompleteDetailConnector}=require('../server/src/connectors/lastNightCompleteDetailConnector');
const cipher=require('../server/src/integrations/credentialCipher');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function newFiles(){return ['scripts/lastnight-forward-resume.js','worker/src/lastNightForwardResume.js','worker/src/lastNightRecoveryFailureContract.js','scripts/build-lastnight-forward-candidate.js','worker/test/lastNightForwardResume.test.js','worker/src/lastNightTargetLockAdapter.js','worker/test/lastNightTargetLockAdapter.test.js','server/src/connectors/lastNightDetailShapeConnector.js','server/test/lastNightDetailShapeConnector.test.js','server/src/connectors/lastNightCompleteDetailConnector.js','server/src/connectors/lastNightDetailBlockContract.js','server/test/lastNightCompleteDetailConnector.test.js','server/test/lastNightDetailBlockContract.test.js','worker/src/lastNightRichContentQuery.js','worker/test/lastNightRichContentQuery.test.js'].map(name=>{const file=path.resolve(__dirname,'..',name);return{path:file,sha256:sha(file)};});}
function verifyForward(plan){verifyInventory(plan);if(JSON.stringify(newFiles())!==JSON.stringify(plan.forwardFiles))fail('LAST_NIGHT_FORWARD_INVENTORY_CHANGED');}
function guardTransport(fetchImpl,cursor){
 const ids=new Set();let lists=0,details=0,fatal=false;
 return async(value,options)=>{
  const url=new URL(value),keys=[...url.searchParams.keys()].sort().join(',');
  if(fatal || url.origin!=='https://club-en.q1.com' || options.redirect!=='manual')fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
  if(url.pathname==='/api/club/v1/auth/post/model/merged-list'){
   if(++lists!==1 || keys!=='boardId,offsetId,pageIndex,pageSize,sectionId' || url.searchParams.get('boardId')!=='100017' || url.searchParams.get('sectionId')!=='0'
     || url.searchParams.get('offsetId')!==String(cursor.offsetId) || url.searchParams.get('pageIndex')!==String(cursor.pageIndex) || url.searchParams.get('pageSize')!=='20')fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
  }else if(url.pathname==='/api/club/v1/auth/post/'){
   if(++details>20 || keys!=='postId,source' || url.searchParams.get('source')!=='0' || !ids.has(url.searchParams.get('postId')))fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
  }else fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
  const response=await fetchImpl(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(10000)].filter(Boolean))});
  if(response.status===401 || response.status===403){fatal=true;fail(response.status===401?'UNAUTHORIZED':'PERMISSION_DENIED');}
  const payload=await response.json();
  if(!response.ok || payload?.code!==0 || (response.url && response.url!==url.toString())){fatal=true;fail('LAST_NIGHT_RECOVERY_PROVIDER_REJECTED');}
  if(url.pathname.endsWith('/merged-list'))for(const row of q1PageData(payload).items)ids.add(String(row.id));
  return{ok:true,status:response.status,url:response.url,json:async()=>payload};
 };
}
async function main(argv=process.argv){
 enforceStrictTls();
 if(argv.length!==4 || argv[2]!=='--approved-plan' || !path.isAbsolute(argv[3]))fail('LAST_NIGHT_EXPLICIT_PLAN_REQUIRED');
 const plan=JSON.parse(fs.readFileSync(argv[3],'utf8'));
 if(plan.approved!==true || plan.authorizationMode!=='lastnight-forward-resume-v1' || !['inspect-forward-resume','execute-forward-resume','inspect-detail-shape','execute-detail-shape','inspect-rich-detail','execute-rich-detail'].includes(plan.stage)
   || plan.forwardCliSha256!==sha(__filename) || !path.isAbsolute(plan.envFile||'') || !path.isAbsolute(plan.output||'') || fs.existsSync(plan.output))fail('LAST_NIGHT_APPROVED_PLAN_REQUIRED');
 verifyForward(plan);
 const root=path.resolve(__dirname,'../../..','.temp/bigplayer-recovery-20261009');
 const inside=file=>{const real=fs.realpathSync(file),rel=path.relative(root,real);if(rel.startsWith('..')||path.isAbsolute(rel))fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');};
 for(const dir of [path.dirname(plan.output),plan.evidenceDirectory,plan.publicDirectory]){if(!path.isAbsolute(dir||'')||!fs.statSync(dir).isDirectory())fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');inside(dir);}
 for(const file of [plan.baseJournalFile,plan.sessionJournalFile]){if(!path.isAbsolute(file||''))fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');inside(file);}
 if(sha(plan.baseJournalFile)!==plan.baseJournalSha256 || sha(plan.sessionJournalFile)!==plan.sessionJournalSha256)fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
 process.loadEnvFile(plan.envFile);enforceStrictTls();
 const read=file=>{const envelope=JSON.parse(fs.readFileSync(file,'utf8'));if(!/^lastnight-store:[a-f0-9-]{36}$/.test(envelope.aad||''))fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');return JSON.parse(cipher.decrypt(envelope,process.env,{aad:envelope.aad}));};
 const base=read(plan.baseJournalFile),session=read(plan.sessionJournalFile),bindings={baseSha:plan.baseJournalSha256,sessionSha:plan.sessionJournalSha256};
 let evidence;
 if(session.phase==='forward_page_precommit_failed'){
  evidence=bindForwardSession({base,session,baseSha:bindings.baseSha});
 }else{
  // One-time migration of the already observed old failure requires explicit
  // manager postcheck bytes, not merely a pre-HTTP committed owner journal.
  if(!path.isAbsolute(plan.failurePostcheckFile||'') || sha(plan.failurePostcheckFile)!==plan.failurePostcheckSha256)fail('LAST_NIGHT_FAILURE_POSTCHECK_REQUIRED');inside(plan.failurePostcheckFile);
  const postcheck=JSON.parse(fs.readFileSync(plan.failurePostcheckFile,'utf8'));
  if(postcheck.kind!=='manager_readonly_postcheck' || postcheck.newPageRunExists!==false || postcheck.journal?.page2PreparedOrCommitted!==false
    || postcheck.errorCode!=='LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED' || postcheck.checkpoint?.id!==base.afterCheckpoint?.id
    || postcheck.checkpoint.status!=='idle' || postcheck.checkpoint.offsetId!==20 || postcheck.checkpoint.pageIndex!==2
    || postcheck.sourceLease?.owner!==session.token?.ownerId || postcheck.sourceLease.epoch!==session.token?.epoch)fail('LAST_NIGHT_FAILURE_POSTCHECK_REQUIRED');
  bindings.postcheckSha=plan.failurePostcheckSha256;
  evidence=bindCommittedSession({base,session,...bindings,approvedBaseSha:bindings.baseSha,approvedSessionSha:bindings.sessionSha});
 }
 if(evidence.accountId!==plan.accountId)fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
 let allowedHashes;
 if(plan.stage.endsWith('detail-shape')){
  if(!path.isAbsolute(plan.diagnosticFile||'')||sha(plan.diagnosticFile)!==plan.diagnosticSha256)fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_INVALID');inside(plan.diagnosticFile);
  const diagnostic=JSON.parse(fs.readFileSync(plan.diagnosticFile,'utf8'));
  if(session.phase!=='forward_page_precommit_failed'||diagnostic.phase!=='detail_page_diagnostics'||diagnostic.offset!==20||diagnostic.pageIndex!==2||diagnostic.items?.length!==20)fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_INVALID');
  allowedHashes=diagnostic.items.filter(item=>item.integrityStatus==='summary_fallback'&&item.integrityCode==='DETAIL_RESPONSE_INVALID').map(item=>item.idHash);
  if(allowedHashes.length!==6)fail('LAST_NIGHT_DETAIL_SHAPE_SCOPE_INVALID');bindings.diagnosticSha=plan.diagnosticSha256;
 }
 if(process.env.DATABASE_URL || !process.env.DB_USER || process.env.DB_HOST!=='127.0.0.1' || Number(process.env.DB_PORT)!==3306 || process.env.DB_NAME!=='public_opinion')fail('LAST_NIGHT_DB_TARGET_MISMATCH');
 const {Repository}=require('../server/src/db/repository');const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});
 const attempt=crypto.randomUUID();let sequence=0,report;
 const persistPublic=async value=>{
  const file=path.join(plan.publicDirectory,`${attempt}-${String(++sequence).padStart(4,'0')}.json`);const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return{file};
 };
 try{
  const runtime=await resolveLastNightRuntime({repo,accountId:plan.accountId,expectedIdentity:plan.expectedIdentity,cipher,env:process.env});
  const options={fetchImpl:guardTransport(fetch,JSON.parse(evidence.afterCheckpoint.cursor)),credentialContext:runtime.credentialContext};
  const connector=allowedHashes?new LastNightDetailShapeConnector({},{...options,allowedHashes,persistShape:persistPublic}):plan.stage.endsWith('rich-detail')?new LastNightCompleteDetailConnector({},options):new BigPlayerH5Connector({},options);
  report=await forwardResume({pool:repo.pool,evidence,bindings,expectedIdentity:plan.expectedIdentity,ownerId:plan.ownerId,inspectOnly:plan.stage.startsWith('inspect-')||plan.stage==='execute-detail-shape',diagnosticOnly:plan.stage==='execute-detail-shape',approvedHash:plan.snapshotHash,
    repo,runtime,connector,persistEvidence:createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:attempt}),persistPublic});
 }catch(error){report={status:'NO_GO',errorCode:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_FORWARD_FAILED',fullChainComplete:false,
  ...(['source_state','source','account','registry','checkpoint','run','content','game_read','community_read','transaction'].includes(error.lockStage)?{lockStage:error.lockStage}:{})};}
 finally{for(const connection of repo.pool.pool._allConnections.toArray())connection.destroy();await repo.pool.end().catch(()=>{});}
 fs.writeFileSync(plan.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(report.status==='NO_GO')fail(report.errorCode);return report;
}
if(require.main===module)main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_FORWARD_FAILED');process.exitCode=1;});
module.exports={main,newFiles,verifyForward,guardTransport};
