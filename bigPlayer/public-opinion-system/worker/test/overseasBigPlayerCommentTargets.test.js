'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { createOverseasCommentScope, currentPageCommentTargets, walkHistoricalCommentTargets } = require('../src/overseasBigPlayerCommentTargets');
const source = { id: 'source', platform: 'bigplayer_h5', region_code: 'overseas', game_id: 'game', community_id: 'community',
  siteId: 'site', siteUrl: 'https://club-en.q1.com/', config: { boardId: '500', baseUrl: 'https://club-en.q1.com/', siteUrls: [{ siteId: 'site', url: 'https://club-en.q1.com/' }] } };
const account = { id: 'account', source_id: 'source', game_id: 'game', community_id: 'community', platform: 'bigplayer_h5' };
const scope = createOverseasCommentScope(source, account);
const row = id => ({ id, external_id: id, source_id: 'source', account_id: 'account', game_id: 'game', community_id: 'community', site_id: 'site', board_id: '500', content_depth: 0, is_deleted: 0 });
test('unchanged and old parents still schedule comments, domestic and cross-account scopes reject', () => {
  const entry = { content: row('123'), raw: { externalId: '123', boardId: '500', publishedAt: '2020-01-01' }, change: 'unchanged' };
  assert.deepEqual(currentPageCommentTargets(scope, [entry, entry]), ['123']);
  assert.throws(() => createOverseasCommentScope({ ...source, region_code: 'domestic' }, account));
  assert.throws(() => createOverseasCommentScope(source, { ...account, id: '', source_id: 'other' }));
});
test('historical parents exhaust keyset pages and guard every load', async () => {
  const targets = [], cursors = []; let checks = 0;
  await walkHistoricalCommentTargets({ scope, check: () => checks++, loadPage: async ({ afterId }) => {
    cursors.push(afterId); return { rows: [row(afterId ? '2' : '1')], hasMore: !afterId, nextCursor: '1' };
  }, onTarget: id => targets.push(id) });
  assert.deepEqual(targets, ['1', '2']); assert.deepEqual(cursors, ['', '1']); assert.ok(checks >= 6);
});
test('foreign site and unproven history never become complete; stalled cursor fails', async () => {
  for (const page of [{ rows: [{ ...row('1'), site_id: 'foreign' }], hasMore: false },
    { rows: [], hasMore: false, coverageGaps: 1 }, { rows: [], hasMore: true, nextCursor: '' }]) {
    await assert.rejects(walkHistoricalCommentTargets({ scope, check() {}, loadPage: async () => page, onTarget() {} }));
  }
});
