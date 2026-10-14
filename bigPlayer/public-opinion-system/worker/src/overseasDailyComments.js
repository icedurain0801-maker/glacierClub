'use strict';
const {flattenCommentTree, normalizeRawContent} = require('../../server/src/connectors/baseConnector');
const fail = code => { throw Object.assign(new Error(code), {code}); };

async function ensureCommentRootScope(query, {sourceId, accountId, gameId, communityId, siteId, boardId, postId}) {
  const [root] = await query('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE', [sourceId,postId]);
  if (!root || root.account_id!==accountId || root.game_id!==gameId || root.community_id!==communityId
    || root.content_type!=='post' || Number(root.content_depth)!==0) fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT');
  let payload;try { payload=typeof root.raw_payload==='string'?JSON.parse(root.raw_payload):root.raw_payload||{}; }
  catch { fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT'); }
  const markers=[root.board_id,payload.boardId,payload._overseasScope?.boardId,payload._lastNightScope?.boardId].filter(value=>value!=null);
  if (markers.some(value=>String(value)!==boardId)) fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT');
  if (!markers.length) {
    const [membership]=await query(`SELECT id FROM po_content_feed_memberships WHERE content_id=? AND account_id=?
      AND JSON_UNQUOTE(JSON_EXTRACT(feed_metadata,'$.siteId'))=?
      AND JSON_UNQUOTE(JSON_EXTRACT(feed_metadata,'$.boardId'))=? LIMIT 1`,[root.id,accountId,siteId,boardId]);
    if (!membership) fail('OVERSEAS_COMMENT_ROOT_MEMBERSHIP_REQUIRED');
    await query('UPDATE po_contents SET raw_payload=? WHERE id=?',
      [JSON.stringify({...payload,_overseasScope:{...payload._overseasScope,boardId}}),root.id]);
  }
  return root;
}

function commentRootTasks(candidates, sites, siteId) {
  const roots = new Map();
  for (const candidate of candidates) {
    if (!sites.some(site => site.site_id === candidate.site_id)) continue;
    if (!roots.has(candidate.external_id)) roots.set(candidate.external_id, new Set());
    roots.get(candidate.external_id).add(candidate.site_id);
  }
  const englishSite = sites.find(site => new URL(site.url).searchParams.get('languageId') === '2')?.site_id;
  return [...roots].filter(([_id, memberships]) => (memberships.size > 1 ? englishSite : [...memberships][0]) === siteId)
    .map(([postId]) => ({postId, commentId: null, sortType: 0, cursor: null, pages: 0, done: false}));
}

function commentItems(page, task, intent, boardId) {
  const items = flattenCommentTree(page.items, {rootPlatformContentId: task.postId});
  const byId = new Map(items.map(item => [item.externalId, item]));
  const needed = new Set();
  const inWindow = item => {
    const at = item.publishedAt == null ? NaN : +new Date(item.publishedAt);
    if (!Number.isFinite(at)) fail('OVERSEAS_COMMENT_TIME_INVALID');
    return at >= +new Date(intent.windowStart) && at < +new Date(intent.windowEnd);
  };
  for (const item of items) if (inWindow(item)) needed.add(item.externalId);
  for (const target of page.replyTargets || []) {
    if (String(target.postId) !== task.postId || !/^\d+$/.test(String(target.commentId))) fail('OVERSEAS_COMMENT_REPLY_SCOPE');
    needed.add(String(target.commentId));
  }
  for (const id of needed) {
    const parent = byId.get(id)?.platformParentId;
    if (parent && parent !== task.postId && byId.has(parent)) needed.add(parent);
  }
  return items.filter(item => needed.has(item.externalId)).map(item => ({...item,
    ...normalizeRawContent(item), boardId, contentDepth: task.commentId ? 2 : item.contentDepth,
    platformParentId: task.commentId || (item.contentDepth === 1 ? task.postId : item.platformParentId || task.postId),
    recoveryContextAncestor: !inWindow(item),
    rawPayload: {...item.rawPayload, boardId, _overseasScope: {boardId}}}));
}

function advanceComments(receipt, page, taskIndex) {
  const tasks = receipt.commentTasks.map(task => ({...task}));
  const task = tasks[taskIndex];
  if (!task || task.done) fail('OVERSEAS_COMMENT_CHECKPOINT_CONFLICT');
  for (const target of page.replyTargets || []) {
    if (String(target.postId) !== task.postId || !/^\d+$/.test(String(target.commentId))) fail('OVERSEAS_COMMENT_REPLY_SCOPE');
    if (!tasks.some(candidate => candidate.postId === task.postId && candidate.commentId === String(target.commentId))) {
      tasks.push({postId: task.postId, commentId: String(target.commentId), sortType: target.sortType || 0, cursor: null, pages: 0, done: false});
    }
  }
  tasks[taskIndex] = {...task, cursor: page.nextCursor, pages: task.pages + 1, done: !page.hasMore};
  return {commentTasks: tasks, phase: 'comments', done: tasks.every(candidate => candidate.done)};
}

async function collectComments({connector, scoped, account, child, intent, feed, check, commit, maxPages = 100, signal}) {
  for (let index = 0; index < child.receipt.commentTasks.length; index++) {
    let task = child.receipt.commentTasks[index];
    if (task.done) continue;
    let pagesThisAttempt = 0;
    while (!task.done) {
      if (++pagesThisAttempt > maxPages) fail('OVERSEAS_COMMENT_PAGE_BUDGET');
      await check();
      // Keep ancestry and reply targets from old top-level comments, then
      // filter by the comment timestamp at storage, never by the post date.
      const page = await connector.listComments({source: scoped, account, signal,
        postId: task.postId, commentId: task.commentId, sortType: task.sortType,
        cursor: task.cursor, limit: 20, dailyBounded: false});
      if (!Array.isArray(page.items) || typeof page.hasMore !== 'boolean'
        || (page.hasMore && (!page.nextCursor || page.nextCursor === task.cursor))) fail('OVERSEAS_PRODUCTION_PAGINATION_INVALID');
      const items = commentItems(page, task, intent, '100017');
      const receiptPatch = advanceComments(child.receipt, page, index);
      const result = await commit({...page, items, syncScope: 'comments', rootPlatformContentId: task.postId, receiptPatch}, feed);
      child.receipt = result.receipt;
      task = child.receipt.commentTasks[index];
    }
  }
  return {status: 'completed', siteId: child.site.site_id};
}

module.exports = {ensureCommentRootScope, commentRootTasks, commentItems, advanceComments, collectComments};
