'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syncStage, enqueueDailyAnalysis } = require('../src/worker');

test('DEDUP-01 merged and category feeds share source/external/contentType identity and enqueue AI once', async () => {
  const rows = new Map();
  const stats = { inserted: 0, changed: 0, duplicate: 0 };
  const repo = {
    async claimSyncCheckpoint(input) { return { id: `cp-${input.taskKey}`, cursor: null }; },
    async releaseSyncCheckpoint() {},
    async upsertContentPage(input) {
      const contents = input.items.map(item => {
        const key = `${input.source.id}|${item.externalId}|${item.contentType}`;
        const existing = rows.get(key);
        if (!existing) {
          const content = { id: `db-${rows.size + 1}`, source_id: input.source.id, external_id: item.externalId, content_type: item.contentType };
          rows.set(key, { content, fingerprint: item.fingerprint });
          stats.inserted += 1;
          return { content, change: 'inserted' };
        }
        if (existing.fingerprint !== item.fingerprint) { existing.fingerprint = item.fingerprint; stats.changed += 1; return { content: existing.content, change: 'changed' }; }
        stats.duplicate += 1;
        return { content: existing.content, change: 'unchanged' };
      });
      return { contents, storedCount: contents.filter(item => item.change !== 'unchanged').length };
    }
  };
  const source = { id: 'source-1', platform: 'bigplayer_h5', game_id: 'game-1', community_id: 'community-1', config: { boardId: '2' } };
  const account = { id: 'account-1' };
  const item = { externalId: 'same-100', contentType: 'post', title: '重叠内容', body: '正文', authorName: '作者', publishedAt: '2026-09-10T01:00:00Z', sourceUrl: 'https://club.q1.com/p/100', rawPayload: { type: 0 } };
  const connector = { async listFeedContents() { return { items: [item], nextCursor: null, hasMore: false }; } };
  const run = taskKey => syncStage({ repo, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 1, pageSize: 20 }, { source, account, connector, scope: 'posts', syncMode: 'incremental', taskKind: 'q1_feed', taskKey, feed: { feedKey: taskKey } });
  const merged = await run('merged-feed');
  const category = await run('category-feed');
  assert.equal(rows.size, 1);
  assert.deepEqual(stats, { inserted: 1, changed: 0, duplicate: 1 });
  const jobs = [];
  const analysis = await enqueueDailyAnalysis({ repo: { async loadKeywordRules() { return []; }, async enqueueAnalysisJob(id) { jobs.push(id); } }, ai: { configured() { return true; }, selectProfile() { return { version: 'light-v1' }; } } }, source, [...merged.entries, ...category.entries]);
  assert.equal(analysis.enqueued, 1);
  assert.deepEqual(jobs, ['db-1']);
});
