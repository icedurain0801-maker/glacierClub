'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const {legacyInsert,legacyItem,assertLegacyContent}=require('./lastNightLegacyContentContract');
const {normalizeIndependentPost}=require('./lastNightIndependentContent');
const {normalizeRawContent}=require('../../server/src/connectors/baseConnector');
const {commentPageGraph}=require('./lastNightCommentPageGraph');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const SITE16='site-3bb48be7f9a82185d6a045e9a5cbd3d7';
const hash=row=>crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function createTaskCheckpointStore({query:q,bounded,repo,account,token,runId,runEpoch,plan,persistEvidence,commitState}) {
 if(typeof q!=='function' || typeof bounded!=='function' || typeof persistEvidence!=='function' || !repo?._upsertContentPageAttempt
   || account?.source_id!==SOURCE_ID || account.game_id!==GAME_ID || account.community_id!==COMMUNITY_ID
   || account.id!==token?.accountId || !runId || !Number.isSafeInteger(runEpoch) || runEpoch<1 || !commitState || typeof commitState!=='object'
   || !Array.isArray(plan?.tasks) || !plan.tasks.length || !plan?.hash
   || plan.tasks.some(task=>task.siteId!==SITE16 || task.accountId!==account.id))fail('LAST_NIGHT_TASK_STORE_INVALID');
 const identity=task=>[account.id,SITE16,task.kind,task.taskKey,task.scope,task.rootId,task.publishedFrom,task.publishedTo];
 const select='SELECT * FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind=? AND task_key=? AND sync_scope=? AND root_platform_content_id=? AND window_start=? AND window_end=?';
 const assertTask=task=>{
   if(task.siteId!==SITE16 || task.accountId!==account.id || !['q1_feed','comments','replies'].includes(task.kind)
     || task.publishedFrom!==plan.tasks[0].publishedFrom || task.publishedTo!==plan.tasks[0].publishedTo)fail('LAST_NIGHT_TASK_STORE_SCOPE_INVALID');
   if(task.kind==='q1_feed' && !plan.tasks.some(approved=>JSON.stringify(approved)===JSON.stringify(task))) {
     const {status,...withoutStatus}=task;
     if(!plan.tasks.some(approved=>JSON.stringify(approved)===JSON.stringify(withoutStatus)))fail('LAST_NIGHT_TASK_STORE_SCOPE_INVALID');
   }
   if(task.kind==='q1_feed' ? task.scope!=='posts' || task.rootId!=='' : task.scope!=='comments' || !task.rootId || task.feed!=null)fail('LAST_NIGHT_TASK_STORE_SCOPE_INVALID');
   if(task.kind==='comments' && task.taskKey!==task.rootId)fail('LAST_NIGHT_TASK_STORE_SCOPE_INVALID');
   if(task.kind==='replies' && (!task.parentId || !Number.isSafeInteger(task.sortType) || task.sortType<0 || task.taskKey!==`${task.rootId}:${task.parentId}:${task.sortType}`))fail('LAST_NIGHT_TASK_STORE_SCOPE_INVALID');
 };
 async function memberships(row) {
   const [rows]=await q('SELECT feed_key,feed_metadata FROM po_content_feed_memberships WHERE account_id=? AND content_id=? FOR UPDATE',[account.id,row.id]);
   for(const entry of rows){let metadata;try{metadata=typeof entry.feed_metadata==='string'?JSON.parse(entry.feed_metadata):entry.feed_metadata;}catch{fail('LAST_NIGHT_TASK_MEMBERSHIP_CONFLICT');}
     if(!String(entry.feed_key).startsWith(`${BOARD_ID}:`) || (metadata?.boardId!=null && String(metadata.boardId)!==BOARD_ID))fail('LAST_NIGHT_TASK_MEMBERSHIP_CONFLICT');
   }
 }
 async function ancestor(externalId,type,root=null) {
   const [[row]]=await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE',[SOURCE_ID,externalId]);
   if(!row || row.content_type!==type || (root && row.root_content_id!==root.id))fail('LAST_NIGHT_TASK_ANCESTOR_CONFLICT');
   assertLegacyContent(row,account.id,{allowUnmarked:true});if(type==='post')await memberships(row);
   return row;
 }
 async function fence() {
   const [[source]]=await q('SELECT lease_run_id,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
   if(source?.lease_run_id!==token.parentId || source.lease_owner!==token.ownerId || Number(source.lease_epoch)!==Number(token.epoch) || Number(source.live)!==1)fail('LAST_NIGHT_TASK_SOURCE_LEASE_LOST');
   const [[run]]=await q('SELECT id,status,account_id,source_id,site_id,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? FOR UPDATE',[runId]);
   if(run?.status!=='running' || run.account_id!==account.id || run.source_id!==SOURCE_ID || run.site_id!==SITE16
     || run.lease_owner!==token.ownerId || Number(run.lease_epoch)!==runEpoch || Number(run.live)!==1)fail('LAST_NIGHT_TASK_RUN_LEASE_LOST');
 }
 async function renewOwner() {
   if(commitState.pending===true)fail('LAST_NIGHT_TASK_COMMIT_RECONCILIATION_REQUIRED');
   try {
     await q('START TRANSACTION');await fence();
     const [source]=await q('UPDATE po_source_schedule_state SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)',[SOURCE_ID,token.parentId,token.ownerId,token.epoch]);
     const [run]=await q("UPDATE po_sync_runs SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE id=? AND status='running' AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)",[runId,token.ownerId,runEpoch]);
     if(source.affectedRows!==1 || run.affectedRows!==1)fail('LAST_NIGHT_TASK_RUN_LEASE_LOST');
     // Lease-only transaction; ACK uncertainty still cannot be called renewal.
     commitState.pending=true;commitState.acknowledged=false;await q('COMMIT');commitState.acknowledged=true;commitState.pending=false;
   }catch(error){if(commitState.pending){error.code='LAST_NIGHT_TASK_RENEW_COMMIT_UNKNOWN';throw error;}try{await q('ROLLBACK');}catch{}throw error;}
 }
 async function readTask(task) {
   assertTask(task);const [rows]=await q(select,identity(task));
   if(rows.length>1)fail('LAST_NIGHT_TASK_CHECKPOINT_AMBIGUOUS');
   const cp=rows[0];if(!cp)return null;
   // A saved cursor proves a page even when it contained zero items. A failed
   // NULL cursor has no proof of a safe first-page restart and is rejected.
   return{status:cp.status,cursor:cp.cursor,checkpoint:cp,checkpointHash:hash(cp),committedPages:cp.cursor!=null || cp.status==='completed' || cp.status==='failed' || Number(cp.items_fetched)>0?1:0};
 }
 async function listTasks(planHash,initial) {
   if(planHash!==plan.hash)fail('LAST_NIGHT_TASK_PLAN_CHANGED');
   const tasks=[];
   for(const task of initial){assertTask(task);const state=await readTask(task);tasks.push({...task,status:state?.status??'idle'});}
   const [rows]=await q("SELECT * FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND window_start=? AND window_end=? AND task_kind IN ('comments','replies') ORDER BY task_kind,task_key",[account.id,SITE16,plan.tasks[0].publishedFrom,plan.tasks[0].publishedTo]);
   for(const cp of rows) {
     const metadata=cp.task_kind==='replies'?cp.task_key.split(':'):null;
     tasks.push({...plan.tasks[0],kind:cp.task_kind,taskKey:cp.task_key,scope:'comments',rootId:cp.root_platform_content_id,feed:null,status:cp.status,
       ...(metadata?{parentId:metadata[1],sortType:Number(metadata[2])}:{})});
   }
   return tasks;
 }
 async function commitTaskPage({planHash,task,expectedState,page,childTasks}) {
   if(commitState.pending===true)fail('LAST_NIGHT_TASK_COMMIT_RECONCILIATION_REQUIRED');
   if(planHash!==plan.hash)fail('LAST_NIGHT_TASK_PLAN_CHANGED');assertTask(task);
   if(!page || !Array.isArray(page.items) || page.items.length>50 || !Array.isArray(childTasks) || typeof page.hasMore!=='boolean'
     || (page.hasMore ? typeof page.nextCursor!=='string' || !page.nextCursor || page.nextCursor===expectedState?.cursor : page.nextCursor!==null))fail('LAST_NIGHT_TASK_PAGE_INVALID');
   if(expectedState?.committedPages>0 && expectedState.cursor==null)fail('LAST_NIGHT_TASK_CURSOR_UNSAFE');
   let committing=false,committed=false;
   try {
     await q('START TRANSACTION');await fence();
     const [rows]=await q(`${select} FOR UPDATE`,identity(task));
     if(rows.length>1 || (rows[0]?hash(rows[0]):null)!==(expectedState?.checkpointHash??null))fail('LAST_NIGHT_TASK_CHECKPOINT_CHANGED');
     const cp=rows[0];
     if(cp && !['idle','failed'].includes(cp.status))fail('LAST_NIGHT_TASK_CHECKPOINT_CHANGED');
     if(cp && (cp.lease_owner!=null || cp.lease_until!=null))fail('LAST_NIGHT_TASK_CHECKPOINT_CHANGED');
     const root=task.kind==='q1_feed'?null:await ancestor(task.rootId,'post');
     if(task.kind==='replies')await ancestor(task.parentId,'comment',root);
     const incomingItems=task.kind==='q1_feed'?page.items:commentPageGraph({items:page.items,rootId:task.rootId,anchorId:task.kind==='replies'?task.parentId:null});
     for(const incoming of incomingItems) {
       if(!incoming || !incoming.externalId || !Number.isFinite(+new Date(incoming.publishedAt)) || incoming.publishedAt==null
         || +new Date(incoming.publishedAt)<+new Date(task.publishedFrom) || +new Date(incoming.publishedAt)>=+new Date(task.publishedTo))fail('LAST_NIGHT_TASK_WINDOW_MISMATCH');
       const raw=incoming.rawPayload||{};
       if([incoming.boardId,raw.boardId,raw.board_id,raw._lastNightScope?.boardId].some(value=>value!=null && String(value)!==BOARD_ID))fail('LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT');
       if(root && (incoming.rootPlatformContentId!=null && String(incoming.rootPlatformContentId)!==task.rootId
         || raw._lastNightIncomingEvidence?.rootId!=null && String(raw._lastNightIncomingEvidence.rootId)!==task.rootId))fail('LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT');
     }
     const items=incomingItems.map(item=>task.kind==='q1_feed'?normalizeIndependentPost(item,task.feed):{
       ...normalizeRawContent({...item,contentType:'comment'}),platformAuthorId:item.platformAuthorId??null,platformParentId:item.platformParentId??task.parentId??null,
       rootPlatformContentId:task.rootId,contentDepth:item.contentDepth??(task.kind==='replies'?2:1),isDeleted:Boolean(item.isDeleted),
       rawPayload:{...item.rawPayload,_lastNightIncomingEvidence:{requestBoardId:BOARD_ID,rootId:task.rootId,scope:task.kind}}});
     if(items.length>500 || new Set(items.map(item=>item.externalId)).size!==items.length)fail('LAST_NIGHT_TASK_PAGE_INVALID');
     const reused=[],fresh=[],before=[],resolved=new Map();if(root)resolved.set(task.rootId,root);
     const pinned={query:(sql,params)=>{const adapted=legacyInsert(sql,params);return q(adapted.sql,adapted.params);},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
     const facade=Object.create(repo);facade.pool={getConnection:async()=>pinned};
     const result={contents:[]};
     await bounded(persistEvidence({phase:'task_page_intent',sourceId:SOURCE_ID,accountId:account.id,token,runId,runEpoch,planHash,task,checkpointBefore:cp??null,incoming:items}));
     // The actual Repository re-sorts its own batch by ID. Write one topologically
     // ordered node per call, retaining ONE outer transaction and cursor commit.
     for(const item of items) {
       const parentExternalId=root?(item.platformParentId || task.rootId):null;
       const parent=root?(resolved.get(parentExternalId) || await ancestor(parentExternalId,'comment',root)):null;
       if(task.kind==='replies'){
         let current=parent;const seen=new Set();
         while(current.external_id!==task.parentId){
           if(current===root || seen.has(current.id) || !current.platform_parent_id)fail('LAST_NIGHT_REPLY_BRANCH_CONFLICT');
           seen.add(current.id);current=resolved.get(current.platform_parent_id)||await ancestor(current.platform_parent_id,'comment',root);
         }
       }
       if(root){const depth=parent===root?1:Number(parent.content_depth)+1;
         const original=incomingItems.find(node=>node.externalId===item.externalId);
         if(original.contentDepth!=null&&Number(original.contentDepth)!==depth)fail('LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT');item.contentDepth=depth;
       }
       if(root && (item.externalId===task.rootId || item.externalId===parentExternalId || !Number.isSafeInteger(item.contentDepth)
         || item.contentDepth!==(parent===root?1:Number(parent.content_depth)+1)))fail('LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT');
       const [[row]]=await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE',[SOURCE_ID,item.externalId]);
       if(row){assertLegacyContent(row,account.id,{allowUnmarked:true});
         if(row.content_type!==item.contentType || (root && (row.root_content_id!==root.id || row.parent_content_id!==parent.id
           || row.platform_parent_id!==parentExternalId || Number(row.content_depth)!==item.contentDepth)))fail('LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT');
         if(!root)await memberships(row);
         before.push(row);reused.push(row);
         resolved.set(item.externalId,row);
       }else{
         fresh.push(item);
         const stored=await repo._upsertContentPageAttempt.call(facade,{account,syncRunId:runId,syncScope:task.scope,rootPlatformContentId:task.rootId,items:[legacyItem(item)],feed:task.feed,leaseOwner:token.ownerId});
         const entry=stored?.contents?.[0],saved=entry?.content;
         if(stored.contents.length!==1 || !saved?.id || saved.external_id!==item.externalId || saved.content_type!==item.contentType
           || saved.source_id!==SOURCE_ID || saved.account_id!==account.id || saved.game_id!==GAME_ID || saved.community_id!==COMMUNITY_ID
           || (root&&(saved.root_content_id!==root.id||saved.parent_content_id!==parent.id||saved.platform_parent_id!==parentExternalId||Number(saved.content_depth)!==item.contentDepth)))fail('LAST_NIGHT_TASK_STORE_INCOMPLETE');
         result.contents.push(entry);resolved.set(item.externalId,saved);
       }
     }
     const checkpointId=cp?.id||crypto.randomUUID();
     const journal={phase:'task_page_prepared',sourceId:SOURCE_ID,accountId:account.id,token,runId,runEpoch,planHash,task,before,checkpointBefore:cp??null,incoming:items};
     await bounded(persistEvidence(journal));
     if(!cp)await q("INSERT INTO po_sync_checkpoints (id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end,status,lease_owner,lease_until) VALUES (?,?,?,?,?,?,?,?,?,'running',?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND))",[checkpointId,...identity(task),token.ownerId]);
     else {
       const [claimed]=await q("UPDATE po_sync_checkpoints SET status='running',lease_owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE id=? AND status=? AND `cursor`<=>? AND lease_owner IS NULL AND lease_until IS NULL",[token.ownerId,checkpointId,cp.status,cp.cursor]);
       if(claimed.affectedRows!==1)fail('LAST_NIGHT_TASK_CHECKPOINT_CHANGED');
     }
     let reusedPosts=0;
     for(const row of reused){
       const [association]=await q("INSERT IGNORE INTO po_sync_run_contents (run_id,content_id,change_type,sync_scope) VALUES (?,?,'unchanged',?)",[runId,row.id,task.scope]);
       if(task.scope==='posts'&&association.affectedRows)reusedPosts++;
       if(task.kind==='q1_feed')await q('INSERT INTO po_content_feed_memberships (id,account_id,content_id,feed_key,page_kind,section_id,feed_metadata) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[crypto.randomUUID(),account.id,row.id,task.feed.feedKey,task.feed.pageKind,task.feed.sectionId,JSON.stringify(task.feed)]);
       const [[after]]=await q('SELECT * FROM po_contents WHERE id=? FOR UPDATE',[row.id]);if(hash(after)!==hash(row))fail('LAST_NIGHT_TASK_HISTORY_CHANGED');
     }
     if(reusedPosts){const [counted]=await q("UPDATE po_sync_runs SET fetched_count=fetched_count+?,unchanged_count=unchanged_count+?,discovered_count=discovered_count+? WHERE id=? AND status='running' AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)",[reusedPosts,reusedPosts,reusedPosts,runId,token.ownerId,runEpoch]);if(counted.affectedRows!==1)fail('LAST_NIGHT_TASK_RUN_LEASE_LOST');}
     // Persist newly discovered comments/replies in SAME page transaction.
     for(const child of childTasks){assertTask(child);
       if(task.kind==='q1_feed' ? child.kind!=='comments' || !items.some(item=>item.externalId===child.rootId)
         : task.kind!=='comments' || child.kind!=='replies' || child.rootId!==task.rootId)fail('LAST_NIGHT_TASK_CHILD_SCOPE_CONFLICT');
       if(child.kind==='replies')await ancestor(child.parentId,'comment',root);
       const [existing]=await q(`${select} FOR UPDATE`,identity(child));
       if(!existing.length)await q("INSERT INTO po_sync_checkpoints (id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end,status) VALUES (?,?,?,?,?,?,?,?,?,'idle')",[crypto.randomUUID(),...identity(child)]);
     }
     const aiFacade=Object.create(repo);aiFacade.query=async(sql,params)=>(await q(sql,params))[0];
     for(const entry of result.contents)await repo.enqueueAnalysisJob.call(aiFacade,entry.content.id,{profile:'light',version:'sentiment-v1',contentFingerprint:entry.content.fingerprint});
     const [advanced]=await q("UPDATE po_sync_checkpoints SET `cursor`=?,status=?,items_fetched=items_fetched+?,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND status='running' AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3)",[page.nextCursor,page.hasMore?'idle':'completed',items.length,checkpointId,token.ownerId]);
     if(advanced.affectedRows!==1)fail('LAST_NIGHT_TASK_CHECKPOINT_CHANGED');
     await fence();await bounded(persistEvidence({...journal,phase:'task_page_commit_prepared',nextCursor:page.nextCursor,hasMore:page.hasMore,childTasks,created:result.contents}));
     committing=true;commitState.pending=true;commitState.acknowledged=false;await q('COMMIT');committed=true;commitState.acknowledged=true;
     await bounded(persistEvidence({...journal,phase:'task_page_committed',nextCursor:page.nextCursor,hasMore:page.hasMore,childTasks,created:result.contents}));commitState.pending=false;
     return{checkpointId,hasMore:page.hasMore};
   }catch(error){if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_TASK_PAGE_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_TASK_PAGE_COMMIT_UNKNOWN';throw error;}
 }
 return{readTask,listTasks,commitTaskPage,renewOwner};
}
module.exports={createTaskCheckpointStore};
