const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateKey(utcTimestamp) {
  return new Date(utcTimestamp).toISOString().slice(0, 10);
}

function parseBusinessDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw Object.assign(new Error('business date must be YYYY-MM-DD'), { code: 'INVALID_BUSINESS_DATE' });
  const [year, month, day] = String(value).split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10) !== value) throw Object.assign(new Error('business date must be a valid calendar date'), { code: 'INVALID_BUSINESS_DATE' });
  return value;
}

function beijingDayWindow(businessDate) {
  const date = parseBusinessDate(businessDate);
  const start = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) - BEIJING_OFFSET_MS;
  return {
    timezone: 'Asia/Shanghai', businessDate: date,
    publishedFrom: new Date(start), publishedTo: new Date(start + DAY_MS),
    publishedFromIso: new Date(start).toISOString(), publishedToIso: new Date(start + DAY_MS).toISOString()
  };
}

function previousBeijingDay(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('now must be a valid date');
  const beijingNow = new Date(timestamp + BEIJING_OFFSET_MS);
  const todayStartUtc = Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate()) - BEIJING_OFFSET_MS;
  return beijingDayWindow(formatDateKey(todayStartUtc + BEIJING_OFFSET_MS - DAY_MS));
}

function isBusinessDateComplete(businessDate, now = new Date()) {
  const window = beijingDayWindow(businessDate);
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(timestamp) && timestamp >= window.publishedTo.getTime();
}

function isWithinPublishedWindow(value, { publishedFrom, publishedTo } = {}) {
  if (value == null || value === '') return false;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const from = publishedFrom instanceof Date ? publishedFrom.getTime() : new Date(publishedFrom).getTime();
  const to = publishedTo instanceof Date ? publishedTo.getTime() : new Date(publishedTo).getTime();
  return Number.isFinite(timestamp) && Number.isFinite(from) && Number.isFinite(to) && timestamp >= from && timestamp < to;
}

module.exports = { previousBeijingDay, beijingDayWindow, parseBusinessDate, isBusinessDateComplete, isWithinPublishedWindow };
