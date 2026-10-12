'use strict';

const crypto = require('node:crypto');
const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');

const sourceIds = [
  '081a16d2-5545-4afd-9c65-e04777e4540b',
  '8c690d6e-12ea-4ad3-b434-d941276c4906'
];
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

async function main() {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  const select = async (sql, params = []) => {
    if (!/^SELECT\s/.test(sql)) throw Error('NON_SELECT_QUERY');
    return (await conn.query({ sql, timeout: 8000 }, params))[0];
  };
  try {
    const [identity] = await select('SELECT CURRENT_USER() AS user_name,DATABASE() AS db_name,UTC_TIMESTAMP(3) AS observed_at');
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const eligible = await select(`SELECT s.id FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id
      WHERE g.region_code='overseas' AND s.platform='bigplayer_h5' AND s.enabled=1 AND g.enabled=1 AND c.status='enabled' ORDER BY s.id`);
    const sources = await select(`SELECT s.id,s.platform,s.enabled,s.config,s.frequency_seconds,s.default_account_id,g.region_code,g.enabled AS game_enabled,c.status AS community_status
      FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id
      WHERE s.id IN (?,?)`, sourceIds);
    const sites = await select('SELECT source_id,site_id,url,enabled FROM po_source_sites WHERE source_id IN (?,?) ORDER BY source_id,site_id', sourceIds);
    const accounts = await select(`SELECT a.id,a.source_id,a.enabled,a.auth_status,COUNT(CASE WHEN cr.credential_type='api_token' AND cr.status='active' THEN 1 END) AS active_token_count
      FROM po_accounts a LEFT JOIN po_credentials cr ON cr.account_id=a.id AND cr.source_id=a.source_id
      WHERE a.source_id IN (?,?) GROUP BY a.id,a.source_id,a.enabled,a.auth_status`, sourceIds);
    const result = sources.map(source => {
      const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
      const configured = Array.isArray(config.siteUrls) ? config.siteUrls : (config.baseUrl ? [config.baseUrl] : []);
      const configSites = configured.map(entry => {
        const site = typeof entry === 'string' ? { url: entry } : entry;
        return { siteId: site.siteId || null, urlSha256: sha256(site.url || site.baseUrl || ''), enabled: site.enabled !== false };
      });
      const registry = sites.filter(site => site.source_id === source.id).map(site => ({ siteId: site.site_id, urlSha256: sha256(site.url), enabled: Boolean(site.enabled) }));
      const defaultAccount = accounts.find(account => account.id === source.default_account_id);
      const enabledConfig = configSites.filter(site => site.enabled);
      const enabledRegistry = registry.filter(site => site.enabled);
      return {
        sourceId: source.id, platform: source.platform, region: source.region_code,
        enabled: Boolean(source.enabled), gameEnabled: Boolean(source.game_enabled), communityStatus: source.community_status,
        frequencySeconds: source.frequency_seconds, boardId: config.boardId ?? null,
        configuredSiteCount: configSites.length, enabledConfigSiteCount: enabledConfig.length,
        registrySiteCount: registry.length, enabledRegistrySiteCount: enabledRegistry.length,
        alignedEnabledSites: enabledConfig.filter(site => enabledRegistry.some(row => row.siteId === site.siteId && row.urlSha256 === site.urlSha256)).length,
        configSites, registry,
        defaultAccount: defaultAccount ? { id: defaultAccount.id, enabled: Boolean(defaultAccount.enabled), authStatus: defaultAccount.auth_status, hasActiveApiToken: Number(defaultAccount.active_token_count) > 0 } : null
      };
    });
    const issues = [];
    for (const row of eligible) if (!sourceIds.includes(row.id)) issues.push(`UNINSPECTED_ELIGIBLE_SOURCE:${row.id}`);
    for (const id of sourceIds) if (!result.some(row => row.sourceId === id)) issues.push(`MISSING_SOURCE:${id}`);
    for (const row of result) {
      if (row.region !== 'overseas' || row.platform !== 'bigplayer_h5') issues.push(`SCOPE_MISMATCH:${row.sourceId}`);
      if (!/^[1-9]\d*$/.test(String(row.boardId ?? ''))) issues.push(`BOARD_ID_REQUIRED:${row.sourceId}`);
      if (row.alignedEnabledSites !== row.enabledConfigSiteCount) issues.push(`SITE_REGISTRY_GAP:${row.sourceId}`);
    }
    console.log(JSON.stringify({ observedAtUtc: identity.observed_at, status: issues.length ? 'CONFIG_GAP' : 'CONFIG_ALIGNED', eligibleSourceIds: eligible.map(row => row.id), sources: result, issues }));
  } finally {
    await conn.end();
  }
}

main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
