'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
// Pure downstream tests do not load workspace env files or instantiate main.
require('../../server/src/runtimeEnv').loadRuntimeEnv=()=>{};
const { enqueueDailyAnalysis, processPersistentAnalysisJobs } = require('../src/worker');
const { createOverseasBigPlayerPageStore } = require('../src/overseasBigPlayerPageStore');
const { createOverseasPageJobs } = require('../src/overseasBigPlayerPageJobs');
const entries = [{ change: 'inserted', content: { id: 'content', is_deleted: 0 }, raw: { body: 'body', fingerprint: 'version' } }];
function fixture() {
  const enqueued = [], claimed = [];
  const repo = {
    pool: { getConnection: async () => { throw Error('not used'); } }, _upsertContentPageAttempt() {},
    async enqueueAnalysisJob(id, options) { enqueued.push({ id, options }); },
    async claimAnalysisJobs(options) { claimed.push(options); return []; },
    async finishAnalysisJob() {},
    async loadKeywordRules() { return []; }
  };
  const store = createOverseasBigPlayerPageStore({ repo, verifyRunContract: async () => true,
    beforeCommit: createOverseasPageJobs({ analysisOptionsFor: () => ({ profile: 'light', version: 'v1', triggerReason: 'all_content' }), translationOptions: { targetLanguage: 'zh-CN', version: 'v1' } }) });
  repo.upsertContentPage = store.upsertContentPage;
  return { enqueued, claimed, deps: { repo, ai: { configured: () => true }, overseasAtomicPageJobs: true } };
}
const source = { id: 'source', game_id: 'game', community_id: 'community', platform: 'bigplayer_h5', region_code: 'overseas' };
test('caller flag without committed receipt cannot skip the content enqueue', async () => {
  const f = fixture();
  await assert.rejects(() => enqueueDailyAnalysis(f.deps, source, entries), { code: 'OVERSEAS_ATOMIC_PAGE_JOBS_RECEIPT_REQUIRED' });
  assert.equal(f.enqueued.length, 0);
  assert.equal(f.claimed.length, 0);
});
test('atomic overseas direct downstream still consumes light and deep queues', async () => {
  const f = fixture();
  assert.deepEqual(await processPersistentAnalysisJobs(f.deps, source, []), { analyzed: 0, alerted: 0 });
  assert.equal(f.enqueued.length, 0);
  assert.deepEqual(f.claimed.map(call => call.profile), ['light', 'deep']);
});
test('forged or wrapped store rejects even when AI is disabled', async () => {
  for (const wrapped of [false, true]) {
    const f = fixture();
    f.deps.repo.upsertContentPage = wrapped ? f.deps.repo.upsertContentPage.bind(null) : async () => ({});
    f.deps.ai.configured = () => false;
    await assert.rejects(() => enqueueDailyAnalysis(f.deps, source, entries), { code: 'OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND' });
    assert.equal(f.enqueued.length, 0);
  }
});
test('domestic, other platforms, and non-atomic overseas keep existing enqueue', async () => {
  for (const [patch, atomic] of [[{ region_code: 'domestic' }, true], [{ platform: 'discord' }, true], [{}, false]]) {
    const f = fixture(); f.deps.overseasAtomicPageJobs = atomic;
    if (!atomic) f.deps.repo.upsertContentPage = async () => ({});
    assert.equal((await enqueueDailyAnalysis(f.deps, { ...source, ...patch }, entries)).enqueued, 1);
    assert.equal(f.enqueued.length, 1);
    assert.equal(f.enqueued[0].options.profile, 'light');
  }
});
test('atomic store cannot lose its flag and silently duplicate the legacy enqueue', async()=>{
  const f=fixture();delete f.deps.overseasAtomicPageJobs;
  await assert.rejects(()=>enqueueDailyAnalysis(f.deps,source,entries),{code:'OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND'});
  assert.equal(f.enqueued.length,0);
});
test('exact content allowlist is passed to both light and deep and limits enqueue',async()=>{
  const f=fixture();f.deps.overseasAtomicPageJobs=false;f.deps.repo.upsertContentPage=async()=>({});
  await processPersistentAnalysisJobs(f.deps,source,[...entries,{change:'inserted',content:{id:'outside'},raw:{fingerprint:'other'}}],{contentIds:['content']});
  assert.deepEqual(f.enqueued.map(e=>e.id),['content']);assert.deepEqual(f.claimed.map(c=>c.contentIds),[['content'],['content']]);
});
test('empty, duplicate or malformed allowlist rejects before enqueue or claim',async()=>{
  for(const contentIds of [[],['content','content'],[' content'],null,'content']){const f=fixture();await assert.rejects(()=>processPersistentAnalysisJobs(f.deps,source,[],{contentIds}),{code:'ANALYSIS_ALLOWLIST_INVALID'});assert.equal(f.enqueued.length,0);assert.equal(f.claimed.length,0);}
});
test('out-of-allowlist claimed job cannot reach AI or downstream writes',async()=>{
  const f=fixture();let aiCalls=0,finished=0;f.deps.ai.analyzeBatch=async()=>{aiCalls++;return [];};f.deps.repo.finishAnalysisJob=async()=>{finished++;};
  f.deps.repo.claimAnalysisJobs=async()=>[{content_id:'outside'}];
  await assert.rejects(()=>processPersistentAnalysisJobs(f.deps,source,[],{contentIds:['content']}),{code:'ANALYSIS_ALLOWLIST_VIOLATION'});assert.equal(aiCalls,0);assert.equal(finished,0);
});
