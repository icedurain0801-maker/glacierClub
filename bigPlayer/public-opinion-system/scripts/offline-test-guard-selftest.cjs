'use strict';
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const localRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
let checked = 0;
const rejected = (fn, code) => { assert.throws(fn, error => error.code === code); checked++; };
async function main() {
  for (const name of ['mysql2', 'mysql2/promise']) {
    const driver = localRequire(name), pool = driver.createPool();
    for (const fn of [() => pool.query('SELECT 1'), () => pool.execute('SELECT 1'), () => pool.getConnection(), () => driver.createConnection(), () => driver.connect()]) rejected(fn, 'OFFLINE_TEST_DB_DENIED');
    await pool.end();
    assert.throws(() => { driver.createPool = () => {}; }, TypeError); checked++;
  }
  rejected(() => process.loadEnvFile('dummy'), 'OFFLINE_TEST_ENV_DENIED');
  assert.throws(() => { process.loadEnvFile = () => {}; }, TypeError); checked++;
  const net = require('node:net'), socket = new net.Socket();
  rejected(() => socket.connect({ host: '127.0.0.1', port: 1 }), 'OFFLINE_TEST_SOCKET_DENIED'); socket.destroy();
  rejected(() => net.createServer().listen(0), 'OFFLINE_TEST_SOCKET_DENIED');
  rejected(() => require('node:tls').connect({ host: '127.0.0.1', port: 1 }), 'OFFLINE_TEST_SOCKET_DENIED');
  rejected(() => require('node:dgram').createSocket('udp4'), 'OFFLINE_TEST_SOCKET_DENIED');
  rejected(() => require('node:dns').lookup('invalid.example', () => {}), 'OFFLINE_TEST_SOCKET_DENIED');
  rejected(() => require('node:dns/promises').resolve('invalid.example'), 'OFFLINE_TEST_SOCKET_DENIED');
  const cp = require('node:child_process');
  for (const fn of [() => cp.spawnSync(process.execPath, ['-e', '']), () => cp.execSync('unused'), () => new cp.ChildProcess().spawn({}), () => new (require('node:worker_threads').Worker)('unused')]) rejected(fn, 'OFFLINE_TEST_CHILD_DENIED');
  const esmNet = await import('node:net'), esmCp = await import('node:child_process');
  rejected(() => esmNet.connect({ host: '127.0.0.1', port: 1 }), 'OFFLINE_TEST_SOCKET_DENIED');
  rejected(() => esmCp.spawnSync(process.execPath, ['-e', '']), 'OFFLINE_TEST_CHILD_DENIED');
  console.log(JSON.stringify({ guardSelftest: 'PASS', checked, actualIoAttempted: false }));
}
main().catch(error => { console.error('OFFLINE_GUARD_SELFTEST_FAILED', error.stack); process.exitCode = 1; });
