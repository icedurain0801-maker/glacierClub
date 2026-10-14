'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {richContentQuery}=require('../src/lastNightRichContentQuery');const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const {Repository}=require('../../server/src/db/repository');
test('rich legacy insert preserves raw hash, empty body, deletion and content-sensitive fingerprint',async()=>{
 const calls=[],query=richContentQuery(async(sql,params)=>{calls.push(params);return[{affectedRows:1}];});
 const sql='INSERT INTO po_contents (source_id,external_id,title,author_name,body,is_deleted,fingerprint,raw_payload,id,game_id,community_id,account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
 for(const data of ['first','changed']){const detail={id:'p',isDeleted:true,content:[{type:5,data}]};const raw={_lastNightProviderDetail:detail,_lastNightProviderDetailSha256:crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex'),_lastNightAnalysisBasis:{bodyTextAvailable:false}};
 await query(sql,[SOURCE_ID,'p','title','author','opaque string must not be body',0,'old',JSON.stringify(raw),'content',GAME_ID,COMMUNITY_ID,'a']);assert.equal(calls.at(-1)[4],'');assert.equal(calls.at(-1)[5],1);assert.equal(calls.at(-1)[7],JSON.stringify(raw));}
 assert.notEqual(calls[0][6],calls[1][6]);
});
test('actual enqueue uses saved rich fingerprint and fails empty-text jobs without fake completion',async()=>{
 const calls=[];const query=richContentQuery(async(sql,params)=>{calls.push({sql,params});return sql.startsWith('SELECT')?[[{id:'job'}]]:[{affectedRows:1}];});
 const detail={id:'p',content:[{type:5,data:'opaque'}]},raw={_lastNightProviderDetail:detail,_lastNightProviderDetailSha256:crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex'),_lastNightAnalysisBasis:{bodyTextAvailable:false}};
 await query('INSERT INTO po_contents (id,source_id,game_id,community_id,account_id,external_id,title,author_name,body,is_deleted,fingerprint,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',['c',SOURCE_ID,GAME_ID,COMMUNITY_ID,'a','p','','author','',0,'old',JSON.stringify(raw)]);
 const repo=Object.create(Repository.prototype);repo.query=async(sql,params)=>(await query(sql,params))[0];
 await repo.enqueueAnalysisJob('c',{profile:'light',version:'sentiment-v1',contentFingerprint:'wrong'});
 const queued=calls.find(call=>call.sql.startsWith('INSERT INTO po_analysis_jobs'));
 assert.ok(queued.sql.includes("'failed'"));assert.equal(queued.params[7],'LAST_NIGHT_NO_ANALYZABLE_TEXT');assert.ok(queued.sql.endsWith('ON DUPLICATE KEY UPDATE id=id'));assert.equal(queued.params[5],'lastnight_explicit_title_only');assert.notEqual(queued.params[4],'wrong');
 assert.equal((queued.sql.match(/\?/g)||[]).length,queued.params.length);
});
