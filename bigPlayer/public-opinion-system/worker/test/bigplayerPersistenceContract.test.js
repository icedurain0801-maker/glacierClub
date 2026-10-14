'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncStage, enqueueDailyAnalysis, processAnalysisBacklog } = require('../src/worker');

test('STORE-01 upserts normalized content before downstream and keeps raw/normalized fields', async () => {
  const commits = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-1', cursor: null }; },
    async upsertContentPage(input) { commits.push(input); return { storedCount: 1, contents: [{ content: { id: 'db-1', external_id: 'ext-1' }, change: 'inserted' }] }; },
    async releaseSyncCheckpoint() {}
  };
  const connector = { async listPosts() { return { items: [{ externalId: 'ext-1', contentType: 'post', title: '标题', body: '正文', authorName: '作者', publishedAt: '2026-09-10T01:00:00Z', sourceUrl: 'https://club.q1.com/p/1', rawPayload: { type: 0, authorization: 'secret' } }], nextCursor: null, hasMore: false }; } };
  const result = await syncStage({ repo, credentialContext: {}, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 1, pageSize: 20 }, { source: { id: 'source-1', platform: 'bigplayer_h5', config: { boardId: '2' } }, account: { id: 'account-1' }, connector, scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].items[0].externalId, 'ext-1');
  assert.equal(commits[0].items[0].rawPayload.authorization, undefined);
});

test('DEDUP/AI changed content enqueues once while unchanged content does not enqueue', async () => {
  const enqueued = [];
  const result = await enqueueDailyAnalysis({
    repo: { async loadKeywordRules() { return [{ keyword: '崩溃', group_name: '风险', severity: 'urgent', trigger_mode: 'immediate', enabled: 1 }]; }, async enqueueAnalysisJob(id, input) { enqueued.push({ id, input }); } },
    ai: { configured() { return true; }, selectProfile() { return { version: 'light-v1' }; } }
  }, { id: 'source-1', platform: 'bigplayer_h5', game_id: 'game-1', community_id: 'community-1' }, [
    { content: { id: 'content-inserted' }, raw: { title: '崩溃反馈', body: '正文', fingerprint: 'fp-1' }, change: 'inserted' },
    { content: { id: 'content-unchanged' }, raw: { title: '崩溃反馈', body: '正文', fingerprint: 'fp-1' }, change: 'unchanged' }
  ]);
  assert.equal(result.enqueued, 1);
  assert.deepEqual(enqueued.map(item => item.id), ['content-inserted']);
});

test('CKPT-01 completed scope resumes without claiming or fetching again', async () => {
  let claims = 0; let fetches = 0;
  const repo = {
    async getSyncCheckpoint() { return { status: 'completed', cursor: 'done' }; },
    async claimSyncCheckpoint() { claims += 1; throw new Error('must not claim completed scope'); }
  };
  const connector = { async listPosts() { fetches += 1; throw new Error('must not fetch completed scope'); } };
  const result = await syncStage({ repo, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 1, pageSize: 20, collectionWindow: { dailyBounded: true, publishedFrom: '2026-09-10T16:00:00Z', publishedTo: '2026-09-11T16:00:00Z' } }, { source: { id: 'source-1', platform: 'bigplayer_h5', config: { boardId: '2' } }, account: { id: 'account-1' }, connector, scope: 'posts', syncMode: 'backfill', taskKind: 'q1_feed', taskKey: 'feed-1' });
  assert.equal(result.completed, true);
  assert.equal(claims, 0);
  assert.equal(fetches, 0);
});

test('STORE-02 AI failure keeps content available and marks the job retryable', async () => {
  const finished = [];
  const repo = {
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs() { return [{ id: 'job-1', content_id: 'content-1', title: '标题', body: '正文', fingerprint: 'fp-1', attempts: 1, matched_keywords: '[]' }]; },
    async getAnalysisCache() { return []; },
    async insertAnalysis() { throw Object.assign(new Error('AI unavailable'), { code: 'AI_PROVIDER_UNAVAILABLE' }); },
    async finishAnalysisJob(id, input) { finished.push({ id, input }); }
  };
  const ai = { configured() { return true; }, profiles: { light: { version: 'light-v1' } }, selectProfile() { return { name: 'light', version: 'light-v1' }; }, async analyzeBatch() { return [{ sentiment: 'neutral', severity: 'normal', confidence: 1 }]; } };
  const result = await processAnalysisBacklog({ repo, ai, alertEngine: {}, leaseOwner: 'worker-1', analysisRetryBaseMs: 1 });
  assert.equal(result.analyzed, 0);
  assert.equal(finished[0].id, 'job-1');
  assert.equal(finished[0].input.status, 'retryable');
  assert.equal(finished[0].input.errorCode, 'AI_PROVIDER_UNAVAILABLE');
});
