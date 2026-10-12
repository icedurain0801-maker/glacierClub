'use strict';

// v019 preparation only. Real fetch/provider/DB are deliberately rejected.
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const monotonicNow = performance.now.bind(performance);
const ORIGIN = 'https://club-en.q1.com';
const LANGUAGES = ['2', '9', '16'];
const MAX_PER_SITE = 8;
const MAX_TOTAL = 24;
const REQUEST_TIMEOUT_MS = 10000;
const TOTAL_TIMEOUT_MS = 300000;
const ALLOWED_PATHS = [
  '/api/club/v1/login/token', '/api/club/v1/auth/user/context', '/api/club/v2/auth/board',
  '/api/club/v1/auth/post/list', '/api/club/v1/auth/post/activity/list', '/api/club/v1/auth/post/',
  '/api/club/v1/auth/comment/'
];
const QUERY_KEYS = Object.freeze({
  '/api/club/v1/login/token': ['token', 'sdkToken', 'gameId', 'gameVersion', 'languageId'],
  '/api/club/v1/auth/user/context': [], '/api/club/v2/auth/board': ['id'],
  '/api/club/v1/auth/post/list': ['boardId', 'sectionId', 'pageSize', 'offsetId', 'type'],
  '/api/club/v1/auth/post/activity/list': ['boardId', 'sectionId', 'pageSize', 'offsetId', 'type'],
  '/api/club/v1/auth/post/': ['postId', 'source']
});
const fail = code => { throw Object.assign(new Error(code), { code }); };
const hmac = value => crypto.createHmac('sha256', 'v019-observation-20261010').update(String(value)).digest('hex');
const TRUSTED_TRANSPORTS = new WeakSet();
function createInternalSyntheticTransport(options = {}) {
  const transport = async (url, request) => {
    await delay(options.transportDelayMs || 0, request.signal);
    if (options.hang) return new Promise(() => {});
    if (options.redirect) return { ok: true, status: 200, url: 'https://evil.example/redirect', redirected: false, json: async () => ({ code: 0, data: {} }) };
    const path = url.pathname;
    if (options.jsonHang) return { ok: true, status: 200, url: String(url), redirected: false, json: () => new Promise(() => {}) };
    let data;
    if (path.endsWith('/login/token')) data = { token: `site-token-${url.searchParams.get('languageId')}` };
    else if (path.endsWith('/user/context')) data = { gameBoards: [{ id: 100017 }] };
    else if (path.endsWith('/v2/auth/board')) data = { groups: [{ type: 0, sections: [{ id: 10, type: 1 }] }, { type: 1, sections: [{ id: 20, type: 2 }] }] };
    else if (path.endsWith('/post/list') || path.endsWith('/activity/list')) data = { items: [{ id: '1579706' }] };
    else if (path.endsWith('/post/')) data = { id: url.searchParams.get('postId') };
    else if (/^\/api\/club\/v1\/auth\/comment\/\d+$/.test(path)) data = { items: [{ id: '1' }] };
    else data = {};
    return { ok: true, status: 200, url: String(url), redirected: false, json: async () => { await delay(options.jsonDelayMs || 0, request.signal); return { code: 0, data }; } };
  };
  TRUSTED_TRANSPORTS.add(transport);
  return transport;
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('ABORTED'), { code: 'ABORTED' }));
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(Object.assign(new Error('ABORTED'), { code: 'ABORTED' })); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function fixtureData(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('FIXTURE_DATA_REQUIRED');
  const output = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) fail('FIXTURE_DATA_REQUIRED');
    const item = descriptor.value;
    if (['hang', 'jsonHang', 'redirect'].includes(key) && typeof item === 'boolean') output[key] = item;
    else if (['transportDelayMs', 'jsonDelayMs'].includes(key) && Number.isInteger(item) && item >= 0 && item <= 10000) output[key] = item;
    else fail('FIXTURE_DATA_REQUIRED');
  }
  return Object.freeze(output);
}

