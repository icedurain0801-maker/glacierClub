const test = require('node:test');
const assert = require('node:assert/strict');
const { BaasQueryRepository } = require('../src/services/baasQueryRepository');
const { project, whereFor } = require('../../shared/cloudQueryProjection');
function fixture({ total = 10049, status = 'ready' } = {}) {
  const calls = [];
  const client = { request: async (method, path, data) => {
    calls.push({ method, path, data });
    if (path.endsWith('query-current')) return { data: { schemaVersion: 1, status } };
    return { total, docs: Array.from({ length: Math.min(total, data.limit) }, (_, i) => ({ id: String(i + data.offset), data: { schemaVersion: 1, id: String(i + data.offset), community_id: 'one', severity: 'normal' } })) };
  } };
  return { repo: new BaasQueryRepository({ queryClient: client }), calls };
}

test('aggregate paging is bounded to four requests and rejects inconsistent totals', async () => {
  let active = 0, peak = 0, changed = false;
  const repo = new BaasQueryRepository({ queryClient: { request: async (method, path, input) => {
    if (method === 'GET') return { data: { schemaVersion: 1, status: 'ready' } };
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { total: changed && input.offset ? 1600 : 1601, docs: Array.from({ length: Math.min(200, 1601 - input.offset) }, (_, i) => ({ id: String(input.offset + i), data: { schemaVersion: 1, id: String(input.offset + i) } })) };
  } } });
  assert.equal((await repo.filtered({ communityId: 'one' })).length, 1601);
  assert.equal(peak, 4);
  repo.invalidate(); changed = true;
  await assert.rejects(repo.filtered({ communityId: 'one' }), { code: 'BAAS_QUERY_INCOMPLETE' });
});

test('handling pages use current local status without invoking the full SQL list', async () => {
  const { repo } = fixture({ total: 2 });
  repo.reviewRepository = { listContents: () => { throw new Error('full SQL list forbidden'); }, query: async () => [{ content_id: '1', handling_method: 'processed' }] };
  repo.queryClient.request = async (method) => method === 'GET' ? { data: { schemaVersion: 1, status: 'ready' } } : { total: 2, docs: ['0', '1'].map(id => ({ id, data: { schemaVersion: 1, id, severity: 'attention' } })) };
  assert.deepEqual((await repo.listContents({ communityId: 'one', handlingStatus: 'pending' })).map(row => row.id), ['0']);
  assert.deepEqual((await repo.listContents({ communityId: 'one', handlingStatus: 'processed' })).map(row => row.id), ['1']);
});

test('quality detail resolves the candidate to an exact content scope before reading full text', async () => {
  const { repo } = fixture();
  repo.load = async () => ({ metadata: { quality: [{ id: 'candidate', content_id: 'content' }] } });
  repo.qualityRows = async filters => {
    assert.equal(filters.contentId, 'content');
    assert.deepEqual(filters.allowedCommunityIds, ['one']);
    return [{ id: 'candidate', content_id: 'content', fingerprint: 'f' }];
  };
  repo.hydrate = async row => { assert.equal(row.id, 'content'); return { ...row, body: 'complete original' }; };
  const result = await repo.getQualityContent('candidate', { allowedCommunityIds: ['one'] });
  assert.equal(result.id, 'candidate'); assert.equal(result.body, 'complete original');
  assert.equal(await repo.getQualityContent('absent'), null);
});

