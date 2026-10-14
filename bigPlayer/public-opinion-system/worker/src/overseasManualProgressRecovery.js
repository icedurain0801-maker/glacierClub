'use strict';
const {isTrustedManualReceipt}=require('./overseasManualReceipt');
const {canonical,isTrustedRunContractJournal}=require('./overseasBigPlayerRunContractJournal');
const {iso}=require('./overseasBigPlayerNetworkContractVerifier');
const plans=new WeakMap();
const fail=()=>{throw Object.assign(Error('Overseas progress evidence unverified'),{code:'OVERSEAS_PROGRESS_RECOVERY_UNVERIFIED'});};
const scope=c=>Object.fromEntries(Object.entries(c).filter(([key])=>!['leaseOwner','leaseEpoch'].includes(key)));
function natural(value){const n=Number(value);if(value==null||!Number.isSafeInteger(n)||n<0)fail();return n;}
function identity(row,b){
 if(!row||row.id!==b.runId||row.source_id!==b.sourceId||row.account_id!==b.accountId||row.site_id!==b.siteId
  ||row.parent_run_id!==null||row.trigger_type!=='manual'||row.sync_mode!=='incremental'||row.scheduled_at!==null
  ||iso(row.window_start)!==b.windowStart||iso(row.window_end)!==b.windowEnd)fail();
}
// Read-only planning only. Never infer a missing contract from current config,
// clear marker, reset cursor, claim a run or publish a Journal.
async function recoverManualProgress({repo,receipt,journal,requestIds,manifestSha256,intentReader,intentIds=[],requireStageCoverage=false}={}){
 if(!isTrustedManualReceipt(receipt)||!isTrustedRunContractJournal(journal)||typeof repo?.pool?.getConnection!=='function'
  ||typeof repo.reconcileOverseasManualMarker!=='function'||!Array.isArray(requestIds)||!requestIds.length
  ||new Set(requestIds).size!==requestIds.length||!/^[a-f0-9]{64}$/.test(manifestSha256||''))fail();
 const completedSites=[],firstRunBindings=[],expiredSites=[],seen=new Set();
 for(const requestId of requestIds){
  const request=await receipt.recover(requestId);
  if(request.bindings.some(b=>b.manifestSha256!==manifestSha256)||(await repo.reconcileOverseasManualMarker({request,receipt})).status!=='accepted')fail();
  const conn=await repo.pool.getConnection();let started=false,destroyed=false;
  try{
   await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION READ ONLY');started=true;
   const [clock]=await conn.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS now_utc");
   if(clock.length!==1)fail();const now=iso(String(clock[0].now_utc).replace(/(\.\d{3})000$/,'$1'));
   const [rows]=await conn.query(`SELECT * FROM po_sync_runs WHERE id IN (${request.bindings.map(()=>'?').join(',')}) ORDER BY id`,request.bindings.map(b=>b.runId));
   if(rows.length!==request.bindings.length)fail();
   for(const b of request.bindings){
    if(seen.has(b.runId))fail();seen.add(b.runId);const found=rows.filter(row=>row.id===b.runId);if(found.length!==1)fail();const row=found[0];identity(row,b);
    const epoch=natural(row.lease_epoch),attempts=natural(row.attempts);
    if(row.status==='queued'&&epoch===0&&attempts===0){
     if(['lease_owner','lease_until','next_retry_at','started_at','finished_at'].some(k=>row[k]!==null))fail();
     firstRunBindings.push(b);continue;
    }
    if(epoch<1||attempts!==epoch||row.started_at==null||iso(row.started_at)>now)fail();
    const proof=await journal.recover({runId:b.runId,leaseEpoch:epoch});
    if(canonical(scope(proof.contract))!==canonical(b))fail();
    if(['completed_full','completed_authorized_scope'].includes(row.status)){
     let boundCounter=false;
     if(requireStageCoverage){
      const ledger=require('../../server/src/db/overseasStageCoverage').createOverseasStageCoverageLedger({journal,receipt,request});
      const progress=await ledger.readProgress(conn,proof.contract);
      if(progress.coverageStatus!=='sealed'||!progress.historySealed||!progress.expansionSealed||progress.pending.length)fail();
      const audit=require('../../server/src/db/overseasBoundAudit').createOverseasBoundAudit({repo,journal,ledger});
      if((await audit.reconcileInTransaction(conn,{contract:proof.contract,status:row.status})).status!=='accepted')fail();
      boundCounter=true;
     }
     if(['lease_owner','lease_until','next_retry_at','error_code','error_message'].some(k=>row[k]!==null)
      ||row.finished_at==null||iso(row.finished_at)<iso(row.started_at)||iso(row.finished_at)>now)fail();
     const [checkpoints]=await conn.query('SELECT * FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND window_start=? AND window_end=? ORDER BY id',
      [b.accountId,b.siteId,b.windowStart,b.windowEnd]);
     if(!checkpoints.length||!checkpoints.some(cp=>cp.task_kind==='q1_feed'&&cp.sync_scope==='posts')||checkpoints.some(cp=>cp.status!=='completed'||cp.lease_owner!==null||cp.lease_until!==null
      ||cp.cursor!==null||cp.error_code!==null||cp.error_message!==null))fail();
     for(const cp of checkpoints){
      if(cp.account_id!==b.accountId||cp.site_id!==b.siteId||iso(cp.window_start)!==b.windowStart||iso(cp.window_end)!==b.windowEnd
       ||typeof cp.task_key!=='string'||!cp.task_key.startsWith(`board:${b.boardId}:`))fail();
      if(cp.task_kind==='q1_feed'){
       if(cp.sync_scope!=='posts'||cp.root_platform_content_id!=='')fail();
      }else if(cp.task_kind==='comments'||cp.task_kind==='q1_reply'){
       if(cp.sync_scope!=='comments'||typeof cp.root_platform_content_id!=='string'||!cp.root_platform_content_id)fail();
       if(cp.task_kind==='comments'&&cp.task_key!==`board:${b.boardId}:${cp.root_platform_content_id}`)fail();
       if(cp.task_kind==='comments'){
        const [roots]=await conn.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=?',[b.sourceId,cp.root_platform_content_id]);
        if(roots.length!==1||roots[0].content_type!=='post'||Number(roots[0].content_depth)!==0||Number(roots[0].is_deleted)
         ||roots[0].account_id!==b.accountId||roots[0].game_id!==b.gameId||roots[0].community_id!==b.communityId)fail();
        let payload;try{payload=typeof roots[0].raw_payload==='string'?JSON.parse(roots[0].raw_payload):roots[0].raw_payload;}catch{fail();}
        for(const key of ['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'])if(payload?._overseasScope?.[key]!==b[key])fail();
       }
       if(cp.task_kind==='q1_reply'){
        const match=cp.task_key.match(new RegExp(`^board:${b.boardId}:reply:([0-9]+):([012])$`));if(!match)fail();
        const [parents]=await conn.query('SELECT * FROM po_contents WHERE source_id=? AND external_id IN (?,?)',[b.sourceId,cp.root_platform_content_id,match[1]]);
        const root=parents.find(p=>p.external_id===cp.root_platform_content_id),parent=parents.find(p=>p.external_id===match[1]);
        if(!root||!parent||root.content_type!=='post'||Number(root.content_depth)!==0||parent.content_type!=='comment'||parent.root_content_id!==root.id
         ||Number(parent.content_depth)<1||[root,parent].some(p=>p.source_id!==b.sourceId||p.account_id!==b.accountId||p.game_id!==b.gameId||p.community_id!==b.communityId||Number(p.is_deleted)))fail();
        for(const p of [root,parent]){let payload;try{payload=typeof p.raw_payload==='string'?JSON.parse(p.raw_payload):p.raw_payload;}catch{fail();}
         for(const key of ['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'])if(payload?._overseasScope?.[key]!==b[key])fail();}
       }
      }else fail();
      natural(cp.items_fetched);
      if(cp.last_item_at!==null&&(iso(cp.last_item_at)<b.windowStart||iso(cp.last_item_at)>=b.windowEnd))fail();
     }
     const [links]=await conn.query('SELECT rc.content_id,rc.change_type,rc.sync_scope,c.* FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? ORDER BY rc.sequence_no',[b.runId]);
     let fetched=0,inserted=0,changed=0,unchanged=0;
     for(const link of links){
      let payload;try{payload=typeof link.raw_payload==='string'?JSON.parse(link.raw_payload):link.raw_payload;}catch{fail();}
      const marker=payload?._overseasScope;
      for(const key of ['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'])if(marker?.[key]!==b[key])fail();
      if(link.source_id!==b.sourceId||link.account_id!==b.accountId||link.game_id!==b.gameId||link.community_id!==b.communityId)fail();
      if(!['posts','comments'].includes(link.sync_scope)||!['inserted','changed','unchanged'].includes(link.change_type))fail();
      if(link.sync_scope==='posts'&&(link.content_type!=='post'||Number(link.content_depth)!==0||link.root_content_id!==null||link.parent_content_id!==null))fail();
      if(link.sync_scope==='comments'){
       if(link.content_type!=='comment'||!Number.isSafeInteger(Number(link.content_depth))||Number(link.content_depth)<1||!link.root_content_id||!link.parent_content_id)fail();
       const [parents]=await conn.query('SELECT * FROM po_contents WHERE id IN (?,?)',[link.root_content_id,link.parent_content_id]);
       const root=parents.find(p=>p.id===link.root_content_id),parent=parents.find(p=>p.id===link.parent_content_id);
       if(!root||!parent||root.content_type!=='post'||Number(root.content_depth)!==0||Number(parent.content_depth)!==Number(link.content_depth)-1
        ||[root,parent].some(p=>p.source_id!==b.sourceId||p.account_id!==b.accountId||p.game_id!==b.gameId||p.community_id!==b.communityId||Number(p.is_deleted)))fail();
       if(Number(link.content_depth)===1?parent.id!==root.id:parent.root_content_id!==root.id)fail();
       for(const p of [root,parent]){let payload;try{payload=typeof p.raw_payload==='string'?JSON.parse(p.raw_payload):p.raw_payload;}catch{fail();}
        for(const key of ['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'])if(payload?._overseasScope?.[key]!==b[key])fail();}
      }
      if(link.sync_scope==='posts'){
       const [memberships]=await conn.query('SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id=?',[b.accountId,link.id]);
       if(!memberships.length)fail();
       for(const m of memberships){let feed;try{feed=typeof m.feed_metadata==='string'?JSON.parse(m.feed_metadata):m.feed_metadata;}catch{fail();}
        if(m.account_id!==b.accountId||m.content_id!==link.id||feed?.feedKey!==m.feed_key||String(feed?.boardId)!==b.boardId
         ||!checkpoints.some(cp=>cp.task_kind==='q1_feed'&&cp.task_key===`board:${b.boardId}:${m.feed_key}`))fail();}
       fetched++;if(link.change_type==='inserted')inserted++;else if(link.change_type==='changed')changed++;else if(link.change_type==='unchanged')unchanged++;else fail();
      }
     }
     for(const [key,value] of Object.entries({fetched_count:fetched,inserted_count:inserted,changed_count:changed,unchanged_count:unchanged}))if(natural(row[key])!==value)fail();
     if(epoch>1){
      await require('./overseasRecoveryLineage').verifyRecoveryLineage({contract:proof.contract,requestId,receipt,journal,intentReader,intentIds});
      if(natural(row.discovered_count)!==links.length||natural(row.stored_count)!==links.filter(link=>link.change_type!=='unchanged').length)fail();
     }else if(boundCounter){
      if(natural(row.discovered_count)!==links.length||natural(row.stored_count)!==links.filter(link=>link.change_type!=='unchanged').length)fail();
     }else{
      const checkpointFetched=checkpoints.filter(cp=>cp.sync_scope==='posts').reduce((sum,cp)=>sum+natural(cp.items_fetched),0);
      if(natural(row.discovered_count)!==checkpointFetched||natural(row.stored_count)!==inserted+changed)fail();
     }
     completedSites.push(Object.freeze({requestId,runId:b.runId,siteId:b.siteId,leaseEpoch:epoch,contractSha256:proof.contractSha256,storedCount:row.stored_count,fetchedCount:fetched}));
    }else if(row.status==='running'){
     if(typeof row.lease_owner!=='string'||!row.lease_owner||row.lease_owner!==proof.contract.leaseOwner||row.lease_until==null
      ||iso(row.lease_until)>=now||row.finished_at!==null||row.next_retry_at!==null)fail();
     // Descriptor is NOT reclaim permission; exact intent/CAS module is required.
     expiredSites.push(Object.freeze({requestId,binding:b,previousContract:proof.contract,previousSha256:proof.contractSha256,attempts}));
    }else fail();
   }
   await conn.rollback();started=false;
  }finally{if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}if(!destroyed)conn.release();}
 }
 const plan=Object.freeze({completedSites:Object.freeze(completedSites),firstRunBindings:Object.freeze(firstRunBindings),expiredSites:Object.freeze(expiredSites),allCompleted:firstRunBindings.length===0&&expiredSites.length===0});
 plans.set(plan,{repo,receipt,journal,requestIds:[...requestIds],manifestSha256,intentReader,intentIds:[...intentIds],requireStageCoverage});return plan;
}
async function createProgressIsolatedCandidateDeps({plan,...options}={}){
 const original=plans.get(plan);if(!original||original.repo!==options.baseDeps?.repo||original.journal!==options.journal||original.manifestSha256!==options.manifestSha256
  ||Object.hasOwn(options,'initialContracts')||Object.hasOwn(options,'initialRunBindings'))fail();
 if((options.stageCoverage||options.boundAudit)&&!original.requireStageCoverage)fail();
 const current=await recoverManualProgress(original);
 if(current.allCompleted)return Object.freeze({allCompleted:true,productionActivationAllowed:false});
 // Reclaim not wired until durable intent and exact SQL CAS are implemented.
 if(current.expiredSites.length)fail();
 const factory=require('./overseasBigPlayerCandidateFactory');
 return (original.requireStageCoverage?factory.createStageCoveredIsolatedCandidateDeps:factory.createIsolatedOverseasCandidateDeps)({...options,initialRunBindings:current.firstRunBindings});
}
function expiredDescriptor(plan,runId){
 if(!plans.has(plan))fail();const rows=plan.expiredSites.filter(entry=>entry.binding.runId===runId);if(rows.length!==1)fail();return rows[0];
}
const recoverStageCoveredManualProgress=options=>recoverManualProgress({...options,requireStageCoverage:true});
module.exports={recoverManualProgress,recoverStageCoveredManualProgress,createProgressIsolatedCandidateDeps,expiredDescriptor};
