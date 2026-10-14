'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Repository } = require('../../server/src/db/repository');
const { createOverseasBigPlayerPageStore, stripBoardInsert } = require('../src/overseasBigPlayerPageStore');
const url = 'https://club-en.q1.com/?env=1&gameId=2177&gameVersion=2177-US-ZS&languageId=16';
const fingerprint = id => crypto.createHash('sha256').update(id).digest('hex');
const account = { id: '22222222-2222-2222-2222-222222222222', source_id: '11111111-1111-1111-1111-111111111111', game_id: '33333333-3333-3333-3333-333333333333', community_id: '44444444-4444-4444-4444-444444444444', platform: 'bigplayer_h5', enabled: 1 };
const source = { id: '11111111-1111-1111-1111-111111111111', game_id: '33333333-3333-3333-3333-333333333333', community_id: '44444444-4444-4444-4444-444444444444', platform: 'bigplayer_h5', region_code: 'overseas', enabled: 1,
  game_enabled: 1, community_status: 'enabled', siteId: 'site-x', siteUrl: url,
  config: { boardId: '100017', baseUrl: url, siteUrls: [{ siteId: 'site-x', url, enabled: true }] } };
const contract = { runId: '55555555-5555-5555-5555-555555555555', sourceId: '11111111-1111-1111-1111-111111111111', accountId: '22222222-2222-2222-2222-222222222222', gameId: '33333333-3333-3333-3333-333333333333', communityId: '44444444-4444-4444-4444-444444444444', boardId: '100017', siteId: 'site-x',
  siteUrl: url, siteUrlSha256: fingerprint(url), windowStart: '2026-10-09T00:00:00.000Z',
  windowEnd: '2026-10-10T00:00:00.000Z', manifestSha256: 'a'.repeat(64), leaseOwner: 'owner', leaseEpoch: 1 };
const clone = value => structuredClone(value);
const marker = () => ({ sourceId: '11111111-1111-1111-1111-111111111111', accountId: '22222222-2222-2222-2222-222222222222', gameId: '33333333-3333-3333-3333-333333333333', communityId: '44444444-4444-4444-4444-444444444444', boardId: '100017', siteId: 'site-x', siteUrl: url, siteUrlSha256: contract.siteUrlSha256 });
const item = (id = 'post') => ({ externalId: id, boardId: '100017', contentType: 'post', contentDepth: 0, body: 'body',
  publishedAt: new Date('2026-10-09T01:00:00Z'), sourceUrl: '', fingerprint: fingerprint(id), rawPayload: { boardId: '100017' } });
const historical = (id = 'post', patch = {}) => ({ id: `uuid-${id}`, external_id: id, source_id: '11111111-1111-1111-1111-111111111111', account_id: '22222222-2222-2222-2222-222222222222', game_id: '33333333-3333-3333-3333-333333333333', community_id: '44444444-4444-4444-4444-444444444444',
  content_type: 'post', content_depth: 0, body: 'old', fingerprint: fingerprint(`old-${id}`), raw_payload: JSON.stringify({ boardId: '100017', _overseasScope: marker() }), ...patch });
