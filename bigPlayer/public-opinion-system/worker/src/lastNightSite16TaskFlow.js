'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,BOARD_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const SITE16='site-3bb48be7f9a82185d6a045e9a5cbd3d7';
function buildSite16Tasks({accountId,publishedFrom,publishedTo,descriptors}) {
  if(!accountId || !Array.isArray(descriptors) || descriptors.length!==23 || new Set(descriptors.map(row=>row.task_key)).size!==23)fail('LAST_NIGHT_SITE16_FEEDS_INVALID');
  const tasks=descriptors.map(row=>{
    if(row.account_id!==accountId || row.site_id!=='site-f069f4495d534693dd87b2485053e7cd' || row.status!=='completed'
      || row.task_kind!=='q1_feed' || row.sync_scope!=='posts' || row.root_platform_content_id!==''
      || row.window_start!==publishedFrom || row.window_end!==publishedTo)fail('LAST_NIGHT_SITE16_DESCRIPTOR_SCOPE_INVALID');
    const parts=row.task_key.split(':');
    if(parts.length!==8 || parts[0]!==BOARD_ID || !['merged','info','activity'].includes(parts[2]))fail('LAST_NIGHT_SITE16_FEEDS_INVALID');
    return {sourceId:SOURCE_ID,accountId,siteId:SITE16,kind:'q1_feed',taskKey:row.task_key,scope:'posts',rootId:'',publishedFrom,publishedTo,
      feed:{boardId:BOARD_ID,pageKind:parts[1],endpointKind:parts[2],groupId:parts[3]||null,sectionId:parts[4]||null,
        type:parts[5]?Number(parts[5]):null,orderType:parts[6]?Number(parts[6]):null,isUltimate:parts[7]?parts[7]==='1':null,feedKey:row.task_key}};
  }).sort((a,b)=>a.taskKey.localeCompare(b.taskKey));
  return {tasks,hash:crypto.createHash('sha256').update(JSON.stringify(tasks)).digest('hex')};
}
// Uses the existing session/page writer as an injected boundary. The writer
// MUST atomically persist page + cursor + discovered child tasks. This flow
// neither calls shared Worker nor stores state in process memory only.
async function advanceSite16Tasks({plan,store,loadPage,now=Date.now,deadlineAt,maxPages=20}) {
  if(!plan?.hash || !Array.isArray(plan.tasks) || !Number.isSafeInteger(maxPages) || maxPages<1 || maxPages>100
    || !Number.isFinite(deadlineAt) || !store?.readTask || !store?.commitTaskPage || !store?.renewOwner
    || !store?.listTasks || typeof loadPage!=='function')fail('LAST_NIGHT_SITE16_FLOW_INVALID');
  let pages=0;
  while(pages<maxPages && now()<deadlineAt) {
    const tasks=await store.listTasks(plan.hash,plan.tasks);
    const next=tasks.find(task=>task.status!=='completed');
    if(!next)return{status:'LAST_NIGHT_SITE16_TASKS_COMPLETED',pages,planHash:plan.hash};
    if(next.siteId!==SITE16 || next.accountId!==plan.tasks[0].accountId || !['q1_feed','comments','replies'].includes(next.kind))fail('LAST_NIGHT_SITE16_TASK_SCOPE_INVALID');
    const state=await store.readTask(next);
    if(state?.status==='completed')continue;
    if(state?.status==='running' || (state?.cursor==null && Number(state?.committedPages)>0))fail('LAST_NIGHT_SITE16_CURSOR_UNSAFE');
    await store.renewOwner();
    const page=await loadPage(next,state?.cursor??null);
    if(now()>=deadlineAt)fail('LAST_NIGHT_SITE16_DEADLINE_BEFORE_COMMIT');
    if(!page || !Array.isArray(page.items) || typeof page.hasMore!=='boolean'
      || (page.hasMore && (!page.nextCursor || page.nextCursor===state?.cursor)))fail('LAST_NIGHT_SITE16_PAGE_INVALID');
    const childTasks=[];
    if(next.kind==='q1_feed')for(const post of page.items) {
      if(!post.externalId)fail('LAST_NIGHT_SITE16_PAGE_INVALID');
      childTasks.push({...next,kind:'comments',scope:'comments',taskKey:String(post.externalId),rootId:String(post.externalId),feed:null});
    }
    if(next.kind==='comments')for(const reply of page.replyTargets||[]) {
      if(!reply.commentId || String(reply.postId)!==next.rootId)fail('LAST_NIGHT_SITE16_REPLY_SCOPE_INVALID');
      childTasks.push({...next,kind:'replies',scope:'comments',taskKey:`${next.rootId}:${reply.commentId}:${reply.sortType??0}`,parentId:String(reply.commentId),sortType:reply.sortType??0});
    }
    await store.commitTaskPage({planHash:plan.hash,task:next,expectedState:state,page,childTasks});
    pages++;
  }
  return {status:'LAST_NIGHT_SITE16_PARTIAL_RESUMABLE',pages,planHash:plan.hash};
}
module.exports={buildSite16Tasks,advanceSite16Tasks};
