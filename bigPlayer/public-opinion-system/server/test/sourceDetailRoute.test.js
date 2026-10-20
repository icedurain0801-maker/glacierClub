const test = require('node:test');
const assert = require('node:assert/strict');
// Exercise the real HTTP handler without loading an environment file or a DB.
const runtime = require('../src/runtimeEnv');
runtime.loadRuntimeEnv = () => false;
const app = require('../src/app');
let base;
const calls = [];
const source = { id:'qa-source', game_id:'qa-game', community_id:'qa-community', platform:'bigplayer_h5', config:'{}', frequency_seconds:21600 };
test.before(async () => {
  app.repo.resolveCommunityCanonical = async input => ({ ...input, gameId:'qa-game' });
  app.repo.listSources = async (gameId, filters) => {
    calls.push({gameId, ...filters});
    return filters.communityId === 'other-community' || (filters.sourceId && filters.sourceId !== source.id) ? [] : [source];
  };
  app.repo.listAccounts = async () => [];
  app.repo.listSourceCapabilities = async () => [];
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion`;
});
test.after(async () => { await new Promise(resolve => app.server.close(resolve)); await app.repo.pool.end(); });
async function get(path) { const response = await fetch(base+path); return { status:response.status, body:await response.json() }; }
test('source detail returns one object using path ID and canonical scope', async () => {
  const result = await get('/sources/qa-source?regionCode=domestic&communityId=qa-community&platform=bigplayer_h5');
  assert.equal(result.status,200);
  assert.equal(Array.isArray(result.body.data),false);
  assert.equal(result.body.data.id,'qa-source');
  assert.deepEqual(calls.at(-1),{gameId:'qa-game',sourceId:'qa-source',regionCode:'domestic',communityId:'qa-community',platform:'bigplayer_h5'});
});
test('missing or out-of-scope source returns 404',async () => {
  for (const path of ['/sources/missing','/sources/qa-source?communityId=other-community']) {
    const result=await get(path); assert.equal(result.status,404); assert.equal(result.body.error.code,'SOURCE_NOT_FOUND');
  }
});
test('conflicting query ID cannot override detail path',async () => {
  const before=calls.length;
  assert.equal((await get('/sources/qa-source?sourceId=other')).status,400);
  assert.equal(calls.length,before);
});
test('list keeps array contract and query filter',async () => {
  const result=await get('/sources?sourceId=qa-source');
  assert.equal(result.status,200); assert.ok(Array.isArray(result.body.data)); assert.equal(calls.at(-1).sourceId,'qa-source');
});
test('nested source paths are not consumed by list route',async () => {
  const before=calls.length;
  assert.equal((await get('/sources/qa-source/unknown-subresource')).status,501);
  assert.equal(calls.length,before);
});

test('configuration detail never reads checkpoints when an account exists', async () => {
  const keys = ['listAccounts', 'getAccountCredentialSummary', 'getSyncStatus', 'getSourceSyncStatusSummary'];
  const previous = Object.fromEntries(keys.map(key => [key, app.repo[key]]));
  app.repo.listAccounts = async () => [{ id: 'qa-account', source_id: source.id }];
  app.repo.getAccountCredentialSummary = async () => [];
  app.repo.getSyncStatus = app.repo.getSourceSyncStatusSummary = async () => { throw Error('checkpoint query must not run'); };
  try {
    const result = await get('/sources/qa-source?communityId=qa-community');
    assert.equal(result.status, 200);
    assert.equal(result.body.data.account.id, 'qa-account');
    assert.equal(Object.hasOwn(result.body.data, 'checkpoints'), false);
  } finally { Object.assign(app.repo, previous); }
});
test('source list returns account configuration without waiting for historical checkpoints', async () => {
  const previous = { listAccounts: app.repo.listAccounts, getAccountCredentialSummary: app.repo.getAccountCredentialSummary, getSourceSyncStatusSummary: app.repo.getSourceSyncStatusSummary };
  app.repo.listAccounts = async () => [{ id: 'qa-account', source_id: source.id }];
  app.repo.getAccountCredentialSummary = async () => [];
  app.repo.getSourceSyncStatusSummary = async () => { throw Error('list must not read historical checkpoints'); };
  try {
    const result = await get('/sources?communityId=qa-community');
    assert.equal(result.status, 200); assert.equal(result.body.data[0].account.id, 'qa-account');
    assert.deepEqual(result.body.data[0].checkpoints, []);
  } finally { Object.assign(app.repo, previous); }
});

test('separate sync status uses the scoped source and returns complete summary', async () => {
  const oldDefault = app.repo.getDefaultAccount, oldSummary = app.repo.getSourceSyncStatusSummary;
  let queries = 0;
  app.repo.getDefaultAccount = async filters => { assert.equal(filters.sourceId, source.id); return { id: 'qa-account' }; };
  app.repo.getSourceSyncStatusSummary = async ({ accountId }) => { queries++; assert.equal(accountId, 'qa-account'); return [{ sync_scope: 'comments', status: 'idle', checkpoint_count: 90673, items_fetched: 10 }]; };
  try {
    const result = await get('/sources/qa-source/sync-status?communityId=qa-community');
    assert.equal(result.status, 200); assert.equal(result.body.data.checkpoints[0].checkpoint_count, 90673);
    assert.equal((await get('/sources/qa-source/sync-status?communityId=other-community')).status, 404);
    assert.equal((await get('/sources/qa-source/sync-status?sourceId=other')).status, 400);
    assert.equal(queries, 1);
    app.repo.getSourceSyncStatusSummary = async () => { throw Error('summary unavailable'); };
    assert.equal((await get('/sources/qa-source?communityId=qa-community')).status, 200);
  } finally { app.repo.getDefaultAccount = oldDefault; app.repo.getSourceSyncStatusSummary = oldSummary; }
});

test('lightweight source list does not read accounts credentials or checkpoints',async()=>{
 const old=app.repo.listAccounts; app.repo.listAccounts=async()=>{throw Error('lightweight list must not load accounts')};try{const result=await get('/sources?view=summary&communityId=qa-community');assert.equal(result.status,200);assert.equal(result.body.data[0].id,'qa-source');assert.equal(Object.hasOwn(result.body.data[0],'account'),false);assert.equal(Object.hasOwn(result.body.data[0],'config'),false);}finally{app.repo.listAccounts=old}
});

test('overseas management list skips aggregated historical checkpoints', async () => {
  const keys = ['listAccounts', 'getAccountCredentialSummary', 'getSyncStatus', 'getSourceSyncStatusSummary'];
  const previous = Object.fromEntries(keys.map(key => [key, app.repo[key]]));
  const oldRegion = source.region_code;
  source.region_code = 'overseas';
  app.repo.listAccounts = async () => [{ id: 'qa-account', source_id: source.id }];
  app.repo.getAccountCredentialSummary = async () => [];
  app.repo.getSyncStatus = async () => { throw Error('full checkpoint read must not run'); };
  let queries = 0;
  app.repo.getSourceSyncStatusSummary = async () => { queries++; return [{ sync_scope: 'comments', status: 'idle', checkpoint_count: 26785 }]; };
  try {
    const result = await get('/sources?communityId=qa-community');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data[0].checkpoints, []);
    assert.equal(queries, 0);
  } finally { Object.assign(app.repo, previous); source.region_code = oldRegion; }
});
