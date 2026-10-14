'use strict';
// Private shared fixture core. No real SQL, secrets or network capabilities.
const observation = (() => {
// Trusted fixture contract only. No DB, env loader, fetch, run or recovery proof.
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const now = performance.now.bind(performance);
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b', ORIGIN = 'https://club-en.q1.com';
const RESPONSE_LIMIT = 1024 * 1024, BATCH_LIMIT = 8 * RESPONSE_LIMIT;
const capabilities = new WeakMap();
const authProofs = new WeakMap();
const ENDPOINTS = Object.freeze({ exchange: '/api/club/v1/login/token', context: '/api/club/v1/auth/user/context', board: '/api/club/v2/auth/board',
  feed: '/api/club/v1/auth/post/list', activity: '/api/club/v1/auth/post/activity/list', detail: '/api/club/v1/auth/post/', comments: '/api/club/v1/auth/comment/[ID]', replies: '/api/club/v1/auth/comment/[ID]' });
const fail = code => { throw Object.assign(Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function snapshot(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (!value || typeof value !== 'object' || seen.has(value) || (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : Object.getPrototypeOf(value) !== Object.prototype)) fail('OBSERVATION_DATA_REQUIRED');
  seen.add(value); const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(ds), out = Array.isArray(value) ? [] : {};
  if (keys.some(k => !Object.hasOwn(ds[k], 'value'))) fail('OBSERVATION_ACCESSOR_REJECTED');
  if (keys.some(k => typeof k !== 'string')) fail('OBSERVATION_KEY_REJECTED');
  for (const k of keys) {
    if (Array.isArray(value)) { if (k === 'length') continue; if (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length) fail('OBSERVATION_KEY_REJECTED'); }
    Object.defineProperty(out, k, { value: snapshot(ds[k].value, seen), enumerable: true });
  }
  if (Array.isArray(value) && Object.keys(out).length !== value.length) fail('OBSERVATION_DATA_REQUIRED');
  seen.delete(value); return Object.freeze(out);
}
function exact(value, keys) { if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.split(' ').sort().join(',')) fail('OBSERVATION_KEY_REJECTED'); }
const version = v => Number.isSafeInteger(v) && v > 0;
function plan(mode) {
  if (!['auth-only', 'sample'].includes(mode)) fail('OBSERVATION_MODE_REJECTED');
  const phases = ['exchange', 'context', 'board', ...(mode === 'sample' ? ['feed', 'activity', 'detail', 'comments', 'replies'] : [])];
  return Object.freeze({ mode, phases: Object.freeze(phases), endpoints: ENDPOINTS, perSite: phases.length, total: phases.length * 3, requestLimitMs: 10000, batchLimitMs: 300000, responseLimitBytes: RESPONSE_LIMIT, batchLimitBytes: BATCH_LIMIT });
}
function planSha256(mode) { return sha(canonical(plan(mode))); }
function fixtureProjection(data) {
  const urlProjection = value => {
    const url = new URL(value), params = Object.fromEntries(url.searchParams), p = { origin: url.origin, path: url.pathname, params };
    return { ...p, hashKind: 'nonsecret-url-projection-v2', sha256: sha(canonical(p)) };
  };
  const projection = { scheduleVersion: String(data.versions.schedule), boardId: data.source.boardId, baseUrl: urlProjection(data.sites[0].url),
    sites: data.sites.map(s => ({ siteHmac: crypto.createHmac('sha256', 'd1-d2-d7-20261010').update(s.id).digest('hex'), url: urlProjection(s.url), enabled: s.enabled, authStatus: s.authStatus })),
    syncMode: null, historyStart: null, editionScope: null, startPathsCount: 0 };
  return { configProjection: projection, configProjectionSha256: sha(canonical(projection)) };
}
function validate(data) {
  exact(data, 'source account credentials sites versions manifestSha256 planSha256 mode allowUnknownAuthProbe configProjection configProjectionSha256');
  exact(data.source, 'id gameId communityId region platform boardId');
  exact(data.account, 'id sourceId gameId communityId enabled');
  exact(data.versions, 'source config schedule credential registry');
  const s = data.source, a = data.account;
  if (s.id !== SOURCE || s.boardId !== '100017' || s.region !== 'overseas' || s.platform !== 'bigplayer_h5'
    || !/^[a-zA-Z0-9-]{1,64}$/.test(s.gameId) || !/^[a-zA-Z0-9-]{1,64}$/.test(s.communityId)
    || !/^[a-zA-Z0-9-]{1,64}$/.test(a.id) || a.sourceId !== s.id || a.gameId !== s.gameId || a.communityId !== s.communityId || a.enabled !== true
    || !Object.values(data.versions).every(version) || !/^[a-f0-9]{64}$/.test(data.manifestSha256)
    || data.planSha256 !== planSha256(data.mode) || typeof data.allowUnknownAuthProbe !== 'boolean') fail('OBSERVATION_IDENTITY_REJECTED');
  if (!Array.isArray(data.credentials) || data.credentials.length !== 1) fail('OBSERVATION_CREDENTIAL_REJECTED');
  const c = data.credentials[0]; exact(c, 'id sourceId accountId gameId communityId type status expiresAt version');
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(c.id) || c.sourceId !== s.id || c.accountId !== a.id || c.gameId !== s.gameId || c.communityId !== s.communityId
    || c.type !== 'api_token' || c.status !== 'active' || c.version !== data.versions.credential || typeof c.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) <= Date.now()) fail('OBSERVATION_CREDENTIAL_REJECTED');
  if (!Array.isArray(data.sites) || data.sites.length !== 3) fail('OBSERVATION_SITE_REJECTED');
  const ids = new Set();
  data.sites.forEach((site, index) => {
    exact(site, 'id url urlSha256 registryUrl registryUrlSha256 enabled authStatus registryVersion');
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(site.id) || ids.has(site.id) || site.enabled !== true || site.registryVersion !== data.versions.registry
      || site.registryUrl !== site.url || site.urlSha256 !== sha(site.url) || site.registryUrlSha256 !== site.urlSha256) fail('OBSERVATION_SITE_REJECTED');
    ids.add(site.id); let url; try { url = new URL(site.url); } catch { fail('OBSERVATION_SITE_REJECTED'); }
    const expected = { env: 'web', gameId: '2177', gameVersion: '2177-US-ZS', lang: 'en-US', languageId: String([2, 9, 16][index]) };
    if (url.origin !== ORIGIN || url.pathname !== '/' || url.username || url.password || url.hash || url.port
      || [...url.searchParams].length !== 5 || Object.entries(expected).some(([k, v]) => url.searchParams.getAll(k).length !== 1 || url.searchParams.get(k) !== v)) fail('OBSERVATION_SITE_REJECTED');
    if (!['authorized', 'unknown'].includes(site.authStatus) || (site.authStatus === 'unknown' && (data.mode !== 'auth-only' || !data.allowUnknownAuthProbe))) fail('OBSERVATION_AUTH_HOLD');
  });
  const projection = fixtureProjection(data);
  if (data.configProjectionSha256 !== projection.configProjectionSha256 || canonical(data.configProjection) !== canonical(projection.configProjection)) fail('OBSERVATION_PROJECTION_REJECTED');
}
function issueFixtureIdentity(input) {
  const data = snapshot(input); validate(data);
  const capability = Object.freeze(Object.create(null)), nonce = crypto.randomBytes(16).toString('hex');
  capabilities.set(capability, { data, nonce, key: crypto.randomBytes(32), deadline: now() + 300000, consumed: false });
  return capability;
}
function issueProductionIdentity() { fail('REAL_IDENTITY_ISSUANCE_DISABLED'); }
function check(capability) {
  const record = capabilities.get(capability);
  if (!record || record.consumed || now() >= record.deadline) fail('OBSERVATION_CAPABILITY_REJECTED');
  validate(record.data); return record;
}
function runtimeOptions(value) {
  const o = snapshot(value), allowed = ['requestTimeoutMs', 'totalTimeoutMs', 'faults'];
  if (Object.keys(o).some(k => !allowed.includes(k))) fail('OBSERVATION_KEY_REJECTED');
  for (const k of ['requestTimeoutMs', 'totalTimeoutMs']) if (Object.hasOwn(o, k) && (!Number.isInteger(o[k]) || o[k] < 1)) fail('OBSERVATION_DATA_REQUIRED');
  const faults = o.faults || [];
  if (!Array.isArray(faults)) fail('OBSERVATION_DATA_REQUIRED');
  const keys = ['atRequest', 'status', 'redirect', 'transportDelayMs', 'chunkDelayMs', 'hangTransport', 'hangBody', 'invalidUtf8', 'malformedJson', 'paddingBytes', 'chunkSizeBytes', 'wrongScope', 'encoding', 'requestFault'];
  const seen = new Set();
  for (const f of faults) {
    if (!f || Array.isArray(f) || Object.keys(f).some(k => !keys.includes(k)) || !Number.isInteger(f.atRequest) || f.atRequest < 1 || f.atRequest > 24 || seen.has(f.atRequest)) fail('OBSERVATION_DATA_REQUIRED');
    seen.add(f.atRequest);
    for (const k of ['redirect', 'hangTransport', 'hangBody', 'invalidUtf8', 'malformedJson', 'wrongScope']) if (Object.hasOwn(f, k) && typeof f[k] !== 'boolean') fail('OBSERVATION_DATA_REQUIRED');
    for (const k of ['transportDelayMs', 'chunkDelayMs', 'paddingBytes', 'chunkSizeBytes', 'status']) if (Object.hasOwn(f, k) && (!Number.isInteger(f[k]) || f[k] < 0)) fail('OBSERVATION_DATA_REQUIRED');
    if ((f.transportDelayMs || 0) > 10000 || (f.chunkDelayMs || 0) > 10000 || (f.paddingBytes || 0) > RESPONSE_LIMIT + 1
      || (Object.hasOwn(f, 'chunkSizeBytes') && (f.chunkSizeBytes < 1 || f.chunkSizeBytes > 65536))
      || (Object.hasOwn(f, 'status') && ![200, 302, 401, 403, 429, 500].includes(f.status))
      || (Object.hasOwn(f, 'encoding') && !['identity', 'gzip'].includes(f.encoding))
      || (Object.hasOwn(f, 'requestFault') && !['token', 'cross-site-token', 'query', 'duplicate-query', 'path', 'descriptor'].includes(f.requestFault))) fail('OBSERVATION_DATA_REQUIRED');
  }
  return { requestTimeoutMs: Math.min(o.requestTimeoutMs || 10000, 10000), totalTimeoutMs: Math.min(o.totalTimeoutMs || 300000, 300000), faults };
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(t); signal.removeEventListener('abort', stop); reject(Object.assign(Error('OBSERVATION_TOTAL_TIMEOUT'), { code: 'OBSERVATION_TOTAL_TIMEOUT' })); };
    const t = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
  });
}
function requestDescriptor(site, phase, session, readerRoot) {
  const url = new URL(ENDPOINTS[phase].replace('[ID]', session?.postId || ''), ORIGIN);
  const parameters = new URL(site.url).searchParams, root = readerRoot || 'synthetic-root-' + site.id;
  const query = phase === 'exchange' ? { token: root, sdkToken: '', gameId: parameters.get('gameId'), gameVersion: parameters.get('gameVersion'), languageId: parameters.get('languageId') }
    : phase === 'context' ? {} : phase === 'board' ? { id: '100017' }
      : ['feed', 'activity'].includes(phase) ? { boardId: '100017', sectionId: session.schema.find(d => d.kind === phase)?.sectionId, pageSize: '1', offsetId: '0', type: session.schema.find(d => d.kind === phase)?.type }
        : phase === 'detail' ? { postId: session.postId, source: '0' }
          : { postId: session.postId, offsetId: '0', pageSize: '1', sortType: '0', ...(phase === 'replies' ? { commentId: session.commentId } : {}) };
  if (Object.values(query).some(v => typeof v !== 'string')) fail('OBSERVATION_SCHEMA_REJECTED');
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return Object.freeze({ method: 'GET', url: url.toString(), redirect: 'manual', authorization: phase === 'exchange' ? root : session.token });
}
function consumeSyntheticRequest(request, expected, site, phase, readerRoot) {
  if (request.authorization !== (phase === 'exchange' ? readerRoot || 'synthetic-root-' + site.id : 'synthetic-only-' + site.id)) fail('OBSERVATION_SESSION_REJECTED');
  if (canonical(request) !== canonical(expected)) fail('OBSERVATION_REQUEST_PLAN_REJECTED');
  // The internal simulated transport consumes exact authorization and URL;
  // no request descriptor or secret-bearing object is returned to the caller.
}
async function runFixture(capability, observedIdentity, options = {}) {
  const record = check(capability), observed = snapshot(observedIdentity);
  if (canonical(observed) !== canonical(record.data)) fail('OBSERVATION_IDENTITY_DRIFT');
  const o = runtimeOptions(options), contract = plan(record.data.mode);
  o.requestTimeoutMs = Math.min(o.requestTimeoutMs, record.requestTimeoutMs || 10000);
  record.requestTimeoutMs = o.requestTimeoutMs;
  record.consumed = true;
  const controller = new AbortController(), start = now(), deadline = Math.min(record.deadline, start + o.totalTimeoutMs);
  record.deadline = deadline;
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - now()));
  const report = { kind: 'FIXTURE_IDENTITY_STREAM_EVIDENCE', mode: contract.mode, status: 'NO_GO', nonce: record.nonce, requests: [],
    exchangeCount: 0, feedCount: 0, readBytes: record.priorReadBytes || 0, cancelledReaders: 0, releasedReaders: 0, requestTimeoutMs: o.requestTimeoutMs, totalTimeoutMs: o.totalTimeoutMs,
    realHttpExecuted: false, productionActivationAllowed: false };
  const sessions = new Map(record.priorSessions || []);
  const priorRequests = record.priorSessions ? 9 : 0;
  report.priorAuthRequests = priorRequests;
  try {
    for (const site of record.data.sites) for (const phase of (priorRequests ? contract.phases.slice(3) : contract.phases)) {
      if (controller.signal.aborted || now() >= deadline || Date.parse(record.data.credentials[0].expiresAt) <= Date.now()) fail('OBSERVATION_TOTAL_TIMEOUT');
      const n = report.requests.length + 1 + priorRequests;
      if (record.binding) await record.binding.verify(n);
      if (n > contract.total || report.requests.filter(r => r.siteHmac === siteHmac(site.id)).length + (priorRequests ? 3 : 0) >= contract.perSite) fail('OBSERVATION_BUDGET_REJECTED');
      const f = o.faults.find(x => x.atRequest === n) || {}, reqDeadline = Math.min(deadline, now() + o.requestTimeoutMs);
      const row = { slot: n, phase, endpoint: ENDPOINTS[phase], siteHmac: siteHmac(site.id), status: null, readBytes: 0 }, requestStart = now(); report.requests.push(row);
      let reader, requestTimer, abort;
      const timed = new Promise((_, reject) => {
        abort = () => reject(Object.assign(Error('OBSERVATION_TOTAL_TIMEOUT'), { code: 'OBSERVATION_TOTAL_TIMEOUT' }));
        controller.signal.addEventListener('abort', abort, { once: true });
        requestTimer = setTimeout(() => reject(Object.assign(Error('OBSERVATION_REQUEST_TIMEOUT'), { code: 'OBSERVATION_REQUEST_TIMEOUT' })), Math.max(1, reqDeadline - now()));
      });
      const bounded = async promise => {
        if (controller.signal.aborted || now() >= reqDeadline) fail(now() >= deadline ? 'OBSERVATION_TOTAL_TIMEOUT' : 'OBSERVATION_REQUEST_TIMEOUT');
        const result = await Promise.race([promise, timed]);
        if (controller.signal.aborted || now() >= reqDeadline) fail(now() >= deadline ? 'OBSERVATION_TOTAL_TIMEOUT' : 'OBSERVATION_REQUEST_TIMEOUT');
        return result;
      };
      try {
        if (phase === 'exchange') report.exchangeCount++;
        else if (!sessions.has(site.id) || sessions.get(site.id).siteId !== site.id) fail('OBSERVATION_SESSION_REJECTED');
        const session = sessions.get(site.id);
        if (['feed', 'activity'].includes(phase) && !session?.schema) fail('OBSERVATION_SCHEMA_REJECTED');
        if (['detail', 'comments', 'replies'].includes(phase) && !session?.postId) fail('OBSERVATION_SCHEMA_REJECTED');
        if (phase === 'replies' && !session?.commentId) fail('OBSERVATION_SCHEMA_REJECTED');
        const root = record.binding ? record.binding.root() : null;
        const expectedRequest = requestDescriptor(site, phase, session, root), request = { ...expectedRequest };
        if (f.requestFault === 'token') request.authorization = 'wrong';
        if (f.requestFault === 'cross-site-token') request.authorization = 'synthetic-only-another-site';
        if (f.requestFault && !['token', 'cross-site-token'].includes(f.requestFault)) {
          const url = new URL(request.url);
          if (f.requestFault === 'query') url.searchParams.set('unknown', '1');
          if (f.requestFault === 'duplicate-query') url.searchParams.append([...url.searchParams.keys()][0] || 'unknown', '1');
          if (f.requestFault === 'path') url.pathname += '/extra';
          if (f.requestFault === 'descriptor') url.searchParams.set('sectionId', '999');
          request.url = url.toString();
        }
        consumeSyntheticRequest(request, expectedRequest, site, phase, root);
        if (record.binding) record.binding.started(n, phase);
        await bounded(f.hangTransport ? new Promise(() => {}) : wait(f.transportDelayMs || 0, controller.signal));
        row.status = f.status || 200;
        if (f.redirect || row.status === 302) fail('OBSERVATION_REDIRECT_REJECTED');
        if (row.status !== 200) fail('OBSERVATION_HTTP_REJECTED');
        if (f.encoding && f.encoding !== 'identity') fail('OBSERVATION_ENCODING_REJECTED');
        const token = 'synthetic-only-' + site.id;
        const payload = { phase, boardId: f.wrongScope ? 'wrong' : '100017', siteId: site.id,
          ...(phase === 'exchange' ? { token } : {}), ...(phase === 'board' ? { feeds: [{ kind: 'feed', sectionId: '10', type: '1' }, { kind: 'activity', sectionId: '20', type: '2' }] } : {}),
          ...(phase === 'feed' || phase === 'activity' ? { items: [{ id: '1579706' }] } : {}), ...(phase === 'detail' ? { postId: session.postId } : {}),
          ...(phase === 'comments' || phase === 'replies' ? { rootId: session.postId, items: [{ id: '1' }] } : {}) };
        const prefix = Buffer.from(f.malformedJson ? '{bad' : JSON.stringify(payload).slice(0, -1) + ',"padding":"');
        const suffix = Buffer.from(f.malformedJson ? '' : '"}');
        const padding = f.paddingBytes || 0, total = prefix.length + padding + suffix.length, chunkSize = f.chunkSizeBytes || 65536;
        let offset = 0, stopped = false;
        const stream = new ReadableStream({ async pull(c) {
          if (f.hangBody) return new Promise(() => {});
          if (f.chunkDelayMs) await wait(f.chunkDelayMs, controller.signal);
          if (stopped) return;
          if (offset === total) { c.close(); return; }
          const end = Math.min(total, offset + chunkSize), bytes = new Uint8Array(end - offset);
          for (let j = offset; j < end; j++) bytes[j - offset] = j < prefix.length ? prefix[j] : j < prefix.length + padding ? 32 : suffix[j - prefix.length - padding];
          if (f.invalidUtf8 && offset === 0) bytes[0] = 255;
          offset = end; c.enqueue(bytes);
        }, cancel() { stopped = true; } });
        reader = stream.getReader(); const chunks = [];
        while (true) {
          const chunk = await bounded(reader.read()); if (chunk.done) break;
          row.readBytes += chunk.value.byteLength; report.readBytes += chunk.value.byteLength;
          if (row.readBytes > RESPONSE_LIMIT) fail('OBSERVATION_RESPONSE_BYTES_EXCEEDED');
          if (report.readBytes > BATCH_LIMIT) fail('OBSERVATION_BATCH_BYTES_EXCEEDED');
          chunks.push(chunk.value);
        }
        let parsed;
        try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { fail('OBSERVATION_JSON_REJECTED'); }
        if (controller.signal.aborted || now() >= reqDeadline) fail('OBSERVATION_REQUEST_TIMEOUT');
        if (parsed.phase !== phase || parsed.siteId !== site.id || parsed.boardId !== '100017') fail('OBSERVATION_SCOPE_REJECTED');
        if (phase === 'exchange') { if (parsed.token !== token) fail('OBSERVATION_SESSION_REJECTED'); sessions.set(site.id, { siteId: site.id, token: parsed.token }); }
        if (phase === 'board') { if (!Array.isArray(parsed.feeds) || parsed.feeds.length !== 2) fail('OBSERVATION_SCHEMA_REJECTED'); session.schema = parsed.feeds; }
        if (phase === 'feed' || phase === 'activity') { if (!/^\d+$/.test(parsed.items?.[0]?.id || '')) fail('OBSERVATION_SCHEMA_REJECTED'); session.postId = parsed.items[0].id; }
        if (phase === 'detail' && parsed.postId !== session.postId) fail('OBSERVATION_SCOPE_REJECTED');
        if (phase === 'comments' || phase === 'replies') { if (parsed.rootId !== session.postId || !/^\d+$/.test(parsed.items?.[0]?.id || '')) fail('OBSERVATION_SCOPE_REJECTED'); if (phase === 'comments') session.commentId = parsed.items[0].id; }
        if (phase === 'feed' || phase === 'activity') report.feedCount++;
        row.summarySha256 = sha(canonical({ phase, boardId: parsed.boardId, shape: Object.keys(parsed).filter(k => k !== 'token' && k !== 'padding').sort() }));
        row.responseShape = Object.keys(parsed).filter(k => k !== 'token' && k !== 'padding').sort();
      } finally {
        clearTimeout(requestTimer); controller.signal.removeEventListener('abort', abort);
        if (reader) { await reader.cancel(); report.cancelledReaders++; reader.releaseLock(); report.releasedReaders++; }
        row.elapsedMs = Math.round(now() - requestStart);
      }
    }
    report.status = 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS';
    if (contract.mode === 'auth-only') {
      record.authSessions = [...sessions].map(([id, value]) => [id, { ...value }]);
      record.priorReadBytes = report.readBytes;
    }
  } catch (e) { controller.abort(); report.errorCode = /^(OBSERVATION|READER|INTEGRATION)_[A-Z_]+$/.test(e.code || '') ? e.code : 'OBSERVATION_INTERNAL_FAILED'; }
  finally { clearTimeout(timer); sessions.clear(); }
  return report;
  function siteHmac(id) { return crypto.createHmac('sha256', record.key).update(id).digest('hex'); }
}
async function probeFixtureIdentity(capability, observedIdentity, options = {}) {
  const record = check(capability);
  if (record.data.mode !== 'auth-only') fail('OBSERVATION_MODE_REJECTED');
  const report = await runFixture(capability, observedIdentity, options);
  if (report.status !== 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS' || report.requests.length !== 9 || report.feedCount !== 0) return { report, proof: null };
  const proof = Object.freeze(Object.create(null)); authProofs.set(proof, { record, used: false });
  return { report, proof };
}
function convertFixtureProbeToSample(proof, observedIdentity) {
  const entry = authProofs.get(proof);
  if (!entry || entry.used || now() >= entry.record.deadline || canonical(snapshot(observedIdentity)) !== canonical(entry.record.data)) fail('OBSERVATION_AUTH_PROOF_REJECTED');
  validate(entry.record.data); entry.used = true;
  const data = snapshot({ ...entry.record.data, mode: 'sample', planSha256: planSha256('sample'), allowUnknownAuthProbe: false,
    sites: entry.record.data.sites.map(site => ({ ...site, authStatus: 'authorized' })) });
  // This private temporary authorization is only within a fixture batch.
  // Registry observations stay unchanged, and no production signer accepts it.
  const authorized = snapshot({ ...data, ...fixtureProjection(data) });
  validate(authorized);
  const handle = Object.freeze(Object.create(null));
  capabilities.set(handle, { ...entry.record, data: authorized, consumed: false, probeSnapshot: entry.record.data, priorSessions: entry.record.authSessions });
  return Object.freeze({ capability: handle, observedFixture: authorized, productionActivationAllowed: false });
}
return { issueFixtureIdentity, issueProductionIdentity, runFixture, probeFixtureIdentity, convertFixtureProbeToSample, planSha256, fixtureProjection,
  constants: Object.freeze({ SOURCE, RESPONSE_LIMIT, BATCH_LIMIT }), internal: { capabilities, authProofs, snapshot, runtimeOptions, check, validate } };
})();
const reader = (() => {
// Parameterized SQL contract evaluated only by an internal data fixture driver.
// No mysql driver, connection, production secret, cipher decryptor or env loader.
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const identity = observation;
const now = performance.now.bind(performance), records = new WeakMap(), secrets = new WeakMap();
const fail = code => { throw Object.assign(Error(code), { code }); };
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const SQL = Object.freeze({
  R1: 'SELECT @@port AS port,@@server_id AS server_id,VERSION() AS version,DATABASE() AS database_name,UTC_TIMESTAMP(3) AS now_utc',
  R2: 'SELECT id,game_id,community_id,platform,enabled,auth_status,auth_expire_at,default_account_id,schedule_version,config,updated_at FROM po_sources WHERE id=? LIMIT 2',
  R3: 'SELECT id,source_id,game_id,community_id,platform,enabled,auth_status,auth_expire_at,updated_at FROM po_accounts WHERE source_id=? ORDER BY id',
  R4: "SELECT id,source_id,account_id,credential_type,status,expire_at,last_checked_at,updated_at,(secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS has_cipher,(secret_ref IS NOT NULL AND secret_ref<>'') AS has_ref FROM po_credentials WHERE source_id=? AND account_id=? AND credential_type=? ORDER BY id",
  R5: 'SELECT id,source_id,site_id,url,url_hash,enabled,auth_status,capabilities,last_checked_at,updated_at FROM po_source_sites WHERE source_id=? ORDER BY site_id',
  R6: 'SELECT id,region_code,enabled FROM po_games WHERE id=? LIMIT 2',
  R7: 'SELECT id,game_id,status FROM po_communities WHERE id=? LIMIT 2',
  R8: 'SELECT id,source_id,account_id,credential_type,status,expire_at,updated_at,secret_cipher FROM po_credentials WHERE id=? AND source_id=? AND account_id=? AND credential_type=? AND status=? AND (expire_at IS NULL OR expire_at>UTC_TIMESTAMP(3)) LIMIT 2',
  V1: `SELECT @@port AS port,@@server_id AS server_id,VERSION() AS version,DATABASE() AS database_name,UTC_TIMESTAMP(3) AS now_utc,
    s.id AS source_id,s.game_id,s.community_id,s.platform,s.enabled AS source_enabled,s.auth_status AS source_auth_status,s.auth_expire_at AS source_expire_at,s.default_account_id,s.updated_at AS source_updated_at,s.schedule_version,s.config,
    a.id AS account_id,a.source_id AS account_source_id,a.game_id AS account_game_id,a.community_id AS account_community_id,a.platform AS account_platform,a.enabled AS account_enabled,a.auth_status AS account_auth_status,a.auth_expire_at,a.updated_at AS account_updated_at,
    c.id AS credential_id,c.source_id AS credential_source_id,c.account_id AS credential_account_id,c.credential_type,c.status AS credential_status,c.expire_at,c.updated_at AS credential_updated_at,SHA2(c.secret_cipher,256) AS internal_cipher_sha256,
    st.id AS registry_id,st.source_id AS registry_source_id,st.site_id,st.url,st.url_hash,st.enabled AS site_enabled,st.auth_status AS site_auth_status,st.capabilities,st.last_checked_at AS site_checked_at,st.updated_at AS site_updated_at,
    g.region_code,g.enabled AS game_enabled,cm.game_id AS community_game_id,cm.status AS community_status,
    (SELECT COUNT(*) FROM po_credentials cx WHERE cx.source_id=s.id AND cx.account_id=a.id AND cx.credential_type='api_token' AND cx.status='active' AND (cx.expire_at IS NULL OR cx.expire_at>UTC_TIMESTAMP(3))) AS active_credential_count
    FROM po_sources s JOIN po_accounts a ON a.source_id=s.id JOIN po_credentials c ON c.source_id=s.id AND c.account_id=a.id
    JOIN po_source_sites st ON st.source_id=s.id JOIN po_games g ON g.id=s.game_id JOIN po_communities cm ON cm.id=s.community_id
    WHERE s.id=? AND a.id=? AND c.id=? AND c.credential_type=? ORDER BY st.site_id LIMIT 4`
});
const COLUMNS = Object.freeze({ R1: 'port server_id version database_name now_utc', R2: 'id game_id community_id platform enabled auth_status auth_expire_at default_account_id schedule_version config updated_at',
  R3: 'id source_id game_id community_id platform enabled auth_status auth_expire_at updated_at', R4: 'id source_id account_id credential_type status expire_at last_checked_at updated_at has_cipher has_ref',
  R5: 'id source_id site_id url url_hash enabled auth_status capabilities last_checked_at updated_at', R6: 'id region_code enabled', R7: 'id game_id status', R8: 'id source_id account_id credential_type status expire_at updated_at secret_cipher',
  V1: 'port server_id version database_name now_utc source_id game_id community_id platform source_enabled source_auth_status source_expire_at default_account_id source_updated_at schedule_version config account_id account_source_id account_game_id account_community_id account_platform account_enabled account_auth_status auth_expire_at account_updated_at credential_id credential_source_id credential_account_id credential_type credential_status expire_at credential_updated_at internal_cipher_sha256 registry_id registry_source_id site_id url url_hash site_enabled site_auth_status capabilities site_checked_at site_updated_at region_code game_enabled community_game_id community_status active_credential_count' });
function data(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (!value || typeof value !== 'object' || seen.has(value) || (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : Object.getPrototypeOf(value) !== Object.prototype)) fail('READER_DATA_REQUIRED');
  seen.add(value); const ds = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(ds), out = Array.isArray(value) ? [] : {};
  if (keys.some(k => typeof k !== 'string' || !Object.hasOwn(ds[k], 'value'))) fail('READER_DATA_REQUIRED');
  for (const key of keys) {
    if (Array.isArray(value)) { if (key === 'length') continue; if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) fail('READER_DATA_REQUIRED'); }
    Object.defineProperty(out, key, { value: data(ds[key].value, seen), enumerable: true });
  }
  if (Array.isArray(value) && Object.keys(out).length !== value.length) fail('READER_DATA_REQUIRED');
  seen.delete(value); return Object.freeze(out);
}
const canonical = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function rows(r, key) {
  const d = r.identity, c = d.credentials[0], stamp = '2026-10-10T00:00:00.000Z';
  const target = r.fixture.target || { port: 3306, server_id: 1, version: '10.4.14-MariaDB', database_name: 'public_opinion', now_utc: new Date().toISOString() };
  const rawConfig = { boardId: d.source.boardId, baseUrl: d.sites[0].url, siteUrls: d.sites.map(s => s.url), syncMode: null, historyStart: null, editionScope: null, startPaths: [] };
  const source = { id: d.source.id, game_id: d.source.gameId, community_id: d.source.communityId, platform: 'bigplayer_h5', enabled: 1,
    auth_status: 'authorized', auth_expire_at: null, default_account_id: d.account.id, schedule_version: d.versions.schedule, config: canonical(rawConfig), updated_at: stamp };
  const account = a => ({ id: a.id, source_id: a.sourceId, game_id: a.gameId, community_id: a.communityId, platform: 'bigplayer_h5', enabled: a.enabled ? 1 : 0, auth_status: 'authorized', auth_expire_at: null, updated_at: stamp });
  const credential = { id: c.id, source_id: c.sourceId, account_id: c.accountId, credential_type: c.type, status: c.status, expire_at: c.expiresAt, last_checked_at: stamp, updated_at: stamp, has_cipher: 1, has_ref: 0 };
  const sites = d.sites.map(s => ({ id: 'fixture-registry-' + s.id, source_id: d.source.id, site_id: s.id, url: s.registryUrl, url_hash: s.registryUrlSha256, enabled: s.enabled ? 1 : 0, auth_status: s.authStatus, capabilities: '{}', last_checked_at: stamp, updated_at: stamp }));
  if (key === 'R1') return [target]; if (key === 'R2') return [source]; if (key === 'R3') return r.fixture.accountRows.map(account);
  if (key === 'R4') return [credential]; if (key === 'R5') return sites;
  if (key === 'R6') return [{ id: d.source.gameId, region_code: 'overseas', enabled: 1 }]; if (key === 'R7') return [{ id: d.source.communityId, game_id: d.source.gameId, status: 'enabled' }];
  if (key === 'R8') return [{ id: c.id, source_id: c.sourceId, account_id: c.accountId, credential_type: c.type, status: c.status, expire_at: c.expiresAt, updated_at: stamp, secret_cipher: canonical(r.fixture.cipherEnvelope) }];
  if (key === 'V1') return sites.map(site => ({ ...target,
    source_id: source.id, game_id: source.game_id, community_id: source.community_id, platform: source.platform,
    source_enabled: source.enabled, source_auth_status: source.auth_status, source_expire_at: source.auth_expire_at, default_account_id: source.default_account_id, source_updated_at: stamp, schedule_version: source.schedule_version, config: source.config,
    account_id: d.account.id, account_source_id: d.account.sourceId, account_game_id: d.account.gameId,
    account_community_id: d.account.communityId, account_platform: 'bigplayer_h5', account_enabled: 1, account_auth_status: 'authorized', auth_expire_at: null, account_updated_at: stamp,
    credential_id: c.id, credential_source_id: c.sourceId, credential_account_id: c.accountId, credential_type: c.type,
    credential_status: c.status, expire_at: c.expiresAt, credential_updated_at: stamp, internal_cipher_sha256: r.fingerprint,
    registry_id: site.id, registry_source_id: site.source_id, site_id: site.site_id, url: site.url, url_hash: site.url_hash, site_enabled: site.enabled, site_auth_status: site.auth_status,
    capabilities: site.capabilities, site_checked_at: site.last_checked_at, site_updated_at: stamp,
    region_code: 'overseas', game_enabled: 1, community_game_id: d.source.gameId, community_status: 'enabled', active_credential_count: Date.parse(c.expiresAt) > Date.parse(target.now_utc) ? 1 : 0 }));
  fail('READER_SCHEMA_REJECTED');
}
function validateRows(key, value) {
  if (!Array.isArray(value) || !value.length || value.length > (['R3', 'R4', 'R5', 'V1'].includes(key) ? 4 : 1)) fail('READER_SCHEMA_REJECTED');
  if (COLUMNS[key] && value.some(row => Object.keys(row).sort().join(' ') !== COLUMNS[key].split(' ').sort().join(' '))) fail('READER_SCHEMA_REJECTED');
  if (key === 'R1' && (value[0].port !== 3306 || value[0].server_id !== 1 || value[0].version !== '10.4.14-MariaDB' || value[0].database_name !== 'public_opinion' || !Number.isFinite(Date.parse(value[0].now_utc)))) fail('READER_TARGET_REJECTED');
}
function releaseSecret(r) { if (r.secretHandle) secrets.delete(r.secretHandle); r.secretHandle = null; r.fixture = null; r.fingerprint = null; }
function close(r) { r.stopped = true; r.inTransaction = false; if (!r.destroyed) r.trace.push('DESTROY'); r.destroyed = true; releaseSecret(r); }
async function query(r, key, params) {
  const d = r.identity, c = d.credentials[0];
  const expectedParams = { R1: [], R2: [d.source.id], R3: [d.source.id], R4: [d.source.id, d.account.id, 'api_token'], R5: [d.source.id],
    R6: [d.source.gameId], R7: [d.source.communityId], R8: [c.id, d.source.id, d.account.id, 'api_token', 'active'], V1: [d.source.id, d.account.id, c.id, 'api_token'] };
  if (r.stopped || now() >= r.deadline || !SQL[key] || canonical(params) !== canonical(expectedParams[key])) { close(r); fail('READER_CONNECTION_STOPPED'); }
  if (++r.selects > r.limit) { close(r); fail('READER_SELECT_BUDGET'); }
  r.trace.push({ key, sql: SQL[key], parameterCount: params.length });
  const fault = r.faults.find(f => f.atSelect === r.selects) || {};
  if (fault.schemaMismatch) { close(r); fail('READER_SCHEMA_REJECTED'); }
  let timer;
  try {
    await Promise.race([fault.hang ? new Promise(() => {}) : new Promise(resolve => { timer = setTimeout(resolve, fault.delayMs || 0); }),
      new Promise((_, reject) => { r.queryTimer = setTimeout(() => reject(Object.assign(Error('READER_QUERY_TIMEOUT'), { code: 'READER_QUERY_TIMEOUT' })), Math.max(1, Math.min(r.queryTimeoutMs, r.deadline - now()))); })]);
    if (now() >= r.deadline) { close(r); fail('READER_BATCH_TIMEOUT'); }
    const expected = rows(r, key);
    const answer = expected.map((row, index) => index === 0 && fault.rowPatch ? { ...row, ...fault.rowPatch } : row);
    validateRows(key, answer);
    if (canonical(answer) !== canonical(expected)) fail('READER_BINDING_DRIFT');
    return answer;
  } catch (error) {
    // mysql2 promise has no proven cancellation contract. On timeout/error the
    // contract destroys the dedicated connection and never reconnects/retries.
    r.cancelFailed = Boolean(fault.cancelFails); close(r); throw error;
  } finally { clearTimeout(timer); clearTimeout(r.queryTimer); }
}
async function transaction(r, work) {
  if (r.stopped || r.inTransaction) fail('READER_CONNECTION_STOPPED');
  r.trace.push('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION READ ONLY'); r.inTransaction = true;
  try { return await work(); }
  finally { if (!r.destroyed) { r.trace.push('ROLLBACK'); r.inTransaction = false; } }
}
async function prepareFixtureReader(input, integrationBudget) {
  const f = data(input), allowed = ['identity', 'accountRows', 'cipherEnvelope', 'faults', 'queryTimeoutMs', 'totalTimeoutMs', 'target'];
  if (Object.keys(f).some(k => !allowed.includes(k)) || !f.identity || !Array.isArray(f.accountRows) || !Array.isArray(f.faults || [])) fail('READER_DATA_REQUIRED');
  identity.issueFixtureIdentity(f.identity); // validates full fixture identity; grants no production read
  if (f.accountRows.length !== 1 || canonical(f.accountRows[0]) !== canonical(f.identity.account)) fail('READER_ACCOUNT_SELECTION_HOLD');
  const envelope = f.cipherEnvelope;
  if (!integrationBudget?.metadataOnly && (!envelope || envelope.fixture !== true || Object.keys(envelope).some(k => !['fixture', 'apiToken', 'refreshToken'].includes(k))
    || envelope.apiToken !== 'synthetic-reader-api-token' || (Object.hasOwn(envelope, 'refreshToken') && envelope.refreshToken !== 'synthetic-reader-refresh-token'))) fail('READER_SYNTHETIC_CIPHER_REQUIRED');
  for (const field of ['queryTimeoutMs', 'totalTimeoutMs']) if (Object.hasOwn(f, field) && (!Number.isInteger(f[field]) || f[field] < 1)) fail('READER_DATA_REQUIRED');
  for (const fault of f.faults || []) if (!fault || Object.keys(fault).some(k => !['atSelect', 'hang', 'delayMs', 'cancelFails', 'schemaMismatch', 'rowPatch'].includes(k))
    || !Number.isInteger(fault.atSelect) || fault.atSelect < 1 || fault.atSelect > 32
    || (Object.hasOwn(fault, 'delayMs') && (!Number.isInteger(fault.delayMs) || fault.delayMs < 0 || fault.delayMs > 10000))
    || ['hang', 'cancelFails', 'schemaMismatch'].some(k => Object.hasOwn(fault, k) && typeof fault[k] !== 'boolean')
    || (Object.hasOwn(fault, 'rowPatch') && (!fault.rowPatch || Array.isArray(fault.rowPatch) || typeof fault.rowPatch !== 'object'))) fail('READER_DATA_REQUIRED');
  if (new Set((f.faults || []).map(f => f.atSelect)).size !== (f.faults || []).length) fail('READER_DATA_REQUIRED');
  const r = { fixture: f, identity: f.identity, fingerprint: envelope ? sha(canonical(envelope)) : null, selects: 0, limit: f.identity.mode === 'sample' ? 32 : 17,
    trace: [], faults: f.faults || [], queryTimeoutMs: Math.min(f.queryTimeoutMs || 1000, 1000), deadline: now() + Math.min(f.totalTimeoutMs || 300000, 300000), stopped: false, destroyed: false, secretLoaded: false };
  if (integrationBudget) { r.deadline = Math.min(r.deadline, integrationBudget.deadline); r.limit = integrationBudget.limit; }
  const source = identity.constants.SOURCE, a = f.identity.account, c = f.identity.credentials[0];
  const handle = Object.freeze(Object.create(null)); records.set(handle, r);
  try {
    await transaction(r, async () => { for (const [key, params] of [['R1', []], ['R2', [source]], ['R3', [source]], ['R4', [source, a.id, 'api_token']], ['R5', [source]], ['R6', [a.gameId]], ['R7', [a.communityId]]]) {
      const result = await query(r, key, params); r.metadataRows = { ...(r.metadataRows || {}), [key]: result };
    } });
    return { capability: handle, metadata: publicMetadata(r) };
  } catch (error) { close(r); throw Object.assign(Error(error.code || 'READER_FAILED'), { code: error.code || 'READER_FAILED', evidence: evidence(r) }); }
}
function publicMetadata(r) { return Object.freeze({ mode: r.identity.mode, sourceAlias: 'SRC-A', siteCount: 3, configProjectionSha256: r.identity.configProjectionSha256,
  manifestSha256: r.identity.manifestSha256, planSha256: r.identity.planSha256, productionActivationAllowed: false }); }
function get(handle) {
  const r = records.get(handle);
  if (!r || r.stopped) fail('READER_CAPABILITY_REJECTED');
  if (now() >= r.deadline) { close(r); fail('READER_CAPABILITY_REJECTED'); }
  return r;
}
async function loadFixtureSecret(handle) {
  const r = get(handle); if (r.secretLoaded) fail('READER_SECRET_ALREADY_LOADED');
  const d = r.identity, c = d.credentials[0];
  const cipherRows = await transaction(r, () => query(r, 'R8', [c.id, d.source.id, d.account.id, 'api_token', 'active']));
  if (cipherRows.length !== 1 || cipherRows[0].id !== c.id || cipherRows[0].source_id !== d.source.id || cipherRows[0].account_id !== d.account.id
    || cipherRows[0].credential_type !== 'api_token' || cipherRows[0].status !== 'active' || Date.parse(cipherRows[0].expire_at) <= Date.now()) { close(r); fail('READER_CREDENTIAL_REJECTED'); }
  r.fingerprint = sha(cipherRows[0].secret_cipher);
  // The synthetic envelope may include refresh material, which has necessarily
  // been read in the encrypted row; only apiToken is retained by private capability.
  const secret = Object.freeze(Object.create(null)); secrets.set(secret, { r, apiToken: r.fixture.cipherEnvelope.apiToken });
  r.secretHandle = secret;
  r.secretLoaded = true; return secret;
}
async function verifyFixtureDispatch(handle, secret, observedIdentity, observedEnvelope) {
  const r = get(handle), s = secrets.get(secret);
  if (!s || s.r !== r || !r.secretLoaded) fail('READER_SECRET_CAPABILITY_REJECTED');
  if (Date.parse(r.identity.credentials[0].expiresAt) <= Date.now()) { close(r); fail('READER_CREDENTIAL_REJECTED'); }
  const observed = data(observedIdentity), envelope = data(observedEnvelope);
  if (canonical(observed) !== canonical(r.identity) || sha(canonical(envelope)) !== r.fingerprint) { close(r); fail('READER_BINDING_DRIFT'); }
  const d = r.identity, c = d.credentials[0];
  const verified = await transaction(r, () => query(r, 'V1', [d.source.id, d.account.id, c.id, 'api_token']));
  if (verified.length !== 3 || verified.some(row => row.port !== 3306 || row.server_id !== 1 || row.database_name !== 'public_opinion'
    || row.internal_cipher_sha256 !== r.fingerprint || row.active_credential_count !== 1
    || !Number.isFinite(Date.parse(row.now_utc)) || Date.parse(row.expire_at) <= Date.parse(row.now_utc)
    || (row.auth_expire_at !== null && Date.parse(row.auth_expire_at) <= Date.parse(row.now_utc))
    || (row.source_expire_at !== null && Date.parse(row.source_expire_at) <= Date.parse(row.now_utc)))) { close(r); fail('READER_BINDING_DRIFT'); }
  return Object.freeze({ verifiedFixture: true, selectCount: r.selects, productionActivationAllowed: false });
}
function evidence(r) { return { kind: 'FIXTURE_READER_CONTRACT', selectCount: r.selects, limit: r.limit, stopped: r.stopped, destroyed: r.destroyed,
  cancelFailed: Boolean(r.cancelFailed), reconnectCount: 0, trace: r.trace, secretLoaded: r.secretLoaded, realSqlExecuted: false, realSecretRead: false, productionActivationAllowed: false }; }
function finishFixtureReader(handle) { const r = records.get(handle); if (!r) fail('READER_CAPABILITY_REJECTED'); if (!r.stopped) { r.stopped = true; r.trace.push('END'); } releaseSecret(r); return evidence(r); }
function prepareProductionReader() { fail('REAL_READER_DISABLED'); }
return { prepareFixtureReader, loadFixtureSecret, verifyFixtureDispatch, finishFixtureReader, prepareProductionReader, sqlContract: SQL, schemaContract: COLUMNS, internal: { records, secrets, data, close, get } };
})();
const { internal: observationInternal, ...observationApi } = observation;
const { internal: readerInternal, ...readerApi } = reader;
// Public wrappers cannot supply the private integration budget argument.
readerApi.prepareFixtureReader = input => reader.prepareFixtureReader(input);
const integrationCapabilities = new WeakMap();
function issueFixtureIntegration(input) {
  const f = observationInternal.snapshot(input);
  if (!f || Object.keys(f).some(k => !['reader', 'observation', 'targetMode'].includes(k)) || !['sample', 'auth-only'].includes(f.targetMode)) throw Object.assign(Error('INTEGRATION_INPUT_REJECTED'), { code: 'INTEGRATION_INPUT_REJECTED' });
  observationInternal.validate(f.reader.identity);
  const opts = observationInternal.runtimeOptions(f.observation || {});
  const deadline = require('node:perf_hooks').performance.now() + Math.min(opts.totalTimeoutMs, f.reader.totalTimeoutMs || 300000);
  const capability = Object.freeze(Object.create(null));
  integrationCapabilities.set(capability, { f, opts, deadline, used: false });
  return capability;
}
async function runFixtureIntegration(capability) {
  const state = integrationCapabilities.get(capability);
  const error = code => Object.assign(Error(code), { code });
  if (!state || state.used) throw error('INTEGRATION_CAPABILITY_REJECTED');
  state.used = true;
  const { f, opts, deadline } = state;
  const events = [], reports = []; let handle, secret, observationHandle, proof;
  let transportCount = 0, attemptedSlot = 0, rootConsumptions = 0, readerEvidence;
  const observationHandles = [];
  const result = { kind: 'FIXTURE_INTEGRATION_EVIDENCE', status: 'NO_GO', targetMode: f.targetMode, realSqlExecuted: false, realSecretRead: false, realHttpExecuted: false, productionActivationAllowed: false };
  try {
    if (require('node:perf_hooks').performance.now() >= deadline) throw error('INTEGRATION_BATCH_TIMEOUT');
    const prepared = await reader.prepareFixtureReader(f.reader, { deadline, limit: f.targetMode === 'sample' ? 32 : 17 }); handle = prepared.capability;
    secret = await reader.loadFixtureSecret(handle);
    const r = readerInternal.records.get(handle);
    const binding = {
      async verify(slot) {
        attemptedSlot = slot; events.push({ slot, event: 'V1_START' });
        await reader.verifyFixtureDispatch(handle, secret, f.reader.identity, f.reader.cipherEnvelope);
        if (r.trace.at(-1) !== 'ROLLBACK' || require('node:perf_hooks').performance.now() >= deadline) throw error('INTEGRATION_BATCH_TIMEOUT');
        events.push({ slot, event: 'V1_VERIFIED_ROLLBACK' });
      },
      root() {
        const value = readerInternal.secrets.get(secret);
        if (!value || value.r !== r || r.stopped) throw error('INTEGRATION_SECRET_REJECTED');
        return value.apiToken;
      },
      started(slot, phase) { transportCount++; if (phase === 'exchange') rootConsumptions++; events.push({ slot, event: 'TRANSPORT_START' }); }
    };
    observationHandle = observation.issueFixtureIdentity(f.reader.identity); observationHandles.push(observationHandle);
    const record = observationInternal.capabilities.get(observationHandle); record.deadline = deadline; record.binding = binding;
    if (f.reader.identity.mode === 'auth-only') {
      const auth = await observation.probeFixtureIdentity(observationHandle, f.reader.identity, opts); reports.push(auth.report); proof = auth.proof;
      if (!proof) throw error(auth.report.errorCode || 'INTEGRATION_AUTH_FAILED');
      if (f.targetMode === 'sample') {
        const converted = observation.convertFixtureProbeToSample(proof, f.reader.identity); observationHandle = converted.capability; observationHandles.push(observationHandle);
        const sample = await observation.runFixture(observationHandle, converted.observedFixture, opts); reports.push(sample);
        if (sample.status !== 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS') throw error(sample.errorCode || 'INTEGRATION_SAMPLE_FAILED');
      }
    } else {
      if (f.targetMode !== 'sample') throw error('INTEGRATION_PLAN_REJECTED');
      const sample = await observation.runFixture(observationHandle, f.reader.identity, opts); reports.push(sample);
      if (sample.status !== 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS') throw error(sample.errorCode || 'INTEGRATION_SAMPLE_FAILED');
    }
    result.status = 'ISOLATED_FIXTURE_INTEGRATION_PASS';
  } catch (e) {
    result.errorCode = /^(OBSERVATION|READER|INTEGRATION)_[A-Z_]+$/.test(e.code || '') ? e.code : 'INTEGRATION_INTERNAL_FAILED';
    if (handle) readerInternal.close(readerInternal.records.get(handle));
    else if (e.evidence) readerEvidence = e.evidence;
  } finally {
    if (handle) readerEvidence = reader.finishFixtureReader(handle);
    for (const issued of observationHandles) {
      const record = observationInternal.capabilities.get(issued);
      if (record) { record.authSessions = null; record.priorSessions = null; record.binding = null; record.key = null; record.data = null; record.probeSnapshot = null; }
      observationInternal.capabilities.delete(issued);
    }
    if (proof) {
      const entry = observationInternal.authProofs.get(proof);
      if (entry) { entry.record.authSessions = null; entry.record.binding = null; entry.record.key = null; entry.record.data = null; }
      observationInternal.authProofs.delete(proof);
    }
    state.f = null; state.opts = null; integrationCapabilities.delete(capability);
  }
  return { ...result, attemptedSlot, transportCount, rootConsumptions, events, reports, reader: readerEvidence, privateReferencesReleased: true };
}
function runProductionIntegration() { throw Object.assign(Error('REAL_INTEGRATION_DISABLED'), { code: 'REAL_INTEGRATION_DISABLED' }); }
async function runFixtureMetadataProbe(input) {
  const f = observationInternal.snapshot(input);
  if (!f || Object.keys(f).some(k => !['identity', 'accountRows', 'faults', 'queryTimeoutMs', 'totalTimeoutMs', 'target'].includes(k))) throw Object.assign(Error('METADATA_INPUT_REJECTED'), { code: 'METADATA_INPUT_REJECTED' });
  const deadline = require('node:perf_hooks').performance.now() + Math.min(f.totalTimeoutMs || 300000, 300000);
  const { capability } = await reader.prepareFixtureReader(f, { deadline, limit: 7, metadataOnly: true });
  try {
    const r = readerInternal.records.get(capability), m = r.metadataRows;
    return { kind: 'FIXTURE_METADATA_DISCOVERY', sourceId: m.R2[0].id, accountId: m.R3[0].id, credentialId: m.R4[0].id,
      registry: m.R5.map(row => ({ registryId: row.id, siteId: row.site_id, urlSha256: row.url_hash, authStatus: row.auth_status })),
      configProjectionSha256: f.identity.configProjectionSha256, approvalForSecretRead: false, realSqlExecuted: false,
      evidence: reader.finishFixtureReader(capability) };
  } finally { reader.finishFixtureReader(capability); }
}
function runProductionMetadataProbe() { throw Object.assign(Error('REAL_METADATA_PROBE_DISABLED'), { code: 'REAL_METADATA_PROBE_DISABLED' }); }
module.exports = { observation: Object.freeze(observationApi), reader: Object.freeze(readerApi), issueFixtureIntegration, runFixtureIntegration, runProductionIntegration, runFixtureMetadataProbe, runProductionMetadataProbe };
