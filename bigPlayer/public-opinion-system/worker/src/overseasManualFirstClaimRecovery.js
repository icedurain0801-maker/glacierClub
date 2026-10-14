'use strict';
const { isTrustedManualReceipt } = require('./overseasManualReceipt');
const { iso } = require('./overseasBigPlayerNetworkContractVerifier');
const fail = () => { throw Object.assign(new Error('Overseas first claim recovery unverified'), { code:'OVERSEAS_FIRST_CLAIM_RECOVERY_UNVERIFIED' }); };
const zero = value => (typeof value === 'number' || typeof value === 'string') && /^(?:0)$/.test(String(value));
// Explicit receipt IDs only. No directory scan, new receipt, claim, journal
// publication or HTTP. A returned scope is NOT permission to bypass claim CAS.
async function recoverManualFirstRunBindings({repo,receipt,requestIds,manifestSha256}={}) {
  if (!isTrustedManualReceipt(receipt) || !Array.isArray(requestIds) || !requestIds.length
    || new Set(requestIds).size !== requestIds.length || !/^[a-f0-9]{64}$/.test(manifestSha256||'')
    || typeof repo?.reconcileOverseasManualMarker !== 'function') fail();
  const bindings=[], seen=new Set();
  for (const requestId of requestIds) {
    const request=await receipt.recover(requestId);
    if(request.bindings.some(b=>b.manifestSha256!==manifestSha256))fail();
    if((await repo.reconcileOverseasManualMarker({request,receipt})).status!=='accepted')fail();
    const conn=await repo.pool.getConnection();let started=false,destroyed=false;
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.query('START TRANSACTION READ ONLY');started=true;
      const [rows]=await conn.query(`SELECT * FROM po_sync_runs WHERE id IN (${request.bindings.map(()=>'?').join(',')}) ORDER BY id`,request.bindings.map(b=>b.runId));
      if(rows.length!==request.bindings.length)fail();
      for(const b of request.bindings) {
        const found=rows.filter(row=>row.id===b.runId),r=found[0];
        if(found.length!==1 || seen.has(b.runId) || r.source_id!==b.sourceId || r.account_id!==b.accountId
          || r.site_id!==b.siteId || r.parent_run_id!=null || r.trigger_type!=='manual' || r.sync_mode!=='incremental'
          || r.scheduled_at!=null || iso(r.window_start)!==b.windowStart || iso(r.window_end)!==b.windowEnd
          || r.status!=='queued' || !zero(r.attempts) || !zero(r.lease_epoch)
          || r.lease_owner!==null || r.lease_until!==null || r.next_retry_at!==null
          || r.started_at!==null || r.finished_at!==null)fail();
        seen.add(b.runId);bindings.push(b);
      }
      await conn.rollback();started=false;
    } finally {
      if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}
      if(!destroyed)conn.release();
    }
  }
  return bindings;
}
async function createRecoveredIsolatedOverseasCandidateDeps(options={}) {
  // Disallow callers mixing injected first permissions with recovered ones.
  if(Object.hasOwn(options,'initialContracts')||Object.hasOwn(options,'initialRunBindings'))fail();
  const initialRunBindings=await recoverManualFirstRunBindings({repo:options.baseDeps?.repo,receipt:options.receipt,
    requestIds:options.requestIds,manifestSha256:options.manifestSha256});
  const factory=require('./overseasBigPlayerCandidateFactory');
  return (options.stageCoverage||options.boundAudit?factory.createStageCoveredIsolatedCandidateDeps:factory.createIsolatedOverseasCandidateDeps)({...options,initialRunBindings});
}
module.exports={recoverManualFirstRunBindings,createRecoveredIsolatedOverseasCandidateDeps};
