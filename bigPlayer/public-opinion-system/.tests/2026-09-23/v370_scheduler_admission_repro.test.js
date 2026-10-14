const assert = require('node:assert/strict');
const test = require('node:test');
const { createSourceSchedulerRuntime } = require('../../worker/src/sourceSchedulerRuntime');
const { createSchedulerRepositoryAdapter } = require('../../worker/src/schedulerRepositoryAdapter');

const source = { id: 's1', game_id: 'g1', community_id: 'c1', region_code: 'domestic', platform: 'bigplayer_h5', enabled: true, game_enabled: true, community_status: 'enabled', auth_status: 'authorized', default_account_id: 'a1', frequency_seconds: 3600, schedule_effective_at: '2025-12-31T18:00:01.000Z', config: JSON.stringify({ siteUrls: [{ siteId: 'a', url: 'https://club.q1.com/?gameId=a' }, { siteId: 'b', url: 'https://club.q1.com/?gameId=b' }] }) };
const account = { id: 'a1', source_id: 's1', game_id: 'g1', community_id: 'c1', platform: 'bigplayer_h5', enabled: true, auth_status: 'authorized' };
const capabilities = { bigplayer_h5: { available: true, supportsScheduling: true } };
const now = new Date('2026-01-01T19:01:00.000Z');
const compact = sql => sql.replace(/\s+/g, ' ').trim();

test('fallback enqueue failure leaves schedule cursor untouched', async () => {
  const calls = [];
  const connection = { async query(sql, params = []) { const normalized = compact(sql); calls.push({ normalized, params });
    if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
    if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 1 }]];
    if (normalized.startsWith('INSERT INTO po_sync_runs')) throw Object.assign(new Error('queue down'), { code: 'ER_QUEUE_DOWN' });
    if (normalized.includes('SET lease_run_id=NULL')) return [{ affectedRows: 1 }];
    throw new Error(`unexpected SQL: ${normalized}`);
  } };
  const result = await createSourceSchedulerRuntime({ connection, workerId: 'w', idFactory: () => 'r1' }).run({ sources: [source], accounts: [account], connectorCapabilities: capabilities, now });
  assert.equal(result.decisions[0].reasonCode, 'ENQUEUE_FAILED');
  assert.equal(calls.some(call => call.normalized.startsWith('UPDATE po_source_schedule_state SET last_scheduled_at')), false);
});

test('lease rejection carries a structured reason', async () => {
  const connection = { async query(sql) { const normalized = compact(sql); if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 0 }]; if (normalized.startsWith('SELECT s.lease_until')) return [[{ lease_until: '2026-01-01 19:05:00.000', active_run: 1 }]]; if (normalized.startsWith('UPDATE po_source_schedule_state SET last_reason_code')) return [{ affectedRows: 1 }]; throw new Error(`unexpected SQL: ${normalized}`); } };
  const result = await createSourceSchedulerRuntime({ connection, workerId: 'w', idFactory: () => 'r1' }).run({ sources: [source], accounts: [account], connectorCapabilities: capabilities, now });
  assert.equal(result.decisions[0].reasonCode, 'PREVIOUS_RUN_ACTIVE');
});

test('BigPlayer admission errors are not collapsed into a generic lease failure', async () => {
  const tx = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async query(sql) { const normalized = compact(sql); if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }]; if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 1 }]]; if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }]; if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'r1' }]]; if (normalized.startsWith('SELECT platform, config')) { const error = new Error('migration 029 missing site_url_snapshot'); error.code = 'ER_BAD_FIELD_ERROR'; throw error; } throw new Error(`unexpected SQL: ${normalized}`); } };
  const connection = { async query() { throw new Error('root connection must not be used'); }, async getConnection() { return tx; } };
  const result = await createSourceSchedulerRuntime({ connection, workerId: 'w', idFactory: () => 'r1' }).run({ sources: [source], accounts: [account], connectorCapabilities: capabilities, now });
  assert.equal(result.decisions[0].reasonCode, 'ER_BAD_FIELD_ERROR');
});

