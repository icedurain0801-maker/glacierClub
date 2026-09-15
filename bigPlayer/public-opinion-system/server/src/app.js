const { loadRuntimeEnv } = require('./runtimeEnv');
loadRuntimeEnv();

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Repository, normalizeQualityCandidate, normalizeAlertWithIndependentReviews } = require('./db/repository');
const { BigPlayerH5Connector } = require('./connectors/bigPlayerH5Connector');
const { buildExternalConnectors } = require('./connectors/externalConnectors');
const { AiAnalyzer } = require('./integrations/aiAnalyzer');
const { DingTalkNotifier } = require('./integrations/dingTalkNotifier');
const credentialCipher = require('./integrations/credentialCipher');
const { CredentialContext } = require('./services/credentialContext');
const { DouyinOAuthService } = require('./services/douyinOAuthService');
const { LoginSessionClient } = require('./services/loginSessionClient');
const { AuthRefreshCoordinator } = require('./services/authRefreshCoordinator');
const { CommunityProvider, CommunityDirectory } = require('./services/communityProvider');
const { SOURCE_PLATFORMS, OVERSEAS_LAST_NIGHT_GAME_ID, OVERSEAS_LAST_NIGHT_COMMUNITY_ID, isSocialPlatform, isWesternOverseasSource, WESTERN_EDITION_SCOPE, maskPhone, normalizeFacebookPageUrl, normalizePlatform, socialSecret, validateEndpoint, validateFacebookPageUrl, validateSocialCredential, validateWesternSourceUrl } = require('./services/sourceValidators');

const port = Number(process.env.PORT || 4320);
const repo = new Repository();
const communityProvider = new CommunityProvider();
const communityDirectory = new CommunityDirectory({ provider: communityProvider, repo });
const credentialContext = new CredentialContext({ repo });
const douyinOAuth = new DouyinOAuthService();
const loginSessionClient = new LoginSessionClient();
const authRefreshCoordinator = new AuthRefreshCoordinator({ repo, loginSessionClient });
const connectors = { bigplayer_h5: new BigPlayerH5Connector(process.env, { credentialContext, authRefreshCoordinator }), ...buildExternalConnectors(process.env, { credentialContext, douyinOAuthService: douyinOAuth }) };
const ai = new AiAnalyzer();
const dingTalk = new DingTalkNotifier();
const SYNC_MODES = new Set(['incremental', 'backfill']);
function allowedCorsOrigins() { return String(process.env.PUBLIC_OPINION_CORS_ORIGIN || '*').split(',').map(value => value.trim()).filter(Boolean); }
function corsOrigin(req) {
  const allowed = allowedCorsOrigins(); const origin = req.headers.origin;
  if (allowed.includes('*')) return '*';
  return origin && allowed.includes(origin) ? origin : allowed[0] || 'null';
}
function corsHeaders(req) { return { 'access-control-allow-origin': corsOrigin(req), 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-max-age': '600', vary: 'Origin' }; }
function json(res, status, payload, extraHeaders = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...(res.noStore ? { 'cache-control': 'no-store' } : {}), ...(res.corsHeaders || {}), ...extraHeaders }); res.end(JSON.stringify(payload)); }
function requireCredentialResolveAccess(req) {
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const allowNonLoopback = ['1', 'true'].includes(String(process.env.ALLOW_NON_LOOPBACK_CREDENTIAL_RESOLVE || '').toLowerCase());
  if (!allowNonLoopback && !['127.0.0.1', '::1', 'localhost'].includes(remote)) { const error = new Error('credential resolve is restricted to loopback'); error.code = 'UNAUTHORIZED'; throw error; }
  const expected = String(process.env.LOGIN_SESSION_INTERNAL_TOKEN || '').trim();
  const authorization = String(req.headers.authorization || ''); const actual = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!expected || actual.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) { const error = new Error('invalid internal token'); error.code = 'UNAUTHORIZED'; throw error; }
}
async function resolveCredential(req) {
  requireCredentialResolveAccess(req); const body = await readBody(req);
  const sourceId = String(body.sourceId || '').trim(), accountId = String(body.accountId || '').trim();
  const platform = normalizePlatform(body.platform), credentialType = String(body.credentialType || '').trim(), credentialRef = String(body.credentialRef || '').trim();
  if (!sourceId || !accountId || platform !== 'bigplayer_h5' || credentialType !== 'account_password' || credentialRef !== `credential:${accountId}:account_password`) { const error = new Error('invalid credential binding'); error.code = 'INVALID_INPUT'; throw error; }
  const source = await sourceById(sourceId), account = await repo.getAccount(accountId);
  if (!source || !account || String(account.source_id) !== sourceId || String(account.platform) !== platform || String(source.platform) !== platform) { const error = new Error('credential binding not found'); error.code = 'CREDENTIAL_NOT_FOUND'; throw error; }
  const credential = await repo.getCredentialByAccount(accountId, credentialType, { includeSecret: true });
  if (!credential) { const error = new Error('credential unavailable'); error.code = 'CREDENTIAL_NOT_FOUND'; throw error; }
  if (credential.status !== 'active') { const error = new Error('credential unavailable'); error.code = 'CREDENTIAL_INACTIVE'; throw error; }
  if (credential.expire_at && Date.parse(credential.expire_at) <= Date.now()) { const error = new Error('credential unavailable'); error.code = 'CREDENTIAL_EXPIRED'; throw error; }
  const secret = await credentialContext.loadSecretObject(accountId, credentialType); const accountValue = String(secret.account || secret.phone || '').trim(), password = String(secret.password || '');
  if (!accountValue || !password) { const error = new Error('credential unavailable'); error.code = 'CREDENTIAL_SECRET_EMPTY'; throw error; }
  return { account: accountValue, password, baseUrl: parseConfig(source.config).baseUrl || source.base_url || '' };
}
function oauthReturnUrl(params = {}) {
  const base = process.env.PUBLIC_OPINION_ADMIN_RETURN_URL || 'http://127.0.0.1:8123/admin/PublicOpinion/sources.html';
  const url = new URL(base); for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value)); return url.toString();
}
function redirect(res, location) { res.writeHead(302, { location, ...(res.corsHeaders || {}) }); res.end(); }
function success(data, meta = {}) { return { data, meta }; }
function errorPayload(code, message, details = {}) { return { error: { code, message, details } }; }
const OVERVIEW_QUERY_KEYS = new Set(['regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'period', 'from', 'to', 'fresh']); // fresh=1 旁路缓存
const OVERVIEW_CACHE_TTL_MS = 90 * 1000; // /overview 进程内缓存 TTL
const overviewCache = new Map(); // Map<cacheKey, { data, expiresAt }>；过期条目在被覆盖/命中检查时淘汰
const OVERVIEW_PERIODS = new Set(['today', 'yesterday', 'week']);
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
function overviewPeriodRange(period, now = new Date()) {
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
  const end = new Date(now);
  const beijingNow = new Date(end.getTime() + BEIJING_OFFSET_MS);
  const midnightUtc = Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate());
  const todayStart = new Date(midnightUtc - BEIJING_OFFSET_MS);
  if (period === 'today') return { from: todayStart.toISOString(), to: end.toISOString() };
  if (period === 'yesterday') return { from: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: todayStart.toISOString() };
  if (period === 'week') return { from: new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), to: end.toISOString() };
  return null;
}
function parseOverviewQuery(url) {
  for (const key of url.searchParams.keys()) if (!OVERVIEW_QUERY_KEYS.has(key)) { const error = new Error(`unsupported query parameter: ${key}`); error.code = 'INVALID_INPUT'; throw error; }
  const query = Object.fromEntries(url.searchParams);
  if (query.platform) query.platform = parseReadPlatform(query.platform);
  const { period, from, to } = query;
  if (period && !OVERVIEW_PERIODS.has(period)) { const error = new Error('period must be today, yesterday, or week'); error.code = 'INVALID_INPUT'; throw error; }
  if (period && (from || to)) { const error = new Error('period cannot be combined with from or to'); error.code = 'INVALID_INPUT'; throw error; }
  if (period) return { ...query, ...overviewPeriodRange(period) };
  for (const [key, value] of [['from', from], ['to', to]]) if (value && (!ISO_DATE_TIME_PATTERN.test(value) || Number.isNaN(Date.parse(value)))) { const error = new Error(`${key} must be an ISO date-time`); error.code = 'INVALID_INPUT'; throw error; }
  if (from && to && Date.parse(from) >= Date.parse(to)) { const error = new Error('from must be earlier than to'); error.code = 'INVALID_INPUT'; throw error; }
  if (from && to && Date.parse(to) - Date.parse(from) > 31 * 24 * 60 * 60 * 1000) { const error = new Error('overview time range cannot exceed 31 days'); error.code = 'INVALID_INPUT'; throw error; }
  return query;
}
async function readBody(req) { let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body, 'utf8') > Number(process.env.PUBLIC_OPINION_IMPORT_MAX_BODY_BYTES || 5242880)) { const error = new Error('request body is too large'); error.code = 'REQUEST_TOO_LARGE'; throw error; } } return body ? JSON.parse(body) : {}; }
function isPlainObject(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function requireImportToken(req) {
  const expected = String(process.env.PUBLIC_OPINION_IMPORT_TOKEN || '').trim();
  if (!expected) {
    const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (remote === '127.0.0.1' || remote === '::1' || remote === 'localhost') return;
    const error = new Error('content import requires a configured token for non-local requests'); error.code = 'UNAUTHORIZED'; throw error;
  }
  const authorization = String(req.headers.authorization || '');
  const actual = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!actual || actual.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) { const error = new Error('invalid import token'); error.code = 'UNAUTHORIZED'; throw error; }
}

