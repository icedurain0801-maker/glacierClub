const MARIA_DB_DATETIME3 = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

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
    scheduleVersion
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

    await connection.query(
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

  async function acquireLease({ sourceId, runId, ownerId, now, leaseUntil, scheduledAt, nextSlotAt } = {}) {
    const nowDb = toMariaDbDateTime(now, { name: 'now' });
    const leaseUntilDb = toMariaDbDateTime(leaseUntil, { name: 'leaseUntil' });
    const hasScheduleState = scheduledAt != null && nextSlotAt != null;
    const scheduledAtDb = hasScheduleState ? toMariaDbDateTime(scheduledAt, { name: 'scheduledAt' }) : null;
    const nextSlotAtDb = hasScheduleState ? toMariaDbDateTime(nextSlotAt, { name: 'nextSlotAt' }) : null;
    const stateSet = hasScheduleState ? ', last_scheduled_at=?, next_scheduled_at=?' : '';
    const [result] = await connection.query(
      `UPDATE po_source_schedule_state s
       SET lease_run_id=?, lease_owner=?, lease_epoch=lease_epoch+1, lease_until=?${stateSet}
       WHERE s.source_id=? AND (lease_until IS NULL OR lease_until<=?)
         AND NOT EXISTS (
           SELECT 1 FROM po_sync_runs r
           WHERE r.source_id=s.source_id AND r.status IN ('queued','running')
         )`,
      [runId, ownerId, leaseUntilDb, ...(hasScheduleState ? [scheduledAtDb, nextSlotAtDb] : []), sourceId, nowDb]
    );
    if (result?.affectedRows !== 1) return { acquired: false, leaseToken: null };

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

  return { enqueueScheduled, acquireLease, renewLease, releaseLease, finalizeLease };
}

module.exports = { createSchedulerRepositoryAdapter };
