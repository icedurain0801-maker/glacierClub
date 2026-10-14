const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { runBacklogIteration, runAnalysisLoop } = require('../src/analysisWorker');
const repo = () => ({ async acquireAdvisoryLock(name, timeout) { assert.equal(name, 'po-analysis-consumer'); assert.equal(timeout, 0); return true; }, async releaseAdvisoryLock() {} });

test('busy cross-process gate fails closed without consumption', async () => {
  let calls = 0;
  assert.deepEqual(await runBacklogIteration({ repo: { async acquireAdvisoryLock() { return false; } } }, async () => { calls += 1; }), { skipped: true, reason: 'analysis_scope_active' });
  assert.equal(calls, 0);
});

test('one analysis iteration is exclusive and releases the gate on failure', async () => {
  let finish; let released = 0;
  const deps = { repo: { ...repo(), async releaseAdvisoryLock() { released += 1; } } };
  const first = runBacklogIteration(deps, () => new Promise(resolve => { finish = resolve; }));
  await new Promise(setImmediate);
  assert.deepEqual(await runBacklogIteration(deps), { skipped: true, reason: 'already_running' });
  finish({ analyzed: 1 }); await first;
  await assert.rejects(runBacklogIteration(deps, async () => { throw new Error('provider failure'); }));
  assert.equal(released, 2);
});

test('empty queue stays resident and consumes later jobs without quality cleanup', async () => {
  const controller = new AbortController(); let iterations = 0; let sleeps = 0; let cleanup = 0;
  await runAnalysisLoop({ repo: { ...repo(), async cleanupInvalidQualityCandidates() { cleanup += 1; } } }, {
    signal: controller.signal, log() {},
    processFn: async () => ({ analyzed: ++iterations === 1 ? 0 : 1 }),
    sleepFn: async () => { if (++sleeps === 2) controller.abort(); }
  });
  assert.equal(iterations, 2); assert.equal(cleanup, 0);
});

test('collection paths enqueue without inline AI or tail consumption', () => {
  const script = fs.readFileSync(require.resolve('../src/worker'), 'utf8');
  const scan = script.slice(script.indexOf('async function runOnce'), script.indexOf('const interval ='));
  assert.doesNotMatch(scan, /await processAnalysisBacklog/);
  assert.match(script, /const downstream = await enqueueDailyAnalysis\(sourceDeps, source, result.entries, analysisScope\)/);
  assert.match(script, /const downstream = await enqueueDailyAnalysis\(deps, source, entries\)/);
});
