'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const cipher=require('../../server/src/integrations/credentialCipher');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const {restoreExistingContentCAS,queueExactChanges,observeExactAnalysis,assertCompleteQueue}=require('./lastNightProtectedStore');
const {inspectWriteSchema}=require('./lastNightWriteSchema');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function runRecovery({plan,repo,env,persistEvidence}={}) {
  const [identity]=await repo.query('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
  if(identity?.identity!==plan.expectedIdentity||identity.db!=='public_opinion'||Number(identity.port)!==3306)fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
  const schema=await inspectWriteSchema(repo,'store');if(schema.status!=='LAST_NIGHT_WRITE_SCHEMA_READY')return{status:schema.status,schema};
  const root=path.resolve(__dirname,'../../../..','.temp/bigplayer-recovery-20261009');
  if(!path.isAbsolute(plan.journalFile||'')||!/^[a-f0-9]{64}$/.test(plan.journalSha256||''))fail('LAST_NIGHT_RECOVERY_PLAN_INVALID');
  const relative=path.relative(root,fs.realpathSync(plan.journalFile));
  if(relative.startsWith('..')||path.isAbsolute(relative))fail('LAST_NIGHT_RECOVERY_PLAN_INVALID');
  const bytes=fs.readFileSync(plan.journalFile);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==plan.journalSha256)fail('LAST_NIGHT_JOURNAL_CHANGED');
  const envelope=JSON.parse(bytes.toString());
  if(typeof envelope.aad!=='string'||!envelope.aad.startsWith('lastnight-store:'))fail('LAST_NIGHT_RECOVERY_PLAN_INVALID');
  const evidence=JSON.parse(cipher.decrypt(envelope,env,{aad:envelope.aad}));
  if(evidence.sourceId!==SOURCE_ID||evidence.boardId!==BOARD_ID||evidence.accountId!==plan.accountId||!['committed','queue_result'].includes(evidence.phase)
    ||!Array.isArray(evidence.after)||evidence.after.length>20||evidence.contentMode!==schema.contentMode)fail('LAST_NIGHT_RECOVERY_EVIDENCE_INVALID');
  if(!Array.isArray(evidence.before)||evidence.before.length!==evidence.after.length||new Set(evidence.after.map(entry=>entry.externalId)).size!==evidence.after.length
    ||evidence.after.some(entry=>!entry.content||entry.content.external_id!==entry.externalId||!['inserted','changed','unchanged'].includes(entry.change)))fail('LAST_NIGHT_RECOVERY_EVIDENCE_INVALID');
  if(plan.stage==='restore-content') {
    if(evidence.phase!=='committed')fail('LAST_NIGHT_RECOVERY_FORWARD_ONLY');
    return restoreExistingContentCAS({repo,evidence});
  }
  const account={id:plan.accountId,source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
  if(plan.stage==='requeue-exact') {
    if(typeof persistEvidence!=='function')fail('LAST_NIGHT_RECOVERY_JOURNAL_REQUIRED');
    const version=evidence.version||plan.analysisVersion;
    const queue=await queueExactChanges({repo,account,contents:evidence.after.map(entry=>({content:entry.content,change:entry.change})),version,contentMode:evidence.contentMode});
    await persistEvidence({...evidence,phase:'queue_result',queue,version});
    return queue;
  }
  if(plan.stage==='observe-ai') {
    assertCompleteQueue(evidence);
    return observeExactAnalysis({repo,queue:evidence.queue,after:evidence.after,version:evidence.version,accountId:plan.accountId,contentMode:evidence.contentMode});
  }
  fail('LAST_NIGHT_RECOVERY_PLAN_INVALID');
}
module.exports={runRecovery};
