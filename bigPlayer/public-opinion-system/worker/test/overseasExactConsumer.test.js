'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createExactManifest, createInMemoryExactRepo, runExactIsolatedConsumer } = require('../src/overseasExactConsumer');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fp = n => crypto.createHash('sha256').update(String(n)).digest('hex');
const identity = () => ({ sourceId: id(1), accountId: id(2), gameId: id(3), communityId: id(4), platform: 'bigplayer_h5', windowStart: '2026-10-10T00:00:00.000Z', windowEnd: '2026-10-11T00:00:00.000Z', siteId: 'site-en', boardId: '100017', siteUrlHash: fp('site'), contractVersion: 'contract-v1', accountAuthVersion: 'auth-v1' });
const tuple = (n = 1, patch = {}) => ({ jobId: id(10 + n), contentId: `content-${n}`, fingerprint: fp(`content-${n}`), profile: 'light', version: 'analysis-v1', ...patch });
const job = (value, patch = {}) => ({ id: value.jobId, status: 'pending', content_id: value.contentId, content_fingerprint: value.fingerprint, analysis_profile: value.profile, analysis_version: value.version, source_id: identity().sourceId, account_id: identity().accountId, game_id: identity().gameId, community_id: identity().communityId, site_id: identity().siteId, board_id: identity().boardId, published_at: '2026-10-10T12:00:00.000Z', ...patch });
const manifest = (tuples = [tuple()]) => createExactManifest({ kind: 'analysis', identity: identity(), tuples });

test('manifest is strict and production activation remains disabled', () => {
  const m = manifest();
  assert.equal(m.productionActivationAllowed, false);
  assert.throws(() => createExactManifest({ kind: 'analysis', identity: { ...identity(), boardId: undefined }, tuples: [tuple()] }), { code: 'EXACT_MANIFEST_INVALID' });
  assert.throws(() => createExactManifest({ kind: 'analysis', identity: identity(), tuples: [tuple(), tuple()] }), { code: 'EXACT_MANIFEST_INVALID' });
  assert.throws(() => createExactManifest({ kind: 'analysis', identity: identity(), tuples: [tuple(1, { profile: 'deep' })] }), { code: 'EXACT_TUPLE_INVALID' });
});

test('legacy claim and reserve APIs fail closed with zero writes', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1 });
  const before = repo.snapshot();
  await assert.rejects(() => repo.claimExact({ manifest: m, tuple: m.tuples[0], leaseOwner: 'legacy' }), { code: 'EXACT_LEGACY_API_DISABLED' });
  await assert.rejects(() => repo.reserve({ callId: id(80), manifestSha256: 'f'.repeat(64), tupleSha256: 'f'.repeat(64), scopeSha256: 'f'.repeat(64) }), { code: 'EXACT_LEGACY_API_DISABLED' });
  assert.deepEqual(repo.snapshot(), before);
});

test('exact consumer claims existing job once and dispatches one attempt without side effects', async () => {
  const m = manifest(), calls = [];
  const repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 2, scopeCap: 2 });
  const result = await runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch(input) { calls.push(input); return { ack: true, result: { label: 'safe' } }; } } });
  assert.equal(result.results[0].status, 'completed');
  assert.equal(calls.length, 1); assert.equal(calls[0].attempt, 1); assert.equal(calls[0].maxRetries, 0);
  assert.equal(repo.snapshot().jobs[0].status, 'completed');
  assert.equal(repo.snapshot().globalUsed, 1); assert.equal(repo.snapshot().scopeUsed, 1);
});

test('dispatch failure and dispatch-after-send unknown are distinct and never replayed', async () => {
  const m = manifest([tuple(1), tuple(2)]), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0]), job(m.tuples[1])], globalCap: 3, scopeCap: 3 });
  let count = 0;
  const result = await runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { count += 1; if (count === 1) throw Object.assign(new Error('before send'), { code: 'PROVIDER_NOT_DISPATCHED', dispatched: false }); throw Object.assign(new Error('lost ack'), { code: 'UNKNOWN', dispatched: true }); } } });
  assert.deepEqual(result.results.map(row => row.status), ['NOT_DISPATCHED', 'UNKNOWN_HOLD']);
  assert.equal(count, 2); const state = repo.snapshot(); assert.equal(state.calls.map(call => call.status).join(','), 'not_dispatched,unknown_hold'); assert.equal(state.jobs.map(row => row.status).join(','), 'failed,held');
});

