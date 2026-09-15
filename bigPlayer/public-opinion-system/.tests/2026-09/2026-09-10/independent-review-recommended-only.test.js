'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '../../..');
const alertsPath = path.resolve(projectRoot, '../admin/PublicOpinion/assets/alerts.js');
const alertsSource = fs.readFileSync(alertsPath, 'utf8');
const {
  QUALITY_TYPES,
  candidateCanReview,
  qualityPatch,
  recommendationCell,
  recommendedTypes,
  renderReviewItems,
  reviewCandidates,
  reviewStatus,
  state
} = require(alertsPath);

const recommended = (values = {}) => ({
  id: values.id || 'candidate-1',
  recommend_home: false,
  recommend_pin: false,
  recommend_feature: false,
  ...values
});

function actionCount(html) {
  return (html.match(/data-quality-action=/g) || []).length;
}

function browserHarness(fetchImpl) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: '', innerHTML: '', value: '', disabled: false,
      classList: { add() {}, remove() {}, contains() { return false; } },
      querySelectorAll() { return []; }
    });
    return nodes.get(selector);
  };
  const context = {
    module: { exports: {} }, exports: {}, require, console, URLSearchParams,
    setTimeout() { return 0; }, clearTimeout() {}, fetch: fetchImpl,
    document: { querySelector: node, querySelectorAll() { return []; }, addEventListener() {} },
    window: {
      PUBLIC_OPINION_API: '/api/public-opinion',
      formatBeijingTime: value => value,
      PublicOpinionAlertDetail: {
        extractAiSummary() { return ''; }, formatTitle() { return ''; }, render() { return ''; },
        renderBodyWithImages(value) { return value; }
      }
    }
  };
  const initStart = alertsSource.lastIndexOf('if (hasDocument) { bind();');
  assert.notEqual(initStart, -1, '应能隔离浏览器自动初始化入口');
  vm.runInNewContext(alertsSource.slice(0, initStart), context, { filename: alertsPath });
  return { api: context.module.exports, nodes };
}

test('PRD 7.1-7.3: list/detail render only strict recommendations in fixed order', () => {
  const featureOnly = recommended({ recommend_feature: true, feature_review_status: 'accepted' });
  for (const detail of [false, true]) {
    const html = renderReviewItems(featureOnly, { detail });
    assert.match(html, /加精/);
    assert.match(html, /已采纳/);
    assert.doesNotMatch(html, /首页推荐|栏目置顶/);
    assert.equal(actionCount(html), 3);
  }

  const pairHtml = renderReviewItems(recommended({ recommend_home: true, recommend_pin: true }));
  assert.match(pairHtml, /首页推荐/);
  assert.match(pairHtml, /栏目置顶/);
  assert.doesNotMatch(pairHtml, /加精/);
  assert.ok(pairHtml.indexOf('首页推荐') < pairHtml.indexOf('栏目置顶'));

  const all = recommended({ recommend_home: true, recommend_pin: true, recommend_feature: true });
  assert.deepEqual(recommendedTypes(all), QUALITY_TYPES);
  const allHtml = renderReviewItems(all, { detail: true });
  assert.ok(allHtml.indexOf('首页推荐') < allHtml.indexOf('栏目置顶'));
  assert.ok(allHtml.indexOf('栏目置顶') < allHtml.indexOf('加精'));
});

test('PRD 7.4-7.6: false values and historical statuses stay hidden with a -- empty state', () => {
  for (const item of [
    recommended(),
    { id: 'zero', recommend_home: 0, recommend_pin: 0, recommend_feature: 0 },
    { id: 'null', recommend_home: null, recommend_pin: null, recommend_feature: null },
    { id: 'missing' },
    recommended({ home_review_status: 'accepted', pin_review_status: 'rejected', feature_review_status: 'accepted' })
  ]) {
    assert.deepEqual(recommendedTypes(item), []);
    assert.equal(renderReviewItems(item), '--');
    assert.equal(actionCount(renderReviewItems(item)), 0);
  }

  const visible = recommended({ recommend_home: true });
  assert.equal(reviewStatus(visible, 'home'), 'pending');
  const html = renderReviewItems(visible);
  assert.match(html, /待审核/);
  assert.doesNotMatch(html, /AI 建议|AI 不建议/);
  assert.doesNotMatch(alertsSource, /AI 不建议/);
});

