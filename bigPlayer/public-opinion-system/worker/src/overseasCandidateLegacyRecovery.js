'use strict';
const contexts = new WeakMap();
const fail = () => { throw Object.assign(new Error('Candidate legacy recovery unverified'), { code: 'OVERSEAS_LEGACY_RECOVERY_UNVERIFIED' }); };
// Candidate-only bulk protection, never overseas recovery or a claim permit.
// Keep workerScanLease defaults: 3 attempts, 600 seconds, 50 rows.
function createOverseasCandidateLegacyRecovery({ repo } = {}) {
  if (typeof repo?.query !== 'function') fail();
  const recover = async () => {
    const result = await repo.query(`UPDATE po_sync_runs SET
      status=CASE WHEN attempts>=? THEN 'failed' ELSE 'queued' END,
      error_code=CASE WHEN attempts>=? THEN 'SYNC_RUN_POISONED' ELSE 'SYNC_RUN_RECOVERED' END,
      lease_owner=NULL, lease_until=NULL, lease_epoch=lease_epoch+1, attempts=attempts+1,
      updated_at=UTC_TIMESTAMP(3)
      WHERE ((status='running' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3)))
        OR (status='queued' AND updated_at<DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -? SECOND)))
        AND EXISTS (SELECT 1 FROM po_sources s JOIN po_games g ON g.id=s.game_id
          WHERE s.id=po_sync_runs.source_id
            AND BINARY g.region_code IN ('domestic','overseas')
            AND ((BINARY s.platform='bigplayer_h5' AND BINARY g.region_code='domestic')
              OR BINARY s.platform IN ('taptap','discord','facebook','bilibili','douyin','xiaohongshu','weibo','tieba')))
      ORDER BY updated_at ASC, id ASC LIMIT ?`, [3, 3, 600, 50]);
    return { recovered: result.affectedRows || 0, limit: 50, overseasRecoveryPerformed: false };
  };
  contexts.set(recover, repo); return recover;
}
function assertCandidateLegacyRecovery(handler, repo) {
  if (!contexts.has(handler) || contexts.get(handler) !== repo) fail(); return handler;
}
module.exports = { createOverseasCandidateLegacyRecovery, assertCandidateLegacyRecovery };
