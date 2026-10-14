'use strict';
// Private narrow row/SQL validation copied from the frozen contract; simulator only.
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const SQL = Object.freeze({
  R1: 'SELECT @@port AS port,@@server_id AS server_id,VERSION() AS version,DATABASE() AS database_name,UTC_TIMESTAMP(3) AS now_utc',
  R2: "SELECT id,game_id,community_id,platform,enabled,auth_status,auth_expire_at,default_account_id,schedule_version,updated_at,JSON_UNQUOTE(JSON_EXTRACT(config,'$.boardId')) AS board_id FROM po_sources WHERE id=? LIMIT 2",
  R3: "SELECT id,source_id,game_id,community_id,platform,enabled,auth_status,auth_expire_at,updated_at FROM po_accounts WHERE source_id=? AND enabled=1 AND auth_status='authorized' AND (auth_expire_at IS NULL OR auth_expire_at>UTC_TIMESTAMP(3)) ORDER BY id LIMIT 2",
  R4: "SELECT id,source_id,account_id,credential_type,status,expire_at,last_checked_at,updated_at,(secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS has_cipher,(secret_ref IS NOT NULL AND secret_ref<>'') AS has_ref FROM po_credentials WHERE source_id=? AND account_id=? AND credential_type=? AND status='active' AND (expire_at IS NULL OR expire_at>UTC_TIMESTAMP(3)) ORDER BY id LIMIT 2",
  R5: 'SELECT id,source_id,site_id,url_hash,enabled,auth_status,last_checked_at,updated_at FROM po_source_sites WHERE source_id=? ORDER BY site_id LIMIT 4',
  R6: 'SELECT id,region_code,enabled FROM po_games WHERE id=? LIMIT 2',
  R7: 'SELECT id,game_id,status FROM po_communities WHERE id=? LIMIT 2'
});
const SCHEMA = Object.freeze({ R1: 'port server_id version database_name now_utc', R2: 'id game_id community_id platform enabled auth_status auth_expire_at default_account_id schedule_version updated_at board_id',
  R3: 'id source_id game_id community_id platform enabled auth_status auth_expire_at updated_at', R4: 'id source_id account_id credential_type status expire_at last_checked_at updated_at has_cipher has_ref',
  R5: 'id source_id site_id url_hash enabled auth_status last_checked_at updated_at', R6: 'id region_code enabled', R7: 'id game_id status' });
