'use strict';
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const contract = require('./overseas-v019-profile-adapter-contract');
const artifact = path.resolve(__dirname, '..'), root = path.resolve(artifact, '../..');
const anchorPath = path.join(root, '.temp', 'v019-seven-read-manager-public-anchor.json');
const capabilities = new WeakMap();
const consumed = new WeakMap();
const fail = code => { throw Object.assign(Error(code), { code }); };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function snapshot(v, seen = new Set()) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (!v || typeof v !== 'object' || seen.has(v) || Object.getPrototypeOf(v) !== (Array.isArray(v) ? Array.prototype : Object.prototype)) fail('PERMIT_DATA_REJECTED');
  seen.add(v); const out = Array.isArray(v) ? [] : {};
  for (const k of Reflect.ownKeys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (typeof k !== 'string' || !Object.hasOwn(d, 'value') || ['__proto__', 'constructor', 'prototype'].includes(k)) fail('PERMIT_DATA_REJECTED');
    if (Array.isArray(v)) { if (k === 'length') continue; if (!/^(0|[1-9]\d*)$/.test(k)) fail('PERMIT_DATA_REJECTED'); }
    Object.defineProperty(out, k, { value: snapshot(d.value, seen), enumerable: true });
  }
  if (Array.isArray(v) && Object.keys(out).length !== v.length) fail('PERMIT_DATA_REJECTED'); seen.delete(v); return Object.freeze(out);
}
function canonical(v) { return JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x); }
function keys(v, names) { if (!v || Array.isArray(v) || Object.keys(v).sort().join(' ') !== names.split(' ').sort().join(' ')) fail('PERMIT_SCHEMA_REJECTED'); }
const { performance } = require('node:perf_hooks');
const fields = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
function data(v) {
  if (v === null || ['string', 'boolean'].includes(typeof v) || Number.isFinite(v)) return v;
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) fail('MYSQL2_INPUT_REJECTED');
  const out = {};
  for (const k of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, k); if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k) || !Object.hasOwn(d, 'value')) fail('MYSQL2_INPUT_REJECTED'); out[k] = data(d.value); }
  return out;
}
function parseRecord(bytes) {
  // Entire specified file is consumed once; unrelated keys are never retained/output.
  if (bytes.length > 65536 || bytes.includes(0)) fail('MYSQL2_CONFIG_REJECTED');
  const values = Object.create(null); let text = bytes.toString('utf8');
  try {
  if (!Buffer.from(text).equals(bytes)) fail('MYSQL2_CONFIG_REJECTED');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) fail('MYSQL2_CONFIG_REJECTED');
    if (!fields.includes(match[1])) continue;
    if (Object.hasOwn(values, match[1])) fail('MYSQL2_CONFIG_REJECTED');
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]; if (value.length < 2 || value.at(-1) !== quote) fail('MYSQL2_CONFIG_REJECTED'); value = value.slice(1, -1);
    }
    if ((!value && match[1] !== 'DB_PASSWORD') || value.length > 1024 || /[\r\n\0]/.test(value)) fail('MYSQL2_CONFIG_REJECTED'); values[match[1]] = value;
  }
  text = null;
  if (fields.some(k => !Object.hasOwn(values, k)) || !['127.0.0.1', 'localhost'].includes(values.DB_HOST) || values.DB_PORT !== '3306' || values.DB_NAME !== 'public_opinion') fail('MYSQL2_CONFIG_REJECTED');
  if (values.DB_HOST === 'localhost') values.DB_HOST = '127.0.0.1';
  return { ...values };
  } finally { text = null; for (const k of Object.keys(values)) values[k] = null; }
}
function readFixtureRecord(file, onRead) {
  const absolute = path.resolve(file), parent = path.dirname(absolute), temp = path.join(root, '.temp');
  if (path.dirname(parent) !== temp || !path.basename(parent).startsWith('v019-mysql2-config-fixture-') || path.basename(absolute) !== 'synthetic-config.txt'
    || fs.realpathSync(parent) !== parent || fs.lstatSync(absolute).isSymbolicLink()) fail('MYSQL2_FIXTURE_PATH_REJECTED');
  const fd = fs.openSync(absolute, 'r'); let bytes;
  try { if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).size > 65536) fail('MYSQL2_CONFIG_REJECTED'); bytes = fs.readFileSync(fd); onRead(); return parseRecord(bytes); }
  finally { fs.closeSync(fd); bytes?.fill(0); }
}
function typeAllowed(name, type) {
  if (name.endsWith('_at') || name === 'now_utc') return [7, 12].includes(type);
  if (['port', 'server_id', 'schedule_version'].includes(name)) return [1, 2, 3, 8, 9].includes(type);
  if (['enabled', 'has_cipher', 'has_ref'].includes(name)) return [1, 3, 8].includes(type);
  if (name === 'board_id') return [15, 251, 253, 254].includes(type);
  return [15, 253, 254].includes(type);
}
function normalize(key, row) {
  if (Object.keys(row).sort().join(' ') !== contract.schemaContract[key].split(' ').sort().join(' ')) fail('MYSQL2_SCHEMA_REJECTED');
  const out = {};
  for (const [name, value] of Object.entries(row)) {
    if (name.endsWith('_at') || name === 'now_utc') {
      if (value === null && ['auth_expire_at', 'expire_at', 'last_checked_at'].includes(name)) { out[name] = null; continue; }
      if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{3})?$/.test(value)) fail('MYSQL2_DATE_REJECTED');
      const iso = value.replace(' ', 'T') + 'Z', d = new Date(iso);
      if (!Number.isFinite(d.getTime()) || d.toISOString() !== (value.length === 19 ? iso.replace('Z', '.000Z') : iso)) fail('MYSQL2_DATE_REJECTED'); out[name] = d.toISOString();
    } else if (['port', 'server_id', 'schedule_version', 'enabled', 'has_cipher', 'has_ref'].includes(name)) {
      const n = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value;
      if (!Number.isSafeInteger(n) || n < 0 || (['enabled', 'has_cipher', 'has_ref'].includes(name) && n !== 0 && n !== 1)) fail('MYSQL2_INTEGER_REJECTED'); out[name] = n;
    } else if (value === null && name === 'default_account_id') out[name] = null;
    else { if (typeof value !== 'string' || !(name === 'url_hash' ? /^[a-f0-9]{64}$/ : /^[A-Za-z0-9._:-]{1,120}$/).test(value)) fail('MYSQL2_TYPE_REJECTED'); out[name] = value; }
  }
  return out;
}
async function runEngine(input, execution) {
  const options = data(input);
  if (Object.keys(options).some(k => !['fixtureFile', 'manifestSha256', 'fault', 'timeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes'].includes(k)) || typeof options.fixtureFile !== 'string' || !/^[a-f0-9]{64}$/.test(options.manifestSha256 || '')) fail('MYSQL2_INPUT_REJECTED');
  const fault = options.fault || {};
  if (Object.keys(fault).some(k => !['at', 'hang', 'error', 'delayMs', 'fieldFault', 'rowPatch', 'rowCount', 'expireInMs'].includes(k)) || (fault.at && !['CONNECT', 'END', 'SET_ISOLATION', 'START_READ_ONLY', 'ROLLBACK', ...Object.keys(contract.sqlContract)].includes(fault.at))) fail('MYSQL2_INPUT_REJECTED');
  for (const k of ['timeoutMs', 'totalTimeoutMs', 'perRowBytes', 'perQueryBytes', 'batchBytes']) if (options[k] !== undefined && (!Number.isInteger(options[k]) || options[k] < 1)) fail('MYSQL2_INPUT_REJECTED');
  for (const k of ['delayMs', 'rowCount', 'expireInMs']) if (fault[k] !== undefined && (!Number.isInteger(fault[k]) || fault[k] < 0 || fault[k] > (k === 'rowCount' ? 20 : 10000))) fail('MYSQL2_INPUT_REJECTED');
  for (const k of ['hang', 'error']) if (fault[k] !== undefined && typeof fault[k] !== 'boolean') fail('MYSQL2_INPUT_REJECTED');
  if (fault.fieldFault !== undefined && !['type', 'duplicate', 'extra'].includes(fault.fieldFault)) fail('MYSQL2_INPUT_REJECTED');
  if (fault.rowPatch !== undefined && (!fault.rowPatch || typeof fault.rowPatch !== 'object')) fail('MYSQL2_INPUT_REJECTED');
  const limits = { timeoutMs: Math.min(options.timeoutMs || 1000, 1000), row: Math.min(options.perRowBytes || 16384, 16384), query: Math.min(options.perQueryBytes || 32768, 32768), batch: Math.min(options.batchBytes || 65536, 65536) };
  const started = performance.now(), deadline = started + Math.min(options.totalTimeoutMs || 300000, 300000, execution ? Math.max(0, execution.expiresAtMs - Date.now()) : 300000);
  let record, connection, peer, closed = false, poisoned = false, destroys = 0, rawBytes = 0, normalizedBytes = 0, selects = 0, pendingReject, maxRowBytes = 0, maxQueryBytes = 0, configurationReads = 0;
  const trace = [], metadata = [], observed = {};
  const live = () => { if (closed || poisoned || performance.now() >= deadline || (execution && Date.now() >= execution.expiresAtMs)) fail('MYSQL2_STOPPED'); };
  function release() { if (record) for (const k of Object.keys(record)) record[k] = null; record = null; if (connection) { connection.config.user = undefined; connection.config.password = undefined; connection.config.passwordSha1 = undefined; } }
  function destroy() { if (!closed && !poisoned) { poisoned = true; destroys++; trace.push('DESTROY'); connection?.destroy(); connection?.stream?.destroy(); peer?.stream.destroy(); } release(); }
  function wait(action) {
    live(); return new Promise((resolve, reject) => {
      let settled = false; const done = (error, value) => { if (settled || poisoned || closed) return; if (!error && (performance.now() >= deadline || (execution && Date.now() >= execution.expiresAtMs))) error = 'MYSQL2_STOPPED'; settled = true; clearTimeout(timer); pendingReject = null; if (error) { destroy(); reject(Object.assign(Error(error), { code: error })); } else resolve(value); };
      const timer = setTimeout(() => done('MYSQL2_OPERATION_TIMEOUT'), Math.min(limits.timeoutMs, Math.max(1, deadline - performance.now())));
      pendingReject = () => done('MYSQL2_DRIVER_FAILED');
      try { action(done); } catch { done('MYSQL2_DRIVER_FAILED'); }
    });
  }
  async function query(key, values = []) {
    live(); const sql = contract.sqlContract[key] || { SET_ISOLATION: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', START_READ_ONLY: 'START TRANSACTION READ ONLY', ROLLBACK: 'ROLLBACK' }[key];
    trace.push(key);
    if (!(key in contract.sqlContract)) return wait(done => connection.query({ sql, values }, err => done(err ? 'MYSQL2_DRIVER_FAILED' : null)));
    selects++; const rows = []; let projected, rawQuery = 2, normQuery = 2;
    const cap = { R1: 1, R2: 2, R3: 2, R4: 2, R5: 4, R6: 2, R7: 2 }[key];
    return wait(done => {
      // Event mode prevents mysql2 callback-mode unbounded row accumulation.
      const q = connection.query({ sql, values });
      q.on('error', () => done('MYSQL2_DRIVER_FAILED'));
      q.on('fields', (packets, index) => {
        if (poisoned || closed) return;
        try {
          if (index && index !== 0) fail('MYSQL2_FIELDS_REJECTED');
          projected = packets.map(f => ({ name: f.name, columnType: f.columnType, flags: f.flags, characterSet: f.characterSet }));
          metadata.push({ key, fields: projected });
          const names = contract.schemaContract[key].split(' ');
          if (projected.length !== names.length || new Set(projected.map(f => f.name)).size !== names.length || projected.some(f => !names.includes(f.name) || !typeAllowed(f.name, f.columnType))) fail('MYSQL2_FIELDS_REJECTED');
        } catch (e) { done(e.code || 'MYSQL2_FIELDS_REJECTED'); }
      });
      q.on('result', (row, index) => {
        if (poisoned || closed) return;
        try {
          if (!projected || index !== 0 || rows.length >= cap) fail('MYSQL2_ROWS_REJECTED');
          const raw = Buffer.byteLength(JSON.stringify(row));
          rawQuery += raw + (rows.length ? 1 : 0);
          if (raw > limits.row || rawQuery > limits.query || rawBytes + rawQuery > limits.batch) fail('MYSQL2_BYTES_EXCEEDED');
          const n = normalize(key, row), bytes = Buffer.byteLength(JSON.stringify(n)); normQuery += bytes + (rows.length ? 1 : 0);
          maxRowBytes = Math.max(maxRowBytes, raw, bytes);
          if (bytes > limits.row || normQuery > limits.query || normalizedBytes + normQuery > limits.batch) fail('MYSQL2_BYTES_EXCEEDED'); rows.push(n);
        } catch (e) { done(e.code || 'MYSQL2_SCHEMA_REJECTED'); }
      });
      q.on('end', () => { if (poisoned || closed) return; maxQueryBytes = Math.max(maxQueryBytes, rawQuery, normQuery); rawBytes += rawQuery; normalizedBytes += normQuery; done(null, rows); });
    });
  }
  let status = 'NO_GO', errorCode, discovery;
  const one = rows => { if (rows.length !== 1) fail('MYSQL2_IDENTITY_HOLD'); return rows[0]; };
  const valid = t => t === null || Date.parse(t) > Date.now();
  const hold = condition => { if (!condition) fail('MYSQL2_IDENTITY_HOLD'); };
  try {
    live();
    record = execution?.lane === 'production-seven-read' ? readApprovedRecord(() => configurationReads++) : readFixtureRecord(options.fixtureFile, () => configurationReads++);
    live();
    const mysql = require('mysql2');
    if (execution?.lane !== 'production-seven-read') peer = require('./v019-mysql2-memory-peer').createMemoryPeer(fault, execution ? record : undefined);
    await wait(done => {
      trace.push('CREATE_CONNECTION');
      live(); connection = mysql.createConnection({ host: record.DB_HOST, port: Number(record.DB_PORT), database: record.DB_NAME, user: record.DB_USER, password: record.DB_PASSWORD, ...(peer ? { stream: peer.stream } : {}), timezone: 'Z', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false, flags: '-LOCAL_FILES,-MULTI_RESULTS,-MULTI_STATEMENTS', connectTimeout: limits.timeoutMs, debug: false, trace: false });
      connection.on('error', () => pendingReject?.()); connection.connect(err => done(err ? 'MYSQL2_DRIVER_FAILED' : null));
    }); release();
    const target = one(await query('R1')); hold(target.port === 3306 && target.server_id === 1 && target.version === '10.4.14-MariaDB' && target.database_name === 'public_opinion' && Math.abs(Date.parse(target.now_utc) - Date.now()) < 30000);
    await query('SET_ISOLATION'); await query('START_READ_ONLY');
    const source = one(await query('R2', [contract.sourceId])); observed.source = source;
    hold(source.id === contract.sourceId && source.platform === 'bigplayer_h5' && source.enabled === 1 && source.auth_status === 'authorized' && valid(source.auth_expire_at) && source.board_id === '100017');
    const account = one(await query('R3', [contract.sourceId])); observed.account = account;
    hold(account.source_id === source.id && account.game_id === source.game_id && account.community_id === source.community_id && account.platform === source.platform && account.enabled === 1 && account.auth_status === 'authorized' && valid(account.auth_expire_at) && (source.default_account_id === null || source.default_account_id === account.id));
    const credential = one(await query('R4', [contract.sourceId, account.id, 'api_token'])); observed.credential = credential;
    hold(credential.source_id === source.id && credential.account_id === account.id && credential.credential_type === 'api_token' && credential.status === 'active' && credential.has_cipher === 1 && valid(credential.expire_at));
    const sites = await query('R5', [contract.sourceId]);
    hold(sites.length === 3 && ['id', 'site_id', 'url_hash'].every(k => new Set(sites.map(s => s[k])).size === 3) && sites.every(s => s.source_id === source.id && s.enabled === 1 && ['authorized', 'unknown'].includes(s.auth_status)));
    const game = one(await query('R6', [source.game_id])); hold(game.id === source.game_id && game.region_code === 'overseas' && game.enabled === 1);
    const community = one(await query('R7', [source.community_id])); hold(community.id === source.community_id && community.game_id === game.id && community.status === 'enabled');
    hold(valid(source.auth_expire_at) && valid(account.auth_expire_at) && valid(credential.expire_at)); await query('ROLLBACK');
    trace.push('END');
    await wait(done => { connection.stream.once('close', () => done(null)); connection.end(err => { trace.push('END_CALLBACK'); if (err) done('MYSQL2_DRIVER_FAILED'); }); });
    closed = true; hold(performance.now() < deadline && (!execution || Date.now() < execution.expiresAtMs) && valid(source.auth_expire_at) && valid(account.auth_expire_at) && valid(credential.expire_at));
    status = execution?.lane === 'production-seven-read' ? 'SEVEN_READ_COMPLETED' : 'ISOLATED_ACTUAL_MYSQL2_PROTOCOL_PASS'; discovery = { sourceId: source.id, accountId: account.id, credentialId: credential.id, registry: sites.map(s => ({ registryId: s.id, siteId: s.site_id, urlHash: s.url_hash, authStatus: s.auth_status })), manifestSha256: options.manifestSha256, approvalForSecretRead: false };
  } catch (e) { destroy(); errorCode = /^MYSQL2_[A-Z_]+$/.test(e.code || '') ? e.code : 'MYSQL2_INTERNAL_FAILED'; }
  finally { release(); for (const k of Object.keys(observed)) delete observed[k]; }
  return { kind: execution?.lane === 'production-seven-read' ? 'SEVEN_READ_EXECUTION_EVIDENCE' : 'DEV_TEST_EVIDENCE', status, errorCode, discovery, actualMysql2Loaded: Boolean(connection), realConnectionOpened: execution?.lane === 'production-seven-read' && Boolean(connection), realConfigurationRead: execution?.lane === 'production-seven-read' && configurationReads === 1, configurationReads, fixtureFileReadOnce: execution?.lane !== 'production-seven-read' && configurationReads === 1, grantStatus: 'unverified', trace, metadata, selects, rawBytes, normalizedBytes, maxRowBytes, maxQueryBytes, closed, poisoned, destroys, reconnectCount: 0, peer: peer?.evidence() };
}
function readApprovedRecord(onRead) {
  // Reachable only through a signed production capability after exclusive claim.
  const absolute = path.resolve(contract.configurationPath);
  if (fs.realpathSync(path.dirname(absolute)) !== path.dirname(absolute) || fs.lstatSync(absolute).isSymbolicLink()) fail('MYSQL2_CONFIG_REJECTED');
  const fd = fs.openSync(absolute, 'r'); let bytes;
  try { if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).size > 65536) fail('MYSQL2_CONFIG_REJECTED'); bytes = fs.readFileSync(fd); onRead(); return parseRecord(bytes); }
  finally { fs.closeSync(fd); bytes?.fill(0); }
}
function runIsolatedMysql2(input) { return runEngine(input); }
const normalized = p => path.resolve(p).replaceAll('\\', '/');
const command = Object.freeze({ program: 'node', entrypoint: 'scripts/v019-seven-read-cli.js', mode: '--execute', argument: '--permit-base64' });
const budget = Object.freeze({ selects: 7, rowLimits: [1, 2, 2, 2, 4, 2, 2], perRowBytes: 16384, perQueryBytes: 32768, batchBytes: 65536, operationTimeoutMs: 1000, totalTimeoutMs: 300000, connectionCount: 1, retryCount: 0, reconnectCount: 0 });
const forbidden = Object.freeze({ r8: false, http: false, token: false, ai: false, ddl: false, acl: false, services: false, domestic: false });
function validateEnvelope(input, lane) {
  const e = snapshot(input); keys(e, 'payload signature keyId');
  const p = e.payload;
  keys(p, 'version lane scope sourceId target artifactDirectory artifactManifestSha256 sqlSha256 command configuration budget forbidden issuedAt expiresAt nonce outputDirectory owner retentionDays decisionId authorityFingerprint');
  keys(p.target, 'host port database serverId version'); keys(p.configuration, 'path physicalRead readCount selectedFields identityGrantStatus');
  if (p.version !== 1 || p.lane !== lane || p.scope !== 'overseas-seven-select-readonly' || p.sourceId !== contract.sourceId || p.artifactDirectory !== normalized(artifact)
    || canonical(p.target) !== canonical({ host: '127.0.0.1', port: 3306, database: 'public_opinion', serverId: 1, version: '10.4.14-MariaDB' })
    || !/^[a-f0-9]{64}$/.test(p.artifactManifestSha256 || '') || p.sqlSha256 !== hash(canonical(contract.sqlContract)) || canonical(p.command) !== canonical(command)
    || canonical(p.budget) !== canonical(budget) || canonical(p.forbidden) !== canonical(forbidden) || p.owner !== 'development-lead' || p.retentionDays !== 30
    || !/^[a-f0-9]{32}$/.test(p.nonce || '') || !/^[A-Za-z0-9._-]{1,100}$/.test(p.decisionId || '') || !/^[a-f0-9]{64}$/.test(p.authorityFingerprint || '')
    || !/^[A-Za-z0-9._-]{1,100}$/.test(e.keyId || '') || typeof e.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(e.signature)) fail('PERMIT_SCOPE_REJECTED');
  const prefix = lane === 'production-seven-read' ? 'v019-seven-read-output-' : 'v019-seven-read-fixture-output-';
  if (p.outputDirectory !== normalized(path.join(root, '.temp', prefix + p.nonce))) fail('PERMIT_OUTPUT_REJECTED');
  if (p.configuration.physicalRead !== 'whole-specified-file' || p.configuration.readCount !== 1 || canonical(p.configuration.selectedFields) !== canonical(contract.selectedFields) || p.configuration.identityGrantStatus !== 'unverified') fail('PERMIT_CONFIGURATION_REJECTED');
  if (lane === 'production-seven-read') { if (p.configuration.path !== contract.configurationPath) fail('PERMIT_CONFIGURATION_REJECTED'); }
  else {
    const f = path.resolve(p.configuration.path), dir = path.dirname(f);
    if (p.configuration.path !== normalized(f) || path.dirname(dir) !== path.join(root, '.temp') || !path.basename(dir).startsWith('v019-mysql2-config-fixture-') || path.basename(f) !== 'synthetic-config.txt') fail('PERMIT_CONFIGURATION_REJECTED');
  }
  const now = Date.now(), issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || new Date(issued).toISOString() !== p.issuedAt || new Date(expires).toISOString() !== p.expiresAt || issued > now || expires <= now || expires <= issued || expires - issued > 300000) fail('PERMIT_EXPIRED');
  return e;
}
function publicKey(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 256) fail('PERMIT_ANCHOR_REJECTED');
  let key; try { key = crypto.createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' }); } catch { fail('PERMIT_ANCHOR_REJECTED'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('PERMIT_ANCHOR_REJECTED'); return key;
}
function verifySignature(e, encoded) {
  const key = publicKey(encoded), der = key.export({ format: 'der', type: 'spki' });
  if (hash(der) !== e.payload.authorityFingerprint || !crypto.verify(null, Buffer.from(canonical(e.payload)), key, Buffer.from(e.signature, 'base64'))) fail('PERMIT_SIGNATURE_REJECTED');
}
function productionAnchor(e) {
  // Fixed, public, manager-controlled receipt. Never accepted from CLI/env/fixture.
  const temp = path.join(root, '.temp');
  if (fs.realpathSync(temp) !== temp) fail('PERMIT_ANCHOR_REJECTED');
  let bytes;
  try { const stat = fs.lstatSync(anchorPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) fail('PERMIT_ANCHOR_REJECTED'); bytes = fs.readFileSync(anchorPath); }
  catch (err) { if (err.code === 'ENOENT') fail('TRUST_ANCHOR_UNENROLLED'); throw err; }
  let a; try { a = snapshot(JSON.parse(bytes)); } catch { fail('PERMIT_ANCHOR_REJECTED'); }
  keys(a, 'kind issuer keyId publicKeySpkiBase64 fingerprint decisionId artifactManifestSha256 approvedEnvelopeSha256 expiresAt');
  if (a.kind !== 'MANAGER_USER_DECISION_PUBLIC_ANCHOR' || a.issuer !== 'project-manager' || a.keyId !== e.keyId || a.fingerprint !== e.payload.authorityFingerprint || a.decisionId !== e.payload.decisionId
    || a.artifactManifestSha256 !== e.payload.artifactManifestSha256 || a.approvedEnvelopeSha256 !== hash(canonical(e)) || a.expiresAt !== e.payload.expiresAt) fail('PERMIT_ANCHOR_REJECTED');
  return a.publicKeySpkiBase64;
}
function claim(e) {
  const p = e.payload;
  if (Date.now() >= Date.parse(p.expiresAt)) fail('PERMIT_EXPIRED');
  require('./v019-seven-read-freeze').verifyArtifact(p.artifactManifestSha256);
  const temp = path.join(root, '.temp'); if (fs.realpathSync(temp) !== temp) fail('PERMIT_OUTPUT_REJECTED');
  const directory = path.resolve(p.outputDirectory);
  try { fs.mkdirSync(directory); } catch (err) { if (err.code === 'EEXIST') fail('PERMIT_ALREADY_CLAIMED'); throw err; }
  // Never remove this directory or claim, including on exceptions/crashes.
  const record = { kind: 'SEVEN_READ_EXCLUSIVE_CLAIM', lane: p.lane, nonce: p.nonce, decisionId: p.decisionId, artifactManifestSha256: p.artifactManifestSha256, envelopeSha256: hash(canonical(e)), owner: p.owner, retentionDays: p.retentionDays, state: 'CLAIMED_NO_AUTOMATIC_REPLAY', claimedAt: new Date().toISOString() };
  const fd = fs.openSync(path.join(directory, 'claim.json'), 'wx'); try { fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (Date.now() >= Date.parse(p.expiresAt)) fail('PERMIT_EXPIRED');
  const cap = Object.freeze(Object.create(null));
  capabilities.set(cap, { lane: p.lane, configurationPath: p.configuration.path, manifestSha256: p.artifactManifestSha256, expiresAtMs: Date.parse(p.expiresAt), operationTimeoutMs: p.budget.operationTimeoutMs, totalTimeoutMs: p.budget.totalTimeoutMs, directory, nonce: p.nonce });
  return cap;
}
function authorizeProduction(input) { const e = validateEnvelope(input, 'production-seven-read'); verifySignature(e, productionAnchor(e)); return claim(e); }
function authorizeFixture(input, publicKeySpkiBase64) { const e = validateEnvelope(input, 'fixture-seven-read'); verifySignature(e, publicKeySpkiBase64); return claim(e); }
function consumeExecution(capability) {
  const p = capabilities.get(capability); if (!p) fail('PERMIT_CAPABILITY_REJECTED'); capabilities.delete(capability);
  consumed.set(capability, p);
  if (Date.now() >= p.expiresAtMs) fail('PERMIT_EXPIRED'); return p;
}
function finishExecution(capability, result) {
  const p = consumed.get(capability); if (!p) fail('PERMIT_CAPABILITY_REJECTED'); consumed.delete(capability);
  if (Date.now() >= p.expiresAtMs && result.status !== 'NO_GO') result = { status: 'NO_GO', errorCode: 'PERMIT_EXPIRED', discoveryPublished: false };
  const output = path.join(p.directory, 'result.json'), fd = fs.openSync(output, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify({ ...result, owner: 'development-lead', retentionDays: 30, automaticReplayAllowed: false }, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { status: result.status, errorCode: result.errorCode, output, sha256: hash(fs.readFileSync(output)) };
}
async function executeCapability(capability) {
  let result;
  try {
    const execution = consumeExecution(capability);
    result = await runEngine({ fixtureFile: execution.configurationPath, manifestSha256: execution.manifestSha256, timeoutMs: execution.operationTimeoutMs, totalTimeoutMs: execution.totalTimeoutMs }, execution);
  } catch (err) {
    if (err.code === 'PERMIT_CAPABILITY_REJECTED') throw err;
    result = { status: 'NO_GO', errorCode: /^(PERMIT|MYSQL2)_[A-Z_]+$/.test(err.code || '') ? err.code : 'PERMIT_EXECUTION_FAILED' };
  }
  return finishExecution(capability, result);
}
async function executeProduction(input) { return executeCapability(authorizeProduction(input)); }
async function executeFixture(input, key) { return executeCapability(authorizeFixture(input, key)); }
function claimFixtureOnly(input, key) {
  const cap = authorizeFixture(input, key);
  capabilities.delete(cap);
  return { status: 'FIXTURE_CLAIM_ABANDONED_NO_REPLAY', outputDirectory: input.payload.outputDirectory };
}
module.exports = Object.freeze({ executeProduction, executeFixture, claimFixtureOnly, runIsolatedMysql2, canonical, hash, anchorPath, command, budget, forbidden });
