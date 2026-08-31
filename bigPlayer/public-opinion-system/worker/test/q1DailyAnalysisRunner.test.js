const test = require('node:test');
const assert = require('node:assert/strict');
const { Q1AnalysisRunner, parseArgs } = require('../src/q1DailyAnalysisRunner');

test('Q1 analysis runner parses options without exposing credentials', () => {
  assert.deepEqual(parseArgs(['node', 'runner', '--source-id', 's1', '--batch-size', '20']), { sourceId: 's1', batchSize: '20' });
});

test('Q1 analysis runner processes all scoped jobs independently', async () => {
  const jobs = [{ id: 'j1', content_id: 'c1', fingerprint: 'fp1', content_fingerprint: 'fp1', title: 't', body: 'b', game_id: 'g1', game_name: 'game', community_id: 'cmt', platform: 'q1', region_code: 'domestic', matched_keywords: '[]', trigger_reason: 'all_content', lease_owner: 'q1' }];
  const finished = [];
  const repo = {
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
