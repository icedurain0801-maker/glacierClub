'use strict';
const crypto = require('node:crypto');
const { normalizeSiteUrls } = require('./bigplayerSiteConfig');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function planSiteRegistryRepair(source, registry) {
  if (source.platform !== 'bigplayer_h5' || !source.id) fail('REPAIR_SCOPE_INVALID');
  const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
  const sites = normalizeSiteUrls(config).siteUrls;
  const additions = [], retained = new Set();
  const aligned = sites.map(site => {
    const matches = registry.filter(row => row.url === site.url);
    if (matches.length > 1) fail('REPAIR_AMBIGUOUS_URL');
    const existing = matches[0];
    if (existing) {
      if (Boolean(Number(existing.enabled)) !== site.enabled) fail('REPAIR_ENABLED_CONFLICT');
      retained.add(existing.site_id);
      return { ...site, siteId: existing.site_id };
    }
    if (registry.some(row => row.site_id === site.siteId)) fail('REPAIR_ID_CONFLICT');
    additions.push(site);
    return site;
  });
  if (registry.some(row => Number(row.enabled) && !retained.has(row.site_id))) fail('REPAIR_EXTRA_ENABLED_SITE');
  if (new Set(aligned.map(site => site.siteId)).size !== aligned.length) fail('REPAIR_DUPLICATE_ID');
  const afterConfig = JSON.stringify({ ...config, siteUrls: aligned });
  const hash = crypto.createHash('sha256').update(JSON.stringify({ sourceId: source.id, beforeConfig: source.config, registry, afterConfig, additions })).digest('hex');
  return { sourceId: source.id, hash, afterConfig, additions, retainedSiteIds: [...retained] };
}
module.exports = { planSiteRegistryRepair };
