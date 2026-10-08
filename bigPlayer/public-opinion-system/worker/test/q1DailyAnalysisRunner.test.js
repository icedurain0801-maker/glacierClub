const test = require('node:test');
const assert = require('node:assert/strict');
const { Q1AnalysisRunner, parseArgs } = require('../src/q1DailyAnalysisRunner');
const { AlertEngine } = require('../../server/src/pipeline/alertEngine');

test('Q1 owns the shared analysis gate and releases it after failure', async () => {
  const calls = [];
  const runner = new Q1AnalysisRunner({ repo: {
    async acquireAdvisoryLock(name) { calls.push(['acquire', name]); return true; },
    async releaseAdvisoryLock(name) { calls.push(['release', name]); }
  } });
  runner.runScoped = async () => { throw new Error('test failure'); };
  await assert.rejects(runner.run());
  assert.deepEqual(calls, [['acquire', 'po-analysis-consumer'], ['release', 'po-analysis-consumer']]);
});

test('Q1 does not consume when the cross-process gate is busy', async () => {
  const runner = new Q1AnalysisRunner({ repo: { async acquireAdvisoryLock() { return false; } } });
  runner.runScoped = async () => { throw new Error('must not consume'); };
  await assert.rejects(runner.run(), { code: 'ANALYSIS_SCOPE_BUSY' });
});

test('Q1 analysis runner parses options without exposing credentials', () => {
  assert.deepEqual(parseArgs(['node', 'runner', '--source-id', 's1', '--batch-size', '20']), { sourceId: 's1', batchSize: '20' });
});

test('Q1 analysis runner rejects a claimed job from another canonical community', async () => {
  const claimCalls = [];
  const repo = {
    async claimAnalysisJobs(input) { claimCalls.push(input); return [{ id: 'j2', game_id: 'g1', community_id: 'community-b' }]; }
  };
  const ai = { configured: () => true, selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }) };
  const runner = new Q1AnalysisRunner({
    repo, ai, sourceId: 's1', scope: { gameId: 'g1', communityId: 'community-a' },
    publishedFrom: '2026-08-19T00:00:00+08:00', publishedTo: '2026-08-20T00:00:00+08:00'
  });
  await assert.rejects(() => runner.processBatch('light'), error => error.code === 'ANALYSIS_SCOPE_MISMATCH');
  assert.equal(claimCalls[0].communityId, 'community-a');
  assert.equal(claimCalls[0].gameId, 'g1');
  assert.equal(claimCalls[0].allowDisabledSource, false);
});

test('Q1 manual analysis uses an auditable exact-scope claim for a disabled source', async () => {
  const claimCalls = [];
  const sourceId = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
  const repo = { async claimAnalysisJobs(input) { claimCalls.push(input); return []; } };
  const ai = { configured: () => true, selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }) };
  const runner = new Q1AnalysisRunner({
    repo, ai, sourceId, contentIds: ['content-1'], businessDate: '2026-09-09', manualClaim: true,
    publishedFrom: '2026-09-08T16:00:00.000Z', publishedTo: '2026-09-09T16:00:00.000Z'
  });

  assert.equal(await runner.processBatch('deep'), 0);
  assert.equal(claimCalls[0].allowDisabledSource, true);
  assert.equal(claimCalls[0].businessDate, '2026-09-09');
  assert.match(claimCalls[0].leaseOwner, new RegExp(`^q1-daily:\\d+:${sourceId}:2026-09-09$`));
  assert.deepEqual(claimCalls[0].contentIds, ['content-1']);
});

