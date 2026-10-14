'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {targetLockQuery}=require('../src/lastNightTargetLockAdapter');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
test('target lock adapter does not lock joined game/community or OR scan runs',async()=>{
 const calls=[];const query=targetLockQuery(async(sql,params)=>{calls.push({sql,params});
  if(sql.startsWith('SELECT * FROM po_sources'))return[[{game_id:GAME_ID,community_id:COMMUNITY_ID}]];
  if(sql.startsWith('SELECT region_code'))return[[{region_code:'overseas'}]];
  if(sql.startsWith('SELECT status'))return[[{status:'enabled'}]];return[[]];
 },'a');
 await query('START TRANSACTION');
 await query('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE',[SOURCE_ID]);
 await query("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID,'a']);
 await query("SELECT id FROM po_sync_checkpoints WHERE account_id=? AND status='running' LIMIT 1 FOR UPDATE",['a']);
 assert.equal(calls[0].sql,'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
 assert.ok(!calls.some(call=>/JOIN| OR /.test(call.sql)));assert.ok(calls.filter(call=>/po_games|po_communities/.test(call.sql)).every(call=>!call.sql.includes('FOR UPDATE')));
 assert.equal(calls.filter(call=>call.sql.includes('FORCE INDEX (po_sync_checkpoints_site_idx)')).length,3);
});
test('lock timeout exposes only enumerated stage and no query parameters',async()=>{
 const query=targetLockQuery(async()=>{throw Object.assign(new Error('fixture'),{code:'ER_LOCK_WAIT_TIMEOUT'});},'a');
 await assert.rejects(query('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]),error=>error.code==='ER_LOCK_WAIT_TIMEOUT'&&error.lockStage==='source_state');
});
