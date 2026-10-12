'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {forwardResume}=require('../src/lastNightForwardResume');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const {guardTransport}=require('../../scripts/lastnight-forward-resume');
const {bindForwardSession}=require('../src/lastNightRecoveryFailureContract');
function fixture({drift=false,active=false,lockLost=false,unknown=false}={}){
 const accountId='a',siteId='site-3bb48be7f9a82185d6a045e9a5cbd3d7';
 const cp={id:'cp',account_id:accountId,site_id:siteId,task_kind:'q1_feed',task_key:'100017:home:merged::0:::',sync_scope:'posts',root_platform_content_id:'',window_start:'2026-10-02T03:07:34.810Z',window_end:'2026-10-09T03:07:34.810Z',status:'idle',cursor:JSON.stringify({version:2,feedKey:'100017:home:merged::0:::',offsetId:20,pageIndex:2}),lease_owner:null,lease_until:null};
 const sites=['legacy-8483a64ab230417e63c5e30d77b0a6f0','site-f069f4495d534693dd87b2485053e7cd',siteId].map((id,index)=>({siteId:id,url:`https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${[2,9,16][index]}`}));
 const config=JSON.stringify({boardId:'100017',siteUrls:sites});
 const evidence={sourceId:SOURCE_ID,accountId,sourceConfig:config,scheduleVersion:1,token:{parentId:'parent',accountId,ownerId:'old',epoch:1537},afterCheckpoint:cp};
 let state={source_id:SOURCE_ID,schedule_version:1,lease_run_id:'parent',lease_owner:'old',lease_epoch:1537};
 const source={id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,region_code:'overseas',community_status:'enabled',platform:'bigplayer_h5',enabled:1,config,schedule_version:1};
 const calls=[],journals=[],publics=[],order=[];
 const conn={destroy(){},query:async({sql},params)=>{calls.push(sql);
  if(sql.includes('CURRENT_USER'))return[[{identity:'fixture',db:'public_opinion',port:3306}]];
  if(sql.includes('GET_LOCK'))return[[{acquired:lockLost?0:1}]];
  if(sql.startsWith('SELECT * FROM po_source_schedule_state'))return[[state]];
  if(sql.startsWith('SELECT s.*')||sql.startsWith('SELECT * FROM po_sources'))return[[source]];
  if(sql.startsWith('SELECT region_code'))return[[{region_code:'overseas'}]];
  if(sql.startsWith('SELECT status FROM po_communities'))return[[{status:'enabled'}]];
  if(sql.startsWith('SELECT * FROM po_accounts'))return[[{id:accountId,source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',enabled:1}]];
  if(sql.startsWith('SELECT site_id'))return[sites.map(row=>({site_id:row.siteId,url:row.url,enabled:1}))];
  if(sql.startsWith('SELECT * FROM po_sync_checkpoints'))return[[drift?{...cp,cursor:'changed'}:cp]];
  if(sql.startsWith('SELECT id FROM po_sync_runs'))return[active?[{id:'other'}]:[]];
  if(sql.startsWith('SELECT id FROM po_sync_checkpoints'))return[[]];
  if(sql.startsWith('UPDATE po_source_schedule_state'))state={...state,lease_owner:params[0],lease_epoch:state.lease_epoch+1};
  if(sql.startsWith('SELECT lease_run_id'))return[[{...state,live:1}]];
  if(sql==='COMMIT'&&unknown)throw new Error('ack lost');
  return[{affectedRows:1}];
 }};
 const input={pool:{getConnection:async()=>conn},evidence,bindings:{baseSha:'a'.repeat(64),sessionSha:'b'.repeat(64)},expectedIdentity:'fixture',ownerId:'lastnight-independent:12345678-1234-1234-1234-123456789abc',
  persistEvidence:async value=>journals.push(value),persistPublic:async value=>{publics.push(value);order.push(value.phase);},runtime:{source,account:{id:accountId}},repo:{},connector:{listFeedContents:async()=>{order.push('HTTP');return{items:[{externalId:'private',contentType:'post',rawPayload:{_contentIntegrity:{status:'summary_fallback',code:'DETAIL_RESPONSE_INVALID'}}}],hasMore:true,nextCursor:'x'};}}};
 return{input,calls,journals,publics,order,getState:()=>state};
}
test('inspect has zero lease writes/HTTP and execute requires approved identical snapshot',async()=>{
 const f=fixture();const inspect=await forwardResume({...f.input,inspectOnly:true});assert.equal(inspect.offset,20);assert.ok(!f.calls.some(sql=>sql.startsWith('UPDATE')));assert.equal(f.order.length,0);
 await assert.rejects(forwardResume({...fixture().input,approvedHash:'c'.repeat(64)}),{code:'LAST_NIGHT_FORWARD_SNAPSHOT_CHANGED'});
});
test('detail failure saves public contract before HTTP and binds committed owner to original checkpoint',async()=>{
 const f=fixture();const plan=await forwardResume({...f.input,inspectOnly:true});
 await assert.rejects(forwardResume({...f.input,approvedHash:plan.snapshotHash}),{code:'LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED'});
 assert.deepEqual(f.order,['detail_diagnostic_contract','HTTP','detail_page_diagnostics']);
 assert.equal(f.getState().lease_epoch,1538);assert.equal(f.journals.at(-1).phase,'forward_page_precommit_failed');assert.equal(f.journals.at(-1).afterCheckpoint.cursor,f.input.evidence.afterCheckpoint.cursor);
 assert.equal(f.publics.at(-1).items[0].integrityCode,'DETAIL_RESPONSE_INVALID');assert.ok(!JSON.stringify(f.publics).includes('private'));
 assert.ok(!f.calls.some(sql=>sql.startsWith('INSERT')));
});
test('lock, competing run or checkpoint raw drift rejects before owner write',async()=>{
 for(const option of [{lockLost:true},{active:true},{drift:true}]){const f=fixture(option);await assert.rejects(forwardResume({...f.input,inspectOnly:true}));assert.ok(!f.calls.some(sql=>sql.startsWith('UPDATE')));assert.equal(f.order.length,0);}
});
test('owner COMMIT unknown is classified and cannot invoke HTTP',async()=>{
 const f=fixture({unknown:true});const inspect=await forwardResume({...f.input,inspectOnly:true});
 await assert.rejects(forwardResume({...f.input,approvedHash:inspect.snapshotHash}),{code:'LAST_NIGHT_RESUME_COMMIT_UNKNOWN'});
 assert.equal(f.order.length,0);assert.equal(f.calls.filter(sql=>sql==='COMMIT').length,1);
});
test('HTTP guard only admits saved offset20 and one list, no homepage/site9/refresh',async()=>{
 let http=0;const guarded=guardTransport(async url=>{http++;return{ok:true,status:200,url:String(url),json:async()=>({code:0,data:{list:[]}})};},{offsetId:20,pageIndex:2});
 const options={redirect:'manual'};
 await assert.rejects(guarded('https://club-en.q1.com/api/club/v1/auth/post/model/merged-list?boardId=100017&sectionId=0&offsetId=0&pageIndex=1&pageSize=20',options),{code:'LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID'});assert.equal(http,0);
 await assert.rejects(guarded('https://club-en.q1.com/api/club/v1/auth/refresh',options),{code:'LAST_NIGHT_RECOVERY_HTTP_SCOPE_INVALID'});assert.equal(http,0);
});
test('two detail failures authenticate successive terminal receipts and preserve original cursor',async()=>{
 const f=fixture();const base={...f.input.evidence,token:{...f.input.evidence.token,epoch:1536,ownerId:'base'}};
 for(let iteration=0;iteration<2;iteration++){
  const inspect=await forwardResume({...f.input,inspectOnly:true});
  await assert.rejects(forwardResume({...f.input,approvedHash:inspect.snapshotHash}),{code:'LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED'});
  const terminal=JSON.parse(JSON.stringify(f.journals.at(-1)));
  f.input.evidence=bindForwardSession({base,session:terminal,baseSha:f.input.bindings.baseSha});
  assert.equal(JSON.parse(f.input.evidence.afterCheckpoint.cursor).offsetId,20);
  assert.equal(f.input.evidence.token.epoch,1538+iteration);
  assert.throws(()=>bindForwardSession({base,session:{...terminal,phase:'forward_resume_committed'},baseSha:f.input.bindings.baseSha}),{code:'LAST_NIGHT_FAILURE_SESSION_BINDING_INVALID'});
 }
 // A subsequent attempt reaches exactly the saved page, not old owner/base.
 const inspect=await forwardResume({...f.input,inspectOnly:true});assert.equal(inspect.offset,20);
 const outdated={...f.input.evidence,token:base.token};await assert.rejects(forwardResume({...f.input,evidence:outdated,inspectOnly:true}),{code:'LAST_NIGHT_RESUME_OWNER_CHANGED'});
});
test('shape-only execute has zero owner or page writes and keeps epoch unchanged',async()=>{
 const f=fixture();const inspect=await forwardResume({...f.input,inspectOnly:true});
 const result=await forwardResume({...f.input,inspectOnly:true,diagnosticOnly:true,approvedHash:inspect.snapshotHash});
 assert.equal(result.status,'LAST_NIGHT_DETAIL_SHAPE_RECORDED');assert.equal(f.getState().lease_epoch,1537);
 assert.ok(!f.calls.some(sql=>sql.startsWith('UPDATE')||sql.startsWith('INSERT')||sql==='COMMIT'));
 assert.equal(f.order[0],'detail_shape_contract');assert.equal(f.order[1],'HTTP');
});
