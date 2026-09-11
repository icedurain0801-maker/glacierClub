const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDeps, runOnce, runUnifiedSchedulerSeam } = require('../src/worker');

const NOW = new Date('2026-09-09T02:00:00.000Z');

function schedulerSchemaConnection({ ready = true, missingColumn = false, missingUniqueIndex = false, error = null } = {}) {
  return {
    async query(sql) {
      if (error) throw error;
      assert.match(sql, /information_schema\.tables/i);
      assert.match(sql, /information_schema\.columns/i);
      assert.match(sql, /information_schema\.statistics/i);
      assert.match(sql, /po_source_schedule_state/i);
      assert.match(sql, /po_sync_runs_source_schedule_uk/i);
      return [[{
        migration_applied: ready ? 1 : 0,
        schedule_state_table: ready ? 1 : 0,
        required_column_count: ready ? (missingColumn ? 20 : 21) : 0,
        schedule_slot_unique_columns: ready && !missingUniqueIndex ? 2 : 0,
        schedule_slot_columns: ready && !missingUniqueIndex ? 'source_id,scheduled_at' : null
      }]];
    }
  };
}

test('buildDeps wires the explicit scheduler mode, repository pool and real connector platform keys', async () => {
  const deps = buildDeps({
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'unused',
    DB_PASSWORD: 'unused',
    DB_NAME: 'unused',
    UNIFIED_SOURCE_SCHEDULER_MODE: 'enabled',
    UNIFIED_SCHEDULER_RECOVERY_SOURCE_ID: 'recovery-source',
    BIGPLAYER_H5_ENABLED: 'true',
    BIGPLAYER_H5_API_BASE_URL: 'https://community.bigplayer.com'
  });
  try {
    assert.equal(deps.unifiedScheduler.mode, 'enabled');
    assert.equal(deps.unifiedScheduler.recoverySourceId, 'recovery-source');
    assert.strictEqual(deps.unifiedScheduler.connection, deps.repo.pool);
    assert.equal(typeof deps.unifiedScheduler.workerId, 'string');
    assert.equal(typeof deps.unifiedScheduler.now, 'function');
    assert.deepEqual(deps.unifiedScheduler.connectorCapabilities.bigplayer_h5, {
      available: true,
      supportsScheduling: true
    });
    assert.equal(deps.unifiedScheduler.connectorCapabilities.bigplayer, undefined);
  } finally {
    await deps.repo.pool.end();
  }
});

test('default off mode does not call the unified scheduler job', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_OFF' });
  assert.equal(called, 0);
});

test('enabled mode calls the injected job with injected dependencies after schema admission', async () => {
  const connection = schedulerSchemaConnection();
  const connectorCapabilities = { discord: { available: true, supportsScheduling: true } };
  const calls = [];
  const expected = { status: 'completed', candidateCount: 0, decisions: [], evidence: [] };
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection,
    workerId: 'worker-a',
    now: () => NOW,
    connectorCapabilities,
    leaseDurationMs: 120000,
    idFactory: () => 'run-1',
    runJob: async input => { calls.push(input); return expected; }
  });

  assert.strictEqual(result, expected);
  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0].connection, connection);
  assert.strictEqual(calls[0].connectorCapabilities, connectorCapabilities);
  assert.strictEqual(calls[0].now, NOW);
  assert.equal(calls[0].workerId, 'worker-a');
  assert.equal(calls[0].leaseDurationMs, 120000);
  assert.equal(calls[0].idFactory(), 'run-1');
});

test('enabled recovery gate skips scheduler writes entirely', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    recoverySourceId: 'target-source',
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_RECOVERY_MANUAL_ONLY' });
  assert.equal(called, 0);
});

test('shadow mode performs admission only and never invokes the writing scheduler job', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    mode: 'shadow',
    connection: schedulerSchemaConnection(),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_SHADOW_NO_WRITE' });
  assert.equal(called, 0);
});

test('job failure is logged with a stable code and isolated from the worker', async () => {
  const failure = new Error('database unavailable');
  const logged = [];
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection: schedulerSchemaConnection(),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: {},
    runJob: async () => { throw failure; },
    logger: { error(...args) { logged.push(args); } }
  });

  assert.deepEqual(result, { status: 'failed', reasonCode: 'UNIFIED_SCHEDULER_FAILED' });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], '[worker] unified scheduler failed');
  assert.strictEqual(logged[0][1], failure);
});

test('missing enabled-mode configuration is isolated and does not invoke the job', async () => {
  let called = 0;
  const logged = [];
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    runJob: async () => { called += 1; },
    logger: { error(...args) { logged.push(args); } }
  });

  assert.deepEqual(result, { status: 'failed', reasonCode: 'UNIFIED_SCHEDULER_CONFIG_INVALID' });
  assert.equal(called, 0);
  assert.equal(logged.length, 1);
});

test('missing migration 023 schema fails closed before the scheduler job', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection: schedulerSchemaConnection({ ready: false }),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY' });
  assert.equal(called, 0);
});

test('migration 023 admission rejects a missing runtime column', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection: schedulerSchemaConnection({ missingColumn: true }),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: {},
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY' });
  assert.equal(called, 0);
});

test('migration 023 admission rejects a missing source-slot unique index', async () => {
  let called = 0;
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection: schedulerSchemaConnection({ missingUniqueIndex: true }),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: {},
    runJob: async () => { called += 1; }
  });

  assert.deepEqual(result, { status: 'skipped', reasonCode: 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY' });
  assert.equal(called, 0);
});

