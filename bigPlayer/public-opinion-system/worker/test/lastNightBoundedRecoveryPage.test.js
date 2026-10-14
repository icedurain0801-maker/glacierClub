'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {recoverFirstSite16Page}=require('../src/lastNightBoundedRecoveryPage');
const {exactRecoveryPlan}=require('../src/lastNightExactRecoveryPlan');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const token={parentId:'parent',accountId:'account',ownerId:'owner',epoch:1535};
const feed={boardId:'100017',feedKey:'100017:home:merged::0:::',endpointKind:'merged',pageKind:'home',sectionId:'0'};
const config=JSON.stringify({siteUrls:[{siteId:'site-3bb48be7f9a82185d6a045e9a5cbd3d7',url:'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=16'}]});
function fixture({lost=false,active=false,unknown=false,fallback=false,reuse=true}={}){
 const sql=[],phases=[];let checkpoint;const row={id:'old',external_id:'1',source_id:SOURCE_ID,account_id:'account',game_id:GAME_ID,community_id:COMMUNITY_ID,content_type:'post',fingerprint:'oldfp',raw_payload:'{"type":0}',body:'old'};
 const q=async(text,params)=>{sql.push(text);
  if(text.includes('SELECT lease_run_id'))return[[{lease_run_id:'parent',lease_owner:'owner',lease_epoch:lost?1536:1535,live:1}]];
  if(text.includes('SELECT config'))return[[{config}]];
  if(text.includes('SELECT id FROM po_sync_runs'))return[active?[{id:'competitor'}]:[]];
  if(text.includes('SELECT id FROM po_sync_checkpoints'))return[[]];
  if(text.includes('SELECT feed_key,feed_metadata'))return[[]];
  if(text.startsWith('INSERT INTO po_sync_checkpoints'))checkpoint={id:params[0],status:'running',cursor:null};
  if(text.startsWith('UPDATE po_sync_checkpoints SET `cursor`'))checkpoint={...checkpoint,status:params[1],cursor:params[0]};
  if(text.includes('SELECT * FROM po_sync_checkpoints'))return[[checkpoint]];
  if(text.includes('SELECT * FROM po_contents'))return[reuse?[row]:[]];
  if(text==='COMMIT'&&unknown)throw new Error('ack');return[{affectedRows:1}];
 };
 const repo={_upsertContentPageAttempt:async function(input){assert.equal(input.items.length,reuse?0:1);return{contents:reuse?[]:[{content:{...row,id:'new',fingerprint:'newfp'},change:'inserted'}]};},enqueueAnalysisJob:async()=>{}};
 const item={externalId:'1',contentType:'post',boardId:'100017',publishedAt:'2026-10-08T00:00:00Z',sourceUrl:'https://club-en.q1.com/',body:'incoming',rawPayload:{boardId:100017,_contentIntegrity:{status:fallback?'summary_fallback':'detail_enriched'}}};
 return{query:q,bounded:async p=>p,token,feed,repo,snapshot:{source:{config,schedule_version:1}},runtime:{source:{config},account:{id:'account'}},connector:{listFeedContents:async()=>({items:[item],hasMore:true,nextCursor:'{"offsetId":20}'})},persistEvidence:async e=>phases.push(e.phase),sql,phases,row};
}
test('first16 page keeps unknown history immutable and only new request association; partial persists cursor',async()=>{
 const f=fixture();const result=await recoverFirstSite16Page(f);assert.equal(result.reusedCount,1);assert.equal(result.hasMore,true);assert.equal(result.fullChainComplete,false);
 assert.ok(!f.sql.some(text=>text.startsWith('UPDATE po_contents')));assert.ok(!f.sql.some(text=>text.includes('DELETE')));assert.equal(f.phases.at(-1),'recovery_page_committed');
});
test('source fencing, competitor, detail fallback, commit unknown fail closed',async()=>{
 for(const [options,code]of[[{lost:true},'LAST_NIGHT_RECOVERY_SOURCE_LEASE_LOST'],[{active:true},'LAST_NIGHT_ACTIVE_RUN'],[{fallback:true},'LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED'],[{unknown:true},'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN']]){
 const f=fixture(options);await assert.rejects(recoverFirstSite16Page(f),e=>e.code===code);
 if(!options.unknown)assert.ok(!f.sql.includes('COMMIT'));
 }
});
test('current checkpoint selection excludes old windows and marks boundary as evidence required, never offset0',()=>{
 const cp={id:'0205567a-70c3-4ca2-a416-456ef2f09a66',account_id:'account',site_id:'legacy-8483a64ab230417e63c5e30d77b0a6f0',task_kind:'q1_feed',task_key:'100017:circle:activity:552:564:5::1',sync_scope:'posts',root_platform_content_id:'',window_start:'2026-10-02T03:07:34.810Z',window_end:'2026-10-09T03:07:34.810Z',status:'failed',error_code:'ER_LOCK_DEADLOCK',lease_owner:null,lease_until:null,cursor:JSON.stringify({version:2,feedKey:'100017:circle:activity:552:564:5::1',endpointKind:'activity',pageIndex:1,offsetId:50,timeOrderVerified:true,previousFingerprint:'ids',previousOldestPublishedAt:'2026-09-08T06:17:49Z'})};
 const feeds=[{...feed,feedKey:cp.task_key}];const plan=exactRecoveryPlan({accountId:'account',checkpoints:[cp,{...cp,id:'old',window_start:'2026-09-01T00:00:00Z'}],feeds});assert.equal(plan.site2Admission,'RESUME_EXACT_COMMITTED_CURSOR_REQUEST_NEXT_PAGE');assert.equal(JSON.parse(plan.cursor).offsetId,50);
 assert.throws(()=>exactRecoveryPlan({accountId:'account',checkpoints:[{...cp,cursor:null,items_fetched:0}],feeds}),/CURSOR_UNSAFE/);
});