test('BigPlayer 3-site config versus 1-site registry fails closed with an explainable code', async () => {
  const tx = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async query(sql) {
    const normalized = compact(sql);
    if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 1 }];
    if (normalized.startsWith('SELECT lease_epoch')) return [[{ lease_epoch: 2 }]];
    if (normalized.startsWith('INSERT INTO po_sync_runs')) return [{ affectedRows: 1 }];
    if (normalized.startsWith('SELECT id FROM po_sync_runs')) return [[{ id: 'r2' }]];
    if (normalized.startsWith('SELECT platform, config')) return [[{ platform: 'bigplayer_h5', config: JSON.stringify({ siteUrls: [
      { siteId: 'a', url: 'https://club.q1.com/?gameId=a' }, { siteId: 'b', url: 'https://club.q1.com/?gameId=b' }, { siteId: 'c', url: 'https://club.q1.com/?gameId=c' }
    ] }) }]];
    if (normalized.startsWith('SELECT site_id, url, enabled')) return [[{ site_id: 'a', url: 'https://club.q1.com/?gameId=a', enabled: 1 }]];
    throw new Error(`unexpected SQL: ${normalized}`);
  } };
  const adapter = createSchedulerRepositoryAdapter({ async query() {}, async getConnection() { return tx; } });
  await assert.rejects(() => adapter.scheduleSlotAtomic({ runId: 'r2', sourceId: 's1', accountId: 'a1', triggerType: 'scheduled_catchup', scheduledAt: '2026-01-01T19:00:00.000Z', nextSlotAt: '2026-01-01T20:00:00.000Z', ownerId: 'w', leaseUntil: '2026-01-01T19:05:00.000Z', multiSite: true }), error => error.code === 'MULTISITE_SITE_REGISTRY_MISMATCH');
});

test('transactional lease rejection persists reason without advancing cursor', async () => {
  const calls = [];
  const tx = {
    async beginTransaction() { calls.push('BEGIN'); }, async commit() { calls.push('COMMIT'); }, async rollback() { calls.push('ROLLBACK'); }, release() {},
    async query(sql, params = []) { const normalized = compact(sql); calls.push({ normalized, params });
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 0 }];
      if (normalized.startsWith('SELECT s.lease_until')) return [[{ lease_until: null, active_lease: 0, active_run_status: 'queued' }]];
      if (normalized.startsWith('UPDATE po_source_schedule_state SET last_reason_code')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${normalized}`);
    }
  };
  const adapter = createSchedulerRepositoryAdapter({ async query() {}, async getConnection() { return tx; } });
  const result = await adapter.scheduleSlotAtomic({ runId: 'r3', sourceId: 's1', accountId: 'a1', triggerType: 'scheduled_catchup', scheduledAt: '2026-01-01T19:00:00.000Z', nextSlotAt: '2026-01-01T20:00:00.000Z', ownerId: 'w', leaseUntil: '2026-01-01T19:05:00.000Z' });
  assert.equal(result.reasonCode, 'RUN_QUEUED');
  assert.equal(calls.includes('ROLLBACK'), false);
  assert.equal(calls.at(-1), 'COMMIT');
  assert.equal(calls.some(call => call.normalized?.includes('last_scheduled_at')), false);
});

test('transactional lease rejection distinguishes running and unexpired lease', async () => {
  for (const [row, expected] of [
    [{ lease_until: null, active_lease: 0, active_run_status: 'running' }, 'RUN_RUNNING'],
    [{ lease_until: '2099-01-01 00:00:00.000', active_lease: 1, active_run_status: null }, 'LEASE_ACTIVE']
  ]) {
    const tx = { async beginTransaction() {}, async commit() {}, async rollback() { throw new Error('rollback must not run'); }, release() {}, async query(sql) {
      const normalized = compact(sql);
      if (normalized.includes('lease_epoch=lease_epoch+1')) return [{ affectedRows: 0 }];
      if (normalized.startsWith('SELECT s.lease_until')) return [[row]];
      if (normalized.startsWith('UPDATE po_source_schedule_state SET last_reason_code')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected SQL: ${normalized}`);
    } };
    const result = await createSchedulerRepositoryAdapter({ async query() {}, async getConnection() { return tx; } }).scheduleSlotAtomic({ runId: 'r4', sourceId: 's1', accountId: 'a1', triggerType: 'scheduled_catchup', scheduledAt: '2026-01-01T19:00:00.000Z', nextSlotAt: '2026-01-01T20:00:00.000Z', ownerId: 'w', leaseUntil: '2026-01-01T19:05:00.000Z' });
    assert.equal(result.reasonCode, expected);
  }
});
