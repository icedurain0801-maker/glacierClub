const DAY = 86400000;
const OFFSET = 8 * 3600000;
function weeklyWindow(now = new Date()) {
  const local = new Date(now.getTime() + OFFSET);
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * DAY - OFFSET;
  return { start: new Date(monday - 7 * DAY), end: new Date(monday), due: new Date(monday + 9.5 * 3600000) };
}
const sqlDate = date => date.toISOString().slice(0, 19).replace('T', ' ');
function chunks(values, maxChars = 10000) {
  const result = []; let buffer = '';
  for (const value of values) {
    const points = Array.from(String(value));
    for (let i = 0; i < points.length; i += maxChars) {
      const part = points.slice(i, i + maxChars).join('');
      if (buffer && buffer.length + part.length + 1 > maxChars) { result.push(buffer); buffer = ''; }
      buffer += (buffer ? '\n' : '') + part;
    }
  }
  if (buffer) result.push(buffer);
  return result;
}
function reportStats(rows) {
  const stats = { total: rows.length, positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  for (const row of rows) stats[['positive', 'neutral', 'negative'].includes(row.sentiment) ? row.sentiment : 'unclassified']++;
  stats.analyzed = stats.total - stats.unclassified;
  stats.positiveRate = stats.analyzed ? Number((stats.positive / stats.analyzed * 100).toFixed(1)) : null;
  return stats;
}
module.exports = { weeklyWindow, sqlDate, chunks, reportStats };
