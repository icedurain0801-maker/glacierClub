'use strict';
const crypto = require('node:crypto');
const { plain } = require('./typesafeTestService');
const CONTEXT_PROVIDER = 'typesafe-v14-luna-context-review-v1';
const isComment = item => (item.contentType || item.content_type) === 'comment';
const text = value => plain(typeof value === 'string' ? value : '').slice(0, 4000);
function commentContext(item = {}) {
  if (!isComment(item)) return { status: 'not_applicable' };
  const supplied = item.analysisContext;
  const root = supplied?.root || (item.analysis_root_id ? { id: item.analysis_root_id, title: item.analysis_root_title, body: item.analysis_root_body } : null);
  if (!root || (!text(root.title) && !text(root.body))) return { status: 'missing' };
  const result = { status: 'available', root: { id: String(root.id || ''), title: text(root.title), body: text(root.body) } };
  const parent = supplied?.parent || (item.analysis_parent_id ? { id: item.analysis_parent_id, body: item.analysis_parent_body } : null);
  if (parent && parent.id !== root.id && text(parent.body)) result.parent = { id: String(parent.id || ''), body: text(parent.body) };
  return result;
}
const contextHash = item => crypto.createHash('sha256').update(JSON.stringify(commentContext(item))).digest('hex');
// Context is read only through the content's stored ancestry and original ownership.
const contextColumns = `root.id AS analysis_root_id,root.title AS analysis_root_title,root.body AS analysis_root_body,parent.id AS analysis_parent_id,parent.body AS analysis_parent_body`;
const contextJoins = `LEFT JOIN po_contents root ON c.content_type='comment' AND root.id=c.root_content_id AND root.content_type='post' AND root.is_deleted=0 AND root.game_id=c.game_id AND root.source_id=c.source_id AND root.account_id<=>c.account_id AND root.community_id<=>c.community_id AND JSON_UNQUOTE(JSON_EXTRACT(root.raw_payload,'$.boardId'))<=>JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$.boardId'))
  LEFT JOIN po_contents parent ON root.id IS NOT NULL AND parent.id=c.parent_content_id AND parent.content_type='comment' AND parent.is_deleted=0 AND parent.root_content_id=root.id AND parent.game_id=c.game_id AND parent.source_id=c.source_id AND parent.account_id<=>c.account_id AND parent.community_id<=>c.community_id AND JSON_UNQUOTE(JSON_EXTRACT(parent.raw_payload,'$.boardId'))<=>JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$.boardId'))`;
module.exports = { CONTEXT_PROVIDER, isComment, commentContext, contextHash, contextColumns, contextJoins };
