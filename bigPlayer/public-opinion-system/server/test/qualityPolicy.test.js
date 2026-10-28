'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultPolicy, normalizePolicy, policyHash } = require('../src/services/aiAnalysisPolicy');
const { qualityEligibility, qualitySnapshotSql } = require('../src/services/qualityPolicy');
const { fixtureAI, firstPass } = require('./fixtures/contextualReview');
const { Repository } = require('../src/db/repository');
const { BaasReadRepository } = require('../src/services/baasReadRepository');
const base = { sentiment: 'positive', qualityScore: .7, recommendHome: true };
const body = '正文'.repeat(25);
test('legacy policies retain 0.70/50 and independent quality configuration', () => {
  const p = defaultPolicy(); delete p.quality;
  assert.deepEqual(normalizePolicy(p, { strict: true }).quality, defaultPolicy().quality);
  p.quality = { ...defaultPolicy().quality, minScore: .6 };
  assert.notEqual(policyHash(p), policyHash(defaultPolicy()));
});
for (const [field, value] of [['enabled', 'false'], ['ranges', []], ['ranges', ['other']], ['minScore', -.1], ['minScore', 1.1], ['minScore', '0.7'], ['minBodyLength', 0], ['minBodyLength', 1.5], ['minBodyLength', 10001], ['rule', ''], ['rule', '字'.repeat(2001)]]) {
  test(`invalid quality ${field} ${String(value).slice(0, 12)} rejected`, () => {
    const p = defaultPolicy(); p.quality[field] = value;
    assert.throws(() => normalizePolicy(p, { strict: true }), { code: 'INVALID_INPUT' });
  });
}
test('eligibility enforces exact score/body boundaries, URLs, scope, switches and sentiment', () => {
  const q = defaultPolicy().quality;
  assert(qualityEligibility(base, { body }, q).eligible);
  assert(!qualityEligibility({ ...base, qualityScore: .6999 }, { body }, q).eligible);
  assert(!qualityEligibility(base, { body: '字'.repeat(49) + '<img src="https://example.org/very-long-image.png">https://example.org/a' }, q).eligible);
  assert(qualityEligibility(base, { body: '<b>' + body + '</b>https://example.org' }, q).eligible);
  assert(!qualityEligibility(base, { body }, { ...q, enabled: false }).eligible);
  assert(!qualityEligibility(base, { body, contentType: 'comment' }, { ...q, ranges: ['post'] }).eligible);
  assert(!qualityEligibility({ ...base, sentiment: 'negative' }, { body }, q).eligible);
  assert(!qualityEligibility({ ...base, recommendHome: false }, { body }, q).eligible);
  assert(qualityEligibility({ ...base, qualityScore: .5 }, { body: '字'.repeat(10) }, { ...q, minScore: .5, minBodyLength: 10 }).eligible);
});
function qualityAI() {
  const { ai } = fixtureAI({ level: 'L0' }); const payloads = [];
  ai.request = async payload => { payloads.push(payload); const value = firstPass('L0'); value.answers.sentiment.choice = 'positive'; value.answers.quality.score = 3; value.answers.recommend_home.noul = 1; return value; };
  ai.qualityExplainer = { explain: async () => ({ status: 'generated', reason: '提供清晰的游戏攻略，步骤详细且有参考价值。' }) };
  return { ai, payloads };
}
test('draft rule reaches model, quality changes invalidate cache and never bypass negative or length gates', async () => {
  const { ai, payloads } = qualityAI(); const p = defaultPolicy(); p.quality.rule = '优先推荐详细配队攻略';
  const content = { body, contentType: 'post', analysisPolicy: p };
  assert((await ai.analyze(content)).recommendHome);
  assert.match(payloads[0].questions.quality.instructions, /优先推荐详细配队攻略/);
  p.quality.minBodyLength = 51;
  const filtered = await ai.analyze(content);
  assert(!filtered.recommendHome); assert.equal(filtered.rawAnalysis.qualityEligibility.bodyLength, 50); assert.match(filtered.rawAnalysis.qualityEligibility.reason, /51字/);
  p.quality.minBodyLength = 50; p.quality.enabled = false;
  assert(!(await ai.analyze(content)).recommendHome); assert.equal(payloads.length, 3);
});
test('repository persists quality snapshot and preserves manual review on admission and rejection', async () => {
  const repo = Object.create(Repository.prototype), calls = []; repo.query = async (sql, params) => { calls.push({ sql, params }); return []; };
  const q = { ...defaultPolicy().quality, minScore: .5, minBodyLength: 10 };
  await repo.upsertQualityCandidate('synthetic', { ...base, qualityScore: .5, body: '字'.repeat(10), contentType: 'post', qualityPolicy: q });
  const insert = calls.find(c => c.sql.startsWith('INSERT'));
  assert.deepEqual(JSON.parse(insert.params[10]), q); assert(!insert.sql.includes('home_review_status='));
  calls.length = 0;
  await repo.upsertQualityCandidate('synthetic', { ...base, body, contentType: 'post', qualityPolicy: { ...q, enabled: false } });
  assert.equal(calls.length, 1); assert.match(calls[0].sql, /^UPDATE/); assert(!calls[0].sql.includes('review_status='));
  const sql = repo.qualityContentFilter({ communityId: 'c' });
  assert(sql.clauses.join().includes('q.quality_policy')); assert.deepEqual(sql.values, ['c']);
  assert(qualitySnapshotSql().join().includes("'$.minScore'"));
  calls.length = 0; await repo.cleanupInvalidQualityCandidates(); assert.match(calls[0].sql, /WHERE q.quality_policy IS NULL/);
});
test('BaaS reads candidate snapshot, preserves old candidates and does not use latest community settings', async () => {
  const repo = new BaasReadRepository();
  const contents = [{ id: 'old', body, content_type: 'post', sentiment: 'neutral' }, { id: 'new', body: '字'.repeat(10), content_type: 'post', sentiment: 'neutral' }, { id: 'off', body, content_type: 'post', sentiment: 'positive' }];
  const q = { ...defaultPolicy().quality, minScore: .5, minBodyLength: 10 };
  const quality = [{ id: 'qo', content_id: 'old', quality_score: .7, recommend_home: 1 }, { id: 'qn', content_id: 'new', quality_score: .5, recommend_home: 1, quality_policy: JSON.stringify(q) }, { id: 'qx', content_id: 'off', quality_score: 1, recommend_home: 1, quality_policy: { ...q, enabled: false } }];
  repo.load = async () => ({ metadata: { quality } }); repo.filtered = async () => contents;
  const rows = await repo.qualityRows(); assert.deepEqual(rows.map(v => v.id).sort(), ['qn', 'qo']);
});
test('manual reanalysis queue refreshes the policy snapshot while ordinary retries preserve it', async () => {
  const repo = Object.create(Repository.prototype); let saved;
  repo.query = async (sql, params) => { if (sql.startsWith('INSERT')) saved = { sql, params }; return []; };
  const p = defaultPolicy(); p.quality.minScore = .9;
  await repo.enqueueAnalysisJob('c', { triggerReason: 'manual_reanalysis', analysisPolicy: p, force: true });
  assert.match(saved.sql, /VALUES\(trigger_reason\)='manual_reanalysis'/); assert.equal(JSON.parse(saved.params[7]).quality.minScore, .9);
});
