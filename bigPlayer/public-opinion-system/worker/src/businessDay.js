const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function formatDateKey(utcTimestamp) {
  return new Date(utcTimestamp).toISOString().slice(0, 10);
}

function previousBeijingDay(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('now must be a valid date');

  const beijingNow = new Date(timestamp + BEIJING_OFFSET_MS);
  const todayStartUtc = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate()
  ) - BEIJING_OFFSET_MS;
  const yesterdayStartUtc = todayStartUtc - 24 * 60 * 60 * 1000;

  return {
    timezone: 'Asia/Shanghai',
    businessDate: formatDateKey(yesterdayStartUtc + BEIJING_OFFSET_MS),
    publishedFrom: new Date(yesterdayStartUtc),
    publishedTo: new Date(todayStartUtc),
    publishedFromIso: new Date(yesterdayStartUtc).toISOString(),
    publishedToIso: new Date(todayStartUtc).toISOString()
  };
}

function isWithinPublishedWindow(value, { publishedFrom, publishedTo } = {}) {
  if (value == null || value === '') return false;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const from = publishedFrom instanceof Date ? publishedFrom.getTime() : new Date(publishedFrom).getTime();
  const to = publishedTo instanceof Date ? publishedTo.getTime() : new Date(publishedTo).getTime();
  return Number.isFinite(timestamp) && Number.isFinite(from) && Number.isFinite(to)
    && timestamp >= from && timestamp < to;
}

module.exports = { previousBeijingDay, isWithinPublishedWindow };
