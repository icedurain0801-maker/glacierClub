'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const cipher=require('../../server/src/integrations/credentialCipher');
const {bindCommittedSession}=require('../src/lastNightRecoveryFailureContract');
const {recoverFirstSite16Page}=require('../src/lastNightBoundedRecoveryPage');
const {Repository}=require('../../server/src/db/repository');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const siteId='site-3bb48be7f9a82185d6a045e9a5cbd3d7';
const from='2026-10-02T03:07:34.810Z',to='2026-10-09T03:07:34.810Z';
const feed={boardId:'100017',feedKey:'100017:home:merged::0:::',pageKind:'home',endpointKind:'merged',sectionId:'0'};
test('real AES-GCM base/session input binding rejects tamper and preserves original offset',()=>{
 const env={CREDENTIAL_ENC_KEY:crypto.randomBytes(32).toString('hex')};
 const base={phase:'recovery_page_committed',sourceId:SOURCE_ID,accountId:'a',sourceConfig:'config',afterCheckpoint:{cursor:'offset20'},token:{parentId:'parent',accountId:'a',ownerId:'old',epoch:1536}};
 const session={phase:'resume_committed',sourceId:SOURCE_ID,accountId:'a',token:{parentId:'parent',accountId:'a',ownerId:'new',epoch:1537}};
 const encrypt=value=>cipher.encrypt(JSON.stringify(value),env,{aad:'lastnight-store:12345678-1234-1234-1234-123456789abc'});
 const bytes=[encrypt(base),encrypt(session)],hash=bytes.map(value=>crypto.createHash('sha256').update(value).digest('hex'));
 const read=value=>{const e=JSON.parse(value);return JSON.parse(cipher.decrypt(e,env,{aad:e.aad}));};
 const proof=bindCommittedSession({base:read(bytes[0]),session:read(bytes[1]),baseSha:hash[0],sessionSha:hash[1],approvedBaseSha:hash[0],approvedSessionSha:hash[1]});assert.equal(proof.token.epoch,1537);
 const broken=JSON.parse(bytes[1]);broken.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>read(JSON.stringify(broken)));
});
test('saved offset20 detail-enriched page commits actual Repository legacy SQL, cursor and AI once',async()=>{
 const token={accountId:'a',parentId:'parent',ownerId:'owner',epoch:1538};
 let cp={id:'cp',account_id:'a',site_id:siteId,task_kind:'q1_feed',task_key:feed.feedKey,sync_scope:'posts',root_platform_content_id:'',window_start:from,window_end:to,status:'idle',cursor:JSON.stringify({version:2,feedKey:feed.feedKey,offsetId:20,pageIndex:2,segmentId:'segment'}),lease_owner:null,lease_until:null};
 const before={...cp},calls=[],journals=[];let stored=null;
 const config=JSON.stringify({siteUrls:[{siteId,url:'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=16'}]});
 const q=async(sql,params=[])=>{calls.push({sql,params});
  if(sql.startsWith('SELECT lease_run_id'))return[[{lease_run_id:'parent',lease_owner:'owner',lease_epoch:1538,live:1}]];
  if(sql.startsWith('SELECT config'))return[[{config}]];
  if(sql.startsWith('SELECT id FROM po_sync_runs'))return[[]];
  if(sql.startsWith('SELECT * FROM po_sync_checkpoints'))return[[cp]];
  if(sql.startsWith("UPDATE po_sync_checkpoints SET status='running'"))cp={...cp,status:'running',lease_owner:'owner'};
  if(sql.startsWith('SELECT r.id'))return[[{id:'run'}]];
  if(sql.startsWith('SELECT * FROM po_contents'))return[stored?[stored]:[]];
  if(sql.startsWith('INSERT INTO po_contents')){
   const columns=sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value=>value.trim());assert.ok(!columns.includes('board_id'));
   stored=Object.fromEntries(columns.slice(0,params.length).map((column,index)=>[column,params[index]]));
  }
  if(sql.startsWith('SELECT * FROM po_analysis_jobs'))return[[{id:'job'}]];
  if(sql.startsWith('UPDATE po_sync_checkpoints SET `cursor`'))cp={...cp,cursor:params[0],status:params[1]};
  return[{affectedRows:1}];
 };
 const repo=Object.create(Repository.prototype);repo.syncUpsertLockWaitSeconds=3;
 const result=await recoverFirstSite16Page({query:q,bounded:p=>p,token,repo,snapshot:{source:{config,schedule_version:1}},runtime:{source:{config},account:{id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID}},feed,resumeCheckpoint:before,
  connector:{listFeedContents:async input=>{assert.equal(JSON.parse(input.cursor).offsetId,20);return{items:[{externalId:'p',contentType:'post',publishedAt:'2026-10-08T00:00:00Z',sourceUrl:'https://club-en.q1.com/',body:'detail',rawPayload:{_contentIntegrity:{status:'detail_enriched'}}}],hasMore:false,nextCursor:null};}},persistEvidence:async value=>journals.push(value)});
 assert.equal(result.newCount,1);assert.equal(cp.status,'completed');assert.equal(cp.cursor,null);assert.equal(result.fullChainComplete,false);
 assert.equal(calls.filter(call=>call.sql==='COMMIT').length,1);assert.ok(calls.some(call=>call.sql.startsWith('INSERT INTO po_analysis_jobs')));
 assert.equal(journals.at(-1).phase,'recovery_page_committed');assert.equal(stored.external_id,'p');
});
