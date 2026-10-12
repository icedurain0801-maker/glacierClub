'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Repository } = require('../../server/src/db/repository');
const { canonical } = require('../src/overseasBigPlayerRunContractJournal');
const { requestOf } = require('../../server/src/db/overseasManualHandoff');
const fs = require('node:fs/promises'), path = require('node:path');
const { createOverseasManualReceipt } = require('../src/overseasManualReceipt');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const ids = ['source','account','game','community'].map((_,i) => `00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
async function fixture({ fault, commitUnknown = false, rollbackFails = false } = {}) {
  const [sourceId,accountId,gameId,communityId] = ids;
  const requestId = sha('pending-marker-fixture'), expectedMarker = '2026-10-09T00:00:00.000Z';
  const bindings = ['en','fr'].map((siteId,i) => {
    const siteUrl = `https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=${i+1}`;
    const hex = sha(canonical(['overseas-manual-v1',requestId,sourceId,accountId,siteId])).slice(0,32);
    return {runId:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`,
      sourceId,accountId,gameId,communityId,siteId,siteUrl,siteUrlSha256:sha(siteUrl),boardId:'100017',
      windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z',manifestSha256:sha('manifest')};
  });
  let request = requestOf({requestId,expectedMarker,bindings}), preparing = true;
  let marker = expectedMarker, committed = new Map(), transaction = null, transactionMarker;
  const calls = [], events = [];
  const source = {id:sourceId,game_id:gameId,community_id:communityId,community_game:gameId,platform:'bigplayer_h5',region_code:'overseas',
    enabled:1,game_enabled:1,community_status:'enabled',default_account_id:accountId,auth_status:'authorized',auth_expired:0,
    config:{boardId:'100017',siteUrls:bindings.map(b=>({siteId:b.siteId,url:b.siteUrl,enabled:true}))}};
  const account = {id:accountId,source_id:sourceId,game_id:gameId,community_id:communityId,platform:'bigplayer_h5',enabled:1,auth_status:'authorized',auth_expired:0};
  const registry = bindings.map(b=>({site_id:b.siteId,url:b.siteUrl,url_hash:b.siteUrlSha256,enabled:1}));
  const credentials = [{id:'credential',status:'active',credential_expired:0,has_secret_cipher:1}], checkpoints=[];
  const conn = {
    async beginTransaction() { assert.equal(transaction,null); transaction=new Map(committed); transactionMarker=marker; events.push('begin'); },
    async query(sql,params=[]) {
      if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')return [[]];
      if(sql==='START TRANSACTION READ ONLY'){transaction=new Map(committed);transactionMarker=marker;events.push('read-only');return [[]];}
      assert.ok(transaction); calls.push({sql,params}); if (fault&&!preparing) await fault(sql,params);
      if(sql.includes('FROM po_sources s JOIN')) return [[{...source,marker:transactionMarker,admission_anchor:expectedMarker}]];
      if(sql.includes('FROM po_sources WHERE')) return [[{marker:transactionMarker}]];
      if(sql.includes('AS now_utc'))return [[{now_utc:expectedMarker}]];
      if(sql.includes('FROM po_sync_checkpoints'))return [[...checkpoints].filter(row=>row.account_id===params[0]&&row.site_id===params[1])];
      if(sql.includes('FROM po_accounts WHERE')) return [[account]];
      if(sql.includes('FROM po_credentials')) return [[...credentials]];
      if(sql.includes('FROM po_source_sites')) return [[...registry]];
      if(sql.includes('WHERE id IN'))return [[...transaction.values()].filter(row=>params.includes(row.id))];
      if(sql.startsWith('SELECT * FROM po_sync_runs')) return [[transaction.get(params[0])].filter(Boolean)];
      if(sql.startsWith('SELECT id FROM po_sync_runs')) return [[...transaction.values()].filter(row=>['queued','running','paused'].includes(row.status))];
      if(sql.startsWith('INSERT INTO po_sync_runs')) {
        const [id,source_id,account_id,site_id,window_start,window_end]=params;
        if(transaction.has(id)) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
        transaction.set(id,{id,source_id,account_id,site_id,window_start,window_end,status:'queued',trigger_type:'manual',sync_mode:'incremental',parent_run_id:null,scheduled_at:null,
          attempts:0,lease_epoch:0,lease_owner:null,lease_until:null,next_retry_at:null,started_at:null,finished_at:null});
        events.push(`insert:${site_id}`); return [{affectedRows:1}];
      }
      if(sql.startsWith('UPDATE po_sources')) {
        assert.equal(transaction.size,2); events.push('cas');
        if(params[1].replace(' ','T')+'Z' !== transactionMarker) return [{affectedRows:0}];
        transactionMarker=null; return [{affectedRows:1}];
      }
      throw Error(`Unexpected SQL: ${sql}`);
    },
    async commit() { committed=new Map(transaction); marker=transactionMarker; transaction=null; events.push('commit'); if(commitUnknown)throw Error('ack lost'); },
    async rollback() { transaction=null; events.push('rollback'); if(rollbackFails&&!preparing)throw Error('rollback lost'); },
    release() {events.push('release');}, destroy() {events.push('destroy');transaction=null;}
  };
  // Instantiate the actual Repository without ever constructing a real pool.
  let previous=Promise.resolve();
  const repo=Object.create(Repository.prototype);repo.pool={getConnection:async()=>{
    const wait=previous;let unlock;previous=new Promise(resolve=>{unlock=resolve;});await wait;
    return {...conn,release(){conn.release();unlock();},destroy(){conn.destroy();unlock();}};
  }};
  const project=path.resolve(__dirname,'../..');
  const root=process.env.OVERSEAS_RECEIPT_TEST_ROOT || path.resolve(project,'../..');
  const directory=await fs.mkdtemp(path.join(root,'.temp','manual-receipt-test-'));
  const receipt=await createOverseasManualReceipt({repositoryRoot:root,directory});
  request=await receipt.prepare({repo,sourceId,expectedMarker,manifestSha256:sha('manifest')});
  preparing=false;calls.length=0;events.length=0;
  return {repo,request,receipt,calls,events,source,registry,credentials,checkpoints,root,directory,removeRun:id=>committed.delete(id),get marker(){return marker;},set marker(v){marker=v;},get runs(){return [...committed.values()];},
    async run(){return repo.handoffOverseasManualMarker({request,receipt});}};
}
test('actual Repository handoff uses one transaction for all sites then exact marker CAS',async()=>{
  const f=await fixture();const result=await f.run();assert.equal(result.status,'accepted');assert.equal(result.runs.length,2);assert.equal(f.marker,null);
  assert.deepEqual(f.events,['begin','insert:en','insert:fr','cas','commit','release']);
  assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);
  assert.equal(f.calls.some(c=>/INSERT IGNORE|ON DUPLICATE|board_id|site_url_snapshot/.test(c.sql)),false);
});
test('failure after first site insert rolls back all runs and preserves marker',async()=>{
  const f=await fixture({fault:(sql,params)=>{if(sql.startsWith('INSERT')&&params[3]==='fr')throw Error('injected');}});
  await assert.rejects(f.run(),/injected/);assert.equal(f.runs.length,0);assert.equal(f.marker,f.request.expectedMarker);assert.equal(f.events.includes('commit'),false);
});
test('changed marker and mismatched registry fail closed without consuming marker',async()=>{
  const f=await fixture();f.marker='2026-10-09T00:00:01.000Z';await assert.rejects(f.run(),{code:'WORKER_MANUAL_MARKER_CHANGED'});assert.equal(f.runs.length,0);
  const g=await fixture();g.registry.pop();await assert.rejects(g.run(),{code:'OVERSEAS_MANUAL_SITE_CONFLICT'});assert.equal(g.marker,g.request.expectedMarker);
});
test('commit ACK unknown destroys connection without rollback or blind reinsertion',async()=>{
  const f=await fixture({commitUnknown:true});await assert.rejects(f.run(),{code:'OVERSEAS_MANUAL_HANDOFF_COMMIT_UNKNOWN'});
  assert.equal(f.runs.length,2);assert.equal(f.marker,null);assert.equal(f.events.includes('rollback'),false);assert.equal(f.events.at(-1),'destroy');
  const replay=await f.run();assert.equal(replay.status,'already_accepted');assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);
});
test('replay of a complete receipt never clears a new marker or resets terminal runs',async()=>{
  const f=await fixture();await f.run();f.marker='2026-10-09T00:00:02.000Z';for(const row of f.runs)row.status='completed';
  const replay=await f.run();assert.equal(replay.status,'already_accepted');assert.equal(f.marker,'2026-10-09T00:00:02.000Z');
  assert.equal(f.runs.every(r=>r.status==='completed'),true);assert.equal(f.events.filter(e=>e==='cas').length,1);
});
test('missing or substituted receipt rejects before connection and rollback failure destroys',async()=>{
  const f=await fixture();await assert.rejects(f.repo.handoffOverseasManualMarker({request:f.request}),{code:'OVERSEAS_MANUAL_RECEIPT_REQUIRED'});assert.deepEqual(f.events,[]);
  await assert.rejects(f.repo.handoffOverseasManualMarker({request:f.request,receipt:{read:async()=>f.request}}),{code:'OVERSEAS_MANUAL_RECEIPT_REQUIRED'});
  const g=await fixture({rollbackFails:true,fault:()=>{throw Error('query fail');}});await assert.rejects(g.run(),/query fail/);assert.equal(g.events.at(-1),'destroy');
});
test('concurrent same receipt serializes on a fixture lock and inserts exactly one complete set',async()=>{
  const f=await fixture();const results=await Promise.all([f.run(),f.run()]);
  assert.deepEqual(results.map(r=>r.status).sort(),['accepted','already_accepted']);assert.equal(f.runs.length,2);
  assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);
});
test('same deterministic ID with altered persisted scope fails rather than reusing or inserting',async()=>{
  const f=await fixture();await f.run();f.runs[0].account_id='other-account';
  await assert.rejects(f.run(),{code:'OVERSEAS_MANUAL_RUN_CONFLICT'});assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT')).length,2);
});
test('absent inactive expired and empty-cipher credentials preserve marker with zero inserts',async()=>{
  for(const mutate of [f=>f.credentials.pop(),f=>{f.credentials[0].status='inactive';},f=>{f.credentials[0].credential_expired=1;},f=>{f.credentials[0].has_secret_cipher=0;}]){
    const f=await fixture();mutate(f);await assert.rejects(f.run(),{code:'OVERSEAS_MANUAL_CREDENTIAL_INVALID'});
    assert.equal(f.runs.length,0);assert.equal(f.marker,f.request.expectedMarker);
  }
});
test('real file receipt recovers in a fresh Node process without a SQL connection',async()=>{
  const f=await fixture();const {spawnSync}=require('node:child_process');
  const modulePath=path.resolve(__dirname,'../src/overseasManualReceipt.js');
  const code=`const {createOverseasManualReceipt}=require(process.argv[1]);(async()=>{const reader=await createOverseasManualReceipt({repositoryRoot:process.argv[2],directory:process.argv[3]});const request=await reader.recover(process.argv[4]);process.stdout.write(JSON.stringify(request));})().catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1;});`;
  const result=spawnSync(process.execPath,['-e',code,modulePath,f.root,f.directory,f.request.requestId],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);assert.equal(canonical(JSON.parse(result.stdout)),canonical(f.request));
  assert.equal(f.runs.length,0);assert.equal(f.marker,f.request.expectedMarker);
});
test('read-only unknown reconciliation distinguishes accepted absent and ambiguous without writes',async()=>{
  const f=await fixture();const input={request:f.request,receipt:f.receipt};
  assert.equal((await f.repo.reconcileOverseasManualMarker(input)).status,'not_committed');
  f.marker='2026-10-09T00:00:03.000Z';assert.equal((await f.repo.reconcileOverseasManualMarker(input)).status,'unknown');
  f.marker=f.request.expectedMarker;await f.run();f.marker='2026-10-09T00:00:04.000Z';
  let begin=f.calls.length;assert.equal((await f.repo.reconcileOverseasManualMarker(input)).status,'accepted');
  assert.equal(f.calls.slice(begin).some(c=>/INSERT|UPDATE|DELETE/.test(c.sql)),false);assert.equal(f.marker,'2026-10-09T00:00:04.000Z');
  f.runs[0].window_start='2020-01-01 00:00:00.000';assert.equal((await f.repo.reconcileOverseasManualMarker(input)).status,'unknown');
});
test('receipt tampering rejects before database handoff and cursor drift preserves marker',async()=>{
  const f=await fixture();const file=path.join(f.directory,`overseas-manual-${f.request.requestId}.json`);
  // Corrupting an owned test artifact is deliberate fault injection.
  await fs.appendFile(file,' ');await assert.rejects(f.run(),{code:'OVERSEAS_MANUAL_RECEIPT_FILE_INVALID'});assert.deepEqual(f.events,[]);
  const g=await fixture();g.checkpoints.push({id:'cp',account_id:ids[1],site_id:'en',task_kind:'posts',task_key:'board:100017:posts',sync_scope:'posts',root_platform_content_id:'',status:'completed',window_start:'2026-10-01T00:00:00.000Z',window_end:'2026-10-09T00:00:00.000Z',last_item_at:'2026-10-08T12:00:00.000Z'});
  await assert.rejects(g.run(),{code:'OVERSEAS_MANUAL_CURSOR_CHANGED'});assert.equal(g.runs.length,0);assert.equal(g.marker,g.request.expectedMarker);
});
test('fresh DB preparation derives each site window from exact board completed cursor evidence',async()=>{
  const f=await fixture();f.checkpoints.push({id:'cp',account_id:ids[1],site_id:'en',task_kind:'posts',task_key:'board:100017:posts',sync_scope:'posts',root_platform_content_id:'',status:'completed',window_start:'2026-10-01T00:00:00.000Z',window_end:'2026-10-09T00:00:00.000Z',last_item_at:'2026-10-08T12:00:00.000Z'});
  const r=await f.receipt.prepare({repo:f.repo,sourceId:ids[0],expectedMarker:f.request.expectedMarker,manifestSha256:sha('manifest')});
  assert.equal(r.bindings.find(b=>b.siteId==='en').windowStart,'2026-10-08T12:00:00.000Z');
  assert.equal(r.bindings.find(b=>b.siteId==='fr').windowStart,'2026-10-02T00:00:00.000Z');
  assert.notEqual(r.requestId,f.request.requestId);assert.equal(f.runs.length,0);
  const result=await f.repo.handoffOverseasManualMarker({request:r,receipt:f.receipt});assert.equal(result.status,'accepted');
});
test('partial run evidence after unknown commit remains unknown and cannot be repaired by handoff',async()=>{
  const f=await fixture();await f.run();f.removeRun(f.request.bindings[0].runId);let count=f.calls.length;
  assert.equal((await f.repo.reconcileOverseasManualMarker({request:f.request,receipt:f.receipt})).status,'unknown');
  assert.equal(f.calls.slice(count).some(c=>/INSERT|UPDATE|DELETE/.test(c.sql)),false);
  await assert.rejects(f.run(),{code:'OVERSEAS_MANUAL_PARTIAL_EVIDENCE'});assert.equal(f.runs.length,1);
});
test('fresh reader recovers only durable unclaimed first scopes without claim or journal writes',async()=>{
  const {recoverManualFirstRunBindings}=require('../src/overseasManualFirstClaimRecovery');
  const f=await fixture();await f.run();const reader=await createOverseasManualReceipt({repositoryRoot:f.root,directory:f.directory});
  const count=f.calls.length,events=f.events.length;
  const bindings=await recoverManualFirstRunBindings({repo:f.repo,receipt:reader,requestIds:[f.request.requestId],manifestSha256:sha('manifest')});
  assert.equal(canonical(bindings),canonical(f.request.bindings));
  assert.equal(f.calls.slice(count).some(c=>/INSERT|UPDATE|DELETE|FOR UPDATE/.test(c.sql)),false);
  assert.equal(f.events.slice(events).includes('commit'),false);
  assert.equal(bindings.some(b=>Object.hasOwn(b,'leaseOwner')),false);
});
test('first-scope recovery rejects manifest drift repeated IDs and any previously claimed epoch',async()=>{
  const {recoverManualFirstRunBindings}=require('../src/overseasManualFirstClaimRecovery');
  const f=await fixture();await f.run();const input={repo:f.repo,receipt:f.receipt,requestIds:[f.request.requestId],manifestSha256:sha('manifest')};
  await assert.rejects(recoverManualFirstRunBindings({...input,manifestSha256:sha('other')}),{code:'OVERSEAS_FIRST_CLAIM_RECOVERY_UNVERIFIED'});
  await assert.rejects(recoverManualFirstRunBindings({...input,requestIds:[f.request.requestId,f.request.requestId]}),{code:'OVERSEAS_FIRST_CLAIM_RECOVERY_UNVERIFIED'});
  for(const patch of [{attempts:1},{attempts:null},{lease_epoch:null},{lease_epoch:2},{lease_owner:'previous'},{next_retry_at:'2026-10-09 00:00:00.000'},{status:'running'}]){
    const row=f.runs[0],saved={...row};Object.assign(row,patch);
    await assert.rejects(recoverManualFirstRunBindings(input),{code:'OVERSEAS_FIRST_CLAIM_RECOVERY_UNVERIFIED'});Object.assign(row,saved);
  }
});
test('recovered first scopes publish actual Journal only after persisted first owner and epoch are proven',async()=>{
  const {recoverManualFirstRunBindings}=require('../src/overseasManualFirstClaimRecovery');
  const {createOverseasClaimedContracts}=require('../src/overseasBigPlayerClaimedContracts');
  const {createOverseasRunContractJournal}=require('../src/overseasBigPlayerRunContractJournal');
  const f=await fixture();await f.run();
  const bindings=await recoverManualFirstRunBindings({repo:f.repo,receipt:f.receipt,requestIds:[f.request.requestId],manifestSha256:sha('manifest')});
  const directory=await fs.mkdtemp(path.join(f.root,'.temp','manual-first-journal-test-'));
  const journal=await createOverseasRunContractJournal({repositoryRoot:f.root,directory});
  const b=bindings[0],row=f.runs.find(r=>r.id===b.runId);
  // This simulates persisted claim ACK, not a real DB CAS or HTTP execution.
  Object.assign(row,{status:'running',attempts:1,lease_epoch:1,lease_owner:'base:fixture-first-owner',lease_until:'2026-10-10 00:00:00.000'});
  f.repo.query=async sql=>{
    if(sql.startsWith('SELECT attempts'))return [{...row,live:1}];
    if(sql.includes('r.id AS r_id'))return [{r_id:b.runId,r_source_id:b.sourceId,r_account_id:b.accountId,r_site_id:b.siteId,
      r_owner:row.lease_owner,r_epoch:row.lease_epoch,r_live:1,r_status:'running',r_start:b.windowStart,r_end:b.windowEnd,
      s_id:b.sourceId,s_game:b.gameId,s_community:b.communityId,s_platform:'bigplayer_h5',s_enabled:1,s_config:f.source.config,
      a_id:b.accountId,a_source:b.sourceId,a_game:b.gameId,a_community:b.communityId,a_platform:'bigplayer_h5',a_enabled:1,
      g_id:b.gameId,g_region:'overseas',g_enabled:1,cm_id:b.communityId,cm_game:b.gameId,cm_status:'enabled',
      st_id:b.siteId,st_url:b.siteUrl,st_hash:b.siteUrlSha256,st_enabled:1}];
    throw Error('Unexpected claim-verifier query');
  };
  const manager=createOverseasClaimedContracts({repo:f.repo,journal,manifestSha256:sha('manifest'),initialRunBindings:bindings});
  const source={id:b.sourceId,game_id:b.gameId,community_id:b.communityId,platform:'bigplayer_h5',region_code:'overseas',siteId:b.siteId,siteUrl:b.siteUrl,config:{...f.source.config,baseUrl:b.siteUrl}};
  const account={id:b.accountId,source_id:b.sourceId,game_id:b.gameId,community_id:b.communityId,platform:'bigplayer_h5'};
  const input={source,account,syncRunId:b.runId,leaseOwner:row.lease_owner,leaseEpoch:1,windowStart:b.windowStart,windowEnd:b.windowEnd};
  const result=await manager.prepare(input);assert.equal(result.leaseOwner,row.lease_owner);await journal.read(result);
  // A new manager without first permissions can read the published exact
  // epoch1 journal; it cannot create epoch2 evidence from this receipt.
  const restarted=createOverseasClaimedContracts({repo:f.repo,journal,manifestSha256:sha('manifest')});
  assert.equal((await restarted.prepare(input)).runId,b.runId);
  await assert.rejects(restarted.prepare({...input,leaseEpoch:2}),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});
});
test('explicit recovered factory assembles original candidate without network or writes',async()=>{
  const {createRecoveredIsolatedOverseasCandidateDeps}=require('../src/overseasManualFirstClaimRecovery');
  const {createOverseasRunContractJournal}=require('../src/overseasBigPlayerRunContractJournal');
  const f=await fixture();await f.run();f.repo.loadKeywordRules=async()=>[];f.repo.getDefaultAccount=async()=>({id:ids[1]});f.repo.query=async()=>{throw Error('must not query outside readonly recovery');};
  const directory=await fs.mkdtemp(path.join(f.root,'.temp','manual-recovered-factory-test-'));
  const journal=await createOverseasRunContractJournal({repositoryRoot:f.root,directory});let network=0;
  const options={baseDeps:{repo:f.repo,connectors:{}},receipt:f.receipt,requestIds:[f.request.requestId],
    journal,manifestSha256:sha('manifest'),transport:async()=>{network++;throw Error('network forbidden');},translationVersion:'v1'};
  const count=f.calls.length,candidate=await createRecoveredIsolatedOverseasCandidateDeps(options);
  assert.equal(typeof candidate.resolveSourceDeps,'function');assert.equal(candidate.productionActivationAllowed,false);
  assert.equal(network,0);assert.equal(f.calls.slice(count).some(c=>/INSERT|UPDATE|DELETE/.test(c.sql)),false);
  assert.deepEqual(await fs.readdir(directory),[]);candidate.closeOverseasCandidate();
  await assert.rejects(createRecoveredIsolatedOverseasCandidateDeps({...options,initialRunBindings:[]}),{code:'OVERSEAS_FIRST_CLAIM_RECOVERY_UNVERIFIED'});
});

