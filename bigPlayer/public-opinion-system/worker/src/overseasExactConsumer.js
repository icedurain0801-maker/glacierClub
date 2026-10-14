'use strict';

// Offline isolated candidate only. It has no production adapter, no HTTP/provider
// default, no backfill, no notification path, and productionActivationAllowed is
// deliberately false.
const crypto = require('node:crypto');
const { canonical } = require('./overseasBigPlayerRunContractJournal');

const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const sha = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const text = (value, name) => { if (typeof value !== 'string' || !value.trim() || value.trim() !== value) fail('EXACT_MANIFEST_INVALID', `${name} invalid`); return value; };

function exactIdentity(identity) {
  if (!identity || typeof identity !== 'object') fail('EXACT_MANIFEST_INVALID');
  const keys = ['sourceId', 'accountId', 'gameId', 'communityId', 'platform', 'windowStart', 'windowEnd', 'siteId', 'boardId', 'siteUrlHash', 'contractVersion', 'accountAuthVersion'];
  if (Reflect.ownKeys(identity).length !== keys.length || keys.some(key => !Object.hasOwn(identity, key))) fail('EXACT_MANIFEST_INVALID');
  const out = {}; for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(identity, key); if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('EXACT_MANIFEST_INVALID'); out[key] = text(descriptor.value, key); }
  if (out.platform !== 'bigplayer_h5' || !/^[a-f0-9]{64}$/.test(out.siteUrlHash) || !Number.isFinite(Date.parse(out.windowStart)) || !Number.isFinite(Date.parse(out.windowEnd)) || out.windowStart >= out.windowEnd) fail('EXACT_MANIFEST_INVALID');
  return Object.freeze(out);
}

function exactTuple(kind, tuple) {
  if (!tuple || typeof tuple !== 'object') fail('EXACT_TUPLE_INVALID');
  const modeKey = kind === 'analysis' ? 'profile' : 'targetLanguage';
  const keys = ['jobId', 'contentId', 'fingerprint', modeKey, 'version'];
  if (Reflect.ownKeys(tuple).length !== keys.length || keys.some(key => !Object.hasOwn(tuple, key))) fail('EXACT_TUPLE_INVALID');
  const out = {}; for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(tuple, key); if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('EXACT_TUPLE_INVALID'); out[key] = text(descriptor.value, key); }
  if (!uuid(out.jobId) || !/^[a-f0-9]{64}$/.test(out.fingerprint)) fail('EXACT_TUPLE_INVALID');
  if (kind === 'analysis' && out.profile !== 'light') fail('EXACT_TUPLE_INVALID');
  if (kind === 'translation' && !/^[A-Za-z]{2,16}(?:-[A-Za-z0-9]{2,16})?$/.test(out.targetLanguage)) fail('EXACT_TUPLE_INVALID');
  return Object.freeze(out);
}

function createExactManifest({ kind, identity, tuples, manifestSha256 = null } = {}) {
  if (kind !== 'analysis' && kind !== 'translation') fail('EXACT_MANIFEST_INVALID');
  const fixedIdentity = exactIdentity(identity);
  if (!Array.isArray(tuples) || tuples.length === 0 || tuples.length > 1000) fail('EXACT_MANIFEST_INVALID');
  const fixedTuples = Object.freeze(tuples.map(tuple => exactTuple(kind, tuple)));
  if (new Set(fixedTuples.map(tuple => tuple.jobId)).size !== fixedTuples.length || new Set(fixedTuples.map(tuple => tuple.contentId)).size !== fixedTuples.length) fail('EXACT_MANIFEST_INVALID');
  const body = { format: 'overseas-isolated-exact-consumption-v1', kind, identity: fixedIdentity, tuples: fixedTuples };
  const computed = sha(body);
  if (manifestSha256 != null && manifestSha256 !== computed) fail('EXACT_MANIFEST_HASH_MISMATCH');
  const manifest = Object.freeze({ ...body, manifestSha256: computed, productionActivationAllowed: false });
  manifestBrands.add(manifest); return manifest;
}

const manifestBrands = new WeakSet();

