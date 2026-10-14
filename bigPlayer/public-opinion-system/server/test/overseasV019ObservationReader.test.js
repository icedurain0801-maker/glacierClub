'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const reader = require('../../scripts/overseas-v019-isolated-reader-contract');
const fixture = require('./fixtures/overseasObservationIdentity');
const input = (mode = 'sample', extra = {}) => {
  const identity = fixture(mode);
  return { identity, accountRows: [identity.account], cipherEnvelope: { fixture: true, apiToken: 'synthetic-reader-api-token', refreshToken: 'synthetic-reader-refresh-token' }, ...extra };
};
test('sample and auth-only exact SELECT budgets and short rollback transactions', async () => {
  for (const [mode, count, limit] of [['sample', 24, 32], ['auth-only', 9, 17]]) {
    const f = input(mode), { capability } = await reader.prepareFixtureReader(f), secret = await reader.loadFixtureSecret(capability);
    for (let n = 0; n < count; n++) await reader.verifyFixtureDispatch(capability, secret, f.identity, f.cipherEnvelope);
    const e = reader.finishFixtureReader(capability);
    assert.equal(e.selectCount, limit); assert.equal(e.limit, limit); assert.equal(e.trace.filter(x => x === 'ROLLBACK').length, count + 2);
    assert.equal(e.reconnectCount, 0); assert.equal(e.realSqlExecuted, false);
    assert.ok(!JSON.stringify(e).includes('synthetic-reader')); assert.ok(!JSON.stringify(e).includes('fixture-account'));
  }
});
test('wrong instance rejected after first SELECT without subsequent read', async () => {
  await assert.rejects(reader.prepareFixtureReader(input('sample', { target: { port: 3307, server_id: 1, version: '10.4.14-MariaDB', database_name: 'public_opinion', now_utc: '2026-10-10T00:00:00Z' } })), e => {
    assert.equal(e.code, 'READER_TARGET_REJECTED'); assert.equal(e.evidence.selectCount, 1); assert.equal(e.evidence.destroyed, true);
    assert.ok(!e.evidence.trace.includes('ROLLBACK')); return true;
  });
});
test('multiple accounts, mismatched account and multiple credential hold without secret read', async () => {
  for (const mutate of [f => f.accountRows.push({ ...f.identity.account, id: 'other' }), f => { f.accountRows[0] = { ...f.identity.account, id: 'other' }; }, f => f.identity.credentials.push({ ...f.identity.credentials[0], id: 'other' })]) {
    const f = input(); mutate(f); await assert.rejects(reader.prepareFixtureReader(f));
  }
});
test('all R1-R8 and V1 timeout destroy dedicated connection; no query or rollback after destroy', async () => {
  for (let atSelect = 1; atSelect <= 9; atSelect++) {
    const f = input('sample', { queryTimeoutMs: 10, faults: [{ atSelect, hang: true, cancelFails: true }] });
    let cap;
    try {
      cap = (await reader.prepareFixtureReader(f)).capability;
      const secret = await reader.loadFixtureSecret(cap);
      await reader.verifyFixtureDispatch(cap, secret, f.identity, f.cipherEnvelope);
      assert.fail('timeout required');
    } catch (e) {
      assert.equal(e.code, 'READER_QUERY_TIMEOUT'); const evidence = cap ? reader.finishFixtureReader(cap) : e.evidence;
      assert.equal(evidence.selectCount, atSelect); assert.equal(evidence.destroyed, true); assert.equal(evidence.cancelFailed, true);
      assert.equal(evidence.trace.at(-1), 'DESTROY'); assert.equal(evidence.reconnectCount, 0);
      if (cap) { await assert.rejects(reader.loadFixtureSecret(cap)); assert.deepEqual(reader.finishFixtureReader(cap), evidence); }
    }
  }
});
test('metadata SQL returned field values and column/type mutations are rejected', async () => {
  for (const [atSelect, rowPatch] of [[2, { config: '{}' }], [3, { source_id: 'other' }], [4, { status: 'inactive' }], [5, { url_hash: 'wrong' }], [6, { region_code: 'domestic' }], [7, { status: 'disabled' }], [2, { enabled: '1' }], [3, { extra: 'column' }]]) {
    await assert.rejects(reader.prepareFixtureReader(input('sample', { faults: [{ atSelect, rowPatch }] })), e => {
      assert.ok(['READER_BINDING_DRIFT', 'READER_SCHEMA_REJECTED'].includes(e.code)); assert.equal(e.evidence.selectCount, atSelect); return true;
    });
  }
  await assert.rejects(reader.prepareFixtureReader(input('sample', { faults: [{ atSelect: 5, schemaMismatch: true }] })), { code: 'READER_SCHEMA_REJECTED' });
});
test('R8 identity, cipher replacement, status and expiry are bound', async () => {
  for (const rowPatch of [{ id: 'other' }, { secret_cipher: 'replacement' }, { expire_at: '2020-01-01' }, { status: 'inactive' }]) {
    const f = input('sample', { faults: [{ atSelect: 8, rowPatch }] }), { capability } = await reader.prepareFixtureReader(f);
    await assert.rejects(reader.loadFixtureSecret(capability), { code: 'READER_BINDING_DRIFT' });
    assert.equal(reader.finishFixtureReader(capability).destroyed, true);
  }
});
test('V1 flat schema binds target, config, account, registry, cipher and active credential count', async () => {
  for (const rowPatch of [{ port: 3307 }, { config: '{}' }, { account_id: 'other' }, { site_id: 'other' }, { site_auth_status: 'unknown' }, { internal_cipher_sha256: 'replacement' }, { active_credential_count: 2 }, { credential_updated_at: 'changed' }]) {
    const f = input('sample', { faults: [{ atSelect: 9, rowPatch }] }), { capability } = await reader.prepareFixtureReader(f), secret = await reader.loadFixtureSecret(capability);
    await assert.rejects(reader.verifyFixtureDispatch(capability, secret, f.identity, f.cipherEnvelope), { code: 'READER_BINDING_DRIFT' });
    assert.equal(reader.finishFixtureReader(capability).trace.at(-1), 'DESTROY');
  }
});
test('opaque handles cannot copy or cross readers; secret load single use and changed envelope stops', async () => {
  const f = input(), a = await reader.prepareFixtureReader(f), b = await reader.prepareFixtureReader(f), secret = await reader.loadFixtureSecret(a.capability);
  await assert.rejects(reader.loadFixtureSecret({ ...a.capability })); await assert.rejects(reader.loadFixtureSecret(a.capability), { code: 'READER_SECRET_ALREADY_LOADED' });
  await assert.rejects(reader.verifyFixtureDispatch(b.capability, secret, f.identity, f.cipherEnvelope), { code: 'READER_SECRET_CAPABILITY_REJECTED' });
  await assert.rejects(reader.verifyFixtureDispatch(a.capability, secret, f.identity, { ...f.cipherEnvelope, apiToken: 'replacement' }), { code: 'READER_BINDING_DRIFT' });
  reader.finishFixtureReader(b.capability);
});
test('SELECT limit, absolute deadline and production fail closed', async () => {
  const f = input('auth-only'), { capability } = await reader.prepareFixtureReader(f), secret = await reader.loadFixtureSecret(capability);
  for (let n = 0; n < 9; n++) await reader.verifyFixtureDispatch(capability, secret, f.identity, f.cipherEnvelope);
  await assert.rejects(reader.verifyFixtureDispatch(capability, secret, f.identity, f.cipherEnvelope), { code: 'READER_SELECT_BUDGET' });
  const short = input('sample', { totalTimeoutMs: 5, faults: [{ atSelect: 1, delayMs: 30 }] }); await assert.rejects(reader.prepareFixtureReader(short));
  assert.throws(reader.prepareProductionReader, { code: 'REAL_READER_DISABLED' });
  const expiring = input(); expiring.identity.credentials[0].expiresAt = new Date(Date.now() + 200).toISOString();
  const a = await reader.prepareFixtureReader(expiring), token = await reader.loadFixtureSecret(a.capability);
  await new Promise(resolve => setTimeout(resolve, 210));
  await assert.rejects(reader.verifyFixtureDispatch(a.capability, token, expiring.identity, expiring.cipherEnvelope), { code: 'READER_CREDENTIAL_REJECTED' });
  const ended = reader.finishFixtureReader(a.capability); assert.equal(ended.selectCount, 8); assert.equal(ended.destroyed, true);
  await assert.rejects(reader.verifyFixtureDispatch(a.capability, token, expiring.identity, expiring.cipherEnvelope));
});
test('data-only input rejects getters, symbols, functions and extra array keys without getter call', async () => {
  let called = 0; const f = input(); Object.defineProperty(f.identity, 'trap', { get() { called++; return 'x'; } });
  await assert.rejects(reader.prepareFixtureReader(f)); assert.equal(called, 0);
  for (const mutate of [f => { f.faults = []; f.faults.extra = 1; }, f => { f.identity[Symbol('x')] = 1; }, f => { f.target = () => {}; }]) { const f = input(); mutate(f); await assert.rejects(reader.prepareFixtureReader(f)); }
});
