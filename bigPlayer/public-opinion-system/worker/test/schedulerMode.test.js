'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { schedulerMode, requireExplicitSchedulerMode } = require('../src/schedulerMode');
const { runQ1Daily, legacyScheduledGate: q1LegacyScheduledGate } = require('../src/q1DailyJob');
const { legacyScheduledGate: dailyLegacyScheduledGate } = require('../src/dailyRunner');

test('scheduler mode normalizes supported values and keeps library fallback off', () => {
  assert.equal(schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: ' ENABLED ' }), 'enabled');
  assert.equal(schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: 'shadow' }), 'shadow');
  assert.equal(schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: 'off' }), 'off');
  assert.equal(schedulerMode({}), 'off');
  assert.equal(schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: 'unexpected' }), 'off');
});

test('worker startup requires an explicit valid scheduler mode', () => {
  assert.equal(requireExplicitSchedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: ' ENABLED ' }), 'enabled');
  assert.throws(
    () => requireExplicitSchedulerMode({}),
    error => error.code === 'UNIFIED_SCHEDULER_MODE_UNSET'
  );
  assert.throws(
    () => requireExplicitSchedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: 'unexpected' }),
    error => error.code === 'UNIFIED_SCHEDULER_MODE_INVALID'
  );
});

test('enabled unified mode makes the legacy scheduled entry yield before side effects', async () => {
  let productionCalls = 0;
  let crawlerCalls = 0;
  const result = await runQ1Daily({
    unifiedSchedulerMode: ' ENABLED ',
    runnerOptions: { productionFactory: async () => { productionCalls += 1; return {}; } },
    crawler: async () => { crawlerCalls += 1; }
  });
  assert.deepEqual(result, {
    status: 'skipped',
    reasonCode: 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS'
  });
  assert.equal(productionCalls, 0);
  assert.equal(crawlerCalls, 0);
});

test('off and shadow modes keep both legacy scheduled entrypoints active', () => {
  for (const mode of ['off', 'shadow']) {
    assert.equal(q1LegacyScheduledGate({ mode }), null);
    assert.equal(dailyLegacyScheduledGate({ mode }), null);
  }
});

test('worker entrypoint fails closed before scanning when scheduler mode is invalid', () => {
  const entrypoint = path.resolve(__dirname, '..', 'src', 'worker.js');
  const child = spawnSync(process.execPath, [entrypoint], {
    encoding: 'utf8',
    env: { ...process.env, UNIFIED_SOURCE_SCHEDULER_MODE: 'unexpected' },
    timeout: 5000
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /UNIFIED_SCHEDULER_MODE_INVALID/);
  assert.doesNotMatch(child.stdout, /scanning due sources/);
});

function entrypointEnv(mode, overrides = {}) {
  const env = { ...process.env, ...overrides };
  if (mode == null) delete env.UNIFIED_SOURCE_SCHEDULER_MODE;
  else env.UNIFIED_SOURCE_SCHEDULER_MODE = mode;
  return env;
}

for (const [label, mode, code] of [
  ['missing', null, 'UNIFIED_SCHEDULER_MODE_UNSET'],
  ['invalid', 'unexpected', 'UNIFIED_SCHEDULER_MODE_INVALID']
]) {
  test(`q1 scheduled entrypoint fails closed when scheduler mode is ${label}`, () => {
    const entrypoint = path.resolve(__dirname, '..', 'src', 'q1DailyJob.js');
    const child = spawnSync(process.execPath, [entrypoint, '--dry-run'], {
      encoding: 'utf8',
      env: entrypointEnv(mode, { Q1_SOURCE_ID: 'must-not-run', Q1_DAILY_DRY_RUN: '1' }),
      timeout: 5000
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, new RegExp(code));
    assert.doesNotMatch(child.stdout, /"dryRun":true|must-not-run/);
  });

  test(`daily scheduled entrypoint fails closed when scheduler mode is ${label}`, () => {
    const entrypoint = path.resolve(__dirname, '..', 'src', 'dailyRunner.js');
    const child = spawnSync(process.execPath, [entrypoint, '--dry-run'], {
      encoding: 'utf8',
      env: entrypointEnv(mode),
      timeout: 5000
    });
    assert.equal(child.status, 1);
    assert.match(child.stderr, new RegExp(code));
    assert.doesNotMatch(child.stdout, /"dryRun":true|preflight|collecting/);
  });
}

test('q1 scheduled entrypoint yields when unified mode is enabled', () => {
  const entrypoint = path.resolve(__dirname, '..', 'src', 'q1DailyJob.js');
  const child = spawnSync(process.execPath, [entrypoint], {
    encoding: 'utf8',
    env: {
      ...process.env,
      UNIFIED_SOURCE_SCHEDULER_MODE: 'enabled',
      Q1_SOURCE_ID: 'gate-test-source',
      Q1_DAILY_DRY_RUN: ''
    },
    timeout: 5000
  });
  assert.equal(child.status, 0);
  assert.deepEqual(JSON.parse(child.stdout.trim()), {
    status: 'skipped',
    reasonCode: 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS'
  });
});

test('daily scheduled entrypoint yields when unified mode is enabled', () => {
  const entrypoint = path.resolve(__dirname, '..', 'src', 'dailyRunner.js');
  const child = spawnSync(process.execPath, [entrypoint], {
    encoding: 'utf8',
    env: { ...process.env, UNIFIED_SOURCE_SCHEDULER_MODE: 'enabled' },
    timeout: 5000
  });
  assert.equal(child.status, 0);
  assert.deepEqual(JSON.parse(child.stdout.trim()), {
    status: 'skipped',
    reasonCode: 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS'
  });
});
