const { loadRuntimeEnv } = require('./runtimeEnv');
loadRuntimeEnv();

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Repository } = require('./db/repository');
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
const { SOURCE_PLATFORMS, isSocialPlatform, maskPhone, normalizePlatform, socialSecret, validateEndpoint, validateSocialCredential } = require('./services/sourceValidators');

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
function json(res, status, payload) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...(res.noStore ? { 'cache-control': 'no-store' } : {}), ...(res.corsHeaders || {}) }); res.end(JSON.stringify(payload)); }
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
const OVERVIEW_QUERY_KEYS = new Set(['regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'period', 'from', 'to']);
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
  if (query.platform) query.platform = parsePlatform(query.platform);
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
const REPLY_URL_ALIASES = ['repliesApiUrl', 'replies_api_url', 'replyApiUrl', 'reply_api_url'];
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
function credentialErrorStatus(code) { return ['CREDENTIAL_NOT_FOUND', 'CREDENTIAL_INACTIVE', 'CREDENTIAL_EXPIRED', 'UNAUTHORIZED'].includes(code) ? 401 : code === 'SOURCE_DISABLED' ? 409 : ['ACCOUNT_NOT_FOUND', 'CAPABILITY_UNSUPPORTED', 'GAME_DISABLED'].includes(code) ? 400 : 500; }
async function requireEnabledCommunityForSource(source) {
  if (!source?.community_id || !source?.game_id) { const error = new Error('采集源未关联社区'); error.code = 'COMMUNITY_NOT_FOUND'; error.status = 400; throw error; }
  return communityDirectory.requireEnabled({ communityId: source.community_id, gameId: source.game_id, regionCode: source.region_code });
}
async function sourceWithAccount(source) {
  if (!source) return null;
  let accounts = []; try { accounts = await repo.listAccounts({ sourceId: source.id }); } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  const account = accounts[0] || null;
  const checkpoints = account ? await repo.getSyncStatus({ accountId: account.id }) : [];
  const credentials = account ? await repo.getAccountCredentialSummary(account.id) : [];
  const connector = connectors[source.platform]; let capabilities = {};
  try {
    const persisted = await repo.listSourceCapabilities(source.id);
    capabilities = Object.fromEntries(persisted.filter(item => PUBLIC_SYNC_SCOPES.has(item.capability)).map(item => [item.capability, item.status]));
  } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
  for (const scope of PUBLIC_SYNC_SCOPES) if (!capabilities[scope]) { const supported = connector?.hasSourceCapability ? connector.hasSourceCapability(scope, source) : connector?.hasCapability?.(scope); capabilities[scope] = !supported ? 'unsupported' : account?.auth_status === 'authorized' ? 'authorized_scope' : 'unauthorized'; }
  if (account) {
    account.credential_configured = credentials.some(item => item.has_secret_cipher || item.has_secret_ref);
    account.masked_phone = account.masked_login_identifier || null;
    account.hasToken = credentials.some(item => ['api_token', 'oauth_access_refresh'].includes(item.credential_type) && (item.has_secret_cipher || item.has_secret_ref));
    account.hasAccountPassword = credentials.some(item => item.credential_type === 'account_password' && (item.has_secret_cipher || item.has_secret_ref));
    account.maskedAccount = account.masked_login_identifier || null;
  }
  return { ...sanitizeSource(source), account, accounts, checkpoints, capabilities };
}
async function sourceById(id) { return (await repo.listSources()).find(source => source.id === id) || null; }
async function defaultAccountForSource(source) { return source ? repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform }) : null; }
async function requireAuthorizedAccount(source) {
  const connector = source && connectors[source.platform];
  if (!connector) { const error = new Error('connector not found'); error.code = 'CAPABILITY_UNSUPPORTED'; throw error; }
  const account = await defaultAccountForSource(source);
  if (!account || !account.enabled) { const error = new Error('enabled default account is required'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
  const health = await connector.accountHealth({ ...source, id: account.id, account_id: account.id });
  if (!health?.authorized) { const error = new Error(health?.reason || 'account is unauthorized'); error.code = 'UNAUTHORIZED'; throw error; }
  const postsSupported = typeof connector.hasSourceCapability === 'function' ? connector.hasSourceCapability('posts', source) : connector.hasCapability?.('posts');
  if (!postsSupported) { const error = new Error('posts capability is unsupported'); error.code = 'CAPABILITY_UNSUPPORTED'; throw error; }
  return { account, connector, health };
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
function scopeFromQuery(url) {
  return {
    regionCode: url.searchParams.get('regionCode') || undefined,
    gameId: url.searchParams.get('gameId') || undefined,
    communityId: url.searchParams.get('communityId') || undefined,
    sourceId: url.searchParams.get('sourceId') || undefined,
    platform: parsePlatform(url.searchParams.get('platform'))
  };
}

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
    if (req.method === 'GET' && resource === 'games') return json(res, 200, success(await repo.listGames({ regionCode: url.searchParams.get('regionCode') || undefined })));
    if (req.method === 'GET' && resource === 'communities') return json(res, 200, success(await communityDirectory.list({ gameId: url.searchParams.get('gameId') || undefined, regionCode: url.searchParams.get('regionCode') || undefined, includeDisabled: url.searchParams.get('includeDisabled') !== 'false' })));
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
      const run = await repo.getSyncRun(id, scopeFromQuery(url)); if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      if (!['completed','completed_full','completed_authorized_scope','partial','awaiting_manual_verification','failed','cancelled','canceled'].includes(run.status)) return json(res, 409, errorPayload('RUN_ACTIVE', 'sync run is still active'));
      const preview = await repo.getDeletePreview(id);
      return preview ? json(res, 200, success(preview)) : json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
    }
    if (req.method === 'DELETE' && resource === 'sync-runs' && id && path.length === 2) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const run = await repo.getSyncRun(id, scopeFromQuery(url)); if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      const body = await readBody(req); if (!body || typeof body.confirmation !== 'string' || !/^[A-Za-z0-9]{6}$/.test(body.confirmation)) return json(res, 400, errorPayload('INVALID_CONFIRMATION', 'confirmation must be the final six characters of the run id'));
      return json(res, 200, success(await repo.deleteSyncRun(id, body.confirmation)));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && id && path.length === 2) {
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const run = await repo.getSyncRun(id, scopeFromQuery(url));
      return run ? json(res, 200, success(run)) : json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
    }
    if (req.method === 'GET' && resource === 'sync-runs' && !id && path.length === 1) {
      const allowed = new Set(['page','pageSize','gameId','communityId','regionCode','sourceId','platform','status','mode','startedFrom','startedTo','runId']); for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const rawPage = url.searchParams.get('page') || '1'; const rawPageSize = url.searchParams.get('pageSize') || '20'; const page = Number(rawPage); const pageSize = Number(rawPageSize);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const mode = url.searchParams.get('mode'); if (mode && !SYNC_MODES.has(mode)) return json(res, 400, errorPayload('INVALID_INPUT', 'mode must be incremental or backfill'));
      const status = url.searchParams.get('status'); const allowedStatuses = new Set(['queued','running','completed','completed_full','completed_authorized_scope','partial','awaiting_manual_verification','failed','cancelled','canceled']); if (status && !allowedStatuses.has(status)) return json(res, 400, errorPayload('INVALID_INPUT', 'status is not supported'));
      const platform = url.searchParams.get('platform'); if (platform && !SOURCE_PLATFORMS.has(normalizePlatform(platform))) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is not supported'));
      const startedFrom = url.searchParams.get('startedFrom'); const startedTo = url.searchParams.get('startedTo'); const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/; for (const [key, value] of [['startedFrom', startedFrom], ['startedTo', startedTo]]) if (value && (!dateTimePattern.test(value) || Number.isNaN(Date.parse(value)))) return json(res, 400, errorPayload('INVALID_INPUT', `${key} must be an ISO date-time`)); if (startedFrom && startedTo && Date.parse(startedFrom) >= Date.parse(startedTo)) return json(res, 400, errorPayload('INVALID_INPUT', 'startedFrom must be earlier than startedTo'));
      const runId = url.searchParams.get('runId'); if (runId && runId.length > 64) return json(res, 400, errorPayload('INVALID_INPUT', 'runId is too long'));
      const result = await repo.listSyncRuns({ ...Object.fromEntries(url.searchParams), platform: platform ? normalizePlatform(platform) : undefined, syncMode: mode, page, pageSize });
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
      const scope = scopeFromQuery(url);
      const run = await repo.getSyncRun(id, scope);
      if (!run) return json(res, 404, errorPayload('NOT_FOUND', 'sync run not found'));
      const rows = await repo.listSyncRunContents(id, { ...scope, accountId: run.account_id, sourceId: run.source_id, syncScope, after, limit });
      const nextAfter = rows.length ? Number(rows[rows.length - 1].sequence_no) : after;
      return json(res, 200, success(rows, { after, nextAfter, limit, hasMore: rows.length === limit }));
    }
    if (req.method === 'GET' && resource === 'sources') {
      const sources = await repo.listSources(url.searchParams.get('gameId') || undefined, {
        regionCode: url.searchParams.get('regionCode') || undefined,
        communityId: url.searchParams.get('communityId') || undefined,
        platform: url.searchParams.get('platform') ? parsePlatform(url.searchParams.get('platform')) : undefined
      });
      return json(res, 200, success(await Promise.all(sources.map(sourceWithAccount))));
    }
    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'credentials') { const account = await repo.getAccount(id); return account ? json(res, 200, success(await repo.getAccountCredentialSummary(id))) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts' && id && path[2] === 'sync-status') { const account = await repo.getAccount(id); const syncScope = url.searchParams.get('scope') || undefined; return account ? json(res, 200, success(syncScope && !PUBLIC_SYNC_SCOPES.has(syncScope) ? [] : await repo.getSyncStatus({ accountId: id, syncScope }))) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts' && id) { const account = await repo.getAccount(id); return account ? json(res, 200, success(account)) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'GET' && resource === 'accounts') return json(res, 200, success(await repo.listAccounts(Object.fromEntries(url.searchParams))));
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
        return json(res, 200, success(await repo.getOverview(parseOverviewQuery(url))));
      } catch (error) {
        if (error.code === 'INVALID_INPUT') return json(res, 400, errorPayload(error.code, error.message));
        throw error;
      }
    }
    if (req.method === 'POST' && resource === 'contents' && id && path[2] === 'reanalyze') {
      const scope = scopeFromQuery(url);
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
      const filters = Object.fromEntries(url.searchParams);
      const allowed = new Set(['regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'accountId', 'contentType', 'sentiment', 'analysisStatus', 'analysisLevel', 'keyword', 'postId', 'publishedFrom', 'publishedTo']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
      for (const key of ['publishedFrom', 'publishedTo']) if (filters[key]) { try { filters[key] = parsePublishedBoundary(filters[key], key); } catch (error) { return json(res, 400, errorPayload(error.code, error.message)); } }
      if (filters.publishedFrom && filters.publishedTo && filters.publishedFrom >= filters.publishedTo) return json(res, 400, errorPayload('INVALID_INPUT', 'publishedFrom must be earlier than publishedTo'));
      return json(res, 200, success(await repo.getContentStats(filters)));
    }
    if (req.method === 'GET' && resource === 'contents' && id && path.length === 2) {
      const scope = scopeFromQuery(url);
      const rows = await repo.getContentTree(id, { ...scope, includeDeleted: true });
      const content = rows.find(item => item.id === id);
      if (!content) return json(res, 404, errorPayload('NOT_FOUND', 'content not found'));
      const [analysisView] = await repo.listContents({ ...scope, keyword: null, page: 1, pageSize: 1, contentId: id });
      return json(res, 200, success({ content: analysisView || content, comments: rows.filter(item => item.id !== id) }));
    }
    if (req.method === 'GET' && resource === 'contents') {
      const filters = Object.fromEntries(url.searchParams);
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
      const item = await repo.getQualityContent(id, scopeFromQuery(url));
      return item ? json(res, 200, success(item)) : json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
    }
    if (req.method === 'GET' && resource === 'quality-contents') {
      const allowed = new Set(['page', 'pageSize', 'regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'recommendationType', 'reviewStatus', 'publishedFrom', 'publishedTo']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const page = Number(url.searchParams.get('page') || 1); const pageSize = Number(url.searchParams.get('pageSize') || 20);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const recommendationType = url.searchParams.get('recommendationType') || undefined; const reviewStatus = url.searchParams.get('reviewStatus') || undefined;
      if (recommendationType && !new Set(['home', 'pin', 'feature']).has(recommendationType)) return json(res, 400, errorPayload('INVALID_INPUT', 'recommendationType is not supported'));
      if (reviewStatus && !new Set(['pending', 'accepted', 'rejected']).has(reviewStatus)) return json(res, 400, errorPayload('INVALID_INPUT', 'reviewStatus is not supported'));
      const filters = { ...Object.fromEntries(url.searchParams), page, pageSize, recommendationType, reviewStatus };
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const [items, total] = await Promise.all([repo.listQualityContents(filters), repo.countQualityContents(filters)]);
      return json(res, 200, success(items, { page, pageSize, total, hasMore: page * pageSize < total }));
    }
    if (req.method === 'PATCH' && resource === 'quality-contents' && id) {
      const body = await readBody(req); const allowed = new Set(['homeReviewStatus', 'homeAdopted', 'pinReviewStatus', 'pinAdopted', 'featureReviewStatus', 'featureAdopted', 'reviewNote']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      if (!Object.keys(body || {}).length) return json(res, 400, errorPayload('INVALID_INPUT', 'quality candidate patch is empty'));
      for (const key of ['homeReviewStatus', 'pinReviewStatus', 'featureReviewStatus']) if (body[key] != null && !new Set(['pending', 'accepted', 'rejected']).has(body[key])) return json(res, 400, errorPayload('INVALID_INPUT', `${key} is not supported`));
      for (const key of ['homeAdopted', 'pinAdopted', 'featureAdopted']) if (body[key] != null && typeof body[key] !== 'boolean') return json(res, 400, errorPayload('INVALID_INPUT', `${key} must be boolean`));
      if (body.reviewNote != null && String(body.reviewNote).length > 1000) return json(res, 400, errorPayload('INVALID_INPUT', 'reviewNote is too long'));
      const current = await repo.getQualityContent(id, scopeFromQuery(url)); if (!current) return json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
      const normalizedPatch = { ...body };
      for (const prefix of ['home', 'pin', 'feature']) {
        const statusKey = `${prefix}ReviewStatus`; const adoptedKey = `${prefix}Adopted`;
        if (normalizedPatch[statusKey] != null && normalizedPatch[adoptedKey] == null) normalizedPatch[adoptedKey] = normalizedPatch[statusKey] === 'accepted';
        if (normalizedPatch[adoptedKey] != null && normalizedPatch[statusKey] == null) normalizedPatch[statusKey] = normalizedPatch[adoptedKey] ? 'accepted' : 'pending';
        const status = normalizedPatch[statusKey]; const adopted = normalizedPatch[adoptedKey];
        if (status != null && adopted != null && ((status === 'accepted') !== adopted)) return json(res, 400, errorPayload('INVALID_INPUT', `${prefix} review status and adopted value conflict`));
      }
      const updated = await repo.updateQualityCandidate(id, normalizedPatch, req.headers['x-admin-user'] || 'admin', scopeFromQuery(url));
      return updated ? json(res, 200, success(updated)) : json(res, 404, errorPayload('NOT_FOUND', 'quality content not found'));
    }

    if (req.method === 'GET' && resource === 'alerts' && !id) {
      const allowed = new Set(['page', 'pageSize', 'regionCode', 'gameId', 'communityId', 'sourceId', 'platform', 'status', 'severity']);
      for (const key of url.searchParams.keys()) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported query parameter: ${key}`));
      const page = Number(url.searchParams.get('page') || 1); const pageSize = Number(url.searchParams.get('pageSize') || 20);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return json(res, 400, errorPayload('INVALID_INPUT', 'page must be a positive integer and pageSize must be an integer from 1 to 100'));
      const status = url.searchParams.get('status'); const severity = url.searchParams.get('severity');
      if (status && !new Set(['pending', 'processing', 'resolved', 'false_positive']).has(status)) return json(res, 400, errorPayload('INVALID_INPUT', 'status is not supported'));
      if (severity && !new Set(['urgent', 'attention', 'normal']).has(severity)) return json(res, 400, errorPayload('INVALID_INPUT', 'severity is not supported'));
      const filters = { ...Object.fromEntries(url.searchParams), page, pageSize };
      if (filters.platform) filters.platform = parsePlatform(filters.platform);
      const items = await repo.listAlerts(filters);
      return json(res, 200, success(items, { page, pageSize, hasMore: items.length === pageSize }));
    }
    if (req.method === 'GET' && resource === 'alerts' && id) { const alert = await repo.getAlert(id, scopeFromQuery(url)); return alert ? json(res, 200, success(alert)) : json(res, 404, errorPayload('NOT_FOUND', 'alert not found')); }
    if (req.method === 'PATCH' && resource === 'alerts' && id) { let body = ''; for await (const chunk of req) body += chunk; const patch = body ? JSON.parse(body) : {}; const alert = await repo.updateAlert(id, patch, scopeFromQuery(url)); return alert ? json(res, 200, success(alert)) : json(res, 404, errorPayload('NOT_FOUND', 'alert not found')); }

    // ── A4 写接口：采集源配置 / 凭据 / 授权检测 / 手动采集 / 关键词规则 ──

    // 新增采集源：白名单校验 baseUrl 后落库；enabled 默认 0，需再配凭据+检测授权才启用。
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
      if (!body.gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'gameId is required'));
      if (!body.communityId) return json(res, 400, errorPayload('INVALID_INPUT', 'communityId is required'));
      const game = await repo.getGame(body.gameId);
      if (!game) return json(res, 400, errorPayload('GAME_NOT_FOUND', '归属游戏不存在或已删除'));
      try { await communityDirectory.requireEnabled({ communityId: body.communityId, gameId: body.gameId, regionCode: body.regionCode }); }
      catch (error) { if (!(normalizePlatform(body.platform) === 'taptap' && error.code === 'COMMUNITY_PROVIDER_NOT_CONFIGURED')) throw error; const mirror = await repo.getCommunityForGame(body.communityId, body.gameId, { enabledOnly: true }); if (!mirror || (body.regionCode && mirror.region_code !== body.regionCode)) return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在、与区域或游戏不匹配，或已停用')); }
      const platform = normalizePlatform(body.platform);
      if (!SOURCE_PLATFORMS.has(platform)) return json(res, 400, errorPayload('INVALID_PLATFORM', 'platform is not supported'));
      if (!body.displayName || !String(body.displayName).trim()) return json(res, 400, errorPayload('INVALID_INPUT', 'displayName is required'));
      const frequencySeconds = Number(body.frequencySeconds ?? 3600);
      if (!Number.isInteger(frequencySeconds) || frequencySeconds <= 0) return json(res, 400, errorPayload('INVALID_INPUT', 'frequencySeconds 须为正整数'));
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
        if (!body.apiToken && !body.password) return json(res, 400, errorPayload('INVALID_INPUT', 'apiToken or account password is required'));
        if (!body.apiToken) {
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
      if (platform === 'taptap') {
        const invalidAcc = validateTaptapAccountIds(body.accountIds);
        if (invalidAcc) return json(res, 400, errorPayload('INVALID_INPUT', invalidAcc));
        const invalidGrp = validateTaptapGroupIds(body.groupIds);
        if (invalidGrp) return json(res, 400, errorPayload('INVALID_INPUT', invalidGrp));
        taptapAccountIds = normalizeTaptapAccountIds(body.accountIds);
        taptapGroupIds = normalizeTaptapGroupIds(body.groupIds);
        if (!taptapAccountIds.length && !taptapGroupIds.length) return json(res, 400, errorPayload('INVALID_INPUT', 'TapTap 采集源必须配置至少一个监控账号 ID 或社区组 ID'));
      }
      const displayName = String(body.displayName).trim();
      const existing = await repo.findSourceByIdentity({ gameId: body.gameId, platform, displayName, communityId: body.communityId });
      let sourceId = crypto.randomUUID(); let accountId = crypto.randomUUID(); let legacyAccount = null;
      if (existing) {
        const accounts = await repo.listAccounts({ sourceId: existing.id });
        legacyAccount = accounts.find(account => String(account.platform_account_id || '').startsWith('legacy-source:')) || null;
        const config = parseConfig(existing.config);
        const adoptable = platform === 'bigplayer_h5' && legacyAccount && !String(config.baseUrl || '').trim() && existing.auth_status !== 'authorized' && !config.deleted;
        if (!adoptable) return json(res, 409, errorPayload('SOURCE_ALREADY_EXISTS', '同一游戏、平台和名称的采集源已存在', { sourceId: existing.id }));
        sourceId = existing.id; accountId = legacyAccount.id;
      }
      const credentialType = isSocialPlatform(platform) || (platform === 'bigplayer_h5' && !body.apiToken) ? 'account_password' : body.apiToken ? 'api_token' : null;
      const h5Account = String(body.account || '').trim();
      const plaintext = isSocialPlatform(platform)
        ? JSON.stringify(socialSecret(body))
        : credentialType === 'account_password'
          ? JSON.stringify({ countryCode: null, account: h5Account, password: String(body.password) })
          : body.apiToken ? String(body.apiToken) : null;
      const secretCipher = plaintext ? credentialCipher.encrypt(plaintext, process.env, { aad: credentialAad({ accountId, credentialType, platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' }) : null;
      const input = {
        sourceId, accountId, gameId: body.gameId, communityId: body.communityId, platform, sourceType: body.sourceType || (platform === 'bigplayer_h5' ? 'owned_community' : 'official_account'),
        displayName, baseUrl: String(body.apiUrl ?? body.baseUrl ?? '').trim(), startPaths: normalizeStartPaths(body.startPaths), board: body.board,
        postsApiUrl: body.postsApiUrl ? String(body.postsApiUrl).trim() : '', commentsApiUrl: body.commentsApiUrl ? String(body.commentsApiUrl).trim() : '',
        accountIds: taptapAccountIds,
        groupIds: taptapGroupIds,
        frequencySeconds, activeWindow: body.activeWindow,
        platformAccountId: body.platformAccountId ? String(body.platformAccountId).trim() : undefined,
        accountName: body.accountName || displayName, accountType: body.accountType || 'official', accountEnabled: true,
        authStatus: credentialType === 'account_password' ? 'pending_verification' : 'unconfigured', maskedLoginIdentifier: isSocialPlatform(platform) ? maskPhone(body.phone) : credentialType === 'account_password' ? maskLoginIdentifier(h5Account) : null,
        metadata: { syncMode, historyStart: body.historyStart || null }, credentialType, secretCipher
      };
      let created;
      try { created = legacyAccount ? await repo.adoptLegacySourceWithAccount(input) : await repo.createSourceWithAccount(input); }
      catch (error) { if (error.code === 'ER_DUP_ENTRY' || error.code === 'SOURCE_ALREADY_EXISTS') return json(res, 409, errorPayload('SOURCE_ALREADY_EXISTS', '同一游戏、平台和名称的采集源已存在')); throw error; }
      if (credentialType === 'account_password' && loginSessionClient.configured()) await loginSessionClient.bindAccount({ sourceId, accountId, platform, credentialRef: `credential:${accountId}:${credentialType}`, maskedPhone: isSocialPlatform(platform) ? maskPhone(body.phone) : maskLoginIdentifier(h5Account) });
      return json(res, legacyAccount ? 200 : 201, success(await sourceWithAccount(created.source), legacyAccount ? { adopted: true } : {}));
    }

    // 软删除采集源：config 打 deleted 标记，历史数据保留；列表与调度自动忽略。
    if (req.method === 'DELETE' && resource === 'sources' && id) {
      const ok = await repo.softDeleteSource(id);
      return ok ? json(res, 200, success({ deleted: true, id })) : json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
    }

    // H5 专用配置单请求：源、账号元数据和可选凭据在同一事务内提交。
    // TapTap 免登源复用该端点更新基础字段与监控账号 ID（accountIds），不接受凭据。
    if (req.method === 'PATCH' && resource === 'sources' && id && path[2] === 'configuration' && path.length === 3) {
      const body = await readBody(req);
      const allowed = new Set(['displayName', 'baseUrl', 'frequencySeconds', 'syncMode', 'historyStart', 'enabled', 'credential', 'accountIds', 'groupIds']);
      for (const key of Object.keys(body || {})) if (!allowed.has(key)) return json(res, 400, errorPayload('INVALID_INPUT', `unsupported field: ${key}`));
      const currentSource = await sourceById(id);
      if (!currentSource) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      if (currentSource.platform !== 'bigplayer_h5' && currentSource.platform !== 'taptap') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'source configuration endpoint is only for bigplayer_h5 and taptap'));
      for (const [key, message] of [['displayName', 'displayName is required']]) if (!String(body[key] ?? '').trim()) return json(res, 400, errorPayload('INVALID_INPUT', message));
      if (currentSource.platform === 'bigplayer_h5' && !String(body.baseUrl ?? '').trim()) return json(res, 400, errorPayload('INVALID_INPUT', 'baseUrl is required'));
      const frequencySeconds = Number(body.frequencySeconds);
      if (!Number.isInteger(frequencySeconds) || frequencySeconds <= 0) return json(res, 400, errorPayload('INVALID_INPUT', 'frequencySeconds 须为正整数'));
      if (!SYNC_MODES.has(body.syncMode)) return json(res, 400, errorPayload('INVALID_INPUT', 'syncMode must be incremental or backfill'));
      if (body.syncMode === 'backfill' && !body.historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '历史回溯必须填写 historyStart'));
      if (typeof body.enabled !== 'boolean') return json(res, 400, errorPayload('INVALID_INPUT', 'enabled must be boolean'));
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
        if (!taptapAccountIds.length && !taptapGroupIds.length) return json(res, 400, errorPayload('INVALID_INPUT', 'TapTap 采集源必须配置至少一个监控账号 ID 或社区组 ID'));
      }
      if (body.enabled && !currentSource.enabled) {
        await communityDirectory.requireEnabled({ communityId: currentSource.community_id, gameId: currentSource.game_id, regionCode: currentSource.region_code });
        await requireAuthorizedAccount(currentSource);
      }
      const invalidUrl = currentSource.platform === 'bigplayer_h5' ? validateBaseUrl('bigplayer_h5', body.baseUrl) : null;
      if (invalidUrl) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', invalidUrl));
      let encryptedCredential = null; let credential = null;
      if (body.credential != null && (typeof body.credential !== 'object' || Object.keys(body.credential).length > 0)) {
        if (!body.credential || typeof body.credential !== 'object') return json(res, 400, errorPayload('INVALID_INPUT', 'credential must be an object'));
        const type = body.credential.credentialType || (body.credential.account != null || body.credential.password != null ? 'account_password' : 'api_token');
        let plaintext;
        if (type === 'api_token') { if (body.credential.secret == null || !String(body.credential.secret).trim()) return json(res, 400, errorPayload('INVALID_INPUT', 'credential.secret is required')); plaintext = String(body.credential.secret); }
        else if (type === 'account_password') { const invalid = validateAccountPassword(body.credential); if (invalid) return json(res, 400, errorPayload('INVALID_CREDENTIALS', invalid)); plaintext = JSON.stringify({ countryCode: null, account: String(body.credential.account).trim(), password: String(body.credential.password) }); }
        else return json(res, 400, errorPayload('INVALID_INPUT', 'credentialType is not supported'));
        const account = await defaultAccountForSource(currentSource);
        if (!account) return json(res, 400, errorPayload('ACCOUNT_NOT_FOUND', '默认账号未配置'));
        credential = { credentialType: type };
        try { encryptedCredential = credentialCipher.encrypt(plaintext, process.env, { aad: credentialAad({ accountId: account.id, credentialType: type, platform: currentSource.platform }), kid: process.env.CREDENTIAL_ENC_KEY_ID || 'primary' }); }
        catch (error) { if (['CREDENTIAL_ENC_KEY_MISSING', 'CREDENTIAL_ENC_KEY_INVALID'].includes(error.code)) return json(res, 500, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝写入')); throw error; }
      }
      const updated = await repo.updateSourceConfiguration(id, { displayName: String(body.displayName).trim(), baseUrl: String(body.baseUrl).trim(), frequencySeconds, syncMode: body.syncMode, historyStart: body.historyStart || null, enabled: body.enabled, credential, credentialCipher: encryptedCredential, accountIds: taptapAccountIds, groupIds: taptapGroupIds });
      return json(res, 200, success(await sourceWithAccount(updated.source)));
    }

    if (req.method === 'PATCH' && resource === 'sources' && id) {
      const body = await readBody(req);
      const currentSource = await sourceById(id);
      if (!currentSource) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      const patch = {};
      if (body.enabled != null) { if (body.enabled && !currentSource.enabled) { await communityDirectory.requireEnabled({ communityId: currentSource.community_id, gameId: currentSource.game_id, regionCode: currentSource.region_code }); await requireAuthorizedAccount(currentSource); } patch.enabled = Boolean(body.enabled); }
      if (body.frequencySeconds != null) { if (!(Number(body.frequencySeconds) > 0)) return json(res, 400, errorPayload('INVALID_INPUT', 'frequencySeconds 须为正整数')); patch.frequencySeconds = Number(body.frequencySeconds); }
      if (body.activeWindow != null) patch.activeWindow = body.activeWindow;
      if (body.displayName != null) patch.displayName = body.displayName;
      if (body.baseUrl != null || body.apiUrl != null) {
        const source = currentSource;
        const nextUrl = body.apiUrl ?? body.baseUrl;
        const invalid = validateBaseUrl(source ? source.platform : body.platform, nextUrl);
        if (invalid) return json(res, 400, errorPayload('URL_OUTSIDE_ALLOWED_HOSTS', invalid));
        patch.baseUrl = String(nextUrl).trim();
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
      const credentialType = body.credentialType || 'api_token';
      if (credentialType === 'api_token' && (!body.secret || !String(body.secret).trim())) return json(res, 400, errorPayload('INVALID_INPUT', 'secret is required'));
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
          if (loginSessionClient.configured()) await loginSessionClient.bindAccount({ ...loginBinding(source, account), credentialRef: `credential:${account.id}:${credentialType}`, maskedPhone: masked });
          return json(res, 200, success({ credentialType, summary: accountPasswordSummary({ ...account, masked_login_identifier: masked }, { status: 'active', has_secret_cipher: true }) }));
        }
        const credential = await writeCredential(account.id, body, source.platform);
        return json(res, 200, success({ configured: true, credentialType: credential.credential_type, status: credential.status, expireAt: credential.expire_at || null }));
      } catch (error) { if (error.code === 'CREDENTIAL_ENC_KEY_MISSING' || error.code === 'CREDENTIAL_ENC_KEY_INVALID') return json(res, 500, errorPayload(error.code, '凭据加密密钥未正确配置（CREDENTIAL_ENC_KEY），已拒绝写入')); throw error; }
    }

    // 直登只通过主服务代理调用内部登录会话服务，前端不接触密码、Cookie 或 session 内容。
    if (resource === 'sources' && id && ['login-status', 'login', 'logout'].includes(path[2])) {
      const { source, account } = await socialSourceAccount(id);
      if (!source || !account) return json(res, 404, errorPayload('NOT_FOUND', 'source account not found'));
      if (!isSocialPlatform(source.platform) && source.platform !== 'bigplayer_h5') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'direct login is not supported for this platform'));
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
      const connector = connectors[source.platform]; const account = await defaultAccountForSource(source); let health;
      if (account && connector) health = await connector.accountHealth({ ...source, id: account.id, account_id: account.id });
      else health = connector && typeof connector.healthCheck === 'function' ? await connector.healthCheck(source) : { configured: false, authorized: false };
      const ok = account ? Boolean(health?.authorized) : Boolean(health?.configured); const authStatus = ok ? 'authorized' : 'unauthorized';
      await repo.updateSourceAuth(id, { authStatus }); if (account) await repo.updateAccount(account.id, { authStatus }); else await repo.updateCredentialCheck(id, { status: ok ? 'active' : 'failed', failureReason: ok ? null : (health.reason || 'connector not configured or missing credential') });
      return json(res, 200, success({ authStatus, reason: ok ? null : (health.reason || 'connector not configured') }));
    }
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'check-capabilities') {
      const source = await sourceById(id); if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      const connector = connectors[source.platform]; const account = await defaultAccountForSource(source); const installation = connector ? await connector.installationHealth(source) : { installed: false, capabilities: [] }; const health = account && connector ? await connector.accountHealth({ ...source, id: account.id, account_id: account.id }) : { authorized: false }; const capabilities = {};
      const detected = account && connector && typeof connector.detectCapabilities === 'function' ? await connector.detectCapabilities({ source: { ...source, id: account.id, account_id: account.id }, account, credentialContext }) : {};
      for (const scope of PUBLIC_SYNC_SCOPES) {
        const supported = connector?.hasSourceCapability ? connector.hasSourceCapability(scope, source) : connector?.hasCapability?.(scope);
        const detectedStatus = detected[scope]?.status;
        const value = !supported ? 'unsupported' : !health.authorized ? 'unauthorized' : detectedStatus === 'available' ? 'authorized_scope' : detectedStatus || 'configured';
        capabilities[scope] = value;
        await repo.upsertSourceCapability(source.id, scope, { status: value, detail: detected[scope] || {} });
      }
      return json(res, 200, success({ installed: Boolean(installation.installed), authorized: Boolean(health.authorized), reason: installation.reason || health.reason || null, capabilities }));
    }

    // 手动采集入队：仅入队不阻塞；未授权源 fail-closed 返回 UNAUTHORIZED。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'collect') {
      const source = await sourceById(id);
      if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      await requireEnabledCommunityForSource(source);
      try { await requireAuthorizedAccount(source); }
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

    // Source 级同步控制是默认账号的兼容入口；开始同步会原子启用源并入队，避免停用源的任务被 Worker 丢弃。
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'sync') {
      const source = await sourceById(id); if (!source) return json(res, 404, errorPayload('NOT_FOUND', 'source not found'));
      const account = await defaultAccountForSource(source); if (!account) return json(res, 400, errorPayload('ACCOUNT_NOT_FOUND', '默认账号未配置'));
      const action = path[3];
      const body = (action === 'reset' || !action) ? await readBody(req) : {};
      if (!action || action === 'resume' || action === 'reset') { await requireEnabledCommunityForSource(source); await requireAuthorizedAccount(source); }
      const rows = await repo.getSyncStatus({ accountId: account.id });
      if (action === 'pause') { for (const checkpoint of rows) if (checkpoint.status === 'running' || checkpoint.status === 'idle') await repo.pauseSyncCheckpoint(checkpoint.id); return json(res, 200, success({ paused: true, accountId: account.id })); }
      if ((action === 'resume' || action === 'reset') && !source.enabled) return json(res, 409, errorPayload('SOURCE_DISABLED', '采集源已停用，请先点击“开始同步”重新启用'));
      if (action === 'resume') { for (const checkpoint of rows) if (checkpoint.status === 'paused' || checkpoint.status === 'failed') await repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle' }); await repo.requestCollect(source.id); return json(res, 200, success({ queued: true, resumed: true, enabled: true, accountId: account.id })); }
      if (action === 'reset') {
        const metadata = parseConfig(account.metadata);
        const historyStart = body.historyStart || metadata.historyStart || metadata.history_start || null;
        if (!historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '授权范围全量回溯必须配置 historyStart'));
        const reset = await repo.resetSourceSync({
          sourceId: source.id,
          accountId: account.id,
          metadata: { ...metadata, syncMode: 'backfill', crawlScope: 'authorized_scope', historyStart },
          syncMode: 'backfill'
        });
        const run = reset.run;
        return json(res, 200, success({ queued: true, reset: true, enabled: reset.enabled, accountId: account.id, runId: run.id, mode: run.sync_mode, crawlScope: 'authorized_scope', status: run.status }));
      }
      const mode = body.mode || 'incremental';
      if (!['incremental', 'backfill'].includes(mode)) return json(res, 400, errorPayload('INVALID_INPUT', 'mode must be incremental or backfill'));
      const metadata = parseConfig(account.metadata);
      const historyStart = body.historyStart || metadata.historyStart || metadata.history_start || null;
      if (mode === 'backfill' && !historyStart) return json(res, 400, errorPayload('INVALID_INPUT', '历史回溯必须配置 historyStart'));
      let started;
      try { started = await repo.startSourceSync({ sourceId: source.id, accountId: account.id, metadata: { ...metadata, syncMode: mode, crawlScope: mode === 'backfill' ? 'authorized_scope' : (metadata.crawlScope || 'incremental'), ...(mode === 'backfill' ? { historyStart } : {}) }, syncMode: mode }); }
      catch (error) { if (error.code === 'COMMUNITY_DISABLED') return json(res, 409, errorPayload('COMMUNITY_DISABLED', '社区已停用，不能启动同步')); throw error; }
      const run = started.run;
      return json(res, 200, success({ queued: run.status === 'queued', enabled: started.enabled, runId: run.id, accountId: run.account_id, mode: run.sync_mode, status: run.status, reused: Boolean(started.reused) }));
    }
    if (req.method === 'POST' && resource === 'sources' && id && path[2] === 'oauth' && path[3] === 'start') {
      const source = await sourceById(id); const account = await defaultAccountForSource(source); if (!source || !account) return json(res, 404, errorPayload('NOT_FOUND', 'source account not found'));
      if (source.platform !== 'douyin') return json(res, 400, errorPayload('CAPABILITY_UNSUPPORTED', 'OAuth is not supported for this platform'));
      return json(res, 200, success({ authorizationUrl: douyinOAuth.createAuthorizationUrl({ accountId: account.id }).url }));
    }

    // 独立账号 API。
    if (req.method === 'POST' && resource === 'accounts' && !id) { const body = await readBody(req); if (!body.gameId || !body.sourceId || !body.platform || !body.platformAccountId || !body.accountName) return json(res, 400, errorPayload('INVALID_INPUT', 'gameId/sourceId/platform/platformAccountId/accountName are required')); const source = await sourceById(body.sourceId); if (!source || source.game_id !== body.gameId || source.platform !== body.platform) return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'account must belong to the specified source/game/platform')); return json(res, 201, success(await repo.createAccount(body))); }
    if (req.method === 'PATCH' && resource === 'accounts' && id) { const body = await readBody(req); const account = await repo.updateAccount(id, accountPatch(body)); return account ? json(res, 200, success(account)) : json(res, 404, errorPayload('NOT_FOUND', 'account not found')); }
    if (req.method === 'PUT' && resource === 'accounts' && id && path[2] === 'credential') {
      const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account not found'));
      const source = await sourceById(account.source_id); const body = await readBody(req);
      const credentialType = body.credentialType || (isSocialPlatform(account.platform) ? 'account_password' : 'api_token');
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
      const account = await repo.getAccount(id); const source = account && await sourceById(account.source_id); if (!account || !source) return json(res, 404, errorPayload('ACCOUNT_NOT_FOUND', 'account or source not found'));
      const body = await readBody(req); const binding = loginBinding(source, account);
      const result = body.poll ? await loginSessionClient.pollChallenge({ ...binding, challengeId: body.challengeId }) : await loginSessionClient.submitChallenge({ ...binding, challengeId: body.challengeId, answer: body.answer || body.code });
      await repo.updateAccount(id, { authStatus: result.status === 'active' ? 'authorized' : 'awaiting_manual_verification' });
      return json(res, 200, success(result));
    }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'check-auth') { const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('NOT_FOUND', 'account not found')); const source = await sourceById(account.source_id); const connector = connectors[account.platform]; const health = connector ? await connector.accountHealth({ ...source, id: account.id, account_id: account.id }) : { authorized: false, reason: 'connector not found' }; const authStatus = health.authorized ? 'authorized' : 'unauthorized'; await repo.updateAccount(id, { authStatus }); await repo.updateSourceAuth(account.source_id, { authStatus }); return json(res, 200, success({ authStatus, reason: health.reason || null })); }
    if (req.method === 'POST' && resource === 'accounts' && id && path[2] === 'sync') { const account = await repo.getAccount(id); if (!account) return json(res, 404, errorPayload('NOT_FOUND', 'account not found')); const source = await sourceById(account.source_id); if (!source || source.game_id !== account.game_id || source.platform !== account.platform) return json(res, 400, errorPayload('OWNERSHIP_MISMATCH', 'account source ownership is invalid')); const action = path[3]; if (!action || action === 'resume' || action === 'reset') { await requireEnabledCommunityForSource(source); await requireAuthorizedAccount(source); } const rows = await repo.getSyncStatus({ accountId: id }); if (action === 'pause') { for (const checkpoint of rows) await repo.pauseSyncCheckpoint(checkpoint.id); return json(res, 200, success({ paused: true })); } if (action === 'reset') { for (const checkpoint of rows) await repo.resetSyncCheckpoint({ accountId: id, syncScope: checkpoint.sync_scope, rootPlatformContentId: checkpoint.root_platform_content_id }); } if (action === 'resume' || action === 'reset' || !action) await repo.requestCollect(source.id); return json(res, 200, success({ queued: true, action: action || 'start' })); }
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
      const gameId = url.searchParams.get('gameId');
      const communityId = url.searchParams.get('communityId');
      const platform = parsePlatform(url.searchParams.get('platform'));
      if (!gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'gameId is required'));
      if (!platform) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is required'));
      if (communityId && !await repo.getCommunityForGame(communityId, gameId)) return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在或与游戏不匹配'));
      return json(res, 200, success(groupKeywordRules(await repo.listKeywordRulesRaw(gameId, communityId, platform))));
    }
    if (req.method === 'PUT' && resource === 'keyword-rules') {
      const body = await readBody(req);
      const platform = parsePlatform(body.platform);
      if (!body.gameId) return json(res, 400, errorPayload('INVALID_INPUT', 'gameId is required'));
      if (!platform) return json(res, 400, errorPayload('INVALID_INPUT', 'platform is required'));
      if (body.communityId) { try { await communityDirectory.requireEnabled({ communityId: body.communityId, gameId: body.gameId, regionCode: body.regionCode }); } catch (error) { if (error.code !== 'COMMUNITY_PROVIDER_NOT_CONFIGURED') throw error; const mirror = await repo.getCommunityForGame(body.communityId, body.gameId, { enabledOnly: true }); if (!mirror || (body.regionCode && mirror.region_code !== body.regionCode)) return json(res, 400, errorPayload('COMMUNITY_NOT_FOUND', '社区不存在、与区域或游戏不匹配，或已停用')); } }
      const groups = (body.groups || []).map(group => ({ ...group, platform }));
      const invalid = validateRuleGroups(groups);
      if (invalid) return json(res, 400, errorPayload('INVALID_RULES', invalid));
      const saved = await repo.replaceKeywordRules(body.gameId, body.communityId || null, flattenRuleGroups(body.gameId, body.communityId || null, groups), platform);
      return json(res, 200, success(groupKeywordRules(saved)));
    }

    return json(res, 501, errorPayload('ENDPOINT_PENDING', 'this endpoint is reserved for the next domain module'));
  } catch (error) {
    console.error(error.code || error.name || 'ERROR', error.message);
    const mapped = { INVALID_INPUT: 400, INVALID_JSON: 400, REQUEST_TOO_LARGE: 413, IMPORT_BATCH_TOO_LARGE: 413, UNAUTHORIZED: 401, IMPORT_NOT_CONFIGURED: 503, ACCOUNT_SCOPE_MISMATCH: 400, SOURCE_DISABLED: 409, INVALID_CONFIRMATION: 400, OWNERSHIP_MISMATCH: 400, NOT_FOUND: 404, ACCOUNT_NOT_FOUND: 404, COMMUNITY_NOT_FOUND: 400, RUN_ACTIVE: 409, SOURCE_ALREADY_EXISTS: 409, INVALID_CREDENTIALS: 400, LOGIN_CHALLENGE_REQUIRED: 409, LOGIN_CHALLENGE_INVALID: 400, LOGIN_SESSION_EXPIRED: 409, LOGIN_SERVICE_UNAVAILABLE: 503, LOGIN_SESSION_SERVICE_NOT_CONFIGURED: 503, LOGIN_SESSION_SERVICE_UNAVAILABLE: 503, LOGIN_SESSION_SERVICE_TIMEOUT: 504, LOGIN_STATE_UNKNOWN: 503, AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED: 409, AUTH_REFRESH_FAILED: 503, AUTH_REFRESH_ALREADY_RUNNING: 409, AUTH_REFRESH_CHALLENGE_REQUIRED: 409, COMMUNITY_PROVIDER_NOT_CONFIGURED: 503, COMMUNITY_PROVIDER_TIMEOUT: 504, COMMUNITY_PROVIDER_UNAVAILABLE: 503, COMMUNITY_PROVIDER_ERROR: 503, COMMUNITY_PROVIDER_INVALID_RESPONSE: 502, COMMUNITY_PROVIDER_UNKNOWN_GAME: 502, COMMUNITY_PROVIDER_REGION_MISMATCH: 502 };
    const status = error.code === '22P02' ? 400 : error.status || mapped[error.code] || credentialErrorStatus(error.code);
    const publicMessages = { LOGIN_SESSION_SERVICE_NOT_CONFIGURED: '登录会话服务未配置，请先配置授权服务', LOGIN_SESSION_SERVICE_UNAVAILABLE: '登录会话服务不可用，请检查 4310 服务', LOGIN_SESSION_SERVICE_TIMEOUT: '登录会话服务响应超时，请稍后重试', LOGIN_STATE_UNKNOWN: '登录页面状态暂未识别，请稍后重试或完成页面验证', AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED: '账号密码凭据未配置，请重新保存账号密码', AUTH_REFRESH_CHALLENGE_REQUIRED: '需要完成人工验证，请在授权工作区继续操作', COMMUNITY_PROVIDER_NOT_CONFIGURED: '社区 Provider 未配置，暂时无法开始同步' };
    const publicMessage = publicMessages[error.code] || (status >= 500 ? 'internal server error' : error.message);
    return json(res, status, errorPayload(error.code || 'INTERNAL_ERROR', publicMessage));
  }
}
const server = http.createServer((req, res) => handler(req, res).catch(error => json(res, 500, errorPayload('INTERNAL_ERROR', error.message))));
if (require.main === module) server.listen(port, () => console.log(`public-opinion-server listening on ${port}`));
module.exports = { server, connectors, ai, dingTalk, repo, communityProvider, communityDirectory, credentialContext, douyinOAuth, loginSessionClient, authRefreshCoordinator };
