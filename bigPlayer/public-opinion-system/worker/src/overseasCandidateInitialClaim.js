'use strict';
const {randomUUID}=require('node:crypto');
const {contractOf}=require('./overseasBigPlayerRunContractJournal');
const {iso}=require('./overseasBigPlayerNetworkContractVerifier');
const contexts=new WeakMap();
const fail=()=>{throw Object.assign(Error('Candidate initial claim unverified'),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});};
function createCandidateInitialClaim({repo,manifestSha256,initialRunBindings=[]}={}){
 if(typeof repo?.query!=='function'||!/^[a-f0-9]{64}$/.test(manifestSha256||'')||!Array.isArray(initialRunBindings))fail();
 const bindings=new Map();
 for(const value of initialRunBindings){
  if(!value||Object.hasOwn(value,'leaseOwner')||Object.hasOwn(value,'leaseEpoch'))fail();
  const c=contractOf({...value,leaseOwner:'first-claim-validation',leaseEpoch:1});
  if(c.manifestSha256!==manifestSha256||bindings.has(c.runId))fail();bindings.set(c.runId,c);
 }
 const db=value=>iso(value).replace('T',' ').replace(/Z$/,'');
 const claim=async({runId,accountId,leaseOwner,leaseSeconds=300}={})=>{
  const c=bindings.get(runId);
  if(!c||(accountId!==undefined&&accountId!==c.accountId)||typeof leaseOwner!=='string'||!/^[A-Za-z0-9._:-]{1,180}$/.test(leaseOwner)
   ||!Number.isSafeInteger(Number(leaseSeconds))||Number(leaseSeconds)<1||Number(leaseSeconds)>3600)fail();
  const owner=`${leaseOwner}:${randomUUID()}`;
  // One exact queued0 CAS. Never adopt expired/running rows or retry unknown ACK.
  const changed=await repo.query(`UPDATE po_sync_runs SET status='running',started_at=UTC_TIMESTAMP(3),attempts=1,lease_owner=?,lease_epoch=1,
   lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),updated_at=UTC_TIMESTAMP(3)
   WHERE id=? AND source_id=? AND account_id=? AND site_id=? AND window_start=? AND window_end=?
    AND parent_run_id IS NULL AND trigger_type='manual' AND sync_mode='incremental' AND scheduled_at IS NULL
    AND status='queued' AND lease_epoch=0 AND attempts=0 AND lease_owner IS NULL AND lease_until IS NULL
    AND started_at IS NULL AND finished_at IS NULL AND next_retry_at IS NULL`,
   [owner,Number(leaseSeconds),c.runId,c.sourceId,c.accountId,c.siteId,db(c.windowStart),db(c.windowEnd)]);
  if(Number(changed.affectedRows)===0)return null;if(Number(changed.affectedRows)!==1)fail();
  const rows=await repo.query("SELECT * FROM po_sync_runs WHERE id=? AND lease_owner=? AND lease_epoch=1 AND attempts=1 AND status='running' AND lease_until>UTC_TIMESTAMP(3) LIMIT 2",[runId,owner]);
  if(!Array.isArray(rows)||rows.length!==1)fail();const r=rows[0];
  if(r.id!==c.runId||r.source_id!==c.sourceId||r.account_id!==c.accountId||r.site_id!==c.siteId||iso(r.window_start)!==c.windowStart||iso(r.window_end)!==c.windowEnd
   ||r.parent_run_id!==null||r.trigger_type!=='manual'||r.sync_mode!=='incremental'||r.scheduled_at!==null||r.status!=='running'
   ||r.lease_owner!==owner||Number(r.lease_epoch)!==1||Number(r.attempts)!==1)fail();
  return r;
 };
 contexts.set(claim,repo);return claim;
}
function assertCandidateInitialClaim(handler,repo){if(!contexts.has(handler)||contexts.get(handler)!==repo)fail();return handler;}
module.exports={createCandidateInitialClaim,assertCandidateInitialClaim};
