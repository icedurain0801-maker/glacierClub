'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, createService } = require('../src');

const token = 'test-internal-token';

async function startServer() {
  const server = createApp({ LOGIN_SESSION_INTERNAL_TOKEN: token, LOGIN_CHALLENGE_TTL_MS: '1000' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function request(baseUrl, path, { method = 'GET', body, auth = token } = {}) {
  const headers = { authorization: `Bearer ${auth}` };
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body && JSON.stringify(body) });
  return { response, payload: await response.json() };
}

test('HTTP API enforces internal authentication', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const { response, payload } = await request(baseUrl, '/internal/v1/login/status', { auth: 'wrong' });
  assert.equal(response.status, 401);
  assert.equal(payload.error.code, 'UNAUTHORIZED');
});

test('HTTP API supports binding, login, status, reference and revoke', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const binding = { sourceId: 'source-http', accountId: 'account-http', platform: 'mock' };
  const bound = await request(baseUrl, '/internal/v1/accounts/binding', {
    method: 'PUT',
    body: { ...binding, credentialRef: 'credential-secret-ref', phone: '13800138000', password: 'must-not-return', cookie: 'must-not-return' }
  });
  assert.equal(bound.response.status, 200);
  assert.equal(bound.payload.data.maskedPhone, '138****8000');
  assert.doesNotMatch(JSON.stringify(bound.payload), /must-not-return|credential-secret-ref/);

  const login = await request(baseUrl, '/internal/v1/login/start', { method: 'POST', body: { ...binding, scenario: 'success' } });
  assert.equal(login.payload.data.status, 'active');
  const query = new URLSearchParams(binding);
  const reference = await request(baseUrl, `/internal/v1/sessions/reference?${query}`);
  assert.match(reference.payload.data.sessionRef, /^sess_/);
  assert.doesNotMatch(JSON.stringify(reference.payload), /cookie|password/i);

  const revoked = await request(baseUrl, '/internal/v1/sessions/revoke', { method: 'POST', body: binding });
  assert.equal(revoked.payload.data.status, 'revoked');
  assert.equal(revoked.payload.data.sessionRef, null);
});

test('HTTP challenge endpoints enforce account isolation and one-time submission', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const first = { sourceId: 'source-a', accountId: 'account-a', platform: 'mock' };
  const second = { sourceId: 'source-b', accountId: 'account-b', platform: 'mock' };
  for (const binding of [first, second]) {
    await request(baseUrl, '/internal/v1/accounts/binding', { method: 'PUT', body: { ...binding, credentialRef: `cred-${binding.accountId}` } });
  }
  const started = await request(baseUrl, '/internal/v1/login/start', { method: 'POST', body: { ...first, scenario: 'sms_code' } });
  const challengeId = started.payload.data.challenge.id;
  const crossAccount = await request(baseUrl, '/internal/v1/challenges/submit', { method: 'POST', body: { ...second, challengeId, answer: '123456' } });
  assert.equal(crossAccount.response.status, 403);
  assert.equal(crossAccount.payload.error.code, 'ACCOUNT_SCOPE_MISMATCH');

  const completed = await request(baseUrl, '/internal/v1/challenges/submit', { method: 'POST', body: { ...first, challengeId, answer: '123456' } });
  assert.equal(completed.payload.data.status, 'active');
  const repeated = await request(baseUrl, '/internal/v1/challenges/submit', { method: 'POST', body: { ...first, challengeId, answer: '123456' } });
  assert.equal(repeated.response.status, 409);
  assert.equal(repeated.payload.error.code, 'CHALLENGE_ALREADY_USED');
});

