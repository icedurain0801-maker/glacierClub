'use strict';
// Internal controlled fixture driver only. No mysql/env/config/HTTP imports.
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
async function runFixtureNarrowMetadata(input) {
  const f = options(input), start = performance.now(), deadline = start + Math.min(f.totalTimeoutMs || LIMITS.totalTimeoutMs, LIMITS.totalTimeoutMs);
  const limits = Object.fromEntries(['queryTimeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes'].map(k => [k, Math.min(f[k] || LIMITS[k], LIMITS[k])]));
  const trace = []; let destroyed = false, ended = false, inTransaction = false, selects = 0, bytes = 0, cancelFailed = false, connectionCount = 0;
  const fixtures = tables(), observed = {};
  const destroy = () => { if (!destroyed) trace.push({ event: 'DESTROY' }); destroyed = true; inTransaction = false; };
  const active = () => { if (destroyed || ended || performance.now() >= deadline) fail('NARROW_DEADLINE_OR_STOPPED'); };
  async function operation(key, params = []) {
    active(); const fault = (f.faults || []).find(x => x.at === key) || {};
    if (Object.hasOwn(SQL, key)) {
      const s = observed.R2?.[0], a = observed.R3?.[0];
      const expected = { R1: [], R2: [SOURCE], R3: [SOURCE], R4: [SOURCE, a?.id, 'api_token'], R5: [SOURCE], R6: [s?.game_id], R7: [s?.community_id] };
      if (canonical(params) !== canonical(expected[key]) || ++selects > 7) fail('NARROW_QUERY_REJECTED');
      trace.push({ event: 'SELECT', key, sql: SQL[key], parameterCount: params.length });
    } else trace.push({ event: key, ...(key === 'BEGIN' ? { statements: ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION READ ONLY'] } : {}) });
    let delayTimer, timeoutTimer;
    try {
      await Promise.race([fault.hang ? new Promise(() => {}) : new Promise(resolve => { delayTimer = setTimeout(resolve, fault.delayMs || 0); }),
        new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(Object.assign(Error('NARROW_OPERATION_TIMEOUT'), { code: 'NARROW_OPERATION_TIMEOUT' })), Math.max(1, Math.min(limits.queryTimeoutMs, deadline - performance.now()))); })]);
      active();
      if (!Object.hasOwn(SQL, key)) return;
      let rows = fixtures[key].map(row => ({ ...row }));
      if (Object.hasOwn(fault, 'rowCount')) rows = Array.from({ length: fault.rowCount }, (_, i) => ({ ...fixtures[key][i % fixtures[key].length], ...(i >= fixtures[key].length ? { id: 'fixture-extra-' + i } : {}) }));
      if (fault.rowPatch && rows[fault.rowIndex || 0]) rows[fault.rowIndex || 0] = { ...rows[fault.rowIndex || 0], ...fault.rowPatch };
      const received = Buffer.byteLength(JSON.stringify(rows)); bytes += received;
      trace.push({ event: 'RESULT', key, rows: rows.length, bytes: received });
      if (rows.some(row => Buffer.byteLength(JSON.stringify(row)) > limits.perRowBytes) || received > limits.perQueryBytes || bytes > limits.batchBytes) fail('NARROW_BYTES_EXCEEDED');
      validateRows(key, rows); observed[key] = rows; return rows;
    } catch (e) { cancelFailed = Boolean(fault.cancelFails); destroy(); throw e; }
    finally { clearTimeout(delayTimer); clearTimeout(timeoutTimer); }
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
    trace.push({ event: 'END' }); ended = true;
    result.status = 'ISOLATED_NARROW_METADATA_CONTRACT_PASS';
    result.discovery = { sourceId: SOURCE, accountId: account.id, credentialId: credential.id, gameId: game.id, communityId: community.id, boardId: source.board_id,
      registry: sites.map(s => ({ registryId: s.id, siteId: s.site_id, urlHash: s.url_hash, authStatus: s.auth_status })),
      observedAt: target.now_utc, manifestSha256: f.manifestSha256, planSha256: hash(canonical(SQL)), nonce: crypto.randomBytes(16).toString('hex'), validForMs: Math.max(0, Math.floor(deadline - performance.now())), approvalForSecretRead: false };
  } catch (e) { destroy(); result.errorCode = /^NARROW_[A-Z_]+$/.test(e.code || '') ? e.code : 'NARROW_INTERNAL_FAILED'; }
  finally { for (const key of Object.keys(observed)) delete observed[key]; for (const key of Object.keys(fixtures)) delete fixtures[key]; }
  return { ...result, evidence: { trace, selects, bytes, limits, destroyed, ended, inTransaction, cancelFailed, connectionCount, reconnectCount: 0, cleanupComplete: true } };
}
function runProductionNarrowMetadata() { fail('REAL_NARROW_METADATA_DISABLED'); }
module.exports = Object.freeze({ runFixtureNarrowMetadata, runProductionNarrowMetadata, sourceId: SOURCE, sqlContract: SQL, schemaContract: SCHEMA, limits: LIMITS });