test('schema admission query failure is isolated with a stable reason', async () => {
  const logged = [];
  const result = await runUnifiedSchedulerSeam({
    mode: 'enabled',
    connection: schedulerSchemaConnection({ error: new Error('schema unavailable') }),
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
    logger: { error(...args) { logged.push(args); } }
  });

  assert.deepEqual(result, { status: 'failed', reasonCode: 'UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED' });
  assert.equal(logged.length, 1);
});

test('runOnce keeps the existing scanner behavior when the seam is not configured', async () => {
  const calls = [];
  const repo = {
    async health() { calls.push('health'); },
    async listRunnableSyncRuns() { calls.push('queued'); return []; },
    async listManualDueSources() { calls.push('manual'); return []; },
    async listDueSources() { calls.push('due'); return []; }
  };

  const result = await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1
  });

  assert.deepEqual(result, { queued: 0, manual: 0, scanned: 0 });
  assert.deepEqual(calls, ['health', 'queued', 'manual', 'due']);
});

test('runOnce preserves the legacy success path when migration 023 is not ready', async () => {
  const calls = [];
  let schedulerCalls = 0;
  const repo = {
    async health() { calls.push('health'); },
    async listRunnableSyncRuns() { calls.push('queued'); return []; },
    async listManualDueSources() { calls.push('manual'); return []; },
    async listDueSources() { calls.push('due'); return []; }
  };

  const result = await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    unifiedScheduler: {
      mode: 'enabled',
      connection: schedulerSchemaConnection({ ready: false }),
      workerId: 'worker-a',
      now: () => NOW,
      connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
      runJob: async () => { schedulerCalls += 1; }
    }
  });

  assert.deepEqual(result, { queued: 0, manual: 0, scanned: 0 });
  assert.deepEqual(calls, ['health', 'queued', 'manual', 'due']);
  assert.equal(schedulerCalls, 0);
});

test('runOnce lets an admitted enabled scheduler exclusively own periodic sources', async () => {
  const calls = [];
  let schedulerCalls = 0;
  const repo = {
    async health() { calls.push('health'); },
    async listRunnableSyncRuns() { calls.push('queued'); return []; },
    async listManualDueSources() { calls.push('manual'); return []; },
    async listDueSources() { calls.push('due'); return []; }
  };

  const result = await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    unifiedScheduler: {
      mode: 'enabled',
      connection: schedulerSchemaConnection(),
      workerId: 'worker-a',
      now: () => NOW,
      connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
      runJob: async () => { schedulerCalls += 1; return { status: 'completed', decisions: [] }; }
    }
  });

  assert.deepEqual(result, { queued: 0, manual: 0, scanned: 0 });
  assert.deepEqual(calls, ['health', 'queued', 'manual']);
  assert.equal(schedulerCalls, 1);
});

test('runOnce does not fall back to legacy periodic sources after an admitted scheduler job fails', async () => {
  const calls = [];
  const repo = {
    async health() { calls.push('health'); },
    async listRunnableSyncRuns() { calls.push('queued'); return []; },
    async listManualDueSources() { calls.push('manual'); return []; },
    async listDueSources() { calls.push('due'); return [{ id: 'legacy-source' }]; }
  };

  const result = await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    unifiedScheduler: {
      mode: 'enabled',
      connection: schedulerSchemaConnection(),
      workerId: 'worker-a',
      now: () => NOW,
      connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
      runJob: async () => { throw new Error('scheduler failed after admission'); },
      logger: { error() {} }
    }
  });

  assert.deepEqual(result, { queued: 0, manual: 0, scanned: 0 });
  assert.deepEqual(calls, ['health', 'queued', 'manual']);
});

test('runOnce shadow admission does not write and keeps the legacy periodic scanner', async () => {
  const calls = [];
  let schedulerCalls = 0;
  const repo = {
    async health() { calls.push('health'); },
    async listRunnableSyncRuns() { calls.push('queued'); return []; },
    async listManualDueSources() { calls.push('manual'); return []; },
    async listDueSources() { calls.push('due'); return []; }
  };

  await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    unifiedScheduler: {
      mode: 'shadow',
      connection: schedulerSchemaConnection(),
      workerId: 'worker-a',
      now: () => NOW,
      connectorCapabilities: {},
      runJob: async () => { schedulerCalls += 1; }
    }
  });

  assert.deepEqual(calls, ['health', 'queued', 'manual', 'due']);
  assert.equal(schedulerCalls, 0);
});

test('runOnce recovery gate consumes only target manual runs and preserves unrelated markers', async () => {
  const calls = [];
  const target = { id: 'target-source', enabled: 1, game_enabled: 1, platform: 'unknown' };
  const other = { id: 'other-source', enabled: 1, game_enabled: 1, platform: 'unknown' };
  const result = await runOnce({
    repo: {
      async health() {},
      async listRunnableSyncRuns() {
        return [
          { id: 'manual-target', source_id: 'target-source', trigger_type: 'manual', source: target },
          { id: 'scheduled-target', source_id: 'target-source', trigger_type: 'scheduled_catchup', source: target },
          { id: 'manual-other', source_id: 'other-source', trigger_type: 'manual', source: other }
        ];
      },
      async listManualDueSources() { return [target, other]; },
      async clearManualRequest(sourceId) { calls.push(`clear:${sourceId}`); },
      async claimSyncRun() { return null; },
      async listDueSources() { calls.push('due'); return []; }
    },
    connectors: {},
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    unifiedScheduler: { mode: 'enabled', recoverySourceId: 'target-source' }
  });

  assert.deepEqual(result, { queued: 1, manual: 2, scanned: 0 });
  assert.deepEqual(calls, []);
});
