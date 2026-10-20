const test = require('node:test');
const assert = require('node:assert/strict');
const { createQualityReasonBackfill, saveReason } = require('../src/qualityReasonBackfill');
const row = {id:'q',content_id:'c',fingerprint:'fp',content_fingerprint:'fp',quality_reason:'TypeSafe结构化质量及推荐判断',recommend_home:1,recommend_pin:0,recommend_feature:0,quality_score:.9,body:'分享具体阵容搭配与通关方法'};
function fixture(rows=[row]) {
  let time=0;const calls=[];
  const repo={acquireAdvisoryLock:async()=>true,releaseAdvisoryLock:async()=>calls.push('release'),qualityContentFilter:()=>({clauses:['eligible=1'],values:[]}),query:async()=>rows};
  return {repo,calls,now:()=>time,advance:ms=>time+=ms};
}
test('bounded repair explains saved flags without changing decisions and throttles each pass',async()=>{
 const f=fixture(Array.from({length:8},(_,i)=>({...row,id:String(i)})));let count=0;
 const tick=createQualityReasonBackfill({...f,explain:{explain:async(text,flags)=>{assert.equal(flags.recommendHome,true);assert.equal(flags.recommendPin,false);return {status:'generated',reason:'分享具体通关阵容和操作顺序，为卡关玩家提供参考'};}},save:async()=>{count++;return true;}});
 assert.equal((await tick()).generated,5);assert.equal((await tick()).generated,0);assert.equal(count,5);
});
test('failed explanations never save placeholders, cooldown permits later retry',async()=>{
 const f=fixture();let count=0,save=0;
 const tick=createQualityReasonBackfill({...f,explain:{explain:async()=>{count++;return count===1?{status:'failed'}:{status:'generated',reason:'分享具体阵容操作方法，供玩家通关时参考'};}},save:async()=>{save++;return true;}});
 assert.equal((await tick()).failed,1);f.advance(60000);assert.equal((await tick()).generated,0);f.advance(300000);assert.equal((await tick()).generated,1);assert.equal(save,1);
});
test('cross-process gate prevents duplicate model calls',async()=>{
 const f=fixture();f.repo.acquireAdvisoryLock=async()=>false;
 const tick=createQualityReasonBackfill({...f,explain:{explain:async()=>assert.fail('must not call')}});
 assert.equal((await tick()).generated,0);
});
test('transaction rejects changed content or flags; successful writes include cloud watermark and audit',async()=>{
 for(const current of [{...row,fingerprint:'changed'},{...row,recommend_home:0},row]){
  const calls=[];const conn={beginTransaction:async()=>{},rollback:async()=>calls.push('rollback'),commit:async()=>calls.push('commit'),release:()=>{},query:async(sql)=>{calls.push(sql);return sql.startsWith('SELECT')?[[current]]:[];}};
  const saved=await saveReason({pool:{getConnection:async()=>conn}},row,'具体推荐理由');
  assert.equal(saved,current===row);
  if(saved){assert(calls.some(s=>s.includes('analyzed_at=NOW()')));assert(calls.some(s=>s.includes('po_audit_events')));assert(!calls.some(s=>s.startsWith('UPDATE')&&s.includes('review_status')));}
  else assert(!calls.some(s=>s.startsWith('UPDATE')));
 }
});
