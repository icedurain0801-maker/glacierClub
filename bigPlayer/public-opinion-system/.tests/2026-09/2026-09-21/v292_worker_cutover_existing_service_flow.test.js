'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cutover } = require('../../../scripts/windows-services/worker-only-cutover-transaction');

function fixture({ registered, readiness = async () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-cutover-service-flow-'));
  const file = name => path.join(root, name);
  for (const [name, bytes] of [
    ['worker.exe', 'old-wrapper'],
    ['worker.xml', 'old-xml'],
    ['api.exe', 'api-wrapper'],
    ['api.xml', 'api-xml'],
    ['candidate.exe', 'new-wrapper']
  ]) fs.writeFileSync(file(name), bytes);

  const calls = [];
  const worker = {
    wrapper: file('worker.exe'),
    xml: file('worker.xml'),
    state: () => 'Running',
    isRegistered: async () => registered,
    serviceExists: async () => registered,
    stop: async () => calls.push('stop'),
    awaitMutationSafe: async stage => calls.push(`gate:${stage}`),
    install: async () => calls.push('install'),
    start: async () => calls.push('start')
  };
  return {
    root,
    calls,
    worker,
    api: { wrapper: file('api.exe'), xml: file('api.xml'), state: () => 'Running' },
    candidate: { wrapper: file('candidate.exe'), xml: 'new-xml', release: 'candidate-release' },
    readiness,
    bytes: () => ({ wrapper: fs.readFileSync(file('worker.exe')), xml: fs.readFileSync(file('worker.xml')) })
  };
}

test('registered PublicOpinionWorker uses stop/copy/start without install', async () => {
  const f = fixture({ registered: true });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(f.calls, ['stop', 'gate:cutover', 'start']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('new-wrapper'), xml: Buffer.from('new-xml') });
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('unregistered PublicOpinionWorker installs once after copy and before start', async () => {
  const f = fixture({ registered: false });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(f.calls, ['stop', 'gate:cutover', 'install', 'start']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('new-wrapper'), xml: Buffer.from('new-xml') });
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('registered-service rollback also avoids install and restores Worker bytes', async () => {
  const f = fixture({ registered: true, readiness: async () => { throw new Error('readiness failed'); } });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'ROLLED_BACK');
    assert.deepEqual(f.calls, ['stop', 'gate:cutover', 'start', 'stop', 'gate:rollback', 'start']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('old-wrapper'), xml: Buffer.from('old-xml') });
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('unregistered install failure rolls back with the same install rule and keeps API untouched', async () => {
  const f = fixture({ registered: false });
  let installCalls = 0;
  f.worker.install = async () => {
    installCalls += 1;
    f.calls.push('install');
    if (installCalls === 1) throw Object.assign(new Error('install failed'), { code: 'WIN_SW_INSTALL_FAILED' });
  };
  const apiBefore = { wrapper: fs.readFileSync(f.api.wrapper), xml: fs.readFileSync(f.api.xml) };
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'ROLLED_BACK');
    assert.deepEqual(f.calls, ['stop', 'gate:cutover', 'install', 'stop', 'gate:rollback', 'install', 'start']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('old-wrapper'), xml: Buffer.from('old-xml') });
    assert.deepEqual(fs.readFileSync(f.api.wrapper), apiBefore.wrapper);
    assert.deepEqual(fs.readFileSync(f.api.xml), apiBefore.xml);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
