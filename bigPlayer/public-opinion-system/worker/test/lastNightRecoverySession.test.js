'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resumeRecoverySession}=require('../src/lastNightRecoverySession');
const {SOURCE_ID}=require('../src/lastNightScope');
function fixture({changed=false,active=false}={}) {
 const evidence={phase:'recovery_page_committed',sourceId:SOURCE_ID,accountId:'a',sourceConfig:'{}',scheduleVersion:1,token:{parentId:'p',ownerId:'old',epoch:1535,accountId:'a'},afterCheckpoint:{status:'idle',task_key:'feed',cursor:JSON.stringify({version:2,feedKey:'feed',offsetId:20,pageIndex:2})}};
 let state={lease_run_id:'p',lease_owner:changed?'other':'old',lease_epoch:1535};const sql=[];
 const conn={destroy(){},query:async({sql:text},params)=>{sql.push(text);
  if(text.includes('CURRENT_USER'))return[[{identity:'fixture',db:'public_opinion',port:3306}]];
  if(text.includes('GET_LOCK'))return[[{acquired:1}]];
  if(text.includes('SELECT * FROM po_source_schedule_state'))return[[state]];
  if(text.includes('SELECT config'))return[[{config:'{}',schedule_version:1}]];
  if(text.includes('SELECT id FROM po_sync_runs'))return[active?[{id:'other'}]:[]];
  if(text.startsWith('UPDATE po_source_schedule_state'))state={...state,lease_owner:params[0],lease_epoch:1536};
  if(text.includes('SELECT lease_run_id'))return[[{...state,live:1}]];
  return[{affectedRows:1}];
 }};
 return{pool:{getConnection:async()=>conn},evidence,expectedIdentity:'fixture',ownerId:'lastnight-independent:12345678-1234-1234-1234-123456789abc',persistEvidence:async()=>{},sql};
}
test('authenticated resume acquires new epoch and keeps account lock context for saved cursor',async()=>{
 const f=fixture();const result=await resumeRecoverySession({...f,work:async context=>({epoch:context.token.epoch,cursor:JSON.parse(f.evidence.afterCheckpoint.cursor).offsetId})});
 assert.deepEqual(result,{epoch:1536,cursor:20});assert.equal(f.sql.filter(s=>s==='COMMIT').length,1);
});
test('changed owner, competing run or unsafe cursor refuses before lease write',async()=>{
 for(const options of [{changed:true},{active:true},{}]){const f=fixture(options);if(!Object.keys(options).length)f.evidence.afterCheckpoint.cursor=null;
 await assert.rejects(resumeRecoverySession({...f,work:async()=>{throw new Error('not reached');}}));assert.ok(!f.sql.some(s=>s.startsWith('UPDATE')));}
});
