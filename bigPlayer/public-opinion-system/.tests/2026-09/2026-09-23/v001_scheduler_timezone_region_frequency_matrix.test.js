const assert = require('node:assert/strict');
const test = require('node:test');

const { scheduleSources } = require('../../../worker/src/sourceScheduler');

const NOW = new Date('2026-09-23T01:00:00.000Z'); // Beijing 2026-09-23 09:00

function source(regionCode, frequencySeconds) {
  return {
    id: `source-${regionCode}-${frequencySeconds}`,
    game_id: `game-${regionCode}`,
    community_id: `community-${regionCode}`,
    region_code: regionCode,
    platform: 'bigplayer_h5',
    enabled: true,
    game_enabled: true,
    community_status: 'enabled',
    auth_status: 'authorized',
    auth_expire_at: null,
    default_account_id: `account-${regionCode}-${frequencySeconds}`,
    frequency_seconds: frequencySeconds,
    schedule_effective_at: '2026-09-20T18:00:01.000Z',
    active_window: null
  };
}

function account(item) {
  return {
    id: item.default_account_id,
    source_id: item.id,
    game_id: item.game_id,
    community_id: item.community_id,
    platform: item.platform,
    enabled: true,
    auth_status: 'authorized',
    auth_expire_at: null
  };
}

for (const regionCode of ['domestic', 'overseas']) {
  for (const frequencySeconds of [3600, 21600, 86400]) {
    test(`${regionCode} BigPlayer ${frequencySeconds}s uses UTC slot and covers execution cutoff`, async () => {
      const item = source(regionCode, frequencySeconds);
      const enqueued = [];
      const result = await scheduleSources({
        sources: [item],
        accounts: [account(item)],
        connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
        now: NOW,
        leaseAdapter: { async acquire() { return { acquired: true, leaseToken: 'qa-lease' }; }, async release() {} },
        enqueue: async intent => { enqueued.push(intent); return { created: true, runId: 'qa-run' }; }
      });

      assert.equal(result.decisions[0].status, 'enqueued');
      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].windowEndAt, NOW.toISOString());
      assert.ok(Date.parse(enqueued[0].windowStartAt) < Date.parse(enqueued[0].windowEndAt));
      assert.ok(Date.parse(enqueued[0].windowEndAt) - Date.parse(enqueued[0].windowStartAt) <= 7 * 24 * 60 * 60 * 1000);
      assert.equal(enqueued[0].idempotencyKey, `${item.id}:${enqueued[0].scheduledAt}`);
    });
  }
}
