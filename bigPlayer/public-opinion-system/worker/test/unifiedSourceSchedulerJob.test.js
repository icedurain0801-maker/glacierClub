const assert = require('node:assert/strict');
const test = require('node:test');

const { runUnifiedSourceSchedulerOnce } = require('../src/unifiedSourceSchedulerJob');

const NOW = new Date('2026-01-01T19:01:00.000Z');

function compact(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function candidateRow(id = 'source-1', accountId = 'account-1') {
  return {
    source_id: id,
    game_id: `game-${id}`,
    community_id: `community-${id}`,
    region_code: 'domestic',
    platform: 'bigplayer',
    source_enabled: 1,
    game_enabled: 1,
    community_status: 'enabled',
    source_auth_status: 'authorized',
    source_auth_expire_at: null,
    default_account_id: accountId,
    frequency_seconds: 3600,
    schedule_effective_at: '2025-12-31T18:00:01.000Z',
    schedule_version: 2,
    active_window: null,
    account_id: accountId,
    account_source_id: id,
    account_game_id: `game-${id}`,
    account_community_id: `community-${id}`,
    account_platform: 'bigplayer',
    account_enabled: 1,
    account_auth_status: 'authorized',
    account_auth_expire_at: null
  };
}

test('loads candidates before scheduling and returns complete batch evidence', async () => {
  const calls = [];
  const connection = {
    async query(sql, params = []) {
      const normalized = compact(sql);
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT s.id AS source_id')) return [[candidateRow()]];
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 3 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-1' }]];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };

  const result = await runUnifiedSourceSchedulerOnce({
    connection,
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    idFactory: () => 'run-1'
  });

  assert.equal(calls[0].sql.startsWith('SELECT s.id AS source_id'), true);
  assert.equal(result.status, 'completed');
  assert.equal(result.reasonCode, null);
  assert.equal(result.candidateCount, 1);
  assert.deepEqual(
    [result.decisions[0].sourceId, result.decisions[0].scheduledAt, result.decisions[0].triggerType,
      result.decisions[0].reasonCode, result.decisions[0].runId, result.decisions[0].leaseEpoch],
    ['source-1', '2026-01-01T19:00:00.000Z', 'scheduled_catchup', null, 'run-1', 3]
  );
  assert.deepEqual(result.evidence, result.decisions);
});

test('candidate loader failure returns a stable batch error and never schedules', async () => {
  let calls = 0;
  let ids = 0;
  const connection = {
    async query() {
      calls += 1;
      throw new Error('database unavailable');
    }
  };

  const result = await runUnifiedSourceSchedulerOnce({
    connection,
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: {},
    idFactory: () => { ids += 1; return 'must-not-run'; }
  });

  assert.deepEqual(result, {
    status: 'failed',
    reasonCode: 'CANDIDATE_LOAD_FAILED',
    candidateCount: 0,
    decisions: [],
    evidence: []
  });
  assert.equal(calls, 1);
  assert.equal(ids, 0);
});

test('isolates a source adapter failure and preserves manual or legacy evidence', async () => {
  let generated = 0;
  const originalEvidence = [
    { sourceId: 'manual-source', triggerType: 'manual', runId: 'manual-run' },
    { sourceId: 'legacy-source', triggerType: 'legacy', runId: 'legacy-run' }
  ];
  const connection = {
    async query(sql, params = []) {
      const normalized = compact(sql);
      if (normalized.startsWith('SELECT s.id AS source_id')) {
        return [[candidateRow(), candidateRow('source-2', 'account-2')]];
      }
      if (normalized.includes('lease_epoch=lease_epoch+1') && params[3] === 'source-1') throw new Error('lease unavailable');
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 6 }]];
      if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
      if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'run-2' }]];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };

  const result = await runUnifiedSourceSchedulerOnce({
    connection,
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: { bigplayer: { available: true, supportsScheduling: true } },
    existingEvidence: originalEvidence,
    idFactory: () => `run-${++generated}`
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.candidateCount, 2);
  assert.deepEqual(result.decisions.map(item => [item.sourceId, item.reasonCode, item.runId, item.leaseEpoch]), [
    ['source-1', 'LEASE_FAILED', 'run-1', null],
    ['source-2', null, 'run-2', 6]
  ]);
  assert.deepEqual(result.evidence.slice(0, 2), originalEvidence);
  assert.strictEqual(result.evidence[0], originalEvidence[0]);
  assert.strictEqual(result.evidence[1], originalEvidence[1]);
});

test('empty candidate batch completes without scheduling', async () => {
  const connection = { async query() { return [[]]; } };
  const existingEvidence = [{ sourceId: 'legacy-source', triggerType: 'legacy' }];
  const result = await runUnifiedSourceSchedulerOnce({
    connection,
    workerId: 'worker-a',
    now: NOW,
    connectorCapabilities: {},
    existingEvidence
  });

  assert.deepEqual(result, {
    status: 'completed',
    reasonCode: null,
    candidateCount: 0,
    decisions: [],
    evidence: existingEvidence
  });
});
