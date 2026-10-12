const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BaasAccess, requiredPermission, publicSourceSummary, BAAS_APP_KEY } = require('../src/services/baasAccess');
const req = (method = 'GET', authorization = 'Bearer fixture-token') => ({ method, headers: { authorization, 'x-admin-user': 'forged-admin', 'x-roles': 'admin' } });
const user = (roles, extra = {}) => ({ end_user_id: 'fixture-user', external_id: 'glacier:fixture', display_name: '测试用户', is_anonymous: false, roles, ...extra });
const make = (me, status = 200) => new BaasAccess({ fetchImpl: async () => new Response(JSON.stringify(me), { status }) });

test('identity uses fixed application and never forwards forged role headers', async () => {
  const access = new BaasAccess({ fetchImpl: async (url, options) => {
    assert.equal(url, 'https://chat.q1.com/baas/v1/auth/me');
    assert.equal(options.headers['X-App-Key'], BAAS_APP_KEY);
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.headers['x-admin-user'], undefined);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(user(['viewer'])));
  } });
  const identity = await access.authorize(req(), '/api/public-opinion/overview');
  assert.equal(identity.externalId, 'glacier:fixture');
  assert.deepEqual(identity.permissions, { read: true, review: false, manage: false });
});

test('no credentials, expired and foreign application tokens fail before business access', async () => {
  const access = new BaasAccess({ fetchImpl: async () => { throw Error('must not fetch'); } });
  for (const value of [null, '', 'Basic test', 'Bearer a b']) await assert.rejects(access.authenticate(req('GET', value)), { status: 401 });
  for (const status of [401, 403]) await assert.rejects(make({}, status).authenticate(req()), { status: 401 });
});

test('anonymous, malformed and roleless users cannot gain access', async () => {
  for (const me of [user(['admin'], { is_anonymous: true }), user(['admin'], { is_anonymous: undefined }), {}]) await assert.rejects(make(me).authenticate(req()), { status: 403 });
  for (const roles of [[], ['owner'], ['unknown'], 'admin']) await assert.rejects(make(user(roles)).authenticate(req()), { code: 'BAAS_ROLE_REQUIRED' });
});

test('owner maps to admin, reviewer can review, analysts and viewers remain read-only', async () => {
  for (const role of ['analyst', 'viewer']) {
    const access = make(user([role]));
    await access.authorize(req(), '/api/public-opinion/contents');
    await assert.rejects(access.authorize(req('PATCH'), '/api/public-opinion/quality-contents/q1'), { status: 403 });
    await assert.rejects(access.authorize(req(), '/api/public-opinion/accounts/a1/login/status'), { status: 403 });
  }
  const reviewer = make(user(['reviewer']));
  await reviewer.authorize(req('POST'), '/api/public-opinion/contents/batch-handle');
  await reviewer.authorize(req('PATCH'), '/api/public-opinion/alerts/a1');
  await assert.rejects(reviewer.authorize(req('PUT'), '/api/public-opinion/accounts/a1/credential'), { status: 403 });
  await make(user([], { role: 'owner' })).authorize(req('DELETE'), '/api/public-opinion/sources/s1');
});

test('upstream outage and invalid JSON fail closed, permission revocation is immediate', async () => {
  for (const fetchImpl of [async () => { throw Error('network fixture'); }, async () => new Response('not-json'), async () => new Response('{}', { status: 500 })]) {
    await assert.rejects(new BaasAccess({ fetchImpl }).authenticate(req()), { status: 503 });
  }
  let roles = ['admin'];
  const access = new BaasAccess({ fetchImpl: async () => new Response(JSON.stringify(user(roles))) });
  await access.authorize(req('DELETE'), '/api/public-opinion/sources/s1');
  roles = ['viewer'];
  await assert.rejects(access.authorize(req('DELETE'), '/api/public-opinion/sources/s1'), { status: 403 });
});