function assertFixtureSource(source) {
  if (!source || source.id !== 'SRC-A' || source.boardId !== '100017' || !Array.isArray(source.sites) || source.sites.length !== 3) fail('SOURCE_BINDING_REJECTED');
  const languages = source.sites.map(site => String(site.languageId));
  if (languages.join(',') !== LANGUAGES.join(',') || (source.sites.some(site => site.authStatus === 'unknown') && source.allowAuthProbe !== true)) fail('AUTH_UNKNOWN_HOLD');
  for (const site of source.sites) {
    if (site.enabled === false || !['authorized', 'unknown'].includes(site.authStatus)) fail('AUTH_STATE_REJECTED');
    if (site.origin !== ORIGIN || site.gameId !== '2177' || site.gameVersion !== '2177-US-ZS' || site.lang !== 'en-US') fail('SITE_BINDING_REJECTED');
  }
}

function safeRequest(url) {
  const parsed = new URL(url);
  const pathAllowed = ALLOWED_PATHS.includes(parsed.pathname) || parsed.pathname.startsWith('/api/club/v1/auth/comment/');
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.hash || !pathAllowed) fail('REQUEST_SCOPE_REJECTED');
  const basePath = parsed.pathname.startsWith('/api/club/v1/auth/comment/') ? '/api/club/v1/auth/comment/' : parsed.pathname;
  const allowedKeys = basePath === '/api/club/v1/auth/comment/' ? ['offsetId', 'pageSize', 'postId', 'commentId', 'sortType'] : QUERY_KEYS[basePath];
  if (!allowedKeys) fail('REQUEST_SCOPE_REJECTED');
  const query = {};
  for (const [key, value] of parsed.searchParams) {
    if (!allowedKeys.includes(key) || Object.hasOwn(query, key)) fail('REQUEST_SCOPE_REJECTED');
    if (/token|secret|password|cookie|authorization/i.test(key)) query[key] = '[REDACTED]';
    else query[key] = value;
  }
  if (basePath === '/api/club/v1/auth/comment/' && (!query.postId || !/^\d+$/.test(parsed.pathname.slice('/api/club/v1/auth/comment/'.length)) || parsed.pathname.slice('/api/club/v1/auth/comment/'.length) !== query.postId)) fail('REQUEST_SCOPE_REJECTED');
  return { origin: parsed.origin, path: basePath === '/api/club/v1/auth/comment/' ? '/api/club/v1/auth/comment/[ID]' : parsed.pathname, queryKeys: Object.keys(query).sort(), query };
}

function redactedLog(entry) {
  const path = entry.path.startsWith('/api/club/v1/auth/comment/') ? '/api/club/v1/auth/comment/[ID]' : entry.path;
  return { siteLanguageId: entry.siteLanguageId, requestNo: entry.requestNo, path, status: entry.status, providerCode: entry.providerCode, result: entry.result, idHmac: entry.idHmac, errorCode: entry.errorCode };
}

function dataSnapshot(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') fail('INPUT_DATA_REQUIRED');
    return value;
  }
  if (seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) fail('INPUT_DATA_REQUIRED');
  seen.add(value);
  const output = Array.isArray(value) ? [] : {};
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => !Object.hasOwn(descriptors[key], 'value'))) fail('INPUT_ACCESSOR_REJECTED');
  if (keys.some(key => typeof key !== 'string')) fail('INPUT_KEY_REJECTED');
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (Array.isArray(value) && key === 'length') continue;
    Object.defineProperty(output, key, { value: dataSnapshot(descriptor.value, seen), enumerable: true });
  }
  seen.delete(value);
  return Object.freeze(output);
}

