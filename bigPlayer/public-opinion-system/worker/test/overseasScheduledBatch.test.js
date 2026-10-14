'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {scheduledParentId,scheduledChildId,scheduledBatchOf,scheduledBatchHash}=require('../src/overseasScheduledBatch');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function fixture() {
  const base={format:'overseas-scheduled-admission-v1',sourceId:id(1),accountId:id(2),gameId:id(3),communityId:id(4),boardId:'100017',manifestSha256:'a'.repeat(64),configSha256:'b'.repeat(64),parentTriggerType:'scheduled',scheduledAt:'2026-10-09T00:00:00.000Z',scheduleVersion:1,windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z'};
  const parentRunId=scheduledParentId(base);
  return {format:'overseas-scheduled-batch-v1',parentWindowStart:base.windowStart,parentWindowEnd:base.windowEnd,
    admissions:[1,2].map(n=>{const siteId=`site-${n}`,siteUrl=`https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=${n}`;return {...base,parentRunId,runId:scheduledChildId(parentRunId,siteId),siteId,siteUrl,siteUrlSha256:crypto.createHash('sha256').update(siteUrl).digest('hex')};})};
}
test('scheduled batch has deterministic closed parent/site identities and order-independent digest',()=>{
  const b=fixture(),v=scheduledBatchOf(b);
  assert.ok(Object.isFrozen(v)&&Object.isFrozen(v.admissions)&&Object.isFrozen(v.admissions[0]));
  assert.equal(scheduledBatchHash(b),scheduledBatchHash({...b,admissions:[...b.admissions].reverse()}));
  assert.notEqual(scheduledBatchHash(b),scheduledBatchHash({...b,admissions:[b.admissions[0]]}));
});
test('cross-source/version/config/parent scopes and invented run ids reject',()=>{
  const b=fixture();
  for(const patch of [{sourceId:id(9)},{accountId:id(9)},{gameId:id(9)},{communityId:id(9)},{boardId:'100018'},{scheduleVersion:2},{configSha256:'c'.repeat(64)},{manifestSha256:'d'.repeat(64)},{parentRunId:id(8)},{runId:id(7)},{parentTriggerType:'scheduled_catchup'}])
    assert.throws(()=>scheduledBatchOf({...b,admissions:[b.admissions[0],{...b.admissions[1],...patch}]}),{code:'OVERSEAS_SCHEDULED_BATCH_INVALID'});
});
test('duplicate sites/URLs, unknown fields and invalid parent/window/slot fail closed',()=>{
  const b=fixture();
  for(const candidate of [{...b,token:'synthetic'},{...b,admissions:[]},{...b,admissions:[b.admissions[0],b.admissions[0]]},{...b,parentWindowEnd:'2026-10-10T00:00:00.000Z'},{...b,parentWindowStart:'2026-09-01T00:00:00.000Z'},{...b,admissions:[{...b.admissions[0],windowStart:'2026-10-07T00:00:00.000Z'}]},{...b,admissions:[{...b.admissions[0],windowEnd:b.parentWindowStart}]}])
    assert.throws(()=>scheduledBatchOf(candidate),{code:'OVERSEAS_SCHEDULED_BATCH_INVALID'});
});
test('scheduled child cursor shape may narrow start but never expand parent scope',()=>{
  const b=fixture(),a={...b.admissions[1],windowStart:'2026-10-08T12:00:00.000Z'};
  assert.equal(scheduledBatchOf({...b,admissions:[b.admissions[0],a]}).admissions[1].windowStart,a.windowStart);
});
