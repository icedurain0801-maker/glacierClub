'use strict';
const { computeSchedule, ALLOWED_FREQUENCIES } = require('./scheduleSlots');
const DELAY_MS = 120000;
function configuration(source) {
  let config = source.config || {};
  if (typeof config === 'string') config = JSON.parse(config);
  const frequency = Number(source.frequency_seconds);
  if (!ALLOWED_FREQUENCIES.includes(frequency)) throw new Error('INVALID_CHECK_FREQUENCY');
  const time = frequency === 86400 && source.platform === 'taptap' && /^([01]\d|2[0-3]):[0-5]\d$/.test(config.scheduleTime || '') ? config.scheduleTime : '02:00';
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const checkMinutes = (minutes + 2) % 1440;
  return { sourceId: source.id, frequencySeconds: frequency, collectionTime: time,
    checkTime: `${String(Math.floor(checkMinutes / 60)).padStart(2, '0')}:${String(checkMinutes % 60).padStart(2, '0')}` };
}
function dueCheck(source, now) {
  const spec = configuration(source);
  const shifted = new Date(+now - DELAY_MS);
  let slot;
  if (spec.frequencySeconds === 86400 && spec.collectionTime !== '02:00') {
    const local = new Date(+shifted + 28800000);
    slot = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), Number(spec.collectionTime.slice(0, 2)), Number(spec.collectionTime.slice(3))) - 28800000;
    if (slot > +shifted) slot -= 86400000;
  } else slot = Date.parse(computeSchedule({ now: shifted, frequencySeconds: spec.frequencySeconds }).dueSlotAt);
  // Old Windows triggers after a frequency edit cannot check the wrong slot.
  if (+now - slot - DELAY_MS < 0 || +now - slot - DELAY_MS >= 90000) return null;
  const effective = source.schedule_effective_at && Date.parse(String(source.schedule_effective_at).replace(' ', 'T').replace(/Z?$/, 'Z'));
  return effective && slot <= effective ? null : new Date(slot).toISOString();
}
function recoveryDecision(source, runs, scheduledAt) {
  if (!Number(source.enabled) || !Number(source.game_enabled) || source.community_status !== 'enabled') return 'DISABLED';
  if (source.auth_status !== 'authorized') return 'UNAUTHORIZED';
  if (runs.some(run => ['paused', 'pausing', 'cancelling', 'cancelled', 'canceled', 'awaiting_manual_verification'].includes(run.status))) return 'MANUAL_CONTROL';
  if (runs.some(run => ['queued', 'running'].includes(run.status))) return 'ACTIVE';
  const slot = Date.parse(scheduledAt);
  const parse = value => value ? Date.parse(String(value).replace(' ', 'T').replace(/Z?$/, 'Z')) : NaN;
  if (parse(source.last_success_at) >= slot) return 'COMPLETED';
  if (runs.some(run => ['completed', 'completed_full', 'completed_authorized_scope'].includes(run.status)
    && (parse(run.scheduled_at) === slot || parse(run.started_at) >= slot))) return 'COMPLETED';
  return 'RECOVER';
}
module.exports = { configuration, dueCheck, recoveryDecision };