async function run(input = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) fail('INPUT_DATA_REQUIRED');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowedKeys = ['mode', 'source', 'account', 'token', 'fixture', 'transport', 'totalTimeoutMs', 'requestTimeoutMs'];
  // Inspect every descriptor before reading any value or destructuring input.
  if (Reflect.ownKeys(descriptors).some(key => !Object.hasOwn(descriptors[key], 'value'))) fail('INPUT_ACCESSOR_REJECTED');
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowedKeys.includes(key))) fail('INPUT_KEY_REJECTED');
  const values = {};
  for (const key of allowedKeys) {
    if (Object.hasOwn(descriptors, key)) values[key] = key === 'transport' ? descriptors[key].value : dataSnapshot(descriptors[key].value);
  }
  const { mode, source, account, token, fixture = {}, transport: injectedTransport, totalTimeoutMs = TOTAL_TIMEOUT_MS, requestTimeoutMs = REQUEST_TIMEOUT_MS } = values;
  if (injectedTransport !== undefined) fail('SYNTHETIC_TRANSPORT_REQUIRED');
  if (mode !== 'isolated') fail('SYNTHETIC_TRANSPORT_REQUIRED');
  const transport = createInternalSyntheticTransport(fixtureData(fixture));
  assertFixtureSource(source);
  if (!account || account.sourceId !== source.id || typeof token !== 'string' || !token.trim()) fail('ACCOUNT_BINDING_REJECTED');
  const started = monotonicNow();
  const effectiveRequestTimeout = Number.isFinite(requestTimeoutMs) ? Math.max(1, Math.min(REQUEST_TIMEOUT_MS, requestTimeoutMs)) : REQUEST_TIMEOUT_MS;
  const effectiveTotalTimeout = Number.isFinite(totalTimeoutMs) ? Math.max(1, Math.min(TOTAL_TIMEOUT_MS, totalTimeoutMs)) : TOTAL_TIMEOUT_MS;
  const report = { status: 'NO_GO', sourceId: source.id, boardId: source.boardId, maxPerSite: MAX_PER_SITE, maxTotal: MAX_TOTAL, requestTimeoutMs: effectiveRequestTimeout, totalTimeoutMs: effectiveTotalTimeout, requests: [], sites: [], exchangeCount: 0, feedCount: 0 };
  const deadline = started + effectiveTotalTimeout;
  const sessions = new Map();
  const batchController = new AbortController();
  const batchTimer = setTimeout(() => batchController.abort(), effectiveTotalTimeout);
  let total = 0;
  const request = async (site, path, query, requestNo, phase) => {
    if (total >= MAX_TOTAL || report.requests.filter(row => row.siteLanguageId === site.languageId).length >= MAX_PER_SITE) fail('REQUEST_BUDGET_EXHAUSTED');
    if (batchController.signal.aborted || monotonicNow() >= deadline) fail('TOTAL_TIMEOUT');
    const url = new URL(path, ORIGIN); Object.entries(query || {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const safe = safeRequest(url.toString());
    const entry = { siteLanguageId: String(site.languageId), requestNo, path: safe.path, status: null, providerCode: null, result: phase, idHmac: null, errorCode: null };
    report.requests.push(entry); total++;
    const controller = new AbortController();
    const abortBatch = () => controller.abort();
    batchController.signal.addEventListener('abort', abortBatch, { once: true });
    const requestDeadline = Math.min(deadline, monotonicNow() + effectiveRequestTimeout);
    const remaining = () => Math.max(1, requestDeadline - monotonicNow());
    const timer = setTimeout(() => controller.abort(), remaining());
    let timeoutTimer;
    try {
      const timeout = new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(Object.assign(new Error('REQUEST_TIMEOUT'), { code: 'REQUEST_TIMEOUT' })), remaining()); });
      const response = await Promise.race([transport(url, { method: 'GET', redirect: 'manual', headers: { authorization: requestNo === 1 ? token : sessions.get(`${source.id}:${site.languageId}`) }, signal: controller.signal }), timeout]);
      if (!response || response.redirected || response.url && new URL(response.url).origin !== ORIGIN) fail('REDIRECT_REJECTED');
      entry.status = response.status;
      const payload = await Promise.race([response.json(), timeout]);
      if (monotonicNow() >= requestDeadline) fail('REQUEST_TIMEOUT');
      entry.providerCode = typeof payload?.code === 'number' ? payload.code : null;
      if (!response.ok || payload?.code !== 0) fail('PROVIDER_REJECTED');
      return payload.data;
    } catch (error) { entry.errorCode = error.code || (error.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'TRANSPORT_FAILED'); throw error; }
    finally { controller.abort(); batchController.signal.removeEventListener('abort', abortBatch); clearTimeout(timer); if (typeof timeoutTimer !== 'undefined') clearTimeout(timeoutTimer); }
  };
  try {
    for (const site of source.sites) {
      const key = `${source.id}:${site.languageId}`;
      const siteToken = await request(site, '/api/club/v1/login/token', { token, sdkToken: '', gameId: site.gameId, gameVersion: site.gameVersion, languageId: String(site.languageId) }, 1, 'tokenExchange');
      if (!siteToken?.token) fail('TOKEN_RESPONSE_INVALID');
      report.exchangeCount++; sessions.set(key, siteToken.token);
      const context = await request(site, '/api/club/v1/auth/user/context', {}, 2, 'context');
      if (!Array.isArray(context?.gameBoards) || !context.gameBoards.some(board => String(board.id) === source.boardId)) fail('BOARD_CONTEXT_MISMATCH');
      const board = await request(site, '/api/club/v2/auth/board', { id: source.boardId }, 3, 'board');
      if (site.authStatus === 'unknown' && source.allowAuthProbe === true) { report.sites.push({ languageId: String(site.languageId), status: 'AUTH_PROBE_ONLY', exchangeCount: 1, requestCount: report.requests.filter(row => row.siteLanguageId === String(site.languageId)).length }); continue; }
      const descriptors = Array.isArray(board?.groups) ? board.groups.flatMap(group => (group.sections || []).map(section => ({ sectionId: String(section.id), type: Number(section.type), endpoint: group.type === 0 ? '/api/club/v1/auth/post/list' : '/api/club/v1/auth/post/activity/list' }))) : [];
      if (!descriptors.length || descriptors.some(item => !item.sectionId || !Number.isInteger(item.type))) fail('BOARD_SCHEMA_UNKNOWN');
      const info = descriptors.find(item => item.endpoint.endsWith('/post/list'));
      const activity = descriptors.find(item => item.endpoint.endsWith('/activity/list'));
      for (const [descriptor, label] of [[info, 'info'], [activity, 'activity']]) {
        if (!descriptor) continue;
        const list = await request(site, descriptor.endpoint, { boardId: source.boardId, sectionId: descriptor.sectionId, pageSize: '1', offsetId: '0', type: String(descriptor.type) }, label === 'info' ? 4 : 5, label);
        const postId = list?.items?.[0]?.id; if (!postId) fail('FEED_SCHEMA_UNKNOWN'); report.feedCount++;
        if (label === 'info') {
          const detail = await request(site, '/api/club/v1/auth/post/', { postId: String(postId), source: '0' }, 6, 'detail');
          if (detail?.id != null && String(detail.id) !== String(postId)) fail('SCOPE_DRIFT');
          const comments = await request(site, `/api/club/v1/auth/comment/${encodeURIComponent(String(postId))}`, { offsetId: '0', pageSize: '1', postId: String(postId), sortType: '0' }, 7, 'comments');
          const commentId = comments?.items?.[0]?.id;
          if (commentId != null) await request(site, `/api/club/v1/auth/comment/${encodeURIComponent(String(postId))}`, { offsetId: '0', pageSize: '1', postId: String(postId), commentId: String(commentId), sortType: '0' }, 8, 'replies');
          report.requests.slice(-3).forEach(entry => { entry.idHmac = hmac(postId); });
        }
      }
      report.sites.push({ languageId: String(site.languageId), status: 'OBSERVED_BOUNDARDED', exchangeCount: 1, requestCount: report.requests.filter(row => row.siteLanguageId === String(site.languageId)).length });
    }
    report.status = 'ISOLATED_SYNTHETIC_PASS';
  } catch (error) { report.status = 'NO_GO'; report.errorCode = error.code || 'RUNNER_FAILED'; }
  finally { clearTimeout(batchTimer); batchController.abort(); for (const key of sessions.keys()) sessions.delete(key); }
  return { report, redactedLog: report.requests.map(redactedLog) };
}

module.exports = { run, safeRequest, assertFixtureSource, constants: { MAX_PER_SITE, MAX_TOTAL, REQUEST_TIMEOUT_MS, TOTAL_TIMEOUT_MS } };