function fixture({ initial = [], runPatch = {}, checkpointPatch = {}, failSql, beforeCommit, verified = true, failCommit = false } = {}) {
  let rows = clone(initial), saved, commits = 0, rollbacks = 0, releases = 0, acquires = 0, destroyed = 0; const calls = [];
  const run = { id: '55555555-5555-5555-5555-555555555555', source_id: '11111111-1111-1111-1111-111111111111', account_id: '22222222-2222-2222-2222-222222222222', site_id: 'site-x', status: 'running', lease_owner: 'owner', lease_epoch: 1, live: 1,
    window_start: contract.windowStart, window_end: contract.windowEnd, ...runPatch };
  const cp = { id: 'cp', account_id: '22222222-2222-2222-2222-222222222222', site_id: 'site-x', sync_scope: 'posts', root_platform_content_id: '',
    task_kind: 'q1_feed', task_key: 'feed', window_start: contract.windowStart, window_end: contract.windowEnd, lease_owner: 'owner', status: 'running', live: 1, ...checkpointPatch };
  const checkpoints=new Map([[cp.id,cp]]);
  const conn = { async query(sql, params = []) {
    calls.push({ sql, params }); if (failSql?.(sql)) throw Object.assign(new Error('fixture'), { code: 'FIXTURE_FAILURE' });
    if (sql.includes('r.id AS r_id')) return [[{ ...networkRow(), r_id: run.id, r_owner: run.lease_owner, r_epoch: run.lease_epoch,
      r_live: run.live, r_status: run.status, r_start: run.window_start, r_end: run.window_end }]];
    if (sql.startsWith('SELECT *, (lease_until') && sql.includes('FROM po_sync_runs')) return [[clone(run)]];
    if (sql.startsWith('SELECT lease_owner')) return [[{ lease_owner: run.lease_owner, lease_epoch: run.lease_epoch, live: run.live }]];
    if (sql.startsWith('SELECT * FROM po_source_sites')) return [[{ source_id: '11111111-1111-1111-1111-111111111111', site_id: 'site-x', url, enabled: 1 }]];
    if (sql.startsWith('SELECT s.*,g.region_code')) return [[clone(source)]];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [[clone(account)]];
    if (sql.includes('information_schema.columns')) return [['id', 'source_id', 'account_id', 'game_id', 'community_id', 'external_id', 'raw_payload', 'fingerprint'].map(column_name => ({ column_name }))];
    if (sql.startsWith('SELECT * FROM po_sync_checkpoints') || sql.startsWith('SELECT *, (lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_checkpoints')) return [[clone(checkpoints.get(params[0]))]];
    if (sql.startsWith('SELECT id,external_id FROM po_contents')) return [rows.filter(row => row.source_id === params[0] && row.fingerprint === params[1]).map(row => ({ id: row.id, external_id: row.external_id }))];
    if (sql.startsWith('SELECT * FROM po_contents')) return [rows.filter(row => row.source_id === params[0] && row.external_id === params.at(-1)).map(clone)];
    if (sql.startsWith('SELECT r.id')) return [[{ id: '55555555-5555-5555-5555-555555555555' }]];
    if (sql.startsWith('INSERT INTO po_contents')) {
      assert.ok(!/\bboard_id\b|\bboard_name\b/.test(sql));
      const columns = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value => value.trim());
      const value = Object.fromEntries(columns.slice(0, params.length).map((key, index) => [key, params[index]]));
      const existing = rows.find(row => row.external_id === value.external_id);
      if (existing) Object.assign(existing, { ...value, id: existing.id }); else rows.push(value);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM po_analysis_jobs') || sql.startsWith('SELECT * FROM po_translation_jobs')) return [[]];
    return [{ affectedRows: 1 }];
  }, async beginTransaction() { saved = clone(rows); }, async commit() { if (failCommit) throw Error('ack lost'); commits++; },
  async rollback() { rollbacks++; rows = clone(saved); }, release() { releases++; }, destroy() { destroyed++; } };
  const repo = Object.create(Repository.prototype); repo.syncUpsertLockWaitSeconds = 3;
  repo.pool = { getConnection: async () => { acquires++; return conn; } }; repo.query = async (sql, params) => (await conn.query(sql, params))[0];
  const store = createOverseasBigPlayerPageStore({ repo, verifyRunContract: async () => verified, beforeCommit });
  return { store, repo, calls, run, cp, checkpoints, rows: () => rows, stats: () => ({ commits, rollbacks, releases, acquires, destroyed }),
    input: (items = [item()], patch = {}) => ({ source: clone(source), account: clone(account), syncRunId: '55555555-5555-5555-5555-555555555555', leaseOwner: 'owner',
      syncScope: 'posts', items, runContract: clone(contract), ...patch }) };
}

