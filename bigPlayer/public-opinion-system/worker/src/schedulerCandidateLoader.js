function createSchedulerCandidateLoader(connection) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('connection.query is required');
  }

  async function load() {
    const [rows] = await connection.query(
      `SELECT
         s.id AS source_id,
         s.game_id,
         s.community_id,
         g.region_code AS region_code,
         s.platform,
         s.enabled AS source_enabled,
         g.enabled AS game_enabled,
         c.status AS community_status,
         s.auth_status AS source_auth_status,
         s.auth_expire_at AS source_auth_expire_at,
         s.default_account_id,
         s.frequency_seconds,
         s.schedule_effective_at,
         s.schedule_version,
         s.active_window,
         a.id AS account_id,
         a.source_id AS account_source_id,
         a.game_id AS account_game_id,
         a.community_id AS account_community_id,
         a.platform AS account_platform,
         a.enabled AS account_enabled,
         a.auth_status AS account_auth_status,
         a.auth_expire_at AS account_auth_expire_at
       FROM po_sources s
       LEFT JOIN po_games g ON g.id=s.game_id
       LEFT JOIN po_communities c ON c.id=s.community_id
       LEFT JOIN po_accounts a ON a.id=s.default_account_id
       ORDER BY s.id ASC`,
      []
    );

    const sources = [];
    const accountsById = new Map();
    for (const row of rows || []) {
      sources.push({
        id: row.source_id,
        game_id: row.game_id,
        community_id: row.community_id,
        region_code: row.region_code,
        platform: row.platform,
        enabled: row.source_enabled,
        game_enabled: row.game_enabled,
        community_status: row.community_status,
        auth_status: row.source_auth_status,
        auth_expire_at: row.source_auth_expire_at,
        default_account_id: row.default_account_id,
        frequency_seconds: row.frequency_seconds,
        schedule_effective_at: row.schedule_effective_at,
        schedule_version: row.schedule_version,
        active_window: row.active_window
      });

      if (row.account_id != null && !accountsById.has(row.account_id)) {
        accountsById.set(row.account_id, {
          id: row.account_id,
          source_id: row.account_source_id,
          game_id: row.account_game_id,
          community_id: row.account_community_id,
          platform: row.account_platform,
          enabled: row.account_enabled,
          auth_status: row.account_auth_status,
          auth_expire_at: row.account_auth_expire_at
        });
      }
    }

    return { sources, accounts: [...accountsById.values()] };
  }

  return { load };
}

module.exports = { createSchedulerCandidateLoader };
