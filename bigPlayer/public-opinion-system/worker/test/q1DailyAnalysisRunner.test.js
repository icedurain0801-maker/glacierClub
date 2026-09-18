const test = require('node:test');
const assert = require('node:assert/strict');
const { Q1AnalysisRunner, parseArgs } = require('../src/q1DailyAnalysisRunner');

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
