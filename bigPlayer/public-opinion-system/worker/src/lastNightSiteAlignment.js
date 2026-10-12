'use strict';

const crypto = require('node:crypto');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID } = require('./lastNightScope');
const { inspectSiteAlignment } = require('./lastNightAlignmentContract');

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

async function applyLastNightSiteAlignment({ pool, approvedPlanHash } = {}) {
  if (!pool?.getConnection || !/^[a-f0-9]{64}$/.test(String(approvedPlanHash || ''))) {
    fail('LAST_NIGHT_ALIGNMENT_APPROVAL_REQUIRED');
  }
  const connection = await pool.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    const [sources] = await connection.query(`SELECT s.*,g.region_code,c.status AS community_status
      FROM po_sources s JOIN po_games g ON g.id=s.game_id
      JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE`, [SOURCE_ID]);
    const source = sources[0];
    if (typeof source?.config !== 'string') fail('LAST_NIGHT_CONFIG_INVALID');
    const [active] = await connection.query(`SELECT id FROM po_sync_runs WHERE source_id=?
      AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE`, [SOURCE_ID]);
    if (active.length) fail('LAST_NIGHT_ACTIVE_RUN');
    const [leases] = await connection.query(`SELECT (lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease
      FROM po_source_schedule_state WHERE source_id=? FOR UPDATE`, [SOURCE_ID]);
    if (leases.length !== 1 || Number(leases[0].active_lease) !== 0) fail('LAST_NIGHT_ACTIVE_LEASE');
    const [registry] = await connection.query('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE_ID]);
    const [runs] = await connection.query('SELECT DISTINCT site_id FROM po_sync_runs WHERE source_id=? AND site_id IS NOT NULL', [SOURCE_ID]);
    const [checkpoints] = await connection.query(`SELECT DISTINCT cp.site_id FROM po_sync_checkpoints cp
      JOIN po_accounts a ON a.id=cp.account_id WHERE a.source_id=? AND cp.site_id IS NOT NULL`, [SOURCE_ID]);
    const historicalSiteIds = [...runs, ...checkpoints].map(row => row.site_id);
    const plan = inspectSiteAlignment(source, registry, historicalSiteIds);
    if (plan.status !== 'alignment_required' || plan.planHash !== approvedPlanHash) {
      fail('LAST_NIGHT_ALIGNMENT_PLAN_CHANGED');
    }
    const afterConfig = JSON.stringify(plan.plannedConfig);
    const [updated] = await connection.query('UPDATE po_sources SET config=? WHERE id=? AND config=?',
      [afterConfig, SOURCE_ID, source.config]);
    if (updated.affectedRows !== 1) fail('LAST_NIGHT_ALIGNMENT_CAS_FAILED');
    const normalized = normalizeSiteUrls(plan.plannedConfig).siteUrls;
    for (const site of normalized.filter(item => plan.missingSiteIds.includes(item.siteId))) {
      const [inserted] = await connection.query(`INSERT INTO po_source_sites
        (id,source_id,site_id,url,url_hash,enabled,auth_status,capabilities)
        VALUES (?,?,?,?,?,1,'unknown',?)`,
      [crypto.randomUUID(), SOURCE_ID, site.siteId, site.url, sha(site.url), JSON.stringify({})]);
      if (inserted.affectedRows !== 1) fail('LAST_NIGHT_ALIGNMENT_INSERT_FAILED');
    }
    const [afterRegistry] = await connection.query('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE_ID]);
    if (inspectSiteAlignment({ ...source, config: afterConfig }, afterRegistry, historicalSiteIds).status !== 'aligned') {
      fail('LAST_NIGHT_ALIGNMENT_VERIFY_FAILED');
    }
    await connection.commit();
    committed = true;
    return { status: 'aligned', sourceId: SOURCE_ID, planHash: approvedPlanHash,
      beforeConfigHash: sha(source.config), afterConfigHash: sha(afterConfig),
      legacySiteId: plan.legacySiteId, insertedSites: plan.missingSiteIds.length,
      historicalIdentityChanged: false };
  } catch (error) {
    if (!committed) { try { await connection.rollback(); } catch {} }
    throw error;
  } finally { connection.release(); }
}

async function rollbackLastNightSiteAlignment({ pool, beforeConfig, approvedAfterConfigHash, insertedSiteIds } = {}) {
  if (!pool?.getConnection || typeof beforeConfig !== 'string'
    || !/^[a-f0-9]{64}$/.test(String(approvedAfterConfigHash || ''))
    || !Array.isArray(insertedSiteIds) || insertedSiteIds.length !== 2
    || new Set(insertedSiteIds).size !== 2 || insertedSiteIds.some(id => typeof id !== 'string' || !id.trim())) fail('LAST_NIGHT_ROLLBACK_APPROVAL_REQUIRED');
  let oldConfig;
  try { oldConfig = JSON.parse(beforeConfig); } catch { fail('LAST_NIGHT_CONFIG_INVALID'); }
  const oldSites = normalizeSiteUrls(oldConfig).siteUrls;
  if (oldSites.length !== 3) fail('LAST_NIGHT_CONFIG_INVALID');
  const connection = await pool.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();
    const [sources] = await connection.query('SELECT config FROM po_sources WHERE id=? FOR UPDATE', [SOURCE_ID]);
    const current = sources[0]?.config;
    if (typeof current !== 'string' || sha(current) !== approvedAfterConfigHash) fail('LAST_NIGHT_ROLLBACK_PLAN_CHANGED');
    const [active] = await connection.query(`SELECT id FROM po_sync_runs WHERE source_id=?
      AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE`, [SOURCE_ID]);
    if (active.length) fail('LAST_NIGHT_ACTIVE_RUN');
    const [leases] = await connection.query(`SELECT (lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease
      FROM po_source_schedule_state WHERE source_id=? FOR UPDATE`, [SOURCE_ID]);
    if (leases.length !== 1 || Number(leases[0].active_lease) !== 0) fail('LAST_NIGHT_ACTIVE_LEASE');
    const [registry] = await connection.query('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE_ID]);
    for (const id of insertedSiteIds) {
      const original = oldSites.find(site => site.siteId === id);
      const row = registry.find(site => site.site_id === id);
      if (!original || !row || row.url !== original.url || Number(row.enabled) !== 1) fail('LAST_NIGHT_ROLLBACK_PLAN_CHANGED');
    }
    // Recompute the original plan rather than accepting unrelated caller config.
    const retained = registry.filter(row => !insertedSiteIds.includes(row.site_id));
    const originalPlan = inspectSiteAlignment({ id: SOURCE_ID, game_id: GAME_ID,
      community_id: COMMUNITY_ID, region_code: 'overseas',
      platform: 'bigplayer_h5', enabled: 1, community_status: 'enabled', config: beforeConfig }, retained, retained.map(row => row.site_id));
    if (originalPlan.status !== 'alignment_required' || JSON.stringify(originalPlan.plannedConfig) !== current
      || originalPlan.missingSiteIds.slice().sort().join('|') !== insertedSiteIds.slice().sort().join('|')) fail('LAST_NIGHT_ROLLBACK_PLAN_CHANGED');
    const [runs] = await connection.query('SELECT id FROM po_sync_runs WHERE source_id=? AND site_id IN (?,?) LIMIT 1 FOR UPDATE', [SOURCE_ID, ...insertedSiteIds]);
    const [checkpoints] = await connection.query(`SELECT cp.id FROM po_sync_checkpoints cp JOIN po_accounts a ON a.id=cp.account_id
      WHERE a.source_id=? AND cp.site_id IN (?,?) LIMIT 1 FOR UPDATE`, [SOURCE_ID, ...insertedSiteIds]);
    if (runs.length || checkpoints.length) fail('LAST_NIGHT_ROLLBACK_NEW_SITE_HISTORY');
    const [updated] = await connection.query('UPDATE po_sources SET config=? WHERE id=? AND config=?', [beforeConfig, SOURCE_ID, current]);
    if (updated.affectedRows !== 1) fail('LAST_NIGHT_ALIGNMENT_CAS_FAILED');
    const [disabled] = await connection.query('UPDATE po_source_sites SET enabled=0 WHERE source_id=? AND site_id IN (?,?) AND enabled=1', [SOURCE_ID, ...insertedSiteIds]);
    if (disabled.affectedRows !== 2) fail('LAST_NIGHT_ROLLBACK_DISABLE_FAILED');
    await connection.commit(); committed = true;
    return { status: 'rolled_back', sourceId: SOURCE_ID, restoredConfigHash: sha(beforeConfig), disabledSites: 2, historicalIdentityChanged: false };
  } catch (error) {
    if (!committed) { try { await connection.rollback(); } catch {} }
    throw error;
  } finally { connection.release(); }
}

module.exports = { applyLastNightSiteAlignment, rollbackLastNightSiteAlignment };
