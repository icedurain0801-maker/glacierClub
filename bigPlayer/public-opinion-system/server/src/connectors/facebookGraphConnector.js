const {
  BaseConnector,
  ConnectorError,
  ConnectorPageError,
  ConnectorPageResult,
  normalizeRawContent,
  validatePagination
} = require('./baseConnector');

const GRAPH_ORIGIN = 'https://graph.facebook.com';
const FACEBOOK_PAGE_HOSTS = new Set(['facebook.com', 'www.facebook.com']);
const SUPPORTED_GRAPH_VERSIONS = Object.freeze(['v23.0', 'v24.0', 'v25.0', 'v26.0']);
const DEFAULT_GRAPH_VERSION = 'v26.0';
const RESERVED_PAGE_PATHS = new Set([
  'business', 'events', 'gaming', 'groups', 'help', 'login', 'marketplace',
  'pages', 'people', 'photo', 'profile.php', 'reel', 'settings', 'share', 'watch'
]);

function connectorError(code, message, details = {}) {
  return new ConnectorError(code, message, details);
}

function parseConfig(source) {
  const raw = source?.config;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function parseFacebookPageUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch {
    throw connectorError('FACEBOOK_URL_INVALID', 'Facebook Page URL is invalid');
  }
  if (url.protocol !== 'https:' || !FACEBOOK_PAGE_HOSTS.has(url.hostname.toLowerCase()) || url.port || url.username || url.password || url.hash) {
    throw connectorError('FACEBOOK_URL_INVALID', 'Facebook Page URL must use an approved HTTPS host');
  }
  let segments;
  try { segments = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment)); } catch {
    throw connectorError('FACEBOOK_URL_INVALID', 'Facebook Page URL path is invalid');
  }
  if (segments.length !== 1 || RESERVED_PAGE_PATHS.has(segments[0].toLowerCase()) || !/^[A-Za-z0-9._-]{2,100}$/.test(segments[0])) {
    throw connectorError('FACEBOOK_URL_INVALID', 'Facebook Page URL must identify one Page');
  }
  for (const key of url.searchParams.keys()) {
    const normalizedKey = key.toLowerCase();
    const trackingOnly = normalizedKey.startsWith('utm_') || ['fbclid', 'ref', 'refsrc', 'mibextid'].includes(normalizedKey);
    if (!trackingOnly) throw connectorError('FACEBOOK_URL_INVALID', 'Facebook Page URL contains unsupported query parameters');
  }
  const pageRef = segments[0];
  return { pageRef, normalizedUrl: `https://www.facebook.com/${encodeURIComponent(pageRef)}` };
}

function assertGraphVersion(value) {
  const version = String(value || '').trim();
  if (!SUPPORTED_GRAPH_VERSIONS.includes(version)) {
    throw connectorError('FACEBOOK_GRAPH_VERSION_UNSUPPORTED', 'Facebook Graph API version is not approved');
  }
  return version;
}

function validateGraphUrl(value, expectedVersion) {
  let url;
  try { url = value instanceof URL ? new URL(value.href) : new URL(String(value || '')); } catch {
    throw connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook Graph paging URL is invalid');
  }
  const version = assertGraphVersion(expectedVersion);
  const pathVersion = url.pathname.split('/').filter(Boolean)[0];
  const encodedPath = url.pathname.toLowerCase();
  const safePath = new RegExp(`^/${version.replace('.', '\\.')}/[A-Za-z0-9._~-]+(?:/[A-Za-z0-9._~-]+)*$`).test(url.pathname);
  const hasCredentialQuery = [...url.searchParams.keys()].some(key => key.toLowerCase() === 'access_token');
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'graph.facebook.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    pathVersion !== version ||
    !url.pathname.startsWith(`/${version}/`) ||
    !safePath ||
    /%2f|%5c/.test(encodedPath) ||
    hasCredentialQuery
  ) {
    throw connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook Graph paging URL is outside the approved endpoint');
  }
  return url;
}