function assertManifest(manifest) {
  if (!manifestBrands.has(manifest) || sha({ format: manifest.format, kind: manifest.kind, identity: manifest.identity, tuples: manifest.tuples }) !== manifest.manifestSha256) fail('EXACT_MANIFEST_HASH_MISMATCH');
}
function assertJob(manifest, tuple, job) {
  assertManifest(manifest);
  if (!manifest.tuples.includes(tuple) || !job || job.id !== tuple.jobId || job.content_id !== tuple.contentId || job.content_fingerprint !== tuple.fingerprint) fail('EXACT_JOB_CHANGED');
  const i = manifest.identity;
  const scope = { source_id: i.sourceId, account_id: i.accountId, game_id: i.gameId, community_id: i.communityId, site_id: i.siteId, board_id: i.boardId };
  if (Object.entries(scope).some(([key, value]) => job[key] == null || String(job[key]) !== value)) fail('EXACT_JOB_SCOPE_CHANGED');
  const published = Date.parse(job.published_at);
  if (!Number.isFinite(published) || published < Date.parse(i.windowStart) || published >= Date.parse(i.windowEnd)) fail('EXACT_JOB_SCOPE_CHANGED');
  if (job[manifest.kind === 'analysis' ? 'analysis_version' : 'translation_version'] !== tuple.version || job[manifest.kind === 'analysis' ? 'analysis_profile' : 'target_language'] !== tuple[manifest.kind === 'analysis' ? 'profile' : 'targetLanguage']) fail('EXACT_JOB_CHANGED');
}
function assertCall(manifest, tuple, call) {
  assertManifest(manifest);
  if (!manifest.tuples.includes(tuple) || !call || call.manifestSha256 !== manifest.manifestSha256 || call.tupleSha256 !== sha(tuple) || call.scopeSha256 !== sha(manifest.identity)) fail('EXACT_TRANSACTION_PRECONDITION');
}

