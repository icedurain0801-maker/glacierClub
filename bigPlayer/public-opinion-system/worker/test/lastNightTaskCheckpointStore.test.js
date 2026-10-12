'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Repository}=require('../../server/src/db/repository');
const {createTaskCheckpointStore}=require('../src/lastNightTaskCheckpointStore');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const account={id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
const token={accountId:'a',parentId:'parent',ownerId:'owner',epoch:7};
const task={sourceId:SOURCE_ID,accountId:'a',siteId:'site-3bb48be7f9a82185d6a045e9a5cbd3d7',kind:'q1_feed',taskKey:'100017:home:merged::0:::',scope:'posts',rootId:'',publishedFrom:'2026-10-02T03:07:34.810Z',publishedTo:'2026-10-09T03:07:34.810Z',feed:{boardId:'100017',feedKey:'100017:home:merged::0:::',pageKind:'home',sectionId:null}};
const post={externalId:'p',sourceUrl:'https://club-en.q1.com/post/p',contentType:'post',publishedAt:'2026-10-05T00:00:00.000Z',body:'detail',rawPayload:{_contentIntegrity:{status:'detail_enriched'}}};
const row=(externalId='p',extra={})=>({id:`id-${externalId}`,external_id:externalId,source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,account_id:'a',content_type:'post',raw_payload:'{"type":"post"}',...extra});
function fixture({contents=[],members=[],checkpoint=null,commitUnknown=false,leaseLost=false}={}) {
 const calls=[],evidence=[],state={},data=new Map(contents.map(value=>[value.external_id,value]));
 const repo=Object.create(Repository.prototype);repo.syncUpsertLockWaitSeconds=3;
 const query=async(sql,params=[])=>{
   calls.push({sql,params});
   if(sql.startsWith('SELECT lease_run_id'))return[[{lease_run_id:'parent',lease_owner:'owner',lease_epoch:7,live:leaseLost?0:1}]];
   if(sql.startsWith('SELECT id,status,account_id'))return[[{id:'run',status:'running',account_id:'a',source_id:SOURCE_ID,site_id:task.siteId,lease_owner:'owner',lease_epoch:1,live:1}]];
   if(sql.startsWith('SELECT r.id'))return[[{id:'run'}]];
   if(sql.startsWith('SELECT * FROM po_sync_checkpoints'))return[checkpoint?[checkpoint]:[]];
   if(sql.startsWith('SELECT feed_key'))return[members];
   if(sql.startsWith('SELECT * FROM po_contents WHERE source_id'))return[data.has(params[1])?[data.get(params[1])]:[]];
   if(sql.startsWith('SELECT * FROM po_contents WHERE id'))return[[...data.values()].filter(value=>value.id===params[0])];
   if(sql.startsWith('SELECT id FROM po_contents'))return[data.has(params[1])?[{id:data.get(params[1]).id}]:[]];
   if(sql.startsWith('INSERT INTO po_contents')){
     const columns=sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value=>value.trim());
     assert.ok(!columns.includes('board_id')&&!columns.includes('board_name'));
     const inserted=Object.fromEntries(columns.slice(0,params.length).map((column,index)=>[column,params[index]]));data.set(inserted.external_id,inserted);
   }
   if(sql.startsWith('SELECT * FROM po_analysis_jobs'))return[[{id:'job'}]];
   if(sql==='COMMIT' && commitUnknown)throw new Error('ack lost');
   return[{affectedRows:1}];
 };
 const store=createTaskCheckpointStore({query,bounded:promise=>promise,repo,account,token,runId:'run',runEpoch:1,plan:{hash:'h',tasks:[task]},persistEvidence:async value=>evidence.push(value),commitState:state});
 const commit=(t=task,page={items:[],hasMore:false,nextCursor:null},childTasks=[],expectedState=null)=>store.commitTaskPage({planHash:'h',task:t,page,childTasks,expectedState});
 return{store,commit,calls,evidence,state,data};
}
test('actual Repository SQL inserts fresh post and AI inside one fenced transaction',async()=>{
 const f=fixture();await f.commit(task,{items:[post],hasMore:false,nextCursor:null},[{...task,kind:'comments',taskKey:'p',scope:'comments',rootId:'p',feed:null}]);
 assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1);
 assert.ok(f.calls.some(c=>c.sql.startsWith('INSERT INTO po_analysis_jobs')));
 assert.equal(f.evidence.at(-1).phase,'task_page_committed');assert.equal(f.state.pending,false);
 assert.equal(f.data.get('p').content_type,'post');
 for(const call of f.calls)assert.equal((call.sql.match(/\?/g)||[]).length,call.params.length,call.sql);
});
test('reuse adds current feed evidence without rewriting legacy body or enqueueing AI',async()=>{
 const prior=row();const f=fixture({contents:[prior]});await f.commit(task,{items:[post],hasMore:false,nextCursor:null});
 assert.ok(f.calls.some(c=>c.sql.startsWith('INSERT INTO po_content_feed_memberships')&&c.sql.endsWith('id=id')));
 assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT INTO po_contents')||c.sql.startsWith('INSERT INTO po_analysis_jobs')));
 assert.deepEqual(f.data.get('p'),prior);
});
test('foreign membership refuses reused content before page writes',async()=>{
 const f=fixture({contents:[row()],members:[{feed_key:'100018:home',feed_metadata:'{}'}]});
 await assert.rejects(f.commit(task,{items:[post],hasMore:false,nextCursor:null}),{code:'LAST_NIGHT_TASK_MEMBERSHIP_CONFLICT'});
 assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT')));
});
test('existing comment must match exact root UUID, parent UUID and depth',async()=>{
 const commentTask={...task,kind:'comments',taskKey:'p',rootId:'p',scope:'comments',feed:null};
 for(const mismatch of [{root_content_id:'another-root'},{parent_content_id:'another-parent'},{content_depth:2}]){
   const f=fixture({contents:[row(),row('c',{content_type:'comment',root_content_id:'id-p',parent_content_id:'id-p',platform_parent_id:'p',content_depth:1,...mismatch})]});
   await assert.rejects(f.commit(commentTask,{items:[{...post,externalId:'c',contentType:'comment',rootPlatformContentId:'p'}],hasMore:false,nextCursor:null}),{code:'LAST_NIGHT_TASK_EXISTING_SCOPE_CONFLICT'});
   assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT')));
 }
});
test('window, invalid page, unrelated child and lease loss fail closed',async()=>{
 for(const date of [null,'invalid',task.publishedTo,'2026-10-01T00:00:00Z']){
   const f=fixture();await assert.rejects(f.commit(task,{items:[{...post,publishedAt:date}],hasMore:false,nextCursor:null}),{code:'LAST_NIGHT_TASK_WINDOW_MISMATCH'});
   assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT')));
 }
 await assert.rejects(fixture().commit(task,{items:[],hasMore:true,nextCursor:null}),{code:'LAST_NIGHT_TASK_PAGE_INVALID'});
 await assert.rejects(fixture({leaseLost:true}).commit(),{code:'LAST_NIGHT_TASK_SOURCE_LEASE_LOST'});
 await assert.rejects(fixture().commit(task,{items:[],hasMore:false,nextCursor:null},[{...task,kind:'comments',taskKey:'unrelated',scope:'comments',rootId:'unrelated',feed:null}]),{code:'LAST_NIGHT_TASK_CHILD_SCOPE_CONFLICT'});
});
test('empty-page saved cursor is not first page; failed NULL cursor refuses restart',async()=>{
 const cp={status:'idle',cursor:'offset20',items_fetched:0};const f=fixture({checkpoint:cp});
 assert.equal((await f.store.readTask(task)).committedPages,1);
 const broken=fixture({checkpoint:{...cp,status:'failed',cursor:null}});const state=await broken.store.readTask(task);
 await assert.rejects(broken.commit(task,{items:[],hasMore:false,nextCursor:null},[],state),{code:'LAST_NIGHT_TASK_CURSOR_UNSAFE'});
});
test('COMMIT unknown keeps pending and never rollback/retry',async()=>{
 const f=fixture({commitUnknown:true});await assert.rejects(f.commit(),{code:'LAST_NIGHT_TASK_PAGE_COMMIT_UNKNOWN'});
 assert.equal(f.state.pending,true);assert.equal(f.state.acknowledged,false);
 assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1);assert.ok(!f.calls.some(c=>c.sql==='ROLLBACK'));
 await assert.rejects(f.commit(),{code:'LAST_NIGHT_TASK_COMMIT_RECONCILIATION_REQUIRED'});
 await assert.rejects(f.store.renewOwner(),{code:'LAST_NIGHT_TASK_COMMIT_RECONCILIATION_REQUIRED'});
 assert.equal(f.calls.filter(c=>c.sql==='COMMIT').length,1);
});
test('new nested parent and lexically earlier reply persist exact ancestors in one transaction',async()=>{
 const f=fixture({contents:[row()]});
 const comments={...task,kind:'comments',taskKey:'p',rootId:'p',scope:'comments',feed:null};
 await f.commit(comments,{items:[{...post,externalId:'z',contentType:'comment',replies:[{...post,externalId:'a',contentType:'comment'}]}],hasMore:false,nextCursor:null});
 const parent=f.data.get('z'),child=f.data.get('a');assert.equal(parent.root_content_id,'id-p');assert.equal(parent.content_depth,1);
 assert.equal(child.root_content_id,'id-p');assert.equal(child.parent_content_id,parent.id);assert.equal(child.platform_parent_id,'z');assert.equal(child.content_depth,2);
 assert.equal(f.calls.filter(call=>call.sql==='COMMIT').length,1);
});
