'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.LOGIN_FIX_API_ROOT || path.resolve(__dirname, '../../../../../.temp/login-authorization-fix-20261010/api-release/server/src');
require(path.join(root, 'runtimeEnv')).loadRuntimeEnv = () => false;
const app = require(path.join(root, 'app'));
const source = { id: 'qa-source', game_id: 'qa-game', community_id: 'qa-community', platform: 'bigplayer_h5', config: '{}', auth_status: 'unauthorized' };
const account = { id: 'qa-account', source_id: source.id, platform: 'bigplayer_h5' };
let statusCalls = 0;
app.repo.listSources = async (_game, filter = {}) => filter.communityId === 'other' ? [] : [source];
app.repo.listAccounts = async () => [account];
app.repo.listSourceCapabilities = async () => [];
app.repo.getSyncStatus = async () => [];
app.repo.getAccountCredentialSummary = async () => [{ credential_type: 'account_password', has_secret_cipher: true }];
app.repo.resolveCommunityCanonical = async input => ({ ...input, gameId: 'qa-game' });
app.loginSessionClient.getStatus = async binding => {
  statusCalls++; assert.deepEqual(binding, { sourceId: 'qa-source', accountId: 'qa-account', platform: 'bigplayer_h5' });
  return { status: 'invalid_credentials', failureCode: 'INVALID_CREDENTIALS' };
};
async function get(url) {
  let status, body;
  const req = { method: 'GET', url: '/api/public-opinion' + url, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = { writeHead(value) { status = value; }, end(value) { body = JSON.parse(value); } };
  await app.handler(req, res); return { status, body };
}
test('runtime connector receives the same login client used by login routes', () => {
  assert.equal(app.connectors.bigplayer_h5.loginSessionClient, app.loginSessionClient);
});
test('login status reaches login service and exposes a status object', async () => {
  const result = await get('/sources/qa-source/login-status');
  assert.equal(result.status, 200); assert.equal(result.body.data.status, 'invalid_credentials');
  assert.equal(result.body.data.failureCode, 'INVALID_CREDENTIALS'); assert.equal(statusCalls, 1);
});
test('source detail returns one scoped object, list remains an array', async () => {
  assert.equal((await get('/sources/qa-source')).body.data.id, source.id);
  assert(Array.isArray((await get('/sources')).body.data));
});
test('missing and out-of-scope detail returns 404; conflicting path/query ID returns 400', async () => {
  assert.equal((await get('/sources/missing')).status, 404);
  assert.equal((await get('/sources/qa-source?communityId=other')).status, 404);
  assert.equal((await get('/sources/qa-source?sourceId=other')).status, 400);
});
test('unknown nested source route never falls through to the list', async () => {
  assert.equal((await get('/sources/qa-source/unknown')).status, 501);
});
const { BigPlayerH5Connector } = require(path.join(root, 'connectors/bigPlayerH5Connector'));
function connector(client) {
  return new BigPlayerH5Connector({}, { credentialContext: { load: async () => ({ secretObject: { account: 'synthetic', password: 'synthetic-only' } }) }, loginSessionClient: client });
}
test('unwired login client fails before login and reports an explicit safe cause', async () => {
  const c = connector(null);
  await assert.rejects(() => c.loadApiToken(source, c.credentialContext, account), error => error.code === 'AUTHORIZATION_FAILED' && error.details.cause === 'LOGIN_SESSION_CLIENT_UNAVAILABLE');
});
test('wired password login binds, logs in, waits and claims a token', async () => {
  const calls = [];
  const c = connector({ bindAccount: async () => calls.push('bind'), startLogin: async () => { calls.push('login'); return { status: 'active' }; }, claimAuthResult: async () => { calls.push('claim'); return { apiToken: 'synthetic-token' }; } });
  assert.equal(await c.loadApiToken(source, c.credentialContext, account), 'synthetic-token');
  assert.deepEqual(calls, ['bind', 'login', 'claim']);
});
test('health preserves safe login cause while refusing arbitrary secret-bearing codes', async () => {
  const c = connector(null);
  c.installationHealth = async () => ({ installed: true });
  for (const cause of ['INVALID_CREDENTIALS', 'LOGIN_FRAME_NOT_FOUND', 'LOGIN_SESSION_CLIENT_UNAVAILABLE', 'unsafe credential text']) {
    c.requestJson = async () => { const error = new Error('redacted'); error.code = 'AUTHORIZATION_FAILED'; error.details = { cause }; throw error; };
    const health = await c.accountHealth({ platform: 'bigplayer_h5', config: { baseUrl: 'https://example.invalid' } });
    assert.equal(health.authorized, false);
    assert.equal(health.reason, cause.includes(' ') ? 'AUTHORIZATION_FAILED' : cause);
  }
});
