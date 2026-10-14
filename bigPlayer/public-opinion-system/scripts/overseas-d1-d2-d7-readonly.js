'use strict';

// Fixed-scope production evidence reader. It never writes to the target DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const PROJECT = path.resolve(__dirname, '..');
const TARGET = Object.freeze({ host: '127.0.0.1', port: 3306, database: 'public_opinion', serverId: 1 });
const SOURCE_IDS = Object.freeze([
  '081a16d2-5545-4afd-9c65-e04777e4540b',
  '8c690d6e-12ea-4ad3-b434-d941276c4906'
]);
const SOURCE_HMAC_SALT = 'd1-d2-d7-20261010';
const SQL = Object.freeze({
  identity: 'SELECT @@hostname AS hostname,@@port AS port,@@server_id AS serverId,VERSION() AS version,DATABASE() AS databaseName,CURRENT_USER() AS currentUser',
  sources: "SELECT id,game_id,platform,source_type,enabled,auth_status,community_id,default_account_id,schedule_version,config FROM po_sources WHERE id IN (?,?) ORDER BY id",
  accounts: 'SELECT id,source_id,game_id,community_id,platform,account_type,enabled,auth_status,auth_expire_at FROM po_accounts WHERE source_id IN (?,?) ORDER BY source_id,id',
  credentials: "SELECT source_id,account_id,credential_type,status,expire_at,last_checked_at,CASE WHEN secret_cipher IS NULL OR OCTET_LENGTH(secret_cipher)=0 THEN 0 ELSE 1 END AS hasCipher,CASE WHEN secret_ref IS NULL OR secret_ref='' THEN 0 ELSE 1 END AS hasRef FROM po_credentials WHERE source_id IN (?,?) ORDER BY source_id,account_id,credential_type",
  sites: 'SELECT source_id,site_id,url,url_hash,enabled,auth_status,capabilities,last_error_code,last_checked_at FROM po_source_sites WHERE source_id IN (?,?) ORDER BY source_id,site_id',
  capabilities: 'SELECT source_id,capability,status,detail,checked_at FROM po_source_capabilities WHERE source_id IN (?,?) ORDER BY source_id,capability',
  games: "SELECT id,region_code,external_id,enabled FROM po_games WHERE id IN (SELECT game_id FROM po_sources WHERE id IN (?,?)) ORDER BY id",
  aiUsage: 'SELECT usage_date,profile,call_count,input_tokens,output_tokens,total_tokens FROM po_ai_usage_daily ORDER BY usage_date DESC,profile LIMIT 30',
  translationUsage: 'SELECT usage_date,call_count FROM po_translation_call_budget ORDER BY usage_date DESC LIMIT 30'
});

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function hmac(value) { return crypto.createHmac('sha256', SOURCE_HMAC_SALT).update(String(value)).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function parseEnv(file) {
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}
function parseJson(value) { try { return JSON.parse(value || '{}'); } catch { return null; } }
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://club-en.q1.com' || url.pathname !== '/' || url.username || url.password || url.hash) return { invalid: true };
    const allowed = new Set(['env', 'gameId', 'gameVersion', 'lang', 'languageId']);
    const params = {};
    for (const [key, item] of url.searchParams) {
      // Exclude secret and unknown values from both output and digest.
      if (!allowed.has(key)) continue;
      if (Object.hasOwn(params, key) || !/^[A-Za-z0-9_-]{1,64}$/.test(item)) return { invalid: true };
      params[key] = item;
    }
    const projection = { origin: url.origin, path: url.pathname, params };
    return { ...projection, hashKind: 'nonsecret-url-projection-v2', sha256: hash(canonical(projection)) };
  } catch { return { invalid: true }; }
}
function safeObject(value) {
  const input = parseJson(value);
  if (!input || typeof input !== 'object') return { parse: 'INVALID', sha256: hash(value) };
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    const output = {};
    for (const [key, child] of Object.entries(item)) {
      if (/token|secret|password|cookie|authorization|credential|webhook|api.?key/i.test(key)) output[key] = '[REDACTED]';
      else if (typeof child === 'string' && /^https?:/i.test(child)) output[key] = safeUrl(child);
      else output[key] = visit(child);
    }
    return output;
  };
  return visit(input);
}
function safeCapabilityDetail(value) {
  const input = parseJson(value);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { parse: 'INVALID' };
  const output = {};
  if (typeof input.status === 'string') output.status = input.status;
  if (typeof input.available === 'boolean') output.available = input.available;
  if (typeof input.requiresParentId === 'boolean') output.requiresParentId = input.requiresParentId;
  if (input.samplePostId != null) output.samplePostHmac = hmac(input.samplePostId);
  return output;
}
function safeCapabilityMap(value) {
  const input = parseJson(value);
  return input && typeof input === 'object' && !Array.isArray(input) ? { keys: Object.keys(input).sort() } : { parse: 'INVALID' };
}
function safeSource(row) {
  const config = parseJson(row.config) || {};
  const siteProjection = (config.siteUrls || []).map(site => ({
    siteHmac: site.siteId ? hmac(site.siteId) : null,
    url: safeUrl(site.url), enabled: !!site.enabled, authStatus: site.authStatus || null
  }));
  const bindingProjection = {
    scheduleVersion: String(row.schedule_version),
    boardId: config.boardId || null, baseUrl: safeUrl(config.baseUrl), sites: siteProjection,
    syncMode: config.syncMode || null, historyStart: config.historyStart || null,
    editionScope: config.editionScope || null, startPathsCount: Array.isArray(config.startPaths) ? config.startPaths.length : 0
  };
  return {
    sourceHmac: hmac(row.id), gameHmac: hmac(row.game_id), platform: row.platform,
    sourceType: row.source_type, enabled: !!row.enabled, authStatus: row.auth_status,
    communityHmac: hmac(row.community_id), defaultAccountHmac: hmac(row.default_account_id),
    scheduleVersion: row.schedule_version, projectionVersion: 'nonsecret-config-v2',
    configProjection: bindingProjection, configProjectionSha256: hash(canonical(bindingProjection)),
    bindingFields: Object.keys(bindingProjection).sort(),
    boardId: config.boardId || null,
    baseUrl: safeUrl(config.baseUrl), configuredSites: (config.siteUrls || []).map(site => ({
      siteHmac: site.siteId ? hmac(site.siteId) : null, enabled: !!site.enabled, authStatus: site.authStatus || null, url: safeUrl(site.url)
    })), syncMode: config.syncMode || null, historyStart: config.historyStart || null
  };
}
function safeQuery(name, sql) { return { name, sql, sha256: hash(sql) }; }
function envSummary(env) {
  return {
    analysisEnabled: env.AI_ANALYSIS_ENABLED, analysisModel: env.AI_ANALYSIS_LIGHT_MODEL,
    analysisVersion: env.AI_ANALYSIS_LIGHT_VERSION, analysisDailyCallLimit: env.AI_ANALYSIS_LIGHT_DAILY_CALL_LIMIT,
    deepModel: env.AI_ANALYSIS_DEEP_MODEL, deepVersion: env.AI_ANALYSIS_DEEP_VERSION,
    deepDailyCallLimit: env.AI_ANALYSIS_DEEP_DAILY_CALL_LIMIT, translationEnabled: env.AI_TRANSLATION_ENABLED,
    translationModel: env.AI_TRANSLATION_MODEL, translationVersion: env.AI_TRANSLATION_VERSION,
    translationDailyCallLimit: env.AI_TRANSLATION_DAILY_CALL_LIMIT,
    secretPresence: { analysisToken: !!env.AI_ANALYSIS_TOKEN, credentialKey: !!env.CREDENTIAL_ENC_KEY, providerToken: !!env.COMMUNITY_PROVIDER_TOKEN }
  };
}

