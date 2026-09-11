const assert = require('node:assert/strict');
const test = require('node:test');

const { scheduleSources } = require('../src/sourceScheduler');

const NOW = new Date('2026-01-01T19:01:00.000Z'); // Beijing 03:01

function source(overrides = {}) {
  return {
    id: 'source-1',
    game_id: 'game-1',
    community_id: 'community-1',
    region_code: 'domestic',
    platform: 'bigplayer',
    enabled: true,
    game_enabled: true,
    community_status: 'enabled',
    auth_status: 'authorized',
    auth_expire_at: null,
    default_account_id: 'account-1',
    frequency_seconds: 3600,
    schedule_effective_at: '2025-12-31T18:00:01.000Z',
    active_window: null,
    ...overrides
  };
}

function account(overrides = {}) {
  return {
    id: 'account-1',
    source_id: 'source-1',
    game_id: 'game-1',
    community_id: 'community-1',
    platform: 'bigplayer',
    enabled: true,
    auth_status: 'authorized',
    auth_expire_at: null,
    ...overrides
  };
}

function deps(overrides = {}) {
  const enqueued = [];
  return {
    accounts: [account()],
    connectorCapabilities: {
      bigplayer: { available: true, supportsScheduling: true },
      discord: { available: true, supportsScheduling: true }
    },
    leaseAdapter: { async acquire() { return { acquired: true, leaseToken: 'lease-1' }; }, async release() {} },
    enqueue: async intent => { enqueued.push(intent); return { created: true, runId: `run-${intent.sourceId}` }; },
    enqueued,
    ...overrides
  };
}

test('schedules domestic BigPlayer and overseas Discord through the same decision path', async () => {
  const inputs = deps({
    accounts: [account(), account({ id: 'account-2', source_id: 'source-2', game_id: 'game-2', community_id: 'community-2', platform: 'discord' })]
  });
  const sources = [
    source(),
    source({ id: 'source-2', default_account_id: 'account-2', game_id: 'game-2', community_id: 'community-2', region_code: 'overseas', platform: 'discord' })
  ];
  const result = await scheduleSources({ sources, now: NOW, ...inputs });

  assert.deepEqual(result.decisions.map(item => [item.sourceId, item.status]), [['source-1', 'enqueued'], ['source-2', 'enqueued']]);
  assert.equal(inputs.enqueued.length, 2);
  assert.ok(inputs.enqueued.every(item => item.scheduledAt === '2026-01-01T19:00:00.000Z'));
});

test('returns stable enablement and region rejection reasons', async () => {
  const inputs = deps();
  const sources = [
    source({ id: 'disabled-source', enabled: false }),
    source({ id: 'disabled-game', game_enabled: false }),
    source({ id: 'disabled-community', community_status: 'disabled' }),
    source({ id: 'invalid-region', region_code: 'unknown' })
  ];
  const result = await scheduleSources({ sources, now: NOW, ...inputs });
  assert.deepEqual(result.decisions.map(item => item.reasonCode), [
    'SOURCE_DISABLED', 'GAME_DISABLED', 'COMMUNITY_DISABLED', 'INVALID_REGION'
  ]);
  assert.equal(inputs.enqueued.length, 0);
});

test('rejects missing, mismatched, unauthorized and expired default accounts', async () => {
  const sources = [
    source({ id: 'missing', default_account_id: null }),
    source({ id: 'mismatch', default_account_id: 'mismatch-account' }),
    source({ id: 'unauthorized', default_account_id: 'unauthorized-account' }),
    source({ id: 'expired', default_account_id: 'expired-account' })
  ];
  const inputs = deps({ accounts: [
    account({ id: 'mismatch-account', source_id: 'other' }),
    account({ id: 'unauthorized-account', source_id: 'unauthorized', auth_status: 'unconfigured' }),
    account({ id: 'expired-account', source_id: 'expired', auth_expire_at: '2026-01-01T19:00:00.000Z' })
  ] });
  const result = await scheduleSources({ sources, now: NOW, ...inputs });
  assert.deepEqual(result.decisions.map(item => item.reasonCode), [
    'ACCOUNT_NOT_FOUND', 'OWNERSHIP_MISMATCH', 'ACCOUNT_UNAUTHORIZED', 'ACCOUNT_AUTH_EXPIRED'
  ]);
});

test('rejects unauthorized sources and unavailable connector capability', async () => {
  const sources = [
    source({ id: 'source-auth', auth_status: 'expired', default_account_id: 'account-auth' }),
    source({ id: 'source-missing-connector', platform: 'facebook', default_account_id: 'account-facebook' }),
    source({ id: 'source-no-capability', platform: 'x', default_account_id: 'account-x' })
  ];
  const inputs = deps({
    accounts: [
      account({ id: 'account-auth', source_id: 'source-auth' }),
      account({ id: 'account-facebook', source_id: 'source-missing-connector', platform: 'facebook' }),
      account({ id: 'account-x', source_id: 'source-no-capability', platform: 'x' })
    ],
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true }, x: { available: true, supportsScheduling: false } }
  });
  const result = await scheduleSources({ sources, now: NOW, ...inputs });
  assert.deepEqual(result.decisions.map(item => item.reasonCode), [
    'SOURCE_UNAUTHORIZED', 'CONNECTOR_NOT_FOUND', 'CONNECTOR_CAPABILITY_UNAVAILABLE'
  ]);
});

