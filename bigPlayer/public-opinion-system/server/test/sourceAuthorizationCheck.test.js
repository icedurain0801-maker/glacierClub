const test = require('node:test');
const assert = require('node:assert/strict');
const { SourceAuthorizationCheck, prepare } = require('../src/services/sourceAuthorizationCheck');
const source = { id: 'source-1', platform: 'bigplayer_h5', region_code: 'domestic', config: { boardId: '2', baseUrl: 'https://club.q1.com/?gameId=1' } };
const account = { id: 'account-1', source_id: source.id };
const missing = () => Object.assign(new Error('missing'), { code: 'CREDENTIAL_NOT_FOUND' });
function setup(authorized = true) {
  const calls = [];
  const credentialContext = { load: async (_, type) => { if (type === 'account_password') throw missing(); return { apiToken: 'isolated-old-token' }; } };
  const connector = {
    authRefreshCoordinator: {},
    accountHealth: async function (input) { calls.push(['auth', input.config.baseUrl, await this.credentialContext.loadApiToken()]); return { authorized, reason: 'UNAUTHORIZED' }; },
    detectCapabilities: async function () { calls.push(['capabilities']); return { posts: { status: 'available' }, comments: { status: 'configured', untested: true } }; }
  };
  return { calls, connector, credentialContext };
}
test('authorization precedes capability checks for every draft site; no saved credentials are replaced', async () => {
  const prepared = prepare(source, { siteUrls: ['https://club.q1.com/?gameId=1', 'https://club.q1.com/?gameId=2'], credential: { credentialType: 'api_token', secret: 'isolated-new-token' } }, ['club.q1.com']);
  const checker = new SourceAuthorizationCheck();
  const deps = setup();
  const result = await checker.check({ source, account, prepared, ...deps });
  assert.equal(result.authStatus, 'authorized');
  assert.deepEqual(deps.calls.map(x => x[0]), ['auth', 'capabilities', 'auth', 'capabilities']);
  assert(deps.calls.filter(x => x[0] === 'auth').every(x => x[2] === 'isolated-new-token'));
  assert.equal(Object.keys(result.capabilities).length, 2);
  assert.deepEqual(source.config, { boardId: '2', baseUrl: 'https://club.q1.com/?gameId=1' });
});
test('failed authorization stops before capability detection and never grants a save receipt', async () => {
  const deps = setup(false);
  const prepared = prepare(source, {}, ['club.q1.com']);
  const checker = new SourceAuthorizationCheck();
  const result = await checker.check({ source, account, prepared, ...deps });
  assert.equal(result.authStatus, 'unauthorized');
  assert.deepEqual(deps.calls.map(x => x[0]), ['auth']);
  assert.throws(() => checker.require(null, source, account, prepared), { code: 'AUTH_CHECK_REQUIRED' });
});
test('save receipts reject changed config, changed credentials, foreign source and expiration', () => {
  let now = 1;
  const checker = new SourceAuthorizationCheck({ now: () => now, ttl: 100 });
  const prepared = prepare(source, { credential: { credentialType: 'api_token', secret: 'isolated-token' } }, ['club.q1.com']);
  const token = checker.issue(source, account, prepared, {});
  assert(checker.require(token, source, account, prepared));
  for (const changed of [{ ...prepared, config: { ...prepared.config, boardId: '3' } }, { ...prepared, credential: { ...prepared.credential, secret: 'different' } }]) {
    assert.throws(() => checker.require(token, source, account, changed), { code: 'AUTH_CHECK_REQUIRED' });
  }
  assert.throws(() => checker.require(token, { ...source, id: 'other' }, account, prepared), { code: 'AUTH_CHECK_REQUIRED' });
  now = 102;
  assert.throws(() => checker.require(token, source, account, prepared), { code: 'AUTH_CHECK_REQUIRED' });
});
test('unsafe URL, duplicate sites and masked tokens fail before any probe', () => {
  for (const body of [{ siteUrls: ['https://evil.example/'] }, { siteUrls: ['https://club.q1.com/', 'https://club.q1.com/'] }, { credential: { credentialType: 'api_token', secret: '******' } }]) {
    assert.throws(() => prepare(source, body, ['club.q1.com']));
  }
});
test('account-password draft uses an isolated login binding and is removed after failure', async () => {
  const checker = new SourceAuthorizationCheck();
  const prepared = prepare(source, { credential: { credentialType: 'account_password', account: 'isolated-user', password: 'isolated-password' } }, ['club.q1.com']);
  const deps = setup();
  let previewBinding;
  deps.connector.loginSessionClient = {
    bindAccount: async input => { previewBinding = input; assert.notEqual(input.accountId, account.id); assert.equal(checker.resolvePreview(input).account, 'isolated-user'); },
    revokeSession: async input => { assert.equal(input.accountId, previewBinding.accountId); }
  };
  deps.connector.accountHealth = async function () { await this.loginSessionClient.bindAccount({ accountId: account.id, sourceId: source.id }); return { authorized: false }; };
  const result = await checker.check({ source, account, prepared, ...deps });
  assert.equal(result.authStatus, 'unauthorized');
  assert.equal(checker.resolvePreview(previewBinding), null);
});
