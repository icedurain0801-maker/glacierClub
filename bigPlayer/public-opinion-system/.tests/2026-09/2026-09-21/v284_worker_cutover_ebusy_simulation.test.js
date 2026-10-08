'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cutover } = require('../../../scripts/windows-services/worker-only-cutover-transaction');

function fixture({ gate, readiness = async () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-cutover-ebusy-'));
  const file = name => path.join(root, name);
  for (const [name, bytes] of [
    ['worker.exe', 'old-wrapper'],
    ['worker.xml', 'old-xml'],
    ['api.exe', 'api-wrapper'],
    ['api.xml', 'api-xml'],
    ['candidate.exe', 'new-wrapper']
  ]) fs.writeFileSync(file(name), bytes);

  const state = { wrapperAlive: true, nodeAlive: true, exclusive: false };
  const calls = [];
  const worker = {
    wrapper: file('worker.exe'),
    xml: file('worker.xml'),
    state: () => 'Running',
    stop: async () => calls.push('stop-returned-while-running'),
    awaitMutationSafe: async stage => {
      calls.push(`gate:${stage}`);
      await gate({ stage, state, calls });
    },
    install: async () => calls.push('install'),
    start: async () => calls.push('start')
  };
  return {
    root,
    state,
    calls,
    worker,
    api: { wrapper: file('api.exe'), xml: file('api.xml'), state: () => 'Running' },
    candidate: { wrapper: file('candidate.exe'), xml: 'new-xml', release: 'candidate-release' },
    readiness,
    bytes: () => ({ wrapper: fs.readFileSync(file('worker.exe')), xml: fs.readFileSync(file('worker.xml')) })
  };
}

test('wrapper or Node still alive after stop blocks copy with simulated EBUSY', async () => {
  for (const liveProcess of ['wrapperAlive', 'nodeAlive']) {
    const fixtureState = fixture({
      gate: async ({ state }) => {
        if (state.wrapperAlive || state.nodeAlive || !state.exclusive) {
          throw Object.assign(new Error(`${liveProcess} still owns the target`), { code: 'EBUSY' });
        }
      }
    });
    fixtureState.state.wrapperAlive = liveProcess === 'wrapperAlive';
    fixtureState.state.nodeAlive = liveProcess === 'nodeAlive';
    const before = fixtureState.bytes();
    try {
      const result = await cutover(fixtureState);
      assert.equal(result.status, 'MANUAL_STOP_REQUIRED');
      assert.equal(result.error, 'EBUSY');
      assert.deepEqual(fixtureState.bytes(), before);
      assert.deepEqual(fixtureState.calls, ['stop-returned-while-running', 'gate:cutover']);
    } finally {
      fs.rmSync(fixtureState.root, { recursive: true, force: true });
    }
  }
});

test('copy is allowed only after wrapper and Node exit and target files become exclusive', async () => {
  const fixtureState = fixture({
    gate: async ({ state, calls }) => {
      if (state.wrapperAlive || state.nodeAlive || !state.exclusive) {
        calls.push('EBUSY');
        state.wrapperAlive = false;
        state.nodeAlive = false;
        state.exclusive = true;
        throw Object.assign(new Error('target still busy'), { code: 'EBUSY' });
      }
    }
  });
  try {
    const result = await cutover(fixtureState);
    assert.equal(result.status, 'MANUAL_STOP_REQUIRED');
    assert.equal(result.error, 'EBUSY');
    assert.deepEqual(fixtureState.bytes(), { wrapper: Buffer.from('old-wrapper'), xml: Buffer.from('old-xml') });

    const second = await cutover({ ...fixtureState, calls: fixtureState.calls, worker: { ...fixtureState.worker, awaitMutationSafe: async stage => { fixtureState.calls.push(`gate:${stage}:exclusive`); assert.equal(fixtureState.state.wrapperAlive, false); assert.equal(fixtureState.state.nodeAlive, false); assert.equal(fixtureState.state.exclusive, true); } } });
    assert.equal(second.status, 'PASS');
    assert.deepEqual(fixtureState.bytes(), { wrapper: Buffer.from('new-wrapper'), xml: Buffer.from('new-xml') });
    assert.ok(fixtureState.calls.includes('gate:cutover:exclusive'));
  } finally {
    fs.rmSync(fixtureState.root, { recursive: true, force: true });
  }
});

test('mutation gate timeout leaves both worker artifacts unchanged', async () => {
  const fixtureState = fixture({
    gate: async () => { throw Object.assign(new Error('EBUSY until timeout'), { code: 'WORKER_MUTATION_GATE_TIMEOUT' }); }
  });
  const before = fixtureState.bytes();
  try {
    const result = await cutover(fixtureState);
    assert.equal(result.status, 'MANUAL_STOP_REQUIRED');
    assert.equal(result.error, 'WORKER_MUTATION_GATE_TIMEOUT');
    assert.equal(result.rollbackSkipped, true);
    assert.deepEqual(fixtureState.bytes(), before);
    assert.equal(fixtureState.calls.includes('install'), false);
    assert.equal(fixtureState.calls.includes('start'), false);
  } finally {
    fs.rmSync(fixtureState.root, { recursive: true, force: true });
  }
});
