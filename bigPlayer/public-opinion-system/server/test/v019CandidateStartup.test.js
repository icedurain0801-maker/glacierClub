'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const root = process.env.PO_ISOLATED_CANDIDATE_ROOT;
if (!root) throw new Error('PO_ISOLATED_CANDIDATE_ROOT required');

test('candidate require(app) performs no DB, external I/O, listen, timers, migration or consumer startup', () => {
  const originalLoad = Module._load;
  const originalFetch = globalThis.fetch;
  const originalLoadEnv = process.loadEnvFile;
  const originalInterval = globalThis.setInterval;
  const originalTimeout = globalThis.setTimeout;
  const calls = { pools: 0, queries: 0, external: 0, timers: 0, listen: 0 };
  const forbidden = () => { calls.queries++; throw new Error('startup database I/O prohibited'); };
  const loaded = [];
  Module._load = function(request, parent, isMain) {
    loaded.push(request);
    if (request === 'mysql2/promise') return { createPool() { calls.pools++; return { query: forbidden, execute: forbidden, getConnection: forbidden }; } };
    if (request === 'node:http') {
      const http = originalLoad.call(this, request, parent, isMain);
      return { ...http, createServer: (...args) => { const server = http.createServer(...args); server.listen = () => { calls.listen++; throw new Error('startup listen prohibited'); }; return server; } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  globalThis.fetch = () => { calls.external++; throw new Error('startup external I/O prohibited'); };
  process.loadEnvFile = () => {}; // Never load production or local credentials.
  globalThis.setInterval = globalThis.setTimeout = () => { calls.timers++; throw new Error('startup timer prohibited'); };
  try {
    const app = require(path.join(root, 'server/src/app.js'));
    assert.equal(typeof app.handler, 'function');
    assert.deepEqual(calls, { pools: 1, queries: 0, external: 0, timers: 0, listen: 0 });
    assert.ok(!loaded.some(name => /db[\\/]migrate|worker[\\/]|consumer/i.test(name)));
  } finally {
    Module._load = originalLoad;
    globalThis.fetch = originalFetch;
    process.loadEnvFile = originalLoadEnv;
    globalThis.setInterval = originalInterval;
    globalThis.setTimeout = originalTimeout;
  }
});
