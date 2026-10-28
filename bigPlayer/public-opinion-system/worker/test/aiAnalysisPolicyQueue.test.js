const test = require('node:test');
const assert = require('node:assert/strict');
const { syncStagePage, processPersistentAnalysisJobs } = require('../src/worker');
const { defaultPolicy } = require('../../server/src/services/aiAnalysisPolicy');
test('collection page and queue preserve the selected community policy snapshot', async () => {
  const policy = defaultPolicy(); policy.levels.L1.rule = '本社区采集开始时的规则';
  let stored, queued;
  const repo = {
    upsertContentPage: async input => { stored = input.items[0]; return { contents: [{ content: { id: 'c', content_type: 'post', fingerprint: stored.fingerprint }, change: 'new' }], storedCount: 1 }; },
    enqueueAnalysisJob: async (id, options) => { queued = options; }, loadKeywordRules: async () => []
  };
  const deps = { repo, aiAnalysisPolicy: policy, ai: { configured: () => true, selectProfile: () => ({ name: 'light', version: 'v1' }) }, pageTimeoutMs: 1000, pageSize: 20 };
  const source = { id: 's', game_id: 'g', community_id: 'community-A', platform: 'taptap', region_code: 'domestic' };
  const page = await syncStagePage(deps, { source, account: { id: 'a' }, connector: { listOwnedContents: async () => ({ items: [{ externalId: 'p', body: '社区帖子', publishedAt: '2026-10-15T00:00:00Z' }], hasMore: false, nextCursor: null }) }, scope: 'posts', taskKind: 'owned_content', syncScope: 'posts', checkpoint: { id: 'cp' }, cursor: null });
  assert.equal(stored.rawPayload._aiAnalysisPolicy.levels.L1.rule, '本社区采集开始时的规则');
  await processPersistentAnalysisJobs(deps, source, page.entries, { enqueueOnly: true });
  assert.equal(queued.analysisPolicy.levels.L1.rule, '本社区采集开始时的规则');
});
