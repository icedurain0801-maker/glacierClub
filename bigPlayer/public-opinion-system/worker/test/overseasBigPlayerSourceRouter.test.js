'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createSourceDepsResolver } = require('../src/overseasBigPlayerSourceRouter');
const { createDrainController } = require('../src/workerDrainController');
const { runSource } = require('../src/worker');
const { createOverseasBigPlayerPageStore, isAtomicPageStoreMethod } = require('../src/overseasBigPlayerPageStore');
const { createOverseasPageJobs } = require('../src/overseasBigPlayerPageJobs');
const account = { id: 'a', source_id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5' };
const source = { id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5', region_code: 'domestic' };
test('persisted scheduled child rejects before adapter and claim despite supplied manual',async()=>{
 let adapters=0,claims=0;const target={...source,region_code:'overseas'};
 const baseDeps={repo:{claimSyncRun:async()=>{claims++;}},connectors:{}};
 const resolve=createSourceDepsResolver({baseDeps,loadIdentity:async()=>({source:target,account,run:{id:'r',trigger_type:'scheduled_site',parent_run_id:'parent'}}),
  createOverseasAdapter:async()=>{adapters++;return null;},loadRunContract:async()=>{}});
 await assert.rejects(runSource({...baseDeps,resolveSourceDeps:resolve},target,{id:'r',source_id:'s',account_id:'a',trigger_type:'manual',parent_run_id:null}),{code:'OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE'});
 assert.equal(adapters,0);assert.equal(claims,0);
});
test('non-target uses exact original dependency object', async () => {
  const baseDeps = { repo: {}, connectors: { bigplayer_h5: {} } };
  const resolve = createSourceDepsResolver({ baseDeps, loadIdentity: async () => ({ source, account }), createOverseasAdapter: async () => { throw Error('not target'); }, loadRunContract: async () => {} });
  assert.equal((await resolve(source)).deps, baseDeps);
});
test('overseas route isolates page store and connector without mutating originals', async () => {
  const original = async () => 'old', connector = {};
  const baseDeps = { repo: { upsertContentPage: original }, connectors: { bigplayer_h5: connector } };
  const newConnector = {};
  const pageStore = createOverseasBigPlayerPageStore({ repo: { pool: { getConnection() {} }, _upsertContentPageAttempt() {} }, verifyRunContract: async () => true,
    beforeCommit: createOverseasPageJobs({ analysisOptionsFor: () => ({ profile:'light',version:'v1',triggerReason:'all_content' }),translationOptions:{targetLanguage:'zh-CN',version:'v1'} }) });
  const resolve = createSourceDepsResolver({ baseDeps, loadIdentity: async () => ({ source: { ...source, region_code: 'overseas' }, account }),
    createOverseasAdapter: async () => ({ connector: newConnector, pageStore }), loadRunContract: async () => ({ run: 'contract' }) });
  const routed = await resolve({ ...source, region_code: 'overseas' });
  assert.equal(routed.deps.repo.upsertContentPage, pageStore.upsertContentPage);
  assert.equal(routed.deps.repo.upsertContentPage, routed.deps.repo.upsertContentPage);
  assert.equal(isAtomicPageStoreMethod(routed.deps.repo.upsertContentPage), true);
  assert.equal(routed.deps.connectors.bigplayer_h5, newConnector); assert.equal(baseDeps.repo.upsertContentPage, original); assert.equal(baseDeps.connectors.bigplayer_h5, connector);
});
test('invalid identity and missing adapter never fall back to legacy', async () => {
  for (const identity of [null, { source: { ...source, region_code: null }, account }, { source: { ...source, region_code: 'overseas' }, account }]) {
    let writes = 0; const deps = { repo: { createRun: async () => { writes++; } }, connectors: {} };
    deps.resolveSourceDeps = createSourceDepsResolver({ baseDeps: deps, loadIdentity: async () => identity, createOverseasAdapter: async () => null, loadRunContract: async () => {} });
    await assert.rejects(() => runSource(deps, { ...source, region_code: 'overseas' })); assert.equal(writes, 0);
  }
});
test('drain rejects new admissions, retains active work and releases once', async () => {
  const drain = createDrainController(), ticket = drain.admit(); let done = false;
  drain.request(); const idle = drain.whenIdle().then(() => { done = true; });
  assert.equal(drain.admit(), null); await Promise.resolve(); assert.equal(done, false);
  ticket.release(); ticket.release(); await idle; assert.deepEqual(drain.stats(), { draining: true, active: 0 });
  let calls = 0; assert.equal((await runSource({ drainController: drain, resolveSourceDeps: async () => { calls++; } }, source)).reasonCode, 'WORKER_DRAINING'); assert.equal(calls, 0);
});
