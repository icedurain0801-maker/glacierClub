const crypto = require('node:crypto');

function siteConfigError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeUrl(value, { allowedHosts } = {}) {
  const raw = String(value || '').trim();
  if (!raw) throw siteConfigError('SITE_URL_REQUIRED', 'site URL is required');
  let parsed;
  try { parsed = new URL(raw); } catch { throw siteConfigError('SITE_URL_INVALID', 'site URL is not a valid URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw siteConfigError('SITE_URL_PROTOCOL', 'site URL must use http(s)');
  if (parsed.username || parsed.password || parsed.hash) throw siteConfigError('SITE_URL_UNSAFE', 'site URL must not contain credentials or fragment');
  if (parsed.port && !['80', '443'].includes(parsed.port)) throw siteConfigError('SITE_URL_PORT', 'site URL port is not allowed');
  const hosts = allowedHosts == null ? null : new Set([...allowedHosts].map(host => String(host).trim().toLowerCase()).filter(Boolean));
  if (hosts && !hosts.has(parsed.hostname.toLowerCase())) throw siteConfigError('SITE_URL_HOST_NOT_ALLOWED', `site URL host ${parsed.hostname} is not allowed`);
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) parsed.port = '';
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return parsed.toString();
}

function derivedSiteId(url, prefix = 'site') {
  return `${prefix}-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}`;
}

function normalizeSiteUrls(input = {}, options = {}) {
  const config = input && typeof input === 'object' ? input : {};
  const legacyConfig = !Array.isArray(config.siteUrls) && Boolean(config.baseUrl);
  const rawSites = Array.isArray(config.siteUrls) ? config.siteUrls : (config.baseUrl ? [config.baseUrl] : []);
  if (!rawSites.length) throw siteConfigError('SITE_URL_REQUIRED', 'at least one site URL is required');
  const seen = new Map();
  const siteUrls = rawSites.map((entry, index) => {
    const objectEntry = entry && typeof entry === 'object' ? entry : { url: entry };
    const url = normalizeUrl(objectEntry.url ?? objectEntry.baseUrl, options);
    if (seen.has(url)) throw siteConfigError('SITE_URL_DUPLICATE', 'duplicate site URL', { duplicateOf: seen.get(url), index });
    const siteId = String(objectEntry.siteId || '').trim() || derivedSiteId(url, legacyConfig ? 'legacy' : 'site');
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(siteId)) throw siteConfigError('SITE_ID_INVALID', 'siteId contains unsupported characters', { index });
    seen.set(url, index);
    return {
      siteId,
      url,
      enabled: objectEntry.enabled !== false,
      authStatus: String(objectEntry.authStatus || 'unknown'),
      capabilities: objectEntry.capabilities && typeof objectEntry.capabilities === 'object' ? objectEntry.capabilities : {}
    };
  });
  const ids = new Set();
  for (const [index, site] of siteUrls.entries()) {
    if (ids.has(site.siteId)) throw siteConfigError('SITE_ID_DUPLICATE', 'duplicate siteId', { index, siteId: site.siteId });
    ids.add(site.siteId);
  }
  return { siteUrls, baseUrl: siteUrls[0].url };
}

module.exports = { normalizeUrl, normalizeSiteUrls, derivedSiteId, siteConfigError };
