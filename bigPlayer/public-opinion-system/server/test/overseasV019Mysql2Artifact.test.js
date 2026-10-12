'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const adapter = require('../../scripts/overseas-v019-mysql2-disabled');
const contract = require('../../scripts/overseas-v019-profile-adapter-contract');
const root = path.resolve(__dirname, '../../../..');
function fixture(text) {
  const dir = fs.mkdtempSync(path.join(root, '.temp', 'v019-mysql2-config-fixture-'));
  const file = path.join(dir, 'synthetic-config.txt');
  fs.writeFileSync(file, text || 'DB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=public_opinion\nDB_USER=isolated-db-user\nDB_PASSWORD=isolated-db-password\nUNRELATED_SECRET=never-output-this\n', { flag: 'wx' });
  return file;
}
const input = file => ({ fixtureFile: file || fixture(), manifestSha256: 'a'.repeat(64) });
function safe(r) { for (const s of ['isolated-db-user', 'isolated-db-password', 'never-output-this', 'isolated-secret-error']) assert.ok(!JSON.stringify(r).includes(s)); assert.equal(r.realConnectionOpened, false); assert.equal(r.realConfigurationRead, false); }
test('actual mysql2 fixed seven-read executor parses real field packets and closes underlying stream', async () => {
  const r = await adapter.runIsolatedMysql2(input());
  assert.equal(r.status, 'ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS', JSON.stringify(r)); assert.equal(r.selects, 7); assert.equal(r.actualMysql2Loaded, true); assert.equal(r.peer.authConsumed, true); assert.equal(r.closed, true); assert.equal(r.peer.destroyed, true); assert.equal(r.destroys, 0);
  assert.deepEqual(r.peer.trace, ['AUTH_RESPONSE', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'COM_QUIT']); assert.equal(r.metadata[0].fields[0].columnType, 8); assert.deepEqual(r.discovery.registry.map(x => x.authStatus), ['authorized', 'unknown', 'unknown']); safe(r);
});
test('real driver SELECT callback has three arguments and ColumnDefinition packets', async () => {
  const mysql = require('mysql2'), peer = require('../../scripts/v019-mysql2-memory-peer').createMemoryPeer({});
  const c = mysql.createConnection({ stream: peer.stream, user: 'isolated-db-user', password: 'isolated-db-password', database: 'public_opinion', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  c.on('error', () => {});
  try {
    await new Promise((resolve, reject) => c.connect(e => e ? reject(e) : resolve()));
    await new Promise((resolve, reject) => c.query({ sql: contract.sqlContract.R1, values: [] }, function (err, rows, packets) { try { assert.equal(arguments.length, 3); assert.equal(err, null); assert.equal(rows[0].port, '3306'); assert.equal(packets[0].constructor.name, 'ColumnDefinition'); assert.equal(packets[0].columnType, 8); assert.equal(packets[0].typeFamily, undefined); assert.equal(typeof rows[0].now_utc, 'string'); resolve(); } catch (e) { reject(e); } }));
  } finally { c.destroy(); peer.stream.destroy(); }
});
test('all driver operation timeouts force underlying destroy and prohibit subsequent commands', async () => {
  const file = fixture();
  for (const at of ['CONNECT', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'END']) {
    const r = await adapter.runIsolatedMysql2({ ...input(file), timeoutMs: 30, fault: { at, hang: true } });
    assert.equal(r.status, 'NO_GO', at); assert.equal(r.destroys, 1, at); assert.equal(r.peer.destroyed, true); assert.equal(r.trace.at(-1), 'DESTROY'); assert.equal(r.reconnectCount, 0); safe(r);
  }
});
test('late protocol results and secret driver errors fail closed', async () => {
  for (const fault of [{ at: 'R1', delayMs: 70 }, { at: 'R3', error: true }]) {
    const r = await adapter.runIsolatedMysql2({ ...input(), timeoutMs: 30, fault });
    assert.equal(r.status, 'NO_GO'); assert.equal(r.peer.destroyed, true); const before = JSON.stringify(r.peer.trace); await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(JSON.stringify(r.peer.trace), before); safe(r);
  }
  const expired = await adapter.runIsolatedMysql2({ ...input(), timeoutMs: 100, totalTimeoutMs: 40, fault: { at: 'CONNECT', delayMs: 70 } });
  assert.equal(expired.status, 'NO_GO'); assert.equal(expired.selects, 0); assert.equal(expired.peer.destroyed, true); safe(expired);
});
test('actual field columnType/duplicate/extra, row caps and date/BIGINT are rejected', async () => {
  const file = fixture();
  for (const fault of [...['type', 'duplicate', 'extra'].map(fieldFault => ({ at: 'R1', fieldFault })), { at: 'R3', rowCount: 3 }, { at: 'R3', rowCount: 0 }, { at: 'R4', expireInMs: 0 }, { at: 'R2', rowPatch: { schedule_version: '9007199254740992' } }, { at: 'R1', rowPatch: { now_utc: '2026-02-30 00:00:00' } }, { at: 'R3', rowPatch: { enabled: '2' } }, { at: 'R4', rowPatch: { source_id: 'other' } }]) {
    const r = await adapter.runIsolatedMysql2({ ...input(file), fault }); assert.equal(r.status, 'NO_GO', JSON.stringify(fault)); assert.equal(r.destroys, 1); safe(r);
  }
});
test('streamed raw and normalized row/query/batch byte boundaries stop before next command', async () => {
  const file = fixture();
  for (const limit of [{ perRowBytes: 1 }, { perQueryBytes: 1 }, { batchBytes: 1 }]) { const r = await adapter.runIsolatedMysql2({ ...input(file), ...limit }); assert.equal(r.status, 'NO_GO'); assert.equal(r.errorCode, 'MYSQL2_BYTES_EXCEEDED'); assert.equal(r.selects, 1); assert.equal(r.peer.destroyed, true); safe(r); }
  const base = await adapter.runIsolatedMysql2(input(file));
  const limits = { perRowBytes: base.maxRowBytes, perQueryBytes: base.maxQueryBytes, batchBytes: Math.max(base.rawBytes, base.normalizedBytes) };
  assert.equal((await adapter.runIsolatedMysql2({ ...input(file), ...limits })).status, 'ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS');
  for (const k of Object.keys(limits)) assert.equal((await adapter.runIsolatedMysql2({ ...input(file), ...limits, [k]: limits[k] - 1 })).errorCode, 'MYSQL2_BYTES_EXCEEDED');
});
test('END callback alone is insufficient; expiry during close wait prevents discovery', async () => {
  const r = await adapter.runIsolatedMysql2({ ...input(), timeoutMs: 900, fault: { at: 'END', delayMs: 600, expireInMs: 400 } });
  assert.equal(r.status, 'NO_GO'); assert.equal(r.errorCode, 'MYSQL2_IDENTITY_HOLD'); assert.equal(r.closed, true); assert.equal(r.discovery, undefined); assert.equal(r.destroys, 0); assert.equal(r.peer.destroyed, true); safe(r);
});
test('mysql2 native query timeout does not itself destroy transport', async () => {
  const mysql = require('mysql2'), peer = require('../../scripts/v019-mysql2-memory-peer').createMemoryPeer({ at: 'R1', hang: true });
  const c = mysql.createConnection({ stream: peer.stream, user: 'isolated-db-user', password: 'isolated-db-password', database: 'public_opinion' }); c.on('error', () => {});
  try {
    await new Promise((resolve, reject) => c.connect(e => e ? reject(e) : resolve()));
    await new Promise((resolve, reject) => c.query({ sql: contract.sqlContract.R1, timeout: 20 }, err => { try { assert.equal(err.code, 'PROTOCOL_SEQUENCE_TIMEOUT'); assert.equal(peer.stream.destroyed, false); resolve(); } catch (e) { reject(e); } }));
  } finally { c.destroy(); peer.stream.destroy(); }
});
test('existing file reader shape tested only on synthetic files; no fallback/duplicates/wrong target', async () => {
  const normal = fs.readFileSync(fixture(), 'utf8');
  for (const text of [normal.replace('DB_PASSWORD=isolated-db-password\n', ''), normal + 'DB_USER=duplicate\n', normal.replace('DB_HOST=127.0.0.1', 'DB_HOST=remote'), normal.replace('DB_USER=isolated-db-user', 'DB_USER=wrong'), normal.replace('DB_PORT=3306', 'DB_PORT=3307')]) {
    const r = await adapter.runIsolatedMysql2(input(fixture(text))); assert.equal(r.status, 'NO_GO'); assert.equal(r.discovery, undefined); safe(r);
  }
});
test('production entries reject before inspecting arguments and fixture entry rejects real paths/hooks', async () => {
  assert.throws(() => require('node:dns').lookup('localhost', () => {}), { code: 'V019_OFFLINE_DNS_DENIED' });
  assert.throws(() => require('node:net').connect(3306, '127.0.0.1'), { code: 'V019_OFFLINE_NETWORK_DENIED' });
  let touched = 0; const inputWithGetter = {}; Object.defineProperty(inputWithGetter, 'secret', { get() { touched++; throw Error('secret'); } });
  assert.throws(() => adapter.runProductionMysql2(inputWithGetter), { code: 'REAL_MYSQL2_EXECUTOR_DISABLED' }); assert.throws(() => adapter.readProductionConfiguration(inputWithGetter), { code: 'REAL_CONFIGURATION_READER_DISABLED' }); assert.equal(touched, 0);
  await assert.rejects(adapter.runIsolatedMysql2(inputWithGetter)); assert.equal(touched, 0);
  const r = await adapter.runIsolatedMysql2({ ...input(), fixtureFile: contract.configurationPath }); assert.equal(r.status, 'NO_GO'); assert.equal(r.errorCode, 'MYSQL2_FIXTURE_PATH_REJECTED'); assert.equal(r.actualMysql2Loaded, false);
  await assert.rejects(adapter.runIsolatedMysql2({ ...input(), provider: () => {} }));
});