test('global and scope caps are atomic under competition', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1 });
  const provider = { async dispatch() { return { ack: true, result: 'ok' }; } };
  const attempts = await Promise.allSettled([runExactIsolatedConsumer({ manifest: m, repo, provider }), runExactIsolatedConsumer({ manifest: m, repo, provider })]);
  assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1); assert.ok(['EXACT_BUDGET_EXHAUSTED', 'EXACT_JOB_CHANGED'].includes(attempts.filter(row => row.status === 'rejected')[0].reason.code));
  assert.equal(repo.snapshot().globalUsed, 1); assert.equal(repo.snapshot().scopeUsed, 1); assert.equal(repo.snapshot().calls.length, 1);
});

test('transaction failure never marks job completed or audit complete', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1, failCommit: true });
  await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { return { ack: true, result: { ok: true } }; } } }), { code: 'EXACT_TRANSACTION_FAILED' });
  const state = repo.snapshot(); assert.equal(state.jobs[0].status, 'running'); assert.equal(state.audits.length, 0); assert.equal(state.calls[0].status, 'dispatch_started');
});

test('translation requires exact target language and version', async () => {
  const t = { jobId: id(20), contentId: 'translation-content', fingerprint: fp('translation-content'), targetLanguage: 'zh-CN', version: 'translation-v2' };
  const m = createExactManifest({ kind: 'translation', identity: identity(), tuples: [t] });
  const repo = createInMemoryExactRepo({ jobs: [{ id: t.jobId, status: 'pending', content_id: t.contentId, content_fingerprint: t.fingerprint, target_language: t.targetLanguage, translation_version: t.version, source_id: identity().sourceId, account_id: identity().accountId, game_id: identity().gameId, community_id: identity().communityId, site_id: identity().siteId, board_id: identity().boardId, published_at: '2026-10-10T12:00:00.000Z' }], globalCap: 1, scopeCap: 1 });
  const result = await runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { return { ack: true, result: '译文' }; } } });
  assert.equal(result.results[0].status, 'completed');
});

test('missing scope fields fail closed before provider and leave job pending', async () => {
  const m = manifest(), bare = { id: m.tuples[0].jobId, status: 'pending', content_id: m.tuples[0].contentId, content_fingerprint: m.tuples[0].fingerprint, analysis_profile: 'light', analysis_version: 'analysis-v1' };
  const repo = createInMemoryExactRepo({ jobs: [bare], globalCap: 1, scopeCap: 1 }); let calls = 0;
  await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { calls += 1; } } }), { code: 'EXACT_JOB_SCOPE_CHANGED' });
  assert.equal(calls, 0); assert.equal(repo.snapshot().jobs[0].status, 'pending'); assert.equal(repo.snapshot().calls.length, 0); assert.equal(repo.snapshot().globalUsed, 0);
});

test('tuple collection and entries cannot be appended or replaced under old hash', async () => {
  const m = manifest(); const hash = m.manifestSha256;
  assert.throws(() => m.tuples.push(tuple(2)), TypeError);
  assert.throws(() => { m.tuples[0] = tuple(2); }, TypeError);
  assert.throws(() => { m.tuples[0].version = 'changed'; }, TypeError);
  assert.equal(m.manifestSha256, hash);
  const repo = createInMemoryExactRepo({ jobs: [job(tuple(1)), job(tuple(2))], globalCap: 2, scopeCap: 2 }); let sent = 0;
  await runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { sent++; return { ack: true, result: 'ok' }; } } });
  assert.equal(sent, 1); assert.equal(repo.snapshot().jobs[1].status, 'pending');
});

