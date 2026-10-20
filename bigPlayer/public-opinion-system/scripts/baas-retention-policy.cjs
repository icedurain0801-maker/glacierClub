'use strict';
const DAY = 86400000;
function publishedTime(value) {
  if (typeof value !== 'string') return NaN;
  return Date.parse(/^\d{4}-\d\d-\d\d /.test(value) ? value.replace(' ', 'T') + 'Z' : value);
}
function cutoffAt(now = Date.now()) { return new Date(now - 15 * DAY).toISOString(); }
const flag = value => value === true || value === 1 || value === '1';
function protectedAnalysis(a = {}) {
  return ['negative', 'urgent'].includes(a.severity) || a.risk_filter === 'urgent' ||
    ['recommend_home', 'recommend_pin', 'recommend_feature'].some(key => flag(a[key]));
}
function selectTargets({ documents, localRows, metadata, cutoff }) {
  const boundary = Date.parse(cutoff);
  if (!Number.isFinite(boundary)) throw Error('Invalid retention boundary');
  const local = new Map(localRows.map(row => [row.id, row]));
  const protectedIds = new Set();
  for (const row of localRows) {
    if (flag(row.analysis_protected) || flag(row.quality_protected) || flag(row.alert_protected)) protectedIds.add(row.id);
    // Keep parents of all retained content, including recent ordinary comments.
    if (!Number.isFinite(publishedTime(row.published_at)) || publishedTime(row.published_at) >= boundary) protectedIds.add(row.id);
  }
  for (const table of ['quality', 'alertLinks']) for (const row of metadata[table] || []) protectedIds.add(row.content_id);
  for (const d of documents) {
    if (!local.has(d.id) || protectedAnalysis(d.query) || (d.snapshot?.analyses || []).some(protectedAnalysis)) protectedIds.add(d.id);
    if (d.snapshot && (d.snapshot.content?.id !== d.id || !Number.isFinite(publishedTime(d.snapshot.content.published_at)) || publishedTime(d.snapshot.content.published_at) >= boundary)) protectedIds.add(d.id);
  }
  const queue = [...protectedIds];
  for (let i = 0; i < queue.length; i++) for (const parent of [local.get(queue[i])?.parent_content_id, local.get(queue[i])?.root_content_id]) {
    if (parent && !protectedIds.has(parent)) { protectedIds.add(parent); queue.push(parent); }
  }
  const targets = documents.filter(d => !protectedIds.has(d.id) && publishedTime(d.query.published_at) < boundary && publishedTime(local.get(d.id)?.published_at) < boundary).map(d => d.id);
  return { targets, protectedIds: [...protectedIds] };
}
module.exports = { cutoffAt, publishedTime, protectedAnalysis, selectTargets };
