const assert = require('node:assert/strict');
const test = require('node:test');

const { createSourceSchedulerRuntime } = require('../src/sourceSchedulerRuntime');

const NOW = new Date('2026-01-01T19:01:00.000Z');

function source(id = 'source-1', accountId = 'account-1') {
  return {
    id,
    game_id: `game-${id}`,
    community_id: `community-${id}`,
    region_code: 'domestic',
    platform: 'bigplayer',
    enabled: true,
    game_enabled: true,
    community_status: 'enabled',
    auth_status: 'authorized',
    auth_expire_at: null,
    default_account_id: accountId,
    frequency_seconds: 3600,
    schedule_effective_at: '2025-12-31T18:00:01.000Z',
    schedule_version: 2,
    active_window: null
  };
}

function account(id = 'account-1', sourceId = 'source-1') {
  return {
    id,
    source_id: sourceId,
    game_id: `game-${sourceId}`,
    community_id: `community-${sourceId}`,
    platform: 'bigplayer',
    enabled: true,
    auth_status: 'authorized',
    auth_expire_at: null
  };
}

function compact(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

test('composes scheduler and repository with injected connection, owner and clock', async () => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = compact(sql);
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('UPDATE po_source_schedule_state') && normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 4 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-1' }]];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };
  const runtime = createSourceSchedulerRuntime({
    connection,
    workerId: 'worker-a',
    leaseDurationMs: 300000,
    idFactory: () => 'run-1'
  });

  const result = await runtime.run({
    sources: [source()],
    accounts: [account()],
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    now: NOW
  });

  assert.deepEqual(result.decisions[0], {
    sourceId: 'source-1',
    accountId: 'account-1',
    platform: 'bigplayer',
    regionCode: 'domestic',
    triggerType: 'scheduled_catchup',
    scheduledAt: '2026-01-01T19:00:00.000Z',
    nextSlotAt: '2026-01-01T20:00:00.000Z',
    windowStartAt: null,
    windowEndAt: null,
    scheduleVersion: 2,
    idempotencyKey: 'source-1:2026-01-01T19:00:00.000Z',
    status: 'enqueued',
    reasonCode: null,
    runId: 'run-1',
    leaseToken: {
      sourceId: 'source-1', runId: 'run-1', ownerId: 'worker-a', epoch: 4,
      leaseUntil: new Date('2026-01-01T19:06:00.000Z')
    },
    leaseEpoch: 4
  });
  const acquire = calls.find(call => call.sql.includes('lease_epoch=lease_epoch+1'));
  assert.deepEqual(acquire.params, [
    'run-1', 'worker-a', '2026-01-01 19:06:00.000', '2026-01-01 19:00:00.000', '2026-01-01 20:00:00.000', 'source-1', '2026-01-01 19:01:00.000'
  ]);
});

test('duplicate slot returns the existing run and retains the acquired epoch evidence', async () => {
  const connection = {
    async query(sql) {
      const normalized = compact(sql);
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 5 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 0 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-existing' }]];
      if (normalized.includes('SET lease_run_id=NULL')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };
  const runtime = createSourceSchedulerRuntime({ connection, workerId: 'worker-a', idFactory: () => 'run-candidate' });

  const result = await runtime.run({
    sources: [source()],
    accounts: [account()],
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    now: NOW
  });

  assert.equal(result.decisions[0].status, 'duplicate');
  assert.equal(result.decisions[0].reasonCode, 'SLOT_ALREADY_EXISTS');
  assert.equal(result.decisions[0].runId, 'run-existing');
  assert.equal(result.decisions[0].leaseEpoch, 5);
});

test('isolates one adapter failure and preserves manual or legacy evidence unchanged', async () => {
  let generated = 0;
  const existingEvidence = [
    { sourceId: 'manual-source', triggerType: 'manual', scheduledAt: null, runId: 'manual-run' },
    { sourceId: 'legacy-source', triggerType: 'legacy', scheduledAt: null, runId: 'legacy-run' }
  ];
  const connection = {
    async query(sql, params = []) {
      const normalized = compact(sql);
      if (normalized.includes('lease_epoch=lease_epoch+1') && params[5] === 'source-1') throw new Error('lease unavailable');
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 9 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-2' }]];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };
  const runtime = createSourceSchedulerRuntime({
    connection,
    workerId: 'worker-a',
    idFactory: () => `run-${++generated}`
  });

  const result = await runtime.run({
    sources: [source(), source('source-2', 'account-2')],
    accounts: [account(), account('account-2', 'source-2')],
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    existingEvidence,
    now: NOW
  });

  assert.deepEqual(result.decisions.map(item => [item.sourceId, item.status, item.reasonCode, item.runId, item.leaseEpoch]), [
    ['source-1', 'failed', 'LEASE_FAILED', 'run-1', null],
    ['source-2', 'enqueued', null, 'run-2', 9]
  ]);
  assert.deepEqual(result.evidence.slice(0, 2), existingEvidence);
  assert.strictEqual(result.evidence[0], existingEvidence[0]);
  assert.strictEqual(result.evidence[1], existingEvidence[1]);
});

test('preserves sanitized database error evidence for enqueue failure and continues later sources', async () => {
  let generated = 0;
  const connection = {
    async query(sql, params = []) {
      const normalized = compact(sql);
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 10 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs') && params[1] === 'source-1') {
        const error = new Error(
          "Incorrect datetime value password=super-secret mysql://db-user:db-pass@127.0.0.1:43306/private_db "
          + "Access denied for user 'po_e2e'@'127.0.0.1'; Unknown database 'private_db'; "
          + 'connect ECONNREFUSED 127.0.0.1:43306; getaddrinfo ENOTFOUND db.internal; '
          + 'read ETIMEDOUT replica.internal:43306'
        );
        error.code = 'ER_TRUNCATED_WRONG_VALUE';
        throw error;
      }
      if (normalized.includes('SET lease_run_id=NULL')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-2' }]];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };
  const runtime = createSourceSchedulerRuntime({
    connection,
    workerId: 'worker-a',
    idFactory: () => `run-${++generated}`
  });

  const result = await runtime.run({
    sources: [source(), source('source-2', 'account-2')],
    accounts: [account(), account('account-2', 'source-2')],
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    now: NOW
  });

  assert.deepEqual(
    result.decisions.map(item => [item.sourceId, item.status, item.reasonCode]),
    [['source-1', 'failed', 'ENQUEUE_FAILED'], ['source-2', 'enqueued', null]]
  );
  assert.equal(result.decisions[0].errorCode, 'ER_TRUNCATED_WRONG_VALUE');
  assert.match(result.decisions[0].errorMessage, /Incorrect datetime value/);
  assert.doesNotMatch(
    result.decisions[0].errorMessage,
    /super-secret|db-user|db-pass|po_e2e|127\.0\.0\.1|43306|private_db|db\.internal|replica\.internal/
  );
  assert.equal(result.evidence[0].errorCode, 'ER_TRUNCATED_WRONG_VALUE');
});