function createInMemoryExactRepo({ jobs, globalCap, scopeCap, failCommit = false } = {}) {
  if (!Array.isArray(jobs) || !Number.isSafeInteger(globalCap) || globalCap <= 0 || !Number.isSafeInteger(scopeCap) || scopeCap <= 0) fail('EXACT_REPO_INVALID');
  const rows = new Map(jobs.map(job => [job.id, { ...job }]));
  if (rows.size !== jobs.length) fail('EXACT_REPO_INVALID');
  let globalUsed = 0, serial = Promise.resolve();
  const scopeUsage = new Map();
  const calls = [], audits = [];
  const lock = work => { const next = serial.then(work, work); serial = next.catch(() => {}); return next; };
  const snapshot = () => ({ rows: new Map([...rows].map(([key, value]) => [key, { ...value }])), globalUsed, scopeUsage: new Map(scopeUsage), calls: calls.map(call => ({ ...call })), audits: audits.map(audit => ({ ...audit })) });
  const restore = state => { rows.clear(); for (const [key, value] of state.rows) rows.set(key, value); globalUsed = state.globalUsed; scopeUsage.clear(); for (const [key, value] of state.scopeUsage) scopeUsage.set(key, value); calls.length = 0; calls.push(...state.calls.map(call => ({ ...call }))); audits.length = 0; audits.push(...state.audits.map(audit => ({ ...audit }))); };
  return Object.freeze({
    calls,
    audits,
    async claimExact() { fail('EXACT_LEGACY_API_DISABLED'); },
    async reserve() { fail('EXACT_LEGACY_API_DISABLED'); },
    async admit({ manifest, tuple, leaseOwner, callId }) { return lock(async () => {
      const job = rows.get(tuple.jobId); assertJob(manifest, tuple, job);
      if (job.status !== 'pending' || job.lease_owner) fail('EXACT_JOB_CHANGED');
      if (!uuid(callId) || calls.some(call => call.callId === callId)) fail('EXACT_CALL_ID_INVALID');
      const scopeSha256 = sha(manifest.identity);
      if (globalUsed >= globalCap || (scopeUsage.get(scopeSha256) || 0) >= scopeCap) fail('EXACT_BUDGET_EXHAUSTED');
      const nextEpoch = Number(job.lease_epoch || 0) + 1;
      if (!Number.isSafeInteger(nextEpoch) || nextEpoch < 1) fail('EXACT_JOB_CHANGED');
      // All validation precedes mutation: failed admission is zero-write, not a refund.
      globalUsed += 1; scopeUsage.set(scopeSha256, (scopeUsage.get(scopeSha256) || 0) + 1);
      job.status = 'running'; job.lease_owner = leaseOwner; job.lease_epoch = nextEpoch;
      const call = { callId, manifestSha256: manifest.manifestSha256, tupleSha256: sha(tuple), scopeSha256, status: 'reserved', leaseEpoch: nextEpoch };
      calls.push(call);
      return Object.freeze({ job: Object.freeze({ ...job }), reservation: Object.freeze({ ...call, durable: false }) });
    }); },
    async verifyClaim({ manifest, tuple, job, callId }) { return lock(async () => {
      const current = rows.get(tuple.jobId), call = calls.find(value => value.callId === callId);
      assertCall(manifest, tuple, call); assertJob(manifest, tuple, current); assertJob(manifest, tuple, job);
      if (canonical(current) !== canonical(job) || current.status !== 'running' || call.status !== 'reserved' || call.leaseEpoch !== job.lease_epoch) fail('EXACT_CLAIM_SNAPSHOT_INVALID');
      return true;
    }); },
    async markDispatchStarted({ callId, leaseEpoch }) { return lock(async () => { const call = this.calls.find(value => value.callId === callId); if (!call || call.status !== 'reserved' || !Number.isSafeInteger(leaseEpoch) || leaseEpoch !== call.leaseEpoch) fail('EXACT_CALL_STATE_INVALID'); call.status = 'dispatch_started'; return Object.freeze({ ...call }); }); },
    async settleUnclaimed({ manifest, tuple, callId, status = 'not_dispatched' }) { return lock(async () => { const call = this.calls.find(value => value.callId === callId); assertCall(manifest, tuple, call); if (!call || call.status !== 'reserved' || status !== 'not_dispatched') fail('EXACT_CALL_STATE_INVALID'); call.status = status; audits.push({ callId, status }); return Object.freeze({ status, callId }); }); },
    async settle({ manifest, tuple, callId, job, status }) { return lock(async () => { const state = snapshot(); try { const current = rows.get(job.id), call = this.calls.find(value => value.callId === callId); assertCall(manifest, tuple, call); assertJob(manifest, tuple, current); assertJob(manifest, tuple, job); if (!['unknown_hold', 'not_dispatched'].includes(status) || !current || current.status !== 'running' || current.lease_owner !== job.lease_owner || Number(current.lease_epoch) !== Number(job.lease_epoch) || !call || call.leaseEpoch !== job.lease_epoch || !['reserved', 'dispatch_started'].includes(call.status)) fail('EXACT_TRANSACTION_PRECONDITION'); current.status = status === 'unknown_hold' ? 'held' : 'failed'; current.lease_owner = null; call.status = status; audits.push({ callId, status, manifestSha256: manifest.manifestSha256, tupleSha256: sha(tuple), scopeSha256: sha(manifest.identity) }); return Object.freeze({ status, callId, jobId: job.id }); } catch (error) { restore(state); throw error; } }); },
    async complete({ manifest, tuple, job, callId, result, status = 'completed' }) { return lock(async () => {
      const state = snapshot();
      try {
        const current = rows.get(job.id), call = this.calls.find(value => value.callId === callId);
        assertCall(manifest, tuple, call); assertJob(manifest, tuple, current); assertJob(manifest, tuple, job);
        if (status !== 'completed' || !current || current.status !== 'running' || current.lease_owner !== job.lease_owner || Number(current.lease_epoch) !== Number(job.lease_epoch) || !call || call.leaseEpoch !== job.lease_epoch || call.status !== 'dispatch_started' || call.manifestSha256 !== manifest.manifestSha256 || call.tupleSha256 !== sha(tuple) || call.scopeSha256 !== sha(manifest.identity)) fail('EXACT_TRANSACTION_PRECONDITION');
        if (failCommit) fail('EXACT_TRANSACTION_FAILED');
        current.status = status; current.result = result; current.lease_owner = null; call.status = status;
        audits.push({ manifestSha256: manifest.manifestSha256, tupleSha256: sha(tuple), callId, status });
        return Object.freeze({ status, callId, jobId: tuple.jobId });
      } catch (error) { restore(state); throw error; }
    }); },
    snapshot() { return Object.freeze({ globalUsed, scopeUsed: [...scopeUsage.values()].reduce((a, b) => a + b, 0), scopeUsage: Object.fromEntries(scopeUsage), jobs: [...rows.values()].map(row => ({ ...row })), calls: calls.map(call => ({ ...call })), audits: audits.map(audit => ({ ...audit })) }); }
  });
}