test('progress recovery still reads queued0 scopes without granting an expired reclaim',async()=>{
 const {recoverManualProgress}=require('../src/overseasManualProgressRecovery');
 const f=await fixture();await f.run();const base=f.repo.pool;
 f.repo.pool={getConnection:async()=>{
  const c=await base.getConnection();return {...c,async query(sql,params){
   if(sql.includes('AS now_utc'))return [[{now_utc:'2026-10-10 00:00:00.000000'}]];
   return c.query(sql,params);
  }};
 }};
 const directory=await fs.mkdtemp(path.join(f.root,'.temp','progress-journal-test-'));
 const journal=await require('../src/overseasBigPlayerRunContractJournal').createOverseasRunContractJournal({repositoryRoot:f.root,directory});
 const begin=f.calls.length,plan=await recoverManualProgress({repo:f.repo,receipt:f.receipt,journal,requestIds:[f.request.requestId],manifestSha256:sha('manifest')});
 assert.equal(plan.firstRunBindings.length,2);assert.equal(plan.expiredSites.length,0);assert.equal(plan.allCompleted,false);assert.ok(Object.isFrozen(plan));
 assert.equal(f.calls.slice(begin).some(c=>/INSERT|UPDATE|DELETE|FOR UPDATE/.test(c.sql)),false);
 await assert.rejects(recoverManualProgress({repo:f.repo,receipt:f.receipt,journal:{...journal},requestIds:[f.request.requestId],manifestSha256:sha('manifest')}),{code:'OVERSEAS_PROGRESS_RECOVERY_UNVERIFIED'});
});

test('progress candidate rejects forged or copied plan before SQL or first permissions',async()=>{
 const {createProgressIsolatedCandidateDeps}=require('../src/overseasManualProgressRecovery');
 await assert.rejects(createProgressIsolatedCandidateDeps({plan:{firstRunBindings:[],allCompleted:false},baseDeps:{repo:{}}}),{code:'OVERSEAS_PROGRESS_RECOVERY_UNVERIFIED'});
});
