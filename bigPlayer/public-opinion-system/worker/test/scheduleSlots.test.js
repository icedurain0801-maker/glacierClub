const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ALLOWED_FREQUENCIES,
  computeSchedule,
  collectionWindowForSlot
} = require('../src/scheduleSlots');

const utc = value => new Date(value);

test('01:59/02:00/02:01 Beijing obey the fixed daily anchor', () => {
  const effectiveAt = utc('2025-12-31T18:00:01.000Z');

  const before = computeSchedule({ now: utc('2026-01-01T17:59:00.000Z'), effectiveAt, frequencySeconds: 86400 });
  assert.equal(before.dueSlotAt, null);
  assert.equal(before.nextSlotAt, '2026-01-01T18:00:00.000Z');

  const exact = computeSchedule({ now: utc('2026-01-01T18:00:00.000Z'), effectiveAt, frequencySeconds: 86400 });
  assert.equal(exact.dueSlotAt, '2026-01-01T18:00:00.000Z');
  assert.equal(exact.triggerType, 'scheduled');

  const after = computeSchedule({ now: utc('2026-01-01T18:01:00.000Z'), effectiveAt, frequencySeconds: 86400 });
  assert.equal(after.dueSlotAt, '2026-01-01T18:00:00.000Z');
  assert.equal(after.triggerType, 'scheduled_catchup');
});

test('all approved frequencies stay anchored without completion-time drift', () => {
  assert.deepEqual(ALLOWED_FREQUENCIES, [900, 3600, 21600, 43200, 86400]);
  const now = utc('2026-01-01T06:10:00.000Z'); // Beijing 14:10
  const effectiveAt = utc('2025-12-30T18:00:01.000Z');
  const expected = new Map([
    [900, ['2026-01-01T06:00:00.000Z', '2026-01-01T06:15:00.000Z']],
    [3600, ['2026-01-01T06:00:00.000Z', '2026-01-01T07:00:00.000Z']],
    [21600, ['2026-01-01T06:00:00.000Z', '2026-01-01T12:00:00.000Z']],
    [43200, ['2026-01-01T06:00:00.000Z', '2026-01-01T18:00:00.000Z']],
    [86400, ['2025-12-31T18:00:00.000Z', '2026-01-01T18:00:00.000Z']]
  ]);

  for (const [frequencySeconds, [dueSlotAt, nextSlotAt]] of expected) {
    const result = computeSchedule({ now, effectiveAt, frequencySeconds });
    assert.equal(result.dueSlotAt, dueSlotAt, `due slot for ${frequencySeconds}`);
    assert.equal(result.nextSlotAt, nextSlotAt, `next slot for ${frequencySeconds}`);
  }
});

test('multiple missed slots yield only the most recent unprocessed slot', () => {
  const result = computeSchedule({
    now: utc('2026-01-01T21:20:00.000Z'), // Beijing 05:20
    effectiveAt: utc('2025-12-31T18:00:01.000Z'),
    lastProcessedScheduledAt: utc('2026-01-01T18:00:00.000Z'),
    frequencySeconds: 3600
  });
  assert.equal(result.dueSlotAt, '2026-01-01T21:00:00.000Z');
  assert.equal(result.triggerType, 'scheduled_catchup');
  assert.equal(result.nextSlotAt, '2026-01-01T22:00:00.000Z');
});

test('already processed latest slot returns no due slot and keeps next slot', () => {
  const result = computeSchedule({
    now: utc('2026-01-01T21:20:00.000Z'),
    effectiveAt: utc('2025-12-31T18:00:01.000Z'),
    lastProcessedScheduledAt: utc('2026-01-01T21:00:00.000Z'),
    frequencySeconds: 3600
  });
  assert.equal(result.dueSlotAt, null);
  assert.equal(result.triggerType, null);
  assert.equal(result.nextSlotAt, '2026-01-01T22:00:00.000Z');
});

test('02:00 first slot uses previous Beijing natural-day window across year boundary', () => {
  const slot = utc('2025-12-31T18:00:00.000Z'); // Beijing 2026-01-01 02:00
  assert.deepEqual(collectionWindowForSlot(slot), {
    windowStartAt: '2025-12-30T16:00:00.000Z',
    windowEndAt: '2025-12-31T16:00:00.000Z'
  });
  assert.equal(collectionWindowForSlot(utc('2025-12-31T19:00:00.000Z')), null);
});

test('schedule_effective_at is exclusive and never backfills pre-change slots', () => {
  const beforeEffective = computeSchedule({
    now: utc('2026-01-01T06:10:00.000Z'),
    effectiveAt: utc('2026-01-01T06:05:00.000Z'),
    frequencySeconds: 3600
  });
  assert.equal(beforeEffective.dueSlotAt, null);
  assert.equal(beforeEffective.nextSlotAt, '2026-01-01T07:00:00.000Z');

  const exactEffective = computeSchedule({
    now: utc('2026-01-01T06:00:00.000Z'),
    effectiveAt: utc('2026-01-01T06:00:00.000Z'),
    frequencySeconds: 3600
  });
  assert.equal(exactEffective.dueSlotAt, null);
  assert.equal(exactEffective.nextSlotAt, '2026-01-01T07:00:00.000Z');
});

test('cross-day next slot and leap-year boundary are calculated in UTC output', () => {
  const endOfBusinessDay = computeSchedule({
    now: utc('2024-02-29T17:59:59.000Z'), // Beijing 2024-03-01 01:59:59
    effectiveAt: utc('2024-02-28T18:00:01.000Z'),
    frequencySeconds: 43200
  });
  assert.equal(endOfBusinessDay.dueSlotAt, '2024-02-29T06:00:00.000Z');
  assert.equal(endOfBusinessDay.nextSlotAt, '2024-02-29T18:00:00.000Z');
});

test('rejects unsupported frequencies and invalid dates', () => {
  assert.throws(() => computeSchedule({ frequencySeconds: 3600 }), /now/);
  assert.throws(() => computeSchedule({ now: null, frequencySeconds: 3600 }), /now/);
  assert.throws(() => computeSchedule({ now: utc('2026-01-01T00:00:00Z'), frequencySeconds: 60 }), /frequencySeconds/);
  assert.throws(() => computeSchedule({ now: 'not-a-date', frequencySeconds: 3600 }), /now/);
});
