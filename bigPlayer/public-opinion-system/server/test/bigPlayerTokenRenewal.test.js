'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerTokenRenewal, tokenMode } = require('../src/services/bigPlayerTokenRenewal');
const cipher = require('../src/integrations/credentialCipher');
const now = Date.parse('2026-10-19T00:00:00Z');
const jwt = (exp = now + 9 * 86400000, tourist = '0') => `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(exp / 1000), IsTourist: tourist })).toString('base64url')}.sig`;
const source = { id: 's', platform: 'bigplayer_h5', enabled: 1, config: { baseUrl: 'https://club.q1.com/?gameId=12&gameVersion=CN&languageId=1', boardId: '2' } };
const account = { id: 'a', source_id: 's', platform: 'bigplayer_h5', metadata: { bigplayerAuthMode: 'api_token' } };
const user = { account: { id: 123 }, boards: [{ id: 2 }] };
function fixture({ next = jwt(), after = user, code = 0, network = false, origin } = {}) {
  const calls = [];
  return { calls, service: new BigPlayerTokenRenewal({ now: () => now, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (network) throw new Error(`secret URL ${url}`);
    return { ok: true, url: origin || String(url), json: async () => url.pathname.endsWith('/login/token') ? { code, data: { token: next } } : { code: 0, data: calls.length === 1 ? user : after } };
  } }) };
}
test('exchanges and verifies remote identity and board before returning token', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.exchange(source, jwt(now + 3600000))).apiToken, jwt());
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url.searchParams.get('gameId'), '12');
  assert.equal(calls[1].url.searchParams.get('languageId'), '1');
  assert.equal(calls[1].options.redirect, 'manual');
});
for (const [name, options, code] of [
  ['tourist response', { code: 1 }, 'TOKEN_RENEWAL_TOURIST'],
  ['tourist JWT', { next: jwt(undefined, '1') }, 'TOKEN_RENEWAL_TOURIST'],
  ['identity change', { after: { ...user, account: { id: 456 } } }, 'TOKEN_RENEWAL_IDENTITY_CHANGED'],
  ['missing identity', { after: { boards: [{ id: 2 }] } }, 'TOKEN_RENEWAL_IDENTITY_CHANGED'],
  ['missing board', { after: { ...user, boards: [] } }, 'TOKEN_RENEWAL_BOARD_MISSING'],
  ['expired token', { next: jwt(now - 1000) }, 'TOKEN_RENEWAL_EXPIRY_INVALID'],
  ['shortened expiry', { next: jwt(now + 1800000) }, 'TOKEN_RENEWAL_EXPIRY_INVALID'],
  ['unknown expiry', { next: 'opaque-token' }, 'TOKEN_RENEWAL_EXPIRY_INVALID'],
  ['network secret redaction', { network: true }, 'TOKEN_RENEWAL_REQUEST_FAILED'],
  ['cross origin', { origin: 'https://evil.example' }, 'TOKEN_RENEWAL_REJECTED']
]) test(name, async () => {
  const { service } = fixture(options);
  await assert.rejects(service.exchange(source, jwt(now + 3600000)), e => e.code === code && !e.message.includes('secret URL') && !e.message.includes('e30.'));
});
test('unapproved source cannot send credentials', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.exchange({ ...source, config: { baseUrl: 'https://evil.example', boardId: '2' } }, jwt()), { code: 'TOKEN_RENEWAL_SITE_INVALID' });
  assert.equal(calls.length, 0);
});
test('chain exchange accepts the returned token and retains identity', async () => {
  const { service } = fixture();
  const first = await service.exchange(source, jwt(now + 3600000));
  const second = await service.exchange(source, first.apiToken);
  assert.equal(second.expiresAt, first.expiresAt);
});
test('explicit token selection takes precedence over retained password', () => {
  assert.equal(tokenMode(account, true), true);
  assert.equal(tokenMode({ metadata: { bigplayerAuthMode: 'account_password' } }), false);
  assert.equal(tokenMode({}, true), false);
  assert.equal(tokenMode({}, false), true);
});
test('connector bypasses retained password after explicit token selection', async () => {
  const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
  const context = { load: async () => { throw new Error('password must not be loaded'); }, loadApiToken: async () => 'fixture-token' };
  const connector = new BigPlayerH5Connector({}, { credentialContext: context });
  assert.equal(await connector.loadApiToken(source, context, account), 'fixture-token');
});
function renewalFixture({ changed = false, expiry = now + 3600000, password = false, mode = 'api_token' } = {}) {
  const env = { CREDENTIAL_ENC_KEY: Buffer.alloc(32, 7).toString('base64') };
  const a = { ...account, metadata: { bigplayerAuthMode: mode } };
  const encrypted = cipher.encrypt(jwt(expiry), env, { aad: 'a:api_token:bigplayer_h5' });
  const writes = []; let released = 0; let committed = false; let rolledBack = false;
  const conn = { async beginTransaction() {}, async query(sql, args) {
    if (sql.startsWith('SELECT id,config')) return [[{ ...source }]];
    if (sql.startsWith('SELECT id,metadata')) return [[a]];
    if (sql.startsWith('SELECT secret_cipher')) return [[{ secret_cipher: changed ? '{}' : encrypted }]];
    writes.push([sql, args]); return [{}];
  }, async commit() { committed = true; }, async rollback() { rolledBack = true; }, release() {} };
  const repo = { acquireAdvisoryLock: async () => true, releaseAdvisoryLock: async () => { released++; }, getAccount: async () => a,
    getCredentialByAccount: async (_, type) => type === 'account_password' ? (password ? { status: 'active' } : null) : { id: 'c', status: 'active', secret_cipher: encrypted }, pool: { getConnection: async () => conn } };
  const { service } = fixture(); service.repo = repo; service.env = env;
  return { service, writes, state: () => ({ released, committed, rolledBack }) };
}
test('due renewal commits encrypted token and expiry together', async () => {
  const f = renewalFixture();
  assert.equal((await f.service.renew({ source, account })).refreshed, true);
  assert.equal(f.writes.length, 3);
  assert.equal(f.state().committed, true);
  assert.equal(f.state().released, 1);
  assert.ok(!f.writes[0][1][0].includes(jwt()));
});
test('concurrent configuration changes roll back without replacing credential', async () => {
  const f = renewalFixture({ changed: true });
  await assert.rejects(f.service.renew({ source, account }), { code: 'TOKEN_RENEWAL_CONFIGURATION_CHANGED' });
  assert.equal(f.writes.length, 0); assert.equal(f.state().rolledBack, true); assert.equal(f.state().released, 1);
});
test('not due token and password mode never call exchange', async () => {
  for (const options of [{ expiry: now + 5 * 86400000 }, { password: true, mode: 'account_password' }]) {
    const f = renewalFixture(options);
    f.service.exchange = () => { throw new Error('unexpected exchange'); };
    assert.equal((await f.service.renew({ source, account })).skipped, true);
    assert.equal(f.writes.length, 0);
  }
});
test('scan errors preserve credentials and store only a safe failure code', async () => {
  const writes = []; const s = new BigPlayerTokenRenewal({ now: () => now, repo: { listAccounts: async () => [account], listSources: async () => [source], query: async (...args) => writes.push(args) } });
  s.renew = async () => { throw new Error('private token'); };
  await s.runDue(); await s.runDue();
  assert.equal(writes.length, 1); assert.equal(writes[0][1][0], 'TOKEN_RENEWAL_FAILED');
  assert.ok(!writes[0][0].includes('secret_cipher='));
});
