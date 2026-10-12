'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { taskDescriptor, taskIdentity, schemaDescriptors, pageTargets } = require('../src/overseasStageTaskIdentity');
const siteUrl = 'https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=2';
const c = { runId: '00000000-0000-0000-0000-000000000001', sourceId: '00000000-0000-0000-0000-000000000002', accountId: '00000000-0000-0000-0000-000000000003', gameId: '00000000-0000-0000-0000-000000000004', communityId: '00000000-0000-0000-0000-000000000005', siteId: 'en', boardId: '100017', siteUrl, siteUrlSha256: crypto.createHash('sha256').update(siteUrl).digest('hex'), windowStart: '2026-10-08T00:00:00.000Z', windowEnd: '2026-10-09T00:00:00.000Z', leaseOwner: 'owner1', leaseEpoch: 1, manifestSha256: 'a'.repeat(64) };
const feed = { feedKey: 'posts', boardId: '100017', pageKind: 'posts' };
test('task identity persists across epochs but never crosses run/site/window', () => {
  const input = { taskKind: 'q1_feed', taskKey: 'board:100017:posts', syncScope: 'posts', feed };
  const d = taskDescriptor(c, input);
  assert.equal(taskIdentity(d), taskIdentity(taskDescriptor({ ...c, leaseEpoch: 2, leaseOwner: 'owner2' }, input)));
  assert.notEqual(taskIdentity(d), taskIdentity(taskDescriptor({ ...c, siteId: 'fr' }, input)));
  assert.equal(Object.isFrozen(d.feed), true);
});
test('schema validates every feed and rejects duplicate/cross-board/secret descriptors', () => {
  assert.equal(schemaDescriptors(c, [feed]).length, 1);
  for (const feeds of [[], [feed, feed], [{ ...feed, boardId: '999' }], [{ ...feed, token: 'not-a-token' }]]) {
    assert.throws(() => schemaDescriptors(c, feeds), { code: 'OVERSEAS_STAGE_TASK_INVALID' });
  }
});
test('page expansion persists distinct business posts, excludes context and deleted', () => {
  const items = [{ externalId: '901', boardId: '100017' }, { externalId: '901', boardId: '100017' }, { externalId: '902', recoveryContextAncestor: true }, { externalId: '903', isDeleted: true }];
  const result = pageTargets(c, { syncScope: 'posts', items });
  assert.equal(result.length, 1); assert.equal(result[0].taskKey, 'board:100017:901');
});
test('reply identity rejects wrong root, unsupported sort and malformed parent', () => {
  const input = { syncScope: 'comments', rootPlatformContentId: '901', items: [], replyTargets: [{ postId: '901', commentId: '902', sortType: 0 }] };
  assert.equal(pageTargets(c, input)[0].taskKey, 'board:100017:reply:902:0');
  for (const target of [{ postId: '999', commentId: '902', sortType: 0 }, { postId: '901', commentId: '902', sortType: 3 }, { postId: '901', commentId: 'abc', sortType: 0 }]) {
    assert.throws(() => pageTargets(c, { ...input, replyTargets: [target] }), { code: 'OVERSEAS_STAGE_TASK_INVALID' });
  }
});
