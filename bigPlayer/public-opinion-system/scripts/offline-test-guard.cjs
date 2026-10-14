'use strict';
// Accident-prevention for trusted tests, not a sandbox for hostile JavaScript.
const { createRequire, syncBuiltinESMExports } = require('node:module');
const path = require('node:path');
const counters = Object.create(null);
const writeDenied = require('node:fs').writeSync.bind(require('node:fs'));
const deny = code => function denied() { counters[code]=(counters[code]||0)+1; writeDenied(2,'\nOFFLINE_GUARD_DENIED:'+code+'\n'); throw Object.assign(new Error(code), { code }); };
const emit = process.stdout.write.bind(process.stdout);
process.on('exit', () => emit('\nOFFLINE_GUARD_DENIALS:'+JSON.stringify(counters)+'\n'));
const lock = (obj, key, value) => Object.defineProperty(obj, key, { value, writable: false, configurable: false, enumerable: true });
const dbDenied = deny('OFFLINE_TEST_DB_DENIED');
const inert = () => {
  const pool = { query: dbDenied, execute: dbDenied, getConnection: dbDenied,
    end: async () => {}, on: () => pool, promise: () => pool };
  return Object.freeze(pool);
};
const localRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
for (const name of ['mysql2', 'mysql2/promise']) {
  const driver = localRequire(name);
  lock(driver, 'createPool', inert);
  for (const key of ['createConnection', 'connect', 'createPoolCluster']) lock(driver, key, dbDenied);
}
lock(process, 'loadEnvFile', deny('OFFLINE_TEST_ENV_DENIED'));
const socketDenied = deny('OFFLINE_TEST_SOCKET_DENIED');
const net = require('node:net');
lock(net.Socket.prototype, 'connect', socketDenied);
lock(net.Server.prototype, 'listen', socketDenied);
for (const key of ['connect', 'createConnection']) lock(net, key, socketDenied);
lock(require('node:tls'), 'connect', socketDenied);
const udp = require('node:dgram');
lock(udp, 'createSocket', socketDenied);
lock(udp.Socket.prototype, 'send', socketDenied);
for (const dns of [require('node:dns'), require('node:dns/promises')]) {
  for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') lock(dns, key, socketDenied);
  if (dns.Resolver) for (const key of Object.getOwnPropertyNames(dns.Resolver.prototype)) {
    if (/^(resolve|reverse)/.test(key)) lock(dns.Resolver.prototype, key, socketDenied);
  }
}
const cp = require('node:child_process');
const childDenied = deny('OFFLINE_TEST_CHILD_DENIED');
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) lock(cp, key, childDenied);
lock(cp.ChildProcess.prototype, 'spawn', childDenied);
lock(require('node:worker_threads'), 'Worker', childDenied);
syncBuiltinESMExports();
