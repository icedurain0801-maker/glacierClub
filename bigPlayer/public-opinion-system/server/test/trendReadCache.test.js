const test = require('node:test');
const assert = require('node:assert/strict');
const { TrendReadCache } = require('../src/services/trendReadCache');
test('trend cache shares in-flight reads, hits completed data and expires', async () => {
  let time=0,calls=0,finish;
  const cache=new TrendReadCache({ttlMs:100,maxEntries:2,now:()=>time});
  const load=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const one=cache.get('scope-a:7d:day1',load),two=cache.get('scope-a:7d:day1',load);
  await Promise.resolve();assert.equal(calls,1);finish({trend:[1]});
  assert.equal((await one).status,'miss');assert.equal((await two).status,'shared');
  assert.equal((await cache.get('scope-a:7d:day1',()=>{throw Error('must not query');})).status,'hit');
  time=101;
  assert.equal((await cache.get('scope-a:7d:day1',async()=>{calls++;return{trend:[2]};})).data.trend[0],2);
  assert.equal(calls,2);
});
test('trend cache separates scope, range and day; failures are retryable; capacity is bounded', async () => {
  const cache=new TrendReadCache({maxEntries:2});
  for(const key of ['a:7:day1','a:30:day1','b:7:day1','a:7:day2']) assert.equal((await cache.get(key,async()=>key)).data,key);
  assert.equal(cache.entries.size,2);
  await assert.rejects(cache.get('failure',async()=>{throw Error('offline');}),/offline/);
  assert.equal((await cache.get('failure',async()=>42)).data,42);
  assert.equal(cache.entries.size,2);
});
