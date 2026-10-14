'use strict';
const crypto = require('node:crypto');
const { canonical, contractOf } = require('./overseasBigPlayerRunContractJournal');
const fail = () => { throw Object.assign(new Error('Overseas task identity invalid'), { code: 'OVERSEAS_STAGE_TASK_INVALID' }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
// Epoch/owner intentionally excluded: the same exact task survives reclaim.
function taskDescriptor(value, input = {}) {
  const c = contractOf(value);
  const { taskKind, taskKey, syncScope, rootPlatformContentId = '', feed = null, commentId = null, sortType = null } = input;
  if (typeof taskKey !== 'string' || taskKey.length > 200 || !taskKey.startsWith(`board:${c.boardId}:`)) fail();
  if (taskKind === 'q1_feed') {
    if (syncScope !== 'posts' || rootPlatformContentId !== '' || !feed || typeof feed.feedKey !== 'string'
      || !feed.feedKey.trim() || feed.feedKey !== feed.feedKey.trim() || taskKey !== `board:${c.boardId}:${feed.feedKey}`
      || String(feed.boardId) !== c.boardId || commentId !== null || sortType !== null) fail();
  } else if (taskKind === 'comments') {
    if (syncScope !== 'comments' || !/^[1-9]\d*$/.test(rootPlatformContentId)
      || taskKey !== `board:${c.boardId}:${rootPlatformContentId}` || feed !== null || commentId !== null || sortType !== null) fail();
  } else if (taskKind === 'q1_reply') {
    if (syncScope !== 'comments' || !/^[1-9]\d*$/.test(rootPlatformContentId) || !/^[1-9]\d*$/.test(commentId)
      || ![0, 1, 2].includes(sortType) || taskKey !== `board:${c.boardId}:reply:${commentId}:${sortType}` || feed !== null) fail();
  } else fail();
  const scope = Object.fromEntries(['runId', 'sourceId', 'accountId', 'gameId', 'communityId', 'siteId', 'boardId', 'windowStart', 'windowEnd'].map(k => [k, c[k]]));
  // Only JSON values may enter the immutable descriptor; credentials/transport are not task metadata.
  let copy; try { copy = JSON.parse(canonical(feed)); } catch { fail(); }
  const unsafe = data => data && typeof data === 'object' && Object.entries(data).some(([key, item]) => /token|secret|password|authorization|credential/i.test(key) || unsafe(item));
  if (unsafe(copy)) fail();
  return immutable({ ...scope, taskKind, taskKey, syncScope, rootPlatformContentId, feed: copy, commentId, sortType });
}
function taskIdentity(descriptor) { return sha(canonical(descriptor)); }
function schemaDescriptors(contract, feeds) {
  if (!Array.isArray(feeds) || !feeds.length || feeds.length > 1000) fail();
  const c = contractOf(contract), keys = new Set();
  const result = feeds.map(feed => {
    if (!feed || keys.has(feed.feedKey)) fail(); keys.add(feed.feedKey);
    return taskDescriptor(c, { taskKind: 'q1_feed', taskKey: `board:${c.boardId}:${feed.feedKey}`, syncScope: 'posts', feed });
  });
  return Object.freeze(result.sort((a, b) => a.taskKey.localeCompare(b.taskKey)));
}
function pageTargets(value, input = {}) {
  const c = contractOf(value), targets = new Map();
  const add = descriptor => targets.set(taskIdentity(descriptor), descriptor);
  if (!Array.isArray(input.items) || (input.replyTargets != null && !Array.isArray(input.replyTargets))) fail();
  if (input.syncScope === 'posts') for (const item of input.items) {
    if (item.recoveryContextAncestor || item.isDeleted) continue;
    if (String(item.boardId) !== c.boardId || Number(item.contentDepth || 0) !== 0 || (item.contentType && item.contentType !== 'post')) fail();
    const root = String(item.externalId || '');
    add(taskDescriptor(c, { taskKind: 'comments', taskKey: `board:${c.boardId}:${root}`, syncScope: 'comments', rootPlatformContentId: root }));
  }
  for (const target of input.replyTargets || []) {
    const root = String(target.postId || ''), commentId = String(target.commentId || '');
    if (input.syncScope !== 'comments' || root !== input.rootPlatformContentId) fail();
    add(taskDescriptor(c, { taskKind: 'q1_reply', taskKey: `board:${c.boardId}:reply:${commentId}:${target.sortType}`,
      syncScope: 'comments', rootPlatformContentId: root, commentId, sortType: target.sortType }));
  }
  return Object.freeze([...targets.values()]);
}
module.exports = { taskDescriptor, taskIdentity, schemaDescriptors, pageTargets };
