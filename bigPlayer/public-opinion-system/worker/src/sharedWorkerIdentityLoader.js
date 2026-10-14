'use strict';
const DEFAULT_PLATFORMS = ['bigplayer_h5', 'taptap', 'discord', 'facebook', 'bilibili', 'douyin', 'xiaohongshu', 'weibo', 'tieba'];
const fail = () => { throw Object.assign(new Error('worker identity invalid'), { code: 'WORKER_SOURCE_IDENTITY_INVALID' }); };
const same = (a, b) => { if (typeof a !== 'string' || !a.trim() || a !== b) fail(); };
const supplied = (object, key, value) => { if (Object.hasOwn(object || {}, key) && object[key] !== value) fail(); };
function createSharedWorkerIdentityLoader({ repo, platforms = DEFAULT_PLATFORMS } = {}) {
  if (typeof repo?.query !== 'function' || typeof repo?.getDefaultAccount !== 'function') throw TypeError('identity repository required');
  return async (source, run = null) => {
    if (typeof source?.id !== 'string' || !source.id.trim() || (run && (typeof run.id !== 'string' || !run.id.trim()))) fail();
    const accountId = run ? null : (await repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform }))?.id;
    if (!run && !accountId) fail();
    const rows = await repo.query(`SELECT s.id AS s_id,s.game_id AS s_game_id,s.community_id AS s_community_id,s.platform AS s_platform,
      s.enabled AS s_enabled,s.config AS s_config,s.auth_status AS s_auth_status,s.auth_expire_at AS s_auth_expire_at,
      s.frequency_seconds AS s_frequency_seconds,s.active_window AS s_active_window,
      g.id AS g_id,g.region_code AS g_region_code,g.enabled AS g_enabled,c.id AS c_id,c.game_id AS c_game_id,c.status AS c_status,
      a.id AS a_id,a.source_id AS a_source_id,a.game_id AS a_game_id,a.community_id AS a_community_id,a.platform AS a_platform,
      a.enabled AS a_enabled,a.auth_status AS a_auth_status,a.auth_expire_at AS a_auth_expire_at,
      ag.id AS ag_id,ag.region_code AS ag_region_code,ac.id AS ac_id,ac.game_id AS ac_game_id,
      r.id AS r_id,r.source_id AS r_source_id,r.account_id AS r_account_id,r.site_id AS r_site_id,r.status AS r_status,
      r.trigger_type AS r_trigger_type,r.parent_run_id AS r_parent_run_id
      FROM po_sources s LEFT JOIN po_games g ON g.id=s.game_id LEFT JOIN po_communities c ON c.id=s.community_id
      LEFT JOIN po_sync_runs r ON r.id=? LEFT JOIN po_accounts a ON a.id=${run ? 'r.account_id' : '?'}
      LEFT JOIN po_games ag ON ag.id=a.game_id LEFT JOIN po_communities ac ON ac.id=a.community_id WHERE s.id=? LIMIT 2`,
    run ? [run.id, source.id] : [null, accountId, source.id]);
    if (!Array.isArray(rows) || rows.length !== 1) fail(); const r = rows[0];
    for (const [a, b] of [[r.s_id, source.id], [r.s_game_id, r.g_id], [r.s_community_id, r.c_id], [r.c_game_id, r.s_game_id],
      [r.a_source_id, r.s_id], [r.a_game_id, r.s_game_id], [r.a_community_id, r.s_community_id], [r.a_game_id, r.ag_id],
      [r.a_community_id, r.ac_id], [r.ac_game_id, r.a_game_id], [r.a_platform, r.s_platform]]) same(a, b);
    if (typeof r.a_id !== 'string' || !r.a_id || !['domestic', 'overseas'].includes(r.g_region_code)
      || r.ag_region_code !== r.g_region_code || !platforms.includes(r.s_platform)) fail();
    for (const [key, value] of [['game_id', r.s_game_id], ['community_id', r.s_community_id], ['platform', r.s_platform], ['region_code', r.g_region_code], ['account_id', r.a_id]]) supplied(source, key, value);
    if (run) {
      same(r.r_id, run.id); same(r.r_source_id, r.s_id); same(r.r_account_id, r.a_id);
      for (const [key, value] of [['source_id', r.s_id], ['sourceId', r.s_id], ['account_id', r.a_id], ['accountId', r.a_id], ['site_id', r.r_site_id], ['siteId', r.r_site_id]]) supplied(run, key, value);
    } else same(r.a_id, accountId);
    return { source: { ...source, id: r.s_id, game_id: r.s_game_id, community_id: r.s_community_id, platform: r.s_platform,
      region_code: r.g_region_code, enabled: r.s_enabled, game_enabled: r.g_enabled, community_status: r.c_status,
      config: r.s_config, auth_status: r.s_auth_status, auth_expire_at: r.s_auth_expire_at,
      frequency_seconds: r.s_frequency_seconds, active_window: r.s_active_window },
    account: { id: r.a_id, source_id: r.a_source_id, game_id: r.a_game_id, community_id: r.a_community_id, platform: r.a_platform,
      enabled: r.a_enabled, auth_status: r.a_auth_status, auth_expire_at: r.a_auth_expire_at },
    run: run ? { id: r.r_id, source_id: r.r_source_id, account_id: r.r_account_id, site_id: r.r_site_id, status: r.r_status,
      trigger_type:r.r_trigger_type,parent_run_id:r.r_parent_run_id } : null };
  };
}
module.exports = { createSharedWorkerIdentityLoader, DEFAULT_PLATFORMS };
