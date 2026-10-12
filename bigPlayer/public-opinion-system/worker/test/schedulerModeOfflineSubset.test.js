'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { schedulerMode, requireExplicitSchedulerMode } = require('../src/schedulerMode');
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