test('Q1 analysis runner processes all scoped jobs independently', async () => {
  const jobs = [{ id: 'j1', content_id: 'c1', fingerprint: 'fp1', content_fingerprint: 'fp1', title: 't', body: 'b', game_id: 'g1', game_name: 'game', community_id: 'cmt', platform: 'q1', region_code: 'domestic', matched_keywords: '[]', trigger_reason: 'all_content', lease_owner: 'q1' }];
  const finished = [];
  const repo = {
    async acquireAdvisoryLock() { return true; },
    async releaseAdvisoryLock() {},
    async enqueueMissingAnalysis() { return 0; },
    async claimAnalysisJobs() { return jobs.splice(0); },
    async getAnalysisCache() { return []; },
    async insertAnalysis(id, value) { assert.equal(id, 'c1'); assert.equal(value.profile, 'light'); },
    async upsertAnalysisCache() {},
    async finishAnalysisJob(id, value) { finished.push({ id, value }); },
    async countAnalysisJobs() { return { completed: 1 }; },
    async query() { return [{ total: 1, analyzed: 1 }]; },
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {}
  };
  const ai = { configured: profile => profile === 'light', selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }), cacheKey: () => 'k', async analyzeBatch() { return [{ sentiment: 'neutral', severity: 'normal', negativeScore: 0, confidence: 1, needsDeep: false, reason: '正常', topics: [], summary: '正常', qualityScore: 0, recommendHome: false, recommendPin: false, recommendFeature: false, qualityReason: '', analysisVersion: 'v1', modelName: 'm' }]; } };
  const result = await new Q1AnalysisRunner({ repo, ai, sourceId: 's1', publishedFrom: '2026-08-19T00:00:00+08:00', publishedTo: '2026-08-20T00:00:00+08:00', pollMs: 1 }).run();
  assert.equal(result.status, 'completed'); assert.equal(result.total, 1); assert.equal(finished.length, 1);
});

test('Q1 analysis runner persists normalized severity audit fields', async () => {
  const inserted = [];
  const job = { id: 'j-risk', content_id: 'c-risk', fingerprint: 'fp-risk', title: '异常反馈', body: '今天早上云顶出 bug 了，导致 9 点多才正常打上', game_id: 'g1', game_name: 'game', community_id: 'cmt', platform: 'q1', region_code: 'domestic', matched_keywords: '[]', trigger_reason: 'all_content', lease_owner: 'q1' };
  const repo = {
    async claimAnalysisJobs() { return [job]; },
    async getAnalysisCache() { return []; },
    async insertAnalysis(id, value) { inserted.push({ id, value }); },
    async upsertAnalysisCache() {},
    async finishAnalysisJob() {},
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {}
  };
  const ai = {
    configured: profile => profile === 'light',
    selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }),
    cacheKey: () => 'risk-key',
    async analyzeBatch() { return [{ sentiment: 'negative', severity: 'attention', negativeScore: 0.2, confidence: 0.9, needsDeep: false, reason: '内容反馈游戏异常', topics: [], summary: '异常' }]; }
  };
  const runner = new Q1AnalysisRunner({ repo, ai, sourceId: 's1' });
  assert.equal(await runner.processBatch('light'), 1);
  assert.equal(inserted[0].id, 'c-risk');
  assert.equal(inserted[0].value.severity, 'urgent');
  assert.equal(inserted[0].value.originalSeverity, 'attention');
  assert.deepEqual(inserted[0].value.severityNormalizationReasons, ['game_issue_upgrade']);
  assert.match(inserted[0].value.analysisReason, /severity=attention->urgent;reasons=game_issue_upgrade/);
});

test('Q1 cached invalid severity reaches the shared normalizer without silent pre-coercion', async () => {
  const inserted = [];
  const job = { id: 'j-cache-risk', content_id: 'c-cache-risk', fingerprint: 'fp-cache-risk', content_fingerprint: 'fp-cache-risk', title: '普通反馈', body: '体验不太好', game_id: 'g1', community_id: 'c1', platform: 'q1', matched_keywords: '[]', lease_owner: 'q1' };
  const repo = {
    async claimAnalysisJobs() { return [job]; },
    async getAnalysisCache() { return [{ cache_key: 'cache-risk', sentiment: 'negative', severity: 'invalid-cache-value', negative_score: 0.1, confidence: 0.9, reason: '缓存原始说明', topics: '[]' }]; },
    async insertAnalysis(id, value) { inserted.push({ id, value }); },
    async finishAnalysisJob() {}, async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}
  };
  const ai = {
    configured: profile => profile === 'light',
    selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }),
    cacheKey: () => 'cache-risk',
    async analyzeBatch() { throw new Error('cache hit must not call AI'); }
  };
  const runner = new Q1AnalysisRunner({ repo, ai, sourceId: 's1' });
  assert.equal(await runner.processBatch('light'), 1);
  assert.equal(inserted[0].value.severity, 'attention');
  assert.deepEqual(inserted[0].value.severityNormalizationReasons, ['invalid_severity_defaulted', 'negative_floor_attention']);
  assert.match(inserted[0].value.analysisReason, /severity=normal->attention;reasons=invalid_severity_defaulted,negative_floor_attention/);
});

