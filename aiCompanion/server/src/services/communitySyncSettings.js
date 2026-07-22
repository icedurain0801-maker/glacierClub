const db = require('../config/db');
const defaults = require('../config/communitySync');

function boolValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function numberValue(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maxPagesValue(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(parsed, 0);
}

function stringValue(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function listValue(value, fallback = []) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
  }
  return fallback;
}

function normalizeStartPaths(value, fallback = defaults.startPaths) {
  const paths = listValue(value, fallback);
  return paths.length ? paths : [...fallback];
}

function jsonObjectValue(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hostFromUrl(value) {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function boundedNumber(value, fallback, min, max) {
  const parsed = numberValue(value, fallback);
  return Math.min(Math.max(parsed, min), max);
}

function rowToConfig(row) {
  if (!row) return null;
  return {
    enabled: boolValue(row.enabled),
    runOnStart: boolValue(row.run_on_start),
    intervalMs: numberValue(row.interval_ms, defaults.intervalMs),
    scheduleHour: boundedNumber(row.schedule_hour, defaults.scheduleHour, 0, 23),
    scheduleMinute: boundedNumber(row.schedule_minute, defaults.scheduleMinute, 0, 59),
    baseUrl: stringValue(row.base_url, ''),
    loginUrl: stringValue(row.login_url, ''),
    authCheckPath: stringValue(row.auth_check_path, ''),
    startPaths: normalizeStartPaths(parseJson(row.start_paths, defaults.startPaths), defaults.startPaths),
    allowedHosts: listValue(parseJson(row.allowed_hosts, defaults.allowedHosts), defaults.allowedHosts),
    authCookie: stringValue(row.auth_cookie, ''),
    username: stringValue(row.username, ''),
    password: stringValue(row.password, ''),
    usernameField: stringValue(row.username_field, defaults.usernameField),
    passwordField: stringValue(row.password_field, defaults.passwordField),
    extraLoginFields: jsonObjectValue(parseJson(row.extra_login_fields, {}), {}),
    loginSuccessText: stringValue(row.login_success_text, ''),
    loginFailureText: stringValue(row.login_failure_text, ''),
    authCheckText: stringValue(row.auth_check_text, ''),
    userAgent: stringValue(row.user_agent, defaults.userAgent),
    requestTimeoutMs: numberValue(row.request_timeout_ms, defaults.requestTimeoutMs),
    maxRetries: numberValue(row.max_retries, defaults.maxRetries),
    retryBaseMs: numberValue(row.retry_base_ms, defaults.retryBaseMs),
    delayMs: numberValue(row.delay_ms, defaults.delayMs),
    maxPages: maxPagesValue(row.max_pages, defaults.maxPages),
    maxDepth: numberValue(row.max_depth, defaults.maxDepth),
    minContentChars: numberValue(row.min_content_chars, defaults.minContentChars),
    maxContentChars: numberValue(row.max_content_chars, defaults.maxContentChars),
    loginFailureCount: numberValue(row.login_failure_count, 0),
    loginBlockedUntil: row.login_blocked_until || null,
    lastLoginError: stringValue(row.last_login_error, ''),
  };
}

function mergeWithDefaults(config, versionId) {
  const merged = {
    ...defaults,
    ...(config || {}),
    versionId,
    versionCode: '',
    enabled: config ? config.enabled : defaults.enabled,
  };
  if ((!merged.allowedHosts || merged.allowedHosts.length === 0) && merged.baseUrl) {
    const host = hostFromUrl(merged.baseUrl);
    if (host) merged.allowedHosts = [host];
  }
  return merged;
}

function toPublic(config) {
  const safe = { ...config };
  safe.authCookieConfigured = Boolean(config.authCookie);
  safe.passwordConfigured = Boolean(config.password);
  safe.usernameConfigured = Boolean(config.username);
  safe.baseUrlConfigured = Boolean(config.baseUrl);
  safe.loginUrlConfigured = Boolean(config.loginUrl);
  safe.authCheckConfigured = Boolean(config.authCheckPath);
  safe.loginFailureCount = Number(config.loginFailureCount || 0);
  safe.loginBlockedUntil = config.loginBlockedUntil || null;
  safe.lastLoginError = config.lastLoginError || '';
  delete safe.authCookie;
  delete safe.password;
  return safe;
}

async function getStoredConfig(versionId) {
  const [rows] = await db.query('SELECT * FROM community_sync_settings WHERE version_id=?', [versionId]);
  return rowToConfig(rows[0]);
}

async function getEffectiveConfig(versionId) {
  return mergeWithDefaults(await getStoredConfig(versionId), versionId);
}

async function listEnabledConfigs() {
  const [rows] = await db.query('SELECT * FROM community_sync_settings WHERE enabled=1');
  return rows.map(row => mergeWithDefaults(rowToConfig(row), row.version_id));
}

async function saveConfig(versionId, body) {
  const existing = await getStoredConfig(versionId);
  const baseUrl = stringValue(body.baseUrl, existing?.baseUrl || '');
  const baseHost = hostFromUrl(baseUrl);
  const allowedHostsFallback = existing?.allowedHosts || (baseHost ? [baseHost] : defaults.allowedHosts);
  const next = {
    enabled: boolValue(body.enabled),
    runOnStart: boolValue(body.runOnStart),
    intervalMs: numberValue(body.intervalMs, existing?.intervalMs || defaults.intervalMs),
    scheduleHour: boundedNumber(body.scheduleHour, existing?.scheduleHour ?? defaults.scheduleHour, 0, 23),
    scheduleMinute: boundedNumber(body.scheduleMinute, existing?.scheduleMinute ?? defaults.scheduleMinute, 0, 59),
    baseUrl,
    loginUrl: stringValue(body.loginUrl, existing?.loginUrl || ''),
    authCheckPath: stringValue(body.authCheckPath, existing?.authCheckPath || ''),
    startPaths: normalizeStartPaths(body.startPaths, existing?.startPaths || defaults.startPaths),
    allowedHosts: listValue(body.allowedHosts, allowedHostsFallback),
    authCookie: body.clearAuthCookie ? '' : (stringValue(body.authCookie) || existing?.authCookie || ''),
    username: stringValue(body.username, existing?.username || ''),
    password: body.clearPassword ? '' : (stringValue(body.password) || existing?.password || ''),
    usernameField: stringValue(body.usernameField, existing?.usernameField || defaults.usernameField),
    passwordField: stringValue(body.passwordField, existing?.passwordField || defaults.passwordField),
    extraLoginFields: jsonObjectValue(body.extraLoginFields, existing?.extraLoginFields || {}),
    loginSuccessText: stringValue(body.loginSuccessText, existing?.loginSuccessText || ''),
    loginFailureText: stringValue(body.loginFailureText, existing?.loginFailureText || ''),
    authCheckText: stringValue(body.authCheckText, existing?.authCheckText || ''),
    userAgent: stringValue(body.userAgent, existing?.userAgent || defaults.userAgent),
    requestTimeoutMs: numberValue(body.requestTimeoutMs, existing?.requestTimeoutMs || defaults.requestTimeoutMs),
    maxRetries: numberValue(body.maxRetries, existing?.maxRetries || defaults.maxRetries),
    retryBaseMs: numberValue(body.retryBaseMs, existing?.retryBaseMs || defaults.retryBaseMs),
    delayMs: numberValue(body.delayMs, existing?.delayMs || defaults.delayMs),
    maxPages: maxPagesValue(body.maxPages, existing?.maxPages ?? defaults.maxPages),
    maxDepth: numberValue(body.maxDepth, existing?.maxDepth || defaults.maxDepth),
    minContentChars: numberValue(body.minContentChars, existing?.minContentChars || defaults.minContentChars),
    maxContentChars: numberValue(body.maxContentChars, existing?.maxContentChars || defaults.maxContentChars),
  };

  await db.query(
    `INSERT INTO community_sync_settings (
       version_id, enabled, run_on_start, interval_ms, schedule_hour, schedule_minute,
       base_url, login_url, auth_check_path,
       start_paths, allowed_hosts, auth_cookie, username, password, username_field, password_field,
       extra_login_fields, login_success_text, login_failure_text, auth_check_text, user_agent,
       request_timeout_ms, max_retries, retry_base_ms, delay_ms, max_pages, max_depth,
       min_content_chars, max_content_chars
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       enabled=VALUES(enabled), run_on_start=VALUES(run_on_start), interval_ms=VALUES(interval_ms),
       schedule_hour=VALUES(schedule_hour), schedule_minute=VALUES(schedule_minute),
       base_url=VALUES(base_url), login_url=VALUES(login_url), auth_check_path=VALUES(auth_check_path),
       start_paths=VALUES(start_paths), allowed_hosts=VALUES(allowed_hosts), auth_cookie=VALUES(auth_cookie),
       username=VALUES(username), password=VALUES(password), username_field=VALUES(username_field),
       password_field=VALUES(password_field), extra_login_fields=VALUES(extra_login_fields),
       login_success_text=VALUES(login_success_text), login_failure_text=VALUES(login_failure_text),
       auth_check_text=VALUES(auth_check_text), user_agent=VALUES(user_agent),
       request_timeout_ms=VALUES(request_timeout_ms), max_retries=VALUES(max_retries),
       retry_base_ms=VALUES(retry_base_ms), delay_ms=VALUES(delay_ms), max_pages=VALUES(max_pages),
       max_depth=VALUES(max_depth), min_content_chars=VALUES(min_content_chars),
       max_content_chars=VALUES(max_content_chars)`,
    [
      versionId,
      next.enabled ? 1 : 0,
      next.runOnStart ? 1 : 0,
      next.intervalMs,
      next.scheduleHour,
      next.scheduleMinute,
      next.baseUrl,
      next.loginUrl,
      next.authCheckPath,
      JSON.stringify(next.startPaths),
      JSON.stringify(next.allowedHosts),
      next.authCookie,
      next.username,
      next.password,
      next.usernameField,
      next.passwordField,
      JSON.stringify(next.extraLoginFields),
      next.loginSuccessText,
      next.loginFailureText,
      next.authCheckText,
      next.userAgent,
      next.requestTimeoutMs,
      next.maxRetries,
      next.retryBaseMs,
      next.delayMs,
      next.maxPages,
      next.maxDepth,
      next.minContentChars,
      next.maxContentChars,
    ]
  );
  return getEffectiveConfig(versionId);
}

function validateConfigForRun(config) {
  if (!config.baseUrl) throw new Error('Please configure the community base URL first');
  if (isQ1CommunityUrl(config.baseUrl)) return;
  if (!config.authCookie && (!config.loginUrl || !config.username || !config.password)) {
    throw new Error('Please configure a server-side cookie, or configure login URL, username, and password');
  }
}

function isQ1CommunityUrl(value) {
  try {
    return new URL(value).host === 'club.q1.com';
  } catch {
    return false;
  }
}

async function ensureSettingsRow(versionId) {
  await db.query(
    'INSERT INTO community_sync_settings (version_id) VALUES (?) ON DUPLICATE KEY UPDATE version_id=VALUES(version_id)',
    [versionId]
  );
}

async function recordLoginFailure(versionId, message, options = {}) {
  await ensureSettingsRow(versionId);
  const threshold = Math.max(parseInt(options.threshold ?? defaults.q1LoginBlockThreshold, 10) || defaults.q1LoginBlockThreshold, 1);
  const blockMinutes = Math.max(parseInt(options.blockMinutes ?? defaults.q1LoginBlockMinutes, 10) || defaults.q1LoginBlockMinutes, 1);
  const [rows] = await db.query(
    'SELECT login_failure_count FROM community_sync_settings WHERE version_id=? LIMIT 1',
    [versionId]
  );
  const failures = (rows[0]?.login_failure_count || 0) + 1;
  const blocked = failures >= threshold;
  await db.query(
    `UPDATE community_sync_settings
        SET login_failure_count=?,
            login_blocked_until=?,
            last_login_error=?
      WHERE version_id=?`,
    [
      failures,
      blocked ? new Date(Date.now() + blockMinutes * 60 * 1000) : null,
      String(message || '').slice(0, 255),
      versionId,
    ]
  );
  return {
    failures,
    blocked,
    blockedUntil: blocked ? new Date(Date.now() + blockMinutes * 60 * 1000) : null,
  };
}

async function resetLoginFailures(versionId) {
  await ensureSettingsRow(versionId);
  await db.query(
    `UPDATE community_sync_settings
        SET login_failure_count=0,
            login_blocked_until=NULL,
            last_login_error=NULL
      WHERE version_id=?`,
    [versionId]
  );
}

async function getLoginGuard(versionId) {
  await ensureSettingsRow(versionId);
  const [rows] = await db.query(
    'SELECT login_failure_count, login_blocked_until, last_login_error FROM community_sync_settings WHERE version_id=? LIMIT 1',
    [versionId]
  );
  return {
    failures: rows[0]?.login_failure_count || 0,
    blockedUntil: rows[0]?.login_blocked_until || null,
    lastLoginError: rows[0]?.last_login_error || '',
  };
}

module.exports = {
  getEffectiveConfig,
  getLoginGuard,
  listEnabledConfigs,
  recordLoginFailure,
  resetLoginFailures,
  saveConfig,
  toPublic,
  validateConfigForRun,
  _rowToConfig: rowToConfig,
};
