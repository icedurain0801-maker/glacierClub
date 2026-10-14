'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cipher=require('../../server/src/integrations/credentialCipher');const {runRecovery}=require('../src/lastNightRecovery');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('../src/lastNightScope');
test('authenticated encrypted journal observe binds IDs, rejects tamper/prepared, no plaintext output',async()=>{
  const root=path.resolve(__dirname,'../../../..','.temp/bigplayer-recovery-20261009');const dir=fs.mkdtempSync(path.join(root,'recovery-fixture-'));
  const env={CREDENTIAL_ENC_KEY:'12'.repeat(32)};
  const row={id:'content-fixture',external_id:'post-fixture',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,account_id:'account-fixture',fingerprint:'fp-fixture',raw_payload:JSON.stringify({_lastNightScope:{boardId:BOARD_ID}}),body:'personal-fixture-never-report'};
  const evidence={phase:'queue_result',sourceId:SOURCE_ID,boardId:BOARD_ID,accountId:row.account_id,contentMode:'legacy_source_external',before:[{externalId:row.external_id,content:null}],after:[{externalId:row.external_id,content:row,change:'inserted'}],version:'fixture-v1',queue:{status:'EXACT_AI_QUEUED',remaining:[],queued:[{contentId:row.id,jobId:'job-fixture',fingerprint:row.fingerprint}]}};
  const repo={query:async sql=>{
    if(sql.includes('CURRENT_USER'))return[{identity:'fixture@local',db:'public_opinion',port:3306}];
    if(sql.includes('information_schema'))return ['id','source_id','game_id','community_id','account_id','external_id','fingerprint','raw_payload','last_seen_at','content_id','feed_key','page_kind','section_id','feed_metadata','analysis_profile','analysis_version','content_fingerprint','status','lease_owner','analysis_level','analyzed_at'].map(column_name=>({column_name}));
    return[{...row,status:'completed',content_fingerprint:row.fingerprint,analyzed_fingerprint:row.fingerprint,analysis_version:'fixture-v1',analysis_level:'light',analyzed_at:'fixture-time'}];
  }};
  const file=path.join(dir,'encrypted.json');fs.writeFileSync(file,cipher.encrypt(JSON.stringify(evidence),env,{aad:'lastnight-store:fixture'}));
  const plan={stage:'observe-ai',accountId:row.account_id,expectedIdentity:'fixture@local',journalFile:file,journalSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  const report=await runRecovery({plan,repo,env});assert.equal(report.status,'EXACT_AI_COMPLETED');assert.ok(!JSON.stringify(report).includes(row.body));assert.ok(!fs.readFileSync(file,'utf8').includes(row.body));
  for(const queue of [
    {...evidence.queue,status:'STORE_COMMITTED_QUEUE_INCOMPLETE'},
    {...evidence.queue,remaining:[{id:'missing-fixture'}]},
    {...evidence.queue,queued:[]},
    {...evidence.queue,queued:[...evidence.queue.queued,...evidence.queue.queued]},
    {...evidence.queue,queued:[{...evidence.queue.queued[0],contentId:'extra-fixture'}]}
  ]) {
    const invalid=path.join(dir,`invalid-${crypto.randomUUID()}.json`);
    fs.writeFileSync(invalid,cipher.encrypt(JSON.stringify({...evidence,queue}),env,{aad:'lastnight-store:fixture'}));
    await assert.rejects(runRecovery({plan:{...plan,journalFile:invalid,journalSha256:crypto.createHash('sha256').update(fs.readFileSync(invalid)).digest('hex')},repo,env}),/AI_QUEUE_INCOMPLETE/);
  }
  await assert.rejects(runRecovery({plan:{...plan,journalSha256:'0'.repeat(64)},repo,env}),/JOURNAL_CHANGED/);
  fs.writeFileSync(file,cipher.encrypt(JSON.stringify({...evidence,phase:'prepared'}),env,{aad:'lastnight-store:fixture'}));
  const changed={...plan,journalSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  await assert.rejects(runRecovery({plan:changed,repo,env}),/EVIDENCE_INVALID/);
});
