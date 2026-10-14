const assert = require('node:assert/strict');
const test = require('node:test');

const { runOnce } = require('../../worker/src/worker');

test('runOnce consumes a scheduled parent enqueued by the admitted scheduler in the same scan', async () => {
  const source = { id: 'scheduled-source', platform: 'bigplayer_h5', enabled: 1, game_enabled: 1 };
  const scheduledRun = {
    id: 'scheduled-run', source_id: source.id, account_id: 'account-1',
    trigger_type: 'scheduled', sync_mode: 'incremental', source
  };
  let queueReads = 0;
  let executed = null;
  const repo = {
    async health() {},
    async listRunnableSyncRuns() { queueReads += 1; return queueReads === 1 ? [] : [scheduledRun]; },
    async listManualDueSources() { return []; },
    async listDueSources() { throw new Error('periodic fallback must stay disabled after scheduler admission'); }
  };

  const result = await runOnce({
    repo,
    ai: { configured() { return false; } },
    sourceConcurrency: 1,
    runSource: async (_deps, queuedSource, syncRun) => { executed = { source: queuedSource, run: syncRun }; },
    unifiedScheduler: {
      mode: 'enabled', workerId: 'worker-v370', now: () => new Date('2026-09-23T00:00:00.000Z'),
      connectorCapabilities: { bigplayer_h5: { available: true, supportsScheduling: true } },
      connection: { async query() { return [[{
        required_migration_count: 5, schedule_state_table: 1, required_column_count: 24,
        worker_lease_table: 1, worker_lease_column_count: 4, worker_heartbeat_table: 1,
        worker_heartbeat_column_count: 9, schedule_slot_unique_columns: 2,
        schedule_slot_columns: 'source_id,scheduled_at'
      }]]; } },
      runJob: async () => ({ status: 'completed', decisions: [{ sourceId: source.id, status: 'enqueued', runId: scheduledRun.id }] })
    }
  });

  assert.equal(queueReads, 2);
  assert.deepEqual(executed, { source, run: scheduledRun });
  assert.equal(result.queued, 1);
});