function capabilityStatus(error) {
  const code = error?.cause?.code || error?.code || 'FACEBOOK_API_UNAVAILABLE';
  if (['FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED', 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID', 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED'].includes(code)) return 'unauthorized';
  if (['FACEBOOK_PAGE_MANAGEMENT_REQUIRED', 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED', 'FACEBOOK_CAPABILITY_MISSING', 'FACEBOOK_PAGE_MISMATCH'].includes(code)) return 'unavailable';
  if (code === 'FACEBOOK_RATE_LIMITED') return 'limited';
  return 'unavailable';
}

function providerErrorCode(status, payload, capability = 'page') {
  const providerCode = Number(payload?.error?.code);
  const subcode = Number(payload?.error?.error_subcode);
  if (providerCode === 190 && [463, 467].includes(subcode)) return 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED';
  if (status === 401 || providerCode === 190) return 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID';
  if (status === 429 || [4, 17, 32, 613].includes(providerCode)) return 'FACEBOOK_RATE_LIMITED';
  if (status === 403 || [10, 200, 299].includes(providerCode)) {
    if (capability === 'pageManagement') return 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED';
    if (capability === 'moderate') return 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED';
    return 'FACEBOOK_CAPABILITY_MISSING';
  }
  if (status === 404 || providerCode === 100) return 'FACEBOOK_PAGE_NOT_FOUND';
  return 'FACEBOOK_API_UNAVAILABLE';
}

function safeFailure(code, status) {
  const messages = {
    FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED: 'Facebook system credential is not configured',
    FACEBOOK_SYSTEM_CREDENTIAL_INVALID: 'Facebook system credential is invalid',
    FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED: 'Facebook system credential has expired',
    FACEBOOK_PAGE_MANAGEMENT_REQUIRED: 'Facebook Page management authorization is required',
    FACEBOOK_MODERATE_CAPABILITY_REQUIRED: 'Facebook MODERATE capability is required',
    FACEBOOK_CAPABILITY_MISSING: 'Facebook collection capability is missing',
    FACEBOOK_RATE_LIMITED: 'Facebook API rate limit reached',
    FACEBOOK_PAGE_NOT_FOUND: 'Facebook Page was not found',
    FACEBOOK_API_UNAVAILABLE: 'Facebook API is unavailable'
  };
  return connectorError(code, messages[code] || messages.FACEBOOK_API_UNAVAILABLE, { status: Number(status) || null });
}

function systemCredentialStatus(code, configured) {
  if (code === 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED') return 'not_configured';
  if (code === 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID') return 'invalid';
  if (code === 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED') return 'expired';
  return configured ? 'configured' : 'not_configured';
}

function capabilityFailureCode(error, fallback) {
  const code = error?.cause?.code || error?.code || 'FACEBOOK_API_UNAVAILABLE';
  if (['FACEBOOK_SYSTEM_CREDENTIAL_INVALID', 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED'].includes(code)) return code;
  if (['FACEBOOK_RATE_LIMITED', 'FACEBOOK_API_UNAVAILABLE', 'FACEBOOK_PAGING_URL_INVALID', 'MALFORMED_RESPONSE'].includes(code)) return code;
  return fallback;
}

function positiveLimit(value, fallback = 25) {
  const limit = value == null ? fallback : Number(value);
  if (!Number.isInteger(limit) || limit <= 0) throw connectorError('INVALID_PAGINATION', 'pagination limit must be a positive integer');
  return Math.min(limit, 100);
}

function cursorValue(value, code = 'FACEBOOK_PAGING_INCOMPLETE') {
  const cursor = String(value || '');
  if (!cursor || cursor.length > 2048 || /[\u0000-\u0020\u007f]/.test(cursor)) {
    throw connectorError(code, 'Facebook paging cursor is invalid');
  }
  return cursor;
}

function encodeCursor(scope, resourceId, after) {
  return JSON.stringify({ version: 1, scope, resourceId: String(resourceId), after: cursorValue(after) });
}

function decodeCursor(value, scope, resourceId) {
  if (value == null || value === '') return null;
  let parsed;
  try { parsed = JSON.parse(String(value)); } catch {
    throw connectorError('INVALID_PAGINATION', 'Facebook paging cursor is invalid');
  }
  if (parsed?.version !== 1 || parsed.scope !== scope || String(parsed.resourceId || '') !== String(resourceId)) {
    throw connectorError('INVALID_PAGINATION', 'Facebook paging cursor does not match the requested collection');
  }
  return cursorValue(parsed.after, 'INVALID_PAGINATION');
}

function publishedDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeFacebookPermalink(value, fallback) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' && FACEBOOK_PAGE_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password) return url.toString();
  } catch {}
  return fallback;
}

function facebookPost(item) {
  const id = item?.id == null ? '' : String(item.id).trim();
  if (!id) throw connectorError('MALFORMED_RESPONSE', 'Facebook post id is required');
  const body = String(item.message || item.story || '').trim();
  const fallbackUrl = `https://www.facebook.com/${encodeURIComponent(id)}`;
  const normalized = normalizeRawContent({
    externalId: id,
    contentType: 'post',
    title: '',
    body,
    authorName: String(item?.from?.name || '').trim(),
    publishedAt: publishedDate(item.created_time),
    sourceUrl: safeFacebookPermalink(item.permalink_url, fallbackUrl),
    engagement: {}
  });
  return { ...normalized, platformAuthorId: item?.from?.id == null ? null : String(item.from.id), updatedAt: publishedDate(item.updated_time) };
}

function facebookComment(item, { postId, parentCommentId = null, depth = 1 } = {}) {
  const id = item?.id == null ? '' : String(item.id).trim();
  if (!id) throw connectorError('MALFORMED_RESPONSE', 'Facebook comment id is required');
  const fallbackUrl = `https://www.facebook.com/${encodeURIComponent(String(postId))}?comment_id=${encodeURIComponent(id)}`;
  const normalized = normalizeRawContent({
    externalId: id,
    contentType: 'comment',
    title: '',
    body: String(item.message || '').trim(),
    authorName: String(item?.from?.name || '').trim(),
    publishedAt: publishedDate(item.created_time),
    sourceUrl: safeFacebookPermalink(item.permalink_url, fallbackUrl),
    engagement: {}
  });
  return {
    ...normalized,
    platformAuthorId: item?.from?.id == null ? null : String(item.from.id),
    rootPlatformContentId: String(postId),
    platformParentId: parentCommentId == null ? String(postId) : String(parentCommentId),
    contentDepth: depth,
    updatedAt: publishedDate(item.updated_time)
  };
}

function graphSince(value) {
  if (value == null || value === '') return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw connectorError('INVALID_COLLECTION_BOUNDARY', 'Facebook collection boundary is invalid');
  return Math.floor(time / 1000);
}

function pagingAfter(payload, { graphVersion, expectedPath, currentAfter = null } = {}) {
  const nextValue = payload?.paging?.next;
  if (nextValue == null || nextValue === '') return null;
  let next;
  try { next = new URL(String(nextValue)); } catch {
    throw connectorError('FACEBOOK_PAGING_INCOMPLETE', 'Facebook paging metadata is invalid');
  }
  const nextAfter = next.searchParams.get('after');
  for (const key of [...next.searchParams.keys()]) {
    if (key.toLowerCase() === 'access_token') next.searchParams.delete(key);
  }
  try { validateGraphUrl(next, graphVersion); } catch {
    throw connectorError('FACEBOOK_PAGING_INCOMPLETE', 'Facebook paging metadata is outside the approved endpoint');
  }
  if (next.pathname !== `/${graphVersion}/${expectedPath}`) {
    throw connectorError('FACEBOOK_PAGING_INCOMPLETE', 'Facebook paging metadata changed the requested collection');
  }
  const cursorAfter = payload?.paging?.cursors?.after == null ? null : String(payload.paging.cursors.after);
  if (cursorAfter && nextAfter && cursorAfter !== nextAfter) {
    throw connectorError('FACEBOOK_PAGING_INCOMPLETE', 'Facebook paging cursors are inconsistent');
  }
  const after = cursorValue(cursorAfter || nextAfter);
  if (currentAfter != null && after === currentAfter) {
    throw connectorError('FACEBOOK_PAGING_INCOMPLETE', 'Facebook paging cursor did not advance');
  }
  return after;
}

function platformWatermark(items) {
  const values = items
    .map(item => item.updatedAt || item.publishedAt)
    .filter(value => value instanceof Date && !Number.isNaN(value.getTime()))
    .map(value => value.getTime());
  return values.length ? new Date(Math.max(...values)) : null;
}

class FacebookGraphConnector extends BaseConnector {
  constructor(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
    super({ platform: 'facebook', capabilities: ['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies', 'owned_content'] });
    this.enabled = env.FACEBOOK_GRAPH_ENABLED === 'true' || env.FACEBOOK_GRAPH_ENABLED === '1';
    this.graphVersion = assertGraphVersion(env.FACEBOOK_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION);
    this.timeoutMs = Number(env.FACEBOOK_GRAPH_TIMEOUT_MS || 15000);
    Object.defineProperty(this, 'systemAccessToken', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: String(env.FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN || '').trim()
    });
    this.fetchImpl = fetchImpl;
  }

  hostAllowed(value) {
    try { parseFacebookPageUrl(value); return true; } catch { return false; }
  }

  sourceIdentity(source) {
    const config = parseConfig(source);
    return parseFacebookPageUrl(config.baseUrl || source?.base_url || source?.baseUrl);
  }

  async installationHealth(source) {
    let reason = null;
    try { if (source) this.sourceIdentity(source); } catch (error) { reason = error.code; }
    const installed = this.enabled && !reason;
    const credentialConfigured = Boolean(this.systemAccessToken);
    return {
      platform: this.platform,
      installed,
      configured: installed && credentialConfigured,
      reason: !this.enabled
        ? 'disabled by configuration'
        : reason || (!credentialConfigured ? 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED' : null),
      systemCredentialStatus: credentialConfigured ? 'configured' : 'not_configured',
      graphVersion: this.graphVersion,
      capabilities: this.capabilities
    };
  }

  loadSystemAccessToken() {
    if (!this.systemAccessToken) {
      throw connectorError('FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED', 'Facebook system credential is not configured');
    }
    return this.systemAccessToken;
  }

  graphUrl(path, params = {}) {
    const cleanPath = String(path || '').replace(/^\/+/, '');
    if (!cleanPath || cleanPath.includes('?') || cleanPath.includes('#') || /(^|\/)\.\.?($|\/)/.test(cleanPath) || /%2f|%5c/i.test(cleanPath)) {
      throw connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook Graph path is invalid');
    }
    const url = new URL(`/${this.graphVersion}/${cleanPath}`, GRAPH_ORIGIN);
    for (const [key, value] of Object.entries(params)) {
      if (key.toLowerCase() === 'access_token') throw connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook token must not be placed in query parameters');
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    return validateGraphUrl(url, this.graphVersion);
  }

  async requestUrl(url, { capability = 'page', page = 1, signal = null } = {}) {
    const endpoint = validateGraphUrl(url, this.graphVersion);
    const token = this.loadSystemAccessToken();
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        redirect: 'manual',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'user-agent': 'PublicOpinionSystem/1.0'
        },
        signal: signal || AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new ConnectorPageError(this.platform, capability, page, safeFailure('FACEBOOK_API_UNAVAILABLE'));
    }
    if (response.url) {
      try { validateGraphUrl(response.url, this.graphVersion); } catch {
        throw new ConnectorPageError(this.platform, capability, page, connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook API response left the approved endpoint'));
      }
    }
    if (response.status >= 300 && response.status < 400) {
      throw new ConnectorPageError(this.platform, capability, page, connectorError('FACEBOOK_PAGING_URL_INVALID', 'Facebook API redirect was refused', { status: response.status }));
    }
    let payload = null;
    try { payload = await response.json(); } catch {
      if (response.ok) throw new ConnectorPageError(this.platform, capability, page, connectorError('MALFORMED_RESPONSE', 'Facebook API returned invalid JSON'));
    }
    if (!response.ok || payload?.error) {
      const code = providerErrorCode(response.status, payload, capability);
      throw new ConnectorPageError(this.platform, capability, page, safeFailure(code, response.status));
    }
    return payload;
  }

  async requestGraph({ path, params = {}, capability = 'page', page = 1, signal = null } = {}) {
    return this.requestUrl(this.graphUrl(path, params), { capability, page, signal });
  }

  async requestNextPage({ nextUrl, capability, page, signal = null } = {}) {
    return this.requestUrl(validateGraphUrl(nextUrl, this.graphVersion), { capability, page, signal });
  }

  async collectionPage({ signal = null, scope, resourceId, requestResourceId = resourceId, edge, cursor, limit, params = {}, mapItem } = {}) {
    const pageSize = positiveLimit(limit);
    const currentAfter = decodeCursor(cursor, scope, resourceId);
    const payload = await this.requestGraph({
      path: `${encodeURIComponent(String(requestResourceId))}/${edge}`,
      params: { ...params, limit: pageSize, after: currentAfter },
      capability: scope,
      page: currentAfter == null ? 1 : 2,
      signal
    });
    if (!Array.isArray(payload?.data)) throw connectorError('MALFORMED_RESPONSE', 'Facebook Graph page does not contain an item array');
    const items = payload.data.map(mapItem);
    const expectedPath = `${encodeURIComponent(String(requestResourceId))}/${edge}`;
    const nextAfter = pagingAfter(payload, { graphVersion: this.graphVersion, expectedPath, currentAfter });
    const page = new ConnectorPageResult({
      items,
      nextCursor: nextAfter == null ? null : encodeCursor(scope, resourceId, nextAfter),
      hasMore: nextAfter != null,
      capability: 'full',
      platformWatermark: platformWatermark(items)
    });
    return validatePagination({ cursor, limit: pageSize, page });
  }

  async resolvePage({ source, account, signal = null } = {}) {
    const { pageRef, normalizedUrl } = this.sourceIdentity(source);
    const page = await this.requestGraph({
      path: encodeURIComponent(pageRef),
      params: { fields: 'id,name,link' },
      capability: 'page',
      signal
    });
    if (!page?.id) throw connectorError('FACEBOOK_PAGE_NOT_FOUND', 'Facebook Page identity is unavailable');
    const expectedPageId = account?.platform_account_id;
    const persistedIdentity = expectedPageId && !/^(?:legacy-source|pending):/.test(String(expectedPageId));
    if (persistedIdentity && String(expectedPageId) !== String(page.id)) {
      throw connectorError('FACEBOOK_PAGE_MISMATCH', 'Resolved Facebook Page does not match the configured Page');
    }
    return {
      pageId: String(page.id),
      pageName: String(page.name || ''),
      pageUrl: normalizedUrl
    };
  }

  async detectCapabilities({ source, account, signal = null } = {}) {
    const result = {
      systemCredentialStatus: this.systemAccessToken ? 'configured' : 'not_configured',
      page: { status: 'untested' },
      pageManagement: { status: 'untested' },
      moderate: { status: 'untested' },
      posts: { status: 'untested' },
      comments: { status: 'untested' },
      replies: { status: 'untested' }
    };
    let identity;
    try {
      identity = await this.resolvePage({ source, account, signal });
      result.page = { status: 'available', pageId: identity.pageId, pageName: identity.pageName, pageUrl: identity.pageUrl };
    } catch (error) {
      const code = error?.cause?.code || error?.code || 'FACEBOOK_API_UNAVAILABLE';
      result.systemCredentialStatus = systemCredentialStatus(code, Boolean(this.systemAccessToken));
      result.page = { status: capabilityStatus(error), errorCode: code };
      return result;
    }

    let managedPage;
    try {
      const payload = await this.requestGraph({
        path: 'me/accounts',
        params: { fields: 'id,name,tasks', limit: 100 },
        capability: 'pageManagement',
        signal
      });
      if (!Array.isArray(payload?.data)) throw connectorError('MALFORMED_RESPONSE', 'Facebook managed Page response is invalid');
      managedPage = payload.data.find(item => String(item?.id || '') === identity.pageId) || null;
      if (!managedPage) {
        result.pageManagement = { status: 'unavailable', errorCode: 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED', pageId: identity.pageId };
        result.moderate = { status: 'unavailable', errorCode: 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED', pageId: identity.pageId };
        return result;
      }
      result.pageManagement = { status: 'available', pageId: identity.pageId };
    } catch (error) {
      const code = capabilityFailureCode(error, 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED');
      result.systemCredentialStatus = systemCredentialStatus(code, Boolean(this.systemAccessToken));
      result.pageManagement = { status: capabilityStatus({ code }), errorCode: code, pageId: identity.pageId };
      return result;
    }

    const tasks = Array.isArray(managedPage.tasks) ? managedPage.tasks.map(value => String(value).toUpperCase()) : [];
    if (!tasks.includes('MODERATE')) {
      result.moderate = { status: 'unavailable', errorCode: 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED', pageId: identity.pageId };
      return result;
    }
    result.moderate = { status: 'available', pageId: identity.pageId };

    let postId = null;
    try {
      const payload = await this.requestGraph({ path: `${encodeURIComponent(identity.pageId)}/posts`, params: { fields: 'id', limit: 1 }, capability: 'posts', signal });
      postId = payload?.data?.[0]?.id ? String(payload.data[0].id) : null;
      result.posts = { status: 'available', samplePostId: postId };
    } catch (error) {
      const code = capabilityFailureCode(error, 'FACEBOOK_CAPABILITY_MISSING');
      result.systemCredentialStatus = systemCredentialStatus(code, Boolean(this.systemAccessToken));
      result.posts = { status: capabilityStatus(error), errorCode: code };
      return result;
    }
    if (!postId) {
      result.comments = { status: 'unavailable', errorCode: 'FACEBOOK_CAPABILITY_MISSING' };
      result.replies = { status: 'unavailable', errorCode: 'FACEBOOK_CAPABILITY_MISSING' };
      return result;
    }

    let commentId = null;
    try {
      const payload = await this.requestGraph({ path: `${encodeURIComponent(postId)}/comments`, params: { fields: 'id', limit: 1 }, capability: 'comments', signal });
      commentId = payload?.data?.[0]?.id ? String(payload.data[0].id) : null;
      result.comments = { status: 'available', samplePostId: postId, sampleCommentId: commentId };
    } catch (error) {
      const code = capabilityFailureCode(error, 'FACEBOOK_CAPABILITY_MISSING');
      result.systemCredentialStatus = systemCredentialStatus(code, Boolean(this.systemAccessToken));
      result.comments = { status: capabilityStatus(error), errorCode: code, samplePostId: postId };
      return result;
    }
    if (!commentId) {
      result.replies = { status: 'unavailable', errorCode: 'FACEBOOK_CAPABILITY_MISSING', samplePostId: postId };
      return result;
    }

    try {
      await this.requestGraph({ path: `${encodeURIComponent(commentId)}/comments`, params: { fields: 'id', limit: 1 }, capability: 'replies', signal });
      result.replies = { status: 'available', samplePostId: postId, sampleCommentId: commentId };
    } catch (error) {
      const code = capabilityFailureCode(error, 'FACEBOOK_CAPABILITY_MISSING');
      result.systemCredentialStatus = systemCredentialStatus(code, Boolean(this.systemAccessToken));
      result.replies = { status: capabilityStatus(error), errorCode: code, samplePostId: postId, sampleCommentId: commentId };
    }
    return result;
  }

  async accountHealth({ source, account, signal = null } = {}) {
    const installation = await this.installationHealth(source);
    if (!installation.configured) return { ...installation, authorized: false, configured: false, errorCode: installation.reason };
    const capabilities = await this.detectCapabilities({ source, account, signal });
    const authorized = ['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies']
      .every(key => capabilities[key]?.status === 'available');
    const reason = authorized
      ? null
      : ['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies']
          .map(key => capabilities[key]?.errorCode)
          .find(Boolean) || 'FACEBOOK_CAPABILITY_MISSING';
    return {
      ...installation,
      authorized,
      configured: authorized,
      reason,
      errorCode: reason,
      systemCredentialStatus: capabilities.systemCredentialStatus,
      pageId: capabilities.page.pageId || null,
      pageName: capabilities.page.pageName || null,
      pageUrl: capabilities.page.pageUrl || null,
      capabilities
    };
  }

  async listOwnedContents(input = {}) { return this.listPosts(input); }

  async listPosts({ source, account, signal = null, cursor, limit, updatedSince, historyStart } = {}) {
    const boundPageId = account?.platform_account_id && !/^(?:legacy-source|pending):/.test(String(account.platform_account_id))
      ? String(account.platform_account_id)
      : null;
    const pageId = boundPageId || (await this.resolvePage({ source, account, signal })).pageId;
    const since = graphSince(updatedSince || historyStart);
    return this.collectionPage({
      signal,
      scope: 'posts',
      resourceId: pageId,
      edge: 'posts',
      cursor,
      limit,
      params: {
        fields: 'id,message,story,created_time,updated_time,permalink_url,from',
        since
      },
      mapItem: facebookPost
    });
  }

  async listComments({ source, account, signal = null, postId, rootContentId, commentId, parentCommentId, cursor, limit } = {}) {
    const rootId = postId || rootContentId;
    if (!rootId) throw connectorError('POST_ID_REQUIRED', 'postId is required');
    const replyParentId = commentId || parentCommentId;
    if (replyParentId) return this.listReplies({ source, account, signal, postId: rootId, commentId: replyParentId, cursor, limit });
    const page = await this.collectionPage({
      signal,
      scope: 'comments',
      resourceId: rootId,
      edge: 'comments',
      cursor,
      limit,
      params: { fields: 'id,message,created_time,permalink_url,from' },
      mapItem: item => facebookComment(item, { postId: rootId, depth: 1 })
    });
    page.replyTargets = page.items.map(item => ({ postId: String(rootId), commentId: item.externalId, sortType: 0 }));
    return page;
  }

  async listReplies({ signal = null, postId, rootContentId, commentId, parentCommentId, cursor, limit } = {}) {
    const rootId = postId || rootContentId;
    const parentId = commentId || parentCommentId;
    if (!rootId) throw connectorError('POST_ID_REQUIRED', 'postId is required');
    if (!parentId) throw connectorError('COMMENT_ID_REQUIRED', 'commentId is required');
    return this.collectionPage({
      signal,
      scope: 'replies',
      resourceId: `${rootId}:${parentId}`,
      edge: 'comments',
      cursor,
      limit,
      params: { fields: 'id,message,created_time,permalink_url,from' },
      mapItem: item => facebookComment(item, { postId: rootId, parentCommentId: parentId, depth: 2 }),
      // Replies are fetched from the parent comment edge, while the cursor remains
      // bound to both root post and parent comment to prevent cross-thread reuse.
      requestResourceId: parentId
    });
  }
}

module.exports = {
  FacebookGraphConnector,
  GRAPH_ORIGIN,
  SUPPORTED_GRAPH_VERSIONS,
  parseFacebookPageUrl,
  validateGraphUrl
};
