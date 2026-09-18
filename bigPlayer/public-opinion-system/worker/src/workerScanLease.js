function createWorkerScanLease(query) {
  async function acquire(owner, seconds = 120) {
    const result = await query(`UPDATE po_worker_leases SET owner_id=?, epoch=epoch+1,
      lease_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND)
      WHERE lease_key='worker_scheduler' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))`, [owner, seconds]);
    if (result.affectedRows !== 1) return null;
    const rows = await query("SELECT epoch FROM po_worker_leases WHERE lease_key='worker_scheduler' AND owner_id=? AND lease_until>UTC_TIMESTAMP(3)", [owner]);
    return rows[0] ? { owner, epoch: rows[0].epoch } : null;
  }
  async function renew(token, seconds = 120) {
    const result = await query(`UPDATE po_worker_leases SET lease_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND)
      WHERE lease_key='worker_scheduler' AND owner_id=? AND epoch=? AND lease_until>UTC_TIMESTAMP(3)`, [seconds, token.owner, token.epoch]);
    return result.affectedRows === 1;
  }
  async function release(token) {
    const result = await query(`UPDATE po_worker_leases SET owner_id=NULL, lease_until=NULL
      WHERE lease_key='worker_scheduler' AND owner_id=? AND epoch=? AND lease_until>UTC_TIMESTAMP(3)`, [token.owner, token.epoch]);
    return result.affectedRows === 1;
  }
  return { acquire, renew, release };
}

async function recoverExpiredRuns(query, { limit = 50, maxAttempts = 3, queuedTimeoutSeconds = 600 } = {}) {
  const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const result = await query(`UPDATE po_sync_runs SET
    status=CASE WHEN attempts>=? THEN 'failed' ELSE 'queued' END,
    error_code=CASE WHEN attempts>=? THEN 'SYNC_RUN_POISONED' ELSE 'SYNC_RUN_RECOVERED' END,
    lease_owner=NULL, lease_until=NULL, lease_epoch=lease_epoch+1, attempts=attempts+1,
    updated_at=UTC_TIMESTAMP(3)
    WHERE (status='running' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3)))
       OR (status='queued' AND updated_at<DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -? SECOND))
    ORDER BY updated_at ASC, id ASC LIMIT ?`, [maxAttempts, maxAttempts, queuedTimeoutSeconds, boundedLimit]);
  return { recovered: result.affectedRows || 0, limit: boundedLimit };
}

async function listPoisonedRuns(query, limit = 50) {
  return query("SELECT id,source_id,attempts,error_code,updated_at FROM po_sync_runs WHERE status='failed' AND error_code='SYNC_RUN_POISONED' ORDER BY updated_at DESC,id DESC LIMIT ?", [Math.min(100, Math.max(1, Number(limit) || 50))]);
}
module.exports = { createWorkerScanLease, recoverExpiredRuns, listPoisonedRuns };
