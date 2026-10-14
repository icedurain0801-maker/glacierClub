'use strict';
// Accident prevention for trusted synthetic tests; not a hostile-JS sandbox.
const deny = () => { throw Object.assign(new Error('V019_OFFLINE_NETWORK_DENIED'), { code: 'V019_OFFLINE_NETWORK_DENIED' }); };
const lock = (object, key) => Object.defineProperty(object, key, { value: deny, writable: false, configurable: false });
lock(globalThis, 'fetch');
for (const name of ['node:http', 'node:https']) for (const key of ['request', 'get']) lock(require(name), key);
for (const key of ['connect', 'createConnection']) lock(require('node:net'), key);
lock(require('node:net').Socket.prototype, 'connect');
lock(require('node:tls'), 'connect');
lock(require('node:dgram'), 'createSocket');
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) lock(require('node:child_process'), key);
lock(require('node:worker_threads'), 'Worker');
require('node:module').syncBuiltinESMExports();
