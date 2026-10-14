'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { createOverseasRunContractJournal } = require('../src/overseasBigPlayerRunContractJournal');
const { createIsolatedSharedWorkerRuntime } = require('../src/isolatedSharedWorkerRuntime');
async function fixture(scan) {
  const events = [], baseDeps = { repo: { loadKeywordRules: async () => [], query: async () => { events.push('query'); return []; }, pool: { end: async () => events.push('pool') } } };
  const repositoryRoot = path.resolve(__dirname, '../../../..');
  const directory = await fs.mkdtemp(path.join(repositoryRoot, '.temp', 'overseas-shared-runtime-'));
  const journal = await createOverseasRunContractJournal({ repositoryRoot, directory });
  baseDeps.repo.pool.getConnection = async () => { throw new Error('Unexpected SQL connection in lifecycle fixture'); };
  baseDeps.repo.getSource = async () => { throw new Error('Unexpected source read in non-target fixture'); };
  baseDeps.repo.getAccount = async () => { throw new Error('Unexpected account read in non-target fixture'); };
  baseDeps.repo.getDefaultAccount = async () => { throw new Error('Unexpected default account read in non-target fixture'); };
  const options = { baseDeps, journal, manifestSha256: 'a'.repeat(64), transport: async () => events.push('http'), translationVersion: 'isolated-v1', scan };
  return { events, baseDeps, options };
}
test('one scan and idempotent shutdown drain before pool close', async () => {
  let unblock; const gate = new Promise(resolve => { unblock = resolve; });
  const f = await fixture(async deps => { assert.ok(deps.drainController); await gate; f.events.push('scan-done'); });
  const runtime = createIsolatedSharedWorkerRuntime(f.options), first = runtime.run();
  assert.equal(runtime.run(), first);
  const closing = runtime.shutdown(); assert.equal(runtime.shutdown(), closing);
  assert.equal((await runtime.run()).reasonCode, 'WORKER_DRAINING');
  assert.deepEqual(f.events, []); unblock(); await closing;
  assert.deepEqual(f.events, ['scan-done', 'pool']);
  assert.equal(runtime.productionActivationAllowed, false);
});
test('failed scan still waits for cleanup then closes pool', async () => {
  const f = await fixture(async () => { f.events.push('failed-scan'); throw new Error('synthetic'); });
  const runtime = createIsolatedSharedWorkerRuntime(f.options);
  await assert.rejects(runtime.run(), /synthetic/); await runtime.shutdown();
  assert.deepEqual(f.events, ['failed-scan', 'pool']);
});
test('non-target routes verify canonical classification and preserve original deps without account/network calls', async () => {
  const f = await fixture(async () => {}), runtime = createIsolatedSharedWorkerRuntime(f.options);
  f.baseDeps.repo.query=async(sql,params)=>{assert.match(sql,/^SELECT s.id,s.platform,g.region_code/);f.events.push('canonical-source-read');return [{id:params[0],platform:params[0]==='domestic'?'bigplayer_h5':'discord',region_code:params[0]==='domestic'?'domestic':'overseas'}];};
  for (const source of [{ id: 'domestic', platform: 'bigplayer_h5', region_code: 'domestic' }, { id: 'discord', platform: 'discord', region_code: 'overseas' }]) {
    const routed = await runtime.deps.resolveSourceDeps(source);
    assert.equal(routed.deps, f.baseDeps); assert.equal(routed.source, source);
  }
  assert.deepEqual(f.events, ['canonical-source-read','canonical-source-read']); await runtime.shutdown();
});

