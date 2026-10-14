'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCE_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { prepareLastNightToken, createLastNightConnector } = require('../src/lastNightIsolatedAuth');

const account = { id: '00000000-0000-0000-0000-000000000001',
  source_id: SOURCE_ID, platform: 'bigplayer_h5' };
const source = { id: SOURCE_ID, platform: 'bigplayer_h5',
  config: { boardId: BOARD_ID,
    baseUrl: 'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=1' } };
const token = { id: 'token-id', source_id: SOURCE_ID, account_id: account.id,
  credential_type: 'api_token', status: 'active', secret_cipher: '"ciphertext"' };

test('password presence blocks token fallback before decrypt or HTTP', async () => {
  let decrypts = 0;
  const cipher = { decrypt() { decrypts += 1; return 'token'; } };
  for (const status of ['active', 'expired', 'unconfigured']) {
    await assert.rejects(prepareLastNightToken({ snapshot: { source, account,
      credentials: [{ ...token, credential_type: 'account_password', status }, token] },
    cipher }), { code: 'LAST_NIGHT_PASSWORD_LOGIN_UNAVAILABLE' });
  }
  assert.equal(decrypts, 0);
});

test('token-only context has no login or refresh path; 401 fails after one request', async () => {
  let decrypts = 0, requests = 0;
  const credentialContext = await prepareLastNightToken({ snapshot: { source, account,
    credentials: [token] }, cipher: { decrypt() { decrypts += 1; return 'fixture-token'; } } });
  assert.equal(decrypts, 1);
  assert.equal(typeof credentialContext.load, 'undefined');
  const connector = createLastNightConnector({ credentialContext,
    fetchImpl: async () => { requests += 1; return { ok: false, status: 401,
      url: 'https://club-en.q1.com/api/club/v1/auth/user/context' }; } });
  await assert.rejects(connector.discoverFeeds({ source, account }),
    error => error?.cause?.code === 'UNAUTHORIZED');
  assert.equal(requests, 1);
  assert.equal(connector.loginSessionClient, null);
  assert.equal(connector.authRefreshCoordinator, null);
});

test('missing or unusable token fails before connector creation', async () => {
  await assert.rejects(prepareLastNightToken({ snapshot: { source, account,
    credentials: [] } }), { code: 'LAST_NIGHT_TOKEN_MISSING' });
  await assert.rejects(prepareLastNightToken({ snapshot: { source, account,
    credentials: [{ ...token, secret_cipher: null, secret_ref: 'unresolved-ref' }] },
    cipher: { decrypt() { throw new Error('must not decrypt'); } } }),
  { code: 'CREDENTIAL_SECRET_MISSING' });
});
