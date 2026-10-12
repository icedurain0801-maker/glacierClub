'use strict';
// Mechanical immutable stage copy. No DB, HTTP, env-file or service activation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const project=path.resolve(__dirname,'..'),root=path.resolve(project,'../..');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const testFiles=['overseasScheduledAdmission','overseasScheduledBatch','overseasScheduledIsolatedTarget','overseasScheduledReadiness','overseasScheduledTimeAnchor','overseasSharedRuntimeLifecycle'].map(n=>`worker/test/${n}.test.js`);
testFiles.push(...['overseasStageCoverage','overseasBigPlayerPageStore','overseasBigPlayerDispatchGuard','overseasBigPlayerDownstream','sharedWorkerEntryClassifier','sharedWorkerPermit'].map(n=>`worker/test/${n}.test.js`));
const scripts=['overseas-isolated-mariadb','overseas-isolated-mainchain','overseas-isolated-scheduled-checks','overseas-isolated-scheduled-mainchain','overseas-scheduled-request-read-child','overseas-candidate-inventory','freeze-overseas-scheduled-candidate'].map(n=>`scripts/${n}.js`);
const extraFiles=[...testFiles,...scripts,'scripts/offline-test-guard.cjs','scripts/offline-test-guard-selftest.cjs'];
extraFiles.push('worker/test/overseasControlledManifest.test.js','worker/test/overseasParentEvidencePolicy.test.js');
extraFiles.push('scripts/overseas-isolated-call-budget-checks.js');
extraFiles.push('scripts/overseas-isolated-translation-budget-checks.js');
extraFiles.push('scripts/overseas-isolated-parent-checks.js');
extraFiles.push('scripts/overseas-isolated-terminal-checks.js');
extraFiles.push('scripts/overseas-isolated-ancestor-lock-checks.js');
extraFiles.push('scripts/overseas-isolated-certified-cursor-checks.js');
extraFiles.push('scripts/overseas-isolated-next-slot-checks.js');
extraFiles.push('scripts/overseas-isolated-next-slot-execution.js');
extraFiles.push('scripts/overseas-isolated-manual-audit-checks.js');
extraFiles.push('scripts/overseas-isolated-historical-race-checks.js');
extraFiles.push('scripts/overseas-isolated-call-accounting-reproduction.js');
extraFiles.push('scripts/overseas-isolated-call-accounting-checks.js');
extraFiles.push('worker/test/overseasSharedRuntimeDrainClosure.test.js','worker/test/overseasStateDirectoryPolicy.test.js');
function verify(expected){
 if(!/^[a-f0-9]{64}$/.test(expected||'')||digest(path.join(project,'scheduled-freeze-manifest.json'))!==expected)throw Error('FREEZE_EXTERNAL_ANCHOR_MISMATCH');
 const manifest=JSON.parse(fs.readFileSync(path.join(project,'scheduled-freeze-manifest.json'),'utf8'));
 if(manifest.snapshotRoot!==project||manifest.format!=='overseas-scheduled-stage-v1')throw Error('FREEZE_ROOT_MISMATCH');
 require('./overseas-candidate-inventory').verifyInventory(manifest.inventory,manifest.extraFiles);return manifest;
}
function freeze(){
 const temp=path.join(root,'.temp');for(const p of [root,temp]){if(fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p)throw Error('FREEZE_PATH_INVALID');}
 const source=require('./overseas-candidate-inventory').inventory(extraFiles);
 const target=fs.mkdtempSync(path.join(temp,'overseas-qa-scheduled-stage-'));
 for(const entry of source.files){const relative=path.relative(project,entry.path),dest=path.join(target,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});
  if(entry.kind==='file')fs.copyFileSync(entry.path,dest,fs.constants.COPYFILE_EXCL);
  else if(entry.kind==='workspace-link')fs.symlinkSync(path.join(target,path.basename(entry.path)==='public-opinion-system-server'?'server':'worker'),dest,'junction');
  else throw Error('FREEZE_KIND_INVALID');}
 require('./overseas-candidate-inventory').verifyInventory(source,extraFiles);
 const inventory=require(path.join(target,'scripts/overseas-candidate-inventory')).inventory(extraFiles);
 const manifest={format:'overseas-scheduled-stage-v1',snapshotRoot:target,nodeVersion:process.version,scope:'actual isolated scheduled factory/runSource child with connector normalization/posts/comments/inline and dynamic replies/atomic jobs/child audit; not complete runtime',productionActivationAllowed:false,
  notImplemented:['restart recovery and epoch2','parent terminal aggregation and successful source cursor advancement','trusted cursor concurrency lock','shared complete due/parent/scan-permit wiring','persistent AI budget and notification boundary','production operations'],
  extraFiles,testFiles,sourceInventory:source,inventory,commands:{verify:'node scripts/freeze-overseas-scheduled-candidate.js --verify <external SHA256>',offline:'node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test <manifest testFiles>',sql:'node scripts/overseas-isolated-mariadb.js --scheduled-mainchain',inspectionSql:'node scripts/overseas-isolated-mariadb.js --scheduled-inspection',failureSql:['node scripts/overseas-isolated-mariadb.js --scheduled-budget','node scripts/overseas-isolated-mariadb.js --scheduled-transport-error']}};
 manifest.commands.incrementalOffline='node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasControlledManifest.test.js worker/test/overseasParentEvidencePolicy.test.js';
 manifest.commands.drainDirectoryOffline='node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasSharedRuntimeDrainClosure.test.js worker/test/overseasStateDirectoryPolicy.test.js worker/test/overseasSharedRuntimeLifecycle.test.js';
 manifest.drainDirectoryScope='actual runOnce with in-memory repository/lease fixture, deferred queue read, three tickets and candidate cleanup joined before pool end, unknown quiescence fails closed; branded isolated directory rejects forged production permission and external path; no SQL drain, production path access/ACL/fsync/recovery or shared shutdown integration';
 manifest.commands.incrementalFailureSql=['node scripts/overseas-isolated-mariadb.js --scheduled-budget20','node scripts/overseas-isolated-mariadb.js --scheduled-second-page-error'];
 manifest.commands.persistentCallBudgetSql='node scripts/overseas-isolated-mariadb.js --isolated-call-budget';
 manifest.commands.translationCallBudgetSql='node scripts/overseas-isolated-mariadb.js --isolated-translation-call-budget';
 manifest.commands.callAccountingSql='node scripts/overseas-isolated-mariadb.js --isolated-call-accounting';
 manifest.callAccountingScope='whole bounded fixture mutex and immutable charge-call count/cap/day projection; used rollback/deletion/rekey rejection, original prepaid UTC-day synthetic clock consumption without new-day bucket; not production-scale or coordinated administrator rewrite resistance or real midnight';
 manifest.commands.freshManualAuditSql='node scripts/overseas-isolated-mariadb.js --isolated-manual-audit-regression';
 manifest.freshManualAuditScope='fresh receipt/handoff and original queued0 first claims in one process; empty-feed success and no-manifest failure actual finish/source effects/readonly ten-table reconcile; every acquired connection isolated-target verified; no recovery, progress, real HTTP or production';
 manifest.commands.translationBudgetGapReproductionSql='node scripts/overseas-isolated-mariadb.js --isolated-translation-budget-reproduction';
 manifest.translationBudgetGapReproductionScope='diagnostic old baseline only: controller sets global used=-1, old consume commits fake result/disabled outbox despite invalid budget; no fixture restoration, instance stopped/disposed; must fail after validation fix';
 manifest.translationCallBudgetScope='fresh synthetic translation manifest/job receipt; reserve and fake consume reject version/language/fingerprint/status/window/manifest, configured or persisted cap and out-of-range used drift with nine-table zero-write snapshots; valid prepaid receipt may consume at cap; disabled outbox only, translation job stays pending; not semantic call-count/day/deletion reconciliation or real translation/AI';
 manifest.commands.parentEmptySql='node scripts/overseas-isolated-mariadb.js --isolated-parent';
 manifest.commands.parentAdditionalSql=['node scripts/overseas-isolated-mariadb.js --isolated-parent-partial','node scripts/overseas-isolated-mariadb.js --isolated-parent-ack-unknown'];
 manifest.commands.parentIncrementalSql=['node scripts/overseas-isolated-mariadb.js --isolated-parent-nonempty','node scripts/overseas-isolated-mariadb.js --isolated-parent-unsealed','node scripts/overseas-isolated-mariadb.js --isolated-parent-failed','node scripts/overseas-isolated-mariadb.js --isolated-parent-manual'];
 manifest.commands.parentIntegritySql='node scripts/overseas-isolated-mariadb.js --isolated-parent-integrity';
 manifest.commands.parentTerminalIncrementSql=['node scripts/overseas-isolated-mariadb.js --isolated-parent-all-failed','node scripts/overseas-isolated-mariadb.js --isolated-parent-terminal-fields'];
 manifest.commands.terminalGapReproductionSql='node scripts/overseas-isolated-mariadb.js --isolated-parent-terminal-reproduction';
 manifest.terminalGapReproductionScope='diagnostic old baseline only: exact current scheduled sourceEffect, extra detail, terminal/binding actor and null/nonzero analysis-alert counters accepted by readonly audit; must fail after validation fix, never a release acceptance command';
 manifest.parentTerminalIncrementScope='current all-nonsuccess parent policy remains partial/no success cursor; full saved terminal detail key drift/missing and nested count matrix plus actor/sourceEffect/audit counters, twelve-table zero-write rejection and restoration, normal nonempty finalize; not every raw database column or real transport failure';
 manifest.commands.ancestorPrimitiveSql='node scripts/overseas-isolated-mariadb.js --isolated-ancestor-locks';
 manifest.commands.parentCommentChainSql='node scripts/overseas-isolated-mariadb.js --isolated-parent-comment-chain';
 manifest.commands.parentHistoricalChainSql='node scripts/overseas-isolated-mariadb.js --isolated-parent-historical-chain';
 manifest.commands.parentHistoricalRaceSql='node scripts/overseas-isolated-mariadb.js --isolated-parent-historical-race';
 manifest.parentHistoricalRaceScope='actual original parent.finalize depth1 historical distinct writer before-lock committed rejection, sorted six-lock timeout/sentinel rollback, released committed drift rejection and restored normal finalize; no recovery or production';
 manifest.commands.certifiedCursorSql=['node scripts/overseas-isolated-mariadb.js --isolated-certified-cursor','node scripts/overseas-isolated-mariadb.js --isolated-certified-cursor-ack-unknown','node scripts/overseas-isolated-mariadb.js --isolated-certified-cursor-partial'];
 manifest.certifiedCursorScope='same process isolated original firstClaim epoch1 parent; success COMMIT ACK registry only; full evidence reader and same-brand initial anchor/admit binding; not real next slot, restart recovery or production cursor';
 manifest.commands.certifiedNextSlotSql='node scripts/overseas-isolated-mariadb.js --isolated-certified-next-slot';
 manifest.commands.certifiedNextSlotExecutionSql='node scripts/overseas-isolated-mariadb.js --isolated-certified-next-slot-execution';
 manifest.certifiedNextSlotExecutionScope='fresh same process original frequency3600 DB clock crossing; same certified reader admission followed by original epoch1 claims, two actual runSource synthetic transports, isolated persistence and parent finalize; not real HTTP/AI, restart recovery, production or second consumer';
 manifest.certifiedNextSlotScope='same process original frequency3600 config and owned DB clock crossing next due slot; nonnull certified anchor and next admission plus post-anchor drift zero-write; next children queued not claimed or collected';
 manifest.commentMembershipScope='two newly built post-comment-reply graphs, six links; actual parent-finalize sorted content lock barrier blocks distinct FK membership INSERT, sentinel rollback zero parent writes, release permits insert and synthetic cleanup; not historical ancestor writer concurrency';
 manifest.parentHistoricalChainScope='four preexisting root/comment ancestors, roots have synthetic prior-run site associations not successful-batch proof; current two children link only two new depth2 replies; original epoch1 parent finalize and deleted intermediate rejection; not ancestor concurrency or next-slot cursor anchor';
 manifest.ancestorPrimitiveScope='bounded sorted current locks and depth2 unlinked synthetic ancestry with distinct writer barrier; parent transaction READ COMMITTED; not integrated parent comment chain or membership concurrency';
 manifest.parentEmptyScope='same-process original epoch1 proofs; two synthetic empty-feed sealed children; atomic parent/state/source/window-end cursors; not complete cursor anchor loop, partial/ACKunknown/nonempty matrix or connector runtime';
 manifest.persistentCallBudgetScope='fixture-only real SQL daily global and lifetime exact identity/window scope budget; exact tuple current DB verification; synthetic consumption with disabled outbox; no real AI or notification and no parent aggregation';
 manifest.unreleasedAuxiliary=['server/src/db/overseasScheduledExecutionGate.js','server/src/db/overseasScheduledIsolatedTarget.js','worker/src/overseasScheduledRequestJournal.js','worker/src/overseasBigPlayerRunContractJournal.js'];
 manifest.incrementalScope='pageSize20 explicit synthetic budget2/second-page-error; synthetic consumption protocol and parent integrity policy only; auxiliary gate not integrated or released';
 const manifestPath=path.join(target,'scheduled-freeze-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({snapshotRoot:target,manifestPath,manifestSha256:digest(manifestPath),files:inventory.files.length})+'\n');
}
if(process.argv[2]==='--freeze'&&process.argv.length===3)freeze();
else if(process.argv[2]==='--verify'&&process.argv.length===4){const m=verify(process.argv[3]);process.stdout.write(JSON.stringify({verified:true,files:m.inventory.files.length})+'\n');}
else throw Error('FREEZE_EXPLICIT_MODE_REQUIRED');
