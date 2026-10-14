// Fresh fixture transactions only; no real SQL, child, recovery or Progress.
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
  const snapshot=path.resolve(__dirname,'../..');
  assert.match(path.basename(snapshot), /^overseas-v104-offline-/);
  assert.equal(path.basename(path.dirname(snapshot)), '.temp');
  const root=path.dirname(path.dirname(snapshot));
  assert.equal(await fs.realpath(root), root);
  assert.equal(await fs.realpath(path.join(root,'.temp')), path.join(root,'.temp'));
  assert.ok((await fs.stat(path.join(root,'.git'))).isDirectory());
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