const { syncStagePage } = require('../src/worker');
const { createOverseasBigPlayerAdapter } = require('../src/overseasBigPlayerAdapter');
const { createOverseasPageJobs } = require('../src/overseasBigPlayerPageJobs');
const { createOverseasNetworkContractVerifier } = require('../src/overseasBigPlayerNetworkContractVerifier');
const { enqueueDailyAnalysis } = require('../src/worker');
const { assertAtomicContentReceipt, isAtomicPageStoreMethod } = require('../src/overseasBigPlayerPageStore');
function completeJobs(analysisOptionsFor=()=>({profile:'light',version:'v1',triggerReason:'all_content'})) {
 return createOverseasPageJobs({analysisOptionsFor,translationOptions:{targetLanguage:'zh-CN',version:'v1'}});
}
test('missing or forged hooks cannot grant atomic store capability',()=>{
 for(const beforeCommit of [undefined,async()=>{},createOverseasPageJobs({}),createOverseasPageJobs({analysisOptionsFor:()=>({}),translationOptions:{targetLanguage:'en',version:'v1'}})]){
  assert.equal(isAtomicPageStoreMethod(fixture({beforeCommit}).store.upsertContentPage),false);
 }
});
test('hook failure and queue rollback cannot mint committed content receipts',async()=>{
 for(const options of [{beforeCommit:completeJobs(()=>null)},
  {beforeCommit:completeJobs(),failSql:sql=>sql.startsWith('INSERT INTO po_translation_jobs')},
  {beforeCommit:completeJobs(),failCommit:true}]){
  const f=fixture(options);await assert.rejects(()=>f.store.upsertContentPage(f.input()));
  assert.equal(f.stats().commits,0);
  if(options.failCommit)assert.equal(f.stats().destroyed,1);
  else {assert.equal(f.stats().rollbacks,1);assert.equal(f.rows().length,0);}
  for(const content of f.rows())assert.throws(()=>assertAtomicContentReceipt({content,raw:{fingerprint:content.fingerprint},change:'changed'},f.store.upsertContentPage,source),{code:'OVERSEAS_ATOMIC_PAGE_JOBS_RECEIPT_REQUIRED'});
 }
});
test('commit receipt binds exact content, source and store; copied content rejects',async()=>{
 const f=fixture({beforeCommit:completeJobs()}),result=await f.store.upsertContentPage(f.input());
 const entry={...result.contents[0],raw:item()};
 assert.doesNotThrow(()=>assertAtomicContentReceipt(entry,f.store.upsertContentPage,source));
 for(const [candidate,method,s] of [[{...entry,content:{...entry.content}},f.store.upsertContentPage,source],
  [entry,f.store.upsertContentPage.bind(null),source],[entry,f.store.upsertContentPage,{...source,id:'other'}]]){
  assert.throws(()=>assertAtomicContentReceipt(candidate,method,s),{code:'OVERSEAS_ATOMIC_PAGE_JOBS_RECEIPT_REQUIRED'});
 }
});
const fs = require('node:fs/promises'), path = require('node:path');
const { createOverseasRunContractJournal } = require('../src/overseasBigPlayerRunContractJournal');
const { createIsolatedOverseasCandidateDeps } = require('../src/overseasBigPlayerCandidateFactory');
function identityRow() {
 return {s_id:source.id,s_game_id:source.game_id,s_community_id:source.community_id,s_platform:source.platform,
 s_enabled:1,s_config:source.config,g_id:source.game_id,g_region_code:'overseas',g_enabled:1,
 c_id:source.community_id,c_game_id:source.game_id,c_status:'enabled',
 a_id:account.id,a_source_id:source.id,a_game_id:account.game_id,a_community_id:account.community_id,a_platform:account.platform,a_enabled:1,
 ag_id:source.game_id,ag_region_code:'overseas',ac_id:source.community_id,ac_game_id:source.game_id,
 r_id:contract.runId,r_source_id:source.id,r_account_id:account.id,r_site_id:contract.siteId,r_status:'running'};
}
async function realJournal() {
 const repositoryRoot=path.resolve(__dirname,'../../../..');
 const directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-mainchain-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});
 await journal.create(contract);return journal;
}

function networkRow() {
 return { r_id:contract.runId,r_source_id:source.id,r_account_id:account.id,r_site_id:contract.siteId,
 r_owner:contract.leaseOwner,r_epoch:contract.leaseEpoch,r_live:1,r_status:'running',r_start:contract.windowStart,r_end:contract.windowEnd,
 s_id:source.id,s_game:source.game_id,s_community:source.community_id,s_platform:source.platform,s_enabled:1,s_config:source.config,
 a_id:account.id,a_source:source.id,a_game:account.game_id,a_community:account.community_id,a_platform:account.platform,a_enabled:1,
 g_id:source.game_id,g_region:'overseas',g_enabled:1,cm_id:source.community_id,cm_game:source.game_id,cm_status:'enabled',
 st_id:contract.siteId,st_url:url,st_hash:contract.siteUrlSha256,st_enabled:1 };
}

