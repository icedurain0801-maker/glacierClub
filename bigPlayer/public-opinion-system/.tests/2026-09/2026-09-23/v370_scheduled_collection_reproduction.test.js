'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSchedule } = require('../../../worker/src/scheduleSlots');
const { createSchedulerRepositoryAdapter } = require('../../../worker/src/schedulerRepositoryAdapter');
const { runOnce } = require('../../../worker/src/worker');

test('A1 dueSlot keeps the latest unprocessed anchored slot', () => {
  const result = computeSchedule({
    now: new Date('2026-09-23T02:01:00.000Z'),
    frequencySeconds: 86400,
    effectiveAt: '2026-09-20T18:00:01.000Z',
    lastProcessedScheduledAt: '2026-09-21T18:00:00.000Z'
  });
  assert.equal(result.dueSlotAt, '2026-09-22T18:00:00.000Z');
  assert.equal(result.nextSlotAt, '2026-09-23T18:00:00.000Z');
});

test('A2 queued, running and lease rejection reasons are distinct, persisted, and do not advance cursor', async () => {
  const reasonCodes = [];
  for (const blockedBy of ['queued', 'running', 'lease']) {
    const calls = [];
    const tx = {
      async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); },
      async rollback() { calls.push({ sql: 'ROLLBACK', params: [] }); },
      async commit() { calls.push({ sql: 'COMMIT', params: [] }); },
      release() {},
      async query(sql, params = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        calls.push({ sql: normalized, params });
        if (/^UPDATE po_source_schedule_state s/.test(normalized)) return [{ affectedRows: 0 }];
        if (/^SELECT /.test(normalized) && /po_source_schedule_state/.test(normalized)) return [[{
          active_status: blockedBy === 'lease' ? null : blockedBy,
          active_run: blockedBy === 'lease' ? 0 : 1,
          lease_active: blockedBy === 'lease' ? 1 : 0,
          lease_until: blockedBy === 'lease' ? '2026-09-23 02:06:00.000' : null
        }]];
        if (/last_reason_code/.test(normalized)) return [{ affectedRows: 1 }];
        throw new Error(`unexpected query: ${normalized}`);
      }
    };
    const rootCalls = [];
    const root = {
      async query(sql, params = []) { rootCalls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return [{ affectedRows: 1 }]; },
      async getConnection() { return tx; }
    };
    const adapter = createSchedulerRepositoryAdapter(root);
    const result = await adapter.scheduleSlotAtomic({
      runId: `run-${blockedBy}`, sourceId: 'source-1', accountId: 'account-1', ownerId: 'scheduler-1',
      triggerType: 'scheduled', scheduledAt: '2026-09-22T18:00:00.000Z',
      nextSlotAt: '2026-09-23T18:00:00.000Z', leaseUntil: '2026-09-23T02:06:00.000Z', scheduleVersion: 1
    });
    assert.equal(result.acquired, false);
    assert.ok(result.reasonCode, `FAIL: ${blockedBy} rejection has no reasonCode`);
    reasonCodes.push(result.reasonCode);
    const persisted = [...calls, ...rootCalls].find(call => /last_reason_code/.test(call.sql));
    assert.ok(persisted, `FAIL: ${blockedBy} rejection reason was not persisted`);
    assert.equal([...calls, ...rootCalls].some(call => /last_scheduled_at=\?|next_scheduled_at=\?/.test(call.sql)), false,
      `FAIL: ${blockedBy} rejection advanced the schedule cursor`);
  }
  assert.equal(new Set(reasonCodes).size, 3, `FAIL: rejection reasons are not distinct: ${reasonCodes.join(',')}`);
  assert.match(reasonCodes[0], /QUEUED/i);
  assert.match(reasonCodes[1], /RUNNING/i);
  assert.match(reasonCodes[2], /LEASE/i);
});

test('B1 runOnce dynamic polling consumes a scheduled run that appears during the scan', async () => {
  let polls = 0;
  const consumed = [];
  const source = { id: 'source-1', enabled: true, game_enabled: true };
  const repo = {
    async health() {},
    async listRunnableSyncRuns() {
      polls += 1;
      if (polls === 1) return [{ source, syncRun: { id: 'manual-1', trigger_type: 'manual' } }];
      return [{ source, syncRun: { id: 'scheduled-2', trigger_type: 'scheduled' } }];
    },
    async listManualDueSources() { return []; },
    async listDueSources() { return []; }
  };
  await runOnce({
    repo,
    runSource: async (_deps, _source, run) => {
      consumed.push(run.id);
      if (run.id === 'manual-1') await new Promise(resolve => setTimeout(resolve, 320));
    },
    ai: { configured() { return false; } },
    alertEngine: {}, connectors: {}, credentialContext: {},
    sourceConcurrency: 2, queuePollIntervalMs: 250,
    unifiedScheduler: { mode: 'off' }
  });
  assert.ok(polls >= 2);
  assert.deepEqual(consumed, ['manual-1', 'scheduled-2'], 'FAIL: dynamic poll filters out trigger_type=scheduled');
});

test('B2 a credential failure does not prevent the next scheduled slot from being attempted', async () => {
  let scan = 0;
  const attempted = [];
  const source = { id: 'source-1', enabled: true, game_enabled: true };
  const repo = {
    async health() {},
    async listRunnableSyncRuns() {
      scan += 1;
      return [{ source, syncRun: { id: scan === 1 ? 'slot-1' : 'slot-2', trigger_type: 'scheduled' } }];
    },
    async listManualDueSources() { return []; },
    async listDueSources() { return []; }
  };
  const deps = {
    repo,
    runSource: async (_deps, _source, run) => {
      attempted.push(run.id);
      if (run.id === 'slot-1') throw Object.assign(new Error('credential unavailable'), { code: 'CREDENTIAL_NOT_FOUND' });
    },
    ai: { configured() { return false; } }, alertEngine: {}, connectors: {}, credentialContext: {},
    sourceConcurrency: 1, unifiedScheduler: { mode: 'off' }
  };
  await runOnce(deps);
  await runOnce(deps);
  assert.deepEqual(attempted, ['slot-1', 'slot-2']);
});
