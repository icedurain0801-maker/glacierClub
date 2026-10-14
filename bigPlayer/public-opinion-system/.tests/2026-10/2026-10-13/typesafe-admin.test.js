const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TypeSafeTestService, validateResult, plain } = require('../../../server/src/services/typesafeTestService');
const base = path.resolve(__dirname, '../../../../../.temp/typesafe-admin-tests');
const result = { final_level: 'L0', raw_level: 'L0', confidence: 0.9, status: 'auto_passed' };
const env = { CREDENTIAL_ENC_KEY: '11'.repeat(32) };
async function make(runner, repo) {
  await fs.mkdir(base, { recursive: true });
  const storageDir = await fs.mkdtemp(path.join(base, 'case-'));
  return new TypeSafeTestService({ env, storageDir, runner: runner || (async () => [{ index: 0, result }]), repo });
}
test('config is encrypted, does not return or echo secret, and survives recreation', async () => {
  const service = await make();
  assert.equal((await service.config()).configured, false);
  const value = await service.save({ apiKey: 'test-key-that-is-not-real' });
  assert.equal(value.configured, true); assert.equal(value.scope, 'global'); assert.equal(value.autoAnalysisEnabled, false);
  assert.equal(value.model, 'jev-latest');
  const content = await fs.readFile(service.configPath, 'utf8');
  assert.ok(!content.includes('test-key-that-is-not-real'));
  assert.ok(!JSON.stringify(value).includes('secretCipher'));
  const recreated = new TypeSafeTestService({ env, storageDir: service.dir });
  assert.equal((await recreated.config()).configured, true);
});
test('failed auth check preserves old config, validates key and does not save plaintext when encryption is absent', async () => {
  const service = await make(); await service.save({ apiKey: 'original-test-key' });
  const original = await fs.readFile(service.configPath, 'utf8');
  service.runner = async () => [{ index: 0, error: 'REQUEST_REJECTED: HTTP 401' }];
  await assert.rejects(service.save({ apiKey: 'new-invalid-test-key' }), { code: 'TYPESAFE_AUTH_CHECK_FAILED' });
  assert.equal(await fs.readFile(service.configPath, 'utf8'), original);
  for (const body of [{}, { apiKey: 'bad\nkey-value' }, { apiKey: 'valid-test-key', endpoint: 'https://evil.example' }]) {
    await assert.rejects(service.save(body), { code: 'INVALID_INPUT' });
  }
  service.env = {};
  await assert.rejects(service.save({ apiKey: 'valid-test-key' }), { code: 'CREDENTIAL_ENC_KEY_MISSING' });
  assert.equal(await fs.readFile(service.configPath, 'utf8'), original);
});
test('routes require admin for reads, saves and runs even for a mapped manager', async () => {
  const service = await make();
  for (const identity of [null, { roles: ['viewer'], permissions: { manage: false } }, { roles: [], permissions: { manage: true } }]) {
    let status;
    await service.handleRequest({ method: 'GET', baasIdentity: identity }, {}, { path: ['typesafe-test', 'config'], id: 'config', json: (_, code) => { status = code; }, errorPayload: () => ({}) });
    assert.equal(status, 403);
  }
});
test('run accepts no custom content or endpoints and config response has no-store', async () => {
  const service = await make();
  const response = {}; let status;
  await service.handleRequest({ method: 'POST', baasIdentity: { roles: ['admin'] } }, response, {
    path: ['typesafe-test', 'runs'], id: 'runs', json: (_, code) => { status = code; }, errorPayload: () => ({}), readBody: async () => ({ contentIds: ['other-community'] })
  });
  assert.equal(status, 400); assert.equal(response.noStore, true);
});
test('50-row background run is independent, rejects duplicates and retains partial errors', async () => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const calls = [];
  const repo = { query: async (sql, args) => {
    assert.ok(sql.includes('c.is_deleted=0')); assert.ok(sql.startsWith('SELECT'));
    assert.equal(args[0], '00000000-0000-0000-0000-000000000101');
    const type = args[1];
    return Array.from({ length: 25 }, (_, i) => ({ id: `${type}-${i}`, content_type: type, title: 'Parent title must not enter comments', body: `body-${type}-${i}`, existing_severity: 'normal' }));
  } };
  const runner = async (posts, key, receive) => {
    if (posts.length === 1) return [{ index: 0, result }];
    await hold;
    calls.push(...posts);
    for (let i = 0; i < posts.length; i++) receive(i === 3 ? { index: i, error: 'REQUEST_REJECTED: HTTP 401' } : { index: i, result });
    return [];
  };
  const service = await make(runner, repo); await service.save({ apiKey: 'not-a-real-test-key' });
  const started = await service.start(); assert.equal(started.total, 50);
  await assert.rejects(service.start(), { code: 'TYPESAFE_BUSY' });
  await assert.rejects(service.save({ apiKey: 'another-test-key' }), { code: 'TYPESAFE_BUSY' });
  release(); await service.task;
  const job = await service.latest();
  assert.equal(job.status, 'completed_with_errors'); assert.equal(job.completed, 50); assert.equal(job.succeeded, 49); assert.equal(job.failed, 1);
  assert.ok(calls.slice(25).every(text => !text.includes('Parent title')));
  assert.ok(!JSON.stringify(job).includes('not-a-real-test-key'));
  assert.equal(service.active, false);
});
test('restart marks unfinished run interrupted; insufficient samples do not launch', async () => {
  const service = await make(undefined, { query: async () => [] });
  await service.write(service.jobPath, { status: 'running', rows: [] });
  assert.equal((await service.latest()).status, 'interrupted');
  await assert.rejects(service.start(), { code: 'TYPESAFE_NOT_CONFIGURED' });
  await service.save({ apiKey: 'not-a-real-test-key' });
  await assert.rejects(service.start(), { code: 'TYPESAFE_INSUFFICIENT_SAMPLES' });
  assert.equal(service.active, false);
});
test('text cleanup and invalid result validation', () => {
  assert.equal(plain('<script>bad()</script><p>good</p>&amp; text'), 'good\n& text');
  assert.throws(() => validateResult({ ...result, confidence: NaN }), { code: 'TYPESAFE_INVALID_RESULT' });
  assert.throws(() => validateResult({ ...result, final_level: 'L9' }), { code: 'TYPESAFE_INVALID_RESULT' });
});