test('new/unknown endpoints and configuration endpoints require admin', () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) assert.equal(requiredPermission(method, '/api/public-opinion/future-endpoint'), 'manage');
  assert.equal(requiredPermission('GET', '/api/public-opinion/sources'), 'read');
  assert.equal(requiredPermission('GET', '/api/public-opinion/sources/s1/credential'), 'manage');
  assert.equal(requiredPermission('GET', '/api/public-opinion/contents/c1/future-operation'), 'manage');
});

test('read-only source summaries expose frequency without account or connector configuration', () => {
  const source = { id: 's1', enabled: 1, frequency_seconds: 21600, platform: 'bigplayer_h5', display_name: '测试来源', config: { api_token: 'fixture-secret' }, account: { credential: 'fixture-secret' } };
  const summary = publicSourceSummary(source);
  assert.equal(summary.frequency_seconds, 21600);
  assert.equal(summary.display_name, '测试来源');
  assert(!JSON.stringify(summary).includes('fixture-secret'));
  assert.equal(summary.config, undefined);
  assert.equal(summary.account, undefined);
});

test('content handling audit records the verified actor inside the handling transaction', async () => {
  const { handleContents } = require('../src/services/contentHandling');
  const id = '11111111-1111-1111-1111-111111111111';
  let actor; let committed = false;
  const connection = {
    beginTransaction: async () => {},
    query: async (sql, values) => {
      if (sql.startsWith('SELECT')) return [[{ id, game_id: 'game', source_id: 'source', severity: 'urgent' }]];
      if (sql.includes('po_audit_events')) actor = values[5];
      return [{ affectedRows: 1 }];
    },
    commit: async () => { assert.equal(actor, 'verified-member'); committed = true; },
    rollback: async () => {}, release: () => {}
  };
  await handleContents({ pool: { getConnection: async () => connection } }, { contentIds: [id], handlingMethod: 'handled' }, { actorId: 'verified-member' });
  assert(committed);
});

test('HTTP boundary rejects unauthorized requests before repository writes and returns verified session', async () => {
  const app = require('../src/app');
  const original = { enabled: app.baasAccess.enabled, fetch: app.baasAccess.fetch, listGames: app.repo.listGames };
  let reads = 0;
  app.baasAccess.enabled = true;
  app.baasAccess.fetch = async () => new Response(JSON.stringify(user(['viewer'])));
  app.repo.listGames = async () => { reads++; return []; };
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion`;
  try {
    assert.equal((await fetch(`${base}/games`)).status, 401);
    assert.equal(reads, 0);
    const headers = { Authorization: 'Bearer fixture-token', 'x-admin-user': 'spoofed' };
    assert.equal((await fetch(`${base}/games`, { headers })).status, 200);
    assert.equal(reads, 1);
    assert.equal((await fetch(`${base}/quality-contents/fixture`, { method: 'PATCH', headers, body: '{}' })).status, 403);
    const session = await (await fetch(`${base}/auth/session`, { headers })).json();
    assert.equal(session.data.identity.externalId, 'glacier:fixture');
    assert.deepEqual(session.data.identity.roles, ['viewer']);
    const config = await (await fetch(`${base}/auth/config`)).json();
    assert.equal(config.data.appKey, BAAS_APP_KEY);
    assert.equal((await fetch(`${base}/analysis/content-batch`, { method: 'POST', body: '{}' })).status >= 400, true);
    assert.equal((await fetch(`${base}/analysis/content-batch`, { method: 'POST', headers: { 'x-forwarded-host': 'club-opinion.q1.com' }, body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/sources/fixture/import`, { method: 'POST', headers: { 'x-forwarded-host': 'club-opinion.q1.com' }, body: '{}' })).status, 401);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.baasAccess.enabled = original.enabled; app.baasAccess.fetch = original.fetch; app.repo.listGames = original.listGames;
    await app.repo.pool.end();
  }
});
