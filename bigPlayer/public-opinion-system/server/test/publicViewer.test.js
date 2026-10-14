const test = require('node:test');
const assert = require('node:assert/strict');
const { BaasAccess } = require('../src/services/baasAccess');
const request = (method = 'GET', host = 'lfy3001.dev.q1op.com', remoteAddress = '127.0.0.1') => ({ method, headers: { host: '127.0.0.1:4320', 'x-forwarded-host': host }, socket: { remoteAddress } });
test('exact public domain allows anonymous GET viewing and blocks mutations and configuration', async () => {
  const access = new BaasAccess({ env: { PUBLIC_OPINION_BAAS_ENABLED: 'true' }, fetchImpl: () => { throw Error('SSO should not run for public GET'); } });
  for (const endpoint of ['overview', 'contents', 'contents/c1', 'alerts', 'sources', 'communities', 'auth/session']) {
    assert.equal((await access.authorize(request(), '/api/public-opinion/' + endpoint)).publicReadOnly, true);
  }
  for (const [method, endpoint] of [['GET', 'sources/s1'], ['POST', 'contents/batch-handle'], ['PATCH', 'alerts/a1'], ['POST', 'sources/s1/check-authorization'], ['POST', 'contents/c1/translation']]) {
    await assert.rejects(access.authorize(request(method), '/api/public-opinion/' + endpoint), { status: 401 });
  }
  assert.equal(access.publicConfig(request()).publicReadOnly, true);
});
test('other domains, spoofed forwarded host and authenticated callers retain SSO checks', async () => {
  let calls = 0;
  const access = new BaasAccess({ env: { PUBLIC_OPINION_BAAS_ENABLED: 'true' }, fetchImpl: async () => { calls++; return new Response(JSON.stringify({ end_user_id: 'admin', is_anonymous: false, roles: ['admin'] })); } });
  for (const req of [request('GET', 'other.q1.com'), request('GET', 'lfy3001.dev.q1op.com.evil'), request('GET', 'lfy3001.dev.q1op.com', '192.0.2.1')]) {
    assert.equal(access.publicViewer(req), null);
    await assert.rejects(access.authorize(req, '/api/public-opinion/overview'), { status: 401 });
  }
  const req = request('PATCH'); req.headers.authorization = 'Bearer isolated-token';
  assert.equal((await access.authorize(req, '/api/public-opinion/alerts/a')).id, 'admin');
  assert.equal(calls, 1);
});