test('PRD 7.7: adopt/ignore/revoke produce isolated current-type patches', () => {
  const cases = { adopt: ['accepted', true], ignore: ['rejected', false], revoke: ['pending', false] };
  for (const type of QUALITY_TYPES) {
    for (const [verb, [status, adopted]] of Object.entries(cases)) {
      const patch = qualityPatch(type, verb);
      assert.deepEqual(patch, { [`${type}ReviewStatus`]: status, [`${type}Adopted`]: adopted });
      for (const sibling of QUALITY_TYPES.filter(value => value !== type)) {
        assert.equal(Object.hasOwn(patch, `${sibling}ReviewStatus`), false);
        assert.equal(Object.hasOwn(patch, `${sibling}Adopted`), false);
      }
    }
  }
  assert.equal(qualityPatch('unknown', 'adopt'), null);
  assert.equal(qualityPatch('home', 'unknown'), null);
});

test('PRD 7.7: request failure preserves state and releases the pending lock', async () => {
  const { api, nodes } = browserHarness(async () => ({
    ok: false,
    status: 500,
    async text() { return JSON.stringify({ error: { message: '模拟失败' } }); }
  }));
  const item = recommended({ id: 'failure-candidate', recommend_home: true, home_review_status: 'pending' });
  api.state.scope = { query: () => new URLSearchParams() };
  api.state.quality = [{ ...item }];
  api.state.alerts = [];
  api.state.drawerItem = null;
  const before = JSON.stringify(api.state.quality);

  assert.equal(await api.updateQuality('home:adopt', item.id), false);
  assert.equal(JSON.stringify(api.state.quality), before);
  assert.equal(api.state.pendingReviews.size, 0);
  assert.match(nodes.get('#toast').textContent, /操作失败：模拟失败/);
});

test('PRD 7.7: duplicate clicks submit once and lock only the current candidate/type', async () => {
  let release;
  let requestCount = 0;
  const { api } = browserHarness(() => {
    requestCount += 1;
    return new Promise(resolve => { release = () => resolve({
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ data: { id: 'pending-candidate', recommend_home: true, home_review_status: 'accepted' } }); }
    }); });
  });
  const item = recommended({ id: 'pending-candidate', recommend_home: true, recommend_pin: true });
  api.state.scope = { query: () => new URLSearchParams(), selected: () => ({}) };
  api.state.quality = [{ ...item }];
  api.state.alerts = [];
  api.state.drawerItem = null;

  const first = api.updateQuality('home:adopt', item.id);
  assert.equal(api.state.pendingReviews.has('pending-candidate:home'), true);
  assert.equal(await api.updateQuality('home:adopt', item.id), false);
  assert.equal(requestCount, 1);
  assert.equal(api.state.pendingReviews.has('pending-candidate:pin'), false);
  release();
  assert.equal(await first, true);
  assert.equal(requestCount, 1);
  assert.equal(api.state.pendingReviews.size, 0);
  assert.equal(api.state.quality[0].home_review_status, 'accepted');
  assert.equal(api.state.quality[0].pin_review_status, undefined);
});

test('PRD 7.8: risk alerts and quality contents share the same candidate renderer', () => {
  const candidate = recommended({ id: 'shared-candidate', recommend_home: true, recommend_feature: true, home_review_status: 'accepted' });
  const direct = renderReviewItems(candidate);
  assert.equal(renderReviewItems({ id: 'alert-1', independent_reviews: [candidate] }), direct);
  assert.equal(renderReviewItems({ id: 'alert-2', independentReviews: [candidate] }), direct);
  assert.deepEqual(reviewCandidates({ independent_reviews: [candidate] }), [candidate]);
  assert.deepEqual(reviewCandidates({ independent_reviews: [] }), []);
  assert.equal(renderReviewItems({ id: 'alert-empty', independent_reviews: [] }), '--');
});

test('PRD 7.9: read-only users retain type/status but have no review operations', () => {
  const candidate = recommended({ id: 'read-only', recommend_pin: true, pin_review_status: 'rejected', canReview: false });
  assert.equal(candidateCanReview(candidate), false);
  const html = renderReviewItems(candidate);
  assert.match(html, /栏目置顶/);
  assert.match(html, /已忽略/);
  assert.equal(actionCount(html), 0);

  const nested = { id: 'alert-read-only', canReview: false, independent_reviews: [{ ...candidate, canReview: true }] };
  assert.equal(actionCount(renderReviewItems(nested)), 0);
  assert.match(renderReviewItems(nested), /栏目置顶/);
  assert.equal(actionCount(recommendationCell(candidate, 'pin', { canReview: false })), 0);
});

test('PRD 7.10: abnormal recommendation types fail closed and remain observable', () => {
  const warnings = [];
  const malformed = { id: 'malformed', recommend_home: 1, recommend_pin: 'true', recommend_feature: {} };
  assert.deepEqual(recommendedTypes(malformed, (...args) => warnings.push(args)), []);
  assert.equal(warnings.length, 3);
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.equal(recommendationCell(malformed, 'home'), ''); }
  finally { console.warn = originalWarn; }
  assert.match(alertsSource, /服务不可用：/);
  assert.match(alertsSource, /详情加载失败：/);
});
