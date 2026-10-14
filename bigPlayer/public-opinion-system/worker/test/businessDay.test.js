const test = require('node:test');
const assert = require('node:assert/strict');
const { previousBeijingDay, beijingDayWindow, isBusinessDateComplete, isWithinPublishedWindow } = require('../src/businessDay');

test('previousBeijingDay uses Beijing calendar boundaries regardless of host timezone', () => {
  const window = previousBeijingDay(new Date('2026-08-12T01:30:00.000Z'));
  assert.deepEqual(window, {
    timezone: 'Asia/Shanghai',
    businessDate: '2026-08-11',
    publishedFrom: new Date('2026-08-10T16:00:00.000Z'),
    publishedTo: new Date('2026-08-11T16:00:00.000Z'),
    publishedFromIso: '2026-08-10T16:00:00.000Z',
    publishedToIso: '2026-08-11T16:00:00.000Z'
  });
});

test('previousBeijingDay handles year and leap-day boundaries', () => {
  assert.equal(previousBeijingDay('2026-01-01T00:30:00Z').businessDate, '2025-12-31');
  assert.equal(previousBeijingDay('2024-03-01T02:00:00+08:00').businessDate, '2024-02-29');
});

test('builds an explicit Beijing half-open business-day window and completion gate', () => {
  const window = beijingDayWindow('2026-09-02');
  assert.equal(window.publishedFromIso, '2026-09-01T16:00:00.000Z');
  assert.equal(window.publishedToIso, '2026-09-02T16:00:00.000Z');
  assert.equal(isBusinessDateComplete('2026-09-02', '2026-09-02T15:59:59.999Z'), false);
  assert.equal(isBusinessDateComplete('2026-09-02', '2026-09-02T16:00:00.000Z'), true);
});
test('isWithinPublishedWindow uses a half-open interval and excludes missing dates', () => {
  const window = previousBeijingDay('2026-08-12T02:00:00+08:00');
  assert.equal(isWithinPublishedWindow('2026-08-11T00:00:00+08:00', window), true);
  assert.equal(isWithinPublishedWindow('2026-08-11T23:59:59.999+08:00', window), true);
  assert.equal(isWithinPublishedWindow('2026-08-12T00:00:00+08:00', window), false);
  assert.equal(isWithinPublishedWindow(null, window), false);
});