test('caller cannot disguise persisted overseas source as domestic or another platform',async()=>{
 const f=await fixture(async()=>{}),runtime=createIsolatedSharedWorkerRuntime(f.options);
 f.baseDeps.repo.query=async()=>[{id:'overseas',platform:'bigplayer_h5',region_code:'overseas'}];
 for(const source of [{id:'overseas',platform:'bigplayer_h5',region_code:'domestic'},{id:'overseas',platform:'discord',region_code:'overseas'}])
  await assert.rejects(runtime.deps.resolveSourceDeps(source),{code:'OVERSEAS_CANDIDATE_SOURCE_FENCE_INVALID'});
 assert.deepEqual(f.events,[]);await runtime.shutdown();
});
test('global fetch and incomplete policy cannot activate runtime', async () => {
  const f = await fixture(async () => {});
  assert.throws(() => createIsolatedSharedWorkerRuntime({ ...f.options, transport: globalThis.fetch }), /Isolated candidate/);
  assert.throws(() => createIsolatedSharedWorkerRuntime({ ...f.options, translationVersion: undefined }), /Isolated candidate/);
});
test('candidate cannot activate ordinary scheduled slot writes', async () => {
 const f=await fixture(async()=>{});f.baseDeps.unifiedScheduler={mode:'enabled'};
 assert.throws(()=>createIsolatedSharedWorkerRuntime(f.options),{code:'OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE'});
 assert.deepEqual(f.events,[]);
});
test('post-assembly scheduler mutation cannot enable candidate slot writes',async()=>{
 const f=await fixture(async()=>{});f.baseDeps.unifiedScheduler={mode:'off'};
 const runtime=createIsolatedSharedWorkerRuntime(f.options);f.baseDeps.unifiedScheduler.mode='enabled';
 assert.equal(runtime.deps.unifiedScheduler.mode,'off');assert.equal(Object.isFrozen(runtime.deps.unifiedScheduler),true);
 await runtime.shutdown();
});

test('failed scan joins admitted task cleanup before closing pool', async () => {
  let releaseTask;
  const f = await fixture(async deps => {
    const task = deps.drainController.admit();
    releaseTask = () => { f.events.push('task-cleanup'); task.release(); };
    throw new Error('synthetic-after-admission');
  });
  const runtime = createIsolatedSharedWorkerRuntime(f.options);
  await assert.rejects(runtime.run(), /synthetic-after-admission/);
  let closed = false;
  const closing = runtime.shutdown().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false); assert.deepEqual(f.events, []);
  assert.equal((await runtime.run()).reasonCode, 'WORKER_DRAINING');
  releaseTask(); await closing;
  assert.deepEqual(f.events, ['task-cleanup', 'pool']);
});

test('default real runOnce protects bulk state and drains empty queue', async () => {
  const f = await fixture(); delete f.options.scan;
  f.baseDeps.leaseOwner = 'isolated-shared'; f.baseDeps.sourceConcurrency = 1;
  f.baseDeps.unifiedScheduler = { mode: 'off' };
  const token = Object.freeze({ owner: 'isolated-shared', epoch: 1 });
  f.baseDeps.scanLease = {
    acquire: async () => { f.events.push('acquire'); return token; },
    renew: async received => { assert.equal(received, token); return true; },
    release: async received => { assert.equal(received, token); f.events.push('release'); return true; }
  };
  f.baseDeps.repo.query = async (sql, parameters) => {
    assert.match(sql, /^UPDATE po_sync_runs SET/);
    assert.match(sql, /AND EXISTS \(SELECT 1 FROM po_sources s JOIN po_games g/);
    assert.match(sql, /BINARY s\.platform='bigplayer_h5' AND BINARY g\.region_code='domestic'/);
    assert.deepEqual(parameters, [3, 3, 600, 50]);
    f.events.push('protected-legacy-recovery'); return { affectedRows: 0 };
  };
  f.baseDeps.repo.health = async () => f.events.push('health');
  f.baseDeps.repo.listRunnableSyncRuns = async () => { f.events.push('queue'); return []; };
  f.baseDeps.repo.listManualDueSources = async () => { f.events.push('manual'); return []; };
  f.baseDeps.repo.listDueSources = async () => { f.events.push('due'); return []; };
  const runtime = createIsolatedSharedWorkerRuntime(f.options);
  assert.deepEqual(await runtime.run(), { queued: 0, manual: 0, scanned: 0 });
  assert.deepEqual(f.events, ['acquire', 'health', 'protected-legacy-recovery', 'queue', 'manual', 'due', 'release']);
  assert.equal(runtime.deps.drainController.stats().active, 0);
  await runtime.shutdown(); assert.equal(f.events.at(-1), 'pool');
  assert.equal(f.events.includes('http'), false); assert.equal(runtime.productionActivationAllowed, false);
});