async function run({ connect = mysql.createConnection, envPath = path.join(PROJECT, '.env'), outputRoot = path.resolve(PROJECT, '..', '..', '.temp') } = {}) {
  const env = parseEnv(envPath);
  if (env.DB_HOST !== TARGET.host || Number(env.DB_PORT) !== TARGET.port || env.DB_NAME !== TARGET.database) throw new Error('TARGET_CONFIG_MISMATCH');
  const startedAt = new Date().toISOString();
  const evidence = {
    status: 'NO_GO', code: 'NOT_STARTED', target: { host: TARGET.host, port: TARGET.port, database: '[REDACTED_SCHEMA]', serverId: TARGET.serverId }, startedAt, finishedAt: null,
    transaction: { startSql: 'START TRANSACTION READ ONLY', rollbackSql: 'ROLLBACK', rolledBack: false, connectionEnded: false },
    identity: null, queryWhitelist: Object.entries(SQL).map(([name, sql]) => safeQuery(name, sql)),
    sources: [], accounts: [], credentials: [], sites: [], capabilities: [], games: [], aiUsage: [], translationUsage: [],
    env: envSummary(env), blockers: ['PRODUCTION_EXECUTOR_DISABLED', 'NO_HTTP_OR_TOKEN_EXCHANGE']
  };
  let connection;
  try {
    connection = await connect({ host: TARGET.host, port: TARGET.port, database: TARGET.database, user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: 3000, dateStrings: true, timezone: 'Z' });
    await connection.query('START TRANSACTION READ ONLY');
    const query = async (sql, params = []) => {
      if (!Object.values(SQL).includes(sql)) throw new Error('SQL_NOT_WHITELISTED');
      const [rows] = await connection.query({ sql, timeout: 4000 }, params);
      return rows;
    };
    const [identity] = await query(SQL.identity);
    if (!identity || Number(identity.port) !== TARGET.port || Number(identity.serverId) !== TARGET.serverId || identity.databaseName !== TARGET.database || !/^10\.4\.14-MariaDB$/.test(identity.version)) throw new Error('TARGET_IDENTITY_MISMATCH');
    evidence.identity = { port: Number(identity.port), serverId: Number(identity.serverId), version: identity.version, database: '[REDACTED_SCHEMA]', currentUserHmac: hmac(identity.currentUser) };
    const params = [SOURCE_IDS[0], SOURCE_IDS[1]];
    const sources = await query(SQL.sources, params);
    const accounts = await query(SQL.accounts, params);
    const credentials = await query(SQL.credentials, params);
    const sites = await query(SQL.sites, params);
    const capabilities = await query(SQL.capabilities, params);
    const games = await query(SQL.games, params);
    evidence.sources = sources.map(safeSource);
    evidence.accounts = accounts.map(row => ({ accountHmac: hmac(row.id), sourceHmac: hmac(row.source_id), gameHmac: hmac(row.game_id), communityHmac: hmac(row.community_id), platform: row.platform, accountType: row.account_type, enabled: !!row.enabled, authStatus: row.auth_status, authExpireAt: row.auth_expire_at }));
    evidence.credentials = credentials.map(row => ({ sourceHmac: hmac(row.source_id), accountHmac: hmac(row.account_id), type: row.credential_type, status: row.status, expireAt: row.expire_at, lastCheckedAt: row.last_checked_at, hasCipher: !!row.hasCipher, hasRef: !!row.hasRef }));
    evidence.sites = sites.map(row => ({ sourceHmac: hmac(row.source_id), siteAlias: `site-${hmac(row.site_id).slice(0, 12)}`, url: safeUrl(row.url), storedUrlHash: row.url_hash, enabled: !!row.enabled, authStatus: row.auth_status, capabilities: safeCapabilityMap(row.capabilities), lastErrorCode: row.last_error_code, lastCheckedAt: row.last_checked_at }));
    evidence.capabilities = capabilities.map(row => ({ sourceHmac: hmac(row.source_id), capability: row.capability, status: row.status, detail: safeCapabilityDetail(row.detail), checkedAt: row.checked_at }));
    evidence.games = games.map(row => ({ gameHmac: hmac(row.id), regionCode: row.region_code, externalId: row.external_id, enabled: !!row.enabled }));
    evidence.aiUsage = await query(SQL.aiUsage);
    evidence.translationUsage = await query(SQL.translationUsage);
    evidence.code = 'READONLY_EVIDENCE_COLLECTED';
  } catch (error) {
    evidence.code = /^[A-Z0-9_]+$/.test(error.code || error.message) ? (error.code || error.message) : 'READONLY_QUERY_FAILED';
  } finally {
    if (connection) {
      await connection.rollback().then(() => { evidence.transaction.rolledBack = true; }).catch(() => {});
      await connection.end().then(() => { evidence.transaction.connectionEnded = true; }).catch(() => {});
    }
    evidence.finishedAt = new Date().toISOString();
  }
  const dir = fs.mkdtempSync(path.join(outputRoot, 'overseas-d1-d2-d7-'));
  const output = path.join(dir, 'result.json');
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  return { output, evidence };
}

if (require.main === module) run().then(({ output, evidence }) => {
  process.stdout.write(JSON.stringify({ output, status: evidence.status, code: evidence.code, transaction: evidence.transaction }) + '\n');
  if (evidence.code !== 'READONLY_EVIDENCE_COLLECTED' || !evidence.transaction.rolledBack || !evidence.transaction.connectionEnded) process.exitCode = 1;
}).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1; });

module.exports = { run, SQL, safeSource, safeUrl, safeObject, safeCapabilityDetail, safeCapabilityMap, canonical };
