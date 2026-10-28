const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BaasReadRepository } = require('../src/services/baasReadRepository');
const { metadataChunks } = require('../src/services/baasReadMetadata');
const { VERSION } = require('../src/services/urgentValidation');
test('review synchronization is nonblocking and coalesces writes arriving during publication', async () => {
  const repo = new BaasReadRepository(); let release, calls = 0;
  repo.synchronizeMetadata = async () => { calls++; if (calls === 1) await new Promise(resolve => { release = resolve; }); };
  repo.scheduleReviewSync({});
  assert.equal(calls, 0);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  repo.scheduleReviewSync({}); repo.scheduleReviewSync({});
  assert.equal(calls, 1); release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls, 2); assert.equal(repo.reviewSyncRunning, false);
});
test('saved review state overrides stale cloud data and respects filter scope across reloads', async () => {
  const { repo, metadata, docs } = fixture();
  docs.find(row => row.id === 'other').data.content.body = '有效正文'.repeat(20);
  metadata.quality.push({ id: 'q', content_id: 'other', quality_score: .9, recommend_home: 1, home_review_status: 'pending' });
  repo.load = async () => ({ metadata }); repo.filtered = async filters => docs.filter(row => !filters.allowedCommunityIds || filters.allowedCommunityIds.includes(row.data.content.community_id)).map(row => ({ ...row.data.content, sentiment: 'positive' }));
  repo.reviewRepository = { query: async () => [{ id: 'q', content_id: 'other', quality_score: .9, recommend_home: 1, home_review_status: 'accepted' }] };
  assert.equal((await repo.listQualityContents({ reviewStatus: 'accepted' }))[0].home_review_status, 'accepted');
  assert.equal(await repo.countQualityContents({ reviewStatus: 'pending' }), 0);
  assert.equal(await repo.countQualityContents({ allowedCommunityIds: ['one'] }), 0);
  assert.equal(metadata.quality[0].home_review_status, 'pending');
});
function fixture() {
  const at = '2026-10-14T02:00:00.000Z';
  const docs = [
    ['p', 'one', 'post', 0, 'negative', 'urgent'],
    ['d', 'one', 'post', 1, 'neutral', 'attention'],
    ['c', 'one', 'comment', null, 'negative', 'negative'],
    ['other', 'two', 'post', 0, 'positive', 'normal'],
    ['stale', 'one', 'post', 0, 'negative', 'urgent']
  ].map(([id, community, type, originalType, sentiment, severity]) => ({ id, updated_at: at, data: { schemaVersion: 1,
    content: { id, game_id: 'game', community_id: community, source_id: 'source', content_type: type, body: id === 'p' ? 'match mechanism complaint' : id, title: id === 'p' ? 'Title' : '', fingerprint: id, external_id: id === 'p' ? '927402' : id, published_at: at, collected_at: at, root_content_id: id === 'c' ? 'p' : null, content_depth: type === 'comment' ? 1 : 0, is_deleted: 0 }, originalType,
    analyses: [{ id: `a-${id}`, content_fingerprint: id === 'stale' ? 'old' : id, sentiment, severity, analyzed_at: at, analysis_reason: 'original reason', risk_context: { rawAnalysis: { reason: 'explained', urgentReview: { version: VERSION, status: 'approved', level: 'L3' } } } }],
    translations: id === 'p' ? [{ target_language: 'zh-CN', translation_version: 'translation-v1', content_fingerprint: 'p', translated_title: '标题', translated_body: '匹配机制' }] : [] } }));
  const metadata = { games: [{ id: 'game', name: 'Test', region_code: 'overseas' }], sources: [{ id: 'source', platform: 'bigplayer_h5' }], communities: [{ id: 'one', game_id: 'game', name: 'One', status: 'enabled' }, { id: 'two', game_id: 'game', name: 'Two', status: 'enabled' }], accounts: [], handlings: [{ content_id: 'd', handling_method: 'handled' }], analysisJobs: [], translationJobs: [], quality: [], alerts: [{ id: 'alert', severity: 'urgent', status: 'pending' }], alertLinks: [{ alert_id: 'alert', content_id: 'p' }] };
  const chunks = metadataChunks(metadata), calls = [];
  const client = { request: async (method, endpoint, data) => {
    calls.push({ method, endpoint, data });
    if (endpoint.endsWith('/docs/current')) return { data: { schemaVersion: 1, chunks: chunks.map(chunk => ({ id: chunk.id, table: chunk.data.table })) } };
    if (endpoint.includes('po_read_metadata_v1/docs/')) return { data: chunks.find(chunk => endpoint.endsWith(chunk.id)).data };
    return { docs: docs.slice(data.offset, data.offset + data.limit), total: docs.length };
  } };
  return { repo: new BaasReadRepository({ client }), client, docs, metadata, calls };
}
test('overview recovers empty TypeSafe topics, preserves AI topics, and excludes unanalyzed contents', async () => {
  const { repo, docs } = fixture();
  docs[0].data.content.body = '登录后一直闪退';
  docs[0].data.translations = [];
  docs[0].data.analyses[0].topics = '[]';
  docs[1].data.analyses[0].topics = '["已有AI议题"]';
  docs[2].data.content.body = '充值未到账';
  docs[2].data.analyses = [];
  const overview = await repo.getOverview({ communityId: 'one' });
  assert.equal(overview.topicDistribution.find(row => row.topic === '稳定性').count, 1);
  assert.equal(overview.topicDistribution.find(row => row.topic === '稳定性').negative, 1);
  assert.equal(overview.topicDistribution.find(row => row.topic === '已有AI议题').count, 1);
  assert.equal(overview.topicDistribution.some(row => row.topic === '充值付费'), false);
  assert.equal(overview.topicDistribution.reduce((sum, row) => sum + row.count, 0), 3);
});
test('overview exposes all detailed topics rather than silently truncating categories after ten', async () => {
  const repo = new BaasReadRepository();
  repo.filtered = async () => Array.from({ length: 26 }, (_, index) => ({ id: String(index), published_at: '2026-10-14T02:00:00Z', sentiment: 'neutral', platform: 'bigplayer_h5', topics: [`议题${index}`] }));
  repo.getContentStats = async () => ({ post: 26, comment: 0 });
  repo.alertRows = async () => [];
  repo.load = async () => ({ metadata: { alertLinks: [] } });
  repo.getOverviewTrend = async () => [];
  repo.listContents = async () => [];
  assert.equal((await repo.getOverview()).topicDistribution.length, 26);
});
test('cloud content search, type and pagination preserve source IDs', async () => {
  const { repo } = fixture();
  assert.equal((await repo.listContents({ postId: '927402' }))[0].display_type, 'post');
  assert.equal((await repo.listContents({ bigPlayerContentKind: 'dynamic' }))[0].id, 'd');
  assert.equal((await repo.listContents({ keyword: 'mechanism' }))[0].id, 'p');
  assert.equal((await repo.listContents({ pageSize: 2, page: 2 })).length, 2);
  assert.equal(await repo.countContents({ contentType: 'comment' }), 1);
});
test('comment detail includes original post and valid fingerprint translation', async () => {
  const { repo } = fixture();
  assert.deepEqual((await repo.getContentTree('p')).map(row => row.id).sort(), ['c', 'p']);
  const [post] = await repo.listContents({ contentId: 'p' });
  assert.equal(post.translated_body, '匹配机制'); assert.equal(post.comment_count, 1);
  assert.equal(post.analysis_reason, 'explained');
});
test('stale translation jobs do not hide current translated text', async () => {
  const { repo, metadata } = fixture();
  metadata.translationJobs.push({ content_id: 'p', target_language: 'zh-CN', translation_version: 'translation-v1', content_fingerprint: 'old', status: 'failed' });
  // Rebuild the fixture client metadata so the persisted cloud snapshot contains the stale job.
  const chunks = metadataChunks(metadata); const original = repo.client.request;
  repo.client.request = async (method, endpoint, data) => {
    if (endpoint.endsWith('/docs/current')) return { data: { schemaVersion: 1, chunks: chunks.map(chunk => ({ id: chunk.id, table: chunk.data.table })) } };
    if (endpoint.includes('po_read_metadata_v1/docs/')) return { data: chunks.find(chunk => endpoint.endsWith(chunk.id)).data };
    return original(method, endpoint, data);
  };
  const [post] = await repo.listContents({ contentId: 'p' });
  assert.equal(post.translation_status, 'completed'); assert.equal(post.translated_body, '匹配机制');
});
test('pending counts exclude handled content and stale urgent validations', async () => {
  const { repo } = fixture();
  const stats = await repo.getContentStats({}, { includeBreakdown: true });
  assert.equal(stats.attention, 0); assert.equal(stats.urgent, 2);
  assert.equal(stats.urgentPostCount, 1); assert.equal(stats.urgentCommentCount, 1);
  assert.equal((await repo.listContents({ riskMode: 'urgent' })).some(row => row.id === 'stale'), false);
});
test('scope protects lists, direct IDs, comment ancestors, alerts, statistics and directories', async () => {
  const { repo } = fixture(); const scoped = repo.forIdentity({ scoped: true, communityIds: ['two'] });
  assert.equal(await scoped.countContents(), 1);
  assert.deepEqual(await scoped.getContentTree('p', { includeDeleted: true }), []);
  assert.deepEqual(await scoped.listContents({ communityId: 'one' }), []);
  assert.deepEqual(await scoped.listAlerts(), []);
  assert.equal(await scoped.getAlert('alert'), null);
  assert.equal((await scoped.getContentStats()).urgent, 0);
  assert.deepEqual((await scoped.listCommunities()).map(row => row.id), ['two']);
});
test('Beijing date range and independent trend share the cloud read cache', async () => {
  const { repo, calls } = fixture();
  const range = { from: '2026-10-13 16:00:00', to: '2026-10-14 16:00:00' };
  const overview = await repo.getOverview(range);
  assert.equal(overview.metrics.total, 5); assert.equal(overview.trend[0].date, '2026-10-14');
  assert.equal(overview.trend[0].total, 5);
  await repo.getOverviewTrend(range);
  assert.equal(calls.filter(call => call.endpoint.endsWith('/query')).length, 1);
  assert.equal(await repo.countContents({ publishedTo: '2026-10-13 16:00:00' }), 0);
});
test('cloud unavailable or incomplete read fails closed without a local fallback', async () => {
  const { repo, client } = fixture();
  client.request = async () => { throw { status: 403 }; };
  await assert.rejects(() => repo.listContents(), { code: 'BAAS_DATA_UNAVAILABLE', status: 503 });
  const other = fixture(); const original = other.client.request;
  other.client.request = async (...args) => { const result = await original(...args); return args[1].endsWith('/query') ? { ...result, total: result.total + 1 } : result; };
  await assert.rejects(() => other.repo.listContents(), { code: 'BAAS_DATA_UNAVAILABLE' });
});
test('metadata chunks stay below document limit and are immutable', () => {
  const chunks = metadataChunks({ jobs: Array.from({ length: 500 }, (_, id) => ({ id, body: 'x'.repeat(1000) })) });
  assert.ok(chunks.length > 1); assert.equal(chunks.reduce((sum, chunk) => sum + chunk.data.rows.length, 0), 500);
  assert.ok(chunks.every(chunk => Buffer.byteLength(JSON.stringify(chunk.data)) < 250000));
  assert.throws(() => metadataChunks({ jobs: [{ body: 'x'.repeat(250001) }] }), { code: 'BAAS_METADATA_TOO_LARGE' });
});
