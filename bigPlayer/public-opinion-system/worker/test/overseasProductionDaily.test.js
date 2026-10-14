'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dailySlot, collectSite } = require('../src/overseasProductionDaily');
test('Beijing 02 slot spans one day and remains yesterday before 02',()=>{
  assert.equal(dailySlot(new Date('2026-10-09T17:59:00Z')).scheduledAt,'2026-10-08T18:00:00.000Z');
  const slot=dailySlot(new Date('2026-10-09T18:00:00Z'));
  assert.equal(slot.windowEnd,'2026-10-09T16:00:00.000Z');
  assert.equal(+new Date(slot.windowEnd)-+new Date(slot.windowStart),86400000);
});
test('a restarted collector resumes the committed cursor and skips a finished site',async()=>{
  const cursors=[],saved=[],child={site:{site_id:'site-2'},run:{id:'run-2'},receipt:{cursor:null,pages:0,done:false}};
  let failSecond=true;
  const connector={discoverFeeds:async()=>[{endpointKind:'merged',boardId:'100017'}],listFeedContents:async input=>{
    cursors.push(input.cursor);
    if(input.cursor==='page-2'&&failSecond)throw Object.assign(new Error('provider failure'),{code:'PROVIDER_FAILED'});
    return {items:[],hasMore:input.cursor==null,nextCursor:input.cursor==null?'page-2':null};
  }};
  const options={connector,child,scoped:{},account:{},intent:dailySlot(),check:async()=>{},commit:async page=>{
    const receipt={...child.receipt,cursor:page.nextCursor,pages:child.receipt.pages+1,done:!page.hasMore};saved.push(receipt);return {receipt};
  }};
  await assert.rejects(collectSite(options),{code:'PROVIDER_FAILED'});
  assert.equal(saved.length,1);
  // The durable receipt, rather than a new empty cursor, is used on restart.
  child.receipt=structuredClone(saved[0]);failSecond=false;
  assert.equal((await collectSite(options)).status,'completed');
  assert.deepEqual(cursors,[null,'page-2','page-2']);
  assert.equal((await collectSite(options)).pages,0);
  assert.equal(cursors.length,3);
});
