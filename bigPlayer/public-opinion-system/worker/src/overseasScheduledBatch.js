'use strict';
const crypto = require('node:crypto');
const { canonical } = require('./overseasBigPlayerRunContractJournal');
const { iso } = require('./overseasBigPlayerNetworkContractVerifier');
const { scheduledAdmissionOf } = require('./overseasScheduledAdmission');
const fail = () => { throw Object.assign(new Error('Scheduled batch invalid'), { code: 'OVERSEAS_SCHEDULED_BATCH_INVALID' }); };
const hash = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function uuid(value) {
  const h = hash(value).slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const fields = ['sourceId','accountId','gameId','communityId','boardId','manifestSha256','configSha256','parentTriggerType','scheduledAt','scheduleVersion','parentRunId'];
function scheduledParentId(a) {
  return uuid(['overseas-scheduled-slot-v1',a.sourceId,a.accountId,a.scheduledAt,a.scheduleVersion,a.configSha256,a.manifestSha256]);
}
function scheduledChildId(parentRunId, siteId) {
  return uuid(['overseas-scheduled-site-v1',parentRunId,siteId]);
}
// Pure closed-set contract. It grants no claim, transport, or production right.
function scheduledBatchOf(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'admissions,format,parentWindowEnd,parentWindowStart'
    || value.format !== 'overseas-scheduled-batch-v1' || !Array.isArray(value.admissions)
    || value.admissions.length < 1 || value.admissions.length > 100) fail();
  let start, end, admissions;
  try {
    start=iso(value.parentWindowStart);end=iso(value.parentWindowEnd);
    admissions=value.admissions.map(scheduledAdmissionOf).sort((a,b)=>a.siteId.localeCompare(b.siteId));
  } catch { fail(); }
  if (start !== value.parentWindowStart || end !== value.parentWindowEnd || start >= end
    || Date.parse(end)-Date.parse(start)>7*86400000) fail();
  const first=admissions[0], sites=new Set(), urls=new Set(), runs=new Set();
  if (first.parentRunId !== scheduledParentId(first)) fail();
  for (const a of admissions) {
    if (fields.some(key=>a[key]!==first[key]) || a.windowStart<start || a.windowEnd!==end || a.windowStart>=a.windowEnd
      || a.runId!==scheduledChildId(a.parentRunId,a.siteId) || sites.has(a.siteId) || urls.has(a.siteUrl) || runs.has(a.runId)) fail();
    sites.add(a.siteId);urls.add(a.siteUrl);runs.add(a.runId);
  }
  return Object.freeze({format:value.format,parentWindowStart:start,parentWindowEnd:end,admissions:Object.freeze(admissions)});
}
function scheduledBatchHash(value) { return hash(scheduledBatchOf(value)); }
module.exports={scheduledParentId,scheduledChildId,scheduledBatchOf,scheduledBatchHash};