const ROW_LIMIT = Object.freeze({ R1: 1, R2: 2, R3: 2, R4: 2, R5: 4, R6: 2, R7: 2 });
const LIMITS = Object.freeze({ selects: 7, perRowBytes: 16384, perQueryBytes: 32768, batchBytes: 65536, queryTimeoutMs: 1000, totalTimeoutMs: 300000 });
const fail = code => { throw Object.assign(Error(code), { code }); };
const canonical = v => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function snapshot(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (!value || typeof value !== 'object' || seen.has(value) || Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) fail('NARROW_DATA_REJECTED');
  seen.add(value); const d = Object.getOwnPropertyDescriptors(value), out = Array.isArray(value) ? [] : {};
  for (const k of Reflect.ownKeys(d)) {
    if (typeof k !== 'string' || !Object.hasOwn(d[k], 'value')) fail('NARROW_DATA_REJECTED');
    if (Array.isArray(value)) { if (k === 'length') continue; if (!/^(0|[1-9]\d*)$/.test(k) || Number(k) >= value.length) fail('NARROW_DATA_REJECTED'); }
    Object.defineProperty(out, k, { value: snapshot(d[k].value, seen), enumerable: true });
  }
  if (Array.isArray(value) && Object.keys(out).length !== value.length) fail('NARROW_DATA_REJECTED');
  seen.delete(value); return Object.freeze(out);
}
function keys(value, fields) { if (!value || Array.isArray(value) || Object.keys(value).sort().join(' ') !== fields.split(' ').sort().join(' ')) fail('NARROW_SCHEMA_REJECTED'); }
const id = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(v);
const date = v => typeof v === 'string' && v.length <= 32 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === (v.length === 20 ? v.replace('Z', '.000Z') : v);
function validateRows(key, rows) {
  if (!Array.isArray(rows) || rows.length > ROW_LIMIT[key]) fail('NARROW_ROWS_EXCEEDED');
  for (const row of rows) {
    keys(row, SCHEMA[key]);
    for (const [field, value] of Object.entries(row)) {
      if (field === 'port' || field === 'server_id' || field === 'schedule_version') { if (!Number.isSafeInteger(value) || value < 1) fail('NARROW_TYPE_REJECTED'); }
      else if (['enabled', 'has_cipher', 'has_ref'].includes(field)) { if (value !== 0 && value !== 1) fail('NARROW_TYPE_REJECTED'); }
      else if (field.endsWith('_at') || field === 'now_utc') { if (!(value === null && ['auth_expire_at', 'expire_at', 'last_checked_at'].includes(field)) && !date(value)) fail('NARROW_TYPE_REJECTED'); }
      else if (field === 'url_hash') { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('NARROW_TYPE_REJECTED'); }
      else if (field === 'default_account_id' && value === null) { /* optional candidate, never selection authority */ }
      else if (typeof value !== 'string' || !id(value)) fail('NARROW_TYPE_REJECTED');
    }
  }
}
function tables() {
  const stamp = new Date().toISOString(), expiry = new Date(Date.now() + 600000).toISOString();
  return {
    R1: [{ port: 3306, server_id: 1, version: '10.4.14-MariaDB', database_name: 'public_opinion', now_utc: stamp }],
    R2: [{ id: SOURCE, game_id: 'fixture-discovered-game', community_id: 'fixture-discovered-community', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', auth_expire_at: null, default_account_id: 'fixture-discovered-account', schedule_version: 1, updated_at: stamp, board_id: '100017' }],
    R3: [{ id: 'fixture-discovered-account', source_id: SOURCE, game_id: 'fixture-discovered-game', community_id: 'fixture-discovered-community', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', auth_expire_at: null, updated_at: stamp }],
    R4: [{ id: 'fixture-discovered-credential', source_id: SOURCE, account_id: 'fixture-discovered-account', credential_type: 'api_token', status: 'active', expire_at: expiry, last_checked_at: stamp, updated_at: stamp, has_cipher: 1, has_ref: 0 }],
    R5: [2, 9, 16].map(n => ({ id: 'fixture-discovered-registry-' + n, source_id: SOURCE, site_id: 'fixture-discovered-site-' + n, url_hash: hash('fixture-public-site-' + n), enabled: 1, auth_status: n === 2 ? 'authorized' : 'unknown', last_checked_at: stamp, updated_at: stamp })),
    R6: [{ id: 'fixture-discovered-game', region_code: 'overseas', enabled: 1 }],
    R7: [{ id: 'fixture-discovered-community', game_id: 'fixture-discovered-game', status: 'enabled' }]
  };
}
function options(input) {
  const f = snapshot(input), allowed = ['sourceId', 'manifestSha256', 'faults', 'queryTimeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes'];
  if (Object.keys(f).some(k => !allowed.includes(k)) || f.sourceId !== SOURCE || !/^[a-f0-9]{64}$/.test(f.manifestSha256 || '')) fail('NARROW_INPUT_REJECTED');
  for (const key of ['queryTimeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes']) if (Object.hasOwn(f, key) && (!Number.isInteger(f[key]) || f[key] < 1)) fail('NARROW_INPUT_REJECTED');
  if (f.faults && !Array.isArray(f.faults)) fail('NARROW_INPUT_REJECTED');
  const seen = new Set();
  for (const fault of f.faults || []) {
    if (!fault || Object.keys(fault).some(k => !['at', 'hang', 'delayMs', 'cancelFails', 'rowPatch', 'rowCount', 'rowIndex'].includes(k)) || !['OPEN', 'BEGIN', 'ROLLBACK', ...Object.keys(SQL)].includes(fault.at) || seen.has(fault.at)) fail('NARROW_INPUT_REJECTED');
    seen.add(fault.at);
    for (const k of ['hang', 'cancelFails']) if (Object.hasOwn(fault, k) && typeof fault[k] !== 'boolean') fail('NARROW_INPUT_REJECTED');
    for (const k of ['delayMs', 'rowCount', 'rowIndex']) if (Object.hasOwn(fault, k) && (!Number.isInteger(fault[k]) || fault[k] < 0 || fault[k] > (k === 'delayMs' ? 10000 : 10))) fail('NARROW_INPUT_REJECTED');
    if (fault.rowPatch && (typeof fault.rowPatch !== 'object' || Array.isArray(fault.rowPatch))) fail('NARROW_INPUT_REJECTED');
    if (['OPEN', 'BEGIN', 'ROLLBACK'].includes(fault.at) && ['rowPatch', 'rowCount', 'rowIndex'].some(k => Object.hasOwn(fault, k))) fail('NARROW_INPUT_REJECTED');
  }
  return f;
}
async function runFixtureNarrowMetadata(input, adapter) {
  const f = options(input), start = performance.now(), deadline = Math.min(adapter.deadline, start + Math.min(f.totalTimeoutMs || LIMITS.totalTimeoutMs, LIMITS.totalTimeoutMs));
  const limits = Object.fromEntries(['queryTimeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes'].map(k => [k, Math.min(f[k] || LIMITS[k], LIMITS[k])]));
  const trace = []; let destroyed = false, ended = false, inTransaction = false, selects = 0, bytes = 0, cancelFailed = false, connectionCount = 0;
  const observed = {};
  const destroy = () => { if (!destroyed) trace.push({ event: 'DESTROY' }); destroyed = true; inTransaction = false; adapter.destroy(); };
  const active = () => { if (destroyed || ended || performance.now() >= deadline) fail('NARROW_DEADLINE_OR_STOPPED'); };
  async function operation(key, params = []) {
    active(); const fault = (f.faults || []).find(x => x.at === key) || {};
    if (Object.hasOwn(SQL, key)) {
      const s = observed.R2?.[0], a = observed.R3?.[0];
      const expected = { R1: [], R2: [SOURCE], R3: [SOURCE], R4: [SOURCE, a?.id, 'api_token'], R5: [SOURCE], R6: [s?.game_id], R7: [s?.community_id] };
      if (canonical(params) !== canonical(expected[key]) || ++selects > 7) fail('NARROW_QUERY_REJECTED');
      trace.push({ event: 'SELECT', key, sql: SQL[key], parameterCount: params.length });
    } else trace.push({ event: key, ...(key === 'BEGIN' ? { statements: ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION READ ONLY'] } : {}) });
    try {
      const returned = await adapter.operation(key, params);
      active();
      if (!Object.hasOwn(SQL, key)) return;
      const rows = returned;
      const received = Buffer.byteLength(JSON.stringify(rows)); bytes += received;
      trace.push({ event: 'RESULT', key, rows: rows.length, bytes: received });
      if (rows.some(row => Buffer.byteLength(JSON.stringify(row)) > limits.perRowBytes) || received > limits.perQueryBytes || bytes > limits.batchBytes) fail('NARROW_BYTES_EXCEEDED');
      validateRows(key, rows); observed[key] = rows; return rows;
    } catch (e) { cancelFailed = Boolean(fault.cancelFails); destroy(); throw e; }
    finally { /* adapter owns timers and ignores late callbacks */ }
  }
  const one = rows => { if (rows.length !== 1) fail('NARROW_IDENTITY_HOLD'); return rows[0]; };
  let dbNow = 0;
  const validUntil = value => value === null || Date.parse(value) > Math.max(dbNow, Date.now());
  const result = { kind: 'FIXTURE_NARROW_METADATA_DRIVER', status: 'NO_GO', realConnectionOpened: false, realSqlExecuted: false, realConfigurationRead: false, realSecretRead: false, productionActivationAllowed: false };
  try {
    await operation('OPEN'); connectionCount = 1;
    const target = one(await operation('R1'));
    if (target.port !== 3306 || target.server_id !== 1 || target.version !== '10.4.14-MariaDB' || target.database_name !== 'public_opinion' || Math.abs(Date.parse(target.now_utc) - Date.now()) > 30000) fail('NARROW_TARGET_REJECTED');
    dbNow = Date.parse(target.now_utc);
    await operation('BEGIN'); inTransaction = true;
    const source = one(await operation('R2', [SOURCE]));
    if (source.id !== SOURCE || source.platform !== 'bigplayer_h5' || source.enabled !== 1 || source.auth_status !== 'authorized' || !validUntil(source.auth_expire_at) || source.board_id !== '100017') fail('NARROW_IDENTITY_HOLD');
    const account = one(await operation('R3', [SOURCE]));
    if (account.source_id !== SOURCE || account.game_id !== source.game_id || account.community_id !== source.community_id || account.platform !== source.platform || account.enabled !== 1 || account.auth_status !== 'authorized' || !validUntil(account.auth_expire_at)) fail('NARROW_IDENTITY_HOLD');
    if (source.default_account_id !== null && source.default_account_id !== account.id) fail('NARROW_IDENTITY_HOLD');
    const credential = one(await operation('R4', [SOURCE, account.id, 'api_token']));
    if (credential.source_id !== SOURCE || credential.account_id !== account.id || credential.credential_type !== 'api_token' || credential.status !== 'active' || !validUntil(credential.expire_at) || credential.has_cipher !== 1) fail('NARROW_IDENTITY_HOLD');
    const sites = await operation('R5', [SOURCE]);
    if (sites.length !== 3 || new Set(sites.map(s => s.site_id)).size !== 3 || new Set(sites.map(s => s.id)).size !== 3 || new Set(sites.map(s => s.url_hash)).size !== 3 || sites.some(s => s.source_id !== SOURCE || s.enabled !== 1 || !['authorized', 'unknown'].includes(s.auth_status))) fail('NARROW_IDENTITY_HOLD');
    const game = one(await operation('R6', [source.game_id])); if (game.id !== source.game_id || game.region_code !== 'overseas' || game.enabled !== 1) fail('NARROW_IDENTITY_HOLD');
    const community = one(await operation('R7', [source.community_id])); if (community.id !== source.community_id || community.game_id !== game.id || community.status !== 'enabled') fail('NARROW_IDENTITY_HOLD');
    if (!validUntil(source.auth_expire_at) || !validUntil(account.auth_expire_at) || !validUntil(credential.expire_at)) fail('NARROW_IDENTITY_HOLD');
    await operation('ROLLBACK'); inTransaction = false;
    if (!validUntil(source.auth_expire_at) || !validUntil(account.auth_expire_at) || !validUntil(credential.expire_at)) fail('NARROW_IDENTITY_HOLD');
    await adapter.end();
    if (!validUntil(source.auth_expire_at) || !validUntil(account.auth_expire_at) || !validUntil(credential.expire_at)) fail('NARROW_IDENTITY_HOLD');
    trace.push({ event: 'END' }); ended = true;
    result.status = 'ISOLATED_NARROW_METADATA_CONTRACT_PASS';
    result.discovery = { sourceId: SOURCE, accountId: account.id, credentialId: credential.id, gameId: game.id, communityId: community.id, boardId: source.board_id,
      registry: sites.map(s => ({ registryId: s.id, siteId: s.site_id, urlHash: s.url_hash, authStatus: s.auth_status })),
      observedAt: target.now_utc, manifestSha256: f.manifestSha256, planSha256: hash(canonical(SQL)), nonce: crypto.randomBytes(16).toString('hex'), validForMs: Math.max(0, Math.floor(deadline - performance.now())), approvalForSecretRead: false };
  } catch (e) { destroy(); result.errorCode = /^(NARROW|ADAPTER)_[A-Z_]+$/.test(e.code || '') ? e.code : 'NARROW_INTERNAL_FAILED'; }
  finally { for (const key of Object.keys(observed)) delete observed[key];  }
  return { ...result, evidence: { trace, selects, bytes, limits, destroyed, ended, inTransaction, cancelFailed, connectionCount, reconnectCount: 0, cleanupComplete: true } };
}
const profiles = new WeakMap();
const CONFIG_KEYS = Object.freeze(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);
const CONFIG_PATH = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.env';
const OPERATIONS = Object.freeze(['CREATE', 'CONNECT', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'END']);
function issueFixtureProfile(input) {
  const f = snapshot(input); keys(f, 'sourceId manifestSha256 configuration target faults limits');
  keys(f.configuration, 'kind sourcePath selectedFields recordSelector identityAlias grantStatus');
  keys(f.target, 'host port database serverId version');
  if (f.sourceId !== SOURCE || !/^[a-f0-9]{64}$/.test(f.manifestSha256 || '') || f.target.host !== '127.0.0.1' || f.target.port !== 3306 || f.target.database !== 'public_opinion'
    || f.target.serverId !== 1 || f.target.version !== '10.4.14-MariaDB' || f.configuration.kind !== 'existing-config-db-fields'
    || f.configuration.sourcePath !== CONFIG_PATH || f.configuration.recordSelector !== 'exact-db-fields-once'
    || canonical(f.configuration.selectedFields) !== canonical(CONFIG_KEYS) || !id(f.configuration.identityAlias) || f.configuration.grantStatus !== 'unverified') fail('ADAPTER_PROFILE_REJECTED');
  if (!f.limits || Object.keys(f.limits).some(k => !['connectTimeoutMs', 'queryTimeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes'].includes(k))) fail('ADAPTER_PROFILE_REJECTED');
  for (const v of Object.values(f.limits)) if (!Number.isInteger(v) || v < 1) fail('ADAPTER_PROFILE_REJECTED');
  if (!Array.isArray(f.faults)) fail('ADAPTER_PROFILE_REJECTED');
  const seen = new Set();
  for (const x of f.faults) {
    if (!x || Object.keys(x).some(k => !['at', 'hang', 'delayMs', 'rowPatch', 'rowCount', 'rowIndex', 'fieldFault', 'callbackMode', 'authFault', 'dateFault', 'integerFault'].includes(k)) || !OPERATIONS.includes(x.at) || seen.has(x.at)) fail('ADAPTER_PROFILE_REJECTED');
    seen.add(x.at);
    for (const key of ['hang', 'authFault']) if (Object.hasOwn(x, key) && typeof x[key] !== 'boolean') fail('ADAPTER_PROFILE_REJECTED');
    for (const key of ['delayMs', 'rowCount', 'rowIndex']) if (Object.hasOwn(x, key) && (!Number.isInteger(x[key]) || x[key] < 0 || x[key] > (key === 'delayMs' ? 10000 : 10))) fail('ADAPTER_PROFILE_REJECTED');
    for (const [key, values] of [['fieldFault', ['missing', 'extra', 'duplicate', 'type']], ['callbackMode', ['sync', 'duplicate', 'error-then-result', 'late-result']], ['dateFault', ['invalid', 'offset', 'date-object']], ['integerFault', ['unsafe-bigint', 'tiny-string']]]) if (Object.hasOwn(x, key) && !values.includes(x[key])) fail('ADAPTER_PROFILE_REJECTED');
    if (Object.hasOwn(x, 'rowPatch') && (!x.rowPatch || typeof x.rowPatch !== 'object' || Array.isArray(x.rowPatch))) fail('ADAPTER_PROFILE_REJECTED');
  }
  const cap = Object.freeze(Object.create(null));
  profiles.set(cap, { f, used: false, deadline: performance.now() + Math.min(f.limits.totalTimeoutMs || 300000, 300000), auth: { user: 'synthetic-adapter-db-user', password: 'synthetic-adapter-db-password' } });
  return cap;
}
function normalizeDate(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{3})?$/.test(value)) fail('ADAPTER_DATE_REJECTED');
  const iso = value.replace(' ', 'T') + 'Z'; if (!date(iso)) fail('ADAPTER_DATE_REJECTED');
  return new Date(iso).toISOString();
}
function typeFamily(key) {
  if (key.endsWith('_at') || key === 'now_utc') return 'DATETIME';
  if (['port', 'server_id', 'schedule_version'].includes(key)) return 'INTEGER';
  if (['enabled', 'has_cipher', 'has_ref'].includes(key)) return 'TINYINT';
  return 'TEXT';
}
function normalizeRows(key, rows, fields) {
  if (!Array.isArray(fields) || fields.length !== SCHEMA[key].split(' ').length || new Set(fields.map(f => f.name)).size !== fields.length) fail('ADAPTER_FIELDS_REJECTED');
  for (const f of fields) if (!SCHEMA[key].split(' ').includes(f.name) || f.typeFamily !== typeFamily(f.name)) fail('ADAPTER_FIELDS_REJECTED');
  if (!Array.isArray(rows)) fail('ADAPTER_ROWS_REJECTED');
  return rows.map(row => {
    keys(row, SCHEMA[key]); const normalized = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeFamily(k) === 'DATETIME') normalized[k] = normalizeDate(v);
      else if (typeFamily(k) === 'INTEGER') {
        if (typeof v === 'string' && /^[1-9]\d{0,15}$/.test(v) && Number.isSafeInteger(Number(v))) normalized[k] = Number(v);
        else if (Number.isSafeInteger(v)) normalized[k] = v; else fail('ADAPTER_INTEGER_REJECTED');
      } else if (typeFamily(k) === 'TINYINT') { if (v !== 0 && v !== 1) fail('ADAPTER_INTEGER_REJECTED'); normalized[k] = v; }
      else normalized[k] = v;
    }
    return normalized;
  });
}
function createControlledAdapter(state) {
  const { f, deadline } = state, fixtures = tables(), trace = [];
  let poisoned = false, closed = false, connection, creations = 0, destroys = 0, authConsumptions = 0, rawBytes = 0, normalizedBytes = 0, ignoredCallbacks = 0;
  const timers = new Set(), lateCallbacks = [];
  const limits = { connectTimeoutMs: Math.min(f.limits.connectTimeoutMs || 1000, 1000), queryTimeoutMs: Math.min(f.limits.queryTimeoutMs || 1000, 1000),
    perRowBytes: Math.min(f.limits.perRowBytes || 16384, 16384), perQueryBytes: Math.min(f.limits.perQueryBytes || 32768, 32768), batchBytes: Math.min(f.limits.batchBytes || 65536, 65536) };
  const live = () => { if (poisoned || closed || performance.now() >= deadline) fail('ADAPTER_STOPPED'); };
  function destroy() { if (!poisoned && !closed) { destroys++; trace.push({ event: 'DESTROY' }); } poisoned = true; for (const timer of timers) clearTimeout(timer); timers.clear(); state.auth = null; }
  function rawResult(key, fault) {
    let rows = fixtures[key].map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeFamily(k) === 'DATETIME' && v !== null ? v.replace('T', ' ').replace('Z', '') : k === 'schedule_version' ? String(v) : v])));
    if (Object.hasOwn(fault, 'rowCount')) rows = Array.from({ length: fault.rowCount }, (_, i) => ({ ...rows[i % rows.length], ...(i >= fixtures[key].length ? { id: 'fixture-extra-' + i } : {}) }));
    const row = rows[fault.rowIndex || 0];
    if (row && fault.rowPatch) Object.assign(row, fault.rowPatch);
    const field = row && Object.keys(row).find(k => typeFamily(k) === 'DATETIME');
    if (field && fault.dateFault) row[field] = fault.dateFault === 'invalid' ? '2026-02-30 00:00:00' : fault.dateFault === 'offset' ? '2026-10-10T00:00:00+08:00' : new Date();
    if (row && fault.integerFault) { if (fault.integerFault === 'unsafe-bigint') row.schedule_version = '9007199254740992'; else row.enabled = '1'; }
    const fields = SCHEMA[key].split(' ').map(name => ({ name, typeFamily: typeFamily(name) }));
    if (fault.fieldFault === 'missing') fields.pop();
    if (fault.fieldFault === 'extra') fields.push({ name: 'secret_cipher', typeFamily: 'TEXT' });
    if (fault.fieldFault === 'duplicate') fields[1] = fields[0];
    if (fault.fieldFault === 'type') fields[0].typeFamily = 'UNEXPECTED';
    return { rows, fields };
  }
  function createConnection(config) {
    live(); if (++creations !== 1 || Object.keys(config).sort().join(' ') !== 'connectTimeout database dateStrings host multipleStatements password port timezone user'
      || config.host !== '127.0.0.1' || config.port !== 3306 || config.database !== 'public_opinion' || config.dateStrings !== true || config.timezone !== 'Z' || config.multipleStatements !== false
      || config.user !== state.auth?.user || config.password !== state.auth?.password) fail('ADAPTER_AUTH_REJECTED');
    trace.push({ event: 'CREATE_CONNECTION' });
    // Callback-shaped simulator consumes auth in connect. No mysql2 is imported.
    return {
      connect(cb, fault) { if (!state.auth || fault.authFault || config.user !== 'synthetic-adapter-db-user' || config.password !== 'synthetic-adapter-db-password') { cb(Error('untrusted-secret-error')); return; } authConsumptions++; schedule('CONNECT', fault, cb); },
      query(request, cb) {
        const controls = { SET_ISOLATION: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', START_READ_ONLY: 'START TRANSACTION READ ONLY', ROLLBACK: 'ROLLBACK' };
        const key = Object.keys({ ...SQL, ...controls }).find(k => (SQL[k] || controls[k]) === request.sql);
        if (!key || Object.keys(request).sort().join(' ') !== 'sql values' || !Array.isArray(request.values) || request.values.length !== ((request.sql.match(/\?/g) || []).length)) fail('ADAPTER_QUERY_REJECTED');
        if (['R2', 'R3', 'R4', 'R5'].includes(key) && request.values[0] !== SOURCE) fail('ADAPTER_QUERY_REJECTED');
        if (key === 'R4' && request.values[2] !== 'api_token') fail('ADAPTER_QUERY_REJECTED');
        schedule(key, f.faults.find(x => x.at === key) || {}, cb);
      },
      end(fault, cb) { schedule('END', fault, cb); },
      destroy() { destroy(); config.user = null; config.password = null; }
    };
  }
  function schedule(key, fault, cb) {
    live(); trace.push({ event: key });
    if (fault.callbackMode === 'late-result') {
      const saved = key in SQL ? rawResult(key, fault) : null;
      lateCallbacks.push(() => cb(null, saved?.rows, saved?.fields)); return;
    }
    const invoke = () => {
      const deliver = () => { const result = key in SQL ? rawResult(key, fault) : null; cb(null, result?.rows, result?.fields); };
      if (fault.callbackMode === 'error-then-result') { cb(Error('untrusted-secret-error')); deliver(); return; }
      deliver();
      if (fault.callbackMode === 'duplicate') deliver();
    };
    if (fault.hang) return;
    if (fault.callbackMode === 'sync') invoke(); else { const timer = setTimeout(() => { timers.delete(timer); invoke(); }, fault.delayMs || 0); timers.add(timer); }
  }
  async function call(key, params = []) {
    live(); const fault = f.faults.find(x => x.at === key) || {};
    let timer, settled = false;
    try {
      const result = await new Promise((resolve, reject) => {
        const cb = (err, rows, fields) => { if (settled || poisoned || closed) { ignoredCallbacks++; return; } settled = true; clearTimeout(timer); if (err) reject(Object.assign(Error('ADAPTER_CALLBACK_FAILED'), { code: 'ADAPTER_CALLBACK_FAILED' })); else resolve(rows === undefined ? null : { rows, fields }); };
        timer = setTimeout(() => { if (!settled) { settled = true; destroy(); reject(Object.assign(Error('ADAPTER_OPERATION_TIMEOUT'), { code: 'ADAPTER_OPERATION_TIMEOUT' })); } }, Math.max(1, Math.min(key === 'CONNECT' ? limits.connectTimeoutMs : limits.queryTimeoutMs, deadline - performance.now())));
        if (key === 'CONNECT') connection.connect(cb, fault); else if (key === 'END') connection.end(fault, cb); else connection.query({ sql: SQL[key] || { SET_ISOLATION: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', START_READ_ONLY: 'START TRANSACTION READ ONLY', ROLLBACK: 'ROLLBACK' }[key], values: params }, cb);
      });
      live();
      return result;
    } catch (e) { connection?.destroy(); destroy(); throw e; } finally { clearTimeout(timer); }
  }
  return {
    deadline,
    async operation(key, params) {
      if (key === 'OPEN') {
        live(); const fault = f.faults.find(x => x.at === 'CREATE') || {};
        if (fault.hang || fault.delayMs || fault.authFault) fail('ADAPTER_CREATE_REJECTED');
        connection = createConnection({ host: f.target.host, port: f.target.port, database: f.target.database, user: state.auth.user, password: state.auth.password,
          timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: limits.connectTimeoutMs });
        await call('CONNECT'); return;
      }
      if (key === 'BEGIN') { await call('SET_ISOLATION'); await call('START_READ_ONLY'); return; }
      if (key === 'ROLLBACK') { await call('ROLLBACK'); return; }
      if (!(key in SQL) || params.length !== (SQL[key].match(/\?/g) || []).length) fail('ADAPTER_QUERY_REJECTED');
      // Only the private seven-query executor can call this method.
      const result = await call(key, params), size = Buffer.byteLength(JSON.stringify(result.rows)); rawBytes += size;
      trace.push({ event: 'RAW_RESULT', key, bytes: size, maxRowBytes: Math.max(0, ...result.rows.map(row => Buffer.byteLength(JSON.stringify(row)))) });
      if (result.rows.some(row => Buffer.byteLength(JSON.stringify(row)) > limits.perRowBytes) || size > limits.perQueryBytes || rawBytes > limits.batchBytes) fail('ADAPTER_BYTES_EXCEEDED');
      const normalized = normalizeRows(key, result.rows, result.fields), bytes = Buffer.byteLength(JSON.stringify(normalized)); normalizedBytes += bytes;
      trace.push({ event: 'NORMALIZED_RESULT', key, bytes, maxRowBytes: Math.max(0, ...normalized.map(row => Buffer.byteLength(JSON.stringify(row)))) });
      if (normalized.some(row => Buffer.byteLength(JSON.stringify(row)) > limits.perRowBytes) || bytes > limits.perQueryBytes || normalizedBytes > limits.batchBytes) fail('ADAPTER_BYTES_EXCEEDED');
      return normalized;
    },
    async end() { await call('END'); closed = true; state.auth = null; trace.push({ event: 'CLOSED' }); },
    destroy() { connection?.destroy(); destroy(); },
    evidence() { return { kind: 'MYSQL2_CALLBACK_SHAPED_SIMULATOR', trace: [...trace], creations, destroys, authConsumptions, rawBytes, normalizedBytes, ignoredCallbacks, limits,
      poisoned, closed, reconnectCount: 0, actualMysql2Loaded: false, realConnectionOpened: false, realConfigurationRead: false }; },
    cleanup() { for (const t of timers) clearTimeout(t); timers.clear(); state.auth = null; if (connection) connection.destroy(); for (const cb of lateCallbacks.splice(0)) cb(); for (const k of Object.keys(fixtures)) delete fixtures[k]; }
  };
}
async function runFixtureProfileAdapter(capability) {
  const state = profiles.get(capability);
  if (!state || state.used) fail('ADAPTER_CAPABILITY_REJECTED');
  if (performance.now() >= state.deadline) { state.auth = null; state.f = null; profiles.delete(capability); fail('ADAPTER_CAPABILITY_REJECTED'); }
  state.used = true; const adapter = createControlledAdapter(state); let result;
  try {
    result = await runFixtureNarrowMetadata({ sourceId: SOURCE, manifestSha256: state.f.manifestSha256, faults: [], ...Object.fromEntries(Object.entries(state.f.limits).filter(([k]) => k !== 'connectTimeoutMs')) }, adapter);
    result.kind = 'FIXTURE_PROFILE_ADAPTER_EVIDENCE';
    if (result.status === 'ISOLATED_NARROW_METADATA_CONTRACT_PASS') result.status = 'ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS';
    adapter.cleanup();
    return { ...result, adapter: adapter.evidence(), configuration: { kind: 'existing-config-db-fields', identityAlias: state.f.configuration.identityAlias, grantStatus: 'unverified', authenticationReadApproved: false }, privateReferencesReleased: true };
  } finally { adapter.cleanup(); state.f = null; profiles.delete(capability); }
}
function runProductionProfileAdapter() { fail('REAL_PROFILE_ADAPTER_DISABLED'); }
module.exports = Object.freeze({ issueFixtureProfile, runFixtureProfileAdapter, runProductionProfileAdapter, sourceId: SOURCE, configurationPath: CONFIG_PATH,
  selectedFields: CONFIG_KEYS, sqlContract: SQL, schemaContract: SCHEMA });