async function runExactIsolatedConsumer({ manifest, repo, provider, leaseOwner = `exact-${crypto.randomUUID()}` } = {}) {
  if (!manifestBrands.has(manifest) || manifest.productionActivationAllowed !== false || typeof repo?.admit !== 'function' || typeof repo?.verifyClaim !== 'function' || typeof repo?.complete !== 'function' || typeof repo?.markDispatchStarted !== 'function' || typeof repo?.settle !== 'function' || typeof provider?.dispatch !== 'function') fail('EXACT_CONSUMER_INVALID');
  const scopeSha256 = sha(manifest.identity), results = [];
  if (typeof leaseOwner !== 'string' || !leaseOwner.trim() || leaseOwner.trim() !== leaseOwner) fail('EXACT_CONSUMER_INVALID');
  assertManifest(manifest);
  for (const tuple of manifest.tuples) {
    const callId = crypto.randomUUID();
    const { job, reservation } = await repo.admit({ manifest, tuple, callId, leaseOwner });
    assertJob(manifest, tuple, job);
    if (job.status !== 'running' || job.lease_owner !== leaseOwner || !Number.isSafeInteger(job.lease_epoch) || job.lease_epoch < 1) fail('EXACT_CLAIM_SNAPSHOT_INVALID');
    await repo.verifyClaim({ manifest, tuple, job, callId });
    assertManifest(manifest);
    await repo.markDispatchStarted({ callId, leaseEpoch: job.lease_epoch });
    let response;
    try { response = await provider.dispatch({ manifest, tuple, job, attempt: 1, maxRetries: 0 }); }
    catch (error) {
      if (error?.dispatched === true || error?.code === 'UNKNOWN' || error?.unknown === true) {
        await repo.settle({ manifest, tuple, callId, job, status: 'unknown_hold' });
        results.push({ jobId: tuple.jobId, status: 'UNKNOWN_HOLD', callId, dispatch: 'started' });
        continue;
      }
      if (error?.dispatched !== false) { await repo.settle({ manifest, tuple, callId, job, status: 'unknown_hold' }); results.push({ jobId: tuple.jobId, status: 'UNKNOWN_HOLD', callId, dispatch: 'started', errorCode: error?.code || 'PROVIDER_DISPATCH_UNKNOWN' }); }
      else { await repo.settle({ manifest, tuple, callId, job, status: 'not_dispatched' }); results.push({ jobId: tuple.jobId, status: 'NOT_DISPATCHED', callId, dispatch: 'not_started', errorCode: error?.code || 'PROVIDER_NOT_DISPATCHED' }); }
      continue;
    }
    if (!response || response.ack !== true || response.result == null) { await repo.settle({ manifest, tuple, callId, job, status: 'unknown_hold' }); results.push({ jobId: tuple.jobId, status: 'UNKNOWN_HOLD', callId, dispatch: 'started' }); continue; }
    const completed = await repo.complete({ manifest, tuple, job, callId, result: response.result });
    results.push({ ...completed, dispatch: 'completed', reservationId: reservation.callId });
  }
  return Object.freeze({ productionActivationAllowed: false, results: Object.freeze(results) });
}

module.exports = { createExactManifest, createInMemoryExactRepo, runExactIsolatedConsumer };
