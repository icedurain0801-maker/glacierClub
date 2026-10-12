'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeComments, recoverDomesticComments } = require('../src/domesticTodayCommentRecovery');
const { recoverDomesticFeed } = require('../src/domesticTodayFeedRecovery');
const { SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, SITE_ID, WINDOW_START } = require('../src/domesticTodayRecovery');
function fixture() {
  const url = 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN';
  const source = { id: SOURCE_ID, game_id: 'g', community_id: COMMUNITY_ID, region_code: 'domestic', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', config: { boardId: 2, baseUrl: url, siteUrls: [{ siteId: SITE_ID, url }] } };
  const account = { id: ACCOUNT_ID, source_id: SOURCE_ID, game_id: 'g', community_id: COMMUNITY_ID, platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized' };
  const plan = { sourceId: SOURCE_ID, accountId: ACCOUNT_ID, publishedFrom: WINDOW_START, publishedTo: '2026-10-09T04:31:29.177Z', maxPages: 1, postId: '100', analysisVersion: 'test' };
  const calls = [], repo = {
    acquireAdvisoryLock: async () => true, releaseAdvisoryLock: async () => {}, getSyncCheckpoint: async () => null,
    claimSyncCheckpoint: async input => ({ id: 'cp', cursor: null, ...input }), releaseSyncCheckpoint: async (_id, input) => ({ status: input.status }),
    assertDomesticParent: async () => {}, storeDomesticComments: async input => { calls.push(input); return { contents: [] }; },
    enqueueAnalysisBatch: async () => ({ failed: 0, submitted: 0 }), upsertContentPage: async () => ({ contents: [] })
  };
  return { source, account, plan, repo, calls, now: Date.parse('2026-10-09T05:00:00Z') };
}
test('old comment ancestor and today reply preserve independent timestamp/raw/root/parent', () => {
  const raw = { id: '1', content: 'old' }, childRaw = { id: '2', content: 'today' };
  const sourceUrl = 'https://club.q1.com/api/club/v1/auth/post/?postId=100&source=0';
  const rows = normalizeComments({ items: [{ externalId: '1', sourceUrl, publishedAt: '2026-10-08T10:00:00Z', rawPayload: raw,
    replies: [{ externalId: '2', sourceUrl, publishedAt: '2026-10-09T04:00:00Z', rawPayload: childRaw }] }] }, '100', { from: Date.parse(WINDOW_START), to: Date.parse('2026-10-09T04:31:29.177Z') });
  assert.equal(rows[0].inWindow, false); assert.equal(rows[1].inWindow, true);
  assert.equal(rows[1].platformParentId, '1'); assert.equal(rows[1].rootPlatformContentId, '100');
  assert.deepEqual(rows[1].rawPayload, childRaw); assert.equal(rows[0].publishedAt.toISOString(), '2026-10-08T10:00:00.000Z');
});
test('empty today page still hands reply targets to durable transaction', async () => {
  const f = fixture(); f.connector = { listComments: async () => ({ items: [], hasMore: false, nextCursor: null, replyTargets: [{ postId: '100', commentId: '1', sortType: 0 }] }) };
  const report = await recoverDomesticComments(f);
  assert.equal(f.calls[0].replyTargets.length, 1); assert.equal(report.replyTargets.length, 1);
  assert.equal(report.allCommentsComplete, false);
});
test('comment normalizer supports more than 20 nested entries and rejects duplicate IDs', () => {
  const sourceUrl = 'https://club.q1.com/api/club/v1/auth/post/?postId=100&source=0';
  const items = [{ externalId: '1', sourceUrl, publishedAt: '2026-10-09T04:00:00Z', replies: Array.from({ length: 25 }, (_, n) => ({ externalId: String(n + 2), sourceUrl, publishedAt: '2026-10-09T04:00:00Z' })) }];
  assert.equal(normalizeComments({ items }, '100', { from: 0, to: Date.now() + 1e12 }).length, 26);
  assert.throws(() => normalizeComments({ items: [...items, items[0]] }, '100', { from: 0, to: Date.now() }));
});
test('nonhome feed is selected from discovered board2 manifest, not default listPosts', async () => {
  const f = fixture(); f.plan.feedKey = 'feed-info';
  f.connector = { discoverFeeds: async () => [{ boardId: '2', feedKey: 'feed-info', endpointKind: 'info' }],
    enrichQ1FeedItems: async () => ({ items: [] }), listFeedContents: async input => {
      assert.equal(input.feed.feedKey, 'feed-info'); assert.equal(input.dailyBounded, false);
      return { items: [], hasMore: false, nextCursor: null };
    } };
  const report = await recoverDomesticFeed(f); assert.equal(report.inventory.length, 1); assert.ok(report.inventorySha256);
  assert.equal(report.allFeedsComplete, false);
});
test('foreign board feed is rejected without storage', async () => {
  const f = fixture(); f.connector = { discoverFeeds: async () => [{ boardId: '3', feedKey: 'foreign' }] };
  await assert.rejects(recoverDomesticFeed(f), { code: 'DOMESTIC_FEED_SCOPE_MISMATCH' });
});
