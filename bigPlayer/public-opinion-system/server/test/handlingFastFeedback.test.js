const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { BaasReadRepository } = require('../src/services/baasReadRepository');
const { parseBatchHandling } = require('../src/services/contentHandling');
const source = fs.readFileSync(process.env.HANDLING_APP_PATH || path.join(__dirname, '../src/app.js'), 'utf8');
const start = source.indexOf("    if (req.method === 'POST' && resource === 'contents' && id === 'batch-handle'");
const end = source.indexOf("    if (req.method === 'POST' && resource === 'contents' && id && path[2] === 'reanalyze'", start);
assert(start >= 0 && end > start);
const id = '11111111-1111-4111-8111-111111111111';
const input = { contentIds: [id], handlingMethod: 'false_positive', handlingNote: '隔离测试备注' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
test('HTTP save returns after commit without waiting for cloud synchronization; failed commits never schedule it', async () => {
  const commit = deferred(); let committed = false, scheduled = 0, invalidated = 0;
  const repo = { handleContents: async body => { await commit.promise; committed = true; return { ...body, processedCount: 1, handlingStatus: 'processed' }; } };
  const cloudReadRepository = { synchronizeMetadata: () => { throw Error('Cloud synchronization must not block HTTP'); }, invalidateHandling: () => { assert(committed); invalidated++; }, scheduleReviewSync: () => { assert(committed); scheduled++; } };
  const route = vm.runInNewContext(`(async function(req,res,url){const resource='contents',id='batch-handle',path=['contents','batch-handle'];${source.slice(start, end)}})`, {
    repo, cloudReadRepository, parseBatchHandling, resolveRequestScope: async () => ({ communityId: 'one' }),
    readBody: async req => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body); },
    overviewCache: new Map(), trendReadCache: { entries: new Map() }, success: data => ({ data }), errorPayload: (code, message) => ({ code, message }),
    json: (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  });
  const server = http.createServer((req, res) => route(req, res, new URL(req.url, 'http://test')).catch(error => { res.writeHead(error.status || 500); res.end('{}'); }));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    let returned = false;
    const request = fetch(`http://127.0.0.1:${server.address().port}/contents/batch-handle`, { method: 'POST', body: JSON.stringify(input) }).then(response => { returned = true; return response; });
    await new Promise(done => setTimeout(done, 40)); assert.equal(returned, false); assert.equal(scheduled, 0);
    commit.resolve(); const response = await request; assert.equal(response.status, 200); assert.equal((await response.json()).data.handlingStatus, 'processed');
    assert.equal(scheduled, 1); assert.equal(invalidated, 1);
    repo.handleContents = async () => { throw Object.assign(Error('Scope mismatch'), { status: 409 }); };
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/contents/batch-handle`, { method: 'POST', body: JSON.stringify(input) })).status, 409);
    assert.equal(scheduled, 1);
  } finally { await new Promise(done => server.close(done)); }
});
test('local handling is authoritative for lists, detail and counts before cloud synchronization', async () => {
  let records = [], calls = 0;
  const repo = new BaasReadRepository({ reviewRepository: { query: async () => { calls++; return records; } } });
  repo.load = async () => ({ rows: [
    { id, community_id: 'one', content_type: 'post', severity: 'negative', sentiment: 'negative', handling_status: 'pending' },
    { id: 'other', community_id: 'two', content_type: 'comment', severity: 'attention', sentiment: 'negative' },
    { id: 'normal', community_id: 'one', content_type: 'post', severity: 'normal', sentiment: 'neutral' }
  ] });
  assert.equal((await repo.getContentStats({ communityId: 'one' })).urgent, 1);
  records = [{ content_id: id, handling_method: input.handlingMethod, handling_note: input.handlingNote, handled_at: '2026-10-14T01:00:00Z' }]; repo.invalidateHandling();
  const scoped = repo.forIdentity({ scoped: true, communityIds: ['one'] });
  assert.equal(await scoped.countContents({ handlingStatus: 'pending' }), 0);
  assert.equal(await scoped.countContents({ handlingStatus: 'processed' }), 1);
  assert.equal((await scoped.getContentTree(id))[0].handling_note, input.handlingNote);
  assert.equal((await scoped.getContentStats()).urgent, 0);
  assert.deepEqual(await scoped.getContentTree('other'), []);
  assert.equal(await scoped.countContents({ handlingStatus: 'not_required' }), 1);
  assert.equal(calls, 2, 'one local handling snapshot is shared across lists, detail and stats');
});
test('a handling query started before a save cannot overwrite the new status', async () => {
  const old = deferred(); let calls = 0;
  const repo = new BaasReadRepository({ reviewRepository: { query: () => ++calls === 1 ? old.promise : Promise.resolve([{ content_id: id, handling_method: 'handled', handling_note: '已保存' }]) } });
  const rows = [{ id, severity: 'negative' }], first = repo.currentHandlingRows(rows);
  repo.invalidateHandling(); assert.equal((await repo.currentHandlingRows(rows))[0].handling_status, 'processed');
  old.resolve([]); assert.equal((await first)[0].handling_status, 'processed'); assert.equal(calls, 2);
});
test('local read failure does not fall back to stale cloud handling status', async () => {
  const repo = new BaasReadRepository({ reviewRepository: { query: async () => { throw Error('Local DB unavailable'); } } });
  await assert.rejects(repo.currentHandlingRows([{ id, severity: 'negative', handling_status: 'pending' }]), /Local DB unavailable/);
});
test('failed background metadata synchronization schedules a retry while save remains committed', async () => {
  const repo = new BaasReadRepository(); let calls = 0;
  repo.synchronizeMetadata = async () => { if (++calls === 1) throw Error('Cloud offline'); };
  repo.scheduleReviewSync({}); await new Promise(done => setTimeout(done, 20));
  assert.equal(calls, 1); assert.equal(repo.reviewSyncDirty, true); assert(repo.reviewSyncTimer);
  clearTimeout(repo.reviewSyncTimer); repo.reviewSyncTimer = null; repo.scheduleReviewSync({});
  await new Promise(done => setTimeout(done, 20)); assert.equal(calls, 2); assert.equal(repo.reviewSyncDirty, false);
});
