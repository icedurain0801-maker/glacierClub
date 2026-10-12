'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {transaction,claim}=require('../../scripts/overseas-verify-exact-ai');
test('unknown commit destroys connection without rollback or release',async()=>{
  const calls=[];const conn={query:async()=>[],beginTransaction:async()=>{},commit:async()=>{calls.push('commit');throw Error('ack lost');},rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),destroy:()=>calls.push('destroy')};
  await assert.rejects(transaction({pool:{getConnection:async()=>conn}},async()=>42),e=>e.code==='EXACT_AI_COMMIT_UNKNOWN');
  assert.deepEqual(calls,['commit','destroy']);
});
test('exact claim rejects changed source before modifying any job',async()=>{
  const calls=[];const conn={query:async sql=>{calls.push(sql);return sql.startsWith('SET')?[]:[[{source_id:'other',fingerprint:'fp',region_code:'overseas'}]];},beginTransaction:async()=>{},rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};
  await assert.rejects(claim({pool:{getConnection:async()=>conn}},[{contentId:'c',fingerprint:'fp'}],'owner'),e=>e.code==='EXACT_AI_CONTENT_CHANGED');
  assert.ok(!calls.some(s=>s.startsWith('UPDATE')));assert.ok(calls.includes('rollback'));
});
