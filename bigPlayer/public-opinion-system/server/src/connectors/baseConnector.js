const crypto = require('node:crypto');

function sha256(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }

function normalizeRawContent(raw) {
  if (!raw || !raw.externalId || !raw.sourceUrl) throw new Error('INVALID_NORMALIZED_CONTENT');
  const title = String(raw.title || '').trim();
  const body = String(raw.body || '').trim();
  return {
    externalId: String(raw.externalId), contentType: raw.contentType || 'post', authorName: String(raw.authorName || '').trim(), title, body,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null, sourceUrl: String(raw.sourceUrl), engagement: raw.engagement || {}, media: Array.isArray(raw.media) ? raw.media.filter(Boolean).map(String) : [],
    fingerprint: sha256(`${title}\n${body}\n${raw.authorName || ''}`)
  };
}

function validatePagination({ cursor = null, limit = null, page } = {}) {
  if (limit != null && (!Number.isInteger(Number(limit)) || Number(limit) <= 0)) throw new ConnectorError('INVALID_PAGINATION', 'pagination limit must be a positive integer');
  if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean') throw new ConnectorError('MALFORMED_RESPONSE', 'connector page result is malformed');
  if (page.hasMore && (page.nextCursor == null || String(page.nextCursor) === String(cursor ?? ''))) throw new ConnectorError('INVALID_PAGINATION', 'pagination cursor did not advance');
  return page;
}

function flattenCommentTree(items, { rootPlatformContentId } = {}) {
  if (!Array.isArray(items)) throw new ConnectorError('MALFORMED_RESPONSE', 'comments payload must contain an item array');
  const seen = new Set();
  const flattened = [];
  const visit = (node, parentId = null, depth = 1, ancestors = new Set()) => {
    if (!node || typeof node !== 'object') throw new ConnectorError('MALFORMED_RESPONSE', 'comment node must be an object');
    const id = node.externalId ?? node.external_id ?? node.id ?? node.comment_id ?? node.cid;
    if (id == null || String(id).trim() === '') throw new ConnectorError('MALFORMED_RESPONSE', 'comment node id is required');
    const externalId = String(id);
    if (ancestors.has(externalId) || seen.has(externalId)) throw new ConnectorError('MALFORMED_RESPONSE', 'comment tree contains duplicate IDs or a cycle');
    seen.add(externalId);
    const explicitParent = node.platformParentId ?? node.platform_parent_id ?? node.parent_id ?? node.reply_to_id;
    const directParentId = parentId == null ? (explicitParent == null ? null : String(explicitParent)) : parentId;
    const nodeDepth = parentId == null && Array.isArray(node.children) === false && Array.isArray(node.replies) === false && node.contentDepth != null ? Number(node.contentDepth) : depth;
    flattened.push({ ...node, externalId, contentType: 'comment', rootPlatformContentId: String(rootPlatformContentId), platformParentId: directParentId, contentDepth: Number.isInteger(nodeDepth) && nodeDepth > 0 ? nodeDepth : depth });
    const nextAncestors = new Set(ancestors); nextAncestors.add(externalId);
    const children = [...(Array.isArray(node.children) ? node.children : []), ...(Array.isArray(node.replies) ? node.replies : [])];
    for (const child of children) visit(child, externalId, depth + 1, nextAncestors);
  };
  for (const item of items) visit(item);
  return flattened;
}
class ConnectorError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ConnectorError'; this.code = code; this.details = details; }
}
class ConnectorNotConfiguredError extends ConnectorError {
  constructor(platform) { super('CONNECTOR_NOT_CONFIGURED', `${platform} connector is not configured with an authorized API or session`, { platform }); this.platform = platform; }
}
class ConnectorCapabilityError extends ConnectorError {
  constructor(platform, capability) { super('CAPABILITY_UNSUPPORTED', `${platform} does not support ${capability}`, { platform, capability }); this.platform = platform; this.capability = capability; }
}
class ConnectorPageError extends ConnectorError {
  constructor(platform, capability, page, cause) { super('CONNECTOR_PAGE_FAILED', `${platform} ${capability} page ${page} failed`, { platform, capability, page, cause: cause?.code || cause?.message }); this.platform = platform; this.capability = capability; this.page = page; this.cause = cause; }
}
class ConnectorPageResult {
  constructor({ items = [], nextCursor = null, hasMore = false, capability = 'authorized_scope', completeness = null, retryAfterMs = null, platformWatermark = null, raw = null } = {}) {
    this.items = Array.isArray(items) ? items : [];
    this.nextCursor = nextCursor == null ? null : String(nextCursor);
    this.hasMore = Boolean(hasMore);
    this.capability = capability || 'authorized_scope';
    this.completeness = completeness || (this.hasMore ? 'partial' : 'complete');
    this.retryAfterMs = retryAfterMs == null ? null : Number(retryAfterMs);
    this.platformWatermark = platformWatermark ?? null;
    if (raw != null) Object.defineProperty(this, 'raw', { value: raw, enumerable: false });
  }
}
class BaseConnector {
  constructor({ platform, capabilities = [] }) { this.platform = platform; this.capabilities = [...capabilities]; }
  async installationHealth() { return { platform: this.platform, installed: false, configured: false, capabilities: this.capabilities }; }
  async accountHealth() { return { platform: this.platform, authorized: false, configured: false, capabilities: this.capabilities }; }
  async healthCheck(context) { return this.accountHealth(context); }
  hasCapability(capability) { return this.capabilities.includes(capability); }
  assertCapability(capability) { if (!this.hasCapability(capability)) throw new ConnectorCapabilityError(this.platform, capability); }
  async listOwnedContents(input) {
    if (typeof this.listPosts === 'function') return this.listPosts(input);
    throw new ConnectorCapabilityError(this.platform, 'owned_content');
  }
  async searchContents() { throw new ConnectorCapabilityError(this.platform, 'keyword_search'); }
  async detectCapabilities() {
    return Object.fromEntries(this.capabilities.map(capability => [capability, { status: 'supported' }]));
  }
  async collect() { throw new ConnectorNotConfiguredError(this.platform); }
}
module.exports = { sha256, normalizeRawContent, validatePagination, flattenCommentTree, ConnectorError, ConnectorNotConfiguredError, ConnectorCapabilityError, ConnectorPageError, ConnectorPageResult, BaseConnector };
