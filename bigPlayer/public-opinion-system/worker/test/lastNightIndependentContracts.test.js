'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeIndependentPost,assertHistoricalReplacement}=require('../src/lastNightIndependentContent');
const {legacyDailyIntent}=require('../src/lastNightLegacyDailyContract');
const {SOURCE_ID}=require('../src/lastNightScope');
test('independent normalization retains genuine incoming board/detail; rejects unknown/fallback',()=>{
  const item={externalId:'1',contentType:'post',boardId:'100017',title:'title',body:'full',sourceUrl:'https://club-en.q1.com/',rawPayload:{boardId:100017,type:0,_contentIntegrity:{status:'detail_enriched'}}};
  const result=normalizeIndependentPost(item,{boardId:'100017'});assert.equal(result.rawPayload._contentIntegrity.status,'detail_enriched');assert.equal(String(result.rawPayload.boardId),'100017');
  for(const rawPayload of [{type:0},{boardId:100017,_contentIntegrity:{status:'summary_fallback'}},{boardId:999,_contentIntegrity:{status:'detail_enriched'}}])assert.throws(()=>normalizeIndependentPost({...item,rawPayload},{boardId:'100017'}));
  assert.throws(()=>assertHistoricalReplacement({id:'x',external_id:'1',fingerprint:'f'},{id:'x',externalId:'1',fingerprint:'f',allowUnknownReplacement:true}),/PROTECTED_JOURNAL/);
});
test('legacy daily uses fixed prior Shanghai natural day even late; 6h owner and timezone drift reject',()=>{
  const input={sourceId:SOURCE_ID,scheduledAt:'2026-10-10T02:00:00+08:00',now:'2026-10-10T03:00:00+08:00',frequencySeconds:86400,expectedScheduleVersion:1,scheduleVersion:1};
  const intent=legacyDailyIntent(input);assert.equal(intent.scheduledAt,'2026-10-09T18:00:00.000Z');assert.equal(intent.windowStart,'2026-10-08T16:00:00.000Z');assert.equal(intent.windowEnd,'2026-10-09T16:00:00.000Z');assert.equal(intent.nextSlotAt,'2026-10-10T18:00:00.000Z');assert.ok(!intent.requiredRunColumns.includes('board_id'));
  for(const overrides of [{frequencySeconds:21600},{scheduledAt:'2026-10-10T02:00:00Z'},{scheduledAt:'2026-10-10 02:00:00'},{scheduleVersion:2},{now:'2026-10-09T00:00:00Z'}])assert.throws(()=>legacyDailyIntent({...input,...overrides}));
});
