'use strict';
const { contractOf, isTrustedRunContractJournal } = require('./overseasBigPlayerRunContractJournal');
const { isTrustedManualReceipt } = require('./overseasManualReceipt');
const { assertRecoveryIntentProof, assertRecoveryIntentContext } = require('./overseasRecoveryIntent');
const { verifyRecoveryLineage } = require('./overseasRecoveryLineage');
const { verifyPersistedOverseasContract, iso } = require('./overseasBigPlayerNetworkContractVerifier');
const fail = () => { throw Object.assign(Error('Recovery Journal repair unverified'), { code: 'OVERSEAS_RECOVERY_JOURNAL_REPAIR_UNVERIFIED' }); };
async function restoreCommittedRecoveryJournal({ repo, intentReader, intentId, intentIds = [], journal, receipt } = {}) {
  if (!isTrustedRunContractJournal(journal) || !isTrustedManualReceipt(receipt) || !repo?.pool?.getConnection || typeof intentReader?.read !== 'function') fail();
  const p = assertRecoveryIntentProof(await intentReader.read(intentId)); assertRecoveryIntentContext(p, { journal, receipt });
  const c = contractOf({ ...p.scope, leaseOwner: p.next.leaseOwner, leaseEpoch: p.next.leaseEpoch });
  try { await journal.read(c); return { alreadyPresent: true, claimExecuted: false, httpExecuted: false }; }
  catch (error) { if (error.code !== 'OVERSEAS_CONTRACT_EVIDENCE_MISSING') throw error; }
  const previous = await journal.recover({ runId: c.runId, leaseEpoch: p.previous.leaseEpoch });
  if (previous.contractSha256 !== p.previousSha256) fail();
  if (previous.contract.leaseEpoch > 1) await verifyRecoveryLineage({ contract: previous.contract, requestId: p.requestId, receipt, journal, intentReader, intentIds });
  const conn = await repo.pool.getConnection(); let started = false, destroyed = false;
  try {
    await conn.query('SET SESSION innodb_lock_wait_timeout=?', [repo.syncUpsertLockWaitSeconds || 3]);
    await conn.beginTransaction(); started = true;
    const [rows] = await conn.query('SELECT *, (lease_until<UTC_TIMESTAMP(3)) AS expired FROM po_sync_runs WHERE id=? FOR UPDATE', [c.runId]);
    const row = rows[0];
    if (rows.length !== 1 || row.status !== 'running' || row.lease_owner !== c.leaseOwner || Number(row.lease_epoch) !== c.leaseEpoch
      || Number(row.attempts) !== p.next.attempts || Number(row.expired) !== 1 || row.finished_at !== null || row.next_retry_at !== null
      || row.started_at == null || row.parent_run_id !== null || row.trigger_type !== 'manual' || row.sync_mode !== 'incremental'
      || row.scheduled_at !== null || row.source_id !== c.sourceId || row.account_id !== c.accountId || row.site_id !== c.siteId
      || iso(row.window_start) !== c.windowStart || iso(row.window_end) !== c.windowEnd) fail();
    await conn.query('SELECT site_id FROM po_source_sites WHERE source_id=? AND site_id=? FOR UPDATE', [c.sourceId, c.siteId]);
    await conn.query('SELECT id FROM po_sources WHERE id=? FOR UPDATE', [c.sourceId]);
    await conn.query('SELECT id FROM po_accounts WHERE id=? FOR UPDATE', [c.accountId]);
    await verifyPersistedOverseasContract({ query: async (sql, params) => (await conn.query(sql + ' FOR UPDATE', params))[0] }, c, 'expired');
    // No business SQL writes and no live-owner adoption. Intent supplies every byte.
    await journal.create(c); await journal.read(c);
    await conn.rollback(); started = false;
    return { journalRestored: true, claimExecuted: false, httpExecuted: false };
  } finally {
    if (started) try { await conn.rollback(); } catch { destroyed = true; conn.destroy(); }
    if (!destroyed) conn.release();
  }
}
module.exports = { restoreCommittedRecoveryJournal };
