const assert = require('node:assert/strict');
const test = require('node:test');

const { createSchedulerRepositoryAdapter } = require('../src/schedulerRepositoryAdapter');

function compact(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function fakeConnection(respond) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const call = { sql: compact(sql), params };
      calls.push(call);
      return respond(call, calls.length - 1);
    }
  };
}

function scheduledIntent(overrides = {}) {
  return {
    runId: 'run-new',
    sourceId: 'source-1',
    accountId: 'account-1',
    triggerType: 'scheduled_catchup',
    scheduledAt: '2026-09-08T18:00:00.000Z',
    windowStartAt: '2026-09-07T16:00:00.000Z',
    windowEndAt: '2026-09-08T16:00:00.000Z',
    scheduleVersion: 3,
    syncMode: 'incremental',
    ...overrides
  };
}

function lease(overrides = {}) {
  return {
    sourceId: 'source-1',
    runId: 'run-new',
    ownerId: 'scheduler-a',
    epoch: 7,
    now: '2026-09-08T17:59:00.000Z',
    leaseUntil: '2026-09-08T18:04:00.000Z',
    ...overrides
  };
}

test('scheduled enqueue inserts first and returns the winning run for a new slot', async () => {
  const connection = fakeConnection((call, index) => index === 0
    ? [{ affectedRows: 1 }]
    : [[{ id: 'run-new' }]]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  const result = await adapter.enqueueScheduled(scheduledIntent());

  assert.deepEqual(result, { created: true, runId: 'run-new', existingRunId: null });
  assert.equal(connection.calls.length, 2);
  assert.match(connection.calls[0].sql, /^INSERT INTO po_sync_runs /);
  assert.match(connection.calls[0].sql, /ON DUPLICATE KEY UPDATE id=id$/);
  assert.deepEqual(connection.calls[0].params, [
    'run-new', 'source-1', 'account-1', 'incremental', 'scheduled_catchup',
    '2026-09-08 18:00:00.000', '2026-09-07 16:00:00.000',
    '2026-09-08 16:00:00.000', 3
  ]);
  assert.match(connection.calls[1].sql, /^SELECT id FROM po_sync_runs WHERE source_id=\? AND scheduled_at=\? LIMIT 1$/);
  assert.deepEqual(connection.calls[1].params, ['source-1', '2026-09-08 18:00:00.000']);
});

test('preserves canonical MariaDB timestamps and nullable windows without timezone conversion', async () => {
  const connection = fakeConnection((call, index) => index === 0
    ? [{ affectedRows: 1 }]
    : [[{ id: 'run-new' }]]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  await adapter.enqueueScheduled(scheduledIntent({
    scheduledAt: '2026-09-09 02:00:00.000',
    windowStartAt: null,
    windowEndAt: null
  }));

  assert.deepEqual(connection.calls[0].params.slice(5, 8), [
    '2026-09-09 02:00:00.000', null, null
  ]);
  assert.deepEqual(connection.calls[1].params, ['source-1', '2026-09-09 02:00:00.000']);
});

test('normalizes explicit timezone offsets and rejects ambiguous local timestamps', async () => {
  const connection = fakeConnection((call, index) => index === 0
    ? [{ affectedRows: 1 }]
    : [[{ id: 'run-new' }]]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  await adapter.enqueueScheduled(scheduledIntent({
    scheduledAt: '2026-09-09T02:00:00.000+08:00',
    windowStartAt: null,
    windowEndAt: null
  }));
  assert.equal(connection.calls[0].params[5], '2026-09-08 18:00:00.000');

  await assert.rejects(
    () => adapter.enqueueScheduled(scheduledIntent({ scheduledAt: '2026-09-09T02:00:00.000' })),
    /explicit timezone/
  );
  assert.equal(connection.calls.length, 2);
});

test('duplicate scheduled slot returns the existing run without pre-reading', async () => {
  const connection = fakeConnection((call, index) => index === 0
    ? [{ affectedRows: 0 }]
    : [[{ id: 'run-existing' }]]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  const result = await adapter.enqueueScheduled(scheduledIntent());

  assert.deepEqual(result, { created: false, runId: 'run-existing', existingRunId: 'run-existing' });
  assert.equal(connection.calls[0].sql.startsWith('INSERT INTO po_sync_runs'), true);
});

test('manual and legacy runs cannot enter the scheduled-slot merge path', async () => {
  const connection = fakeConnection(() => { throw new Error('query must not run'); });
  const adapter = createSchedulerRepositoryAdapter(connection);

  await assert.rejects(() => adapter.enqueueScheduled(scheduledIntent({ triggerType: 'manual', scheduledAt: null })), /triggerType/);
  await assert.rejects(() => adapter.enqueueScheduled(scheduledIntent({ triggerType: 'legacy', scheduledAt: null })), /triggerType/);
  assert.equal(connection.calls.length, 0);
});

test('lease acquisition is a conditional update that increments and returns epoch', async () => {
  const connection = fakeConnection((call, index) => index === 0
    ? [{ affectedRows: 1 }]
    : [[{ lease_epoch: 8 }]]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  const result = await adapter.acquireLease(lease());

  assert.deepEqual(result, {
    acquired: true,
    leaseToken: {
      sourceId: 'source-1', runId: 'run-new', ownerId: 'scheduler-a', epoch: 8,
      leaseUntil: '2026-09-08T18:04:00.000Z'
    }
  });
  assert.match(connection.calls[0].sql, /lease_epoch=lease_epoch\+1/);
  assert.match(connection.calls[0].sql, /WHERE s\.source_id=\? AND \(lease_until IS NULL OR lease_until<=\?\)/);
  assert.match(connection.calls[0].sql, /AND NOT EXISTS \(\s*SELECT 1 FROM po_sync_runs r WHERE r\.source_id=s\.source_id AND r\.status IN \('queued','running'\)\s*\)$/);
  assert.deepEqual(connection.calls[0].params, [
    'run-new', 'scheduler-a', '2026-09-08 18:04:00.000',
    'source-1', '2026-09-08 17:59:00.000'
  ]);
  assert.deepEqual(connection.calls[1].params, ['source-1', 'run-new', 'scheduler-a']);
});

test('an active manual run blocks lease acquisition in the same atomic update', async () => {
  const activeRuns = [{ source_id: 'source-1', trigger_type: 'manual', status: 'queued' }];
  const connection = fakeConnection(call => {
    assert.match(call.sql, /^UPDATE po_source_schedule_state s /);
    assert.match(call.sql, /NOT EXISTS \(\s*SELECT 1 FROM po_sync_runs r WHERE r\.source_id=s\.source_id AND r\.status IN \('queued','running'\)\s*\)$/);
    assert.equal(activeRuns.some(run => run.source_id === call.params[3]
      && ['queued', 'running'].includes(run.status)), true);
    return [{ affectedRows: 0 }];
  });
  const adapter = createSchedulerRepositoryAdapter(connection);

  assert.deepEqual(await adapter.acquireLease(lease()), { acquired: false, leaseToken: null });
  assert.equal(connection.calls.length, 1);
});

test('an unexpired lease rejects acquisition without reading an epoch', async () => {
  const connection = fakeConnection(() => [{ affectedRows: 0 }]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  assert.deepEqual(await adapter.acquireLease(lease()), { acquired: false, leaseToken: null });
  assert.equal(connection.calls.length, 1);
});

test('renew and release require source, run, owner, epoch and an unexpired lease', async () => {
  const connection = fakeConnection(() => [{ affectedRows: 0 }]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  assert.deepEqual(await adapter.renewLease(lease({ leaseUntil: '2026-09-08T18:09:00.000Z' })), { renewed: false });
  assert.deepEqual(await adapter.releaseLease(lease()), { released: false });

  for (const call of connection.calls) {
    assert.match(call.sql, /source_id=\?/);
    assert.match(call.sql, /lease_run_id=\?/);
    assert.match(call.sql, /lease_owner=\?/);
    assert.match(call.sql, /lease_epoch=\?/);
    assert.match(call.sql, /lease_until>\?$/);
  }
  assert.deepEqual(connection.calls[0].params, [
    '2026-09-08 18:09:00.000', 'source-1', 'run-new', 'scheduler-a', 7,
    '2026-09-08 17:59:00.000'
  ]);
  assert.deepEqual(connection.calls[1].params, [
    'source-1', 'run-new', 'scheduler-a', 7, '2026-09-08 17:59:00.000'
  ]);
});

test('finalize atomically updates run and state behind the full fencing token', async () => {
  const connection = fakeConnection(() => [{ affectedRows: 2 }]);
  const adapter = createSchedulerRepositoryAdapter(connection);
  const result = await adapter.finalizeLease({
    ...lease(),
    status: 'completed_full',
    reasonCode: null,
    errorCode: null,
    errorMessage: null,
    finishedAt: '2026-09-08T18:01:00.000Z',
    lastScheduledAt: '2026-09-08T18:00:00.000Z',
    nextScheduledAt: '2026-09-08T19:00:00.000Z',
    lastScanAt: '2026-09-08T18:01:00.000Z'
  });

  assert.deepEqual(result, { finalized: true });
  assert.match(connection.calls[0].sql, /^UPDATE po_source_schedule_state s JOIN po_sync_runs r/);
  assert.match(connection.calls[0].sql, /s\.source_id=\? AND s\.lease_run_id=\? AND s\.lease_owner=\? AND s\.lease_epoch=\? AND s\.lease_until>\?$/);
  assert.deepEqual(connection.calls[0].params, [
    'run-new', 'completed_full', '2026-09-08 18:01:00.000', null, null,
    '2026-09-08 18:00:00.000', '2026-09-08 19:00:00.000',
    '2026-09-08 18:01:00.000', 'completed_full', null,
    'source-1', 'run-new', 'scheduler-a', 7, '2026-09-08 17:59:00.000'
  ]);
});

test('expired or stale epoch cannot finalize', async () => {
  const connection = fakeConnection(() => [{ affectedRows: 0 }]);
  const adapter = createSchedulerRepositoryAdapter(connection);

  const result = await adapter.finalizeLease({
    ...lease({ epoch: 6 }),
    status: 'failed',
    reasonCode: 'COLLECT_FAILED',
    errorCode: 'COLLECT_FAILED',
    errorMessage: 'collector failed',
    finishedAt: '2026-09-09 02:01:00.000',
    lastScheduledAt: '2026-09-09 02:00:00.000',
    nextScheduledAt: '2026-09-09 03:00:00.000',
    lastScanAt: '2026-09-09 02:01:00.000'
  });

  assert.deepEqual(result, { finalized: false });
});
