const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR_HOUR = 2;
const ALLOWED_FREQUENCIES = Object.freeze([900, 3600, 21600, 43200, 86400]);

function timestamp(value, name, { optional = false } = {}) {
  if (value == null) {
    if (optional) return null;
    throw new TypeError(`${name} must be a valid UTC Date or ISO timestamp`);
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) throw new TypeError(`${name} must be a valid UTC Date or ISO timestamp`);
  return time;
}

function validateFrequency(value) {
  const seconds = Number(value);
  if (!ALLOWED_FREQUENCIES.includes(seconds)) {
    throw new RangeError(`frequencySeconds must be one of ${ALLOWED_FREQUENCIES.join(', ')}`);
  }
  return seconds;
}

function shanghaiDateParts(time) {
  const shifted = new Date(time + SHANGHAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate()
  };
}

function shanghaiTimeToUtcMs(year, month, day, hour = 0) {
  return Date.UTC(year, month, day, hour) - SHANGHAI_OFFSET_MS;
}

function businessDayAnchorMs(time) {
  const { year, month, day } = shanghaiDateParts(time);
  let anchor = shanghaiTimeToUtcMs(year, month, day, ANCHOR_HOUR);
  if (time < anchor) anchor = shanghaiTimeToUtcMs(year, month, day - 1, ANCHOR_HOUR);
  return anchor;
}

function slotAtOrBefore(time, frequencySeconds) {
  const frequencyMs = validateFrequency(frequencySeconds) * 1000;
  const anchor = businessDayAnchorMs(time);
  return anchor + Math.floor((time - anchor) / frequencyMs) * frequencyMs;
}

function nextSlotAfter(time, frequencySeconds) {
  const frequencyMs = validateFrequency(frequencySeconds) * 1000;
  const anchor = businessDayAnchorMs(time);
  const next = anchor + (Math.floor((time - anchor) / frequencyMs) + 1) * frequencyMs;
  return next >= anchor + DAY_MS ? anchor + DAY_MS : next;
}

function collectionWindowForSlot(slot) {
  const slotMs = timestamp(slot, 'slot');
  if (businessDayAnchorMs(slotMs) !== slotMs) return null;
  const { year, month, day } = shanghaiDateParts(slotMs);
  return {
    windowStartAt: new Date(shanghaiTimeToUtcMs(year, month, day - 1)).toISOString(),
    windowEndAt: new Date(shanghaiTimeToUtcMs(year, month, day)).toISOString()
  };
}

function computeSchedule({ now, frequencySeconds, effectiveAt = null, lastProcessedScheduledAt = null } = {}) {
  const nowMs = timestamp(now, 'now');
  const frequency = validateFrequency(frequencySeconds);
  const effectiveMs = timestamp(effectiveAt, 'effectiveAt', { optional: true });
  const lastProcessedMs = timestamp(lastProcessedScheduledAt, 'lastProcessedScheduledAt', { optional: true });
  const latestSlotMs = slotAtOrBefore(nowMs, frequency);
  const isAfterEffective = effectiveMs == null || latestSlotMs > effectiveMs;
  const isUnprocessed = lastProcessedMs == null || latestSlotMs > lastProcessedMs;
  const dueSlotMs = isAfterEffective && isUnprocessed ? latestSlotMs : null;
  const nextReferenceMs = effectiveMs != null && effectiveMs > nowMs ? effectiveMs : nowMs;
  const nextSlotMs = nextSlotAfter(nextReferenceMs, frequency);

  return {
    timezone: 'Asia/Shanghai',
    anchorHour: ANCHOR_HOUR,
    frequencySeconds: frequency,
    businessDayAnchorAt: new Date(businessDayAnchorMs(nowMs)).toISOString(),
    dueSlotAt: dueSlotMs == null ? null : new Date(dueSlotMs).toISOString(),
    nextSlotAt: new Date(nextSlotMs).toISOString(),
    triggerType: dueSlotMs == null ? null : dueSlotMs === nowMs ? 'scheduled' : 'scheduled_catchup',
    window: dueSlotMs == null ? null : collectionWindowForSlot(new Date(dueSlotMs))
  };
}

module.exports = {
  ALLOWED_FREQUENCIES,
  computeSchedule,
  collectionWindowForSlot
};
