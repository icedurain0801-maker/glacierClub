const MARIA_DB_DATETIME3 = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const { randomUUID } = require('node:crypto');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const { boardIdOf, boardRunIdentity } = require('../../shared/bigPlayerBoard');

function toMariaDbDateTime(value, { nullable = false, name = 'timestamp' } = {}) {
  if (value == null) {
    if (nullable) return null;
    throw new TypeError(`${name} is required`);
  }
  if (typeof value === 'string' && MARIA_DB_DATETIME3.test(value)) return value;
  if (typeof value === 'string' && !EXPLICIT_TIMEZONE.test(value)) {
    throw new TypeError(`${name} must include an explicit timezone`);
  }
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw new TypeError(`${name} must be a Date or timestamp string`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid timestamp`);
  return date.toISOString().replace('T', ' ').slice(0, 23);
}

function multisiteError(code, message) {
  const error = new Error(message); error.code = code; return error;
}

async function lockedScheduledSites(query, sourceId) {
  const [sourceRows] = await query('SELECT platform, config FROM po_sources WHERE id=? FOR UPDATE', [sourceId]);
  const source = sourceRows?.[0];
  if (!source || source.platform !== 'bigplayer_h5') throw multisiteError('MULTISITE_SITE_REGISTRY_MISMATCH', 'BigPlayer scheduled source configuration is unavailable');
  let configured;
  try { configured = normalizeSiteUrls(typeof source.config === 'string' ? JSON.parse(source.config) : source.config); }
  catch { throw multisiteError('MULTISITE_SITE_REGISTRY_MISMATCH', 'BigPlayer scheduled source site configuration is invalid'); }
  if (configured.siteUrls.length < 2) throw multisiteError('MULTISITE_SITE_REGISTRY_MISMATCH', 'BigPlayer scheduled source no longer has multiple sites');
  let rows;
  try { [rows] = await query('SELECT site_id, url, enabled FROM po_source_sites WHERE source_id=? AND enabled=1 ORDER BY site_id FOR UPDATE', [sourceId]); }
  catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') throw multisiteError('MULTISITE_SCHEMA_NOT_READY', 'BigPlayer multi-site schema migration is not applied');
    throw error;
  }
  const persisted = new Map((rows || []).map(site => [String(site.site_id), site]));
  const enabledSites = configured.siteUrls.filter(site => site.enabled !== false);
  if (!enabledSites.length) throw multisiteError('MULTISITE_SITE_REGISTRY_MISMATCH', 'BigPlayer has no enabled configured sites');
  return enabledSites.map(site => {
    const row = persisted.get(String(site.siteId));
    if (!row || String(row.url) !== site.url) throw multisiteError('MULTISITE_SITE_REGISTRY_MISMATCH', 'BigPlayer site registry does not match saved configuration');
    return { siteId: String(site.siteId), url: site.url };
  });
}

function siteWindow(windowStartAtDb, windowEndAtDb, cursor) {
  if (!windowStartAtDb || !windowEndAtDb) return { windowStart: windowStartAtDb, windowEnd: windowEndAtDb };
  const parse = value => Date.parse(`${String(value).replace(' ', 'T')}Z`);
  const start = parse(windowStartAtDb); const end = parse(windowEndAtDb); const last = cursor == null ? NaN : parse(cursor);
  return { windowStart: Number.isFinite(last) && last > start && last < end ? toMariaDbDateTime(new Date(last)) : windowStartAtDb, windowEnd: windowEndAtDb };
}

function createSchedulerRepositoryAdapter(connection) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('connection.query is required');
  }

  async function enqueueScheduled({
    runId,
    sourceId,
    accountId,
    syncMode = 'incremental',
    triggerType,
    scheduledAt,
    windowStartAt = null,
    windowEndAt = null,
    scheduleVersion, communityId = null, boardId = null
  } = {}) {
    if (!['scheduled', 'scheduled_catchup'].includes(triggerType)) {
      throw new TypeError('triggerType must be scheduled or scheduled_catchup');
    }
    if (!runId || !sourceId || !accountId || !scheduledAt) {
      throw new TypeError('runId, sourceId, accountId and scheduledAt are required');
    }
    const scheduledAtDb = toMariaDbDateTime(scheduledAt, { name: 'scheduledAt' });
    const windowStartAtDb = toMariaDbDateTime(windowStartAt, { nullable: true, name: 'windowStartAt' });
    const windowEndAtDb = toMariaDbDateTime(windowEndAt, { nullable: true, name: 'windowEndAt' });
    const boardIdentity = boardId ? boardRunIdentity({ sourceId, communityId, boardId, windowStart: windowStartAtDb, windowEnd: windowEndAtDb }) : null;

    if (boardId) await connection.query(
      `INSERT INTO po_sync_runs (id, source_id, account_id, status, sync_mode, trigger_type, scheduled_at, window_start, window_end, schedule_version, started_at, community_id, board_id, run_scope, board_run_identity)
      VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id`,
      [runId, sourceId, accountId, syncMode, triggerType, scheduledAtDb, windowStartAtDb, windowEndAtDb, scheduleVersion, communityId, boardId, 'collection', boardIdentity]
    );
    else await connection.query(
      `INSERT INTO po_sync_runs (
        id, source_id, account_id, status, sync_mode, trigger_type,
        scheduled_at, window_start, window_end, schedule_version, started_at
      ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, NULL)
      ON DUPLICATE KEY UPDATE id=id`,
      [runId, sourceId, accountId, syncMode, triggerType, scheduledAtDb, windowStartAtDb, windowEndAtDb, scheduleVersion]
    );
    const [rows] = await connection.query(
      'SELECT id FROM po_sync_runs WHERE source_id=? AND scheduled_at=? LIMIT 1',
      [sourceId, scheduledAtDb]
    );
    const winningRunId = rows?.[0]?.id;
    if (!winningRunId) throw new Error('scheduled run was not found after enqueue');
    const created = winningRunId === runId;
    return { created, runId: winningRunId, existingRunId: created ? null : winningRunId };
  }

  // Atomically claim the source lease, insert the unique scheduled slot and
  // advance the schedule cursor. Callers must use a pooled transaction-capable
  // connection; every failure rolls back the lease and run insert together.
  async function scheduleSlotAtomic({
    runId, sourceId, accountId, syncMode = 'incremental', triggerType,
    scheduledAt, windowStartAt = null, windowEndAt = null, scheduleVersion,
    ownerId, leaseUntil, nextSlotAt, multiSite = false, communityId = null, boardId = null
  } = {}) {
    if (!runId || !sourceId || !accountId || !ownerId || !scheduledAt || !nextSlotAt) throw new TypeError('scheduleSlotAtomic requires run/source/account/owner/times');
    if (!['scheduled', 'scheduled_catchup'].includes(triggerType)) throw new TypeError('triggerType must be scheduled or scheduled_catchup');
    const tx = typeof connection.getConnection === 'function' ? await connection.getConnection() : connection;
    const q = async (sql, params = []) => tx.query(sql, params);
    const begin = tx.beginTransaction ? () => tx.beginTransaction() : () => q('START TRANSACTION');
    const commit = tx.commit ? () => tx.commit() : () => q('COMMIT');
    const rollback = tx.rollback ? () => tx.rollback() : () => q('ROLLBACK');
    const scheduledAtDb = toMariaDbDateTime(scheduledAt, { name: 'scheduledAt' });
    const windowStartAtDb = toMariaDbDateTime(windowStartAt, { nullable: true, name: 'windowStartAt' });
    const windowEndAtDb = toMariaDbDateTime(windowEndAt, { nullable: true, name: 'windowEndAt' });
    const leaseUntilDb = toMariaDbDateTime(leaseUntil, { name: 'leaseUntil' });
    await begin();
    try {
      const [lease] = await q(`UPDATE po_source_schedule_state s
        SET lease_run_id=?, lease_owner=?, lease_epoch=lease_epoch+1, lease_until=?
        WHERE s.source_id=? AND (s.lease_until IS NULL OR s.lease_until<=UTC_TIMESTAMP(3))
          AND NOT EXISTS (SELECT 1 FROM po_sync_runs r WHERE r.source_id=s.source_id AND r.status IN ('queued','running','pausing','paused','cancelling'))`,
        [runId, ownerId, leaseUntilDb, sourceId]);
      if (lease?.affectedRows !== 1) {
        const [blockedRows] = await q(`SELECT s.lease_until,
            (s.lease_until IS NOT NULL AND s.lease_until>UTC_TIMESTAMP(3)) AS active_lease,
            (SELECT r.status FROM po_sync_runs r
              WHERE r.source_id=s.source_id AND r.status IN ('queued','running','pausing','paused','cancelling')
              ORDER BY r.id LIMIT 1) AS active_run_status
          FROM po_source_schedule_state s WHERE s.source_id=? FOR UPDATE`, [sourceId]);
        const blocked = blockedRows?.[0] || {};
        const reasonCode = blocked.active_run_status
          ? `RUN_${String(blocked.active_run_status).toUpperCase()}`
          : (Number(blocked.active_lease) === 1 ? 'LEASE_ACTIVE' : 'SCHEDULE_STATE_UNAVAILABLE');
        await q('UPDATE po_source_schedule_state SET last_reason_code=? WHERE source_id=?', [reasonCode, sourceId]);
        await commit();
        return { acquired: false, leaseToken: null, reasonCode };
      }
      const [epochRows] = await q('SELECT lease_epoch FROM po_source_schedule_state WHERE source_id=? AND lease_run_id=? AND lease_owner=? FOR UPDATE', [sourceId, runId, ownerId]);
      const epoch = epochRows?.[0]?.lease_epoch;
      if (!Number.isInteger(epoch)) throw new Error('lease epoch was not found after acquisition');
      if (boardId) {
        const [sourceRows] = await q('SELECT community_id, config FROM po_sources WHERE id=? FOR UPDATE', [sourceId]);
        if (String(sourceRows?.[0]?.community_id) !== String(communityId) || boardIdOf(sourceRows?.[0]) !== boardId) throw multisiteError('BOARD_CONFIGURATION_CHANGED', 'BigPlayer board configuration changed during scheduling');
      }
      const boardIdentity = boardId ? boardRunIdentity({ sourceId, communityId, boardId, windowStart: windowStartAtDb, windowEnd: windowEndAtDb }) : null;
      if (boardId) await q(`INSERT INTO po_sync_runs (id,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,community_id,board_id,run_scope,board_run_identity)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
        [runId, sourceId, accountId, 'queued', syncMode, triggerType, scheduledAtDb, windowStartAtDb, windowEndAtDb, scheduleVersion, communityId, boardId, 'collection', boardIdentity]);
      else await q(`INSERT INTO po_sync_runs (id,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL) ON DUPLICATE KEY UPDATE id=id`,
        [runId, sourceId, accountId, 'queued', syncMode, triggerType, scheduledAtDb, windowStartAtDb, windowEndAtDb, scheduleVersion]);
      const [winnerRows] = await q('SELECT id FROM po_sync_runs WHERE source_id=? AND scheduled_at=? FOR UPDATE', [sourceId, scheduledAtDb]);
      const winningRunId = winnerRows?.[0]?.id;
      if (!winningRunId) throw new Error('scheduled run was not found after enqueue');
      if (winningRunId !== runId) { await rollback(); return { acquired: false, created: false, runId: winningRunId, existingRunId: winningRunId }; }
      if (multiSite) {
        const sites = await lockedScheduledSites(q, sourceId);
        for (const site of sites) {
          const [cursorRows] = await q(`SELECT MAX(last_item_at) AS last_successful_cursor FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND status='completed' AND last_item_at IS NOT NULL${boardId ? ' AND task_key LIKE ?' : ''}`, [accountId, site.siteId, ...(boardId ? [`board:${boardId}:%`] : [])]);
          const window = siteWindow(windowStartAtDb, windowEndAtDb, cursorRows?.[0]?.last_successful_cursor || null);
          if (boardId) {
            const childIdentity = boardRunIdentity({ sourceId, communityId, boardId, scope: 'site', windowStart: window.windowStart, windowEnd: window.windowEnd, siteId: site.siteId });
            await q(`INSERT INTO po_sync_runs (id,parent_run_id,site_id,site_url_snapshot,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at,community_id,board_id,run_scope,board_run_identity)
              VALUES (?,?,?,?,?,?,'queued',?,'scheduled_site',NULL,?,?,?,NULL,?,?,?,?)`,
            [randomUUID(), runId, site.siteId, site.url, sourceId, accountId, syncMode, window.windowStart, window.windowEnd, scheduleVersion, communityId, boardId, 'site', childIdentity]);
          } else await q(`INSERT INTO po_sync_runs (id,parent_run_id,site_id,site_url_snapshot,source_id,account_id,status,sync_mode,trigger_type,scheduled_at,window_start,window_end,schedule_version,started_at)
            VALUES (?,?,?,?,?,?,'queued',?,'scheduled_site',NULL,?,?,?,NULL)`,
          [randomUUID(), runId, site.siteId, site.url, sourceId, accountId, syncMode, window.windowStart, window.windowEnd, scheduleVersion]);
        }
      }
      await q('UPDATE po_source_schedule_state SET last_scheduled_at=?, next_scheduled_at=? WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=?', [scheduledAtDb, toMariaDbDateTime(nextSlotAt, { name: 'nextSlotAt' }), sourceId, runId, ownerId, epoch]);
      await commit();
      return { acquired: true, created: true, runId, leaseToken: { sourceId, runId, ownerId, epoch, leaseUntil } };
    } catch (error) { try { await rollback(); } catch {} throw error; }
    finally { if (tx !== connection) tx.release?.(); }
  }

  async function acquireLease({ sourceId, runId, ownerId, now, leaseUntil, scheduledAt, nextSlotAt } = {}) {
    const nowDb = toMariaDbDateTime(now, { name: 'now' });
    const leaseUntilDb = toMariaDbDateTime(leaseUntil, { name: 'leaseUntil' });
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state s
       SET lease_run_id=?, lease_owner=?, lease_epoch=lease_epoch+1, lease_until=?
       WHERE s.source_id=? AND (lease_until IS NULL OR lease_until<=?)
         AND NOT EXISTS (
           SELECT 1 FROM po_sync_runs r
            WHERE r.source_id=s.source_id AND r.status IN ('queued','running','pausing','paused','cancelling')
         )`,
      [runId, ownerId, leaseUntilDb, sourceId, nowDb]
    );
    if (result?.affectedRows !== 1) {
      let reasonCode = 'LEASE_OR_RUN_ACTIVE';
      try {
        const [rows] = await connection.query(
          `SELECT s.lease_until, EXISTS (
             SELECT 1 FROM po_sync_runs r
              WHERE r.source_id=s.source_id AND r.status IN ('queued','running','pausing','paused','cancelling')
           ) AS active_run
           FROM po_source_schedule_state s WHERE s.source_id=? LIMIT 1`, [sourceId]
        );
        const state = rows?.[0];
        reasonCode = Number(state?.active_run) === 1
          ? 'PREVIOUS_RUN_ACTIVE'
          : (state?.lease_until != null ? 'LEASE_ACTIVE' : 'SCHEDULE_STATE_UNAVAILABLE');
        await connection.query('UPDATE po_source_schedule_state SET last_reason_code=? WHERE source_id=?', [reasonCode, sourceId]);
      } catch {}
      return { acquired: false, leaseToken: null, reasonCode };
    }

    const [rows] = await connection.query(
      `SELECT lease_epoch FROM po_source_schedule_state
       WHERE source_id=? AND lease_run_id=? AND lease_owner=? LIMIT 1`,
      [sourceId, runId, ownerId]
    );
    const epoch = rows?.[0]?.lease_epoch;
    if (!Number.isInteger(epoch)) throw new Error('lease epoch was not found after acquisition');
    return {
      acquired: true,
      leaseToken: { sourceId, runId, ownerId, epoch, leaseUntil }
    };
  }

  async function advanceLease({ sourceId, runId, ownerId, epoch, scheduledAt, nextSlotAt } = {}) {
    const scheduledAtDb = toMariaDbDateTime(scheduledAt, { name: 'scheduledAt' });
    const nextSlotAtDb = toMariaDbDateTime(nextSlotAt, { name: 'nextSlotAt' });
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state
       SET last_scheduled_at=?, next_scheduled_at=?
       WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=?`,
      [scheduledAtDb, nextSlotAtDb, sourceId, runId, ownerId, epoch]
    );
    return { advanced: result?.affectedRows === 1 };
  }

  async function renewLease({ sourceId, runId, ownerId, epoch, now, leaseUntil } = {}) {
    const nowDb = toMariaDbDateTime(now, { name: 'now' });
    const leaseUntilDb = toMariaDbDateTime(leaseUntil, { name: 'leaseUntil' });
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state SET lease_until=?
       WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>?`,
      [leaseUntilDb, sourceId, runId, ownerId, epoch, nowDb]
    );
    return { renewed: result?.affectedRows === 1 };
  }

  async function releaseLease({ sourceId, runId, ownerId, epoch, now } = {}) {
    const nowDb = toMariaDbDateTime(now, { name: 'now' });
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state
       SET lease_run_id=NULL, lease_owner=NULL, lease_until=NULL
       WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>?`,
      [sourceId, runId, ownerId, epoch, nowDb]
    );
    return { released: result?.affectedRows === 1 };
  }

  async function finalizeLease({
    sourceId,
    runId,
    ownerId,
    epoch,
    now,
    status,
    reasonCode = null,
    errorCode = null,
    errorMessage = null,
    finishedAt,
    lastScheduledAt,
    nextScheduledAt,
    lastScanAt
  } = {}) {
    const nowDb = toMariaDbDateTime(now, { name: 'now' });
    const finishedAtDb = toMariaDbDateTime(finishedAt, { nullable: true, name: 'finishedAt' });
    const lastScheduledAtDb = toMariaDbDateTime(lastScheduledAt, { nullable: true, name: 'lastScheduledAt' });
    const nextScheduledAtDb = toMariaDbDateTime(nextScheduledAt, { nullable: true, name: 'nextScheduledAt' });
    const lastScanAtDb = toMariaDbDateTime(lastScanAt, { nullable: true, name: 'lastScanAt' });
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state s
       JOIN po_sync_runs r ON r.id=? AND r.source_id=s.source_id
       SET r.status=?, r.finished_at=?, r.error_code=?, r.error_message=?,
           s.last_scheduled_at=?, s.next_scheduled_at=?, s.last_scan_at=?,
           s.last_status=?, s.last_reason_code=?,
           s.lease_run_id=NULL, s.lease_owner=NULL, s.lease_until=NULL
       WHERE s.source_id=? AND s.lease_run_id=? AND s.lease_owner=? AND s.lease_epoch=? AND s.lease_until>?`,
      [
        runId, status, finishedAtDb, errorCode, errorMessage,
        lastScheduledAtDb, nextScheduledAtDb, lastScanAtDb, status, reasonCode,
        sourceId, runId, ownerId, epoch, nowDb
      ]
    );
    return { finalized: result?.affectedRows === 2 };
  }

  async function upsertWorkerHeartbeat({ workerId, buildSha = null, mode = 'enabled', scanStartedAt = null, scanFinishedAt = null, scanStatus = null, scanError = null, currentScan = null } = {}) {
    if (!workerId) throw new TypeError('workerId is required');
    await connection.query(`INSERT INTO po_worker_heartbeats
      (worker_id,build_sha,mode,last_seen_at,scan_started_at,scan_finished_at,scan_status,scan_error,current_scan)
      VALUES (?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE build_sha=VALUES(build_sha), mode=VALUES(mode), last_seen_at=UTC_TIMESTAMP(3),
      scan_started_at=VALUES(scan_started_at), scan_finished_at=VALUES(scan_finished_at), scan_status=VALUES(scan_status),
      scan_error=VALUES(scan_error), current_scan=VALUES(current_scan)`,
      [workerId, buildSha, mode, scanStartedAt, scanFinishedAt, scanStatus, scanError, currentScan]);
  }

  async function listWorkerAlerts({ heartbeatTimeoutSeconds = 120, sourceTimeoutSeconds = 600 } = {}) {
    const [rows] = await connection.query(`SELECT worker_id,build_sha,mode,last_seen_at,scan_started_at,scan_finished_at,scan_status,scan_error,current_scan,
      CASE WHEN last_seen_at < UTC_TIMESTAMP(3) - INTERVAL ? SECOND THEN 'HEARTBEAT_OVERDUE'
           WHEN scan_started_at IS NOT NULL AND scan_finished_at IS NULL AND scan_started_at < UTC_TIMESTAMP(3) - INTERVAL ? SECOND THEN 'SCAN_OVERDUE'
           ELSE NULL END AS alert_code
      FROM po_worker_heartbeats h WHERE (last_seen_at < UTC_TIMESTAMP(3) - INTERVAL ? SECOND
         OR (scan_started_at IS NOT NULL AND scan_finished_at IS NULL AND scan_started_at < UTC_TIMESTAMP(3) - INTERVAL ? SECOND))
        AND (h.worker_id NOT REGEXP '^[0-9]+-[0-9a-fA-F-]{36}$'
          OR NOT EXISTS (SELECT 1 FROM po_worker_heartbeats stable
            WHERE stable.worker_id LIKE 'worker:%' AND stable.last_seen_at>=h.last_seen_at))`,
      [heartbeatTimeoutSeconds, sourceTimeoutSeconds, heartbeatTimeoutSeconds, sourceTimeoutSeconds]);
    return rows || [];
  }

  return { enqueueScheduled, scheduleSlotAtomic, acquireLease, advanceLease, renewLease, releaseLease, finalizeLease, upsertWorkerHeartbeat, listWorkerAlerts };
}

module.exports = { createSchedulerRepositoryAdapter };
