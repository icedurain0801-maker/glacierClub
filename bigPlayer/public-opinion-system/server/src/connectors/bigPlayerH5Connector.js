const { BaseConnector, ConnectorError, ConnectorPageError, ConnectorPageResult, normalizeRawContent, validatePagination, flattenCommentTree } = require('./baseConnector');

function parseList(value, fallback) { return value ? value.split(',').map(item => item.trim()).filter(Boolean) : fallback; }
function capabilityStatusFromError(error) {
  const code = error?.cause?.code || error?.code || 'unreachable';
  if (['UNAUTHORIZED', 'PERMISSION_DENIED'].includes(code)) return 'unauthorized';
  if (code === 'RATE_LIMITED') return 'limited';
  return code;
}

function hostOf(url) { try { return new URL(url).host; } catch { return ''; } }
function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password
      && !parsed.hash;
  } catch { return false; }
}
function sameHost(url, allowedHosts) { const host = hostOf(url); return Boolean(host) && allowedHosts.includes(host); }
function isQ1Source(source) { return hostOf(parseSourceConfig(source).baseUrl).toLowerCase() === 'club.q1.com'; }
function authorizationValue(token) {
  const value = String(token || '').trim();
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}
function q1Language(value) {
  const language = String(value || '').trim().toLowerCase();
  if (!language || language === 'zh-cn' || language === 'zh-hans') return 'zh-Hans';
  return value;
}
function q1Context(source) {
  const baseUrl = new URL(parseSourceConfig(source).baseUrl);
  return {
    baseUrl,
    gameId: baseUrl.searchParams.get('gameId') || '',
    gameVersion: baseUrl.searchParams.get('gameVersion') || '',
    env: baseUrl.searchParams.get('env') || 'web',
    language: q1Language(baseUrl.searchParams.get('lang'))
  };
}
function q1Boards(payload) {
  const candidates = [];
  const visit = (value, key = '') => {
    if (!value || typeof value !== 'object') return;
    if (/board/i.test(key)) {
      if (Array.isArray(value)) candidates.push(...value);
      else candidates.push(value);
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  };
  visit(payload);
  const seen = new Set();
  const boards = candidates.filter(item => item && typeof item === 'object' && item.id != null).map(item => ({ id: String(item.id), name: String(item.name || '').trim() })).filter(item => {
    if (!item.id.trim() || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  if (!boards.length) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 user context did not return a board');
  return boards;
}
function q1Board(payload) { return q1Boards(payload)[0].id; }
function q1Array(...values) { return values.find(Array.isArray) || []; }
function q1GroupCandidates(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    const groupLike = value.filter(item => item && typeof item === 'object' && (item.id != null || item.sectionId != null) && item.type != null && (item.sections || item.children || item.items || item.subSections || item.name));
    if (groupLike.length) result.push(groupLike);
    for (const item of value) q1GroupCandidates(item, result);
    return result;
  }
  for (const child of Object.values(value)) q1GroupCandidates(child, result);
  return result;
}
function q1PositiveId(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(value).trim() : null;
}
function q1FeedKey(feed) {
  return [feed.boardId, feed.pageKind, feed.endpointKind, feed.groupId ?? '', feed.sectionId ?? '', feed.type ?? '', feed.orderType ?? '', feed.isUltimate == null ? '' : Number(Boolean(feed.isUltimate))].join(':');
}
function q1BoardFeeds(payload, board) {
  const data = payload?.data;
  const schema = data?.board || data?.model || data;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 board schema is malformed');
  const groups = q1Array(data?.groups, schema?.groups, payload?.groups, data?.boardGroups, schema?.boardGroups, data?.tabs, schema?.tabs, ...q1GroupCandidates(payload));
  if (!groups.length) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 board schema did not return groups');
  const feeds = [];
  const keys = new Set();
  const add = descriptor => {
    const feed = {
      boardId: String(board.id),
      groupId: descriptor.groupId == null ? null : String(descriptor.groupId),
      sectionId: descriptor.sectionId == null ? null : String(descriptor.sectionId),
      orderType: descriptor.orderType == null ? null : Number(descriptor.orderType),
      isUltimate: descriptor.isUltimate == null ? null : Boolean(descriptor.isUltimate),
      ...descriptor
    };
    feed.feedKey = q1FeedKey(feed);
    if (!keys.has(feed.feedKey)) { keys.add(feed.feedKey); feeds.push(feed); }
  };
  add({ pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null });
  const childrenOf = node => q1Array(node?.sections, node?.children, node?.items, node?.subSections);
  const addInfo = (node, group) => {
    const sectionId = q1PositiveId(node?.id ?? node?.sectionId);
    if (sectionId) add({ pageKind: 'info', endpointKind: 'info', groupId: String(group.id ?? group.sectionId), groupType: Number(group.type), sectionId, tabName: String(node?.name || group.name || '').trim(), type: 1, orderType: node?.orderType ?? null, isUltimate: node?.isUltimate ?? childrenOf(node).length === 0 });
    for (const child of childrenOf(node)) addInfo(child, group);
  };
  for (const group of groups) {
    const groupId = q1PositiveId(group?.id ?? group?.sectionId);
    const groupType = Number(group?.type);
    if (!groupId || !Number.isInteger(groupType)) continue;
    if (groupType === 0) {
      addInfo(group, group);
    } else if (groupType === 1) {
      const common = { pageKind: 'circle', endpointKind: 'activity', groupId, groupType, sectionId: groupId, orderType: group?.orderType ?? null, isUltimate: false };
      add({ ...common, tabName: '全部', type: 3 });
      add({ ...common, tabName: '精选', type: 4 });
      const visit = node => {
        const children = childrenOf(node);
        const sectionId = q1PositiveId(node?.id ?? node?.sectionId);
        if (sectionId && sectionId !== groupId) add({ pageKind: 'circle', endpointKind: 'activity', groupId, groupType, sectionId, tabName: String(node?.name || '').trim(), type: 5, orderType: node?.orderType ?? group?.orderType ?? null, isUltimate: node?.isUltimate ?? children.length === 0 });
        for (const child of children) visit(child);
      };
      for (const child of childrenOf(group)) visit(child);
    }
  }
  if (feeds.length === 1) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 board schema did not expose info or circle feeds');
  return feeds;
}
function q1FeedCursor(value, feed) {
  const initial = { version: 1, endpointKind: feed.endpointKind, feedKey: feed.feedKey, pageIndex: 1, offsetId: 0, previousFingerprint: null };
  if (value == null || value === '') return initial;
  let parsed;
  try { parsed = JSON.parse(String(value)); } catch { throw new ConnectorError('INVALID_PAGINATION', 'Q1 feed pagination cursor is invalid'); }
  const pageIndex = Number(parsed.pageIndex);
  const offsetId = Number(parsed.offsetId);
  if (parsed.version !== 1 || parsed.endpointKind !== feed.endpointKind || parsed.feedKey !== feed.feedKey || !Number.isInteger(pageIndex) || pageIndex < 1 || !Number.isInteger(offsetId) || offsetId < 0) throw new ConnectorError('INVALID_PAGINATION', 'Q1 feed pagination cursor does not match the feed');
  return { version: 1, endpointKind: feed.endpointKind, feedKey: feed.feedKey, pageIndex, offsetId, previousFingerprint: parsed.previousFingerprint == null ? null : String(parsed.previousFingerprint) };
}
function q1PageData(payload) {
  const data = payload?.data;
  const items = q1Array(data, data?.items, data?.list, data?.records, data?.rows, data?.posts, payload?.items, payload?.list);
  const meta = data && !Array.isArray(data) ? data : payload;
  const bool = (...values) => { for (const value of values) { if (typeof value === 'boolean') return value; if (value === 1 || value === '1' || value === 'true') return true; if (value === 0 || value === '0' || value === 'false') return false; } return null; };
  const number = (...values) => { for (const value of values) { const parsed = Number(value); if (Number.isFinite(parsed)) return parsed; } return null; };
  return { items, hasMore: bool(meta?.hasMore, meta?.hasNext, payload?.hasMore, payload?.hasNext), total: number(meta?.total, meta?.totalCount, meta?.count, payload?.total, payload?.totalCount, payload?.count), nextOffset: number(meta?.nextOffset, meta?.nextOffsetId, meta?.next_offset, payload?.nextOffset, payload?.nextOffsetId) };
}
function q1PageFingerprint(items) { return items.map(item => String(item?.id ?? item?.postId ?? '')).join(','); }
function q1Body(content) {
  const textKeys = new Set(['text', 'value', 'content', 'data', 'desc', 'description', 'title']);
  const parts = [];
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      if (value.trim()) parts.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, key));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [childKey, childValue] of Object.entries(value)) {
      if (textKeys.has(childKey) || childKey === 'data' || childKey === 'children' || childKey === 'blocks') visit(childValue, childKey);
    }
  };
  visit(content);
  return [...new Set(parts)].join('\n').trim();
}
function q1Media(content) {
  const mediaKeys = new Set(['url', 'imageUrl', 'image_url', 'src', 'image', 'images', 'pics', 'pictures', 'attachments', 'media']);
  const urls = [];
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      if ((mediaKeys.has(key) || /^(https?:)?\/\//i.test(value.trim())) && value.trim() && !urls.includes(value.trim())) urls.push(value.trim());
      return;
    }
    if (Array.isArray(value)) { value.forEach(item => visit(item, key)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [childKey, childValue] of Object.entries(value)) {
      if (mediaKeys.has(childKey) || childKey === 'data' || childKey === 'content' || childKey === 'children') visit(childValue, childKey);
    }
  };
  visit(content);
  return urls;
}

const Q1_RAW_POST_FIELDS = Object.freeze([
  'id', 'postId', 'title', 'content', 'commentCount', 'thumbsUpCount', 'clickCount',
  'createTime', 'updateTime', 'user', 'boardId', 'sectionId', 'type', 'status',
  'moderatorIsDelete', 'isDeleted', 'tags', 'topic'
]);
const Q1_SENSITIVE_RAW_KEYS = new Set(['authorization', 'sessionid', 'apikey', 'credential', 'bearer', 'privatekey']);
function q1PlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function q1HasTextContent(content) {
  let found = false;
  const visit = value => {
    if (found) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text && !safeHttpUrl(text)) found = true;
      return;
    }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!q1PlainObject(value)) return;
    if (Number(value.type) === 1) return;
    for (const [key, child] of Object.entries(value)) {
      if (['text', 'value', 'content', 'data', 'desc', 'description', 'title', 'children', 'blocks'].includes(key)) visit(child);
    }
  };
  visit(content);
  return found;
}
function q1MergeNonNull(base, patch) {
  if (!q1PlainObject(patch)) return patch == null ? base : patch;
  const merged = q1PlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) continue;
    merged[key] = q1PlainObject(value) ? q1MergeNonNull(merged[key], value) : value;
  }
  return merged;
}
function q1SensitiveKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /token|password|secret|cookie/i.test(key) || Q1_SENSITIVE_RAW_KEYS.has(normalized);
}
function q1StripSensitive(value) {
  if (Array.isArray(value)) return value.map(q1StripSensitive);
  if (!q1PlainObject(value)) return value;
  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (q1SensitiveKey(key)) continue;
    safe[key] = q1StripSensitive(child);
  }
  return safe;
}
function q1SafeRawPost(item) {
  const raw = {};
  for (const key of Q1_RAW_POST_FIELDS) if (item?.[key] !== undefined) raw[key] = q1StripSensitive(item[key]);
  if (item?._contentIntegrity) raw._contentIntegrity = q1StripSensitive(item._contentIntegrity);
  return raw;
}
function q1EnrichedPost(listItem, detailItem) {
  const merged = q1MergeNonNull(listItem, detailItem);
  merged.id = listItem.id;
  merged.createTime = listItem.createTime;
  merged.content = detailItem.content;
  merged._contentMedia = [...new Set([...q1Media(listItem.content), ...q1Media(detailItem.content)])];
  merged._contentIntegrity = { status: 'detail_enriched' };
  return merged;
}
function q1FallbackPost(listItem, code) {
  return { ...listItem, _contentIntegrity: { status: 'summary_fallback', code } };
}

