'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerSite16Fixture,executeSite16Isolated}=require('../src/lastNightSite16IsolatedExecutor');
test('production and unregistered boundaries refuse before store or loader access',async()=>{
 let calls=0;const boundary={store:{listTasks:()=>calls++},loadPage:()=>calls++};
 for(const input of [{mode:'production',boundary:registerSite16Fixture(boundary)},{mode:'isolated-test',boundary}])await assert.rejects(executeSite16Isolated(input),{code:'PRODUCTION_EXECUTION_DISABLED'});
 assert.equal(calls,0);
});
test('isolated bounded executor resumes persisted task cursor and skips completed tasks',async()=>{
 const task={siteId:'site-3bb48be7f9a82185d6a045e9a5cbd3d7',accountId:'a',kind:'q1_feed',taskKey:'f',status:'idle'};
 let cursor=null,status='idle',calls=0;
 const boundary=registerSite16Fixture({store:{listTasks:async()=>[{...task,status}],readTask:async()=>({status,cursor,committedPages:cursor?1:0}),renewOwner:async()=>{},commitTaskPage:async({page})=>{cursor=page.nextCursor;status=page.hasMore?'idle':'completed';}},loadPage:async(t,saved)=>{calls++;assert.equal(saved,cursor);return{items:[],hasMore:!saved,nextCursor:saved?null:'offset20'};}});
 const input={mode:'isolated-test',boundary,plan:{hash:'h',tasks:[task]},now:()=>0,deadlineAt:100,maxPages:1};
 assert.equal((await executeSite16Isolated(input)).status,'LAST_NIGHT_SITE16_PARTIAL_RESUMABLE');
 const result=await executeSite16Isolated({...input,maxPages:10});assert.equal(result.status,'LAST_NIGHT_SITE16_TASKS_COMPLETED');assert.equal(result.productionExecuted,false);assert.equal(result.fullChainComplete,false);
 await executeSite16Isolated(input);assert.equal(calls,2);
});
