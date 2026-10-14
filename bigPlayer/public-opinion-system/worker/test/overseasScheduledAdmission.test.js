'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { scheduledAdmissionOf, scheduledAdmissionHash, assertScheduledRunPair } = require('../src/overseasScheduledAdmission');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
function fixture() {
  const siteUrl = 'https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=1';
  const a = { format: 'overseas-scheduled-admission-v1', runId: id(1), parentRunId: id(2), sourceId: id(3), accountId: id(4), gameId: id(5), communityId: id(6), siteId: 'site-en', boardId: '100017', siteUrl,
    siteUrlSha256: crypto.createHash('sha256').update(siteUrl).digest('hex'), windowStart: '2026-10-08T00:00:00.000Z', windowEnd: '2026-10-09T00:00:00.000Z', manifestSha256: 'a'.repeat(64), configSha256: 'b'.repeat(64), parentTriggerType: 'scheduled', scheduledAt: '2026-10-09T00:00:00.000Z', scheduleVersion: 1 };
  const parent = { id: a.parentRunId, source_id: a.sourceId, account_id: a.accountId, parent_run_id: null, site_id: null, trigger_type: 'scheduled', scheduled_at: a.scheduledAt, schedule_version: 1, sync_mode: 'incremental', window_start: a.windowStart, window_end: a.windowEnd };
  return { a, parent, child: { ...parent, id: a.runId, parent_run_id: a.parentRunId, site_id: a.siteId, trigger_type: 'scheduled_site', scheduled_at: null } };
}
test('scheduled evidence is immutable and cannot have manual shape', () => {
  const f = fixture(); assert.equal(assertScheduledRunPair(f.a, f), true); assert.ok(Object.isFrozen(scheduledAdmissionOf(f.a)));
  assert.throws(() => scheduledAdmissionOf({ ...f.a, parentTriggerType: 'manual' }), { code: 'OVERSEAS_SCHEDULED_ADMISSION_INVALID' });
});
test('exact parent/child/version/window/site rejects drift', () => {
  const f = fixture();
  for (const patch of [{ parent_run_id: id(9) }, { source_id: id(9) }, { account_id: id(9) }, { site_id: 'fr' }, { schedule_version: 2 }, { trigger_type: 'manual' }, { scheduled_at: f.a.scheduledAt }, { window_start: '2026-10-07T00:00:00.000Z' }])
    assert.throws(() => assertScheduledRunPair(f.a, { parent: f.parent, child: { ...f.child, ...patch } }), { code: 'OVERSEAS_SCHEDULED_ADMISSION_INVALID' });
});
test('unknown fields/noncanonical slot/self-parent reject and slot affects identity', () => {
  const { a } = fixture();
  for (const patch of [{ token: 'synthetic' }, { leaseOwner: 'x' }, { scheduledAt: '2026-10-09 00:00:00.000' }, { parentRunId: a.runId }, { scheduleVersion: 0 }])
    assert.throws(() => scheduledAdmissionOf({ ...a, ...patch }), { code: 'OVERSEAS_SCHEDULED_ADMISSION_INVALID' });
  assert.notEqual(scheduledAdmissionHash(a), scheduledAdmissionHash({ ...a, scheduledAt: '2026-10-09T06:00:00.000Z' }));
});
