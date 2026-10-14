const test = require('node:test');
const assert = require('node:assert/strict');
const { target, sameCache, apply } = require('../../scripts/risk-normalization-backfill');

test('backfill never upgrades low-score legacy content using a keyword guess', () => {
  assert.equal(target({ sentiment: 'positive', severity: 'urgent', negative_score: 1 }), 'normal');
  assert.equal(target({ sentiment: 'negative', severity: 'attention', negative_score: 0.499 }), 'attention');
  assert.equal(target({ sentiment: 'negative', severity: 'attention', negative_score: 0.5 }), 'urgent');
  assert.equal(sameCache({ cache_key: 'k', severity: 'attention', negative_score: 0.8 }, { cache_key: 'k', severity: 'attention', negative_score: 0.1 }), false);
});

test('backfill audit failure rolls back the analysis and releases the gate', async () => {
  const before = { id: 'a', content_id: 'c', analysis_version: 'v', analysis_level: 'light', content_fingerprint: 'fp', current_fingerprint: 'fp', analyzed_at: '2026-10-10 12:00:00', sentiment: 'positive', severity: 'attention', negative_score: 0.2 };
  let commits = 0, rollbacks = 0, updates = 0, releases = 0;
  const gate = { async query(sql) { return [[{ acquired: 1, owned: 1 }]]; }, release() { releases++; } };
  const conn = {
    async beginTransaction() {}, async query(sql) {
      if (sql.startsWith('SELECT id,game_id')) return [[{ id: 'c', fingerprint: 'fp', game_id: 'g', source_id: 's' }]];
      if (sql.startsWith('SELECT * FROM po_analyses')) return [[before]];
      if (sql.startsWith('UPDATE po_analyses')) { updates++; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO po_audit_events')) throw new Error('audit unavailable');
      throw new Error(`unexpected SQL ${sql}`);
    }, async commit() { commits++; }, async rollback() { rollbacks++; }, release() { releases++; }
  };
  let calls = 0;
  const repo = { pool: { async getConnection() { return calls++ ? conn : gate; } } };
  const plan = { schemaVersion: 2, cacheRecords: [], policyVersion: 'positive-normal-negative-50-game-complaint-v5', historicalNotifications: false, batchSize: 100, batchId: 'b', records: [{ before, finalSeverity: 'normal', caches: [] }] };
  const approval = { planSha256: 'sha', policyVersion: plan.policyVersion, action: 'risk-backfill-deterministic-only', historicalNotifications: false, writerCutoverVerified: true, sharedWorkerEnqueueRaceResolved: true };
  await assert.rejects(apply(repo, plan, approval, 'sha'), /audit unavailable/);
  assert.equal(updates, 1); assert.equal(commits, 0); assert.equal(rollbacks, 1); assert.equal(releases, 2);
});

test('backfill rejects apply until writer and shared enqueue impact are reviewed', async () => {
  await assert.rejects(apply({}, {}, {}, 'sha'), /approval/);
});
