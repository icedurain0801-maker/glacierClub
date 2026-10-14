'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const {assertLegacyContent,legacyItem,legacyInsert}=require('./lastNightLegacyContentContract');
const {withDeadlineConnection}=require('./lastNightDeadlineConnection');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=row=>crypto.createHash('sha256').update(JSON.stringify(Object.keys(row||{}).sort().map(key=>[key,row[key]]))).digest('hex');
const MUTABLE=['account_id','community_id','board_id','board_name','content_type','platform_author_id','root_content_id','parent_content_id','platform_parent_id','content_depth','is_deleted','author_name','title','body','media','published_at','source_url','engagement','fingerprint','raw_payload','last_seen_at'];
function assertScope(account,items,feed) {
  if(account?.source_id!==SOURCE_ID||account.game_id!==GAME_ID||account.community_id!==COMMUNITY_ID||!account.id||items.length>20
    ||new Set(items.map(item=>String(item.externalId))).size!==items.length||feed?.boardId!==BOARD_ID||feed.endpointKind!=='merged'||!feed.feedKey
    ||items.some(item=>String(item.boardId)!==BOARD_ID||!item.externalId||item.contentType!=='post'||item.rawPayload?._contentIntegrity?.status!=='detail_enriched')) fail('LAST_NIGHT_STORE_SCOPE_INVALID');
}
async function protectedStorePage({repo,account,items,feed,persistEvidence,contentMode='board_columns',timeoutMs=15000}={}) {
  assertScope(account,items,feed);
  if(typeof persistEvidence!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000) fail('LAST_NIGHT_STORE_PROTECTION_REQUIRED');
  let conn,timer,committing=false,committed=false,expired=false,rejectExpired;
  const deadline=new Promise((_,reject)=>{rejectExpired=reject;});deadline.catch(()=>{});
  const bounded=promise=>Promise.race([promise,deadline]);
  timer=setTimeout(()=>{expired=true;conn?.destroy();rejectExpired(Object.assign(new Error('LAST_NIGHT_STORE_TIMEOUT'),{code:'LAST_NIGHT_STORE_TIMEOUT'}));},timeoutMs);
  const before=[],after=[];
  const q=(sql,params=[])=>{if(expired) fail('LAST_NIGHT_STORE_TIMEOUT');return bounded(conn.query({sql,timeout:Math.min(timeoutMs,8000)},params));};
  const legacy=contentMode==='legacy_source_external';
  if(legacy&&new Set(items.map(item=>item.fingerprint)).size!==items.length) fail('LAST_NIGHT_LEGACY_FINGERPRINT_CONFLICT');
  const state={transactionId:crypto.randomUUID(),sourceId:SOURCE_ID,accountId:account.id,boardId:BOARD_ID,contentMode,before,after,phase:'prepared'};
  try {
    const pending=repo.pool.getConnection();pending.then(connection=>{if(expired) connection.destroy();},()=>{});conn=await bounded(pending);
    await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
    for(const item of [...items].sort((a,b)=>String(a.externalId).localeCompare(String(b.externalId)))) {
      const [rows]=await q(legacy?'SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1 FOR UPDATE':'SELECT * FROM po_contents WHERE source_id=? AND board_key=? AND external_id=? LIMIT 1 FOR UPDATE',legacy?[SOURCE_ID,item.externalId]:[SOURCE_ID,BOARD_ID,item.externalId]);
      const row=rows[0]||null;
      if(row&&(row.account_id!==account.id||row.game_id!==GAME_ID||row.community_id!==COMMUNITY_ID)) fail('LAST_NIGHT_STORE_EXISTING_SCOPE_MISMATCH');
      if(row&&legacy)assertLegacyContent(row,account.id); // Never infer unmarked content belongs to this board.
      if(legacy) {
        const [fingerprints]=await q('SELECT id,external_id FROM po_contents WHERE source_id=? AND fingerprint=? FOR UPDATE',[SOURCE_ID,item.fingerprint]);
        if(fingerprints.some(candidate=>String(candidate.external_id)!==String(item.externalId)))fail('LAST_NIGHT_LEGACY_FINGERPRINT_CONFLICT');
      }
      const memberships=row?(await q('SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id=? AND feed_key=? FOR UPDATE',[account.id,row.id,feed.feedKey]))[0]:[];
      const scopeMemberships=legacy&&row?(await q('SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id=? FOR UPDATE',[account.id,row.id]))[0]:memberships;
      for(const membership of scopeMemberships) {
        let metadata;try{metadata=typeof membership.feed_metadata==='string'?JSON.parse(membership.feed_metadata):membership.feed_metadata;}catch{fail('LAST_NIGHT_STORE_MEMBERSHIP_SCOPE_CONFLICT');}
        if(metadata?.boardId!=null&&String(metadata.boardId)!==BOARD_ID)fail('LAST_NIGHT_STORE_MEMBERSHIP_SCOPE_CONFLICT');
      }
      before.push({externalId:item.externalId,content:row,memberships});
    }
    // The existing algorithm gets the pinned transaction; it cannot commit/release it.
    const pinned={query:(sql,params)=>{const query=legacy?legacyInsert(sql,params):{sql,params};return q(query.sql,query.params);},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
    const facade=Object.create(repo);facade.pool={getConnection:async()=>pinned};
    const stored=await repo._upsertContentPageAttempt.call(facade,{account,items:legacy?items.map(legacyItem):items,feed,syncScope:'posts',hasMore:false});
    if(stored.contents.length!==items.length||items.some((_item,index)=>!stored.contents[index]?.content))fail('LAST_NIGHT_STORE_RESULT_INCOMPLETE');
    for(const entry of stored.contents) {
      const row=entry.content;
      if(legacy) {
        assertLegacyContent(row,account.id);
        if(!items.some(item=>String(item.externalId)===String(row.external_id)))fail('LAST_NIGHT_LEGACY_EXTERNAL_ID_CONFLICT');
      }
      const memberships=(await q('SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id=? AND feed_key=? FOR UPDATE',[account.id,row.id,feed.feedKey]))[0];
      after.push({externalId:row.external_id,content:row,memberships,change:entry.change});
    }
    await bounded(persistEvidence(state)); // encrypted durable journal BEFORE commit, failure rolls back.
    if(expired) fail('LAST_NIGHT_STORE_TIMEOUT');
    committing=true;await q('COMMIT');committed=true;state.phase='committed';
    await bounded(persistEvidence(state));
    return {storedCount:stored.storedCount,contents:stored.contents,protection:state};
  } catch(error) {
    if(!committing&&!expired) {try{await q('ROLLBACK');}catch{}}
    error.code=committed?'LAST_NIGHT_STORE_COMMITTED_JOURNAL_FAILED':committing?'LAST_NIGHT_STORE_COMMIT_UNKNOWN':expired?'LAST_NIGHT_STORE_TIMEOUT':error.code||'LAST_NIGHT_STORE_FAILED';
    throw error;
  } finally {clearTimeout(timer);conn?.destroy();}
}
async function restoreExistingContentCAS({repo,evidence,timeoutMs=15000}={}) {
  if(evidence?.phase!=='committed'||evidence.sourceId!==SOURCE_ID||evidence.boardId!==BOARD_ID||!Array.isArray(evidence.before)||!Array.isArray(evidence.after)||evidence.after.length>20||evidence.before.length!==evidence.after.length
    ||new Set(evidence.after.map(item=>item.externalId)).size!==evidence.after.length) fail('LAST_NIGHT_COMPENSATION_INVALID');
  const legacy=evidence.contentMode==='legacy_source_external';
  const restored=[],retainedNew=[];let committing=false;
  return withDeadlineConnection(repo.pool,async({query:q})=>{
  try {
    const [[lock]]=await q('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${evidence.accountId}`]);
    if(Number(lock.acquired)!==1) fail('LAST_NIGHT_DUPLICATE_EXECUTION');
    await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
    const [active]=await q("SELECT id FROM po_sync_runs WHERE account_id=? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[evidence.accountId]);
    if(active.length) fail('LAST_NIGHT_ACTIVE_RUN');
    for(const after of evidence.after) {
      const before=evidence.before.find(item=>item.externalId===after.externalId);
      if(!before||after.content.source_id!==SOURCE_ID||after.content.account_id!==evidence.accountId) fail('LAST_NIGHT_COMPENSATION_INVALID');
      if(legacy)assertLegacyContent(after.content,evidence.accountId);else if(String(after.content.board_id)!==BOARD_ID)fail('LAST_NIGHT_COMPENSATION_INVALID');
      if(!before.content) {retainedNew.push(after.content.id);continue;} // Never delete newly inserted history.
      if(after.change==='unchanged')continue;
      if(before.content.id!==after.content.id) fail('LAST_NIGHT_COMPENSATION_INVALID');
      if(before.content.source_id!==SOURCE_ID||before.content.game_id!==GAME_ID||before.content.community_id!==COMMUNITY_ID||before.content.account_id!==evidence.accountId||before.content.external_id!==after.externalId) fail('LAST_NIGHT_COMPENSATION_INVALID');
      if(legacy)assertLegacyContent(before.content,evidence.accountId);else if(String(before.content.board_id)!==BOARD_ID)fail('LAST_NIGHT_COMPENSATION_INVALID');
      const [rows]=await q(legacy?'SELECT * FROM po_contents WHERE id=? AND source_id=? AND account_id=? AND game_id=? AND community_id=? FOR UPDATE':'SELECT * FROM po_contents WHERE id=? AND source_id=? AND account_id=? AND board_key=? FOR UPDATE',legacy?[after.content.id,SOURCE_ID,evidence.accountId,GAME_ID,COMMUNITY_ID]:[after.content.id,SOURCE_ID,evidence.accountId,BOARD_ID]);
      if(rows.length!==1||hash(rows[0])!==hash(after.content)) fail('LAST_NIGHT_COMPENSATION_CAS_CONFLICT');
      // Do not overwrite content that an existing AI consumer has already analyzed/claimed.
      const [jobs]=await q('SELECT id FROM po_analysis_jobs WHERE content_id=? LIMIT 1 FOR UPDATE',[after.content.id]);
      if(jobs.length) fail('LAST_NIGHT_COMPENSATION_AI_CONFLICT');
      const columns=MUTABLE.filter(key=>(!legacy||!['board_id','board_name'].includes(key))&&Object.hasOwn(before.content,key));
      const [updated]=await q(`UPDATE po_contents SET ${columns.map(key=>`${key}=?`).join(',')} WHERE id=? AND source_id=? AND account_id=? AND fingerprint<=>?`,[...columns.map(key=>before.content[key]??null),after.content.id,SOURCE_ID,evidence.accountId,after.content.fingerprint]);
      if(updated.affectedRows!==1) fail('LAST_NIGHT_COMPENSATION_CAS_CONFLICT');
      restored.push(after.content.id);
    }
    committing=true;await q('COMMIT');return {status:'EXISTING_CONTENT_RESTORED_NEW_HISTORY_RETAINED',restored,retainedNew,memberships:'retained_no_history_delete'};
  } catch(error) {if(!committing){try{await q('ROLLBACK');}catch{}}else error.code='LAST_NIGHT_COMPENSATION_COMMIT_UNKNOWN';throw error;}
  },{timeoutMs,code:'LAST_NIGHT_COMPENSATION_TIMEOUT'}).catch(error=>{if(committing)error.code='LAST_NIGHT_COMPENSATION_COMMIT_UNKNOWN';throw error;});
}
async function queueExactChanges({repo,account,contents,version,contentMode='board_columns',timeoutMs=15000}={}) {
  if(account?.source_id!==SOURCE_ID||account.game_id!==GAME_ID||account.community_id!==COMMUNITY_ID||!account.id||!version) fail('LAST_NIGHT_QUEUE_SCOPE_INVALID');
  const queued=[],remaining=contents.filter(entry=>['inserted','changed'].includes(entry.change)).map(entry=>({id:entry.content.id,fingerprint:entry.content.fingerprint}));
  const started=Date.now();
  try {
    while(remaining.length) {
      const next=remaining[0];
      const budget=timeoutMs-(Date.now()-started);if(budget<=0)fail('LAST_NIGHT_QUEUE_TIMEOUT');
      let committing=false;
      await withDeadlineConnection(repo.pool,async({query:q})=>{
      try {
        await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
        const legacy=contentMode==='legacy_source_external';
        const [[current]]=await q(legacy?'SELECT * FROM po_contents WHERE id=? AND source_id=? AND account_id=? AND game_id=? AND community_id=? FOR UPDATE':'SELECT * FROM po_contents WHERE id=? AND source_id=? AND board_key=? AND account_id=? AND game_id=? AND community_id=? FOR UPDATE',legacy?[next.id,SOURCE_ID,account.id,GAME_ID,COMMUNITY_ID]:[next.id,SOURCE_ID,BOARD_ID,account.id,GAME_ID,COMMUNITY_ID]);
        if(!current||current.fingerprint!==next.fingerprint) fail('LAST_NIGHT_QUEUE_CONTENT_CHANGED');
        if(legacy)assertLegacyContent(current,account.id);
        const [[previous]]=await q('SELECT * FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=? FOR UPDATE',[next.id,'light',version]);
        if(previous?.status==='running'||previous?.lease_owner) fail('LAST_NIGHT_QUEUE_EXISTING_LEASE');
        const staleCompleted=previous?.status==='completed'&&previous.content_fingerprint!==next.fingerprint;
        const facade=Object.create(repo);facade.query=async(sql,params)=>(await q(sql,params))[0];
        const job=previous?.status==='completed'&&!staleCompleted?previous:await repo.enqueueAnalysisJob.call(facade,next.id,{profile:'light',version,contentFingerprint:next.fingerprint,triggerReason:'lastnight_bounded_import',force:staleCompleted});
        if(!job?.id) fail('LAST_NIGHT_QUEUE_JOB_MISSING');committing=true;await q('COMMIT');
        queued.push({contentId:next.id,jobId:job.id,fingerprint:next.fingerprint});remaining.shift();
      } catch(error) {if(!committing){try{await q('ROLLBACK');}catch{}}else error.code='LAST_NIGHT_QUEUE_COMMIT_UNKNOWN';throw error;}
      },{timeoutMs:budget,code:'LAST_NIGHT_QUEUE_TIMEOUT'}).catch(error=>{if(committing)error.code='LAST_NIGHT_QUEUE_COMMIT_UNKNOWN';throw error;});
    }
    return {status:'EXACT_AI_QUEUED',queued,remaining};
  } catch(error) {return{status:'STORE_COMMITTED_QUEUE_INCOMPLETE',queued,remaining,errorCode:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'LAST_NIGHT_QUEUE_FAILED'};}
}
function assertCompleteQueue({phase,queue,after,version}={}) {
  if(phase!=='queue_result'||queue?.status!=='EXACT_AI_QUEUED'||!Array.isArray(queue.remaining)||queue.remaining.length
    ||!Array.isArray(queue.queued)||!Array.isArray(after)||typeof version!=='string'||!version) fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
  const changed=after.filter(entry=>['inserted','changed'].includes(entry.change));
  const expected=new Map(),actual=new Set(),jobs=new Set();
  for(const entry of after) {
    if(!entry?.content?.id||!['inserted','changed','unchanged'].includes(entry.change))fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
  }
  if(new Set(after.map(entry=>entry.content.id)).size!==after.length)fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
  for(const entry of changed) {
    if(typeof entry.content.fingerprint!=='string'||!entry.content.fingerprint)fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
    expected.set(entry.content.id,entry.content.fingerprint);
  }
  if(queue.queued.length!==expected.size)fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
  for(const item of queue.queued) {
    if(!item?.contentId||!item.jobId||actual.has(item.contentId)||jobs.has(item.jobId)
      ||!expected.has(item.contentId)||expected.get(item.contentId)!==item.fingerprint)fail('LAST_NIGHT_AI_QUEUE_INCOMPLETE');
    actual.add(item.contentId);jobs.add(item.jobId);
  }
}
async function observeExactAnalysis({repo,queued,queue,after,version,accountId,contentMode='board_columns'}={}) {
  assertCompleteQueue({phase:'queue_result',queue,after,version});
  queued=queue.queued;
  if(!queued.length) return {status:'NO_CHANGED_CONTENT_AI_NOT_REQUESTED',results:[]};
  const results=[];
  for(const item of queued) {
    const legacy=contentMode==='legacy_source_external';
    const rows=await repo.query(`SELECT j.id AS job_id,j.status,j.content_fingerprint,c.fingerprint,c.raw_payload,c.source_id,c.game_id,c.community_id,c.account_id,a.content_fingerprint AS analyzed_fingerprint,a.analysis_version,a.analysis_level,a.analyzed_at
      FROM po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id LEFT JOIN po_analyses a ON a.content_id=c.id AND a.analysis_level='light' AND a.analysis_version=j.analysis_version AND a.content_fingerprint=j.content_fingerprint
      WHERE j.id=? AND j.content_id=? AND c.source_id=? ${legacy?'AND c.account_id=? AND c.game_id=? AND c.community_id=?':'AND c.board_key=?'} AND j.analysis_profile='light' AND j.analysis_version=?`,legacy?[item.jobId,item.contentId,SOURCE_ID,accountId,GAME_ID,COMMUNITY_ID,version]:[item.jobId,item.contentId,SOURCE_ID,BOARD_ID,version]);
    if(legacy&&rows[0])assertLegacyContent(rows[0],accountId);
    const row=rows[0];const completed=rows.length===1&&row.status==='completed'&&row.fingerprint===item.fingerprint&&row.content_fingerprint===item.fingerprint&&row.analyzed_fingerprint===item.fingerprint&&row.analysis_version===version&&row.analysis_level==='light'&&Boolean(row.analyzed_at);
    results.push({contentId:item.contentId,jobId:item.jobId,status:row?.status||'missing',completed});
  }
  return {status:results.every(item=>item.completed)?'EXACT_AI_COMPLETED':'EXACT_AI_NOT_COMPLETED',results};
}
module.exports={protectedStorePage,restoreExistingContentCAS,queueExactChanges,observeExactAnalysis,assertCompleteQueue};
