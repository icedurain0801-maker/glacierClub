'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { configuration, dueCheck, recoveryDecision } = require('../src/sourceCollectionCheck');
const source = { id: 's', enabled: 1, game_enabled: 1, community_status: 'enabled', auth_status: 'authorized', platform: 'bigplayer_h5', frequency_seconds: 21600 };
test('daily source checks only 02:02; six-hour source checks each own slot plus two minutes', () => {
  for (const hour of [2, 8, 14, 20]) {
    const now = new Date(Date.UTC(2026, 9, 13, hour - 8, 2));
    assert.equal(dueCheck(source, now), new Date(+now - 120000).toISOString());
    assert.equal(Boolean(dueCheck({ ...source, frequency_seconds: 86400 }, now)), hour === 2);
  }
});
test('frequency changes immediately reject stale triggers and include new slots', () => {
  assert.equal(dueCheck({ ...source, frequency_seconds: 86400 }, new Date('2026-10-13T06:02:00Z')), null);
  assert.equal(dueCheck({ ...source, frequency_seconds: 3600 }, new Date('2026-10-13T07:02:00Z')), '2026-10-13T07:00:00.000Z');
  assert.equal(dueCheck(source, new Date('2026-10-13T06:00:00Z')), null);
  assert.equal(dueCheck(source, new Date('2026-10-13T06:04:00Z')), null);
});
test('supported frequencies and TapTap custom daily time produce corresponding check plans', () => {
  for (const frequency of [900, 3600, 21600, 43200, 86400]) assert.equal(configuration({ ...source, frequency_seconds: frequency }).frequencySeconds, frequency);
  const custom = { ...source, platform: 'taptap', frequency_seconds: 86400, config: { scheduleTime: '23:59' } };
  assert.equal(configuration(custom).checkTime, '00:01');
  assert.equal(dueCheck(custom, new Date('2026-10-13T16:01:00Z')), '2026-10-13T15:59:00.000Z');
  assert.throws(() => configuration({ ...source, frequency_seconds: 5 }), /INVALID_CHECK_FREQUENCY/);
});
test('new effective configuration does not recover historical slots', () => {
  assert.equal(dueCheck({ ...source, schedule_effective_at: '2026-10-13 06:01:00.000' }, new Date('2026-10-13T06:02:00Z')), null);
});
test('completed, active, unauthorized and manual controlled sources cannot duplicate collection', () => {
  const slot = '2026-10-13T06:00:00.000Z';
  assert.equal(recoveryDecision(source, [], slot), 'RECOVER');
  assert.equal(recoveryDecision(source, [{ status: 'partial', started_at: '2026-10-13 06:00:05' }], slot), 'RECOVER');
  for (const status of ['completed', 'completed_authorized_scope']) assert.equal(recoveryDecision(source, [{ status, started_at: '2026-10-13 06:00:05' }], slot), 'COMPLETED');
  assert.equal(recoveryDecision(source, [{ status: 'running' }], slot), 'ACTIVE');
  assert.equal(recoveryDecision(source, [{ status: 'cancelled' }], slot), 'MANUAL_CONTROL');
  assert.equal(recoveryDecision({ ...source, enabled: 0 }, [], slot), 'DISABLED');
  assert.equal(recoveryDecision({ ...source, auth_status: 'expired' }, [], slot), 'UNAUTHORIZED');
});
