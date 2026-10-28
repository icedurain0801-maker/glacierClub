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
    WHERE ((status='running' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3)))
       OR (status='queued' AND attempts>0 AND COALESCE(error_code,'') NOT IN ('SYNC_ACCOUNT_BUSY','RATE_LIMITED') AND (next_retry_at IS NULL OR next_retry_at<=UTC_TIMESTAMP(3)) AND updated_at<DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -? SECOND)))
    AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT parent_run_id FROM po_sync_runs WHERE parent_run_id IS NOT NULL) parent_runs WHERE parent_runs.parent_run_id=po_sync_runs.id)
    ORDER BY updated_at ASC, id ASC LIMIT ?`, [maxAttempts, maxAttempts, queuedTimeoutSeconds, boundedLimit]);
  await reconcileTerminalParents(query, { limit: boundedLimit });
  return { recovered: result.affectedRows || 0, limit: boundedLimit };
}

// Recovery can poison the final child without passing through finishScheduledSiteRun.
// Such parents must become terminal too, or their queued status blocks every later slot.
async function reconcileTerminalParents(query, { limit = 50 } = {}) {
  const parents = await query(`SELECT p.id FROM po_sync_runs p
    WHERE p.parent_run_id IS NULL AND p.status IN ('queued','running')
      AND (p.lease_until IS NULL OR p.lease_until<=UTC_TIMESTAMP(3))
      AND EXISTS (SELECT 1 FROM po_sync_runs c WHERE c.parent_run_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM po_sync_runs c WHERE c.parent_run_id=p.id
        AND (c.status NOT IN ('completed','completed_full','completed_authorized_scope','partial','failed','cancelled','canceled')
          OR c.source_id<>p.source_id OR c.account_id<>p.account_id))
    ORDER BY p.created_at,p.id LIMIT ?`, [Math.min(100, Math.max(1, Number(limit) || 50))]);
  let finalized = 0;
  for (const parent of parents) {
    const result = await query(`UPDATE po_sync_runs p JOIN (
      SELECT parent_run_id,COUNT(*) AS total,
        SUM(status IN ('completed','completed_full','completed_authorized_scope')) AS succeeded,
        SUM(status IN ('completed','completed_full','completed_authorized_scope','partial','failed','cancelled','canceled')) AS terminal,
        MIN(source_id) AS source_min,MAX(source_id) AS source_max,MIN(account_id) AS account_min,MAX(account_id) AS account_max,
        SUM(discovered_count) AS discovered,SUM(stored_count) AS stored,SUM(fetched_count) AS fetched,
        SUM(inserted_count) AS inserted,SUM(changed_count) AS changed,SUM(unchanged_count) AS unchanged,SUM(comment_count) AS comments
      FROM po_sync_runs WHERE parent_run_id=? GROUP BY parent_run_id
    ) c ON c.parent_run_id=p.id
    SET p.status=CASE WHEN c.succeeded=c.total THEN 'completed' WHEN c.succeeded>0 THEN 'partial' ELSE 'failed' END,
      p.finished_at=UTC_TIMESTAMP(3),p.discovered_count=c.discovered,p.stored_count=c.stored,
      p.fetched_count=c.fetched,p.inserted_count=c.inserted,p.changed_count=c.changed,p.unchanged_count=c.unchanged,p.comment_count=c.comments,
      p.error_code=CASE WHEN c.succeeded=c.total THEN NULL WHEN c.succeeded>0 THEN 'MULTISITE_PARTIAL_FAILURE' ELSE 'MULTISITE_ALL_SITES_FAILED' END,
      p.error_message=CASE WHEN c.succeeded=c.total THEN NULL ELSE 'Site runs ended; inspect child runs for failure details' END,
      p.lease_owner=NULL,p.lease_until=NULL,p.lease_epoch=p.lease_epoch+1,p.updated_at=UTC_TIMESTAMP(3)
    WHERE p.id=? AND p.parent_run_id IS NULL AND p.status IN ('queued','running')
      AND (p.lease_until IS NULL OR p.lease_until<=UTC_TIMESTAMP(3)) AND c.total=c.terminal
      AND c.source_min=p.source_id AND c.source_max=p.source_id AND c.account_min=p.account_id AND c.account_max=p.account_id`, [parent.id, parent.id]);
    finalized += result.affectedRows || 0;
  }
  return { finalized };
}

async function listPoisonedRuns(query, limit = 50) {
  return query("SELECT id,source_id,attempts,error_code,updated_at FROM po_sync_runs WHERE status='failed' AND error_code='SYNC_RUN_POISONED' ORDER BY updated_at DESC,id DESC LIMIT ?", [Math.min(100, Math.max(1, Number(limit) || 50))]);
}
module.exports = { createWorkerScanLease, recoverExpiredRuns, listPoisonedRuns, reconcileTerminalParents };
