'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LoginSessionClient, LoginSessionClientError } = require('../../server/src/services/loginSessionClient');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('main service client sends internal auth and maps successful data', async () => {
  let observed;
  const client = new LoginSessionClient({
    LOGIN_SESSION_SERVICE_URL: 'http://login.internal/',
    LOGIN_SESSION_INTERNAL_TOKEN: 'secret',
    LOGIN_SESSION_REQUEST_TIMEOUT_MS: '1000'
  }, { fetchImpl: async (url, options) => { observed = { url, options }; return response(200, { data: { status: 'active' } }); } });
  const result = await client.startLogin({ sourceId: 's1', accountId: 'a1', platform: 'mock' });
  assert.deepEqual(result, { status: 'active' });
  assert.equal(observed.url, 'http://login.internal/internal/v1/login/start');
  assert.equal(observed.options.headers.authorization, 'Bearer secret');
});

test('main service client leaves enough default time for browser login automation', () => {
  const client = new LoginSessionClient({
    LOGIN_SESSION_SERVICE_URL: 'http://login.internal',
    LOGIN_SESSION_INTERNAL_TOKEN: 'secret'
  }, { fetchImpl: async () => response(200, { data: {} }) });
  assert.equal(client.timeoutMs, 60000);
});

test('main service client maps structured service errors', async () => {
  const client = new LoginSessionClient({ LOGIN_SESSION_SERVICE_URL: 'http://login.internal', LOGIN_SESSION_INTERNAL_TOKEN: 'secret' }, {
    fetchImpl: async () => response(400, { error: { code: 'CAPABILITY_UNSUPPORTED', message: 'unsupported' } })
  });
  await assert.rejects(
    () => client.startLogin({}),
    error => error instanceof LoginSessionClientError && error.code === 'CAPABILITY_UNSUPPORTED' && error.status === 400
  );
});

test('main service client fails closed when not configured', async () => {
  const client = new LoginSessionClient({}, { fetchImpl: async () => { throw new Error('must not execute'); } });
  await assert.rejects(() => client.getStatus({}), error => error.code === 'LOGIN_SESSION_SERVICE_NOT_CONFIGURED');
});
