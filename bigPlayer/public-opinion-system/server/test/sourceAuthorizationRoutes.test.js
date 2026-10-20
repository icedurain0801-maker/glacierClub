const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('HTTP draft authorization is read-only and configuration writes require its matching receipt', async () => {
  const app = require('../src/app');
  const source = { id: 'isolated-auth-source', game_id: 'g', community_id: 'c', region_code: 'domestic', platform: 'bigplayer_h5',
    display_name: 'isolated', frequency_seconds: 3600, config: JSON.stringify({ baseUrl: 'https://club.q1.com/?gameId=1', boardId: '2' }) };
  const account = { id: 'isolated-auth-account', source_id: source.id, platform: source.platform };
  const restores = [];
  const stub = (object, key, value) => { const old = object[key]; object[key] = value; restores.push(() => { object[key] = old; }); };
  let writes = 0, authorized = true;
  const calls = [];
  let tokenExchanges = 0, configuration;
  stub(require('../src/services/bigPlayerTokenRenewal').BigPlayerTokenRenewal.prototype, 'exchange', async () => { tokenExchanges++; return { apiToken: 'isolated-new-token', expiresAt: '2030-01-01T00:00:00Z' }; });
  stub(app.baasAccess, 'enabled', false);
  stub(app.repo, 'listSources', async () => [source]);
  stub(app.repo, 'getDefaultAccount', async () => account);
  stub(app.connectors.bigplayer_h5, 'allowedHosts', ['club.q1.com']);
  stub(app.credentialContext, 'load', async (_, type) => {
    if (type === 'account_password') throw Object.assign(new Error('missing'), { code: 'CREDENTIAL_NOT_FOUND' });
    return { apiToken: 'isolated-token' };
  });
  stub(app.connectors.bigplayer_h5, 'accountHealth', async () => { calls.push('auth'); return { authorized, reason: 'UNAUTHORIZED' }; });
  stub(app.connectors.bigplayer_h5, 'detectCapabilities', async () => { calls.push('capabilities'); return { posts: { status: 'available' }, comments: { status: 'available' } }; });
  stub(app.repo, 'updateSourceConfiguration', async (_, patch) => { writes++; configuration = patch; return { source }; });
  stub(app.repo, 'updateSourceAuth', async () => {});
  stub(app.repo, 'updateAccount', async () => {});
  stub(app.repo, 'upsertSourceCapability', async () => {});
  stub(app.repo, 'listAccounts', async () => []);
  stub(app.repo, 'getSyncStatus', async () => []);
  stub(app.repo, 'listSourceCapabilities', async () => []);
  stub(app.repo, 'getCredentialByAccount', async () => null);
  try {
    app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
    const base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion/sources/${source.id}`;
    const request = (endpoint, body, method = 'POST') => fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const body = { displayName: 'isolated', frequencySeconds: 3600, boardId: '2', baseUrl: 'https://club.q1.com/?gameId=1', credential: {} };
    const blocked = await request('/configuration', body, 'PATCH');
    assert.equal(blocked.status, 400); assert.equal((await blocked.json()).error.code, 'AUTH_CHECK_REQUIRED'); assert.equal(writes, 0);
    authorized = false;
    const rejected = await request('/check-authorization', { boardId: body.boardId, baseUrl: body.baseUrl });
    assert.equal(rejected.status, 200); assert.equal((await rejected.json()).data.authorizationCheckToken, null);
    assert.deepEqual(calls, ['auth']); assert.equal(writes, 0);
    authorized = true; calls.length = 0;
    const checked = await request('/check-authorization', { boardId: body.boardId, baseUrl: body.baseUrl });
    assert.equal(checked.status, 200);
    const result = (await checked.json()).data;
    assert(result.authorizationCheckToken); assert.deepEqual(calls, ['auth', 'capabilities']); assert.equal(writes, 0);
    const changed = await request('/configuration', { ...body, boardId: '3', authorizationCheckToken: result.authorizationCheckToken }, 'PATCH');
    assert.equal(changed.status, 400); assert.equal(writes, 0);
    const saved = await request('/configuration', { ...body, authorizationCheckToken: result.authorizationCheckToken }, 'PATCH');
    assert.equal(saved.status, 200, await saved.text()); assert.equal(writes, 1);
    process.env.CREDENTIAL_ENC_KEY ||= Buffer.alloc(32, 9).toString('base64');
    const tokenBody = { ...body, authMode: 'api_token' };
    const tokenChecked = await request('/check-authorization', { boardId: body.boardId, baseUrl: body.baseUrl, authMode: 'api_token' });
    const receipt = (await tokenChecked.json()).data.authorizationCheckToken;
    assert.ok(receipt);
    const tokenSaved = await request('/configuration', { ...tokenBody, authorizationCheckToken: receipt }, 'PATCH');
    assert.equal(tokenSaved.status, 200, await tokenSaved.text());
    assert.equal(tokenExchanges, 1); assert.equal(configuration.authMode, 'api_token');
    assert.equal(configuration.credential.expireAt, '2030-01-01T00:00:00Z');
    const plain = require('../src/integrations/credentialCipher').decrypt(configuration.credentialCipher, process.env, { aad: `${account.id}:api_token:bigplayer_h5` });
    assert.equal(plain, 'isolated-new-token');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    restores.reverse().forEach(restore => restore());
    await app.repo.pool.end();
  }
});
