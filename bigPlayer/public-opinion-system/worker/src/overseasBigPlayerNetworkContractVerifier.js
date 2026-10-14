'use strict';
const crypto = require('node:crypto');
const { contractOf } = require('./overseasBigPlayerRunContractJournal');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const fail = () => { throw Object.assign(new Error('Overseas network contract unverified'), { code: 'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED' }); };
function iso(value) {
  if (value instanceof Date) { if (!Number.isFinite(+value)) fail(); return value.toISOString(); }
  if (typeof value !== 'string') fail();
  const match=value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z)?$/);
  if (!match || (value[10] === 'T' ? !match[4] : Boolean(match[4]))) fail();
  const expected=`${match[1]}T${match[2]}.${(match[3]||'').padEnd(3,'0')}Z`, date=new Date(expected);
  if (!Number.isFinite(+date) || date.toISOString() !== expected) fail();
  return expected;
}
function createOverseasNetworkContractVerifier({ repo, journal, manifestSha256 } = {}) {
  if (typeof repo?.query !== 'function' || typeof journal?.verify !== 'function'
    || !/^[a-f0-9]{64}$/.test(manifestSha256 || '')) throw new TypeError('Concrete contract verifier dependencies required');
  return async value => {
    const c = contractOf(value);
    if (c.manifestSha256 !== manifestSha256 || await journal.verify(c) !== true) fail();
    return verifyPersistedOverseasContract(repo, c);
  };
}
async function verifyPersistedOverseasContract(repo, value, leaseState = 'live') {
    if (!['live', 'expired'].includes(leaseState)) fail();
    const c=contractOf(value);
    // Current schema only; no optional board/snapshot columns, DDL or credentials.
    const rows = await repo.query(`SELECT
      r.id AS r_id,r.source_id AS r_source_id,r.account_id AS r_account_id,r.site_id AS r_site_id,
      r.status AS r_status,r.lease_owner AS r_owner,r.lease_epoch AS r_epoch,
      (r.lease_until>UTC_TIMESTAMP(3)) AS r_live,(r.lease_until<UTC_TIMESTAMP(3)) AS r_expired,r.window_start AS r_start,r.window_end AS r_end,
      s.id AS s_id,s.game_id AS s_game,s.community_id AS s_community,s.platform AS s_platform,s.enabled AS s_enabled,s.config AS s_config,
      a.id AS a_id,a.source_id AS a_source,a.game_id AS a_game,a.community_id AS a_community,a.platform AS a_platform,a.enabled AS a_enabled,
      g.id AS g_id,g.region_code AS g_region,g.enabled AS g_enabled,
      cm.id AS cm_id,cm.game_id AS cm_game,cm.status AS cm_status,
      st.site_id AS st_id,st.url AS st_url,st.url_hash AS st_hash,st.enabled AS st_enabled
      FROM po_sync_runs r
      LEFT JOIN po_sources s ON s.id=r.source_id
      LEFT JOIN po_accounts a ON a.id=r.account_id
      LEFT JOIN po_games g ON g.id=s.game_id
      LEFT JOIN po_communities cm ON cm.id=s.community_id
      LEFT JOIN po_source_sites st ON st.source_id=s.id AND st.site_id=r.site_id
      WHERE r.id=? LIMIT 2`, [c.runId]);
    if (!Array.isArray(rows) || rows.length !== 1) fail();
    const r = rows[0];
    for (const [key, expected] of Object.entries({ r_id: c.runId, r_source_id: c.sourceId, r_account_id: c.accountId,
      r_site_id: c.siteId, r_owner: c.leaseOwner, s_id: c.sourceId, s_game: c.gameId, s_community: c.communityId,
      a_id: c.accountId, a_source: c.sourceId, a_game: c.gameId, a_community: c.communityId,
      g_id: c.gameId, cm_id: c.communityId, cm_game: c.gameId, st_id: c.siteId, st_url: c.siteUrl })) if (r[key] !== expected) fail();
    if (Number(r.r_epoch) !== c.leaseEpoch || Number(leaseState === 'live' ? r.r_live : r.r_expired) !== 1 || r.r_status !== 'running'
      || iso(r.r_start) !== c.windowStart || iso(r.r_end) !== c.windowEnd
      || r.s_platform !== 'bigplayer_h5' || r.a_platform !== r.s_platform || r.g_region !== 'overseas'
      || [r.s_enabled, r.a_enabled, r.g_enabled, r.st_enabled].some(value => Number(value) !== 1)
      || r.cm_status !== 'enabled') fail();
    let config;
    try { config = typeof r.s_config === 'string' ? JSON.parse(r.s_config) : r.s_config; } catch { fail(); }
    if (!config || typeof config !== 'object' || Array.isArray(config)
      || (Object.hasOwn(config,'deleted') && config.deleted !== false) || String(config.boardId) !== c.boardId) fail();
    let sites;
    try { sites = normalizeSiteUrls(config).siteUrls; } catch { fail(); }
    if (sites.filter(site => site.enabled && site.siteId === c.siteId && site.url === c.siteUrl).length !== 1) fail();
    // Same SHA256 URL bytes as Repository's po_source_sites registry writer.
    const hash = crypto.createHash('sha256').update(c.siteUrl).digest('hex');
    if (r.st_hash !== hash || c.siteUrlSha256 !== hash) fail();
    // Compatibility with PageStore/preflight contracts, NOT production permission.
    // Each invocation rechecks persisted state; no cached approval bit.
    return true;
}
module.exports = { createOverseasNetworkContractVerifier, verifyPersistedOverseasContract, iso };
