'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cutover } = require('../../../scripts/windows-services/worker-only-cutover-transaction');

function fixture({ gate, readiness = async () => {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-cutover-gate-'));
  const file = name => path.join(root, name);
  for (const [name, bytes] of [['worker.exe', 'old-wrapper'], ['worker.xml', 'old-xml'], ['api.exe', 'api-wrapper'], ['api.xml', 'api-xml'], ['candidate.exe', 'new-wrapper']]) fs.writeFileSync(file(name), bytes);
  const calls = [];
  const worker = {
    wrapper: file('worker.exe'), xml: file('worker.xml'), state: () => 'Running',
    stop: async () => calls.push('stop'),
    awaitMutationSafe: async stage => { calls.push(`gate:${stage}`); await gate(stage, calls); },
    install: async () => calls.push('install'), start: async () => calls.push('start')
  };
  return {
    root, calls, worker,
    api: { wrapper: file('api.exe'), xml: file('api.xml'), state: () => 'Running' },
    candidate: { wrapper: file('candidate.exe'), xml: 'new-xml', release: 'candidate-release' },
    readiness,
    bytes: () => ({ wrapper: fs.readFileSync(worker.wrapper), xml: fs.readFileSync(worker.xml) })
  };
}

test('stop may return while locked; transaction waits for the mutation gate before copying', async () => {
  let f;
  f = fixture({ gate: async (stage, calls) => {
    assert.equal(stage, 'cutover');
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('old-wrapper'), xml: Buffer.from('old-xml') });
    calls.push('locked-then-released');
    await new Promise(resolve => setTimeout(resolve, 5));
  } });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(f.calls.slice(0, 3), ['stop', 'gate:cutover', 'locked-then-released']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('new-wrapper'), xml: Buffer.from('new-xml') });
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('initial mutation gate timeout fails without touching candidate or rollback target bytes', async () => {
  const f = fixture({ gate: async () => { throw Object.assign(new Error('locked'), { code: 'WORKER_MUTATION_GATE_TIMEOUT' }); } });
  const before = f.bytes();
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'MANUAL_STOP_REQUIRED');
    assert.equal(result.error, 'WORKER_MUTATION_GATE_TIMEOUT');
    assert.equal(result.rollbackSkipped, true);
    assert.deepEqual(f.bytes(), before);
    assert.deepEqual(f.calls, ['stop', 'gate:cutover']);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rollback waits for the same gate and restores bytes only after it passes', async () => {
  const stages = [];
  const f = fixture({ gate: async stage => stages.push(stage), readiness: async () => { throw new Error('readiness failed'); } });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'ROLLED_BACK');
    assert.deepEqual(stages, ['cutover', 'rollback']);
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('old-wrapper'), xml: Buffer.from('old-xml') });
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('rollback gate timeout leaves switched bytes untouched by rollback writes', async () => {
  const f = fixture({
    gate: async stage => { if (stage === 'rollback') throw Object.assign(new Error('still locked'), { code: 'WORKER_MUTATION_GATE_TIMEOUT' }); },
    readiness: async () => { throw new Error('readiness failed'); }
  });
  try {
    const result = await cutover(f);
    assert.equal(result.status, 'MANUAL_STOP_REQUIRED');
    assert.equal(result.rollbackError, 'WORKER_MUTATION_GATE_TIMEOUT');
    assert.deepEqual(f.bytes(), { wrapper: Buffer.from('new-wrapper'), xml: Buffer.from('new-xml') });
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
