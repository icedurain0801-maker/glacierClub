'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {finishSegment}=require('../src/lastNightSegmentFinalizer');const {SOURCE_ID}=require('../src/lastNightScope');
function fixture(unknown=false){const calls=[],phases=[],state={pending:false};const token={parentId:'p',accountId:'a',ownerId:'o',epoch:4};
 return{query:async(sql,params)=>{calls.push({sql,params});if(sql.startsWith('SELECT lease_run_id'))return[[{lease_run_id:'p',lease_owner:'o',lease_epoch:4,live:1}]];
 if(sql.startsWith('SELECT * FROM po_sync_runs'))return[[{id:'r',source_id:SOURCE_ID,account_id:'a',status:'running',lease_owner:'o',lease_epoch:1}]];
 if(sql==='COMMIT'&&unknown)throw new Error('ack');return[{affectedRows:1}];},bounded:p=>p,token,runId:'r',runEpoch:1,persistEvidence:async value=>phases.push(value.phase),commitState:state,calls,phases};}
test('partial budget segment ends run without discarding persistent checkpoints',async()=>{const f=fixture();const result=await finishSegment({...f,completed:false});assert.equal(result.status,'partial');assert.ok(f.calls.some(call=>call.sql.includes('lease_owner=NULL,lease_until=NULL')));assert.ok(!f.calls.some(call=>call.sql.includes('po_sync_checkpoints')));assert.equal(f.phases.at(-1),'segment_finish_committed');});
test('finish COMMIT unknown stays pending and cannot restart or be called success',async()=>{const f=fixture(true);await assert.rejects(finishSegment({...f,completed:true}),{code:'LAST_NIGHT_SEGMENT_COMMIT_UNKNOWN'});assert.equal(f.commitState.pending,true);await assert.rejects(finishSegment({...f,completed:true}),{code:'LAST_NIGHT_SEGMENT_INVALID'});assert.equal(f.calls.filter(call=>call.sql==='COMMIT').length,1);});