test('failed settlement rejects each corrupted call binding without audit', async () => {
  for (const key of ['manifestSha256', 'tupleSha256', 'scopeSha256']) {
    const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1 });
    await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { repo.calls[0][key] = fp('fake'); throw Object.assign(new Error('no send'), { dispatched: false }); } } }), { code: 'EXACT_TRANSACTION_PRECONDITION' });
    assert.equal(repo.snapshot().audits.length, 0); assert.equal(repo.snapshot().jobs[0].status, 'running');
  }
});

test('same job concurrent admission has one dispatch and one charge', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 2, scopeCap: 2 }); let sent = 0;
  const provider = { async dispatch() { sent++; return { ack: true, result: 'ok' }; } };
  const results = await Promise.allSettled([runExactIsolatedConsumer({ manifest: m, repo, provider }), runExactIsolatedConsumer({ manifest: m, repo, provider })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(sent, 1);
  const state = repo.snapshot(); assert.equal(state.calls.length, 1); assert.equal(state.globalUsed, 1);
});

test('different scopes each have own cap and share global cumulative cap', async () => {
  const a = manifest(), b = createExactManifest({ kind: 'analysis', identity: { ...identity(), siteId: 'site-fr' }, tuples: [tuple(2)] });
  const repo = createInMemoryExactRepo({ jobs: [job(tuple(1)), job(tuple(2), { site_id: 'site-fr' })], globalCap: 2, scopeCap: 1 });
  const provider = { async dispatch() { return { ack: true, result: 'ok' }; } };
  await runExactIsolatedConsumer({ manifest: a, repo, provider }); await runExactIsolatedConsumer({ manifest: b, repo, provider });
  const state = repo.snapshot(); assert.equal(state.globalUsed, 2); assert.deepEqual(Object.values(state.scopeUsage), [1, 1]);
  assert.equal(repo.snapshot().globalUsed, 2);
});

test('admission snapshot mismatch rejects before dispatch', async () => {
  for (const patch of [{ content_fingerprint: fp('fake') }, { analysis_version: 'fake' }, { lease_epoch: 99 }]) {
    const m = manifest(), real = createInMemoryExactRepo({ jobs: [job(tuple())], globalCap: 1, scopeCap: 1 }); let sent = 0;
    const repo = { ...real, async admit(input) { const value = await real.admit(input); return { ...value, job: { ...value.job, ...patch } }; } };
    await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { sent++; } } }));
    assert.equal(sent, 0); assert.equal(real.snapshot().calls[0].status, 'reserved'); assert.equal(real.snapshot().audits.length, 0);
  }
});

test('tuple binding drift after dispatch cannot complete', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1 });
  await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { repo.calls[0].tupleSha256 = fp('tampered'); return { ack: true, result: { ok: true } }; } } }), { code: 'EXACT_TRANSACTION_PRECONDITION' });
  assert.equal(repo.snapshot().jobs[0].status, 'running'); assert.equal(repo.snapshot().calls[0].status, 'dispatch_started');
});

test('transport timeout without dispatch evidence is UNKNOWN_HOLD', async () => {
  const m = manifest(), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0])], globalCap: 1, scopeCap: 1 });
  const result = await runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' }); } } });
  assert.equal(result.results[0].status, 'UNKNOWN_HOLD'); assert.equal(repo.snapshot().calls[0].status, 'unknown_hold'); assert.equal(repo.snapshot().jobs[0].status, 'held');
});

test('reserve rejection happens before second claim and leaves second job pending', async () => {
  const m = manifest([tuple(1), tuple(2)]), repo = createInMemoryExactRepo({ jobs: [job(m.tuples[0]), job(m.tuples[1])], globalCap: 1, scopeCap: 1 });
  await assert.rejects(() => runExactIsolatedConsumer({ manifest: m, repo, provider: { async dispatch() { return { ack: true, result: { ok: true } }; } } }), { code: 'EXACT_BUDGET_EXHAUSTED' });
  const state = repo.snapshot(); assert.equal(state.jobs[0].status, 'completed'); assert.equal(state.jobs[1].status, 'pending'); assert.equal(state.jobs[1].lease_owner, undefined); assert.equal(state.calls.length, 1);
});
