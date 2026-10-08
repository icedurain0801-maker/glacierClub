'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRunAccount } = require('../src/worker');
const { scheduleSources } = require('../src/sourceScheduler');

test('claimed BigPlayer run resolves its account subject instead of the source default', async () => {
  const source = { id: 'source-1', game_id: 'game-1', platform: 'bigplayer_h5' };
  const bound = { id: 'account-bound', source_id: 'source-1', platform: 'bigplayer_h5', auth_status: 'authorized' };
  const fallback = { id: 'account-default', source_id: 'source-1', platform: 'bigplayer_h5', auth_status: 'authorized' };
  const calls = [];
  const repo = {
    async getAccount(id) { calls.push(['getAccount', id]); return id === bound.id ? bound : null; },
    async getDefaultAccount(input) { calls.push(['getDefaultAccount', input]); return fallback; }
  };
  const account = await resolveRunAccount(repo, source, { account_id: 'account-bound' });
  assert.strictEqual(account, bound);
  assert.deepEqual(calls, [['getAccount', 'account-bound']]);
});

test('scheduled catchup window end covers execution time so midnight content is eligible', async () => {
  const now = new Date('2026-09-22T02:15:00.000Z');
  const source = { id: 'source-catchup', game_id: 'game-1', community_id: 'community-1', config: { boardId: '2' }, platform: 'bigplayer_h5', region_code: 'domestic', enabled: 1, game_enabled: 1, community_status: 'enabled', default_account_id: 'account-1', auth_status: 'authorized', frequency_seconds: 86400, schedule_effective_at: '2026-09-20T00:00:00.000Z', schedule_version: 1 };
  const account = { id: 'account-1', source_id: source.id, game_id: source.game_id, platform: source.platform, community_id: source.community_id, enabled: 1, auth_status: 'authorized' };
  const enqueued = [];
  const result = await scheduleSources({
    now, sources: [source], accounts: [account],
    connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
    leaseAdapter: { async acquire() { return { acquired: true, leaseToken: 'lease' }; } },
    async enqueue(intent) { enqueued.push(intent); return { created: true, runId: 'run-catchup' }; }
  });
  assert.equal(result.decisions[0].triggerType, 'scheduled_catchup');
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].windowEndAt, now.toISOString());
  assert.ok(Date.parse(enqueued[0].windowEndAt) > Date.parse(enqueued[0].scheduledAt));
});