test('active_window is evaluated in Beijing time, including cross-midnight windows', async () => {
  const inputs = deps();
  const closed = await scheduleSources({ sources: [source({ active_window: { days: [4], start: '04:00', end: '05:00' } })], now: NOW, ...inputs });
  assert.equal(closed.decisions[0].reasonCode, 'OUTSIDE_ACTIVE_WINDOW');

  const open = await scheduleSources({ sources: [source({ active_window: { days: [4], start: '22:00', end: '04:00' } })], now: NOW, ...deps() });
  assert.equal(open.decisions[0].status, 'enqueued');
});

test('malformed active_window objects and JSON fail closed', async () => {
  const malformed = [
    '',
    {},
    { timezone: 'Asia/Shanghai' },
    '[1,2,3]',
    '{invalid-json',
    { days: 'not-an-array' },
    '{"days":[0],"start":"02:00","end":"03:00"}',
    { days: [1, 8], start: '02:00', end: '03:00' },
    { start: '25:00', end: '03:00' },
    { start: '02:00' }
  ];
  for (const active_window of malformed) {
    const result = await scheduleSources({ sources: [source({ active_window })], now: NOW, ...deps() });
    assert.equal(result.decisions[0].reasonCode, 'INVALID_ACTIVE_WINDOW');
  }
});

test('rejects an authorized source whose authorization has expired', async () => {
  const result = await scheduleSources({
    sources: [source({ auth_expire_at: '2026-01-01T19:00:00.000Z' })],
    now: NOW,
    ...deps()
  });
  assert.equal(result.decisions[0].reasonCode, 'SOURCE_AUTH_EXPIRED');
});

test('active source lease prevents concurrent enqueue', async () => {
  const inputs = deps({ leaseAdapter: { async acquire() { return { acquired: false }; }, async release() {} } });
  const result = await scheduleSources({ sources: [source()], now: NOW, ...inputs });
  assert.equal(result.decisions[0].reasonCode, 'PREVIOUS_RUN_ACTIVE');
  assert.equal(inputs.enqueued.length, 0);
});

test('enqueue failure is isolated and later sources still run', async () => {
  const calls = [];
  const released = [];
  const inputs = deps({
    accounts: [account(), account({ id: 'account-2', source_id: 'source-2', game_id: 'game-2', community_id: 'community-2', platform: 'discord' })],
    enqueue: async intent => {
      calls.push(intent.sourceId);
      if (intent.sourceId === 'source-1') throw new Error('queue unavailable');
      return { created: true, runId: 'run-2' };
    },
    leaseAdapter: {
      async acquire(intent) { return { acquired: true, leaseToken: `lease-${intent.sourceId}` }; },
      async release(intent) { released.push(intent.sourceId); }
    }
  });
  const result = await scheduleSources({
    sources: [source(), source({ id: 'source-2', default_account_id: 'account-2', game_id: 'game-2', community_id: 'community-2', region_code: 'overseas', platform: 'discord' })],
    now: NOW,
    ...inputs
  });
  assert.deepEqual(calls, ['source-1', 'source-2']);
  assert.deepEqual(result.decisions.map(item => item.reasonCode), ['ENQUEUE_FAILED', null]);
  assert.deepEqual(released, ['source-1']);
});

test('lease acquisition failure is isolated and later sources still run', async () => {
  const enqueued = [];
  const inputs = deps({
    accounts: [account(), account({ id: 'account-2', source_id: 'source-2', game_id: 'game-2', community_id: 'community-2', platform: 'discord' })],
    leaseAdapter: {
      async acquire(intent) {
        if (intent.sourceId === 'source-1') throw new Error('lease backend unavailable');
        return { acquired: true, leaseToken: 'lease-2' };
      },
      async release() {}
    },
    enqueue: async intent => { enqueued.push(intent.sourceId); return { created: true, runId: 'run-2' }; }
  });
  const result = await scheduleSources({
    sources: [source(), source({ id: 'source-2', default_account_id: 'account-2', game_id: 'game-2', community_id: 'community-2', region_code: 'overseas', platform: 'discord' })],
    now: NOW,
    ...inputs
  });
  assert.deepEqual(result.decisions.map(item => item.reasonCode), ['LEASE_FAILED', null]);
  assert.deepEqual(enqueued, ['source-2']);
});

test('uses source+slot idempotency and preserves manual/legacy evidence', async () => {
  const existingEvidence = [
    { sourceId: 'source-1', triggerType: 'manual', scheduledAt: null },
    { sourceId: 'source-1', triggerType: 'legacy', scheduledAt: null }
  ];
  const inputs = deps({ enqueue: async intent => ({ created: false, existingRunId: 'scheduled-existing', idempotencyKey: intent.idempotencyKey }) });
  const result = await scheduleSources({ sources: [source()], now: NOW, existingEvidence, ...inputs });

  assert.equal(result.decisions[0].reasonCode, 'SLOT_ALREADY_EXISTS');
  assert.equal(result.decisions[0].idempotencyKey, 'source-1:2026-01-01T19:00:00.000Z');
  assert.equal(result.evidence.length, 3);
  assert.deepEqual(result.evidence.slice(0, 2), existingEvidence);
  assert.equal(result.evidence[2].triggerType, 'scheduled_catchup');
});
