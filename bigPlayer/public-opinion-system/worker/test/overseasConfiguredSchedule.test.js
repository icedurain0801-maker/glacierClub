'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuredSlot, nextScheduledAt } = require('../src/overseasProductionDaily');
const source = { frequency_seconds: 21600, schedule_version: 1, schedule_effective_at: '2026-09-11 08:35:49.524' };
test('six-hour execution uses all four Beijing slots and preserves coverage', () => {
  for (const hour of [2, 8, 14, 20]) {
    const now = new Date(Date.UTC(2026, 9, 12, hour - 8, 1));
    const slot = configuredSlot(source, {}, now);
    assert.equal(slot.scheduledAt, new Date(Date.UTC(2026, 9, 12, hour - 8)).toISOString());
    assert.equal(slot.windowStart, '2026-10-10T16:00:00.000Z');
    assert.equal(slot.windowEnd, slot.scheduledAt);
    assert.equal(slot.kind, undefined);
    assert.equal(+new Date(nextScheduledAt(slot, source)) - +new Date(slot.scheduledAt), 21600000);
  }
});
test('legacy daily next time cannot skip configured six-hour catchup', () => {
  const state = { last_scheduled_at: '2026-10-11 18:00:00.000', next_scheduled_at: '2026-10-12 18:00:00.000' };
  const slot = configuredSlot(source, state, new Date('2026-10-12T12:01:00Z'));
  assert.equal(slot.scheduledAt, '2026-10-12T12:00:00.000Z');
  assert.equal(nextScheduledAt(slot, source), '2026-10-12T18:00:00.000Z');
});
test('completed slot is not re-created on an early wakeup', () => {
  assert.equal(configuredSlot(source, { last_scheduled_at: '2026-10-12 12:00:00.000' }, new Date('2026-10-12T12:05:00Z')), null);
});
test('all supported frequencies use configuration and cross month boundary in UTC', () => {
  for (const frequency of [900, 3600, 21600, 43200, 86400]) {
    const configured = { ...source, frequency_seconds: frequency };
    const slot = configuredSlot(configured, {}, new Date('2026-10-31T18:00:00Z'));
    assert.equal(slot.scheduledAt, '2026-10-31T18:00:00.000Z');
    assert.equal(slot.windowStart, '2026-10-30T16:00:00.000Z');
    assert.equal(+new Date(nextScheduledAt(slot, configured)) - +new Date(slot.scheduledAt), frequency * 1000);
  }
});
test('invalid frequency and slots before effective time are rejected', () => {
  assert.throws(() => configuredSlot({ ...source, frequency_seconds: 7 }, {}, new Date()), RangeError);
  assert.equal(configuredSlot({ ...source, schedule_effective_at: '2026-10-12 12:00:00.000' }, {}, new Date('2026-10-12T12:01:00Z')), null);
});
