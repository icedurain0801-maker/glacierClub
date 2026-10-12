'use strict';
const crypto=require('node:crypto');
const { contextOf }=require('../../server/src/connectors/overseasBigPlayerSiteSession');
const { contractOf, canonical }=require('./overseasBigPlayerRunContractJournal');
const { verifyPersistedOverseasContract, iso }=require('./overseasBigPlayerNetworkContractVerifier');
const fail=()=>{throw Object.assign(new Error('Claimed overseas contract invalid'),{code:'OVERSEAS_CLAIMED_CONTRACT_INVALID'});};
function createOverseasClaimedContracts({repo,journal,manifestSha256,initialContracts=[],initialRunBindings=[],recoveryProofs=[]}={}) {
  if(typeof repo?.query!=='function'||typeof journal?.create!=='function'||typeof journal?.read!=='function'
    || !/^[a-f0-9]{64}$/.test(manifestSha256||'')||!Array.isArray(initialContracts)||!Array.isArray(initialRunBindings)||!Array.isArray(recoveryProofs))fail();
  const recovery=new Map();
  for(const proof of recoveryProofs){
    require('./overseasRecoveryIntent').assertRecoveryIntentProof(proof);
    require('./overseasRecoveryIntent').assertRecoveryIntentContext(proof,{journal});
    const c=contractOf({...proof.scope,leaseOwner:proof.next.leaseOwner,leaseEpoch:proof.next.leaseEpoch});
    if(c.manifestSha256!==manifestSha256||recovery.has(c.runId))fail();recovery.set(c.runId,proof);
  }
  // Explicit isolated first-run contracts, including the real claim owner/epoch.
  // Never serialize these as service env or re-inject them on restart.
  const initialRunIds=new Set();
  function first(c) {
    if(c.manifestSha256!==manifestSha256||c.leaseEpoch!==1||initialRunIds.has(c.runId)||recovery.has(c.runId))fail();
    initialRunIds.add(c.runId);return c;
  }
  const initial=new Set(initialContracts.map(value=>{
    const c=first(contractOf(value));return canonical(c);
  }));
  const scopeKey=c=>canonical(Object.fromEntries(Object.entries(c).filter(([key])=>!['leaseOwner','leaseEpoch'].includes(key))));
  const firstScopes=new Set(initialRunBindings.map(value=>{
    if(!value||Object.hasOwn(value,'leaseOwner')||Object.hasOwn(value,'leaseEpoch'))fail();
    const c=contractOf({...value,leaseOwner:'first-run-validation',leaseEpoch:1});
    first(c);return scopeKey(c);
  }));
  function expected(input) {
    const {source,account}=input,context=contextOf({...source,account});
    return contractOf({runId:input.syncRunId||input.syncRun?.id,sourceId:source.id,accountId:account.id,
      gameId:account.game_id,communityId:account.community_id,siteId:context.siteId,boardId:context.boardId,
      siteUrl:context.base.toString(),siteUrlSha256:crypto.createHash('sha256').update(context.base.toString()).digest('hex'),
      windowStart:iso(input.windowStart??input.collectionWindow?.publishedFrom),windowEnd:iso(input.windowEnd??input.collectionWindow?.publishedTo),
      leaseOwner:input.leaseOwner,leaseEpoch:input.leaseEpoch,manifestSha256});
  }
  async function read(input) {
    const c=expected(input);await journal.read(c);await verifyPersistedOverseasContract(repo,c);return c;
  }
  async function prepare(input) {
    const c=expected(input),key=canonical(c);
    const scope=scopeKey(c),firstScope=firstScopes.has(scope);
    const proof=recovery.get(c.runId);
    if(proof){
      recovery.delete(c.runId); // one-use before awaits, even publication failures
      if(canonical(c)!==canonical(contractOf({...proof.scope,leaseOwner:proof.next.leaseOwner,leaseEpoch:proof.next.leaseEpoch})))fail();
      await verifyPersistedOverseasContract(repo,c);
      const rows=await repo.query('SELECT attempts,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? LIMIT 2',[c.runId]);
      if(rows.length!==1||Number(rows[0].attempts)!==proof.next.attempts||rows[0].lease_owner!==c.leaseOwner||Number(rows[0].lease_epoch)!==c.leaseEpoch||Number(rows[0].live)!==1)fail();
      const old=await journal.recover({runId:c.runId,leaseEpoch:proof.previous.leaseEpoch});
      if(old.contractSha256!==proof.previousSha256)fail();
      await journal.create(c);return read(input);
    }
    if(!initial.has(key)&&!firstScope)return read(input);
    // Consume BEFORE attempting creation, including validation/file failures.
    initial.delete(key);
    firstScopes.delete(scope);
    await verifyPersistedOverseasContract(repo,c);
    const rows=await repo.query('SELECT attempts,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? LIMIT 2',[c.runId]);
    if(!Array.isArray(rows)||rows.length!==1||Number(rows[0].attempts)!==1||rows[0].lease_owner!==c.leaseOwner
      ||Number(rows[0].lease_epoch)!==c.leaseEpoch||Number(rows[0].live)!==1||(firstScope&&c.leaseEpoch!==1))fail();
    await journal.create(c);
    // Recheck after publication; expired/changed lease cannot start HTTP.
    return read(input);
  }
  return Object.freeze({prepare,read,productionActivationAllowed:false});
}
module.exports={createOverseasClaimedContracts};
