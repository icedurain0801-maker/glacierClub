'use strict';
const crypto = require('node:crypto');
const { canonical, contractOf } = require('./overseasBigPlayerRunContractJournal');
const { iso } = require('./overseasBigPlayerNetworkContractVerifier');
const fail = () => { throw Object.assign(new Error('Scheduled admission invalid'), { code: 'OVERSEAS_SCHEDULED_ADMISSION_INVALID' }); };
const scope = ['runId', 'sourceId', 'accountId', 'gameId', 'communityId', 'siteId', 'boardId', 'siteUrl', 'siteUrlSha256', 'windowStart', 'windowEnd', 'manifestSha256'];
const extra = ['format', 'parentRunId', 'parentTriggerType', 'scheduledAt', 'scheduleVersion', 'configSha256'];
// Pure evidence shape only, never permission to claim/dispatch or use manual recovery.
function scheduledAdmissionOf(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...scope, ...extra].sort().join(',')) fail();
  if (value.format !== 'overseas-scheduled-admission-v1' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.parentRunId || '')
    || value.parentRunId.toLowerCase() === String(value.runId).toLowerCase() || !['scheduled', 'scheduled_catchup'].includes(value.parentTriggerType)
    || !Number.isSafeInteger(value.scheduleVersion) || value.scheduleVersion < 1 || !/^[a-f0-9]{64}$/.test(value.configSha256 || '')) fail();
  let c; try { c = contractOf({ ...Object.fromEntries(scope.map(k => [k, value[k]])), leaseOwner: 'scheduled-validation', leaseEpoch: 1 }); } catch { fail(); }
  try { if (iso(value.scheduledAt) !== value.scheduledAt) fail(); } catch { fail(); }
  return Object.freeze({ ...Object.fromEntries(scope.map(k => [k, c[k]])), ...Object.fromEntries(extra.map(k => [k, value[k]])) });
}
function scheduledAdmissionHash(value) { return crypto.createHash('sha256').update(canonical(scheduledAdmissionOf(value))).digest('hex'); }
function assertScheduledRunPair(value, { parent, child } = {}) {
  const a = scheduledAdmissionOf(value); if (!parent || !child) fail();
  for (const [row, id] of [[parent, a.parentRunId], [child, a.runId]]) if (row.id !== id || row.source_id !== a.sourceId || row.account_id !== a.accountId
    || Number(row.schedule_version) !== a.scheduleVersion || row.sync_mode !== 'incremental') fail();
  if (parent.parent_run_id !== null || parent.site_id !== null || child.parent_run_id !== a.parentRunId || child.trigger_type !== 'scheduled_site'
    || child.scheduled_at !== null || parent.trigger_type !== a.parentTriggerType || child.site_id !== a.siteId) fail();
  try {
    if (iso(parent.scheduled_at) !== a.scheduledAt || iso(child.window_start) !== a.windowStart || iso(child.window_end) !== a.windowEnd
      || iso(parent.window_start) > a.windowStart || iso(parent.window_end) < a.windowEnd) fail();
  } catch { fail(); } return true;
}
module.exports = { scheduledAdmissionOf, scheduledAdmissionHash, assertScheduledRunPair };
