'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createOverseasCandidateLegacyRecovery, assertCandidateLegacyRecovery } = require('../src/overseasCandidateLegacyRecovery');
test('candidate bulk recovery keeps defaults and requires known non-target identity', async () => {
  const calls = [], repo = { query: async (sql, params) => { calls.push({ sql, params }); return { affectedRows: 2 }; } };
  const handler = createOverseasCandidateLegacyRecovery({ repo });
  assert.equal(assertCandidateLegacyRecovery(handler, repo), handler);
  assert.deepEqual(await handler(), { recovered: 2, limit: 50, overseasRecoveryPerformed: false });
  assert.equal(calls.length, 1); const { sql, params } = calls[0];
  assert.deepEqual(params, [3, 3, 600, 50]); assert.match(sql, /^UPDATE po_sync_runs SET/);
  assert.match(sql, /AND EXISTS \(SELECT 1 FROM po_sources s JOIN po_games g ON g\.id=s\.game_id/);
  assert.match(sql, /s\.id=po_sync_runs\.source_id/);
  assert.match(sql, /BINARY g\.region_code IN \('domestic','overseas'\)/);
  assert.match(sql, /BINARY s\.platform='bigplayer_h5' AND BINARY g\.region_code='domestic'/);
  assert.doesNotMatch(sql, /NOT EXISTS|board_id|site_url_snapshot/);
  assert.match(sql, /lease_epoch=lease_epoch\+1, attempts=attempts\+1/);
});
test('empty recovery does not supply an overseas claim', async () => {
  const handler = createOverseasCandidateLegacyRecovery({ repo: { query: async () => ({ affectedRows: 0 }) } });
  assert.deepEqual(await handler(), { recovered: 0, limit: 50, overseasRecoveryPerformed: false });
});
test('brand binds repository and rejects copied or wrapped functions', () => {
  const repo = { query: async () => ({ affectedRows: 0 }) }, handler = createOverseasCandidateLegacyRecovery({ repo });
  for (const candidate of [async () => {}, handler.bind(null), Object.assign(async () => {}, handler)])
    assert.throws(() => assertCandidateLegacyRecovery(candidate, repo), { code: 'OVERSEAS_LEGACY_RECOVERY_UNVERIFIED' });
  assert.throws(() => assertCandidateLegacyRecovery(handler, { ...repo }), { code: 'OVERSEAS_LEGACY_RECOVERY_UNVERIFIED' });
  assert.throws(() => createOverseasCandidateLegacyRecovery({ repo: {} }), { code: 'OVERSEAS_LEGACY_RECOVERY_UNVERIFIED' });
});
test('SQL failure propagates without fallback recovery writes', async () => {
  let calls = 0; const failure = Object.assign(new Error('synthetic'), { code: 'ER_LOCK_DEADLOCK' });
  const handler = createOverseasCandidateLegacyRecovery({ repo: { query: async () => { calls++; throw failure; } } });
  await assert.rejects(handler(), error => error === failure); assert.equal(calls, 1);
});