// SSRF 防线：后台填入的 baseUrl 必须是 http(s) 且 host 在连接器白名单（env 控）内，否则拒绝。
// 白名单是唯一可信边界，页面改不了；localhost/内网非白名单地址天然被拦下。
// 校验通过返回 null，失败返回错误信息字符串。
function validateBaseUrl(platform, baseUrl) {
  if (!baseUrl || !String(baseUrl).trim()) return 'baseUrl is required';
  let parsed;
  try { parsed = new URL(String(baseUrl)); } catch { return 'baseUrl 不是合法 URL'; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return 'baseUrl 必须是 http(s) 链接';
  if (parsed.username || parsed.password) return 'baseUrl 不得包含用户名或密码';
  if (parsed.hash) return 'baseUrl 不得包含 fragment';
  const connector = connectors[platform];
  if (connector && typeof connector.hostAllowed === 'function') {
    if (!connector.hostAllowed(String(baseUrl))) return `baseUrl 的域名 ${parsed.host} 不在允许名单内（内网/localhost 被拒绝）`;
  }
  return null;
}
// 起始路径：逗号分隔字符串或数组 → 规整成非空字符串数组，默认 ['/']。
function normalizeStartPaths(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(',');
  const paths = arr.map(p => String(p).trim()).filter(Boolean);
  return paths.length ? paths : ['/'];
}
function parsePublishedBoundary(value, key) {
  if (!value) return value;
  if (!ISO_DATE_TIME_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    const error = new Error(`${key} must be an ISO date-time`);
    error.code = 'INVALID_INPUT';
    throw error;
  }
  // MySQL stores published_at as a UTC wall-clock string. Normalize every
  // ISO boundary, including +08:00 browser values, before string comparison.
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}
const UTC_SYNC_BOUNDARY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function parseUtcSyncBoundary(value, key) {
  if (typeof value !== 'string' || !UTC_SYNC_BOUNDARY_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    const error = new Error(`${key} must be a UTC ISO date-time ending in Z`);
    error.code = 'INVALID_INPUT';
    throw error;
  }
  return new Date(value).toISOString();
}
async function latestQ1Batch() {
  const root = process.env.Q1_DAILY_OUT_ROOT || path.resolve(__dirname, '../../../.temp');
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch (_) { return null; }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^q1-(?:daily|crawl)/i.test(entry.name)) continue;
    const file = path.join(root, entry.name, 'summary.json');
    try {
      const summary = JSON.parse(await fs.readFile(file, 'utf8'));
      if (summary?.window && Array.isArray(summary?.import?.analysisEligibleIds)) candidates.push({ summary, file, mtime: (await fs.stat(file)).mtimeMs });
    } catch (_) { /* ignore incomplete batch summaries */ }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.summary || null;
}
function analysisTerminal(counts) { return !counts.total || (counts.pending + counts.running + counts.retryable === 0); }
const PUBLIC_SYNC_SCOPES = new Set(['posts', 'comments']);
const FACEBOOK_REQUIRED_CAPABILITIES = Object.freeze(['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies']);
const FACEBOOK_SYSTEM_CREDENTIAL_STATUSES = new Set(['not_configured', 'configured', 'invalid', 'expired']);
const FACEBOOK_STABLE_ERROR_CODES = new Set([
  'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
  'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
  'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED',
  'FACEBOOK_PAGE_NOT_FOUND',
  'FACEBOOK_PAGE_MANAGEMENT_REQUIRED',
  'FACEBOOK_MODERATE_CAPABILITY_REQUIRED',
  'FACEBOOK_CAPABILITY_MISSING',
  'FACEBOOK_RATE_LIMITED',
  'FACEBOOK_API_UNAVAILABLE'
]);
const REPLY_URL_ALIASES = ['repliesApiUrl', 'replies_api_url', 'replyApiUrl', 'reply_api_url'];
function isFacebookSource(source) { return normalizePlatform(source?.platform) === 'facebook'; }
function sourceCapabilityScopes(source) { return isFacebookSource(source) ? FACEBOOK_REQUIRED_CAPABILITIES : [...PUBLIC_SYNC_SCOPES]; }
function findFacebookSensitiveField(value, prefix = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      normalized.includes('credential') || normalized.includes('token') || normalized.includes('cookie') ||
      normalized.includes('password') || normalized === 'secret' || normalized === 'secretref' ||
      ['account', 'username', 'login', 'loginaccount', 'phone', 'email'].includes(normalized)
    ) return path;
    const nested = findFacebookSensitiveField(child, path);
    if (nested) return nested;
  }
  return null;
}
function facebookSensitivePayloadError(body) {
  const field = findFacebookSensitiveField(body);
  if (!field) return null;
  const error = new Error(`Facebook 来源不接收凭据或登录信息：${field}`);
  error.code = 'INVALID_INPUT';
  error.status = 400;
  error.details = { field };
  return error;
}
function rejectFacebookSensitivePayload(body) {
  const error = facebookSensitivePayloadError(body);
  if (error) throw error;
}
function normalizeFacebookSystemCredentialStatus(result = {}) {
  const status = String(result.systemCredentialStatus || '').trim().toLowerCase();
  if (FACEBOOK_SYSTEM_CREDENTIAL_STATUSES.has(status)) return status;
  return result.configured ? 'configured' : 'not_configured';
}
function facebookSystemCredentialErrorCode(status) {
  return {
    not_configured: 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
    invalid: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
    expired: 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED'
  }[status] || null;
}
function normalizeFacebookCapabilityStatus(value) {
  const status = typeof value === 'string' ? value : value?.status;
  if (status === 'available' || status === 'authorized_scope') return 'authorized_scope';
  if (status === 'untested' || status === 'unknown' || status === 'configured' || !status) return 'untested';
  return 'unauthorized';
}
function sanitizeFacebookCapabilityDetail(value = {}, systemCredentialStatus, fallbackErrorCode = 'FACEBOOK_CAPABILITY_MISSING') {
  const detail = value && typeof value === 'object' ? value : { status: value };
  const normalizedStatus = normalizeFacebookCapabilityStatus(detail);
  const errorCode = FACEBOOK_STABLE_ERROR_CODES.has(detail.errorCode) ? detail.errorCode : fallbackErrorCode;
  return {
    status: normalizedStatus === 'authorized_scope' ? 'authorized_scope' : 'unavailable',
    ...(normalizedStatus === 'authorized_scope' || !FACEBOOK_STABLE_ERROR_CODES.has(errorCode) ? {} : { errorCode }),
    ...(detail.pageId ? { pageId: String(detail.pageId) } : {}),
    ...(detail.pageName ? { pageName: String(detail.pageName) } : {}),
    ...(detail.pageUrl ? { pageUrl: String(detail.pageUrl) } : {}),
    ...(systemCredentialStatus ? { systemCredentialStatus } : {})
  };
}
function facebookCapabilityResponse(result = {}) {
  const systemCredentialStatus = normalizeFacebookSystemCredentialStatus(result);
  const systemErrorCode = facebookSystemCredentialErrorCode(systemCredentialStatus);
  const detected = result.capabilities && typeof result.capabilities === 'object' ? result.capabilities : {};
  const capabilities = {};
  for (const scope of FACEBOOK_REQUIRED_CAPABILITIES) {
    const scopeFallback = systemErrorCode || (scope === 'pageManagement'
      ? 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED'
      : scope === 'moderate'
        ? 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED'
        : 'FACEBOOK_CAPABILITY_MISSING');
    capabilities[scope] = sanitizeFacebookCapabilityDetail(detected[scope], systemCredentialStatus, scopeFallback);
  }
  const reason = systemErrorCode || (FACEBOOK_STABLE_ERROR_CODES.has(result.errorCode) ? result.errorCode : null) ||
    (FACEBOOK_STABLE_ERROR_CODES.has(result.reason) ? result.reason : null) ||
    FACEBOOK_REQUIRED_CAPABILITIES.map(scope => capabilities[scope].errorCode).find(Boolean) || null;
  return { systemCredentialStatus, capabilities, reason };
}
function facebookReadinessError(result = {}, capabilities = result.capabilities || {}) {
  const systemCredentialStatus = normalizeFacebookSystemCredentialStatus(result);
  const credentialCode = {
    not_configured: 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
    invalid: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
    expired: 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED'
  }[systemCredentialStatus];
  let code = FACEBOOK_STABLE_ERROR_CODES.has(result.errorCode) ? result.errorCode : credentialCode;
  if (!code && normalizeFacebookCapabilityStatus(capabilities.pageManagement) !== 'authorized_scope') code = 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED';
  if (!code && normalizeFacebookCapabilityStatus(capabilities.moderate) !== 'authorized_scope') code = 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED';
  if (!code && ['page', 'posts', 'comments', 'replies'].some(scope => normalizeFacebookCapabilityStatus(capabilities[scope]) !== 'authorized_scope')) code = 'FACEBOOK_CAPABILITY_MISSING';
  if (!code) return null;
  const error = new Error(result.reason || code);
  error.code = code;
  error.status = code.startsWith('FACEBOOK_SYSTEM_CREDENTIAL_') ? 503 : 409;
  error.details = {
    systemCredentialStatus,
    capabilities: Object.fromEntries(FACEBOOK_REQUIRED_CAPABILITIES.map(scope => [scope, normalizeFacebookCapabilityStatus(capabilities[scope])]))
  };
  return error;
}
function sanitizeFacebookAccount(account) {
  if (!account || normalizePlatform(account.platform) !== 'facebook') return account;
  const sanitized = { ...account };
  for (const key of ['auth_expire_at', 'authExpireAt', 'credential_configured', 'credentialConfigured', 'hasToken', 'has_token', 'hasAccountPassword', 'has_account_password', 'masked_login_identifier', 'masked_phone', 'maskedAccount']) delete sanitized[key];
  return sanitized;
}
function westernAllowedHosts() { return connectors.bigplayer_h5?.allowedHosts || []; }
function westernCandidate(value = {}) {
  const config = parseConfig(value.config);
  return {
    ...value,
    regionCode: value.regionCode ?? value.region_code,
    editionScope: value.editionScope ?? config.editionScope,
    baseUrl: value.baseUrl ?? value.apiUrl ?? config.baseUrl
  };
}
function isWesternSourceRecord(source) {
  return isWesternOverseasSource(westernCandidate(source), { allowedHosts: westernAllowedHosts() });
}
function assertWesternSourceRecord(source) {
  if (isFacebookSource(source)) {
    if (source.region_code !== 'overseas' || source.game_id !== OVERSEAS_LAST_NIGHT_GAME_ID || source.community_id !== OVERSEAS_LAST_NIGHT_COMMUNITY_ID) {
      const error = new Error('Facebook 采集源仅支持境外 Last Night 社区');
      error.code = 'FACEBOOK_SCOPE_MISMATCH';
      error.status = 400;
      throw error;
    }
    const urlError = validateFacebookPageUrl(parseConfig(source.config).baseUrl);
    if (urlError) {
      const error = new Error(urlError);
      error.code = 'FACEBOOK_URL_INVALID';
      error.status = 400;
      throw error;
    }
    return true;
  }
  const config = parseConfig(source?.config);
  if (String(config.editionScope || '').toLowerCase() !== WESTERN_EDITION_SCOPE) return false;
  if (isWesternSourceRecord(source)) return true;
  const error = new Error('欧美版源必须使用 bigplayer_h5、overseas、western、HTTPS 和允许域名');
  error.code = 'WESTERN_SCOPE_MISMATCH';
  error.status = 400;
  throw error;
}
function credentialConfiguredSummary(source) {
  const account = source?.account || null;
  return Boolean(
    account?.hasToken || account?.has_token || account?.credential_configured || account?.credentialConfigured ||
    source?.hasToken || source?.has_token || source?.credential_configured || source?.credentialConfigured
  );
}
function unconfiguredCredentialError(source) {
  // Facebook 使用部署级受控凭据，不能再以来源/账号凭据摘要作为准入依据。
  if (isFacebookSource(source) || !isWesternSourceRecord(source) || credentialConfiguredSummary(source)) return null;
  const error = new Error('请先在编辑页配置 Token');
  error.code = 'SOURCE_AUTH_UNCONFIGURED';
  error.status = 401;
  return error;
}
function phaseBlockError(source) {
  const unconfigured = unconfiguredCredentialError(source);
  if (unconfigured) return unconfigured;
  return null;
}
function rejectPhaseAction(source) {
  const error = phaseBlockError(source);
  if (error) throw error;
}
// 授权检测/能力检测已对固定境外源开放；Facebook 凭据门禁由连接器的部署级状态负责。
function rejectUnconfiguredCredential(source) {
  const error = unconfiguredCredentialError(source);
  if (error) throw error;
}
function parseConfig(value) {
  if (value && typeof value === 'object') return value;
  if (!value) return {};
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch (_) { return {}; }
}
function sanitizeSource(source) {
  if (!source) return source;
  const sanitized = { ...source }; const config = { ...parseConfig(source.config) };
  for (const key of REPLY_URL_ALIASES) { delete sanitized[key]; delete config[key]; }
  return { ...sanitized, config: typeof source.config === 'string' ? JSON.stringify(config) : config };
}
function credentialErrorStatus(code) { return ['CREDENTIAL_NOT_FOUND', 'CREDENTIAL_INACTIVE', 'CREDENTIAL_EXPIRED', 'CREDENTIAL_SECRET_MISSING', 'UNAUTHORIZED'].includes(code) ? 401 : code === 'SOURCE_DISABLED' ? 409 : ['ACCOUNT_NOT_FOUND', 'CAPABILITY_UNSUPPORTED', 'GAME_DISABLED'].includes(code) ? 400 : 500; }
async function requireEnabledCommunityForSource(source) {
  if (!source?.community_id || !source?.game_id) { const error = new Error('采集源未关联社区'); error.code = 'COMMUNITY_NOT_FOUND'; error.status = 400; throw error; }
  try { return await communityDirectory.requireEnabled({ communityId: source.community_id, gameId: source.game_id, regionCode: source.region_code }); }
  catch (error) {
    const providerUnavailable = ['COMMUNITY_PROVIDER_NOT_CONFIGURED', 'COMMUNITY_PROVIDER_UNAVAILABLE', 'COMMUNITY_PROVIDER_TIMEOUT', 'COMMUNITY_PROVIDER_ERROR'].includes(error.code);
    if (!providerUnavailable || !isWesternSourceRecord(source)) throw error;
    const mirror = await repo.getCommunityForGame(source.community_id, source.game_id, { enabledOnly: true });
    if (!mirror || mirror.status !== 'enabled' || mirror.region_code !== 'overseas') { const missing = new Error('社区不可用'); missing.code = 'COMMUNITY_NOT_FOUND'; missing.status = 400; throw missing; }
    return mirror;
  }
}
async function sourceWithAccount(source) {
  if (!source) return null;
  const listAccounts = repo.listAccounts({ sourceId: source.id }).catch(error => { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; });
  const listCapabilities = repo.listSourceCapabilities(source.id).catch(error => { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; });
  const [accounts, persisted] = await Promise.all([listAccounts, listCapabilities]);
  const account = (source.default_account_id ? accounts.find(item => String(item.id) === String(source.default_account_id)) : null) || accounts[0] || null;
  const [checkpoints, credentials] = account
    ? await Promise.all([repo.getSyncStatus({ accountId: account.id }), account && !isFacebookSource(source) ? repo.getAccountCredentialSummary(account.id) : Promise.resolve([])])
    : [[], []];
  const connector = connectors[source.platform]; let capabilities = {};
  let systemCredentialStatus;
  if (isFacebookSource(source)) {
    const pageRow = persisted.find(item => item.capability === 'page');
    const pageDetail = parseConfig(pageRow?.detail);
    let installation = {};
    try { installation = connector && typeof connector.installationHealth === 'function' ? await connector.installationHealth(source) : {}; } catch (_) { installation = {}; }
    systemCredentialStatus = FACEBOOK_SYSTEM_CREDENTIAL_STATUSES.has(pageDetail.systemCredentialStatus)
      ? pageDetail.systemCredentialStatus
      : normalizeFacebookSystemCredentialStatus(installation);
    const persistedByScope = new Map(persisted.map(item => [item.capability, item]));
    const systemErrorCode = facebookSystemCredentialErrorCode(systemCredentialStatus);
    capabilities = Object.fromEntries(FACEBOOK_REQUIRED_CAPABILITIES.map(scope => {
      const row = persistedByScope.get(scope);
      const detail = { ...parseConfig(row?.detail), status: row?.status };
      const fallback = systemErrorCode || (scope === 'pageManagement'
        ? 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED'
        : scope === 'moderate'
          ? 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED'
          : 'FACEBOOK_CAPABILITY_MISSING');
      return [scope, sanitizeFacebookCapabilityDetail(detail, systemCredentialStatus, fallback)];
    }));
  } else {
    const capabilityScopes = new Set(sourceCapabilityScopes(source));
    capabilities = Object.fromEntries(persisted.filter(item => capabilityScopes.has(item.capability)).map(item => [item.capability, item.status]));
  }
  for (const scope of sourceCapabilityScopes(source)) if (!capabilities[scope]) {
    const supported = connector?.hasSourceCapability ? connector.hasSourceCapability(scope, source) : connector?.hasCapability?.(scope);
    capabilities[scope] = !supported ? 'unsupported' : account?.auth_status === 'authorized' ? 'authorized_scope' : 'unauthorized';
  }
  if (account) {
    const hasCredential = credentials.some(item => item.has_secret_cipher || item.has_secret_ref);
    const hasToken = credentials.some(item => ['api_token', 'oauth_access_refresh'].includes(item.credential_type) && (item.has_secret_cipher || item.has_secret_ref));
    const hasAccountPassword = credentials.some(item => item.credential_type === 'account_password' && (item.has_secret_cipher || item.has_secret_ref));
    account.credential_configured = Boolean(account.credential_configured || account.credentialConfigured || hasCredential);
    account.masked_phone = account.masked_login_identifier || null;
    account.hasToken = Boolean(account.hasToken || account.has_token || hasToken);
    account.hasAccountPassword = Boolean(account.hasAccountPassword || account.has_account_password || hasAccountPassword);
    account.maskedAccount = account.masked_login_identifier || null;
  }
  const safeAccount = sanitizeFacebookAccount(account);
  const safeAccounts = accounts.map(sanitizeFacebookAccount);
  return { ...sanitizeSource(source), account: safeAccount, accounts: safeAccounts, checkpoints, capabilities, ...(isFacebookSource(source) ? { systemCredentialStatus } : {}) };
}
async function sourceWithCredentialState(source) {
  return isWesternSourceRecord(source) || isFacebookSource(source) ? sourceWithAccount(source) : source;
}
function hasLegacyBigPlayerBackfill(...values) {
  return values.some(value => {
    const config = parseConfig(value);
    return config.syncMode === 'backfill' || (config.historyStart != null && config.historyStart !== '');
  });
}
function rejectBigPlayerLegacyBackfill(platform, ...values) {
  if (normalizePlatform(platform) !== 'bigplayer_h5' || !hasLegacyBigPlayerBackfill(...values)) return;
  const error = new Error('BigPlayer backfill requires POST /sources/:id/sync with publishedFrom and publishedTo');
  error.code = 'INVALID_INPUT';
  throw error;
}
async function rejectConfiguredBigPlayerLegacyBackfill(source, account = null) {
  if (!source || normalizePlatform(source.platform) !== 'bigplayer_h5') return;
  // Keep this gate aligned with requireAuthorizedAccount/source sync: when an
  // explicit account is not supplied, the newest enabled account is selected.
  const effectiveAccount = account || await defaultAccountForSource(source);
  rejectBigPlayerLegacyBackfill(source.platform, source.config, effectiveAccount?.metadata);
}
async function sourceById(id) { return (await repo.listSources()).find(source => source.id === id) || null; }
async function defaultAccountForSource(source, { exactDefault = false } = {}) {
  if (!source) return null;
  if (exactDefault && Object.hasOwn(source, 'default_account_id')) {
    if (!source.default_account_id) return null;
    const account = await repo.getAccount(source.default_account_id);
    if (!account) return null;
    if (String(account.source_id) !== String(source.id) || String(account.game_id) !== String(source.game_id)
      || String(account.platform) !== String(source.platform) || String(account.community_id || '') !== String(source.community_id || '')) {
      const error = new Error('default account does not belong to source scope');
      error.code = 'OWNERSHIP_MISMATCH';
      throw error;
    }
    return account;
  }
  if (isFacebookSource(source)) return (await repo.listAccounts({ sourceId: source.id, gameId: source.game_id, platform: source.platform }))[0] || null;
  return repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform });
}
async function connectorAccountHealth(connector, source, account) {
  return normalizePlatform(source?.platform) === 'facebook'
    ? connector.accountHealth({ source, account })
    : normalizePlatform(source?.platform) === 'discord'
      ? connector.accountHealth({ source, account, credentialContext })
    : connector.accountHealth({ ...source, id: account.id, account_id: account.id });
}
async function requireAuthorizedAccount(source, { exactDefault = false, stableStateErrors = false } = {}) {
  const connector = source && connectors[source.platform];
  if (!connector) { const error = new Error('connector not found'); error.code = 'CAPABILITY_UNSUPPORTED'; throw error; }
  if (stableStateErrors && source.auth_status !== 'authorized') { const error = new Error('source is not authorized'); error.code = 'SOURCE_UNAUTHORIZED'; throw error; }
  if (stableStateErrors && source.auth_expire_at && Date.parse(source.auth_expire_at) <= Date.now()) { const error = new Error('source authorization is expired'); error.code = 'SOURCE_AUTH_EXPIRED'; throw error; }
  const account = await defaultAccountForSource(source, { exactDefault });
  if (!account) { const error = new Error('default account is required'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
  if (!account.enabled) { const error = new Error('default account is disabled'); error.code = stableStateErrors ? 'ACCOUNT_DISABLED' : 'ACCOUNT_NOT_FOUND'; throw error; }
  if (stableStateErrors && account.auth_status !== 'authorized') { const error = new Error('default account is not authorized'); error.code = 'ACCOUNT_UNAUTHORIZED'; throw error; }
  if (stableStateErrors && account.auth_expire_at && Date.parse(account.auth_expire_at) <= Date.now()) { const error = new Error('default account authorization is expired'); error.code = 'ACCOUNT_AUTH_EXPIRED'; throw error; }
  const health = await connectorAccountHealth(connector, source, account);
  if (isFacebookSource(source)) {
    const readiness = facebookReadinessError(health || {});
    if (readiness) throw readiness;
  } else if (!health?.authorized) { const error = new Error(health?.reason || 'account is unauthorized'); error.code = 'UNAUTHORIZED'; throw error; }
  const postsSupported = typeof connector.hasSourceCapability === 'function' ? connector.hasSourceCapability('posts', source) : connector.hasCapability?.('posts');
  if (!postsSupported) { const error = new Error('posts capability is unsupported'); error.code = 'CAPABILITY_UNSUPPORTED'; throw error; }
  return { account, connector, health };
}
async function requireFacebookCapabilitiesReady(source) {
  if (!isFacebookSource(source)) return;
  const rows = await repo.listSourceCapabilities(source.id);
  const statusByCapability = new Map(rows.map(item => [item.capability, item.status]));
  const missing = FACEBOOK_REQUIRED_CAPABILITIES.filter(capability => normalizeFacebookCapabilityStatus(statusByCapability.get(capability)) !== 'authorized_scope');
  if (!missing.length) return;
  const code = missing.includes('pageManagement')
    ? 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED'
    : missing.includes('moderate')
      ? 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED'
      : 'FACEBOOK_CAPABILITY_MISSING';
  const error = new Error('Facebook Page 管理授权、MODERATE、主页、帖子、评论和回复能力必须全部检测通过后才能启用');
  error.code = code;
  error.status = 409;
  error.details = { capabilities: missing };
  throw error;
}
async function persistFacebookPageIdentity(source, account, result = {}) {
  if (!isFacebookSource(source) || !account) return;
  const page = result.capabilities?.page || result.page || result;
  if (!page?.pageId) return;
  await repo.updateAccount(account.id, {
    platformAccountId: String(page.pageId),
    accountName: page.pageName ? String(page.pageName) : undefined,
    profileUrl: page.pageUrl ? String(page.pageUrl) : undefined
  });
}
function accountPatch(body = {}) { return { platformAccountId: body.platformAccountId, accountName: body.accountName, accountType: body.accountType, profileUrl: body.profileUrl, enabled: body.enabled, authStatus: body.authStatus, authExpireAt: body.authExpireAt, metadata: body.metadata }; }
function credentialAad({ accountId, credentialType, platform }) { return `${accountId}:${credentialType}:${platform}`; }
function maskLoginIdentifier(value) {
  const identifier = String(value || '').trim();
  if (!identifier) return null;
  const phoneMask = maskPhone(identifier);
  if (phoneMask) return phoneMask;
  if (identifier.length <= 2) return `${identifier[0]}*`;
  return `${identifier.slice(0, 2)}${'*'.repeat(Math.min(6, Math.max(3, identifier.length - 4)))}${identifier.slice(-2)}`;
}
function validateAccountPassword(body = {}) {
  const account = String(body.account ?? body.phone ?? '').trim();
  const password = String(body.password ?? '');
  if (!account) return 'account is required';
  if (!password) return 'password is required';
  if (password !== String(body.confirmPassword ?? '')) return '两次输入的密码不一致';
  if (account.length > 256 || password.length > 512) return 'account or password is too long';
  return null;
}
// TapTap 免登采集：accountIds 支持数组或逗号/换行分隔字符串，最多 20 个纯数字 ID。
function normalizeTaptapAccountIds(value) {
  const raw = Array.isArray(value) ? value.map(String) : String(value || '').split(/[,，\n\r]+/);
  return [...new Set(raw.map(item => item.trim()).filter(item => /^\d+$/.test(item)))];
}
// 平台采集频率下限（秒）：TapTap 免登采集最低 2 小时（自限流 800ms/页 + 告警滑窗语义），其他平台保持 15 分钟档下限。
const MIN_FREQUENCY_SECONDS = { taptap: 7200 };
const DEFAULT_MIN_FREQUENCY_SECONDS = 900;
function minFrequencySeconds(platform) { return MIN_FREQUENCY_SECONDS[normalizePlatform(platform)] || DEFAULT_MIN_FREQUENCY_SECONDS; }
function validateFrequencySeconds(platform, value) {
  const min = minFrequencySeconds(platform);
  if (!Number.isInteger(value) || value <= 0) return 'frequencySeconds 须为正整数';
  if (value < min) {
    const label = min >= 3600 ? `${Math.round(min / 3600)} 小时` : `${Math.round(min / 60)} 分钟`;
    return `frequencySeconds 不能低于 ${label}（${min} 秒），当前平台允许的最小采集频率为 ${label}`;
  }
  return null;
}
// 每日定时时刻 HH:mm（北京时间）：frequencySeconds=86400 时生效，存 po_sources.config.schedule_time。
function validateScheduleTime(platform, value, frequencySeconds) {
  if (value == null || String(value).trim() === '') return null;
  if (normalizePlatform(platform) !== 'taptap') return 'scheduleTime 仅支持 TapTap 采集源';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value).trim())) return 'scheduleTime 须为 HH:mm 格式（00:00–23:59）';
  if (Number(frequencySeconds) !== 86400) return 'scheduleTime 仅在采集频率为每天 1 次（86400 秒）时可用';
  return null;
}
function normalizeScheduleTime(value) { const text = String(value || '').trim(); return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null; }
function validateTaptapAccountIds(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = Array.isArray(value) ? value.map(String) : String(value || '').split(/[,，\n\r]+/);
  const entries = raw.map(item => item.trim()).filter(Boolean);
  if (!entries.length) return null;
  if (entries.some(item => !/^\d+$/.test(item))) return '监控账号 ID 必须为纯数字的 TapTap 用户 ID';
  if (entries.length > 20) return '监控账号 ID 数量不能超过 20 个';
  return null;
}
function normalizeTaptapGroupIds(value) {
  const raw = Array.isArray(value) ? value.map(String) : String(value || '').split(/[,，\n\r]+/);
  return [...new Set(raw.map(item => item.trim().replace(/^.*\/group\/(\d+).*$/, '$1')).filter(item => /^\d+$/.test(item)))];
}
const DISCORD_SNOWFLAKE = /^\d{15,22}$/;
const DISCORD_MAX_CHANNEL_IDS = 50;
function normalizeDiscordChannelIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,，\n\r]+/);
  return [...new Set(raw.map(item => String(item || '').trim()).filter(item => DISCORD_SNOWFLAKE.test(item)))].slice(0, DISCORD_MAX_CHANNEL_IDS);
}
function normalizeDiscordChannelScope(value) {
  if (value == null || value === '') return 'selected';
  return String(value).trim().toLowerCase();
}
function validateDiscordSourceConfig(body = {}, { partial = false } = {}) {
  const guildId = String(body.guildId ?? body.guild_id ?? '').trim();
  const rawChannels = body.channelIds ?? body.channel_ids;
  const hasScope = body.channelScope != null || body.channel_scope != null;
  const channelScope = normalizeDiscordChannelScope(body.channelScope ?? body.channel_scope);
  if (hasScope && !['selected', 'all_accessible'].includes(channelScope)) return 'Discord channelScope 仅支持 selected 或 all_accessible';
  if (!partial || guildId) {
    if (!DISCORD_SNOWFLAKE.test(guildId)) return 'Discord Guild ID 必须为 15–22 位数字';
  }
  if ((!partial || rawChannels != null || hasScope) && channelScope === 'selected') {
    const raw = Array.isArray(rawChannels) ? rawChannels : String(rawChannels || '').split(/[,，\n\r]+/);
    const entries = raw.map(item => String(item || '').trim()).filter(Boolean);
    if (!entries.length) return '指定频道模式至少需要配置一个 Discord 频道 ID';
    if (entries.some(item => !DISCORD_SNOWFLAKE.test(item))) return 'Discord 频道 ID 必须为 15–22 位数字';
    if (entries.length > DISCORD_MAX_CHANNEL_IDS) return `Discord 频道数量不能超过 ${DISCORD_MAX_CHANNEL_IDS} 个`;
  }
  for (const key of ['includeThreads', 'includeReplies', 'historySyncEnabled', 'anonymizeAuthors']) if (body[key] != null && typeof body[key] !== 'boolean') return `${key} must be boolean`;
  if (body.retentionDays != null && (!Number.isInteger(Number(body.retentionDays)) || Number(body.retentionDays) < 0 || Number(body.retentionDays) > 3650)) return 'retentionDays 必须是 0–3650 的整数';
  return null;
}
function discordSourceConfig(body = {}, existing = {}) {
  const next = { ...existing };
  const hasScope = body.channelScope != null || body.channel_scope != null;
  const channelScope = hasScope ? normalizeDiscordChannelScope(body.channelScope ?? body.channel_scope) : normalizeDiscordChannelScope(existing.channelScope ?? existing.channel_scope);
  if (body.guildId != null || body.guild_id != null) next.guildId = String(body.guildId ?? body.guild_id).trim();
  if (hasScope) next.channelScope = channelScope;
  if (channelScope === 'all_accessible') next.channelIds = [];
  else if (body.channelIds != null || body.channel_ids != null) next.channelIds = normalizeDiscordChannelIds(body.channelIds ?? body.channel_ids);
  for (const key of ['includeThreads', 'includeReplies', 'historySyncEnabled', 'anonymizeAuthors']) if (body[key] != null) next[key] = body[key];
  if (body.retentionDays != null) next.retentionDays = Number(body.retentionDays);
  return next;
}
function validateTaptapGroupIds(value) {
  if (value == null || String(value).trim() === '') return null;
  const raw = Array.isArray(value) ? value.map(String) : String(value || '').split(/[,，\n\r]+/);
  const entries = raw.map(item => item.trim().replace(/^.*\/group\/(\d+).*$/, '$1')).filter(Boolean);
  if (!entries.length) return null;
  if (entries.some(item => !/^\d+$/.test(item))) return '社区组 ID 必须为纯数字或 group 页链接';
  if (entries.length > 20) return '社区组 ID 数量不能超过 20 个';
  return null;
}
function accountPasswordSummary(account, credential) {
  return {
    configured: Boolean(credential?.has_secret_cipher || credential?.has_secret_ref),
    status: credential?.status || 'unconfigured',
    expireAt: credential?.expire_at || null,
    maskedLoginIdentifier: account?.masked_login_identifier || null
  };
}
function accountConfirmation(accountId, value) {
  return String(value || '') === String(accountId || '').slice(-6);
}
async function writeCredential(accountId, body, platform = '') {
  if (!body.secret || !String(body.secret).trim()) { const error = new Error('secret is required'); error.code = 'INVALID_INPUT'; throw error; }
  const credentialType = body.credentialType || 'api_token';
  const secretCipher = credentialCipher.encrypt(String(body.secret), process.env, { aad: credentialAad({ accountId, credentialType, platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
  return repo.upsertAccountCredential(accountId, { credentialType, secretCipher, status: 'active', expireAt: body.expireAt || null });
}
function loginBinding(source, account) { return { sourceId: source.id, accountId: account.id, platform: normalizePlatform(source.platform) }; }
async function socialSourceAccount(id) {
  const source = await sourceById(id); if (!source) return {};
  const account = await defaultAccountForSource(source);
  return { source, account };
}
async function updateSocialStatus(source, account, status) {
  const mapped = status.status === 'active' ? 'authorized' : status.status === 'invalid_credentials' ? 'unauthorized' : ['manual_verification', 'awaiting_manual_verification'].includes(status.status) ? 'awaiting_manual_verification' : status.status === 'session_expired' ? 'expired' : 'unconfigured';
  if (status.status === 'active') {
    // 登录成功后领取一次性 auth result，把真实 Token 加密写回 api_token，供连通性探测与采集使用。
    try {
      const result = await loginSessionClient.claimAuthResult({ sourceId: source.id, accountId: account.id, platform: normalizePlatform(source.platform) });
      const apiToken = result?.apiToken || result?.accessToken;
      if (typeof apiToken === 'string' && apiToken.trim()) {
        const secretCipher = credentialCipher.encrypt(apiToken, process.env, { aad: credentialAad({ accountId: account.id, credentialType: 'api_token', platform: source.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
        await repo.upsertAccountCredential(account.id, { credentialType: 'api_token', secretCipher, status: 'active', expireAt: result.expiresAt || null });
      }
    } catch (error) {
      // 领取失败不阻塞状态映射；后续 check-auth/check-capabilities 会暴露具体问题。
    }
  }
  await repo.updateAccount(account.id, { authStatus: mapped });
  await repo.updateSourceAuth(source.id, { authStatus: mapped });
  return status;
}

function normalizeKeyword(value) { return String(value || '').trim().normalize('NFKC').toLocaleLowerCase(); }

// 关键词规则校验：空组名/重复词/阈值与时间窗须为正整数。返回首个错误信息，全过返回 null。
function validateRuleGroups(groups) {
  if (!Array.isArray(groups)) return 'groups must be an array';
  const seen = new Set();
  for (const group of groups) {
    if (!group.groupName || !String(group.groupName).trim()) return 'groupName is required';
    if (!Array.isArray(group.keywords) || group.keywords.length === 0) return `group「${group.groupName}」至少需要一个关键词`;
    for (const kw of group.keywords) {
      const key = `${group.platform || ''}|${normalizeKeyword(kw)}`;
      if (!String(kw).trim()) return `group「${group.groupName}」存在空关键词`;
      if (seen.has(key)) return `关键词「${kw}」在同一平台重复`;
      seen.add(key);
    }
    if (group.triggerMode === 'aggregate') {
      if (!(Number(group.thresholdCount) > 0)) return `group「${group.groupName}」threshold_count 须为正整数`;
      if (!(Number(group.windowSeconds) > 0)) return `group「${group.groupName}」window_seconds 须为正整数`;
    }
  }
  return null;
}
// 把后台提交的分组结构拍平成 po_keyword_rules 行
function flattenRuleGroups(gameId, communityId, groups) {
  const rows = [];
  for (const group of groups) for (const kw of group.keywords) rows.push({ gameId, communityId, platform: group.platform || null, keyword: String(kw).trim(), groupName: String(group.groupName).trim(), severity: group.severity === 'urgent' ? 'urgent' : 'attention', triggerMode: group.triggerMode === 'immediate' ? 'immediate' : 'aggregate', windowSeconds: Number(group.windowSeconds) || 1800, thresholdCount: Number(group.thresholdCount) || 1 });
  return rows;
}
// 把原始规则行按 group_name+platform 聚合成前端分组结构
function groupKeywordRules(rows) {
  const byGroup = new Map();
  for (const r of rows) {
    const key = `${r.group_name || ''}|${r.platform || ''}|${r.trigger_mode}`;
    if (!byGroup.has(key)) byGroup.set(key, { groupName: r.group_name, platform: r.platform, severity: r.severity, triggerMode: r.trigger_mode, windowSeconds: r.window_seconds, thresholdCount: r.threshold_count, keywords: [] });
    byGroup.get(key).keywords.push(r.keyword);
  }
  return [...byGroup.values()];
}
function parsePlatform(value) {
  if (!value) return undefined;
  const platform = normalizePlatform(value);
  if (!SOURCE_PLATFORMS.has(platform)) { const error = new Error('platform is not supported'); error.code = 'INVALID_INPUT'; throw error; }
  return platform;
}
const READ_PLATFORM_FILTERS = new Set([...SOURCE_PLATFORMS, 'facebook']);
function parseReadPlatform(value) {
  if (!value) return undefined;
  const platform = normalizePlatform(value);
  if (!READ_PLATFORM_FILTERS.has(platform)) { const error = new Error('platform is not supported'); error.code = 'INVALID_INPUT'; throw error; }
  return platform;
}
function scopeFromQuery(url, { readPlatform = false } = {}) {
  const parse = readPlatform ? parseReadPlatform : parsePlatform;
  return {
    regionCode: url.searchParams.get('regionCode') || undefined,
    gameId: url.searchParams.get('gameId') || undefined,
    communityId: url.searchParams.get('communityId') || undefined,
    sourceId: url.searchParams.get('sourceId') || undefined,
    platform: parse(url.searchParams.get('platform'))
  };
}
async function resolveCanonicalScope(input = {}) {
  const regionCode = input.regionCode || null;
  if (!input.communityId) return { ...input, regionCode, gameId: input.gameId || null, communityId: null };
  if (input.gameId) {
    const game = await repo.getGame(input.gameId);
    if (!game) { const error = new Error('归属游戏不存在或已删除'); error.code = 'GAME_NOT_FOUND'; throw error; }
  }
  try {
    const resolved = await repo.resolveCommunityCanonical({ regionCode, communityId: input.communityId, gameId: input.gameId });
    return { ...input, regionCode: resolved.regionCode, gameId: resolved.gameId, communityId: resolved.communityId };
  } catch (error) {
    if (error.code === 'COMMUNITY_NOT_FOUND') { error.status = 404; }
    if (error.code === 'ER_BAD_FIELD_ERROR') return { ...input, regionCode, communityId: input.communityId };
    throw error;
  }
}
async function resolveRequestScope(url, options) { return resolveCanonicalScope(scopeFromQuery(url, options)); }

async function handler(req, res) {
  res.corsHeaders = corsHeaders(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, res.corsHeaders); return res.end(); }
  if (req.url === '/health') {
    const connectorStatus = await Promise.all(Object.entries(connectors).map(async ([name, connector]) => [name, typeof connector.installationHealth === 'function' ? await connector.installationHealth() : await connector.healthCheck()]));
    let database = { configured: true, status: 'ok' }; try { await repo.health(); } catch (error) { database = { configured: true, status: 'error', message: error.message }; }
    return json(res, 200, success({ service: 'public-opinion-system-server', database, connectors: Object.fromEntries(connectorStatus), integrations: { aiConfigured: ai.configured('light'), aiDeepConfigured: ai.configured('deep'), dingTalkConfigured: dingTalk.enabled && Boolean(dingTalk.webhook) } }));
  }
  const url = new URL(req.url, `http://localhost:${port}`);
  if (req.method === 'POST' && url.pathname === '/internal/v1/credentials/resolve') {
    res.noStore = true;
    try { return json(res, 200, success(await resolveCredential(req))); }
    catch (error) { return json(res, error.code === 'UNAUTHORIZED' ? 401 : error.code === 'INVALID_INPUT' ? 400 : error.code === 'CREDENTIAL_NOT_FOUND' ? 404 : 409, errorPayload(error.code || 'CREDENTIAL_RESOLVE_FAILED', 'credential unavailable')); }
  }
  if (!url.pathname.startsWith('/api/public-opinion')) return json(res, 404, errorPayload('NOT_FOUND', 'route not found'));
  const path = url.pathname.replace('/api/public-opinion', '').split('/').filter(Boolean); const resource = path[0]; const id = path[1];
  try {
    if (req.method === 'GET' && !resource) return json(res, 200, success({
      service: 'public-opinion-system',
      message: '舆情分析 API 已启动，请访问具体资源接口',
      endpoints: ['/health', '/api/public-opinion/games', '/api/public-opinion/sources', '/api/public-opinion/overview', '/api/public-opinion/contents', '/api/public-opinion/alerts']
    }));
    if (req.method === 'POST' && resource === 'analysis' && path[1] === 'content-batch' && path.length === 2) {
      requireImportToken(req);
      if (!ai.configured('light')) return json(res, 503, errorPayload('AI_ANALYSIS_NOT_CONFIGURED', 'AI 轻量分析未配置，请先配置 AI_ANALYSIS_ENABLED、AI_ANALYSIS_URL、AI_ANALYSIS_TOKEN 和 AI_ANALYSIS_LIGHT_MODEL'));
      const body = await readBody(req);
      const allowed = new Set(['contentIds', 'profile', 'version', 'triggerReason']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      if (body.profile && body.profile !== 'light') return json(res, 400, errorPayload('INVALID_INPUT', 'profile must be light'));
      if (!Array.isArray(body.contentIds) || !body.contentIds.length) return json(res, 400, errorPayload('INVALID_INPUT', 'contentIds must be a non-empty array'));
      const maxIds = Math.min(Math.max(Number(process.env.PUBLIC_OPINION_ANALYSIS_BATCH_MAX_IDS || 200), 1), 500);
      if (body.contentIds.length > maxIds) return json(res, 413, errorPayload('ANALYSIS_BATCH_TOO_LARGE', `contentIds must contain at most ${maxIds} entries`));
      const version = body.version || ai.profiles.light.version;
      if (version !== ai.profiles.light.version) return json(res, 400, errorPayload('INVALID_INPUT', 'version does not match the configured light analysis version'));
      return json(res, 202, success(await repo.enqueueAnalysisBatch({ contentIds: body.contentIds, profile: 'light', version, triggerReason: body.triggerReason || 'q1_import' })));
    }
    if (req.method === 'POST' && resource === 'analysis' && path[1] === 'backfill' && path.length === 2) {
      if (!ai.configured('light')) return json(res, 503, errorPayload('AI_ANALYSIS_NOT_CONFIGURED', 'AI 轻量分析未配置，请先配置 AI_ANALYSIS_ENABLED、AI_ANALYSIS_URL、AI_ANALYSIS_TOKEN 和 AI_ANALYSIS_LIGHT_MODEL'));
      const body = await readBody(req);
      const allowed = new Set(['accountId', 'regionCode', 'gameId', 'communityId', 'sourceId', 'contentType', 'publishedFrom', 'publishedTo', 'limit', 'force']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
      for (const key of ['publishedFrom', 'publishedTo']) if (body[key]) { try { body[key] = parsePublishedBoundary(body[key], key); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); } }
      if (body.publishedFrom && body.publishedTo && Date.parse(body.publishedFrom) >= Date.parse(body.publishedTo)) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
      if (body.communityId) {
        if (!body.gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'gameId is required when communityId is provided'));
        const community = await repo.getCommunityForGame(body.communityId, body.gameId);
        if (!community || (body.regionCode && community.region_code !== body.regionCode)) return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在或与区域、游戏不匹配'));
      }
      const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
      const spec = ai.profiles.light;
      const enqueued = await repo.enqueueMissingAnalysis({ ...body, force: body.force === true, limit, profile: 'light', version: spec.version });
      return json(res, 202, success({ profile: 'light', analysisVersion: spec.version, enqueued, status: 'pending' }));
    }
    if (req.method === 'GET' && resource === 'games') return json(res, 200, success(await repo.listGames({ regionCode: url.searchParams.get('regionCode') || undefined, externalId: url.searchParams.get('externalId') || undefined })));
    if (req.method === 'GET' && resource === 'communities') {
      const regionCode = url.searchParams.get('regionCode') || undefined;
      const gameId = url.searchParams.get('gameId') || undefined;
      const externalId = url.searchParams.get('externalId') || undefined;
      return json(res, 200, success(await communityDirectory.list({ gameId, regionCode, externalId, includeDisabled: url.searchParams.get('includeDisabled') !== 'false' })));
    }
    if (['POST', 'PATCH'].includes(req.method) && resource === 'communities') return json(res, 410, errorPayload('COMMUNITY_MANAGED_EXTERNALLY', '社区由外部后台维护，本系统不再提供新增或编辑能力'));
    if (req.method === 'GET' && resource === 'sources' && id && path[2] === 'sync-runs' && path[3] === 'latest' && path.length === 4) {
      if ([...url.searchParams.keys()].length) return json(res, 400, errorPayload('INVALID_INPUT', 'query parameters are not supported'));
      const source = await sourceById(id);
      if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      const run = await repo.getLatestSyncRunForSource(id);
      return run ? json(res, 200, success(run)) : json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && id && path[2] === 'delete-preview' && path.length === 3) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const scope = await resolveRequestScope(url);
      const run = await repo.getSyncRun(id, scope); if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      if (!['completed','completed_full','completed_authorized_scope','partial','awaiting_manual_verification','failed','cancelled','canceled'].includes(run.status)) return json(res, 409, errorPayload('RUN_ACTIVE', 'sync run is still active'));
      const preview = await repo.getDeletePreview(id);
      return preview ? json(res, 200, success(preview)) : json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
    }
    if (req.method === 'DELETE' && resource === 'sync-runs' && id && path.length === 2) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const scope = await resolveRequestScope(url);
      const run = await repo.getSyncRun(id, scope); if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      const body = await readBody(req); if (!body || typeof body.confirmation !== 'string' || !/^[A-Za-z0-9]{6}$/.test(body.confirmation)) return json(res, 400, errorPayload('INVALID_CONFIRMATION', 'confirmation must be the final six characters of the run id'));
      return json(res, 200, success(await repo.deleteSyncRun(id, body.confirmation)));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && id && path.length === 2) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const scope = await resolveRequestScope(url);
      const run = await repo.getSyncRun(id, scope);
      return run ? json(res, 200, success(run)) : json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && !id && path.length === 1) {
      const allowed = new Set(['page','pageSize','limit','gameId','communityId','regionCode','sourceId','platform','status','mode','startedFrom','startedTo','runId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      // limit 作为 pageSize 的别名（与 /contents 等接口的兼容写法）
      const rawPage = url.searchParams.get('page') || '1'; const rawPageSize = url.searchParams.get('pageSize') || url.searchParams.get('limit') || '20'; const page = Number(rawPage); const pageSize = Number(rawPageSize);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const mode = url.searchParams.get('mode'); if (mode && !SYNC_MODES.has(mode)) return json(res, 400, errorPayload('INVALID_INPUT', 'mode must be incremental or backfill'));
      const status = url.searchParams.get('status'); const allowedStatuses = new Set(['queued','running','completed','completed_full','completed_authorized_scope','partial','awaiting_manual_verification','failed','cancelled','canceled']); if (status && !allowedStatuses.has(status)) return json(res, 400, errorPayload('INVALID_INPUT', 'status is not supported'));
      const platform = url.searchParams.get('platform'); if (platform && !SOURCE_PLATFORMS.has(normalizePlatform(platform))) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is not supported'));
      const startedFrom = url.searchParams.get('startedFrom'); const startedTo = url.searchParams.get('startedTo'); const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/; for (const [key, value] of [['startedFrom', startedFrom], ['startedTo', startedTo]]) if (value && (!dateTimePattern.test(value) || Number.isNaN(Date.parse(value)))) return json(res, 400, errorPayload('INVALID_INPUT', `${key} must be an ISO date-time`)); if (startedFrom && startedTo && Date.parse(startedFrom) >= Date.parse(startedTo)) return json(res, 400, errorPayload('INVALID_INPUT', 'startedFrom must be earlier than startedTo'));
      const runId = url.searchParams.get('runId'); if (runId && runId.length > 64) return json(res, 400, errorPayload('INVALID_INPUT', 'runId is too long'));
      const scope = await resolveRequestScope(url);
      const result = await repo.listSyncRuns({ ...Object.fromEntries(url.searchParams), ...scope, platform: platform ? normalizePlatform(platform) : undefined, syncMode: mode, page, pageSize });
      return json(res, 200, success(result.items, { page: result.page, pageSize: result.pageSize, total: result.total, hasMore: result.page * result.pageSize < result.total }));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && id && path[2] === 'contents' && path.length === 3) {
      const allowed = new Set(['scope', 'after', 'limit', 'regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const syncScope = url.searchParams.get('scope') || 'posts';
      const afterRaw = url.searchParams.get('after') || '0';
      const limitRaw = url.searchParams.get('limit') || '50';
      const after = Number(afterRaw); const limit = Number(limitRaw);
      if (!PUBLIC_SYNC_SCOPES.has(syncScope)) return json(res, 400, errorPayload('INVALID_INPUT', 'scope must be posts or comments'));
      if (!Number.isSafeInteger(after) || after < 0) return json(res, 400, errorPayload('INVALID_INPUT', 'after must be a non-negative integer'));
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'limit must be an integer from 1 to 100'));
      const scope = await resolveRequestScope(url);
      const run = await repo.getSyncRun(id, scope);
      if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      const rows = await repo.listSyncRunContents(id, { ...scope, accountId: run.account_id, sourceId: run.source_id, syncScope, after, limit });
      const nextAfter = rows.length ? Number(rows[rows.length - 1].sequence_no) : after;
      return json(res, 200, success(rows, { after, nextAfter, limit, hasMore: rows.length === limit }));
    }
    if (req.method === 'GET' && resource === 'sources') {
      const scope = await resolveRequestScope(url, { readPlatform: true });
      const sources = await repo.listSources(scope.gameId, {
        sourceId: url.searchParams.get('sourceId') || undefined,
        regionCode: scope.regionCode,
        communityId: scope.communityId,
        platform: scope.platform
      });
      return json(res, 200, success(await Promise.all(sources.map(sourceWithAccount))));
    }
    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'credentials') { const account = await repo.getAccount(id); return account ? json(res, 200, success(await repo.getAccountCredentialSummary(id))) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'sync-status') { const account = await repo.getAccount(id); const syncScope = url.searchParams.get('scope') || undefined; return account ? json(res, 200, success(syncScope && !PUBLIC_SYNC_SCOPES.has(syncScope) ? [] : await repo.getSyncStatus({ accountId: id, syncScope }))) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts' && id) { const account = await repo.getAccount(id); return account ? json(res, 200, success(account)) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts') {
      const scope = await resolveRequestScope(url);
      return json(res, 200, success(await repo.listAccounts({ ...Object.fromEntries(url.searchParams), ...scope })));
    }
    if (req.method === 'GET' && resource === 'analysis' && id === 'progress' && path.length === 2) {
      const allowed = new Set(['scope', 'regionCode', 'gameId', 'communityId', 'sourceId', 'accountId', 'contentType', 'sentiment', 'severity', 'analysisStatus', 'analysisLevel', 'keyword', 'postId', 'publishedFrom', 'publishedTo']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const scope = url.searchParams.get('scope') || 'filters';
      if (!['filters', 'q1-latest'].includes(scope)) return json(res, 400, errorPayload('INVALID_INPUT', 'scope must be filters or q1-latest'));
      let filters = Object.fromEntries(url.searchParams);
      let batchStatus = 'filters'; let businessDate = null; let contentIds;
      if (scope === 'q1-latest') {
        const batch = await latestQ1Batch();
        if (!batch) return json(res, 200, success({ scope, batchStatus: 'batch_unavailable', pending: 0, running: 0, retryable: 0, completed: 0, failed: 0, total: 0, completionRate: 0, updatedAt: null, terminal: true }));
        contentIds = [...new Set(batch.import.analysisEligibleIds.map(String).filter(Boolean))];
        filters = { sourceId: batch.sourceId, publishedFrom: batch.publishedFrom, publishedTo: batch.publishedTo };
        businessDate = batch.window || null; batchStatus = batch.status || 'available';
      }
      const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
      for (const key of ['publishedFrom', 'publishedTo']) if (filters[key]) { try { filters[key] = parsePublishedBoundary(filters[key], key); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); } }
      if (filters.publishedFrom && filters.publishedTo && filters.publishedFrom >= filters.publishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
      const profile = 'light'; const version = ai.profiles.light.version;
      const counts = await repo.countAnalysisJobs({ ...filters, contentIds, profile, version });
      return json(res, 200, success({ scope, batchStatus, businessDate, profile, version, publishedFrom: filters.publishedFrom || null, publishedTo: filters.publishedTo || null, ...counts, terminal: analysisTerminal(counts) }));
    }
    if (req.method === 'GET' && resource === 'overview') {
      try {
        const query = { ...await resolveRequestScope(url, { readPlatform: true }), ...parseOverviewQuery(url) };
        // 进程内缓存：概览聚合代价高且刷新频率低，TTL 90s；?fresh=1 旁路（手动刷新按钮用）。
        // cacheKey 用归一化后的查询参数（period 已展开成 from/to），命中加 x-cache: hit。
        const fresh = url.searchParams.get('fresh') === '1';
        // 缓存 key 用原始查询参数（period 展开后 to=当前时刻会导致每次 key 都不同，故不能用展开值）
        const rawKey = {};
        for (const key of ['regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'period', 'from', 'to']) {
          const value = url.searchParams.get(key);
          if (value != null) rawKey[key] = key === 'platform' ? parseReadPlatform(value) : value;
        }
        const cacheKey = JSON.stringify(rawKey);
        if (!fresh) {
          const cached = overviewCache.get(cacheKey);
          if (cached && cached.expiresAt > Date.now()) {
            return json(res, 200, success(cached.data), { 'x-cache': 'hit' });
          }
        }
        const data = await repo.getOverview(query);
        overviewCache.set(cacheKey, { data, expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS });
        return json(res, 200, success(data), { 'x-cache': 'no' });
      } catch (error) {
        if (error.code === 'INVALID_INPUT') return json(res, 400, errorPayload(error.code, error.message));
        throw error;
      }
    }
    if (req.method === 'POST' && resource === 'contents' && id && path[2] === 'reanalyze') {
      const scope = await resolveRequestScope(url);
      const rows = await repo.getContentTree(id, { ...scope, includeDeleted: true });
      const content = rows.find(item => item.id === id);
      if (!content) return json(res, 404, errorPayload('NOT_FOUND', 'content not found'));
      if (content.is_deleted) return json(res, 409, errorPayload('CONTENT_DELETED', 'deleted content cannot be analyzed'));
      if (!ai.configured('light')) return json(res, 503, errorPayload('AI_ANALYSIS_NOT_CONFIGURED', 'AI 轻量分析未配置，请先配置 AI_ANALYSIS_ENABLED、AI_ANALYSIS_URL、AI_ANALYSIS_TOKEN 和 AI_ANALYSIS_LIGHT_MODEL'));
      const profile = 'light';
      const version = ai.profiles.light.version;
      const job = await repo.enqueueAnalysisJob(id, {
        profile,
        version,
        contentFingerprint: content.fingerprint,
        triggerReason: 'manual_reanalysis',
        force: true
      });
      return json(res, 202, success({
        contentId: id,
        jobId: job.id,
        analysisStatus: job.status,
        analysisLevel: profile,
        analysisVersion: version
      }));
    }
    if (req.method === 'GET' && resource === 'contents' && id === 'stats' && path.length === 2) {
      const scope = await resolveRequestScope(url);
      const filters = { ...Object.fromEntries(url.searchParams), ...scope };
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'accountId', 'contentType', 'sentiment', 'analysisStatus', 'analysisLevel', 'keyword', 'postId', 'publishedFrom', 'publishedTo']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
      for (const key of ['publishedFrom', 'publishedTo']) if (filters[key]) { try { filters[key] = parsePublishedBoundary(filters[key], key); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); } }
      if (filters.publishedFrom && filters.publishedTo && filters.publishedFrom >= filters.publishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
      return json(res, 200, success(await repo.getContentStats(filters)));
    }
    if (req.method === 'GET' && resource === 'contents' && id && path.length === 2) {
      const scope = await resolveRequestScope(url);
      const rows = await repo.getContentTree(id, { ...scope, includeDeleted: true });
      const content = rows.find(item => item.id === id);
      if (!content) return json(res, 404, errorPayload('NOT_FOUND', 'content not found'));
      const [analysisView] = await repo.listContents({ ...scope, keyword: null, page: 1, pageSize: 1, contentId: id });
      const withTranslation = item => {
        const overseas = item?.region_code === 'overseas';
        return {
          ...item,
          translation: {
            targetLanguage: overseas ? (item.translation_target_language || 'zh-CN') : 'zh-CN',
            status: overseas ? (item.translation_status || 'not_requested') : 'not_requested',
            title: overseas ? (item.translated_title || null) : null,
            body: overseas ? (item.translated_body || null) : null,
            sourceLanguage: overseas ? (item.translation_source_language || null) : null,
            version: overseas ? (item.translation_version || process.env.AI_TRANSLATION_VERSION || 'translation-v1') : null,
            translatedAt: overseas ? (item.translated_at || null) : null,
            errorCode: overseas ? (item.translation_error_code || null) : null
          }
        };
      };
      const detailContent = analysisView ? { ...content, ...analysisView } : content;
      const translationFields = {
        region_code: content.region_code,
        translation_target_language: content.translation_target_language,
        translation_status: content.translation_status,
        translated_title: content.translated_title,
        translated_body: content.translated_body,
        translation_source_language: content.translation_source_language,
        translation_version: content.translation_version,
        translated_at: content.translated_at,
        translation_error_code: content.translation_error_code
      };
      return json(res, 200, success({ content: withTranslation({ ...detailContent, ...translationFields }), comments: rows.filter(item => item.id !== id).map(withTranslation) }));
    }
    if (req.method === 'GET' && resource === 'contents') {
      const scope = await resolveRequestScope(url);
      const filters = { ...Object.fromEntries(url.searchParams), ...scope };
      // limit 作为 pageSize 的别名（前端 assets/content.js 等兼容写法），未显式传 pageSize 时生效
      if (filters.limit != null && filters.pageSize == null) { filters.pageSize = filters.limit; }
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
      for (const key of ['publishedFrom', 'publishedTo']) if (filters[key]) { try { filters[key] = parsePublishedBoundary(filters[key], key); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); } }
      if (filters.publishedFrom && filters.publishedTo && filters.publishedFrom >= filters.publishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
      if (filters.postId != null) { filters.postId = String(filters.postId).trim(); if (!filters.postId) delete filters.postId; else if (filters.postId.length > 255) return json(res, 400, errorPayload('INVALID_INPUT', 'postId 长度不能超过 255')); }
      const usesTreeFilters = filters.accountId || filters.contentType || filters.includeDeleted != null;
      const [items, total] = await Promise.all([
        usesTreeFilters ? repo.listContentTree({ ...filters, includeDeleted: filters.includeDeleted === 'true' }) : repo.listContents(filters),
        repo.countContents({ ...filters, includeDeleted: filters.includeDeleted === 'true' })
      ]);
      return json(res, 200, success(items, { page: Number(filters.page || 1), pageSize: Number(filters.pageSize || 20), total, hasMore: Number(filters.page || 1) * Number(filters.pageSize || 20) < total }));
    }
    if (req.method === 'GET' && resource === 'quality-contents' && id) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId', 'platform']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const item = await repo.getQualityContent(id, await resolveRequestScope(url));
      return item ? json(res, 200, success(normalizeQualityCandidate(item))) : json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
    }
    if (req.method === 'GET' && resource === 'quality-contents') {
      const allowed = new Set(['page', 'pageSize', 'regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'recommendationType', 'reviewStatus', 'publishedFrom', 'publishedTo']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const page = Number(url.searchParams.get('page') || 1); const pageSize = Number(url.searchParams.get('pageSize') || 20);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const recommendationType = url.searchParams.get('recommendationType') || undefined; const reviewStatus = url.searchParams.get('reviewStatus') || undefined;
      if (recommendationType && !new Set(['home', 'pin', 'feature']).has(recommendationType)) return json(res, 400, errorPayload('INVALID_INPUT', 'recommendationType is not supported'));
      if (reviewStatus && !new Set(['pending', 'accepted', 'rejected']).has(reviewStatus)) return json(res, 400, errorPayload('INVALID_INPUT', 'reviewStatus is not supported'));
      const scope = await resolveRequestScope(url);
      const filters = { ...Object.fromEntries(url.searchParams), page, pageSize, recommendationType, reviewStatus, ...scope };
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const [items, total] = await Promise.all([repo.listQualityContents(filters), repo.countQualityContents(filters)]);
      return json(res, 200, success(items.map(normalizeQualityCandidate), { page, pageSize, total, hasMore: page * pageSize < total }));
    }
    if (req.method === 'PATCH' && resource === 'quality-contents' && id) {
      const body = await readBody(req); const allowed = new Set(['homeReviewStatus', 'homeAdopted', 'pinReviewStatus', 'pinAdopted', 'featureReviewStatus', 'featureAdopted', 'reviewNote']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      if (!Object.keys(body || {}).length) return json(res, 400, errorPayload('INVALID_INPUT', 'quality candidate patch is empty'));
      for (const key of ['homeReviewStatus', 'pinReviewStatus', 'featureReviewStatus']) if (body[key] != null && !new Set(['pending', 'accepted', 'rejected']).has(body[key])) return json(res, 400, errorPayload('INVALID_INPUT', `${key} is not supported`));
      for (const key of ['homeAdopted', 'pinAdopted', 'featureAdopted']) if (body[key] != null && typeof body[key] !== 'boolean') return json(res, 400, errorPayload('INVALID_INPUT', `${key} must be boolean`));
      if (body.reviewNote != null && String(body.reviewNote).length > 1000) return json(res, 400, errorPayload('INVALID_INPUT', 'reviewNote is too long'));
      const current = await repo.getQualityContent(id, await resolveRequestScope(url)); if (!current) return json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
      const normalizedPatch = { ...body };
      for (const prefix of ['home', 'pin', 'feature']) {
        const statusKey = `${prefix}ReviewStatus`; const adoptedKey = `${prefix}Adopted`;
        if (normalizedPatch[statusKey] != null && normalizedPatch[adoptedKey] == null) normalizedPatch[adoptedKey] = normalizedPatch[statusKey] === 'accepted';
        if (normalizedPatch[adoptedKey] != null && normalizedPatch[statusKey] == null) normalizedPatch[statusKey] = normalizedPatch[adoptedKey] ? 'accepted' : 'pending';
        const status = normalizedPatch[statusKey]; const adopted = normalizedPatch[adoptedKey];
        if (status != null && adopted != null && ((status === 'accepted') !== adopted)) return json(res, 400, errorPayload('INVALID_INPUT', `${prefix} review status and adopted value conflict`));
      }
      const updated = await repo.updateQualityCandidate(id, normalizedPatch, req.headers['x-admin-user'] || 'admin', await resolveRequestScope(url));
      return updated ? json(res, 200, success(normalizeQualityCandidate(updated))) : json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
    }

    if (req.method === 'GET' && resource === 'alerts' && !id) {
      const allowed = new Set(['page', 'pageSize', 'regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'status', 'severity']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const page = Number(url.searchParams.get('page') || 1); const pageSize = Number(url.searchParams.get('pageSize') || 20);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const status = url.searchParams.get('status'); const severity = url.searchParams.get('severity');
      if (status && !new Set(['pending', 'processing', 'resolved', 'false_positive']).has(status)) return json(res, 400, errorPayload('INVALID_INPUT', 'status is not supported'));
      if (severity && !new Set(['urgent', 'attention', 'normal']).has(severity)) return json(res, 400, errorPayload('INVALID_INPUT', 'severity is not supported'));
      const scope = await resolveRequestScope(url);
      const filters = { ...Object.fromEntries(url.searchParams), page, pageSize, ...scope };
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const items = await repo.listAlerts(filters);
      return json(res, 200, success(items.map(normalizeAlertWithIndependentReviews), { page, pageSize, hasMore: items.length === pageSize }));
    }
    if (req.method === 'GET' && resource === 'alerts' && id) { const alert = await repo.getAlert(id, await resolveRequestScope(url)); return alert ? json(res, 200, success(normalizeAlertWithIndependentReviews(alert))) : json(res, 404, errorPayload('NOT_FOUND', 'alert not found')); }
    if (req.method === 'PATCH' && resource === 'alerts' && id) { let body = ''; for await (const chunk of req) body += chunk; const patch = body ? JSON.parse(body) : {}; const alert = await repo.updateAlert(id, patch, await resolveRequestScope(url)); return alert ? json(res, 200, success(normalizeAlertWithIndependentReviews(alert))) : json(res, 404, errorPayload('NOT_FOUND', 'alert not found')); }

    // ── A4 写接口：采集源配置 / 凭据 / 授权检测 / 手动采集 / 关键词规则 ──

    // 新增 BigPlayer 采集源：白名单校验 baseUrl 后落库；默认启用，但不创建立即同步任务。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'import' && path.length === 3) {
      requireImportToken(req);
      let body;
      try { body = await readBody(req); } catch (error) {
        if (error.code === 'REQUEST_TOO_LARGE') return json(res, 413, errorPayload(error.code, error.message));
        if (error instanceof SyntaxError) return json(res, 400, errorPayload('INVALID_JSON', 'request body must be valid JSON'));
        throw error;
      }
      const allowed = new Set(['accountId', 'window', 'feeds', 'items']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      if (!Array.isArray(body.items)) return json(res, 400, errorPayload('INVALID_INPUT', 'items must be an array'));
      const maxItems = Math.max(1, Number(process.env.PUBLIC_OPINION_IMPORT_MAX_ITEMS || 500));
      if (body.items.length > maxItems) return json(res, 413, errorPayload('IMPORT_BATCH_TOO_LARGE', `items must contain at most ${maxItems} entries`));
      if (body.feeds != null && !Array.isArray(body.feeds)) return json(res, 400, errorPayload('INVALID_INPUT', 'feeds must be an array'));
      try {
        const result = await repo.importContentBatch({ sourceId: id, accountId: body.accountId, items: body.items, feeds: body.feeds || [] });
        return json(res, 201, success(result));
      } catch (error) {
        if (['NOT_FOUND', 'SOURCE_DISABLED', 'ACCOUNT_SCOPE_MISMATCH', 'INVALID_INPUT'].includes(error.code)) return json(res, error.code === 'NOT_FOUND' ? 404 : error.code === 'SOURCE_DISABLED' ? 409 : 400, errorPayload(error.code, error.message));
        throw error;
      }
    }

    if (req.method === 'POST' && resource === 'sources' && !id) {
      const body = await readBody(req);
      if (!body.communityId) return json(res, 400, errorPayload('INVALID_INPUT', 'communityId is required'));
      if (!body.platform) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is required'));
      if (!String(body.displayName || '').trim()) return json(res, 400, errorPayload('INVALID_INPUT', 'displayName is required'));
      let scope;
      try { scope = await resolveCanonicalScope({ regionCode: body.regionCode, communityId: body.communityId, gameId: body.gameId }); }
      catch (error) { return json(res, 400, errorPayload(error.code, error.message)); }
      const game = await repo.getGame(scope.gameId);
      if (!game) return json(res, 400, errorPayload('GAME_NOT_FOUND', '归属游戏不存在或已删除'));
      const platform = normalizePlatform(body.platform);
      if (!SOURCE_PLATFORMS.has(platform)) return json(res, 400, errorPayload('INVALID_PLATFORM', 'platform is not supported'));
      rejectBigPlayerLegacyBackfill(platform, { syncMode: body.syncMode, historyStart: body.historyStart }, body.metadata);
      if (platform === 'facebook') {
        const sensitiveError = facebookSensitivePayloadError(body);
        if (sensitiveError) return json(res, 400, errorPayload(sensitiveError.code, sensitiveError.message, sensitiveError.details));
        if (body.platformAccountId != null) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page ID 仅由官方能力检测识别'));
      }
      if (platform === 'facebook' && (scope.regionCode !== 'overseas' || scope.gameId !== OVERSEAS_LAST_NIGHT_GAME_ID || scope.communityId !== OVERSEAS_LAST_NIGHT_COMMUNITY_ID)) return json(res, 400, errorPayload('FACEBOOK_SCOPE_MISMATCH', 'Facebook 采集源仅支持境外 Last Night 社区'));
      let requestedBaseUrl = String(body.apiUrl ?? body.baseUrl ?? '').trim();
      const westernRequested = String(body.editionScope || '').trim().toLowerCase() === WESTERN_EDITION_SCOPE;
      const westernCandidateInput = { ...body, platform, regionCode: scope.regionCode, baseUrl: requestedBaseUrl, editionScope: body.editionScope };
      const westernSource = westernRequested && isWesternOverseasSource(westernCandidateInput, { allowedHosts: westernAllowedHosts() });
      if (westernRequested && !westernSource) return json(res, 400, errorPayload('WESTERN_SCOPE_MISMATCH', '欧美版源必须使用 bigplayer_h5、overseas、western、HTTPS 和允许域名'));
      let communityValidated = false;
      try { await communityDirectory.requireEnabled({ communityId: scope.communityId, gameId: scope.gameId, regionCode: scope.regionCode }); communityValidated = true; }
      catch (error) {
        const providerUnavailable = ['COMMUNITY_PROVIDER_NOT_CONFIGURED', 'COMMUNITY_PROVIDER_UNAVAILABLE', 'COMMUNITY_PROVIDER_TIMEOUT', 'COMMUNITY_PROVIDER_ERROR'].includes(error.code);
        if (!westernSource || !providerUnavailable) throw error;
        const mirror = await repo.getCommunityForGame(scope.communityId, scope.gameId, { enabledOnly: true });
        if (!mirror || mirror.status !== 'enabled' || mirror.region_code !== 'overseas' || (scope.regionCode && scope.regionCode !== 'overseas')) return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在、与区域或游戏不匹配，或已停用'));
        communityValidated = true;
      }
      if (westernSource) {
        const urlError = validateWesternSourceUrl(requestedBaseUrl, { allowedHosts: westernAllowedHosts() });
        if (urlError) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', urlError));
      }
      if (platform === 'facebook') {
        const urlError = validateFacebookPageUrl(requestedBaseUrl);
        if (urlError) return json(res, 400, errorPayload('FACEBOOK_URL_INVALID', urlError));
        requestedBaseUrl = normalizeFacebookPageUrl(requestedBaseUrl);
      }

      const frequencySeconds = Number(body.frequencySeconds ?? (platform === 'taptap' ? 21600 : 3600));
      const frequencyError = validateFrequencySeconds(platform, frequencySeconds);
      if (frequencyError) return json(res, 400, errorPayload('INVALID_INPUT', frequencyError));
      const scheduleTimeError = validateScheduleTime(platform, body.scheduleTime, frequencySeconds);
      if (scheduleTimeError) return json(res, 400, errorPayload('INVALID_INPUT', scheduleTimeError));
      const syncMode = body.syncMode || 'incremental';
      if (!SYNC_MODES.has(syncMode)) return json(res, 400, errorPayload('INVALID_INPUT', 'syncMode must be incremental or backfill'));
      if (syncMode === 'backfill' && !body.historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '历史回溯必须填写 historyStart'));
      if (platform === 'bigplayer_h5') {
        const directMode = body.postsApiUrl != null || body.commentsApiUrl != null;
        if (directMode) {
          for (const [field, required] of [['postsApiUrl', true], ['commentsApiUrl', true]]) {
            const invalid = validateEndpoint(body[field], { required });
            if (invalid) return json(res, 400, errorPayload('INVALID_INPUT', `${field}: ${invalid}`));
            if (body[field] && !connectors.bigplayer_h5.hostAllowed(body[field])) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', `${field} 的域名不在允许名单内`));
          }
        } else {
          const invalid = validateBaseUrl(platform, body.apiUrl ?? body.baseUrl);
          if (invalid) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', invalid));
        }
        if (!body.apiToken && !body.password && !westernSource) return json(res, 400, errorPayload('INVALID_INPUT', 'apiToken or account password is required'));
        if (!body.apiToken && !westernSource) {
          const invalid = validateAccountPassword(body);
          if (invalid) return json(res, 400, errorPayload('INVALID_CREDENTIALS', invalid));
        }
      }
      if (isSocialPlatform(platform)) {
        const invalid = validateSocialCredential(body);
        if (invalid) return json(res, 400, errorPayload('INVALID_INPUT', invalid));
      }
      // TapTap 免登采集：监控账号/社区组 ID 列表存 po_sources.config.accountIds / groupIds。
      let taptapAccountIds = null;
      let taptapGroupIds = null;
      let discordConfig = null;
      if (platform === 'discord') {
        const invalid = validateDiscordSourceConfig(body);
        if (invalid) return json(res, 400, errorPayload('INVALID_INPUT', invalid));
        if (!body.apiToken || !String(body.apiToken).trim()) return json(res, 400, errorPayload('INVALID_CREDENTIALS', 'Discord Bot Token is required'));
        discordConfig = discordSourceConfig(body, { historyStart: body.historyStart || null, syncMode });
      }
      if (platform === 'taptap') {
        const urlError = validateBaseUrl(platform, requestedBaseUrl);
        if (urlError) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', urlError));
        const invalidAcc = validateTaptapAccountIds(body.accountIds);
        if (invalidAcc) return json(res, 400, errorPayload('INVALID_INPUT', invalidAcc));
        const invalidGrp = validateTaptapGroupIds(body.groupIds);
        if (invalidGrp) return json(res, 400, errorPayload('INVALID_INPUT', invalidGrp));
        taptapAccountIds = normalizeTaptapAccountIds(body.accountIds);
        taptapGroupIds = normalizeTaptapGroupIds(body.groupIds);
        if (!taptapAccountIds.length && !taptapGroupIds.length) return json(res, 400, errorPayload('INVALID_INPUT', 'TapTap 采集源必须配置至少一个监控账号 ID 或社区组 ID'));
      }
      const displayName = String(body.displayName).trim();
      const existing = await repo.findSourceByIdentity({ gameId: scope.gameId, platform, displayName, communityId: scope.communityId });
      let sourceId = crypto.randomUUID(); let accountId = crypto.randomUUID(); let legacyAccount = null;
      if (existing) {
        const accounts = await repo.listAccounts({ sourceId: existing.id });
        legacyAccount = accounts.find(account => String(account.platform_account_id || '').startsWith('legacy-source:')) || null;
        const config = parseConfig(existing.config);
        const adoptable = platform === 'bigplayer_h5' && legacyAccount && !String(config.baseUrl || '').trim() && existing.auth_status !== 'authorized' && !config.deleted;
        if (!adoptable) return json(res, 409, errorPayload('SOURCE_ALREADY_EXISTS', '同一游戏、平台和名称的采集源已存在', { sourceId: existing.id }));
        sourceId = existing.id; accountId = legacyAccount.id;
      }
      const credentialType = platform === 'facebook'
        ? null
        : isSocialPlatform(platform) || (platform === 'bigplayer_h5' && !body.apiToken && !westernSource)
          ? 'account_password'
          : body.apiToken ? 'api_token' : null;
      const h5Account = String(body.account || '').trim();
      const plaintext = isSocialPlatform(platform)
        ? JSON.stringify(socialSecret(body))
        : credentialType === 'account_password'
          ? JSON.stringify({ countryCode: null, account: h5Account, password: String(body.password) })
          : body.apiToken ? String(body.apiToken) : null;
      let secretCipher = null;
      try {
        secretCipher = plaintext ? credentialCipher.encrypt(plaintext, process.env, { aad: credentialAad({ accountId, credentialType, platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' }) : null;
      } catch (error) {
        if (['CREDENTIAL_ENC_KEY_MISSING', 'CREDENTIAL_ENC_KEY_INVALID'].includes(error.code)) return json(res, 503, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝保存'));
        throw error;
      }
      const input = {
        sourceId, accountId, gameId: scope.gameId, communityId: scope.communityId, platform, sourceType: body.sourceType || (platform === 'bigplayer_h5' ? 'owned_community' : 'official_account'),
        displayName, baseUrl: requestedBaseUrl, startPaths: normalizeStartPaths(body.startPaths), editionScope: westernSource ? WESTERN_EDITION_SCOPE : undefined, board: body.board,
        postsApiUrl: body.postsApiUrl ? String(body.postsApiUrl).trim() : '', commentsApiUrl: body.commentsApiUrl ? String(body.commentsApiUrl).trim() : '',
        accountIds: taptapAccountIds,
        groupIds: taptapGroupIds,
        discordConfig,
        scheduleTime: normalizeScheduleTime(body.scheduleTime),
        frequencySeconds, activeWindow: body.activeWindow,
        platformAccountId: body.platformAccountId ? String(body.platformAccountId).trim() : undefined,
        accountName: body.accountName || displayName, accountType: body.accountType || 'official', sourceEnabled: platform === 'bigplayer_h5' ? body.enabled !== false : false, accountEnabled: platform !== 'facebook',
        authStatus: platform === 'facebook' ? 'unauthorized' : westernSource ? (body.apiToken ? 'configured_unverified' : 'unconfigured') : credentialType === 'account_password' ? 'pending_verification' : 'unconfigured', maskedLoginIdentifier: isSocialPlatform(platform) ? maskPhone(body.phone) : credentialType === 'account_password' ? maskLoginIdentifier(h5Account) : null,
        metadata: { syncMode, historyStart: body.historyStart || null }, credentialType, secretCipher
      };
      let created;
      try { created = legacyAccount ? await repo.adoptLegacySourceWithAccount(input) : await repo.createSourceWithAccount(input); }
      catch (error) {
        if (['CREDENTIAL_ENC_KEY_MISSING', 'CREDENTIAL_ENC_KEY_INVALID'].includes(error.code)) return json(res, 503, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝保存'));
        if (error.code === 'ER_DUP_ENTRY' || error.code === 'SOURCE_ALREADY_EXISTS') return json(res, 409, errorPayload('SOURCE_ALREADY_EXISTS', '同一游戏、平台和名称的采集源已存在'));
        throw error;
      }
      if (credentialType === 'account_password' && loginSessionClient.configured()) {
        try { await loginSessionClient.bindAccount({ sourceId, accountId, platform, credentialRef: `credential:${accountId}:${credentialType}`, maskedPhone: isSocialPlatform(platform) ? maskPhone(body.phone) : maskLoginIdentifier(h5Account) }); }
        catch (error) { console.warn(error.code || 'LOGIN_SESSION_BIND_FAILED', 'credential saved; login binding will be restored on the next login request'); }
      }
      return json(res, legacyAccount ? 200 : 201, success(await sourceWithAccount(created.source), legacyAccount ? { adopted: true } : {}));
    }

    // 软删除采集源：config 打 deleted 标记，历史数据保留；列表与调度自动忽略。
    if (req.method === 'DELETE' && resource === 'sources' && id) {
      const currentSource = await sourceById(id);
      if (!currentSource) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      assertWesternSourceRecord(currentSource);
      const ok = await repo.softDeleteSource(id);
      return ok ? json(res, 200, success({ deleted: true, id })) : json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
    }

    // H5 专用配置单请求：源、账号元数据和可选凭据在同一事务内提交。
    // TapTap 免登源复用该端点更新基础字段与监控账号 ID（accountIds），不接受凭据。
    if (req.method === 'PATCH' && resource === 'sources' && id && path[2] === 'configuration' && path.length === 3) {
      const body = await readBody(req);
      const allowed = new Set(['displayName', 'baseUrl', 'frequencySeconds', 'syncMode', 'historyStart', 'enabled', 'credential', 'accountIds', 'groupIds', 'scheduleTime', 'guildId', 'channelIds', 'channelScope', 'includeThreads', 'includeReplies', 'historySyncEnabled', 'anonymizeAuthors', 'retentionDays']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      const currentSource = await sourceById(id);
      if (!currentSource) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      rejectBigPlayerLegacyBackfill(currentSource.platform, { syncMode: body.syncMode, historyStart: body.historyStart });
      assertWesternSourceRecord(currentSource);
      if (isFacebookSource(currentSource) && (body.platformAccountId != null || body.accountName != null)) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page 身份仅由官方能力检测更新'));
      if (isFacebookSource(currentSource)) {
        const sensitiveError = facebookSensitivePayloadError(body);
        if (sensitiveError) return json(res, 400, errorPayload(sensitiveError.code, sensitiveError.message, sensitiveError.details));
      }
      if (currentSource.platform !== 'bigplayer_h5' && currentSource.platform !== 'taptap' && currentSource.platform !== 'discord' && currentSource.platform !== 'facebook') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'source configuration endpoint is not supported for this platform'));
      if (currentSource.platform === 'discord') {
        const invalid = validateDiscordSourceConfig(body, { partial: true });
        if (invalid) return json(res, 400, errorPayload('INVALID_INPUT', invalid));
        if (body.credential != null && body.credential && typeof body.credential === 'object' && body.credential.credentialType && body.credential.credentialType !== 'api_token') return json(res, 400, errorPayload('INVALID_CREDENTIALS', 'Discord 仅支持 api_token 凭据'));
      }
      for (const [key, message] of [['displayName', 'displayName is required']]) if (!String(body[key] ?? '').trim()) return json(res, 400, errorPayload('INVALID_INPUT', message));
      const westernSource = isWesternSourceRecord(currentSource);
      if (westernSource) {
        if (body.enabled) {
          const configured = (await sourceWithAccount(currentSource)).account?.credential_configured;
          if (!configured) return json(res, 401, errorPayload('SOURCE_AUTH_UNCONFIGURED', '请先在编辑页配置 Token'));
        }
        if (body.credential != null) {
          if (!body.credential || typeof body.credential !== 'object') return json(res, 400, errorPayload('INVALID_INPUT', 'credential must be an object'));
          const type = body.credential.credentialType || 'api_token';
          if (type !== 'api_token') return json(res, 400, errorPayload('INVALID_CREDENTIALS', '欧美版源仅支持 api_token 凭据'));
        }
      }
      if (currentSource.platform === 'discord' && body.enabled) {
        const configured = (await sourceWithAccount(currentSource)).account?.credential_configured;
        if (!configured) return json(res, 401, errorPayload('SOURCE_AUTH_UNCONFIGURED', '请先配置 Discord Bot Token'));
      }
      if (currentSource.platform === 'discord' && body.credential != null && (!body.credential || typeof body.credential !== 'object')) return json(res, 400, errorPayload('INVALID_INPUT', 'credential must be an object'));
      if (currentSource.platform === 'facebook' && body.credential != null) {
        if (!body.credential || typeof body.credential !== 'object') return json(res, 400, errorPayload('INVALID_INPUT', 'credential must be an object'));
        const type = body.credential.credentialType || 'api_token';
        if (type !== 'api_token') return json(res, 400, errorPayload('INVALID_CREDENTIALS', 'Facebook 仅支持 api_token 凭据'));
      }

      const frequencySeconds = currentSource.platform === 'taptap' && body.frequencySeconds == null
        ? Number(currentSource.frequency_seconds)
        : Number(body.frequencySeconds);
      const frequencyError = validateFrequencySeconds(currentSource.platform, frequencySeconds);
      if (frequencyError) return json(res, 400, errorPayload('INVALID_INPUT', frequencyError));
      const scheduleTimeError = validateScheduleTime(currentSource.platform, body.scheduleTime, frequencySeconds);
      if (scheduleTimeError) return json(res, 400, errorPayload('INVALID_INPUT', scheduleTimeError));
      if (body.syncMode !== undefined && !SYNC_MODES.has(body.syncMode)) return json(res, 400, errorPayload('INVALID_INPUT', 'syncMode must be incremental or backfill'));
      if (body.syncMode === 'backfill' && !body.historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '历史回溯必须填写 historyStart'));
      if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return json(res, 400, errorPayload('INVALID_INPUT', 'enabled must be boolean'));
      let taptapAccountIds;
      let taptapGroupIds;
      if (currentSource.platform === 'taptap') {
        if (body.credential != null) return json(res, 400, errorPayload('INVALID_INPUT', 'TapTap 免登采集源不支持配置凭据'));
        const invalidAcc = validateTaptapAccountIds(body.accountIds);
        if (invalidAcc) return json(res, 400, errorPayload('INVALID_INPUT', invalidAcc));
        const invalidGrp = validateTaptapGroupIds(body.groupIds);
        if (invalidGrp) return json(res, 400, errorPayload('INVALID_INPUT', invalidGrp));
        taptapAccountIds = normalizeTaptapAccountIds(body.accountIds);
        taptapGroupIds = normalizeTaptapGroupIds(body.groupIds);
        if (body.accountIds !== undefined && body.groupIds !== undefined && !taptapAccountIds.length && !taptapGroupIds.length) return json(res, 400, errorPayload('INVALID_INPUT', 'TapTap 采集源必须配置至少一个监控账号 ID 或社区组 ID'));
      }
      if (body.enabled === true && !currentSource.enabled) {
        await communityDirectory.requireEnabled({ communityId: currentSource.community_id, gameId: currentSource.game_id, regionCode: currentSource.region_code });
        await requireAuthorizedAccount(currentSource);
        await requireFacebookCapabilitiesReady(currentSource);
      }
      const requestedConfigurationUrl = body.baseUrl ?? parseConfig(currentSource.config).baseUrl;
      const invalidUrl = currentSource.platform === 'bigplayer_h5'
        ? (westernSource ? validateWesternSourceUrl(requestedConfigurationUrl, { allowedHosts: westernAllowedHosts() }) : validateBaseUrl('bigplayer_h5', body.baseUrl))
        : currentSource.platform === 'facebook' ? validateFacebookPageUrl(requestedConfigurationUrl) : currentSource.platform === 'taptap' ? validateBaseUrl('taptap', requestedConfigurationUrl) : null;
      if (invalidUrl) return json(res, 400, errorPayload(currentSource.platform === 'facebook' ? 'FACEBOOK_URL_INVALID' : 'URL_OUTSIDE_ALLOWED_HOSTS', invalidUrl));
      let encryptedCredential = null; let credential = null;
      if (body.credential != null && (typeof body.credential !== 'object' || Object.keys(body.credential).length > 0)) {
        if (!body.credential || typeof body.credential !== 'object') return json(res, 400, errorPayload('INVALID_INPUT', 'credential must be an object'));
        const type = body.credential.credentialType || (body.credential.account != null || body.credential.password != null ? 'account_password' : 'api_token');
        let plaintext;
        if (type === 'api_token') {
          if (body.credential.secret == null || !String(body.credential.secret).trim() || /^[*•]+$/.test(String(body.credential.secret).trim())) return json(res, 400, errorPayload('INVALID_INPUT', 'credential.secret must be a non-masked value'));
          if (String(body.credential.secret).length > 8192) return json(res, 400, errorPayload('INVALID_INPUT', 'credential.secret is too long'));
          plaintext = String(body.credential.secret);
        }
        else if (type === 'account_password') { const invalid = validateAccountPassword(body.credential); if (invalid) return json(res, 400, errorPayload('INVALID_CREDENTIALS', invalid)); plaintext = JSON.stringify({ countryCode: null, account: String(body.credential.account).trim(), password: String(body.credential.password) }); }
        else return json(res, 400, errorPayload('INVALID_INPUT', 'credentialType is not supported'));
        const account = await defaultAccountForSource(currentSource);
        if (!account) return json(res, 400, errorPayload('ACCOUNT_NOT_FOUND', '默认账号未配置'));
        credential = { credentialType: type };
        try { encryptedCredential = credentialCipher.encrypt(plaintext, process.env, { aad: credentialAad({ accountId: account.id, credentialType: type, platform: currentSource.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' }); }
        catch (error) { if (['CREDENTIAL_ENC_KEY_MISSING', 'CREDENTIAL_ENC_KEY_INVALID'].includes(error.code)) return json(res, 500, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝写入')); throw error; }
      }
      const discordConfigPatch = currentSource.platform === 'discord' ? discordSourceConfig(body, {}) : undefined;
      const updatedBaseUrl = body.baseUrl == null ? undefined : currentSource.platform === 'facebook' ? normalizeFacebookPageUrl(body.baseUrl) : String(body.baseUrl).trim();
      const updated = await repo.updateSourceConfiguration(id, { displayName: String(body.displayName).trim(), baseUrl: updatedBaseUrl, frequencySeconds, syncMode: body.syncMode, historyStart: body.historyStart, enabled: body.enabled, credential, credentialCipher: encryptedCredential, accountIds: taptapAccountIds, groupIds: taptapGroupIds, discordConfig: discordConfigPatch, scheduleTime: currentSource.platform === 'taptap' ? normalizeScheduleTime(body.scheduleTime) : undefined });
      return json(res, 200, success(await sourceWithAccount(updated.source)));
    }

    if (req.method === 'PATCH' && resource === 'sources' && id) {
      const body = await readBody(req);
      const allowed = new Set(['enabled', 'frequencySeconds', 'activeWindow', 'displayName', 'baseUrl', 'apiUrl', 'startPaths', 'postsApiUrl', 'commentsApiUrl', 'repliesApiUrl', 'replies_api_url', 'replyApiUrl', 'reply_api_url', 'platformAccountId', 'accountName', 'syncMode', 'historyStart', 'scheduleTime']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      const currentSource = await sourceById(id);
      if (!currentSource) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      rejectBigPlayerLegacyBackfill(currentSource.platform, { syncMode: body.syncMode, historyStart: body.historyStart });
      assertWesternSourceRecord(currentSource);
      const westernSource = isWesternSourceRecord(currentSource);
      if (westernSource && body.enabled) {
        const configured = (await sourceWithAccount(currentSource)).account?.credential_configured;
        if (!configured) return json(res, 401, errorPayload('SOURCE_AUTH_UNCONFIGURED', '请先在编辑页配置 Token'));
      }
      if (westernSource && (body.repliesApiUrl !== undefined || body.replies_api_url !== undefined || body.replyApiUrl !== undefined || body.reply_api_url !== undefined)) return json(res, 400, errorPayload('INVALID_INPUT', '欧美版源不支持回复接口配置'));
      if (body.platform !== undefined || body.gameId !== undefined || body.communityId !== undefined) return json(res, 400, errorPayload('INVALID_INPUT', 'source platform, game, and community are immutable'));
      const patch = {};
      if (body.enabled != null) { if (body.enabled && !currentSource.enabled) { await requireEnabledCommunityForSource(currentSource); await requireAuthorizedAccount(currentSource); await requireFacebookCapabilitiesReady(currentSource); } patch.enabled = Boolean(body.enabled); }
      if (body.frequencySeconds != null) { const value = Number(body.frequencySeconds); const frequencyError = validateFrequencySeconds(currentSource.platform, value); if (frequencyError) return json(res, 400, errorPayload('INVALID_INPUT', frequencyError)); patch.frequencySeconds = value; }
      // scheduleTime（HH:mm 北京时间）：复用 PUT /configuration 的校验，非法值 400，避免静默丢弃；合法值写入 po_sources.config.scheduleTime（显式 null/空串清除）。
      if (body.scheduleTime !== undefined) {
        const effectiveFrequency = patch.frequencySeconds != null ? patch.frequencySeconds : Number(currentSource.frequency_seconds);
        const scheduleTimeError = validateScheduleTime(currentSource.platform, body.scheduleTime, effectiveFrequency);
        if (scheduleTimeError) return json(res, 400, errorPayload('INVALID_INPUT', scheduleTimeError));
        const nextConfig = { ...parseConfig(currentSource.config), ...(patch.config || {}) };
        const normalizedScheduleTime = normalizeScheduleTime(body.scheduleTime);
        if (normalizedScheduleTime) nextConfig.scheduleTime = normalizedScheduleTime; else delete nextConfig.scheduleTime;
        patch.config = nextConfig;
      }
      if (body.activeWindow != null) patch.activeWindow = body.activeWindow;
      if (body.displayName != null) patch.displayName = body.displayName;
      if (body.baseUrl != null || body.apiUrl != null) {
        const source = currentSource;
        const nextUrl = body.apiUrl ?? body.baseUrl;
        const invalid = westernSource ? validateWesternSourceUrl(nextUrl, { allowedHosts: westernAllowedHosts() }) : isFacebookSource(source) ? validateFacebookPageUrl(nextUrl) : validateBaseUrl(source ? source.platform : body.platform, nextUrl);
        if (invalid) return json(res, 400, errorPayload(isFacebookSource(source) ? 'FACEBOOK_URL_INVALID' : 'URL_OUTSIDE_ALLOWED_HOSTS', invalid));
        patch.baseUrl = isFacebookSource(source) ? normalizeFacebookPageUrl(nextUrl) : String(nextUrl).trim();
      }
      if (body.startPaths != null) patch.startPaths = normalizeStartPaths(body.startPaths);
      if (currentSource.platform === 'bigplayer_h5' && (body.postsApiUrl !== undefined || body.commentsApiUrl !== undefined)) {
        for (const [field, required] of [['postsApiUrl', true], ['commentsApiUrl', true]]) {
          const value = body[field] === undefined ? parseConfig(currentSource.config)[field] : body[field]; const invalid = validateEndpoint(value, { required });
          if (invalid) return json(res, 400, errorPayload('INVALID_INPUT', `${field}: ${invalid}`));
          if (value && !connectors.bigplayer_h5.hostAllowed(value)) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', `${field} 的域名不在允许名单内`));
        }
        patch.config = { ...parseConfig(currentSource.config), ...(body.postsApiUrl !== undefined ? { postsApiUrl: body.postsApiUrl } : {}), ...(body.commentsApiUrl !== undefined ? { commentsApiUrl: body.commentsApiUrl } : {}) };
      }
      const source = patch.config ? await repo.updateSourceConfig(id, patch.config, patch) : await repo.updateSource(id, patch);
      if (source && (body.platformAccountId != null || body.accountName != null || body.syncMode != null || body.historyStart !== undefined)) {
        const account = await defaultAccountForSource(source);
        if (account) {
          await repo.updateAccount(account.id, { platformAccountId: body.platformAccountId, accountName: body.accountName, metadata: { ...parseConfig(account.metadata), syncMode: body.syncMode || parseConfig(account.metadata).syncMode || 'incremental', historyStart: body.historyStart === undefined ? parseConfig(account.metadata).historyStart : body.historyStart } });
          if (isSocialPlatform(source.platform) && body.password) {
            const invalid = validateSocialCredential({ countryCode: '+86', phone: account.masked_login_identifier, password: body.password, confirmPassword: body.password }, { partial: true });
            if (invalid && !account.masked_login_identifier) return json(res, 400, errorPayload('INVALID_INPUT', '手机号凭据缺失，不能仅覆盖密码'));
            const loaded = await credentialContext.loadSecretObject(account.id, 'account_password');
            const phone = loaded.phone;
            const secretCipher = credentialCipher.encrypt(JSON.stringify({ countryCode: '+86', phone, password: String(body.password) }), process.env, { aad: credentialAad({ accountId: account.id, credentialType: 'account_password', platform: source.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
            await repo.upsertAccountCredential(account.id, { credentialType: 'account_password', secretCipher, status: 'active' });
          }
        }
        else if (body.platformAccountId) await repo.createAccount({ gameId: source.game_id, sourceId: source.id, platform: source.platform, platformAccountId: body.platformAccountId, accountName: body.accountName || source.display_name });
      }
      return source ? json(res, 200, success(await sourceWithAccount(source))) : json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
    }

    // 写入凭据：优先写默认账号；旧测试/未迁移环境才保留 source 级兼容写入。
    if (req.method === 'PUT' && resource === 'sources' && id && path[2] === 'credential') {
      const body = await readBody(req); const source = await sourceById(id);
      if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      assertWesternSourceRecord(source);
      if (isFacebookSource(source)) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook 凭据仅由服务端部署级安全配置管理'));
      const credentialType = body.credentialType || 'api_token';
      if ((isWesternSourceRecord(source) || isFacebookSource(source)) && credentialType !== 'api_token') return json(res, 400, errorPayload('INVALID_CREDENTIALS', isFacebookSource(source) ? 'Facebook 仅支持 api_token 凭据' : '欧美版源仅支持 api_token 凭据'));
      const secret = credentialType === 'api_token' ? String(body.secret || '').trim() : '';
      if (credentialType === 'api_token' && (!secret || /^[*•]+$/.test(secret))) return json(res, 400, errorPayload('INVALID_INPUT', 'a non-masked secret is required'));
      if (isFacebookSource(source) && secret.length > 8192) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page Access Token is too long'));
      try {
        let account;
        try { account = await defaultAccountForSource(source); }
        catch (error) {
          if (error.code !== 'ER_NO_SUCH_TABLE' || credentialType !== 'api_token') throw error;
          const credential = await repo.upsertCredential(id, { secretCipher: credentialCipher.encrypt(String(body.secret)), status: 'active', expireAt: body.expireAt || null });
          return json(res, 200, success({ configured: true, status: credential.status, expireAt: credential.expire_at || null }));
        }
        if (!account) return json(res, 400, errorPayload('ACCOUNT_NOT_FOUND', '默认账号未配置'));
        if (credentialType === 'account_password') {
          const loginAccount = body.account ?? body.phone;
          const invalid = source.platform === 'bigplayer_h5'
            ? validateAccountPassword({ ...body, account: loginAccount })
            : validateSocialCredential({ countryCode: '+86', phone: loginAccount, password: body.password, confirmPassword: body.confirmPassword }, { partial: false });
          if (invalid) return json(res, 400, errorPayload('INVALID_CREDENTIALS', invalid));
          const identifier = String(loginAccount).trim(); const masked = maskLoginIdentifier(identifier);
          const secretCipher = credentialCipher.encrypt(JSON.stringify({ countryCode: source.platform === 'bigplayer_h5' ? null : '+86', account: identifier, phone: source.platform === 'bigplayer_h5' ? undefined : identifier, password: String(body.password) }), process.env, { aad: credentialAad({ accountId: account.id, credentialType, platform: source.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
          await repo.upsertAccountCredential(account.id, { credentialType, secretCipher, status: 'active' });
          await repo.updateAccount(account.id, { maskedLoginIdentifier: masked, authStatus: 'pending_verification' });
          if (loginSessionClient.configured()) {
            try { await loginSessionClient.bindAccount({ ...loginBinding(source, account), credentialRef: `credential:${account.id}:${credentialType}`, maskedPhone: masked }); }
            catch (error) { console.warn(error.code || 'LOGIN_SESSION_BIND_FAILED', 'credential saved; login binding will be restored on the next login request'); }
          }
          return json(res, 200, success({ credentialType, summary: accountPasswordSummary({ ...account, masked_login_identifier: masked }, { status: 'active', has_secret_cipher: true }) }));
        }
        const credential = await writeCredential(account.id, body, source.platform);
        const refreshed = await sourceWithAccount(source);
        return json(res, 200, success({ configured: true, credential_configured: Boolean(refreshed.account?.credential_configured), hasToken: Boolean(refreshed.account?.hasToken), credentialType: credential.credential_type, status: credential.status, expireAt: credential.expire_at || null, source: refreshed }));
      } catch (error) { if (error.code === 'CREDENTIAL_ENC_KEY_MISSING' || error.code === 'CREDENTIAL_ENC_KEY_INVALID') return json(res, 500, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝写入')); throw error; }
    }

    // 直登只通过主服务代理调用内部登录会话服务，前端不接触密码、Cookie 或 session 内容。
    if (resource === 'sources' && id && ['login-status', 'login', 'logout'].includes(path[2])) {
      const { source, account } = await socialSourceAccount(id);
      if (!source || !account) return json(res, 404, errorPayload('NOT_FOUND', 'source account not found'));
      rejectPhaseAction(await sourceWithCredentialState(source));
      const binding = loginBinding(source, account);
      if (req.method === 'GET' && path[2] === 'login-status') return json(res, 200, success(await loginSessionClient.getStatus(binding)));
      if (req.method === 'POST' && path[2] === 'login' && path[3] === 'check') {
        await loginSessionClient.bindAccount({ ...binding, credentialRef: `credential:${account.id}:account_password`, maskedPhone: account.masked_login_identifier || null });
        return json(res, 200, success(await updateSocialStatus(source, account, await loginSessionClient.startLogin({ ...binding, scenario: process.env.LOGIN_SESSION_MOCK_SCENARIO || undefined }))));
      }
      if (req.method === 'GET' && path[2] === 'login' && path[3] === 'challenge') {
        const status = await loginSessionClient.getStatus(binding); if (!status.challengeId) return json(res, 404, errorPayload('CHALLENGE_NOT_FOUND', 'no active challenge'));
        return json(res, 200, success(await loginSessionClient.getChallenge({ ...binding, challengeId: status.challengeId })));
      }
      if (req.method === 'POST' && path[2] === 'login' && path[3] === 'challenge' && path[4] === 'submit') {
        const body = await readBody(req); return json(res, 200, success(await updateSocialStatus(source, account, await loginSessionClient.submitChallenge({ ...binding, challengeId: body.challengeId, answer: body.code }))));
      }
      if (req.method === 'POST' && path[2] === 'login' && path[3] === 'challenge' && path[4] === 'poll') {
        const body = await readBody(req); return json(res, 200, success(await updateSocialStatus(source, account, await loginSessionClient.pollChallenge({ ...binding, challengeId: body.challengeId }))));
      }
      if (req.method === 'POST' && path[2] === 'login' && path[3] === 'challenge' && path[4] === 'cancel') return json(res, 200, success(await updateSocialStatus(source, account, await loginSessionClient.revokeSession(binding))));
      if (req.method === 'POST' && path[2] === 'logout') return json(res, 200, success(await updateSocialStatus(source, account, await loginSessionClient.revokeSession(binding))));
    }

    // 检测授权：账号级凭据由共享 CredentialContext 解密，连接器不再读取进程级 Cookie/Token。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'check-auth') {
      const source = await sourceById(id); if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      assertWesternSourceRecord(source);
      rejectUnconfiguredCredential(await sourceWithCredentialState(source));
      const connector = connectors[source.platform]; const account = await defaultAccountForSource(source); let health;
      if (account && connector) health = await connectorAccountHealth(connector, source, account);
      else health = connector && typeof connector.healthCheck === 'function' ? await connector.healthCheck(source) : { configured: false, authorized: false };
      const ok = account ? Boolean(health?.authorized) : Boolean(health?.configured); const authStatus = ok ? 'authorized' : 'unauthorized';
      await persistFacebookPageIdentity(source, account, health);
      await repo.updateSourceAuth(id, { authStatus }); if (account) await repo.updateAccount(account.id, { authStatus, ...(isFacebookSource(source) ? { enabled: ok } : {}) }); else await repo.updateCredentialCheck(id, { status: ok ? 'active' : 'failed', failureReason: ok ? null : (health.reason || 'connector not configured or missing credential') });
      if (isFacebookSource(source)) {
        const facebook = facebookCapabilityResponse(health || {});
        for (const scope of FACEBOOK_REQUIRED_CAPABILITIES) {
          const detail = facebook.capabilities[scope];
          await repo.upsertSourceCapability(source.id, scope, { status: normalizeFacebookCapabilityStatus(detail), detail });
        }
        return json(res, 200, success({
          authStatus,
          reason: ok ? null : facebook.reason,
          errorCode: ok ? null : facebook.reason,
          systemCredentialStatus: facebook.systemCredentialStatus,
          capabilities: facebook.capabilities,
          pageId: health?.pageId || null,
          pageName: health?.pageName || null,
          pageUrl: health?.pageUrl || null
        }));
      }
      return json(res, 200, success({ authStatus, reason: ok ? null : (health.reason || 'connector not configured') }));
    }
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'check-capabilities') {
      const source = await sourceById(id); if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      assertWesternSourceRecord(source);
      rejectUnconfiguredCredential(await sourceWithCredentialState(source));
      const connector = connectors[source.platform]; const account = await defaultAccountForSource(source); const installation = connector ? await connector.installationHealth(source) : { installed: false, capabilities: [] }; const health = account && connector ? await connectorAccountHealth(connector, source, account) : { authorized: false }; const capabilities = {};
      const detected = health?.capabilities || (account && connector && typeof connector.detectCapabilities === 'function' ? await connector.detectCapabilities({ source: { ...source, id: account.id, account_id: account.id }, account, credentialContext }) : {});
      await persistFacebookPageIdentity(source, account, { capabilities: detected });
      const facebook = isFacebookSource(source) ? facebookCapabilityResponse({ ...installation, ...health, capabilities: detected }) : null;
      if (facebook && account) { await repo.updateSourceAuth(source.id, { authStatus: health.authorized ? 'authorized' : 'unauthorized' }); await repo.updateAccount(account.id, { authStatus: health.authorized ? 'authorized' : 'unauthorized', enabled: Boolean(health.authorized) }); }
      for (const scope of sourceCapabilityScopes(source)) {
        const supported = connector?.hasSourceCapability ? connector.hasSourceCapability(scope, source) : connector?.hasCapability?.(scope);
        const detectedStatus = detected[scope]?.status;
        const value = facebook
          ? facebook.capabilities[scope]
          : !supported
          ? 'unsupported'
          : !health.authorized ? 'unauthorized' : detectedStatus === 'available' ? 'authorized_scope' : detectedStatus || 'configured';
        capabilities[scope] = value;
        await repo.upsertSourceCapability(source.id, scope, { status: facebook ? normalizeFacebookCapabilityStatus(value) : value, detail: facebook ? value : detected[scope] || {} });
      }
      const page = detected.page || {};
      return json(res, 200, success({ installed: Boolean(installation.installed), authorized: Boolean(health.authorized), reason: facebook?.reason || installation.reason || health.reason || null, ...(facebook ? { errorCode: facebook.reason, systemCredentialStatus: facebook.systemCredentialStatus } : {}), capabilities, ...(isFacebookSource(source) ? { pageId: page.pageId || health.pageId || null, pageName: page.pageName || health.pageName || null, pageUrl: page.pageUrl || health.pageUrl || null } : {}) }));
    }

    // 手动采集入队：仅入队不阻塞；未授权源 fail-closed 返回 UNAUTHORIZED。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'collect') {
      const source = await sourceById(id);
      if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      await rejectConfiguredBigPlayerLegacyBackfill(source);
      assertWesternSourceRecord(source);
      rejectPhaseAction(await sourceWithCredentialState(source));
      try { await requireAuthorizedAccount(source); await requireFacebookCapabilitiesReady(source); }
      catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          if (source.auth_status !== 'authorized') return json(res, 400, errorPayload('UNAUTHORIZED', '该采集源未授权或授权已失效，请先完成凭据配置与授权检测'));
          await repo.requestCollect(id); return json(res, 200, success({ queued: true, sourceId: id, legacy: true }));
        }
        throw error;
      }
      await repo.requestCollect(id);
      return json(res, 200, success({ queued: true, sourceId: id }));
    }

    // Source 级同步控制入口。直接 POST /sync 仅请求 Repository
    // 为路径指定的 source 精确创建 manual run；不自动启用源，也不接受账号/范围替换。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'sync') {
      const action = path[3];
      const body = (action === 'reset' || !action) ? await readBody(req) : {};
      let mode;
      let historyStart;
      let publishedFrom;
      let publishedTo;
      let boundedBackfill = false;
      let databaseAnchoredBackfill = false;
      if (!action) {
        if (!isPlainObject(body)) return json(res, 400, errorPayload('INVALID_INPUT', 'sync body must be a JSON object'));
        const allowedKeys = new Set(['mode', 'historyStart', 'publishedFrom', 'publishedTo', 'lookbackDays']);
        const unsupportedKeys = Object.keys(body).filter(key => !allowedKeys.has(key));
        if (unsupportedKeys.length) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported sync fields: ${unsupportedKeys.join(', ')}`));
        mode = body.mode || 'incremental';
        if (!SYNC_MODES.has(mode)) return json(res, 400, errorPayload('INVALID_INPUT', 'mode must be incremental or backfill'));
        historyStart = body.historyStart || null;
        const hasPublishedFrom = body.publishedFrom != null && body.publishedFrom !== '';
        const hasPublishedTo = body.publishedTo != null && body.publishedTo !== '';
        const hasLookbackDays = body.lookbackDays != null && body.lookbackDays !== '';
        if (hasLookbackDays) {
          if (mode !== 'backfill' || Number(body.lookbackDays) !== 7 || historyStart || hasPublishedFrom || hasPublishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'database-anchored BigPlayer backfill requires lookbackDays=7 only'));
          databaseAnchoredBackfill = true;
        } else if (hasPublishedFrom || hasPublishedTo) {
          if (mode !== 'backfill' || historyStart || !hasPublishedFrom || !hasPublishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'bounded backfill requires only publishedFrom and publishedTo'));
          try {
            publishedFrom = parseUtcSyncBoundary(body.publishedFrom, 'publishedFrom');
            publishedTo = parseUtcSyncBoundary(body.publishedTo, 'publishedTo');
          } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); }
          const duration = Date.parse(publishedTo) - Date.parse(publishedFrom);
          if (duration <= 0) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
          if (duration > 7 * 24 * 60 * 60 * 1000) return json(res, 400, errorPayload('INVALID_INPUT', 'bounded backfill window must not exceed 7 days'));
          boundedBackfill = true;
        }
      } else if (action === 'reset') {
        if (!isPlainObject(body)) return json(res, 400, errorPayload('INVALID_INPUT', 'sync reset body must be a JSON object'));
        const unsupportedKeys = Object.keys(body).filter(key => key !== 'historyStart');
        if (unsupportedKeys.length) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported sync reset fields: ${unsupportedKeys.join(', ')}`));
      }
      const source = await sourceById(id); if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      assertWesternSourceRecord(source);
      if (!action) {
        if (databaseAnchoredBackfill && source.platform !== 'bigplayer_h5') return json(res, 400, errorPayload('INVALID_INPUT', 'lookbackDays is only supported for BigPlayer backfill'));
        if (source.platform === 'bigplayer_h5' && mode === 'backfill' && !boundedBackfill && !databaseAnchoredBackfill) return json(res, 400, errorPayload('INVALID_INPUT', 'BigPlayer backfill requires publishedFrom and publishedTo'));
        if (source.platform !== 'bigplayer_h5' && mode === 'backfill' && !boundedBackfill && !historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '历史回溯必须配置 historyStart'));
        if (source.platform === 'bigplayer_h5' && databaseAnchoredBackfill) {
          const started = await repo.startRecentSourceBackfill({ sourceId: source.id, lookbackDays: 7 });
          const run = started.run;
          return json(res, 200, success({ queued: run.status === 'queued', enabled: Boolean(started.enabled), runId: run.id, accountId: run.account_id, sourceId: run.source_id || source.id, mode: run.sync_mode, status: run.status, reused: Boolean(started.reused), publishedFrom: started.window.publishedFrom, publishedTo: started.window.publishedTo }));
        }
        if (source.platform === 'bigplayer_h5' && boundedBackfill) {
          const admitted = await repo.validateBoundedSourceBackfillWindow({ sourceId: source.id, publishedFrom, publishedTo });
          publishedFrom = admitted.publishedFrom;
          publishedTo = admitted.publishedTo;
        }
        // 停用源先在本地 fail-closed，不对外发起授权探测；Repository 事务内仍会二次复核。
        if (!source.enabled) return json(res, 409, errorPayload('SOURCE_DISABLED', '采集源已停用'));
        rejectPhaseAction(await sourceWithCredentialState(source));
        await requireEnabledCommunityForSource(source);
        await requireAuthorizedAccount(source, { exactDefault: true, stableStateErrors: true });
        await requireFacebookCapabilitiesReady(source);
        const started = boundedBackfill
          ? await repo.startBoundedSourceBackfill({ sourceId: source.id, publishedFrom, publishedTo })
          : await repo.startSourceSync({
            sourceId: source.id,
            syncMode: mode,
            metadata: {
              syncMode: mode,
              crawlScope: mode === 'backfill' ? 'authorized_scope' : 'incremental',
              ...(mode === 'backfill' ? { historyStart } : {})
            }
          });
        const run = started.run;
        return json(res, 200, success({ queued: run.status === 'queued', enabled: Boolean(started.enabled), runId: run.id, accountId: run.account_id, sourceId: run.source_id || source.id, mode: run.sync_mode, status: run.status, reused: Boolean(started.reused), ...(boundedBackfill ? { publishedFrom, publishedTo } : {}) }));
      }
      if (!['pause', 'resume', 'reset'].includes(action)) return json(res, 404, errorPayload('NOT_FOUND', 'sync action not found'));
      if (action === 'reset') {
        if (!source.enabled) return json(res, 409, errorPayload('SOURCE_DISABLED', '采集源已停用'));
        if (source.platform === 'bigplayer_h5') return json(res, 400, errorPayload('INVALID_INPUT', 'BigPlayer backfill must use a bounded window and cannot reset checkpoints'));
      }
      if (action === 'resume') await rejectConfiguredBigPlayerLegacyBackfill(source);
      rejectPhaseAction(await sourceWithCredentialState(source));
      const account = await defaultAccountForSource(source, { exactDefault: action === 'reset' });
      if (!account) return json(res, action === 'reset' ? 404 : 400, errorPayload('ACCOUNT_NOT_FOUND', '默认账号未配置'));
      if (action === 'resume' || action === 'reset') {
        await requireEnabledCommunityForSource(source);
        await requireAuthorizedAccount(source, action === 'reset' ? { exactDefault: true, stableStateErrors: true } : undefined);
        await requireFacebookCapabilitiesReady(source);
      }
      const rows = await repo.getSyncStatus({ accountId: account.id });
      if (action === 'pause') { for (const checkpoint of rows) if (checkpoint.status === 'running' || checkpoint.status === 'idle') await repo.pauseSyncCheckpoint(checkpoint.id); return json(res, 200, success({ paused: true, accountId: account.id })); }
      if (action === 'resume' && !source.enabled) return json(res, 409, errorPayload('SOURCE_DISABLED', '采集源已停用，请先启用'));
      if (action === 'resume') { for (const checkpoint of rows) if (checkpoint.status === 'paused' || checkpoint.status === 'failed') await repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle' }); await repo.requestCollect(source.id); return json(res, 200, success({ queued: true, resumed: true, enabled: true, accountId: account.id })); }
      if (action === 'reset') {
        const metadata = parseConfig(account.metadata);
        const historyStart = body.historyStart || metadata.historyStart || metadata.history_start || null;
        if (!historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '授权范围全量回溯必须配置 historyStart'));
        const reset = await repo.resetSourceSync({
          sourceId: source.id,
          metadata: { ...metadata, syncMode: 'backfill', crawlScope: 'authorized_scope', historyStart },
          syncMode: 'backfill'
        });
        const run = reset.run;
        return json(res, 200, success({ queued: run.status === 'queued', reset: true, enabled: reset.enabled, accountId: run.account_id, runId: run.id, mode: run.sync_mode, crawlScope: 'authorized_scope', status: run.status, reused: Boolean(reset.reused) }));
      }
    }
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'oauth' && path[3] === 'start') {
      const source = await sourceById(id); const account = await defaultAccountForSource(source); if (!source || !account) return json(res, 404, errorPayload('NOT_FOUND', 'source account not found'));
      if (source.platform !== 'douyin') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'OAuth is not supported for this platform'));
      return json(res, 200, success({ authorizationUrl: douyinOAuth.createAuthorizationUrl({ accountId: account.id }).url }));
    }

    // 独立账号 API。
    if (req.method === 'POST' && resource === 'accounts' && !id) {
      const body = await readBody(req);
      if (!body.sourceId || !body.platform || !body.platformAccountId || !body.accountName) return json(res, 400, errorPayload('INVALID_INPUT', 'sourceId/platform/platformAccountId/accountName are required'));
      const source = await sourceById(body.sourceId);
      if (!source || source.platform !== body.platform) return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'account must belong to the specified source/platform'));
      rejectBigPlayerLegacyBackfill(source.platform, body, body.metadata);
      if (isFacebookSource(source)) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page 账号仅由创建来源与官方能力检测管理'));
      let scope;
      try { scope = await resolveCanonicalScope({ regionCode: body.regionCode, communityId: body.communityId || source.community_id, gameId: body.gameId || source.game_id }); }
      catch (error) { return json(res, 400, errorPayload(error.code, error.message)); }
      if (scope.gameId !== source.game_id || scope.communityId !== source.community_id) return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'account must belong to the specified source/community/game'));
      return json(res, 201, success(await repo.createAccount({ ...body, gameId: scope.gameId, communityId: scope.communityId, platform: source.platform })));
    }
    if (req.method === 'PATCH' && resource === 'accounts' && id) { const body = await readBody(req); const currentAccount = await repo.getAccount(id); if (!currentAccount) return json(res, 404, errorPayload('NOT_FOUND', 'account not found')); rejectBigPlayerLegacyBackfill(currentAccount.platform, body, body.metadata); if (currentAccount.platform === 'facebook' && ['platformAccountId', 'accountName', 'profileUrl'].some(key => body[key] != null)) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page 身份仅由官方能力检测更新')); const account = await repo.updateAccount(id, accountPatch(body)); return json(res, 200, success(account)); }
    if (req.method === 'PUT' && resource === 'accounts' && id && path[2] === 'credential') {
      const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account not found'));
      const source = await sourceById(account.source_id); const body = await readBody(req);
      if (account.platform === 'facebook') return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook 凭据仅由服务端部署级安全配置管理'));
      const credentialType = body.credentialType || (isSocialPlatform(account.platform) ? 'account_password' : 'api_token');
      if (account.platform === 'facebook' && credentialType !== 'api_token') return json(res, 400, errorPayload('INVALID_CREDENTIALS', 'Facebook 仅支持 api_token 凭据'));
      if (account.platform === 'facebook' && String(body.secret || '').length > 8192) return json(res, 400, errorPayload('INVALID_INPUT', 'Facebook Page Access Token is too long'));
      try {
        if (credentialType === 'account_password') {
          const loginAccount = body.account ?? body.phone;
          const invalid = account.platform === 'bigplayer_h5'
            ? validateAccountPassword({ ...body, account: loginAccount })
            : validateSocialCredential({ countryCode: '+86', phone: loginAccount, password: body.password, confirmPassword: body.confirmPassword }, { partial: false });
          if (invalid) return json(res, 400, errorPayload('INVALID_CREDENTIALS', invalid));
          const identifier = String(loginAccount).trim(); const masked = maskLoginIdentifier(identifier);
          const secretCipher = credentialCipher.encrypt(JSON.stringify({ countryCode: account.platform === 'bigplayer_h5' ? null : '+86', account: identifier, phone: account.platform === 'bigplayer_h5' ? undefined : identifier, password: String(body.password) }), process.env, { aad: credentialAad({ accountId: id, credentialType, platform: account.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' });
          await repo.upsertAccountCredential(id, { credentialType, secretCipher, status: 'active' });
          await repo.updateAccount(id, { maskedLoginIdentifier: masked, authStatus: 'pending_verification' });
          if (source && loginSessionClient.configured()) await loginSessionClient.bindAccount({ ...loginBinding(source, account), credentialRef: `credential:${id}:${credentialType}`, maskedPhone: masked });
          return json(res, 200, success({ credentialType, summary: accountPasswordSummary({ ...account, masked_login_identifier: masked }, { status: 'active', has_secret_cipher: true }) }));
        }
        const credential = await writeCredential(id, body, account.platform);
        return json(res, 200, success({ configured: true, credentialType: credential.credential_type, status: credential.status, expireAt: credential.expire_at || null }));
      } catch (error) {
        if (error.code === 'CREDENTIAL_ENC_KEY_MISSING' || error.code === 'CREDENTIAL_ENC_KEY_INVALID') return json(res, 503, errorPayload(error.code, 'credential encryption is not configured'));
        throw error;
      }
    }
    if (req.method === 'DELETE' && resource === 'accounts' && id && path[2] === 'credentials' && path[3] === 'account_password') {
      const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account not found'));
      const body = await readBody(req);
      if (!accountConfirmation(id, body.confirmation)) return json(res, 400, errorPayload('INVALID_CONFIRMATION', 'confirmation must match the final six characters of the account id'));
      await repo.clearAccountCredential(id, 'account_password');
      return json(res, 200, success({ cleared: true, credentialType: 'account_password' }));
    }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'login' && ['start', 'retry'].includes(path[3])) {
      const account = await repo.getAccount(id); const source = account && await sourceById(account.source_id);
      if (!account || !source) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account or source not found'));
      rejectPhaseAction(await sourceWithCredentialState(source));
      if (source.platform !== 'bigplayer_h5') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'H5 login is only available for bigplayer_h5'));
      if (!loginSessionClient.configured()) return json(res, 503, errorPayload('LOGIN_SERVICE_UNAVAILABLE', 'login session service is unavailable'));
      const binding = loginBinding(source, account);
      await loginSessionClient.bindAccount({
        ...binding,
        credentialRef: `credential:${account.id}:account_password`,
        maskedPhone: account.masked_login_identifier || null
      });
      const result = await loginSessionClient.startLogin({ ...binding, scenario: process.env.LOGIN_SESSION_MOCK_SCENARIO || undefined, reason: path[3] });
      await repo.updateAccount(id, { authStatus: result.status === 'active' ? 'authorized' : result.status === 'manual_verification' ? 'awaiting_manual_verification' : 'unauthorized' });
      return json(res, 200, success(result));
    }
    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'login' && path[3] === 'status') {
      const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account not found'));
      return json(res, 200, success(await loginSessionClient.getStatus({ accountId: id, sourceId: account.source_id, platform: account.platform })));
    }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'login' && path[3] === 'challenge') {
      const account = await repo.getAccount(id); const source = account && await sourceById(account.source_id); if (!account || !source) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account or source not found')); rejectPhaseAction(await sourceWithCredentialState(source));
      const result = body.poll ? await loginSessionClient.pollChallenge({ ...binding, challengeId: body.challengeId }) : await loginSessionClient.submitChallenge({ ...binding, challengeId: body.challengeId, answer: body.answer || body.code });
      await repo.updateAccount(id, { authStatus: result.status === 'active' ? 'authorized' : 'awaiting_manual_verification' });
      return json(res, 200, success(result));
    }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'check-auth') { const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('NOT_FOUND', 'account not found')); const source = await sourceById(account.source_id); rejectPhaseAction(await sourceWithCredentialState(source)); const connector = connectors[account.platform]; const health = connector ? await connectorAccountHealth(connector, source, account) : { authorized: false, reason: 'connector not found' }; const authStatus = health.authorized ? 'authorized' : 'unauthorized'; await persistFacebookPageIdentity(source, account, health); await repo.updateAccount(id, { authStatus }); await repo.updateSourceAuth(account.source_id, { authStatus }); if (isFacebookSource(source)) { const facebook = facebookCapabilityResponse(health || {}); for (const scope of FACEBOOK_REQUIRED_CAPABILITIES) { const detail = facebook.capabilities[scope]; await repo.upsertSourceCapability(source.id, scope, { status: normalizeFacebookCapabilityStatus(detail), detail }); } return json(res, 200, success({ authStatus, reason: health.authorized ? null : facebook.reason, errorCode: health.authorized ? null : facebook.reason, systemCredentialStatus: facebook.systemCredentialStatus, capabilities: facebook.capabilities, pageId: health.pageId || null, pageName: health.pageName || null, pageUrl: health.pageUrl || null })); } return json(res, 200, success({ authStatus, reason: health.reason || null })); }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'sync') {
      const account = await repo.getAccount(id);
      if (!account) return json(res, 404, errorPayload('NOT_FOUND', 'account not found'));
      const source = await sourceById(account.source_id);
      if (!source || source.game_id !== account.game_id || source.platform !== account.platform) return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'account source ownership is invalid'));
      const action = path[3];
      if (source.platform === 'bigplayer_h5' && action === 'reset') return json(res, 400, errorPayload('INVALID_INPUT', 'BigPlayer backfill must use a bounded source-level window and cannot reset checkpoints'));
      if (!action || action === 'resume') await rejectConfiguredBigPlayerLegacyBackfill(source, account);
      rejectPhaseAction(await sourceWithCredentialState(source));
      if (!action || action === 'resume' || action === 'reset') { await requireEnabledCommunityForSource(source); await requireAuthorizedAccount(source); await requireFacebookCapabilitiesReady(source); }
      const rows = await repo.getSyncStatus({ accountId: id });
      if (action === 'pause') { for (const checkpoint of rows) await repo.pauseSyncCheckpoint(checkpoint.id); return json(res, 200, success({ paused: true })); }
      if (action === 'reset') { for (const checkpoint of rows) await repo.resetSyncCheckpoint({ accountId: id, syncScope: checkpoint.sync_scope, rootPlatformContentId: checkpoint.root_platform_content_id }); }
      if (action === 'resume' || action === 'reset' || !action) await repo.requestCollect(source.id);
      return json(res, 200, success({ queued: true, action: action || 'start' }));
    }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'oauth' && path[3] === 'start') { const account = await repo.getAccount(id); if (!account || account.platform !== 'douyin') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'Douyin account required')); return json(res, 200, success({ authorizationUrl: douyinOAuth.createAuthorizationUrl({ accountId: id }).url })); }
    if (req.method === 'GET' && resource === 'oauth' && id === 'douyin' && path[2] === 'callback') {
      if (url.searchParams.get('error')) return redirect(res, oauthReturnUrl({ oauth: 'error', message: url.searchParams.get('error_description') || url.searchParams.get('error') }));
      const result = await douyinOAuth.exchangeCode({ code: url.searchParams.get('code'), state: url.searchParams.get('state') });
      const account = await repo.getAccount(result.accountId);
      if (!account || account.platform !== 'douyin') return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'OAuth state account is no longer valid'));
      const source = await sourceById(account.source_id);
      if (!source || source.game_id !== account.game_id || source.platform !== 'douyin') return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'OAuth source ownership is invalid'));
      if (!result.openId) return json(res, 400, errorPayload('OAUTH_IDENTITY_MISSING', 'OAuth provider account identity is required'));
      if (account.platform_account_id && !String(account.platform_account_id).startsWith('pending:') && account.platform_account_id !== result.openId) return json(res, 409, errorPayload('OAUTH_IDENTITY_MISMATCH', 'OAuth account does not match the configured platform account'));
      const expireAt = result.expiresIn ? new Date(Date.now() + result.expiresIn * 1000) : null;
      const secret = JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      await repo.upsertAccountCredential(result.accountId, { credentialType: 'oauth_access_refresh', secretCipher: credentialCipher.encrypt(secret), status: 'active', expireAt });
      await repo.updateAccount(result.accountId, { platformAccountId: result.openId, authStatus: 'authorized', authExpireAt: expireAt, metadata: { ...parseConfig(account.metadata), scopes: result.scopes } });
      await repo.updateSourceAuth(source.id, { authStatus: 'authorized', authExpireAt: expireAt });
      return redirect(res, oauthReturnUrl({ oauth: 'success', sourceId: source.id }));
    }

    if (resource === 'sync-runs') return json(res, 404, errorPayload('NOT_FOUND', 'route not found'));

    // 关键词规则：按当前平台读取与局部替换。
    if (req.method === 'GET' && resource === 'keyword-rules') {
      const communityId = url.searchParams.get('communityId');
      const platform = parsePlatform(url.searchParams.get('platform'));
      if (!platform) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is required'));
      if (!communityId) {
        const gameId = url.searchParams.get('gameId');
        if (!gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'communityId is required'));
        const game = await repo.getGame(gameId);
        if (!game) return json(res, 400, errorPayload('GAME_NOT_FOUND', '归属游戏不存在或已删除'));
        return json(res, 200, success(groupKeywordRules(await repo.listKeywordRulesRaw(game.id, null, platform))));
      }
      let scope; try { scope = await resolveCanonicalScope({ regionCode: url.searchParams.get('regionCode'), communityId, gameId: url.searchParams.get('gameId') }); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); }
      return json(res, 200, success(groupKeywordRules(await repo.listKeywordRulesRaw(scope.gameId, scope.communityId, platform))));
    }
    if (req.method === 'PUT' && resource === 'keyword-rules') {
      const body = await readBody(req);
      const platform = parsePlatform(body.platform);
      if (!platform) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is required'));
      if (!body.communityId) {
        if (!body.gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'communityId is required'));
        const game = await repo.getGame(body.gameId);
        if (!game) return json(res, 400, errorPayload('GAME_NOT_FOUND', '归属游戏不存在或已删除'));
        const groups = (body.groups || []).map(group => ({ ...group, platform }));
        const invalid = validateRuleGroups(groups);
        if (invalid) return json(res, 400, errorPayload('INVALID_RULES', invalid));
        const saved = await repo.replaceKeywordRules(game.id, null, flattenRuleGroups(game.id, null, groups), platform);
        return json(res, 200, success(groupKeywordRules(saved)));
      }
      let scope; try { scope = await resolveCanonicalScope({ regionCode: body.regionCode, communityId: body.communityId, gameId: body.gameId }); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); }
      if (scope.community?.status !== 'enabled') return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在、与区域或游戏不匹配，或已停用'));
      const groups = (body.groups || []).map(group => ({ ...group, platform }));
      const invalid = validateRuleGroups(groups);
      if (invalid) return json(res, 400, errorPayload('INVALID_RULES', invalid));
      const saved = await repo.replaceKeywordRules(scope.gameId, scope.communityId, flattenRuleGroups(scope.gameId, scope.communityId, groups), platform);
      return json(res, 200, success(groupKeywordRules(saved)));
    }

    return json(res, 501, errorPayload('ENDPOINT_PENDING', 'this endpoint is reserved for the next domain module'));
  } catch (error) {
    console.error(error.code || error.name || 'ERROR', error.message);
    const mapped = { INVALID_INPUT: 400, INVALID_JSON: 400, REQUEST_TOO_LARGE: 413, IMPORT_BATCH_TOO_LARGE: 413, UNAUTHORIZED: 401, SOURCE_AUTH_UNCONFIGURED: 401, WESTERN_SCOPE_MISMATCH: 400, FEATURE_NOT_AVAILABLE_IN_PHASE: 409, FIXED_BASE_URL_MISMATCH: 400, IMPORT_NOT_CONFIGURED: 503, ACCOUNT_SCOPE_MISMATCH: 400, SOURCE_DISABLED: 409, GAME_DISABLED: 409, COMMUNITY_DISABLED: 409, ACCOUNT_DISABLED: 409, SOURCE_UNAUTHORIZED: 409, SOURCE_AUTH_EXPIRED: 409, ACCOUNT_UNAUTHORIZED: 409, ACCOUNT_AUTH_EXPIRED: 409, PREVIOUS_RUN_ACTIVE: 409, SYNC_CHECKPOINT_ACTIVE: 409, SOURCE_SCHEDULE_LEASE_ACTIVE: 409, UNIFIED_SCHEDULER_SCHEMA_NOT_READY: 503, UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED: 503, INVALID_CONFIRMATION: 400, OWNERSHIP_MISMATCH: 400, NOT_FOUND: 404, SOURCE_NOT_FOUND: 404, ACCOUNT_NOT_FOUND: 404, COMMUNITY_NOT_FOUND: 404, GAME_NOT_FOUND: 400, RUN_ACTIVE: 409, SOURCE_ALREADY_EXISTS: 409, INVALID_CREDENTIALS: 400, LOGIN_CHALLENGE_REQUIRED: 409, LOGIN_CHALLENGE_INVALID: 400, LOGIN_SESSION_EXPIRED: 409, LOGIN_SERVICE_UNAVAILABLE: 503, LOGIN_SESSION_SERVICE_NOT_CONFIGURED: 503, LOGIN_SESSION_SERVICE_UNAVAILABLE: 503, LOGIN_SESSION_SERVICE_TIMEOUT: 504, LOGIN_STATE_UNKNOWN: 503, AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED: 409, AUTH_REFRESH_FAILED: 503, AUTH_REFRESH_ALREADY_RUNNING: 409, AUTH_REFRESH_CHALLENGE_REQUIRED: 409, COMMUNITY_PROVIDER_NOT_CONFIGURED: 503, COMMUNITY_PROVIDER_TIMEOUT: 504, COMMUNITY_PROVIDER_UNAVAILABLE: 503, COMMUNITY_PROVIDER_ERROR: 503, COMMUNITY_PROVIDER_INVALID_RESPONSE: 502, COMMUNITY_PROVIDER_UNKNOWN_GAME: 502, COMMUNITY_PROVIDER_REGION_MISMATCH: 502 };
    const status = error.code === '22P02' ? 400 : error.status || mapped[error.code] || credentialErrorStatus(error.code);
    const publicMessages = { LOGIN_SESSION_SERVICE_NOT_CONFIGURED: '登录会话服务未配置，请先配置授权服务', LOGIN_SESSION_SERVICE_UNAVAILABLE: '登录会话服务不可用，请检查 4310 服务', LOGIN_SESSION_SERVICE_TIMEOUT: '登录会话服务响应超时，请稍后重试', LOGIN_STATE_UNKNOWN: '登录页面状态暂未识别，请稍后重试或完成页面验证', AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED: '账号密码凭据未配置，请重新保存账号密码', AUTH_REFRESH_CHALLENGE_REQUIRED: '需要完成人工验证，请在授权工作区继续操作', COMMUNITY_PROVIDER_NOT_CONFIGURED: '社区 Provider 未配置，暂时无法开始同步' };
    const publicMessage = publicMessages[error.code] || (status >= 500 ? 'internal server error' : error.message);
    return json(res, status, errorPayload(error.code || 'INTERNAL_ERROR', publicMessage));
  }
}
const server = http.createServer((req, res) => handler(req, res).catch(error => json(res, 500, errorPayload('INTERNAL_ERROR', error.message))));
async function startServer({ listenPort = port, repository = repo, httpServer = server } = {}) {
  await repository.health();
  await new Promise((resolve, reject) => {
    const onError = error => { httpServer.off('listening', onListening); reject(error); };
    const onListening = () => { httpServer.off('error', onError); resolve(); };
    httpServer.once('error', onError);
    httpServer.listen(listenPort, onListening);
  });
  console.log(`public-opinion-server listening on ${listenPort}`);
  return httpServer;
}
if (require.main === module) {
  startServer().catch(error => {
    console.error(error.code || error.name || 'STARTUP_ERROR', error.message);
    process.exitCode = 1;
  });
}
module.exports = { server, startServer, handler, connectors, ai, dingTalk, repo, communityProvider, communityDirectory, credentialContext, douyinOAuth, loginSessionClient, authRefreshCoordinator };
