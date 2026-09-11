const assert = require('node:assert/strict');
const test = require('node:test');

const { createSchedulerCandidateLoader } = require('../src/schedulerCandidateLoader');

function compact(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function row(overrides = {}) {
  return {
    source_id: 'source-1',
    game_id: 'game-1',
    community_id: 'community-1',
    region_code: 'overseas',
    platform: 'discord',
    source_enabled: 1,
    game_enabled: 1,
    community_status: 'enabled',
    source_auth_status: 'authorized',
    source_auth_expire_at: null,
    default_account_id: 'account-1',
    frequency_seconds: 3600,
    schedule_effective_at: '2026-09-09 02:00:00.000',
    schedule_version: 4,
    active_window: '{"days":[2],"start":"01:00","end":"04:00"}',
    account_id: 'account-1',
    account_source_id: 'source-1',
    account_game_id: 'game-1',
    account_community_id: 'community-1',
    account_platform: 'discord',
    account_enabled: 1,
    account_auth_status: 'authorized',
    account_auth_expire_at: null,
    ...overrides
  };
}

test('loads scheduler candidates with one deterministic default-account join', async () => {
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql: compact(sql), params });
      return [[row()]];
    }
  };
  const loader = createSchedulerCandidateLoader(connection);

  const result = await loader.load();

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /g\.region_code AS region_code/);
  assert.doesNotMatch(calls[0].sql, /s\.region_code/);
  assert.match(calls[0].sql, /LEFT JOIN po_accounts a ON a\.id=s\.default_account_id/);
  assert.doesNotMatch(calls[0].sql, /a\.enabled=1|ORDER BY a\.updated_at|LIMIT 1/);
  assert.match(calls[0].sql, /ORDER BY s\.id ASC$/);
  assert.deepEqual(calls[0].params, []);
  assert.deepEqual(result, {
    sources: [{
      id: 'source-1',
      game_id: 'game-1',
      community_id: 'community-1',
      region_code: 'overseas',
      platform: 'discord',
      enabled: 1,
      game_enabled: 1,
      community_status: 'enabled',
      auth_status: 'authorized',
      auth_expire_at: null,
      default_account_id: 'account-1',
      frequency_seconds: 3600,
      schedule_effective_at: '2026-09-09 02:00:00.000',
      schedule_version: 4,
      active_window: '{"days":[2],"start":"01:00","end":"04:00"}'
    }],
    accounts: [{
      id: 'account-1',
      source_id: 'source-1',
      game_id: 'game-1',
      community_id: 'community-1',
      platform: 'discord',
      enabled: 1,
      auth_status: 'authorized',
      auth_expire_at: null
    }]
  });
});

test('returns explicit empty collections for an empty result set', async () => {
  const connection = { async query() { return [[]]; } };
  const result = await createSchedulerCandidateLoader(connection).load();
  assert.deepEqual(result, { sources: [], accounts: [] });
});

test('preserves missing and inconsistent default accounts for runtime rejection without fallback', async () => {
  const rows = [
    row({
      source_id: 'source-missing',
      game_id: 'game-missing',
      community_id: null,
      region_code: null,
      source_enabled: null,
      game_enabled: null,
      community_status: null,
      source_auth_status: null,
      source_auth_expire_at: null,
      default_account_id: null,
      frequency_seconds: null,
      schedule_effective_at: null,
      schedule_version: null,
      active_window: null,
      account_id: null,
      account_source_id: null,
      account_game_id: null,
      account_community_id: null,
      account_platform: null,
      account_enabled: null,
      account_auth_status: null,
      account_auth_expire_at: null
    }),
    row({
      source_id: 'source-mismatch',
      default_account_id: 'account-mismatch',
      account_id: 'account-mismatch',
      account_source_id: 'another-source'
    })
  ];
  const connection = { async query() { return [rows]; } };

  const result = await createSchedulerCandidateLoader(connection).load();

  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].default_account_id, null);
  assert.equal(result.sources[0].enabled, null);
  assert.equal(result.sources[0].active_window, null);
  assert.equal(result.accounts.length, 1);
  assert.deepEqual(result.accounts[0], {
    id: 'account-mismatch',
    source_id: 'another-source',
    game_id: 'game-1',
    community_id: 'community-1',
    platform: 'discord',
    enabled: 1,
    auth_status: 'authorized',
    auth_expire_at: null
  });
});

test('requires an injected connection and never creates one', () => {
  assert.throws(() => createSchedulerCandidateLoader(), /connection\.query/);
  assert.throws(() => createSchedulerCandidateLoader({}), /connection\.query/);
});
