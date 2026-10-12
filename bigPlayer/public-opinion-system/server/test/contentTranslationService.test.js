const test = require('node:test');
const assert = require('node:assert/strict');
const { ContentTranslationService } = require('../src/services/contentTranslationService');
const fs = require('node:fs');
const path = require('node:path');

function fixture(translatorOverride) {
  const calls = [];
  const repo = {
    enqueueTranslationJob: async (id, options) => { calls.push(['enqueue', id, options]); return { id: 'job', status: 'pending' }; },
    claimTranslationJobs: async input => { calls.push(['claim', input]); return [{ id: 'job', content_id: 'comment', lease_owner: 'lease', target_language: 'zh-CN', translation_version: 'translation-v1', content_fingerprint: 'fp', body: 'English' }]; },
    completeTranslationJob: async (id, options) => { calls.push(['complete', id, options]); return true; },
    finishTranslationJob: async (id, options) => { calls.push(['finish', id, options]); return true; }
  };
  const translator = { requireConfigured() {}, translate: translatorOverride || (async () => ({ translatedBody: '中文', usage: {} })) };
  return { repo, calls, service: new ContentTranslationService(repo, translator) };
}
test('on-demand translation reuses cache and deduplicates concurrent requests with scoped leases', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.translate({ id: 'cached', translation_status: 'completed', translated_body: '中文' }), { status: 'completed' });
  assert.equal(calls.length, 0);
  const content = { id: 'comment', fingerprint: 'fp' };
  const results = await Promise.all([service.translate(content), service.translate(content)]);
  assert.ok(results.every(r => r.status === 'completed'));
  assert.equal(calls.filter(c => c[0] === 'enqueue').length, 1);
  assert.deepEqual(calls.find(c => c[0] === 'claim')[1].contentIds, ['comment']);
  assert.deepEqual(calls.find(c => c[0] === 'claim')[1].jobIds, ['job']);
  assert.equal(calls.find(c => c[0] === 'complete')[2].translation.contentFingerprint, 'fp');
  assert.equal(service.inflight.size, 0);
});
test('another worker lease prevents a second provider call', async () => {
  const { service, repo } = fixture(() => { throw Error('must not translate'); });
  repo.claimTranslationJobs = async () => [];
  assert.deepEqual(await service.translate({ id: 'comment', fingerprint: 'fp' }), { status: 'pending' });
});
test('provider failure and quota rejection keep explicit job states without storing raw errors', async () => {
  for (const code of ['AI_TRANSLATION_DAILY_LIMIT_REACHED', 'AI_TRANSLATION_HTTP_503']) {
    const { service, calls } = fixture(async () => { throw Object.assign(Error('sensitive upstream detail'), { code }); });
    const result = await service.translate({ id: 'comment', fingerprint: 'fp' });
    assert.equal(result.status, code.includes('DAILY') ? 'retryable' : 'failed');
    const finish = calls.find(c => c[0] === 'finish')[2];
    assert.equal(finish.errorMessage, code);
    assert.equal(finish.decrementAttempts, code.includes('DAILY'));
    assert.ok(!calls.some(c => c[0] === 'complete'));
  }
});

test('translation route enforces canonical scope and rejects missing, domestic, deleted, empty content', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const start = source.indexOf("    if (req.method === 'POST' && resource === 'contents' && id && path[2] === 'translation'");
  const end = source.indexOf("    if (req.method === 'POST' && resource === 'contents' && id && path[2] === 'reanalyze')", start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const route = new AsyncFunction('req', 'resource', 'id', 'path', 'url', 'repo', 'contentTranslation', 'resolveRequestScope', 'res', 'json', 'success', 'errorPayload', source.slice(start, end));
  for (const [content, expected] of [[null, 404], [{ id: 'c', region_code: 'domestic' }, 409], [{ id: 'c', region_code: 'overseas', is_deleted: 1 }, 409], [{ id: 'c', region_code: 'overseas', body: '' }, 409], [{ id: 'c', region_code: 'overseas', body: 'English' }, 200]]) {
    let translated = false;
    const repo = { getContentTree: async (id, filters) => { assert.equal(id, 'c'); assert.equal(filters.communityId, 'community'); assert.equal(filters.includeDeleted, true); return content ? [content] : []; } };
    const result = await route({ method: 'POST' }, 'contents', 'c', ['contents', 'c', 'translation'], new URL('http://localhost/'), repo, { translate: async item => { translated = true; assert.equal(item.id, 'c'); return { status: 'completed' }; } }, async () => ({ regionCode: 'overseas', communityId: 'community' }), {}, (_, status, data) => ({ status, data }), x => x, (code, message) => ({ code, message }));
    assert.equal(result.status, expected);
    assert.equal(translated, expected === 200);
  }
});

test('comment details retain root region and cached translation from the scoped detail query', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const start = source.indexOf("    if (req.method === 'GET' && resource === 'contents' && id && path.length === 2)");
  const end = source.indexOf("    if (req.method === 'GET' && resource === 'contents')", start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const route = new AsyncFunction('req', 'resource', 'id', 'path', 'url', 'repo', 'resolveRequestScope', 'res', 'json', 'success', 'errorPayload', source.slice(start, end));
  const comment = { id: 'comment', content_type: 'comment', root_content_id: 'root', region_code: 'overseas', game_id: 'game', community_id: 'community', source_id: 'source', account_id: 'account' };
  const root = { id: 'root', content_type: 'post', region_code: 'overseas', translation_status: 'completed', translated_body: '原帖译文' };
  const repo = {
    getContentTree: async (id, scope) => { if (id === 'root') { assert.equal(scope.sourceId, 'source'); assert.equal(scope.accountId, 'account'); assert.equal(scope.contentType, 'post'); return [root]; } return [comment]; },
    withContentHandling: async items => items,
    listContents: async () => [comment]
  };
  const result = await route({ method: 'GET' }, 'contents', 'comment', ['contents', 'comment'], new URL('http://localhost/'), repo, async () => ({ regionCode: 'overseas', communityId: 'community' }), {}, (_, status, data) => ({ status, data }), x => x, () => ({}));
  assert.equal(result.status, 200);
  assert.equal(result.data.originalPost.region_code, 'overseas');
  assert.equal(result.data.originalPost.translation.body, '原帖译文');
  assert.equal(result.data.originalPost.translation.status, 'completed');
});

test('translation renderer escapes cached text, excludes domestic content and inherits alert region', () => {
  const detail = require('../../../admin/PublicOpinion/assets/alert-detail');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  assert.equal(detail.renderTranslation({ region_code: 'domestic' }, esc), '');
  const html = detail.renderTranslation({ id: 'c', region_code: 'overseas', translation: { status: 'completed', body: '<script>unsafe</script>' } }, esc);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  const alertHtml = detail.renderRelatedContents({ region_code: 'overseas', related_contents: [{ id: 'c', body: 'English' }] }, esc);
  assert.ok(alertHtml.includes('data-translation-id="c"'));
});