test('HTTP authorization result claim is one-time and scoped', async t => {
  const service = createService({ LOGIN_RESULT_EXCHANGE_TTL_MS: '1000' }, {
    automation: { bigplayer_h5: { async login() { return { kind: 'success', apiToken: 'claimed-api-token' }; } } }
  });
  const server = createApp({ LOGIN_SESSION_INTERNAL_TOKEN: token }, { service });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const binding = { sourceId: 'source-result', accountId: 'account-result', platform: 'bigplayer_h5' };
  await request(baseUrl, '/internal/v1/accounts/binding', { method: 'PUT', body: { ...binding, credentialRef: 'credential-ref' } });
  await request(baseUrl, '/internal/v1/login/start', { method: 'POST', body: binding });

  const claimed = await request(baseUrl, '/internal/v1/sessions/result/claim', { method: 'POST', body: binding });
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.payload.data.apiToken, 'claimed-api-token');
  const replay = await request(baseUrl, '/internal/v1/sessions/result/claim', { method: 'POST', body: binding });
  assert.equal(replay.response.status, 409);
  assert.equal(replay.payload.error.code, 'AUTH_RESULT_NOT_FOUND');
});

test('HTTP session reference exchange is one-time and public payload stays opaque', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const binding = { sourceId: 'source-exchange', accountId: 'account-exchange', platform: 'mock' };
  await request(baseUrl, '/internal/v1/accounts/binding', { method: 'PUT', body: { ...binding, credentialRef: 'secret-credential-ref', password: 'secret-password' } });
  await request(baseUrl, '/internal/v1/login/start', { method: 'POST', body: { ...binding, scenario: 'success' } });
  const exchanged = await request(baseUrl, '/internal/v1/sessions/reference/exchange', { method: 'POST', body: binding });
  assert.equal(exchanged.response.status, 200);
  assert.match(exchanged.payload.data.exchangeToken, /^xchg_/);
  assert.doesNotMatch(JSON.stringify(exchanged.payload), /secret-credential-ref|secret-password/);
  const consumed = await request(baseUrl, '/internal/v1/sessions/exchange', { method: 'POST', body: { exchangeToken: exchanged.payload.data.exchangeToken } });
  assert.equal(consumed.response.status, 200);
  assert.match(consumed.payload.data.sessionRef, /^sess_/);
  const repeated = await request(baseUrl, '/internal/v1/sessions/exchange', { method: 'POST', body: { exchangeToken: exchanged.payload.data.exchangeToken } });
  assert.equal(repeated.response.status, 409);
  assert.equal(repeated.payload.error.code, 'EXCHANGE_INVALID');
});

test('health exposes non-sensitive readiness and fails closed without BigPlayer automation', async t => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.deepEqual(payload, {
    ready: false,
    internalAuth: { configured: true },
    resolver: { configured: false },
    adapters: { bigplayer_h5: { available: false, code: 'AUTOMATION_NOT_CONFIGURED', message: 'bigplayer_h5 login automation is not configured' } }
  });
  assert.doesNotMatch(JSON.stringify(payload), /token|secret|password|cookie/i);
});

test('health is ready when a real BigPlayer automation contract is injected', async t => {
  const service = createService({ LOGIN_SESSION_INTERNAL_TOKEN: token }, { credentialResolver: async () => ({ baseUrl: 'https://example.test', account: 'a', password: 'p' }), automation: { bigplayer_h5: { async login() { return { kind: 'success', apiToken: 'token' }; } } } });
  const server = createApp({ LOGIN_SESSION_INTERNAL_TOKEN: token }, { service });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ready: true,
    internalAuth: { configured: true },
    resolver: { configured: true },
    adapters: { bigplayer_h5: { available: true } }
  });
});

test('env-only production configuration shares its resolver with default BigPlayer automation', async t => {
  const playwright = { chromium: { async launch() { throw new Error('not used by readiness'); } } };
  const env = {
    LOGIN_SESSION_INTERNAL_TOKEN: token,
    PUBLIC_OPINION_SERVER_URL: 'http://127.0.0.1:4320'
  };
  const service = createService(env, { playwright, fetchImpl: async () => { throw new Error('not used by readiness'); } });
  assert.equal(service.adapters.bigplayer_h5.automation.credentialResolver, service.credentialResolver);
  const server = createApp(env, { service });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ready: true,
    internalAuth: { configured: true },
    resolver: { configured: true },
    adapters: { bigplayer_h5: { available: true } }
  });
});
