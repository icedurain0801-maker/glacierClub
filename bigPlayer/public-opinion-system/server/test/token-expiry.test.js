const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenClaimExpiry, tokenExpiry } = require('../src/services/tokenExpiry');
const jwt = exp => `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.c2ln`;
test('JWT numeric expiry is display metadata; malformed and opaque tokens stay unknown', () => {
  assert.equal(tokenClaimExpiry(jwt(2000000000)), '2033-05-18T03:33:20.000Z');
  assert.equal(tokenClaimExpiry(JSON.stringify({ access_token: jwt(1000) })), '1970-01-01T00:16:40.000Z');
  for (const secret of ['opaque', 'a.b.c', jwt('2000000000'), jwt(null), jwt(-1), jwt(1e20)]) assert.equal(tokenClaimExpiry(secret), null);
});
test('passwords are omitted, stored UTC expiry wins, decryption failure is unknown', async () => {
  const account = { id: 'qa', platform: 'bigplayer_h5' };
  const summary = { credential_type: 'api_token', has_secret_cipher: 1 };
  const repo = { getCredentialByAccount: async () => ({ secret_cipher: '{"v":2,"aad":true}' }) };
  const options = { credentialCipher: { decrypt: (_, __, opts) => { assert.equal(opts.aad, 'qa:api_token:bigplayer_h5'); return jwt(2000000000); } } };
  assert.equal(await tokenExpiry(repo, account, [{ ...summary, credential_type: 'account_password' }]), null);
  assert.deepEqual(await tokenExpiry(repo, account, [summary], options), { expiresAt: '2033-05-18T03:33:20.000Z', basis: 'token_claim' });
  assert.deepEqual(await tokenExpiry(repo, account, [{ ...summary, expire_at: '2026-10-15 01:02:03' }]), { expiresAt: '2026-10-15T01:02:03.000Z', basis: 'platform' });
  assert.deepEqual(await tokenExpiry(repo, account, [summary]), { expiresAt: null, basis: 'unknown' });
});
test('real HTTP source list returns only expiry metadata', async () => {
  require('../src/runtimeEnv').loadRuntimeEnv = () => false;
  const app = require('../src/app');
  app.baasAccess.enabled = false;
  const source = { id: 'qa-source', platform: 'bigplayer_h5', region_code: 'overseas', default_account_id: 'qa' };
  const account = { id: 'qa', platform: source.platform };
  app.repo.listSources = async () => [source];
  app.repo.listAccounts = async () => [account];
  app.repo.listSourceCapabilities = async () => [];
  app.repo.getSyncStatus = async () => [];
  app.repo.getAccountCredentialSummary = async () => [{ credential_type: 'api_token', has_secret_cipher: 1, expire_at: '2033-05-18 03:33:20' }];
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/public-opinion/sources`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert(body.includes('2033-05-18T03:33:20.000Z'));
    assert(!body.includes('secret_cipher'));
    assert(!body.includes('access_token'));
  } finally { await new Promise(resolve => app.server.close(resolve)); await app.repo.pool.end(); }
});
