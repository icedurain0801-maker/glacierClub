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
