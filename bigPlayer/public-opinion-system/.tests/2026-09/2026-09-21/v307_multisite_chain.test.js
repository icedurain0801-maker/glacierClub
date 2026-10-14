const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { Repository } = require('../../../server/src/db/repository');
const { BigPlayerH5Connector } = require('../../../server/src/connectors/bigPlayerH5Connector');

test('parent cancel preserves active child lease and cancels unclaimed child', async () => {
  const children = [
    { id: 'active', status: 'running', lease_owner: 'worker-1', lease_until: 'future', lease_active: 1 },
    { id: 'queued', status: 'queued', lease_owner: null, lease_until: null, lease_active: 0 }
  ];
  const parent = { id: 'parent', status: 'running' };
  const calls = [];
  const conn = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id,status FROM po_sync_runs')) return [[parent]];
      if (sql.startsWith('SELECT id,status,lease_owner')) return [[...children]];
      if (sql.startsWith('UPDATE po_sync_runs SET status=?') && sql.includes('WHERE id=? AND status=?')) {
        const child = children.find(item => item.id === params[7]);
        if (child) { child.status = params[0]; if (!params[4]) { child.lease_owner = null; child.lease_until = null; } return [{ affectedRows: 1 }]; }
        parent.status = params[0]; return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }
  };
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.pool = { async getConnection() { return conn; } };
  repo.getSyncRun = async () => ({ ...parent, hasScheduledSiteChildren: 1, source_id: 'source', account_id: 'account' });
  repo.recordAuditEvent = async () => {};
  const result = await repo.requestSyncRunControl('parent', 'cancel');
  assert.equal(result.status, 'cancelling');
  assert.deepEqual(children.map(item => [item.status, item.lease_owner]), [['cancelling', 'worker-1'], ['cancelled', null]]);
});

test('parent resume rejects pausing state before mutating children', async () => {
  let childMutation = false;
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.getSyncRun = async () => ({ id: 'parent', status: 'pausing', hasScheduledSiteChildren: 1 });
  repo.pool = { async getConnection() { return { async beginTransaction() {}, async rollback() {}, release() {}, async query(sql) { if (sql.startsWith('SELECT id,status')) return [[{ id: 'parent', status: 'pausing' }]]; childMutation = true; return [[]]; } }; } };
  assert.equal(await repo.requestSyncRunControl('parent', 'resume'), null);
  assert.equal(childMutation, false);
});

test('child finalization cannot overwrite a cancelling control request', async () => {
  let committed = false;
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.pool = { async getConnection() { return { async beginTransaction() {}, async rollback() {}, async commit() { committed = true; }, release() {}, async query(sql) { if (sql.startsWith('UPDATE po_sync_runs SET status=?')) { assert.match(sql, /status='running'/); return [{ affectedRows: 0 }]; } throw new Error('must stop after fenced update'); } }; } };
  assert.equal(await repo.finishScheduledSiteRun('child', { status: 'completed_full', leaseOwner: 'worker', leaseEpoch: 2 }), null);
  assert.equal(committed, false);
});

test('BigPlayer records request evidence at the actual fetch boundary', async () => {
  const order = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: '1', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    fetchImpl: async () => { order.push('fetch'); return { ok: true, status: 200, url: 'https://club.q1.com/api/club/v1/auth/user/context', async json() { return { code: 0, data: [] }; } }; }
  });
  const source = { platform: 'bigplayer_h5', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=1&gameVersion=1' }, async __recordHttpRequest() { order.push('evidence'); } };
  await connector.requestQ1('/api/club/v1/auth/user/context', source, 'token', {}, 1, 'posts');
  assert.deepEqual(order, ['evidence', 'fetch']);
});

test('candidate keeps current risk logic and uses immutable run evidence fields', () => {
  const worker = fs.readFileSync(path.join(__dirname, '../../../worker/src/worker.js'), 'utf8');
  const analysis = fs.readFileSync(path.join(__dirname, '../../../worker/src/q1DailyAnalysisRunner.js'), 'utf8');
  const repository = fs.readFileSync(path.join(__dirname, '../../../server/src/db/repository.js'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '../../../../admin/PublicOpinion/assets/collection-runs.js'), 'utf8');
  assert.match(worker, /normalizePersistedAnalysis/);
  assert.match(worker, /normalizeSeverity/);
  assert.match(analysis, /normalizeSeverity/);
  assert.match(repository, /r\.site_url_snapshot/);
  assert.match(repository, /r\.last_request_at/);
  assert.doesNotMatch(repository, /r\.updated_at AS lastRequestAt/);
  assert.match(ui, /错误码/);
  assert.match(ui, /最后请求/);
});

test('registry reconciliation preserves operational auth and capabilities on existing rows', () => {
  const repository = fs.readFileSync(path.join(__dirname, '../../../server/src/db/repository.js'), 'utf8');
  const upsert = repository.match(/INSERT INTO po_source_sites[\s\S]+?ON DUPLICATE KEY UPDATE[^`]+/)[0];
  assert.doesNotMatch(upsert, /auth_status=VALUES/);
  assert.doesNotMatch(upsert, /capabilities=VALUES/);
});

test('multi-site scheduling fails closed when every configured site is disabled', () => {
  const adapter = fs.readFileSync(path.join(__dirname, '../../../worker/src/schedulerRepositoryAdapter.js'), 'utf8');
  assert.match(adapter, /if \(!enabledSites\.length\) throw multisiteError\('MULTISITE_SITE_REGISTRY_MISMATCH'/);
});
