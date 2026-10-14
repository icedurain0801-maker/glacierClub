'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createSharedWorkerIdentityLoader } = require('../src/sharedWorkerIdentityLoader');
const source = { id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5' };
const run = { id: 'r', source_id: 's', account_id: 'a', site_id: 'site' };
const row = { s_id: 's', s_game_id: 'g', s_community_id: 'c', s_platform: 'bigplayer_h5', g_id: 'g', g_region_code: 'overseas',
  c_id: 'c', c_game_id: 'g', a_id: 'a', a_source_id: 's', a_game_id: 'g', a_community_id: 'c', a_platform: 'bigplayer_h5',
  ag_id: 'g', ag_region_code: 'overseas', ac_id: 'c', ac_game_id: 'g', r_id: 'r', r_source_id: 's', r_account_id: 'a', r_site_id: 'site' };
function fixture(patch = {}) {
  const calls = []; const load = createSharedWorkerIdentityLoader({ repo: {
    getDefaultAccount: async input => { calls.push(input); return { id: 'a' }; },
    query: async (sql, params) => { calls.push({ sql, params }); return [{ ...row, ...patch }]; } } });
  return { load, calls };
}
test('canonical JOIN supplies missing region without querying credentials', async () => {
  const f = fixture(), identity = await f.load(source, run); assert.equal(identity.source.region_code, 'overseas'); assert.equal(identity.account.id, 'a');
  assert.deepEqual(f.calls[0].params, ['r', 's']); assert.match(f.calls[0].sql, /LEFT JOIN/); assert.doesNotMatch(f.calls[0].sql, /token|secret|cipher|po_credentials|FOR UPDATE/i);
});
test('non-run preserves default-account selection', async () => {
  const f = fixture(); assert.equal((await f.load(source)).run, null); assert.deepEqual(f.calls[0], { sourceId: 's', gameId: 'g', platform: 'bigplayer_h5' });
});
test('missing and conflicting JOIN identities fail closed', async () => {
  for (const key of ['s_id', 'g_id', 'c_id', 'c_game_id', 'a_id', 'a_source_id', 'a_game_id', 'a_community_id', 'a_platform', 'ag_id', 'ac_id', 'r_id', 'r_source_id', 'r_account_id']) {
    await assert.rejects(() => fixture({ [key]: null }).load(source, run), { code: 'WORKER_SOURCE_IDENTITY_INVALID' });
  }
});
test('unknown enum and supplied conflicting scope fail closed', async () => {
  await assert.rejects(() => fixture({ g_region_code: null }).load(source, run));
  await assert.rejects(() => fixture().load({ ...source, region_code: 'domestic' }, run));
  await assert.rejects(() => fixture().load(source, { ...run, site_id: 'wrong' }));
});
