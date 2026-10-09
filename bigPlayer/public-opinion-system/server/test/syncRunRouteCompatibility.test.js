const test = require('node:test');
const assert = require('node:assert/strict');

// Keep the real HTTP router and repository SQL builder, but prohibit all pool I/O.
const runtime = require('../src/runtimeEnv');
runtime.loadRuntimeEnv = () => false;
const app = require('../src/app');
const source = { id: 'source-fixture', game_id: 'game-fixture', community_id: 'community-fixture', platform: 'bigplayer_h5' };
const sqlCalls = [];
let base;
let poolCalls = 0;

test.before(async () => {
  app.repo.pool = {
    async query() { poolCalls += 1; throw new Error('fixture must not connect to a database'); },
    async end() {}
  };
  app.repo.health = async () => ({ ok: 1 });
  app.repo.listSources = async () => [source];
  app.repo.listAccounts = async () => [];
  app.repo.listSourceCapabilities = async () => [];
  app.repo.query = async (sql, params = []) => {
    sqlCalls.push({ sql, params });
    if (sql.includes('information_schema.COLUMNS')) return [];
    if (sql.startsWith('SELECT COUNT(*) AS total')) return [{ total: 1 }];
    if (sql.startsWith('SELECT r.id,')) return [{ id: 'run-fixture', account_id: 'account-fixture', source_id: source.id, status: 'completed' }];
    throw new Error(`unexpected fixture query: ${sql.slice(0, 32)}`);
  };
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => app.server.close(resolve));
  await app.repo.pool.end();
});

async function get(path) {
  const response = await fetch(base + path);
  return { status: response.status, body: await response.json() };
}

test('current-schema fixture serves health, source, list, detail, and latest read routes', async () => {
  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.data.database.status, 'ok');
  const sources = await get('/api/public-opinion/sources');
  assert.equal(sources.status, 200);
  assert.equal(sources.body.data[0].id, source.id);
  const runs = await get('/api/public-opinion/sync-runs?page=1&pageSize=20');
  assert.equal(runs.status, 200);
  assert.equal(runs.body.data[0].id, 'run-fixture');
  const detail = await get('/api/public-opinion/sync-runs/run-fixture');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.id, 'run-fixture');
  const latest = await get('/api/public-opinion/sources/source-fixture/sync-runs/latest');
  assert.equal(latest.status, 200);
  assert.equal(latest.body.data.id, 'run-fixture');
  assert.equal(poolCalls, 0);
  const runSelects = sqlCalls.filter(call => call.sql.startsWith('SELECT r.id,'));
  assert.equal(runSelects.length, 3);
  for (const { sql } of runSelects) {
    assert.match(sql, /NULL AS run_community_id/);
    assert.match(sql, /NULL AS board_id/);
    assert.match(sql, /NULL AS site_url_snapshot/);
    assert.doesNotMatch(sql, /r\.(?:community_id|board_id|board_name|run_scope|site_url_snapshot|last_request_at)\b/);
  }
});
