'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCE_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { LastNightIsolatedStore } = require('../src/lastNightIsolatedStore');
const { runIsolatedAiConsumer } = require('../src/lastNightIsolatedAiConsumer');

test('independent consumer processes isolated jobs and stops on abort', async () => {
  const store = Object.create(LastNightIsolatedStore.prototype);
  store.identity = { port: 43319 };
  let claims = 0, completed = 0;
  store.claimAnalysisJobs = async () => claims++ === 0
    ? [{ id: 'job-1', leaseEpoch: 1, sourceId: SOURCE_ID, boardId: BOARD_ID,
      profile: 'light', content: { title: 'fixture' } }] : [];
  store.completeAnalysisJob = async () => { completed += 1; };
  store.failAnalysisJob = async () => { throw new Error('unexpected failure'); };
  const controller = new AbortController();
  const result = await runIsolatedAiConsumer({ store,
    ai: { configured: () => true, analyzeBatch: async () => [{ sentiment: 'neutral' }] },
    deepPolicy: () => false, signal: controller.signal, pollMs: 10,
    onCycle: cycle => { if (!cycle.jobs) controller.abort(); } });
  assert.deepEqual(result, { status: 'stopped', processed: 1 });
  assert.equal(completed, 1);
  assert.equal(claims, 2);
});

test('shared or production-port stores cannot start the consumer', async () => {
  const controller = new AbortController();
  for (const store of [{ identity: { port: 43319 } },
    Object.assign(Object.create(LastNightIsolatedStore.prototype), { identity: { port: 3306 } })]) {
    await assert.rejects(runIsolatedAiConsumer({ store, signal: controller.signal,
      deepPolicy: () => false }), { code: 'LAST_NIGHT_AI_CONSUMER_CONFIG_INVALID' });
  }
});