function q1Post(item, context) {
  const id = item?.id;
  if (id == null) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 post id is required');
  const personality = item.user?.personality || {};
  const account = item.user?.account || {};
  const detail = new URL('/api/club/v1/auth/post/', context.baseUrl);
  detail.searchParams.set('postId', String(id));
  detail.searchParams.set('source', '0');
  return {
    externalId: String(id),
    contentType: 'post',
    title: String(item.title || '').trim(),
    body: q1Body(item.content),
    media: Array.isArray(item._contentMedia) ? item._contentMedia : q1Media(item.content),
    rawPayload: q1SafeRawPost(item),
    authorName: String(personality.nickName || personality.nickname || '').trim(),
    platformAuthorId: account.id == null ? null : String(account.id),
    publishedAt: item.createTime || null,
    sourceUrl: detail.toString(),
    engagement: {
      comments: Number(item.commentCount || 0),
      likes: Number(item.thumbsUpCount || 0),
      views: Number(item.clickCount || 0)
    },
    boardId: item.boardId == null ? null : String(item.boardId),
    sectionId: item.sectionId == null ? null : String(item.sectionId),
    type: item.type == null ? null : Number(item.type),
    status: item.status ?? null,
    moderatorIsDelete: item.moderatorIsDelete === true,
    isDeleted: item.isDeleted === true || item.moderatorIsDelete === true || (item.status != null && Number(item.status) < 0)
  };
}
function q1Comment(item, context, rootContentId, parentId = null) {
  const id = item?.id;
  if (id == null) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 comment id is required');
  const user = item.user || {};
  const personality = user.personality || {};
  const account = user.account || {};
  const detail = new URL('/api/club/v1/auth/post/', context.baseUrl);
  detail.searchParams.set('postId', String(rootContentId));
  detail.searchParams.set('source', '0');
  return {
    externalId: String(id),
    contentType: 'comment',
    title: '',
    body: q1Body(item.content),
    media: q1Media(item.content),
    rawPayload: item,
    authorName: String(personality.nickName || personality.nickname || '').trim(),
    platformAuthorId: account.id == null ? null : String(account.id),
    publishedAt: item.createTime || null,
    sourceUrl: detail.toString(),
    platformParentId: parentId == null ? (item.parentId == null ? null : String(item.parentId)) : String(parentId),
    rootPlatformContentId: String(rootContentId),
    contentDepth: parentId == null && item.parentId == null ? 1 : 2,
    engagement: { likes: Number(item.thumbsUpCount || 0) },
    isDeleted: item.isDeleted === true || item.moderatorIsDelete === true || item.isEnabled === false || (item.status != null && Number(item.status) < 0)
  };
}
function q1CommentCursor(value) {
  if (value == null || value === '') return { version: 1, offsetId: '0', sortType: 0, commentId: null, previousFingerprint: null };
  try {
    const parsed = JSON.parse(String(value));
    const offsetId = String(parsed.offsetId ?? '').trim();
    const sortType = Number(parsed.sortType ?? 0);
    const commentId = parsed.commentId == null || parsed.commentId === '' ? null : String(parsed.commentId);
    if (parsed.version === 1 && offsetId && Number.isInteger(sortType) && sortType >= 0 && sortType <= 2) return { version: 1, offsetId, sortType, commentId, previousFingerprint: parsed.previousFingerprint == null ? null : String(parsed.previousFingerprint) };
  } catch {}
  throw new ConnectorError('INVALID_PAGINATION', 'Q1 comment pagination cursor is invalid');
}
function q1CommentPage(payload, { rootContentId, commentId, cursor, limit, context }) {
  if (!payload || !Array.isArray(payload.data) || !Number.isFinite(Number(payload.total))) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 comment response is malformed');
  const seen = new Set();
  const replyTargets = [];
  const items = payload.data.map(item => {
    const top = q1Comment(item, context, rootContentId, commentId);
    const replies = q1Array(item.replies, item.children).map(reply => q1Comment(reply, context, rootContentId, top.externalId));
    for (const entry of [top, ...replies]) {
      if (seen.has(entry.externalId)) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 comment page contains duplicate IDs');
      seen.add(entry.externalId);
    }
    if (commentId == null && (Number(item.commentCount || 0) > replies.length || item.hasMore === true || item.repliesHasMore === true)) replyTargets.push({ postId: String(rootContentId), commentId: top.externalId, sortType: cursor.sortType });
    return replies.length ? { ...top, replies } : top;
  });
  const pageSize = Number(limit);
  const total = Number(payload.total);
  const fingerprint = q1PageFingerprint(payload.data);
  if (items.length && fingerprint === cursor.previousFingerprint) throw new ConnectorError('INVALID_PAGINATION', 'Q1 comment pagination returned a duplicate page');
  const explicitHasMore = q1PageData(payload).hasMore;
  const hasMore = items.length > 0 && (explicitHasMore == null ? (items.length >= pageSize && items.length < total) : explicitHasMore);
  const nextOffset = items.length ? String(payload.data.at(-1)?.id ?? '') : '';
  if (hasMore && (!nextOffset || nextOffset === cursor.offsetId)) throw new ConnectorError('INVALID_PAGINATION', 'Q1 comment pagination cursor did not advance');
  if (!items.length && total > 0 && cursor.offsetId === '0') throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 comment response is empty before total is reached');
  const page = new ConnectorPageResult({
    items,
    nextCursor: hasMore ? JSON.stringify({ version: 1, offsetId: nextOffset, sortType: cursor.sortType, commentId, previousFingerprint: fingerprint }) : null,
    hasMore,
    capability: 'authorized_scope',
    raw: payload
  });
  page.replyTargets = replyTargets;
  return page;
}
function parseSourceConfig(source) {
  const raw = source && source.config;
  const cfg = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
  const baseUrl = typeof cfg.baseUrl === 'string' ? cfg.baseUrl.trim() : '';
  const startPaths = Array.isArray(cfg.startPaths) && cfg.startPaths.length ? cfg.startPaths.map(String) : ['/'];
  return {
    ...cfg,
    baseUrl,
    startPaths,
    postsApiUrl: String(cfg.postsApiUrl || cfg.posts_api_url || '').trim(),
    commentsApiUrl: String(cfg.commentsApiUrl || cfg.comments_api_url || '').trim()
  };
}
function htmlText(html) { return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function titleFrom(html) { return (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim(); }
function firstDefined(object, keys, fallback = null) { for (const key of keys) if (object?.[key] != null) return object[key]; return fallback; }
function extractPage(payload) {
  const data = payload?.data ?? payload ?? {};
  const items = firstDefined(data, ['items', 'list', 'records', 'rows'], undefined);
  const nextCursor = firstDefined(data, ['nextCursor', 'next_cursor', 'cursor']);
  const hasMore = firstDefined(data, ['hasMore', 'has_more'], undefined);
  if (!Array.isArray(items) || typeof hasMore !== 'boolean') throw new ConnectorError('MALFORMED_RESPONSE', 'H5 API page result is malformed');
  return new ConnectorPageResult({
    items,
    nextCursor,
    hasMore,
    capability: firstDefined(data, ['capability', 'completeness'], 'authorized_scope'),
    platformWatermark: firstDefined(data, ['watermark', 'updatedSince', 'updated_since']),
    raw: payload
  });
}

function combinedSignal(signal, timeoutMs) {
  const timeoutSignal = Number.isFinite(timeoutMs) && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  if (!signal) return timeoutSignal;
  if (!timeoutSignal) return signal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeoutSignal]);
  const controller = new AbortController();
  const abort = source => { if (!controller.signal.aborted) controller.abort(source.reason); };
  if (signal.aborted) abort(signal); else signal.addEventListener('abort', () => abort(signal), { once: true });
  if (timeoutSignal.aborted) abort(timeoutSignal); else timeoutSignal.addEventListener('abort', () => abort(timeoutSignal), { once: true });
  return controller.signal;
}
function abortedError(signal) { return signal?.reason instanceof Error ? signal.reason : new ConnectorError('COLLECTION_CANCELLED', 'collection was cancelled'); }
function q1CancellationCause(error, signal) {
  const cancellationCodes = new Set(['COLLECTION_CANCELLED', 'SYNC_RUN_LEASE_LOST', 'CHECKPOINT_LEASE_LOST', 'DAILY_RUN_TIMEOUT', 'ABORT_ERR']);
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (cancellationCodes.has(current.code) || current.name === 'AbortError') return error;
    current = current.cause;
  }
  if (signal?.aborted) return abortedError(signal);
  return null;
}
function q1DetailFallbackCode(error) {
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (current.code === 'MALFORMED_RESPONSE' || current.code === 'DETAIL_RESPONSE_INVALID') return 'DETAIL_RESPONSE_INVALID';
    current = current.cause;
  }
  return 'DETAIL_FETCH_FAILED';
}
async function q1ConcurrentMap(items, concurrency, mapper, signal) {
  if (!items.length) return [];
  if (signal?.aborted) throw abortedError(signal);
  const results = new Array(items.length);
  const controller = new AbortController();
  const poolSignal = signal
    ? (typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, controller.signal])
        : (() => {
            const combined = new AbortController();
            const forward = source => { if (!combined.signal.aborted) combined.abort(source.reason); };
            if (signal.aborted) forward(signal); else signal.addEventListener('abort', () => forward(signal), { once: true });
            controller.signal.addEventListener('abort', () => forward(controller.signal), { once: true });
            return combined.signal;
          })())
    : controller.signal;
  let nextIndex = 0;
  let fatalError = null;
  const fail = error => {
    if (fatalError) return;
    fatalError = error;
    if (!controller.signal.aborted) controller.abort(error);
  };
  const worker = async () => {
    while (!fatalError) {
      if (poolSignal.aborted) return;
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;
      try { results[index] = await mapper(items[index], index, poolSignal); }
      catch (error) { fail(error); return; }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (fatalError) throw fatalError;
  if (poolSignal.aborted) throw abortedError(poolSignal);
  return results;
}

class BigPlayerH5Connector extends BaseConnector {
  constructor(env = process.env, { credentialContext = null, fetchImpl = globalThis.fetch, authRefreshCoordinator = null } = {}) {
    super({ platform: 'bigplayer_h5', capabilities: ['posts', 'comments', 'owned_content'] });
    this.enabled = env.BIGPLAYER_H5_ENABLED === 'true' || env.BIGPLAYER_H5_ENABLED === '1';
    this.envBaseUrl = env.BIGPLAYER_H5_API_BASE_URL || env.BIGPLAYER_H5_BASE_URL || '';
    this.allowedHosts = parseList(env.BIGPLAYER_H5_ALLOWED_HOSTS, hostOf(this.envBaseUrl) ? [hostOf(this.envBaseUrl)] : []);
    this.paths = { posts: env.BIGPLAYER_H5_POSTS_PATH || '/internal/opinion/posts', comments: env.BIGPLAYER_H5_COMMENTS_PATH || '/internal/opinion/posts/:postId/comments' };
    this.credentialContext = credentialContext;
    this.authRefreshCoordinator = authRefreshCoordinator;
    this.fetchImpl = fetchImpl;
    this.cookie = env.BIGPLAYER_H5_AUTH_COOKIE || '';
    this.bearer = env.BIGPLAYER_H5_BEARER_TOKEN || '';
    this.maxDepth = Number(env.BIGPLAYER_H5_MAX_DEPTH || 5);
    this.maxPages = Number(env.BIGPLAYER_H5_MAX_PAGES || 100);
    this.delayMs = Number(env.BIGPLAYER_H5_DELAY_MS || 500);
    this.timeoutMs = Number(env.BIGPLAYER_H5_TIMEOUT_MS || 15000);
  }
  hostAllowed(url) { return safeHttpUrl(url) && sameHost(url, this.allowedHosts); }
  resolveBaseUrl(source) { return parseSourceConfig(source).baseUrl || this.envBaseUrl; }
  endpointFor(capability, source, pathParams = {}) {
    const config = parseSourceConfig(source);
    const direct = { posts: config.postsApiUrl, comments: config.commentsApiUrl }[capability];
    if (direct) return direct;
    const baseUrl = this.resolveBaseUrl(source);
    if (!baseUrl) return '';
    let endpoint = this.paths[capability];
    for (const [key, value] of Object.entries(pathParams)) endpoint = endpoint.replace(`:${key}`, encodeURIComponent(String(value)));
    return new URL(endpoint, baseUrl).toString();
  }
  endpointStatus(source) {
    const config = parseSourceConfig(source);
    const legacyBase = this.resolveBaseUrl(source);
    return {
      posts: config.postsApiUrl || legacyBase ? 'configured' : 'unconfigured',
      comments: isQ1Source(source) ? (legacyBase ? 'configured' : 'unconfigured') : config.commentsApiUrl || legacyBase ? 'configured' : 'unconfigured'
    };
  }
  hasSourceCapability(capability, source) {
    if (capability === 'owned_content') capability = 'posts';
    if (!this.hasCapability(capability)) return false;
    return this.endpointStatus(source)[capability] === 'configured';
  }
  async installationHealth(source) {
    const endpoints = this.endpointStatus(source);
    const legacyBase = this.resolveBaseUrl(source);
    const q1 = isQ1Source(source);
    const urls = q1 ? [legacyBase] : ['posts', 'comments'].map(capability => this.endpointFor(capability, source)).filter(Boolean);
    const hostsAllowed = urls.every(url => this.hostAllowed(url));
    const required = endpoints.posts === 'configured' && endpoints.comments === 'configured';
    const installed = this.enabled && required && hostsAllowed;
    const reason = !this.enabled ? 'disabled by configuration' : !required ? (legacyBase ? 'postsApiUrl and commentsApiUrl are required' : 'baseUrl not configured') : !hostsAllowed ? 'API endpoint host outside allowed hosts' : null;
    return { platform: this.platform, installed, configured: installed, reason, capabilities: this.capabilities, endpoints };
  }
  async loadApiToken(source, credentialContext = this.credentialContext, account = null) {
    if (!credentialContext) throw new ConnectorError('CREDENTIAL_CONTEXT_REQUIRED', 'account credential context is required');
    const credentialSubject = account || source?.account || source;
    const loaded = typeof credentialContext.loadApiToken === 'function'
      ? await credentialContext.loadApiToken(credentialSubject, 'api_token')
      : typeof credentialContext.load === 'function' ? await credentialContext.load(credentialSubject, 'api_token') : credentialContext;
    const apiToken = typeof loaded === 'string' ? loaded : loaded?.apiToken;
    if (!apiToken) throw new ConnectorError('CREDENTIAL_SECRET_MISSING', 'account API token is required');
    return apiToken;
  }
  async requestQ1(path, source, apiToken, params = {}, page = 1, capability = 'posts', authRefreshRetried = false, signal = null, requestContext = {}) {
    const context = q1Context(source);
    const url = new URL(path, context.baseUrl);
    for (const [key, value] of Object.entries(params)) if (value != null && value !== '') url.searchParams.set(key, String(value));
    if (!this.hostAllowed(url.toString())) throw new ConnectorError('H5_URL_OUTSIDE_ALLOWED_HOSTS', 'H5 API URL is outside allowed hosts');
    let response;
    try {
      response = await this.fetchImpl(url, {
        redirect: 'manual',
        headers: { accept: 'application/json', authorization: authorizationValue(apiToken), 'content-language': context.language, 'user-agent': 'PublicOpinionSystem/1.0' },
        signal: combinedSignal(signal, this.timeoutMs)
      });
    } catch (error) { throw new ConnectorPageError(this.platform, capability, page, signal?.aborted ? abortedError(signal) : error); }
    if (response.url && !this.hostAllowed(response.url)) throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS', 'H5 API redirected outside allowed hosts'));
    if (!response.ok && (response.status === 401 || response.status === 403) && this.authRefreshCoordinator && !authRefreshRetried) {
      const refreshAccount = requestContext.account || source.account || (source.account_id ? { id: source.account_id, platform: source.platform } : null);
      const refreshCredentialContext = requestContext.credentialContext || this.credentialContext;
      if (!refreshAccount?.id) throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('AUTH_REFRESH_FAILED', 'account refresh binding is missing'));
      if (signal?.aborted) throw new ConnectorPageError(this.platform, capability, page, abortedError(signal));
      await this.authRefreshCoordinator.refresh({ source, account: refreshAccount, signal });
      if (signal?.aborted) throw new ConnectorPageError(this.platform, capability, page, abortedError(signal));
      const refreshedToken = await this.loadApiToken(source, refreshCredentialContext, refreshAccount);
      return this.requestQ1(path, source, refreshedToken, params, page, capability, true, signal, { credentialContext: refreshCredentialContext, account: refreshAccount });
    }
    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'PERMISSION_DENIED' : response.status === 429 ? 'RATE_LIMITED' : `H5_HTTP_${response.status}`;
      throw new ConnectorPageError(this.platform, capability, page, new ConnectorError(code, 'H5 API request failed'));
    }
    let payload;
    try { payload = await response.json(); } catch { throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('MALFORMED_RESPONSE', 'H5 API returned invalid JSON')); }
    if (payload?.code != null && Number(payload.code) !== 0) throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('H5_API_ERROR', 'Q1 H5 API rejected the request', { providerCode: payload.code }));
    return payload;
  }
  async discoverFeeds({ source, account, credentialContext = this.credentialContext, signal = null } = {}) {
    const context = q1Context(source);
    if (!context.gameId || !context.gameVersion || !context.env) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', 'Q1 source URL must include env, gameId and gameVersion');
    const apiToken = await this.loadApiToken(source, credentialContext, account);
    const requestSource = { ...source, account: account || source?.account };
    const requestContext = { credentialContext, account: account || source?.account || null };
    const boards = q1Boards(await this.requestQ1('/api/club/v1/auth/user/context', requestSource, apiToken, {}, 1, 'posts', false, signal, requestContext));
    const feeds = [];
    for (const board of boards) {
      if (signal?.aborted) throw abortedError(signal);
      const schema = await this.requestQ1('/api/club/v2/auth/board', requestSource, apiToken, { id: board.id }, 1, 'posts', false, signal, requestContext);
      feeds.push(...q1BoardFeeds(schema, board));
    }
    if (!feeds.length) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 board schema did not expose any feeds');
    return feeds;
  }
  async enrichQ1FeedItems({ items, source, account, credentialContext, apiToken, page, signal }) {
    const requestSource = { ...source, account: account || source?.account };
    const requestContext = { credentialContext, account: account || source?.account || null };
    const enrichedItems = await q1ConcurrentMap(items, 4, async (listItem, _index, detailSignal) => {
      if (detailSignal.aborted) throw abortedError(detailSignal);
      if (listItem?.id == null || String(listItem.id).trim() === '') throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 post id is required');
      let payload;
      try {
        payload = await this.requestQ1('/api/club/v1/auth/post/', requestSource, apiToken, { postId: String(listItem.id), source: 0 }, page, 'posts', false, detailSignal, requestContext);
      } catch (error) {
        const cancellation = q1CancellationCause(error, detailSignal);
        if (cancellation) throw cancellation;
        return q1FallbackPost(listItem, q1DetailFallbackCode(error));
      }
      if (detailSignal.aborted) throw abortedError(detailSignal);
      const detailItem = payload?.data;
      const detailId = detailItem?.id ?? detailItem?.postId;
      if (!q1PlainObject(detailItem) || detailId == null || String(detailId) !== String(listItem.id) || !q1HasTextContent(detailItem.content)) {
        return q1FallbackPost(listItem, 'DETAIL_RESPONSE_INVALID');
      }
      return q1EnrichedPost(listItem, detailItem);
    }, signal);
    const enriched = enrichedItems.filter(item => item?._contentIntegrity?.status === 'detail_enriched').length;
    return { items: enrichedItems, diagnostics: { attempted: items.length, enriched, fallback: items.length - enriched } };
  }
  async listFeedContents({ source, account, credentialContext = this.credentialContext, signal = null, cursor, limit, feed, publishedFrom = null, publishedTo = null, dailyBounded = false, ...descriptor } = {}) {
    const context = q1Context(source);
    if (!context.gameId || !context.gameVersion || !context.env) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', 'Q1 source URL must include env, gameId and gameVersion');
    const currentFeed = feed && typeof feed === 'object' ? feed : descriptor;
    const endpoint = { merged: '/api/club/v1/auth/post/model/merged-list', info: '/api/club/v1/auth/post/list', activity: '/api/club/v1/auth/post/activity/list' }[currentFeed.endpointKind];
    const boardId = q1PositiveId(currentFeed.boardId);
    const sectionId = currentFeed.sectionId == null ? null : String(currentFeed.sectionId);
    if (!endpoint || !boardId || !sectionId || currentFeed.feedKey !== q1FeedKey(currentFeed)) throw new ConnectorError('INVALID_FEED_DESCRIPTOR', 'Q1 feed descriptor is invalid');
    const pageSize = limit == null ? 20 : Number(limit);
    if (!Number.isInteger(pageSize) || pageSize <= 0) throw new ConnectorError('INVALID_PAGINATION', 'pagination limit must be a positive integer');
    const current = q1FeedCursor(cursor, currentFeed);
    const apiToken = await this.loadApiToken(source, credentialContext, account);
    const params = { boardId, sectionId, pageSize, offsetId: current.offsetId };
    if (currentFeed.endpointKind === 'merged') params.pageIndex = current.pageIndex;
    else {
      const type = Number(currentFeed.type);
      if (!Number.isInteger(type) || type <= 0) throw new ConnectorError('INVALID_FEED_DESCRIPTOR', 'Q1 feed type is invalid');
      params.type = type;
      if (currentFeed.orderType != null) params.orderType = Number(currentFeed.orderType);
      if (currentFeed.isUltimate != null) params.isUltimate = Number(Boolean(currentFeed.isUltimate));
    }
    const payload = await this.requestQ1(endpoint, { ...source, account: account || source?.account }, apiToken, params, current.pageIndex, 'posts', false, signal, { credentialContext, account: account || source?.account || null });
    const result = q1PageData(payload);
    if (!Array.isArray(result.items)) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 H5 API page result is malformed');
    const fingerprint = q1PageFingerprint(result.items);
    if (result.items.length && fingerprint === current.previousFingerprint) throw new ConnectorError('INVALID_PAGINATION', 'Q1 feed pagination returned a duplicate page');
    if (!result.items.length && result.total != null && current.offsetId < result.total) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 feed returned an empty page before total was reached');
    const consumedOffset = current.offsetId + result.items.length;
    const nextOffset = result.nextOffset == null ? consumedOffset : result.nextOffset;
    const hasMore = result.items.length > 0 && (
      result.hasMore === true
        || (result.hasMore === false
          ? result.total != null && consumedOffset < result.total
          : result.total != null
            ? consumedOffset < result.total
            : true)
    );
    if (hasMore && (!Number.isInteger(nextOffset) || nextOffset <= current.offsetId)) throw new ConnectorError('INVALID_PAGINATION', 'Q1 feed pagination cursor did not advance');
    const enrichment = await this.enrichQ1FeedItems({ items: result.items, source, account, credentialContext, apiToken, page: current.pageIndex, signal });
    const items = enrichment.items.map(item => q1Post(item, context));
    const fromMs = publishedFrom == null ? -Infinity : new Date(publishedFrom).getTime();
    const toMs = publishedTo == null ? Infinity : new Date(publishedTo).getTime();
    const timestamps = items.map(item => item.publishedAt == null ? NaN : new Date(item.publishedAt).getTime());
    if (dailyBounded && timestamps.some(value => !Number.isFinite(value))) throw new ConnectorError('COLLECTION_BOUNDARY_UNVERIFIED', 'Q1 post is missing a usable published time');
    const inWindow = dailyBounded ? items.filter((item, index) => timestamps[index] >= fromMs && timestamps[index] < toMs) : items;
    const crossedLowerBound = dailyBounded && timestamps.length > 0 && Math.min(...timestamps) < fromMs;
    const boundedHasMore = hasMore && !crossedLowerBound;
    return new ConnectorPageResult({
      items: inWindow,
      nextCursor: boundedHasMore ? JSON.stringify({ version: 1, endpointKind: currentFeed.endpointKind, feedKey: currentFeed.feedKey, pageIndex: currentFeed.endpointKind === 'merged' ? current.pageIndex + 1 : current.pageIndex, offsetId: nextOffset, previousFingerprint: fingerprint }) : null,
      hasMore: boundedHasMore,
      capability: 'authorized_scope',
      raw: { ...payload, paginationDiagnostics: { contentEnrichment: enrichment.diagnostics } }
    });
  }
  async listQ1Posts({ source, account, credentialContext = this.credentialContext, signal = null, cursor, limit } = {}) {
    let feed;
    if (cursor != null && cursor !== '') {
      let parsed;
      try { parsed = JSON.parse(String(cursor)); } catch {}
      if (parsed?.feedKey && parsed?.endpointKind === 'merged') {
        const parts = String(parsed.feedKey).split(':');
        feed = { boardId: parts[0], pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null, feedKey: parsed.feedKey };
      }
    }
    if (!feed) feed = (await this.discoverFeeds({ source, account, credentialContext, signal })).find(item => item.endpointKind === 'merged');
    if (!feed) throw new ConnectorError('MALFORMED_RESPONSE', 'Q1 board schema did not expose a home feed');
    return this.listFeedContents({ source, account, credentialContext, signal, cursor, limit, feed });
  }
  async accountHealth(source) {
    const installation = await this.installationHealth(source);
    if (!installation.installed) return { ...installation, authorized: false, configured: false };
    try {
      if (isQ1Source(source)) await this.listQ1Posts({ source, credentialContext: this.credentialContext, limit: 1 });
      else await this.requestJson('posts', source, { limit: 1 }, this.credentialContext, {}, { probe: true });
      return { ...installation, authorized: true, configured: true, reason: null };
    } catch (error) {
      return { ...installation, authorized: false, configured: false, reason: error.cause?.code || error.code || 'account credential invalid' };
    }
  }
  async healthCheck(source) {
    if (this.credentialContext) return this.accountHealth(source);
    const installation = await this.installationHealth(source);
    const configured = installation.installed && Boolean(this.cookie || this.bearer);
    return { platform: this.platform, configured, reason: configured ? null : (installation.reason || 'credentials required') };
  }
  async requestJson(capability, source, params = {}, credentialContext = this.credentialContext, pathParams = {}, { probe = false, authRefreshRetried = false } = {}) {
    if (capability === 'owned_content') capability = 'posts';
    this.assertCapability(capability);
    const installation = await this.installationHealth(source);
    if (!installation.installed) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', installation.reason || 'H5 connector is not installed');
    const endpoint = this.endpointFor(capability, source, pathParams);
    if (!endpoint) throw new ConnectorError('CAPABILITY_UNSUPPORTED', `${capability} endpoint is not configured`);
    let apiToken = await this.loadApiToken(source, credentialContext);
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params)) if (value != null && value !== '') url.searchParams.set(key, String(value));
    if (!this.hostAllowed(url.toString())) throw new ConnectorError('H5_URL_OUTSIDE_ALLOWED_HOSTS', 'H5 API URL is outside allowed hosts');
    let response;
    try { response = await this.fetchImpl(url, { redirect: 'manual', headers: { accept: 'application/json', authorization: authorizationValue(apiToken), 'user-agent': 'PublicOpinionSystem/1.0' }, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch (error) { throw new ConnectorPageError(this.platform, capability, params.cursor || 1, error); }
    if (response.url && !this.hostAllowed(response.url)) throw new ConnectorPageError(this.platform, capability, params.cursor || 1, new ConnectorError('H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS', 'H5 API redirected outside allowed hosts'));
    if (!response.ok && (response.status === 401 || response.status === 403) && this.authRefreshCoordinator && !authRefreshRetried) {
      const account = params.account || source.account || (source.account_id ? { id: source.account_id, platform: source.platform } : null);
      if (!account?.id) throw new ConnectorPageError(this.platform, capability, params.cursor || 1, new ConnectorError('AUTH_REFRESH_FAILED', 'account refresh binding is missing'));
      await this.authRefreshCoordinator.refresh({ source, account });
      return this.requestJson(capability, source, params, credentialContext, pathParams, { probe, authRefreshRetried: true });
    }
    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'PERMISSION_DENIED' : response.status === 429 ? 'RATE_LIMITED' : `H5_HTTP_${response.status}`;
      throw new ConnectorPageError(this.platform, capability, params.cursor || 1, new ConnectorError(code, 'H5 API request failed', { retryAfter: response.headers?.get?.('retry-after') || null }));
    }
    let payload;
    try { payload = await response.json(); } catch (error) { throw new ConnectorPageError(this.platform, capability, params.cursor || 1, new ConnectorError('MALFORMED_RESPONSE', 'H5 API returned invalid JSON')); }
    const page = extractPage(payload);
    if (probe) page.items = [];
    return page;
  }
  async detectCapabilities({ source, account, credentialContext = this.credentialContext, postId, postIds = [] } = {}) {
    const results = {};
    let samplePostId = postId == null || String(postId).trim() === '' ? null : String(postId).trim();
    const suppliedPostIds = Array.isArray(postIds) ? postIds.map(value => String(value || '').trim()).filter(Boolean) : [];
    if (suppliedPostIds.length) samplePostId = suppliedPostIds[0];
    for (const capability of ['posts', 'comments']) {
      if (!this.hasSourceCapability(capability, source)) { results[capability] = { status: 'unsupported' }; continue; }
      if (capability === 'comments' && !samplePostId) {
        try {
          const page = isQ1Source(source)
            ? await this.listQ1Posts({ source, account, credentialContext, limit: 1 })
            : await this.requestJson('posts', { ...source, account }, { accountId: account?.platform_account_id, limit: 1 }, credentialContext);
          const item = page.items?.[0];
          samplePostId = item?.externalId ?? item?.id ?? item?.postId ?? null;
        } catch (error) {
          results.posts = results.posts || { status: capabilityStatusFromError(error) };
        }
      }
      if (capability === 'comments' && !samplePostId) { results.comments = { status: 'configured', requiresParentId: true, untested: true }; continue; }
      try {
        if (capability === 'posts') {
          if (isQ1Source(source)) await this.listQ1Posts({ source, account, credentialContext, limit: 1 });
          else await this.requestJson('posts', { ...source, account }, { accountId: account?.platform_account_id, limit: 1 }, credentialContext);
        } else {
          await this.listComments({ source, account, credentialContext, postId: samplePostId, limit: 1 });
        }
        results[capability] = { status: 'available', ...(capability === 'comments' ? { requiresParentId: true, samplePostId } : {}) };
      } catch (error) { results[capability] = { status: capabilityStatusFromError(error), ...(capability === 'comments' ? { requiresParentId: true, samplePostId } : {}) }; }
    }
    return results;
  }
  async listOwnedContents(input = {}) { return this.listPosts(input); }
  async listPosts({ source, account, credentialContext, signal = null, cursor, limit, updatedSince, historyStart } = {}) {
    if (isQ1Source(source)) return validatePagination({ cursor, limit, page: await this.listQ1Posts({ source, account, credentialContext, signal, cursor, limit }) });
    const page = await this.requestJson('posts', source, { account: account || null, accountId: account?.platform_account_id, cursor, limit, updatedSince, historyStart }, credentialContext);
    return validatePagination({ cursor, limit, page });
  }
  async listQ1Comments({ source, account, credentialContext = this.credentialContext, signal = null, postId, cursor, limit, commentId = null, sortType = 0 } = {}) {
    if (postId == null || String(postId).trim() === '') throw new ConnectorError('POST_ID_REQUIRED', 'postId is required');
    const apiToken = await this.loadApiToken(source, credentialContext, account);
    const context = q1Context(source);
    const current = q1CommentCursor(cursor);
    const effectiveCommentId = commentId == null ? current.commentId : String(commentId);
    const effectiveSortType = cursor == null ? Number(sortType) : current.sortType;
    if (!Number.isInteger(effectiveSortType) || effectiveSortType < 0 || effectiveSortType > 2) throw new ConnectorError('INVALID_PAGINATION', 'Q1 comment sortType must be 0, 1 or 2');
    const pageSize = limit == null ? 20 : Number(limit);
    if (!Number.isInteger(pageSize) || pageSize <= 0) throw new ConnectorError('INVALID_PAGINATION', 'pagination limit must be a positive integer');
    const payload = await this.requestQ1(`/api/club/v1/auth/comment/${encodeURIComponent(String(postId))}`, { ...source, account: account || source?.account }, apiToken, { offsetId: current.offsetId, pageSize, postId: String(postId), commentId: effectiveCommentId, sortType: effectiveSortType }, current.offsetId, 'comments', false, signal, { credentialContext, account: account || source?.account || null });
    return validatePagination({ cursor, limit, page: q1CommentPage(payload, { rootContentId: postId, commentId: effectiveCommentId, cursor: { ...current, sortType: effectiveSortType }, limit: pageSize, context }) });
  }
  async listComments({ source, account, credentialContext, signal = null, postId, rootContentId, cursor, limit, updatedSince, commentId = null, sortType = 0 } = {}) {
    const id = postId || rootContentId;
    if (!id) throw new ConnectorError('POST_ID_REQUIRED', 'postId is required');
    if (isQ1Source(source)) return this.listQ1Comments({ source, account, credentialContext, signal, postId: id, cursor, limit, commentId, sortType });
    const page = await this.requestJson('comments', source, { account: account || null, postId: parseSourceConfig(source).commentsApiUrl ? id : undefined, cursor, limit, updatedSince }, credentialContext, { postId: id });
    page.items = flattenCommentTree(page.items, { rootPlatformContentId: id });
    return validatePagination({ cursor, limit, page });
  }
  async fetchPage(url) {
    if (!sameHost(url, this.allowedHosts)) throw new Error('H5_URL_OUTSIDE_ALLOWED_HOSTS');
    const headers = { accept: 'text/html,application/xhtml+xml', 'user-agent': 'PublicOpinionSystem/1.0' };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.bearer) headers.authorization = `Bearer ${this.bearer}`;
    const response = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`H5_HTTP_${response.status}`);
    return { url: response.url, html: await response.text() };
  }
  async collect({ source, signal } = {}) {
    if (!(await this.healthCheck(source)).configured) throw new Error('BIGPLAYER_H5_NOT_CONFIGURED');
    const baseUrl = this.resolveBaseUrl(source); const { startPaths } = parseSourceConfig(source);
    const queue = startPaths.map(path => ({ url: new URL(path, baseUrl).toString(), depth: 0 }));
    const seen = new Set(); const items = [];
    while (queue.length && seen.size < this.maxPages) {
      if (signal?.aborted) throw new Error('COLLECTION_CANCELLED');
      const current = queue.shift(); if (seen.has(current.url) || current.depth > this.maxDepth) continue; seen.add(current.url);
      if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
      const page = await this.fetchPage(current.url); const body = htmlText(page.html); const title = titleFrom(page.html);
      if (body.length >= 40) items.push(normalizeRawContent({ externalId: page.url, contentType: 'post', title, body, sourceUrl: page.url, authorName: 'H5 社区用户' }));
      if (current.depth >= this.maxDepth) continue;
      for (const href of page.html.matchAll(/href=["']([^"']+)["']/gi)) { const next = new URL(href[1], page.url).toString(); if (sameHost(next, this.allowedHosts) && !seen.has(next)) queue.push({ url: next, depth: current.depth + 1 }); }
    }
    return items;
  }
}
module.exports = { BigPlayerH5Connector, parseSourceConfig, extractPage };
