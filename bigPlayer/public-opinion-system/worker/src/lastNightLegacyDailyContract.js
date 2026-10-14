'use strict';
const { SOURCE_ID } = require('./lastNightScope');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function legacyDailyIntent({ scheduledAt, now, sourceId, frequencySeconds, expectedScheduleVersion, scheduleVersion }) {
  if (sourceId !== SOURCE_ID || Number(frequencySeconds) !== 86400 || !Number.isSafeInteger(expectedScheduleVersion)
    || expectedScheduleVersion !== Number(scheduleVersion)) fail('LAST_NIGHT_DAILY_OWNER_CONFIGURATION_REQUIRED');
  if (typeof scheduledAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt)) fail('LAST_NIGHT_DAILY_SLOT_INVALID');
  const slot = new Date(scheduledAt), clock = new Date(now);
  if (!Number.isFinite(+slot) || !Number.isFinite(+clock) || slot.toISOString().slice(11) !== '18:00:00.000Z'
    || clock < slot || clock - slot > 86400000) fail('LAST_NIGHT_DAILY_SLOT_INVALID');
  // Shanghai slot D 02:00 -> preceding natural day [D-1 00:00,D 00:00).
  const end = +slot - 2 * 3600000, start = end - 86400000;
  return { sourceId, scheduledAt: slot.toISOString(), windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(),
    nextSlotAt: new Date(+slot + 86400000).toISOString(), scheduleVersion: expectedScheduleVersion,
    uniqueIndex: ['source_id', 'scheduled_at'], requiredRunColumns: ['source_id','account_id','parent_run_id','site_id','scheduled_at','window_start','window_end','schedule_version','lease_owner','lease_epoch','lease_until'],
    missingScopeColumnsPolicy: 'authenticated-plan-and-journal-bind-config-not-inferred', periodicOwnerAdmission: 'requires-target-source-routing-and-live-fencing' };
}
module.exports = { legacyDailyIntent };
