const { test } = require('node:test');
const assert = require('node:assert/strict');
const cipher = require('../src/integrations/credentialCipher');
const { BaasDingTalk } = require('../src/services/baasDingTalk');
const { selectRenewedToken } = require('../src/services/baasDataClient');
const env = { CREDENTIAL_ENC_KEY: 'ab'.repeat(32) };
const aad = 'public-opinion:baas-dingtalk:authorization:v1';
const now = Date.parse('2026-10-14T06:00:00Z');
const token = (sub, exp = now / 1000 + 3600) => `fixture.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`;
const previous = token('admin-one', now / 1000 + 1000);
const renewed = token('admin-one');
const config = value => ({ tokenCipher: cipher.encrypt(value, env, { aad }), authorizedAt: new Date(now).toISOString() });

test('data reads use newer encrypted authorization for the same principal', () => {
  assert.equal(selectRenewedToken(previous, config(renewed), now - 1000, env, now), renewed);
});
test('other principals, expired or damaged credentials and older authorizations cannot replace data identity', () => {
  for (const value of [token('another-admin'), token('admin-one', now / 1000 - 1), 'malformed']) {
    assert.equal(selectRenewedToken(previous, config(value), now - 1000, env, now), previous);
  }
  assert.equal(selectRenewedToken(previous, config(renewed), now + 1000, env, now), previous);
  assert.equal(selectRenewedToken(previous, { ...config(renewed), authorizedAt: 'invalid' }, now - 1000, env, now), previous);
  assert.equal(selectRenewedToken(previous, config(renewed), now - 1000, {}, now), previous);
});
test('only an existing same-principal verified admin delegation can renew', async () => {
  const service = new BaasDingTalk({ env });
  service.read = async () => config(previous);
  let calls = 0;
  service.authorize = async (value, identity) => { assert.equal(value, renewed); assert.equal(identity.id, 'admin-one'); calls++; };
  for (const identity of [{ id: 'admin-one', roles: ['viewer'] }, { id: 'other', roles: ['admin'] }, { id: 'admin-one', roles: ['admin'], pendingRoleMapping: true }]) {
    assert.equal(await service.renewExistingAuthorization(renewed, identity), false);
  }
  const identity = { id: 'admin-one', roles: ['admin'] };
  assert.equal(await service.renewExistingAuthorization(previous, identity), false);
  assert.equal(calls, 0);
  assert.equal(await service.renewExistingAuthorization(renewed, identity), true);
  assert.equal(calls, 1);
  service.read = async () => ({});
  assert.equal(await service.renewExistingAuthorization(renewed, identity), false);
});
test('renewal still requires platform identity validation before any encrypted write', async () => {
  const service = new BaasDingTalk({ env, requestImpl: async () => { throw Object.assign(new Error('rejected'), { code: 'BAAS_DINGTALK_HTTP_401' }); } });
  service.read = async () => config(previous);
  service.change = async () => assert.fail('must not persist rejected token');
  await assert.rejects(service.renewExistingAuthorization(renewed, { id: 'admin-one', roles: ['admin'] }), { code: 'BAAS_DINGTALK_HTTP_401' });
});