test('concrete network verifier rechecks DB drift and rejects missing journal or changed manifest', async()=>{
 let row=networkRow(), queries=0, journalOk=true;
 const journal=await realJournal();
 const verify=createOverseasNetworkContractVerifier({repo:{query:async(sql,params)=>{
  queries++;assert.match(sql,/^SELECT/);assert.doesNotMatch(sql,/FOR UPDATE|\bINSERT\b|\bUPDATE\b|\bDELETE\b|token|credential/i);
  assert.deepEqual(params,[contract.runId]);return [row];
 }},journal:{verify:async c=>journalOk && await journal.verify(c)},manifestSha256:contract.manifestSha256});
 assert.equal(await verify(contract),true);
 for(const patch of [{r_live:0},{r_owner:'other'},{r_epoch:2},{r_status:'pausing'},{r_status:'cancelling'},
  {r_start:contract.windowEnd},{s_game:null},{a_source:'other'},{cm_game:'other'},{st_url:url+'x'},{st_hash:'x'},{st_enabled:0},
  {s_config:{...source.config,boardId:'other'}},{s_config:{...source.config,siteUrls:[]}},
  ...[true,'true',1,null,{}].map(deleted=>({s_config:{...source.config,deleted}})),
  ...[true,0,'2026-02-30 00:00:00','2026-10-09T00:00:00+00:00'].map(r_start=>({r_start}))]){
  row={...networkRow(),...patch};await assert.rejects(()=>verify(contract),{code:'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED'});
 }
 row=networkRow();const before=queries;journalOk=false;
 await assert.rejects(()=>verify(contract));assert.equal(queries,before);
 journalOk=true;await assert.rejects(()=>verify({...contract,manifestSha256:'b'.repeat(64)}));assert.equal(queries,before);
 for(const r_start of [new Date(contract.windowStart),'2026-10-09 00:00:00.000']){
  row={...networkRow(),r_start};assert.equal(await verify(contract),true);
 }
 const repositoryRoot=path.resolve(__dirname,'../../../..');
 const directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-missing-proof-'));
 const missing=await createOverseasRunContractJournal({repositoryRoot,directory});
 let reads=0;
 const missingVerify=createOverseasNetworkContractVerifier({repo:{query:async()=>{reads++;return [networkRow()];}},journal:missing,manifestSha256:contract.manifestSha256});
 await assert.rejects(()=>missingVerify(contract),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});assert.equal(reads,0);
});
test('claimed contracts create only explicit first binding; missing resume and changed epoch never create',async()=>{
 const {createOverseasClaimedContracts}=require('../src/overseasBigPlayerClaimedContracts');
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-claimed-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});let creates=0;
 const counted={read:journal.read,create:async c=>{creates++;return journal.create(c);}};
 const repo={query:async sql=>sql.includes('SELECT attempts')?[{attempts:1,lease_owner:contract.leaseOwner,lease_epoch:1,live:1}]:[networkRow()]};
 const input={source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseEpoch:1,windowStart:contract.windowStart,windowEnd:contract.windowEnd};
 const resume=createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256});
 await assert.rejects(()=>resume.prepare(input),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});assert.equal(creates,0);
 const first=createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256,initialContracts:[contract]});
 assert.deepEqual(await first.prepare(input),contract);await first.prepare(input);assert.equal(creates,1);
 await assert.rejects(()=>resume.read({...input,leaseEpoch:2}),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});assert.equal(creates,1);
});
test('actual runSource rejects unauthorized initial claim before ordinary claim or HTTP',async()=>{
 const {runSource}=require('../src/worker');
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-run-resume-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});
 const events=[],owner='base:11111111-1111-1111-1111-111111111111';let network=0;
 const repo={query:async sql=>{
  if(sql.startsWith('SELECT s.id,s.platform,g.region_code'))return [{id:source.id,platform:source.platform,region_code:source.region_code}];
  if(sql.startsWith('SELECT s.id AS s_id')){events.push('identity');return [identityRow()];}
  return [{...networkRow(),r_owner:owner}];
 },getDefaultAccount:async()=>account,getAccount:async()=>account,loadKeywordRules:async()=>[],
 pool:{getConnection:async()=>{throw Error('must not acquire');}},_upsertContentPageAttempt(){},
 claimSyncRun:async()=>{events.push('claim');return {id:contract.runId,source_id:source.id,account_id:account.id,site_id:contract.siteId,
  lease_owner:owner,lease_epoch:1,status:'running',attempts:2,window_start:contract.windowStart,window_end:contract.windowEnd};},
 renewSyncRunLease:async(id,actual)=>{assert.equal(actual,owner);events.push('renew');return true;},
 createRun:async()=>({id:'audit'}),finishSyncRun:async(id,options)=>{assert.equal(options.leaseOwner,owner);assert.equal(options.errorCode,'OVERSEAS_CONTRACT_EVIDENCE_MISSING');events.push('failed');return {};},finishRun:async()=>{},markSourceRun:async()=>{}};
 const baseDeps={repo,connectors:{},credentialContext:{},ai:{configured:()=>true},leaseOwner:'base',leaseSeconds:300};
 const candidate=createIsolatedOverseasCandidateDeps({baseDeps,journal,manifestSha256:contract.manifestSha256,transport:async()=>{network++;throw Error('must not call');},translationVersion:'v1'});
 try{
 await assert.rejects(()=>runSource(candidate,source,{id:contract.runId,source_id:source.id,account_id:account.id,site_id:contract.siteId}),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});
 assert.deepEqual(events,['identity']);assert.equal(network,0);assert.deepEqual(await fs.readdir(directory),[]);
 }finally{candidate.closeOverseasCandidate();}
});
test('candidate rejects native fetch before assembly; first permission is consumed on validation failure',async()=>{
 assert.throws(()=>createIsolatedOverseasCandidateDeps({transport:globalThis.fetch}),TypeError);
 const {createOverseasClaimedContracts}=require('../src/overseasBigPlayerClaimedContracts');
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-first-failed-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});let live=0;
 const repo={query:async()=>[{...networkRow(),r_live:live}]};
 const manager=createOverseasClaimedContracts({repo,journal,manifestSha256:contract.manifestSha256,initialContracts:[contract]});
 const input={source,account,syncRunId:contract.runId,leaseOwner:contract.leaseOwner,leaseEpoch:1,windowStart:contract.windowStart,windowEnd:contract.windowEnd};
 await assert.rejects(()=>manager.prepare(input),{code:'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED'});
 live=1;await assert.rejects(()=>manager.prepare(input),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});
 assert.deepEqual(await fs.readdir(directory),[]);
});
test('first run bindings require full scope and never allow resumed epochs',async()=>{
 const {createOverseasClaimedContracts}=require('../src/overseasBigPlayerClaimedContracts');
 const binding=Object.fromEntries(Object.entries(contract).filter(([key])=>!['leaseOwner','leaseEpoch'].includes(key)));
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-first-scope-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});let creates=0;
 const counted={read:journal.read,create:async c=>{creates++;return journal.create(c);}};
 let attempts=2,epoch=2;
 const repo={query:async sql=>sql.startsWith('SELECT attempts')?[{attempts,lease_owner:'random-owner',lease_epoch:epoch,live:1}]:[{...networkRow(),r_owner:'random-owner',r_epoch:epoch}]};
 for(const value of [{runId:contract.runId},{...binding,leaseOwner:'injected'},{...binding,manifestSha256:'b'.repeat(64)}]){
  assert.throws(()=>createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256,initialRunBindings:[value]}));
 }
 const manager=createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256,initialRunBindings:[binding]});
 assert.throws(()=>createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256,initialRunBindings:[binding,binding]}));
 assert.throws(()=>createOverseasClaimedContracts({repo,journal:counted,manifestSha256:contract.manifestSha256,initialContracts:[{...contract,leaseEpoch:2}]}));
 const input={source,account,syncRunId:contract.runId,leaseOwner:'random-owner',leaseEpoch:2,windowStart:contract.windowStart,windowEnd:contract.windowEnd};
 await assert.rejects(()=>manager.prepare(input),{code:'OVERSEAS_CLAIMED_CONTRACT_INVALID'});assert.equal(creates,0);
 attempts=1;epoch=1;
 await assert.rejects(()=>manager.prepare({...input,leaseEpoch:1}),{code:'OVERSEAS_CONTRACT_EVIDENCE_MISSING'});assert.equal(creates,0);
});
for (const recoveryMode of ['explicit','recovered','competing-claim']) test(`actual runSource claim/page/job chain ${recoveryMode}`,async()=>{
 const {runSource}=require('../src/worker'),f=fixture({runPatch:{status:'queued',lease_epoch:0,attempts:0}});
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-success-run-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});
 let activeContract=contract,receipt,request;
 if(recoveryMode!=='explicit') {
  const {createOverseasManualReceipt}=require('../src/overseasManualReceipt');
  const receiptDirectory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-e2e-receipt-'));
  receipt=await createOverseasManualReceipt({repositoryRoot,directory:receiptDirectory});
  const originalPool=f.repo.pool;
  // Actual prepare and handoff SQL, with a deliberately bounded executor.
  const receiptConn={beginTransaction:async()=>{},rollback:async()=>{},commit:async()=>{},release(){},destroy(){},
   async query(sql,params=[]){
    if(sql.includes('FROM po_sources s JOIN'))return [[{...source,default_account_id:account.id,auth_status:'authorized',auth_expired:0,community_game:source.game_id,
      marker:'2026-10-10 00:00:00.000000',admission_anchor:'2026-10-10 00:00:00.000000'}]];
    if(sql.includes('FROM po_accounts WHERE'))return [[{...account,auth_status:'authorized',auth_expired:0}]];
    if(sql.includes('FROM po_credentials'))return [[{id:'fixture',status:'active',credential_expired:0,has_secret_cipher:1}]];
    if(sql.includes('FROM po_source_sites'))return [[{site_id:source.siteId,url,url_hash:fingerprint(url),enabled:1}]];
    if(sql.includes('FROM po_sync_checkpoints'))return [[]];
    if(sql.includes('AS now_utc'))return [[{now_utc:'2026-10-10 00:00:00.000000'}]];
    if(sql.startsWith('SELECT id FROM po_sync_runs'))return [[]];
    if(sql.startsWith('INSERT INTO po_sync_runs')){Object.assign(f.run,{id:params[0],window_start:params[4],window_end:params[5],
      parent_run_id:null,trigger_type:'manual',sync_mode:'incremental',scheduled_at:null,attempts:0,lease_epoch:0,lease_owner:null,lease_until:null,next_retry_at:null,started_at:null,finished_at:null});return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE po_sources'))return [{affectedRows:1}];
    if(sql.startsWith('SELECT * FROM po_sync_runs'))return [[f.run.id===params[0]?{...f.run}:null].filter(Boolean)];
    throw Error('unexpected receipt SQL '+sql);
   }};
  f.repo.pool={getConnection:async()=>receiptConn};
  request=await receipt.prepare({repo:f.repo,sourceId:source.id,expectedMarker:'2026-10-10T00:00:00.000Z',manifestSha256:contract.manifestSha256});
  await f.repo.handoffOverseasManualMarker({request,receipt});
  // Rebuild reader from durable files, not the prepare object's memory.
  receipt=await createOverseasManualReceipt({repositoryRoot,directory:receiptDirectory});
  activeContract={...request.bindings[0],leaseOwner:'owner',leaseEpoch:1};
  f.repo.pool={getConnection:async()=>{
   const original=await originalPool.getConnection();let readonly=false;
   return {...original,async rollback(){if(!readonly)await original.rollback();},async query(sql,params=[]){
    if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')return [[]];
    if(sql==='START TRANSACTION READ ONLY'){readonly=true;return [[]];}
    if(sql.includes('WHERE id IN'))return [[{...f.run}]];
    if(sql.includes('AS marker FROM po_sources'))return [[{marker:null}]];
    return original.query(sql,params);
   }};
  }};
 }
 const sqlCalls=[],requests=[],terminal=[];const query=f.repo.query;
 f.repo.query=async(sql,params=[])=>{
  sqlCalls.push({sql,params});
  if(sql.startsWith('SELECT s.id,s.platform,g.region_code'))return [{id:source.id,platform:source.platform,region_code:source.region_code}];
  if(sql.startsWith('SELECT s.id AS s_id'))return [{...identityRow(),r_id:f.run.id,r_status:f.run.status}];
  if(sql.startsWith("UPDATE po_sync_runs SET status='running'")){
   if(recoveryMode==='competing-claim')return {affectedRows:0};
   assert.match(params[0],/^base:[a-f0-9-]{36}$/);Object.assign(f.run,{status:'running',lease_owner:params[0],lease_epoch:1,attempts:1,parent_run_id:null,trigger_type:'manual',sync_mode:'incremental',scheduled_at:null});return {affectedRows:1};
  }
  if(sql.startsWith('SELECT * FROM po_sync_runs WHERE id='))return [{...f.run}];
  if(sql.includes('r.id AS r_id'))return [{...networkRow(),r_id:f.run.id,r_start:activeContract.windowStart,r_end:activeContract.windowEnd,r_owner:f.run.lease_owner,r_epoch:f.run.lease_epoch}];
  if(sql.startsWith('SELECT attempts'))return [{...f.run}];
  if(sql.includes('FROM po_keyword_rules'))return [];
  return query(sql,params);
 };
 f.repo.claimDeadlockMaxAttempts=1;
 f.repo.getDefaultAccount=async()=>account;f.repo.getAccount=async()=>account;
 f.repo.createRun=async()=>({id:'audit'});f.repo.updateAccount=async()=>{};f.repo.updateSourceAuth=async()=>{};
 f.repo.acquireAdvisoryLock=undefined;f.repo.markSyncRunRequest=undefined;f.repo.setRunBoardName=undefined;
 f.repo.getSyncRunControl=undefined;f.repo.settleSyncRunControl=undefined;
 f.repo.getSyncCheckpoint=async()=>null;
 f.repo.claimSyncCheckpoint=async input=>{
  const cp={...f.cp,id:'cp-'+input.syncScope+'-'+input.taskKey,account_id:input.accountId,site_id:input.siteId,sync_scope:input.syncScope,root_platform_content_id:input.rootPlatformContentId,
   task_kind:input.taskKind,task_key:input.taskKey,window_start:input.windowStart,window_end:input.windowEnd,lease_owner:input.leaseOwner,cursor:null,status:'running'};
  f.checkpoints.set(cp.id,cp);return {...cp};
 };
 f.repo.releaseSyncCheckpoint=async()=>{};
 f.repo.listOverseasBigPlayerCommentParents=async()=>({rows:[],hasMore:false,coverageGaps:0});
 f.repo.finishSyncRun=async(id,options)=>{terminal.push(options);return {};};f.repo.finishRun=async()=>{};f.repo.markSourceRun=async()=>{};
 const transport=async(value,options)=>{
  const u=new URL(value);requests.push(u.pathname);
  const c={...activeContract,leaseOwner:f.run.lease_owner};await journal.read(c);
  let payload;
  if(u.pathname.endsWith('/login/token'))payload={code:0,data:{token:'fixture-site-token'}};
  else if(u.pathname.endsWith('/user/context'))payload={code:0,data:{gameBoards:[{id:100017,name:'fixture'}]}};
  else if(u.pathname.endsWith('/auth/board'))payload={code:0,data:{id:100017,groups:[{id:10,name:'info',type:0,sections:[{id:11,name:'news'}]}]}};
  else if(u.pathname.includes('/comment/'))payload={code:0,data:[],total:0,hasMore:false};
  else if(u.pathname.endsWith('/post/'))payload={code:0,data:{id:123,title:'fixture',content:[{type:0,data:'body'}],createTime:'2026-10-09T01:00:00Z'}};
  else if(u.pathname.endsWith('/merged-list'))payload={code:0,data:{list:[{id:123,title:'fixture',content:[{type:0,data:'body'}],createTime:'2026-10-09T01:00:00Z',commentCount:0}],total:1,hasMore:false}};
  else if(u.pathname.endsWith('/post/list'))payload={code:0,data:{list:[],total:0,hasMore:false}};
  else throw Error('unexpected fixture path '+u.pathname);
  return {ok:true,status:200,url:String(u),json:async()=>payload};
 };
 const binding=Object.fromEntries(Object.entries(contract).filter(([key])=>!['leaseOwner','leaseEpoch'].includes(key)));
 const candidateOptions={baseDeps:{repo:f.repo,connectors:{},credentialContext:{load:async(subject,kind)=>{
  if(kind==='account_password')throw Object.assign(new Error('fixture has no password'),{code:'CREDENTIAL_NOT_FOUND'});
  return {apiToken:'fixture-token'};
 },loadApiToken:async()=> 'fixture-token'},
  ai:{configured:()=>true,profiles:{light:{version:'light-v1'}}},leaseOwner:'base',leaseSeconds:300,pageSize:20,pageBudget:2,pageTimeoutMs:1000,
  dailyFeedFetchConcurrency:1,dailyCommentFetchConcurrency:1,dailyReplyFetchConcurrency:1},journal,manifestSha256:contract.manifestSha256,transport,
  translationVersion:'translation-v1'};
 const candidate=recoveryMode==='explicit'?createIsolatedOverseasCandidateDeps({...candidateOptions,initialRunBindings:[binding]}):
  await require('../src/overseasManualFirstClaimRecovery').createRecoveredIsolatedOverseasCandidateDeps({...candidateOptions,receipt,requestIds:[request.requestId]});
 if(recoveryMode==='competing-claim')Object.assign(f.run,{status:'running',attempts:1,lease_epoch:1,lease_owner:'other-owner'});
 try{
  await runSource(candidate,source,{id:f.run.id,source_id:source.id,account_id:account.id,site_id:contract.siteId});
  if(recoveryMode==='competing-claim'){
   assert.equal(requests.length,0);assert.equal(terminal.length,0);assert.deepEqual(await fs.readdir(directory),[]);
   assert.equal(sqlCalls.some(call=>call.sql.startsWith('UPDATE po_sync_runs SET lease_until')),false);
   assert.equal(f.calls.some(call=>call.sql.startsWith('INSERT INTO po_contents')),false);return;
  }
  assert.equal(terminal.length,1);assert.equal(terminal[0].status,'completed_authorized_scope',JSON.stringify(terminal[0]));
  assert.equal(terminal[0].storedCount,1);assert.equal(terminal[0].leaseOwner,f.run.lease_owner);
  assert.ok(sqlCalls.some(call=>call.sql.includes("status='queued' AND lease_epoch=0 AND attempts=0")));
  assert.equal(sqlCalls.some(call=>call.sql.includes('lease_epoch=lease_epoch+1')),false);
  assert.ok(sqlCalls.some(call=>call.sql.startsWith('UPDATE po_sync_runs SET lease_until')&&call.params[2]===f.run.lease_owner));
  assert.equal(f.calls.filter(call=>call.sql.startsWith('INSERT INTO po_analysis_jobs')).length,1);
  assert.equal(f.calls.filter(call=>call.sql.startsWith('INSERT INTO po_translation_jobs')).length,1);
  assert.equal(requests.filter(value=>value.endsWith('/login/token')).length,1);
 }finally{candidate.closeOverseasCandidate();}
});
test('offline actual session connector page repository and atomic job SQL', async () => {
 const f=fixture({initial:[historical('123')],checkpointPatch:{sync_scope:'comments',root_platform_content_id:'123',task_kind:'comments',task_key:'123'}});
 const requests=[];
 const transport=async(value,options)=>{
  const u=new URL(value);requests.push({path:u.pathname,options});
  assert.ok(['/api/club/v1/login/token','/api/club/v1/auth/comment/123'].includes(u.pathname));
  const payload=u.pathname==='/api/club/v1/login/token'?{code:0,data:{token:'fixture-site-token'}}:
   {code:0,total:1,hasMore:false,data:[{id:456,content:'new comment',createTime:'2026-10-09T01:00:00Z',commentCount:0}]};
  return {ok:true,status:200,url:String(u),json:async()=>payload};
 };
 const originalQuery=f.repo.query;
 let networkChecks=0;
 f.repo.getDefaultAccount=async()=>account;
 f.repo.query=async(sql,params)=>{
  if(sql.startsWith('SELECT s.id,s.platform,g.region_code'))return [{id:source.id,platform:source.platform,region_code:source.region_code}];
  if(sql.startsWith('SELECT s.id AS s_id'))return [identityRow()];
  if(sql.includes('r.id AS r_id')){networkChecks++;return [networkRow()];}
  if(sql.startsWith('SELECT attempts'))return [{attempts:1,lease_owner:contract.leaseOwner,lease_epoch:1,live:1}];
  if(sql.includes('FROM po_keyword_rules'))return [];
  return originalQuery(sql,params);
 };
 const repositoryRoot=path.resolve(__dirname,'../../../..'),directory=await fs.mkdtemp(path.join(repositoryRoot,'.temp','overseas-factory-proof-'));
 const journal=await createOverseasRunContractJournal({repositoryRoot,directory});
 const baseDeps={repo:f.repo,connectors:{bigplayer_h5:{}},credentialContext:{loadApiToken:async()=> 'fixture-base-token'},ai:{configured:()=>true,profiles:{light:{version:'light-v1'}}},
 pageSize:20,pageTimeoutMs:1000,leaseOwner:'owner',leaseSeconds:300,syncRunLeaseEpoch:1,
 collectionWindow:{dailyBounded:true,publishedFrom:contract.windowStart,publishedTo:contract.windowEnd}};
 const candidate=createIsolatedOverseasCandidateDeps({baseDeps,journal,manifestSha256:contract.manifestSha256,transport,translationVersion:'translation-v1',initialContracts:[contract]});
 const routed=await candidate.resolveSourceDeps(source,{id:contract.runId,source_id:source.id,account_id:account.id,site_id:contract.siteId});
 const deps=routed.deps;
 assert.deepEqual(await fs.readdir(directory),[]); // Resolver must not fabricate claim evidence.
 await deps.prepareOverseasClaimedRun({source:routed.source,account,syncRun:{id:contract.runId},leaseOwner:contract.leaseOwner,leaseEpoch:1,collectionWindow:deps.collectionWindow});
 assert.equal((await fs.readdir(directory)).length,1);
 await assert.rejects(candidate.resolveSourceDeps({...source,region_code:'domestic'}),{code:'OVERSEAS_CANDIDATE_SOURCE_FENCE_INVALID'});
 // Fake connection exercises actual Repository SQL, not a real database.
 deps.repo.getSyncRunControl=undefined;deps.repo.settleSyncRunControl=undefined;
 const stage={source:routed.source,account,connector:deps.connectors.bigplayer_h5,scope:'comments',rootPlatformContentId:'123',postPlatformId:'123',
 syncScope:'comments',checkpointRoot:'123',taskKind:'comments',taskKey:'123',syncRunId:'55555555-5555-5555-5555-555555555555',syncMode:'incremental',checkpoint:{id:'cp'},cursor:null,sortType:0};
 try{
 const out=await syncStagePage(deps,stage);
 await enqueueDailyAnalysis(deps,source,out.entries);
 assert.equal(networkChecks,5); // prepare twice, contract read, preflight, store verification.
 assert.equal(out.discovered,1);assert.equal(out.stored,1);assert.equal(f.rows().length,2);
 assert.equal(f.stats().acquires,3);assert.equal(f.stats().commits,3); // Two short dispatch transactions plus the atomic page.
 assert.equal(requests.filter(x=>x.path==='/api/club/v1/login/token').length,1);
 assert.equal(f.calls.filter(x=>x.sql.startsWith('INSERT INTO po_analysis_jobs')).length,1);
 assert.equal(f.calls.filter(x=>x.sql.startsWith('INSERT INTO po_translation_jobs')).length,1);
 }finally{candidate.closeOverseasCandidate();}
});