test('Q1 reconciles a persisted positive normal result before any alert processing', async () => {
  const order = []; const notificationCalls = [];
  const job = { id: 'j-positive', content_id: 'c-positive', fingerprint: 'fp-positive', title: '崩溃流派攻略', body: '终于完成目标', game_id: 'g1', game_name: 'game', community_id: 'c1', platform: 'q1', matched_keywords: '[]', lease_owner: 'owner-1' };
  const repo = {
    async claimAnalysisJobs() { return [job]; }, async getAnalysisCache() { return []; },
    async insertAnalysis() { order.push('insert'); },
    async reconcilePositiveRiskAlerts(contentId, analysis, options) { order.push('reconcile'); assert.equal(contentId, 'c-positive'); assert.equal(analysis.severity, 'normal'); assert.match(options.runId, /^q1-daily:/); },
    async upsertAnalysisCache() {}, async finishAnalysisJob() { order.push('finish'); }, async loadKeywordRules() { return [{ keyword: '崩溃', group_name: '风险攻略词', severity: 'urgent', trigger_mode: 'immediate' }]; }, async enqueueAnalysisJob() {},
    async findOpenAlert() { throw new Error('positive gate must run first'); }, async insertAlert() { throw new Error('positive gate must run first'); }, async linkAlertContent() { throw new Error('positive gate must run first'); }
  };
  const ai = { configured: profile => profile === 'light', selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }), cacheKey: () => 'positive-key', async analyzeBatch() { return [{ sentiment: 'positive', severity: 'attention', confidence: 0.9, reason: '已完成目标' }]; } };
  const alertEngine = new AlertEngine(repo, { enabled: true, webhook: 'https://invalid', async notify(value) { notificationCalls.push(value); } }, {});
  const runner = new Q1AnalysisRunner({ repo, ai, alertEngine, sourceId: 's1' });
  assert.equal(await runner.processBatch('light'), 1);
  assert.deepEqual(order, ['insert', 'reconcile', 'finish']);
  assert.equal(notificationCalls.length, 0);
});

test('Q1 reconciliation failure makes the job retryable and never calls the notifier path', async () => {
  const finished = []; let alerts = 0;
  const job = { id: 'j-positive-fail', content_id: 'c-positive', fingerprint: 'fp-positive', title: '活动完成', body: '终于完成目标', game_id: 'g1', community_id: 'c1', platform: 'q1', matched_keywords: '[]', lease_owner: 'owner-1', attempts: 1 };
  const repo = {
    async claimAnalysisJobs() { return [job]; }, async getAnalysisCache() { return []; }, async insertAnalysis() {},
    async reconcilePositiveRiskAlerts() { throw Object.assign(new Error('reconciliation unavailable'), { code: 'DATABASE_ERROR' }); },
    async finishAnalysisJob(id, value) { finished.push({ id, value }); }, async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}
  };
  const ai = { configured: profile => profile === 'light', selectProfile: profile => ({ name: profile, version: 'v1', model: 'm' }), cacheKey: () => 'positive-key', async analyzeBatch() { return [{ sentiment: 'positive', severity: 'urgent', confidence: 0.9 }]; } };
  const runner = new Q1AnalysisRunner({ repo, ai, alertEngine: { async process() { alerts += 1; return []; } }, sourceId: 's1', retryBaseMs: 100 });
  assert.equal(await runner.processBatch('light'), 0);
  assert.equal(alerts, 0);
  assert.equal(finished[0].value.status, 'retryable');
  assert.equal(finished[0].value.errorCode, 'DATABASE_ERROR');
});
