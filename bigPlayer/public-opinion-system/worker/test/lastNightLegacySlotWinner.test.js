'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {acquireLegacyDailyWinner}=require('../src/lastNightLegacySlotWinner');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
function fixture({existing=false,active=false,unknown=false}={}){
 const sites=['2','9','16'].map(language=>({siteId:`s${language}`,url:`https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${language}`,enabled:true}));
 const config=JSON.stringify({boardId:'100017',siteUrls:sites}),sql=[],runs=[];
 const owner='lastnight-independent:12345678-1234-1234-1234-123456789abc';
 const conn={destroy(){},query:async({sql:text},params=[])=>{sql.push(text);
  if(text.includes('CURRENT_USER'))return[[{identity:'fixture',db:'public_opinion',port:3306,db_now:'2026-10-09 18:00:00.000'}]];
  if(text.includes('GET_LOCK'))return[[{acquired:1}]];
  if(text.startsWith('SELECT *, '))return[[{source_id:SOURCE_ID,schedule_version:2,lease_epoch:1535,lease_owner:null,active_lease:0}]];
  if(text.includes('FROM po_sources'))return[[{id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',enabled:1,region_code:'overseas',community_status:'enabled',config,frequency_seconds:86400,schedule_version:2,active_window:'{"start":"00:00","end":"00:00"}'}]];
  if(text.includes('FROM po_accounts'))return[[{id:'a',game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',enabled:1}]];
  if(text.includes('FROM po_source_sites'))return[sites.map(s=>({site_id:s.siteId,url:s.url,enabled:1}))];
  if(text.includes('WHERE source_id=? AND scheduled_at=?'))return[existing?[{id:'shared',status:'queued'}]:[]];
  if(text.startsWith('SELECT id FROM po_sync_runs'))return[active?[{id:'other'}]:[]];
  if(text.startsWith('INSERT INTO po_sync_runs')) {
   assert.ok(!/\bboard_id\b|\bcommunity_id\b|site_url_snapshot/.test(text));
   const child=text.includes('parent_run_id');runs.push({id:params[0],parent_run_id:child?params[1]:null,site_id:child?params[2]:null,status:'running',window_start:'2026-10-08 16:00:00.000',window_end:'2026-10-09 16:00:00.000',lease_owner:owner,lease_epoch:1});
  }
  if(text.startsWith('SELECT id,parent_run_id'))return[runs];
  if(text==='COMMIT'&&unknown)throw new Error('lost ACK');return[{affectedRows:1}];
 }};
 return{pool:{getConnection:async()=>conn},plan:{accountId:'a',ownerId:owner,expectedIdentity:'fixture',configSha256:crypto.createHash('sha256').update(config).digest('hex'),scheduledAt:'2026-10-10T02:00:00+08:00',scheduleVersion:2},persistEvidence:async()=>{},sql,runs};
}
test('legacy slot transaction winner creates all running before consume and fixes prior day UTC window',async()=>{
 const f=fixture();let called=false;
 const result=await acquireLegacyDailyWinner({...f,consume:async context=>{called=true;assert.equal(f.runs.length,4);assert.equal(context.intent.windowStart,'2026-10-08T16:00:00.000Z');assert.equal(context.token.epoch,1536);return{status:'consuming'};}});
 assert.equal(result.status,'consuming');assert.equal(called,true);assert.equal(f.sql.filter(s=>s==='COMMIT').length,1);
});
test('shared winner and other active source prevent consume, zero inserts',async()=>{
 for(const options of [{existing:true},{active:true}]){const f=fixture(options);let consumed=false;
 const promise=acquireLegacyDailyWinner({...f,consume:async()=>{consumed=true;}});
 if(options.existing)assert.equal((await promise).status,'LAST_NIGHT_SLOT_ALREADY_OWNED');else await assert.rejects(promise,/ACTIVE_OWNER/);
 assert.equal(consumed,false);assert.equal(f.runs.length,0);}
});
test('commit unknown never starts consume or retries commit',async()=>{
 const f=fixture({unknown:true});let consumed=false;
 await assert.rejects(acquireLegacyDailyWinner({...f,consume:async()=>{consumed=true;}}),e=>e.code==='LAST_NIGHT_SLOT_COMMIT_UNKNOWN');
 assert.equal(consumed,false);assert.equal(f.sql.filter(s=>s==='COMMIT').length,1);assert.ok(!f.sql.includes('ROLLBACK'));
});
