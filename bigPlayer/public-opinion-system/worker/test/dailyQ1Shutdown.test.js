const test = require('node:test');
const assert = require('node:assert/strict');
const { runSource } = require('../src/worker');

test('daily Q1 waits for an in-flight feed before closing the commit lane', async () => {
  const calls = { upsert: 0, finish: [] };
  const source = {
    id: 'daily-q1-source', account_id: 'daily-q1-account', game_id: 'game-1', community_id: 'community-1',
    region_code: 'domestic', platform: 'bigplayer_h5', display_name: 'BigPlayer'
  };
  const repo = {
    async getDefaultAccount() { return { id: source.account_id, metadata: {} }; },
    async enqueueSyncRun() { return { id: 'daily-q1-run', sync_mode: 'incremental' }; },
    async claimSyncRun() { return { id: 'daily-q1-run', sync_mode: 'incremental' }; },
    async createRun() { return { id: 'daily-q1-collection' }; },
    async finishRun() {}, async markSourceRun() {}, async updateAccount() {}, async updateSourceAuth() {},
    async finishSyncRun(id, patch) { calls.finish.push({ id, ...patch }); },
    async claimSyncCheckpoint() { return { id: 'daily-q1-checkpoint', cursor: null }; },
    async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }, async loadKeywordRules() { return []; },
    async upsertContentPage(input) {
      calls.upsert += 1;
      return { contents: input.items.map(item => ({ content: { id: `content-${item.externalId}` }, change: 'inserted' })), storedCount: input.items.length };
    }
  };
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    hasSourceCapability() { return false; },
    async discoverFeeds() { return [{ feedKey: 'delayed-feed' }]; },
    async listFeedContents() {
      await new Promise(resolve => setTimeout(resolve, 150));
      return { items: [{ externalId: 'post-1', title: 'post', body: 'body', authorName: 'author', fingerprint: 'post-1', sourceUrl: 'https://example.test/post-1', publishedAt: '2026-09-10T12:00:00Z' }], nextCursor: null, hasMore: false };
    }
  };

  await runSource({
    repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } },
    ai: { configured() { return false; } }, alertEngine: {}, leaseOwner: 'daily-q1-worker', leaseSeconds: 30,
    pageBudget: 1, pageSize: 10, deadlineAt: Date.now() + 2000,
    collectionWindow: { dailyBounded: true, publishedFrom: new Date('2026-09-10T00:00:00Z'), publishedTo: new Date('2026-09-11T00:00:00Z') }
  }, source);

  assert.equal(calls.upsert, 1);
  assert.equal(calls.finish.at(-1).status, 'completed_authorized_scope');
  assert.equal(calls.finish.at(-1).discoveredCount, 1);
  assert.equal(calls.finish.at(-1).storedCount, 1);
});
