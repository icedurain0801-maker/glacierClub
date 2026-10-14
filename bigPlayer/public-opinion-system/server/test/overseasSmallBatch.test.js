'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createBoundedTransport,providerItems}=require('../../scripts/overseas-real-small-batch');
test('provider array is counted even when array.items is a function',()=>{
  const data=[{id:1},{id:2}];data.items=()=>{};
  assert.equal(providerItems({data}).length,2);assert.equal(providerItems({data:{items:data}}).length,2);
});
test('request budget rejects before network and records attempts sent and explicit blocks',async()=>{
  let sent=0;
  const budget=createBoundedTransport({maxRequests:1,fetchImpl:async()=>{sent++;return new Response('{}',{status:200});}});
  await budget.transport(new URL('https://club-en.q1.com/api/test'));
  await assert.rejects(budget.transport(new URL('https://club-en.q1.com/api/test')),e=>e.code==='OVERSEAS_HTTP_BUDGET_EXCEEDED');
  assert.equal(sent,1);const e=budget.evidence();assert.equal(e.attemptCount,2);assert.equal(e.sentCount,1);assert.equal(e.blockedCount,1);
});
