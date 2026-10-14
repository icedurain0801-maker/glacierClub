'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {advanceSite16Tasks,buildSite16Tasks}=require('../src/lastNightSite16TaskFlow');
const task={siteId:'site-3bb48be7f9a82185d6a045e9a5cbd3d7',accountId:'a',kind:'q1_feed',taskKey:'feed',status:'idle'};
test('page budget persists next cursor and resumes without reloading completed page; comments/replies atomically discovered',async()=>{
 const tasks=[{...task}],states=new Map(),loads=[];
 const store={listTasks:async()=>tasks,readTask:async t=>states.get(t.taskKey),renewOwner:async()=>{},commitTaskPage:async({task:t,page,childTasks})=>{
   const status=page.hasMore?'idle':'completed';states.set(t.taskKey,{status,cursor:page.nextCursor,committedPages:1});t.status=status;
   for(const child of childTasks)if(!tasks.some(x=>x.taskKey===child.taskKey))tasks.push({...child,status:'idle'});
 }};
 const loadPage=async(t,cursor)=>{loads.push([t.kind,cursor]);return t.kind==='q1_feed'&&!cursor?{items:[{externalId:'post'}],hasMore:true,nextCursor:'next'}:t.kind==='comments'?{items:[],hasMore:false,nextCursor:null,replyTargets:[{postId:'post',commentId:'comment'}]}:{items:[],hasMore:false,nextCursor:null};};
 const input={plan:{hash:'h',tasks:[task]},store,loadPage,now:()=>0,deadlineAt:100,maxPages:1};
 assert.equal((await advanceSite16Tasks(input)).status,'LAST_NIGHT_SITE16_PARTIAL_RESUMABLE');
 assert.equal((await advanceSite16Tasks({...input,maxPages:10})).status,'LAST_NIGHT_SITE16_TASKS_COMPLETED');
 assert.deepEqual(loads,[['q1_feed',null],['q1_feed','next'],['comments',null],['replies',null]]);
});
test('wrong site/unsafe state/cursor stall refuses before page commit',async()=>{
 for(const option of ['site','state','page']){let commits=0;const t={...task,...(option==='site'?{siteId:'site9'}:{})};
 await assert.rejects(advanceSite16Tasks({plan:{hash:'h',tasks:[task]},deadlineAt:100,now:()=>0,maxPages:1,
 store:{listTasks:async()=>[t],readTask:async()=>option==='state'?{committedPages:1,cursor:null}:{cursor:'same'},renewOwner:async()=>{},commitTaskPage:async()=>commits++},loadPage:async()=>({items:[],hasMore:true,nextCursor:'same'})}));assert.equal(commits,0);}
});
test('23 descriptor requirement prevents partial feed list or old window admitted',()=>{
 assert.throws(()=>buildSite16Tasks({accountId:'a',publishedFrom:'from',publishedTo:'to',descriptors:[]}));
});
