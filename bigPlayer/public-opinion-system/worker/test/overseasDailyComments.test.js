'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.LASTLIGHT_TEST_RUNTIME || path.resolve(__dirname, '..');
const {commentItems, advanceComments, collectComments, commentRootTasks, ensureCommentRootScope} = require(path.join(root,'src/overseasDailyComments'));
const intent = {windowStart:'2026-10-11T16:00:00Z', windowEnd:'2026-10-13T10:00:00Z'};
const comment = (id, at, extra={}) => ({externalId:id,contentType:'comment',body:id,publishedAt:at,sourceUrl:'https://club-en.q1.com/',...extra});
const task = {postId:'100',commentId:null,cursor:null,pages:0,done:false,sortType:0};

test('new reply under an old comment retains ancestry but does not analyse old context',()=>{
  const page={items:[comment('1','2026-09-01T00:00:00Z',{replies:[comment('2','2026-10-12T01:00:00Z')]})],replyTargets:[]};
  const items=commentItems(page,task,intent,'100017');
  assert.equal(items.length,2);assert.equal(items[0].recoveryContextAncestor,true);
  assert.equal(items[1].recoveryContextAncestor,false);assert.equal(items[1].platformParentId,'1');
  assert.equal(items[1].rootPlatformContentId,'100');assert.equal(items[1].contentDepth,2);
  assert.equal(items[1].rawPayload._overseasScope.boardId,'100017');
});
test('empty time-window page still persists old reply target and continues pagination',()=>{
  const page={items:[comment('1','2026-09-01T00:00:00Z')],replyTargets:[{postId:'100',commentId:'1'}],hasMore:true,nextCursor:'p2'};
  assert.equal(commentItems(page,task,intent,'100017')[0].recoveryContextAncestor,true);
  const next=advanceComments({commentTasks:[task]},page,0);
  assert.equal(next.done,false);assert.equal(next.commentTasks[0].cursor,'p2');assert.equal(next.commentTasks[1].commentId,'1');
});
test('comments and replies must both complete before site completion',()=>{
  let state={commentTasks:[task]};
  state=advanceComments(state,{hasMore:false,nextCursor:null,replyTargets:[{postId:'100',commentId:'1'}]},0);
  assert.equal(state.done,false);
  state=advanceComments(state,{hasMore:false,nextCursor:null,replyTargets:[]},1);
  assert.equal(state.done,true);
});
test('reply-only page stores level two and rejects another root reply target',()=>{
  const items=commentItems({items:[comment('2','2026-10-12T01:00:00Z',{platformParentId:'1'})]}, {...task,commentId:'1'},intent,'100017');
  assert.equal(items[0].contentDepth,2);
  assert.throws(()=>advanceComments({commentTasks:[task]},{replyTargets:[{postId:'999',commentId:'1'}]},0),{code:'OVERSEAS_COMMENT_REPLY_SCOPE'});
});
test('top comment with provider parentId zero belongs to its post',()=>{
  const items=commentItems({items:[comment('1','2026-10-12T01:00:00Z',{platformParentId:'0'})]},task,intent,'100017');
  assert.equal(items[0].platformParentId,'100');assert.equal(items[0].contentDepth,1);
});
test('time boundaries exclude end and keep start, reject missing time',()=>{
  const items=commentItems({items:[comment('1',intent.windowStart),comment('2',intent.windowEnd)]},task,intent,'100017');
  assert.deepEqual(items.map(item=>item.externalId),['1']);
  assert.throws(()=>commentItems({items:[comment('3',null)]},task,intent,'100017'),{code:'OVERSEAS_COMMENT_TIME_INVALID'});
});
test('legacy duplicate-language roots run once; independent Korean root stays Korean',()=>{
  const sites=[{site_id:'en',url:'https://club-en.q1.com/?languageId=2'},{site_id:'ko',url:'https://club-en.q1.com/?languageId=9'}];
  const rows=[{external_id:'100',site_id:'en'},{external_id:'100',site_id:'ko'},{external_id:'101',site_id:'ko'}];
  assert.deepEqual(commentRootTasks(rows,sites,'en').map(t=>t.postId),['100']);
  assert.deepEqual(commentRootTasks(rows,sites,'ko').map(t=>t.postId),['101']);
});
test('restart resumes committed comment cursor and newly registered reply task',async()=>{
  const child={site:{site_id:'en'},receipt:{phase:'comments',commentTasks:[structuredClone(task)]}};
  const calls=[];let rejectSecond=true;
  const connector={listComments:async args=>{
    calls.push([args.commentId,args.cursor]);
    if(args.cursor==='p2'&&rejectSecond)throw Object.assign(new Error('network'),{code:'NETWORK'});
    return {items:[],hasMore:args.cursor==null&&args.commentId==null,nextCursor:args.cursor==null&&args.commentId==null?'p2':null,
      replyTargets:args.commentId==null?[{postId:'100',commentId:'1'}]:[]};
  }};
  const options={connector,child,intent,check:async()=>{},commit:async page=>({receipt:{...child.receipt,...page.receiptPatch}})};
  await assert.rejects(collectComments(options),{code:'NETWORK'});
  assert.equal(child.receipt.commentTasks[0].cursor,'p2');rejectSecond=false;
  await collectComments(options);assert.equal(child.receipt.done,true);
  assert.deepEqual(calls,[[null,null],[null,'p2'],[null,'p2'],['1',null]]);
});
test('storage failure does not advance comment cursor',async()=>{
  const child={site:{site_id:'en'},receipt:{commentTasks:[structuredClone(task)]}};
  await assert.rejects(collectComments({child,intent,connector:{listComments:async()=>({items:[],hasMore:false,nextCursor:null})},
    check:async()=>{},commit:async()=>{throw Object.assign(new Error('rollback'),{code:'ROLLBACK'});}}),{code:'ROLLBACK'});
  assert.equal(child.receipt.commentTasks[0].done,false);assert.equal(child.receipt.commentTasks[0].pages,0);
});
test('legacy root without board marker requires exact membership before metadata repair',async()=>{
  const scope={sourceId:'s',accountId:'a',gameId:'g',communityId:'c',siteId:'en',boardId:'100017',postId:'100'};
  const row={id:'root',account_id:'a',game_id:'g',community_id:'c',content_type:'post',content_depth:0,raw_payload:'{}'};
  let updated=0,allow=true;
  const query=async(sql,args)=>{
    if(sql.startsWith('SELECT *'))return [row];
    if(sql.startsWith('SELECT id')){assert.deepEqual(args,['root','a','en','100017']);return allow?[{id:'member'}]:[];}
    assert(sql.startsWith('UPDATE po_contents SET raw_payload='));assert.deepEqual(args,['{"_overseasScope":{"boardId":"100017"}}','root']);updated++;return [];
  };
  await ensureCommentRootScope(query,scope);assert.equal(updated,1);
  allow=false;await assert.rejects(ensureCommentRootScope(query,scope),{code:'OVERSEAS_COMMENT_ROOT_MEMBERSHIP_REQUIRED'});assert.equal(updated,1);
  row.raw_payload='{"boardId":"999"}';await assert.rejects(ensureCommentRootScope(query,scope),{code:'OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT'});assert.equal(updated,1);
  row.raw_payload='{}';row.account_id='other';await assert.rejects(ensureCommentRootScope(query,scope),{code:'OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT'});assert.equal(updated,1);
});
