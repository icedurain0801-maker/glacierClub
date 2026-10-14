'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { verifyInventory } = require('./lastnight-runtime-inventory');
const { catchupHandoff } = require('../worker/src/lastNightCatchupHandoff');
const { createEvidenceJournal } = require('../worker/src/lastNightEvidenceJournal');
const { enforceStrictTls } = require('../worker/src/lastNightTransportSafety');
const { recoverFirstSite16Page } = require('../worker/src/lastNightBoundedRecoveryPage');
const { resolveLastNightRuntime } = require('../worker/src/lastNightRuntimeResolver');
const { BigPlayerH5Connector, q1PageData } = require('../server/src/connectors/bigPlayerH5Connector');
const cipher = require('../server/src/integrations/credentialCipher');
const { exactRecoveryPlan } = require('../worker/src/lastNightExactRecoveryPlan');
const { resumeRecoverySession } = require('../worker/src/lastNightRecoverySession');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(argv = process.argv) {
  enforceStrictTls();
  if (argv.length !== 4 || argv[2] !== '--approved-plan' || !path.isAbsolute(argv[3])) fail('LAST_NIGHT_EXPLICIT_PLAN_REQUIRED');
  const plan = JSON.parse(fs.readFileSync(argv[3], 'utf8'));
  if (plan.approved !== true || plan.authorizationMode !== 'lastnight-bounded-current-runtime'
    || plan.handoffCliSha256 !== sha(__filename) || !['inspect-handoff', 'apply-handoff', 'recover-site16-first-page', 'recover-catchup-bounded-pages','recover-site2-page','resume-recovery-page'].includes(plan.stage)
    || !path.isAbsolute(plan.output || '') || fs.existsSync(plan.output) || !path.isAbsolute(plan.envFile || '')) fail('LAST_NIGHT_APPROVED_PLAN_REQUIRED');
  verifyInventory(plan);
  let recoveryInput, checkedRecovery;
  let resumeEvidence;
  if(plan.stage==='resume-recovery-page') {
    if(!path.isAbsolute(plan.journalFile||'') || sha(plan.journalFile)!==plan.journalSha256)fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
  }
  if(['recover-catchup-bounded-pages','recover-site2-page'].includes(plan.stage)) {
    if(!path.isAbsolute(plan.recoveryInputFile||'') || sha(plan.recoveryInputFile) !== plan.recoveryInputSha256)fail('LAST_NIGHT_RECOVERY_INPUT_CHANGED');
    recoveryInput=JSON.parse(fs.readFileSync(plan.recoveryInputFile,'utf8'));
    const feed={boardId:'100017',feedKey:'100017:circle:activity:552:564:5::1',pageKind:'circle',endpointKind:'activity',sectionId:'564',groupId:'552',type:5,orderType:null,isUltimate:true};
    checkedRecovery=exactRecoveryPlan({accountId:plan.accountId,checkpoints:recoveryInput.failed,feeds:[feed]});
    if(JSON.parse(checkedRecovery.cursor).offsetId !== 50)fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');
  }
  // Do not hand a five-minute lease to a process that has no recovery consumer yet.
  // The combined recovery entry will replace this gate only after independent QA.
  if (plan.stage === 'apply-handoff') fail('LAST_NIGHT_HANDOFF_RECOVERY_ENTRY_REQUIRED');
  const root = path.resolve(__dirname, '../../..', '.temp/bigplayer-recovery-20261009');
  for (const directory of [path.dirname(plan.output), ...(plan.stage !== 'inspect-handoff' ? [plan.evidenceDirectory] : [])]) {
    if (!path.isAbsolute(directory || '') || !fs.statSync(directory).isDirectory()) fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
    const relative = path.relative(root, fs.realpathSync(directory));
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
  }
  process.loadEnvFile(plan.envFile); enforceStrictTls();
  if(plan.stage==='resume-recovery-page') {
    const envelope=JSON.parse(fs.readFileSync(plan.journalFile,'utf8'));
    if(!envelope.aad?.startsWith('lastnight-store:'))fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
    resumeEvidence=JSON.parse(cipher.decrypt(envelope,process.env,{aad:envelope.aad}));
    if(resumeEvidence.accountId!==plan.accountId || resumeEvidence.phase!=='recovery_page_committed'
      || !['idle','completed'].includes(resumeEvidence.afterCheckpoint?.status))fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
  }
  if (process.env.DATABASE_URL || !process.env.DB_USER || process.env.DB_HOST !== '127.0.0.1'
    || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') fail('LAST_NIGHT_DB_TARGET_MISMATCH');
  const { Repository } = require('../server/src/db/repository');
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '1' });
  let report;
  try {
    let runtime, connector;
    if(['recover-site16-first-page','recover-catchup-bounded-pages','recover-site2-page','resume-recovery-page'].includes(plan.stage)) {
      runtime = await resolveLastNightRuntime({repo,accountId:plan.accountId,expectedIdentity:plan.expectedIdentity,cipher,env:process.env});
      const ids = new Set(); let requests = 0, fatal = false;
      const guarded = async(value, options) => {
        const url = new URL(value), keys = [...url.searchParams.keys()].sort().join(',');
        if(fatal || ++requests > 74 || url.origin !== 'https://club-en.q1.com' || options.redirect !== 'manual') fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
        if(url.pathname === '/api/club/v1/auth/post/model/merged-list') {
          if(keys !== 'boardId,offsetId,pageIndex,pageSize,sectionId' || url.searchParams.get('boardId') !== '100017' || url.searchParams.get('sectionId') !== '0'
            || url.searchParams.get('offsetId') !== String(resumeEvidence?.afterCheckpoint?.status==='idle' ? JSON.parse(resumeEvidence.afterCheckpoint.cursor).offsetId : 0)
            || url.searchParams.get('pageIndex') !== String(resumeEvidence?.afterCheckpoint?.status==='idle' ? JSON.parse(resumeEvidence.afterCheckpoint.cursor).pageIndex : 1) || url.searchParams.get('pageSize') !== '20') fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
        } else if(url.pathname === '/api/club/v1/auth/post/activity/list' && ['recover-catchup-bounded-pages','recover-site2-page','resume-recovery-page'].includes(plan.stage)) {
          if(keys !== 'boardId,isUltimate,offsetId,pageSize,sectionId,type' || url.searchParams.get('boardId') !== '100017'
            || url.searchParams.get('sectionId') !== '564' || url.searchParams.get('type') !== '5' || url.searchParams.get('isUltimate') !== '1'
            || url.searchParams.get('offsetId') !== String(resumeEvidence?.afterCheckpoint?.status==='idle'?JSON.parse(resumeEvidence.afterCheckpoint.cursor).offsetId:50) || url.searchParams.get('pageSize') !== '50') fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
        } else if(url.pathname === '/api/club/v1/auth/post/') {
          if(keys !== 'postId,source' || url.searchParams.get('source') !== '0' || !ids.has(url.searchParams.get('postId'))) fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
        } else fail('LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID');
        const response = await fetch(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(10000)].filter(Boolean))});
        if(response.status === 401 || response.status === 403) {fatal=true;fail(response.status === 401?'UNAUTHORIZED':'PERMISSION_DENIED');}
        const payload = await response.json();
        if(!response.ok || payload?.code !== 0 || (response.url && response.url !== url.toString())) {fatal=true;fail('LAST_NIGHT_RECOVERY_PROVIDER_REJECTED');}
        if(url.pathname.endsWith('/merged-list') || url.pathname.endsWith('/activity/list'))for(const row of q1PageData(payload).items)ids.add(String(row.id));
        return {ok:true,status:response.status,url:response.url,json:async()=>payload};
      };
      connector = new BigPlayerH5Connector({}, {fetchImpl:guarded,credentialContext:runtime.credentialContext});
    }
    if(plan.stage==='resume-recovery-page') {
      const cp=resumeEvidence.afterCheckpoint;
      if(cp.status==='completed' && cp.site_id!=='legacy-8483a64ab230417e63c5e30d77b0a6f0') { report={status:'LAST_NIGHT_RECOVERY_TASK_ALREADY_COMPLETED',checkpointId:cp.id,fullChainComplete:false}; }
      else {
        const is2=cp.site_id==='legacy-8483a64ab230417e63c5e30d77b0a6f0' && cp.status!=='completed';
        const feed=is2?{boardId:'100017',feedKey:'100017:circle:activity:552:564:5::1',pageKind:'circle',endpointKind:'activity',sectionId:'564',groupId:'552',type:5,orderType:null,isUltimate:true}
          :{boardId:'100017',feedKey:'100017:home:merged::0:::',pageKind:'home',endpointKind:'merged',sectionId:'0',groupId:null,type:null,orderType:null,isUltimate:null};
        report=await resumeRecoverySession({pool:repo.pool,expectedIdentity:plan.expectedIdentity,evidence:resumeEvidence,ownerId:plan.ownerId,
          persistEvidence:createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:crypto.randomUUID()}),
          work:context=>recoverFirstSite16Page({...context,snapshot:{source:{config:resumeEvidence.sourceConfig,schedule_version:resumeEvidence.scheduleVersion}},repo,runtime,connector,feed,
            ...(is2?{failedCheckpoint:cp}:cp.status==='idle'?{resumeCheckpoint:cp}:{}),persistEvidence:createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:crypto.randomUUID()})})});
      }
    } else {
    report = await catchupHandoff({ pool: repo.pool, accountId: plan.accountId, expectedIdentity: plan.expectedIdentity,
      inspectOnly: plan.stage === 'inspect-handoff', approvedSnapshotHash: plan.snapshotHash, ownerId: plan.ownerId,
      timeoutMs: plan.stage.startsWith('recover-') ? 120000 : 15000,
      persistEvidence: plan.stage !== 'inspect-handoff' ? createEvidenceJournal({ directory: plan.evidenceDirectory, env: process.env, transactionId: crypto.randomUUID() }) : undefined,
      continueRecovery: plan.stage.startsWith('recover-') ? async context => {
        const persistEvidence=createEvidenceJournal({directory:plan.evidenceDirectory,env:process.env,transactionId:crypto.randomUUID()});
        const results=[];
        if(['recover-catchup-bounded-pages','recover-site2-page'].includes(plan.stage)) {
          const input=recoveryInput;
          const feed={boardId:'100017',feedKey:'100017:circle:activity:552:564:5::1',pageKind:'circle',endpointKind:'activity',sectionId:'564',groupId:'552',type:5,orderType:null,isUltimate:true};
          results.push(await recoverFirstSite16Page({...context,repo,runtime,connector,feed,failedCheckpoint:checkedRecovery.failedCheckpoint,persistEvidence}));
        }
        if(plan.stage!=='recover-site2-page') results.push(await recoverFirstSite16Page({...context,repo,runtime,connector,
          feed:{boardId:'100017',feedKey:'100017:home:merged::0:::',pageKind:'home',endpointKind:'merged',sectionId:'0',groupId:null,type:null,orderType:null,isUltimate:null},persistEvidence}));
        return{status:'LAST_NIGHT_BOUNDED_RECOVERY_PAGES_COMMITTED',results,fullChainComplete:false,periodicUniqueOwnerEstablished:false};
      } : undefined });
    }
  } catch (error) { report = { status: 'NO_GO', errorCode: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LAST_NIGHT_HANDOFF_FAILED' }; }
  finally { for (const connection of repo.pool.pool._allConnections.toArray()) connection.destroy(); await repo.pool.end().catch(() => {}); }
  fs.writeFileSync(plan.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  if (report.status === 'NO_GO') fail(report.errorCode);
  console.log(JSON.stringify(report));
}
if (require.main === module) main().catch(error => { console.error(/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LAST_NIGHT_HANDOFF_FAILED'); process.exitCode = 1; });
module.exports = { main };