test('alert detail scopes linked IDs and keeps community permissions', async () => {
  const { repo } = fixture();
  repo.load = async () => ({ metadata: { alerts: [{ id: 'alert' }], alertLinks: [{ alert_id: 'alert', content_id: 'p' }] } });
  repo.alertRows = async filters => {
    assert.deepEqual(filters.contentIds, ['p']); assert.deepEqual(filters.allowedCommunityIds, ['one']);
    assert.deepEqual(whereFor(filters).where.id, { $in: ['p'] });
    return [{ id: 'alert' }];
  };
  assert.equal((await repo.getAlert('alert', { allowedCommunityIds: ['one'] })).id, 'alert');
  assert.equal(await repo.getAlert('absent'), null);
});
test('projection strips raw AI payload and keeps full searchable text outside the excerpt', () => {
  const row = project({ id: 'id', body: 'a'.repeat(600) + 'needle', risk_context: 'secret raw response', raw_payload: { token: 'secret' }, media: ['x'], published_at: '2026-10-14 16:00:00', sentiment: 'neutral', severity: 'attention' });
  assert.equal(row.body.length, 500); assert.ok(row.search_text.includes('needle')); assert.equal(row.risk_filter, 'attention');
  assert.equal(row.published_at, '2026-10-14T16:00:00.000Z'); assert.equal(row.raw_payload, undefined); assert.equal(row.risk_context, undefined);
});
test('risk filter preserves combined L2 and verified L3 while excluding positive/unverified urgent', () => {
  for (const [sentiment, severity, urgent_validated, expected] of [['neutral', 'negative', false, 'urgent'], ['negative', 'urgent', true, 'urgent'], ['negative', 'urgent', false, 'normal'], ['positive', 'attention', false, 'normal']]) assert.equal(project({ id: 'p', sentiment, severity, urgent_validated }).risk_filter, expected);
});
test('where builder applies ACL intersection, UTC exclusive end, exact source IDs and literal search', () => {
  assert.equal(whereFor({ communityId: 'other', allowedCommunityIds: ['one'] }).empty, true);
  assert.equal(whereFor({ allowedCommunityIds: [] }).empty, true);
  const { where } = whereFor({ allowedCommunityIds: ['one'], publishedFrom: '2026-10-15T00:00:00+08:00', publishedTo: '2026-10-16T00:00:00+08:00', postId: '001-xyz', keyword: '50%_OK' });
  assert.deepEqual(where.community_id, { $in: ['one'] }); assert.equal(where.external_id, '001-xyz');
  assert.equal(where.published_at.$gte, '2026-10-14T16:00:00.000Z'); assert.equal(where.published_at.$lt, '2026-10-15T16:00:00.000Z');
  assert.deepEqual(where.search_text, { $like: '%50\\%\\_ok%' });
});
test('cold list and count never download 10049 rows or the original collection', async () => {
  const { repo, calls } = fixture();
  assert.equal((await repo.listContents({ communityId: 'one', page: 3, pageSize: 20 })).length, 20);
  assert.equal(await repo.countContents({ communityId: 'one' }), 10049);
  const queries = calls.filter(call => call.method === 'POST'); assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(call => [call.data.limit, call.data.offset]), [[20, 40], [1, 0]]);
  assert.ok(calls.every(call => !call.path.includes('po_live_contents_v1')));
});
test('concurrent identical reads coalesce and empty ACL causes zero network reads', async () => {
  const { repo, calls } = fixture();
  await Promise.all([repo.listContents({ communityId: 'one' }), repo.listContents({ communityId: 'one' })]);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  calls.length = 0; const scoped = repo.forIdentity({ scoped: true, communityIds: [] });
  assert.deepEqual(await scoped.listContents({ handlingStatus: 'pending' }), []); assert.equal(await scoped.countContents(), 0); assert.equal(calls.length, 0);
});
test('incomplete build is rejected instead of serving an empty success', async () => {
  const { repo } = fixture({ status: 'building' }); await assert.rejects(repo.listContents({ communityId: 'one' }), { code: 'BAAS_QUERY_NOT_READY' });
});
test('aggregate range ceiling rejects large scopes without traversing all documents', async () => {
  const { repo, calls } = fixture({ total: 50001 }); await assert.rejects(repo.filtered({ communityId: 'one' }), { code: 'BAAS_QUERY_RANGE_TOO_LARGE' });
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
});
test('exact detail hydrates full original text and fails on fingerprint mismatch', async () => {
  let fingerprint = 'f'; const calls = [];
  const repo = new BaasQueryRepository({ queryClient: { request: async (method, path) => {
    calls.push(path);
    if (path.endsWith('query-current')) return { data: { schemaVersion: 1, status: 'ready' } };
    if (path.includes('po_live_contents_v1/docs/')) return { data: { schemaVersion: 1, content: { id: 'p', fingerprint, body: 'original'.repeat(1000) }, originalType: 1 } };
    return { total: 1, docs: [{ id: 'p', data: { schemaVersion: 1, id: 'p', body: 'excerpt', fingerprint: 'f' } }] };
  } } });
  assert.equal((await repo.listContents({ contentId: 'p' }))[0].body.length, 8000);
  assert.equal(calls.filter(path => path.includes('po_live_contents_v1')).length, 1);
  fingerprint = 'changed'; await assert.rejects(repo.listContents({ contentId: 'p' }), { code: 'BAAS_QUERY_STATE_SYNC_PENDING' });
});
test('stalled cloud transport is bounded and failed reads can be retried', async () => {
  let stalled = true;
  const repo = new BaasQueryRepository({ requestTimeoutMs: 10, queryClient: { request: async () => stalled ? new Promise(() => {}) : { data: { schemaVersion: 1, status: 'ready' } } } });
  await assert.rejects(repo.ready(), { code: 'BAAS_QUERY_TIMEOUT' }); stalled = false; await repo.ready();
});
test('handling authority cannot expose a forbidden or unspecified community', async () => {
  const { repo } = fixture(); repo.reviewRepository = { countContents: () => { throw new Error('must not reach local data'); } };
  assert.equal(await repo.countContents({ allowedCommunityIds: ['one'], communityId: 'two', handlingStatus: 'pending' }), 0);
  await assert.rejects(repo.countContents({ allowedCommunityIds: ['one'], handlingStatus: 'pending' }), { code: 'BAAS_QUERY_SCOPE_REQUIRED' });
});
