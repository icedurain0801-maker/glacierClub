const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { FeedbackTopics, VERSION } = require('../src/services/feedbackTopics');
let serial = 0;
function create(options = {}) {
 const file = path.join(__dirname, '../../.tests/2026-10/2026-10-20/throughput-' + process.pid + '-' + (++serial) + '.json');
 const service = new FeedbackTopics({ file, batchDelayMs: 0, ...options });
 return { service, file, cleanup() { clearTimeout(service.retryTimer); fs.rmSync(file, {force:true}); } };
}
const rows = (n, community = 'a') => Array.from({length:n},(_,i)=>({id:community+i,community_id:community,body:'莉莉丝觉醒材料'+i}));
const answer = items => ({output_text:JSON.stringify({items:items.map(item=>({id:item.id,topics:[{text:item.text.slice(0,40),evidence:item.text.slice(0,40),source:'content'}]}))})});
const translator = call => ({model:'test',configured:()=>true,requireConfigured(){},callOnce:call});
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
test('two controlled lanes rotate communities, deduplicate in-flight reads and never lose concurrent cache writes',async()=>{
 let active=0,max=0;const batches=[];
 const c=create({translator:translator(async messages=>{
  const items=JSON.parse(messages[1].content).items;batches.push(items);active++;max=Math.max(max,active);
  await sleep(items[0].community==='a'?15:5);active--;return answer(items);
 })});
 try{const data=[...rows(25,'a'),...rows(13,'b'),...rows(8,'c')];
  c.service.read(data);c.service.read(data);await c.service.running;
  assert.equal(max,2);assert.equal(batches[0][0].community,'a');assert.equal(batches[1][0].community,'b');
  assert.ok(batches.every(x=>x.length<=12&&new Set(x.map(i=>i.community)).size===1));
  assert.equal(batches.reduce((n,b)=>n+b.length,0),46);
  assert.equal(c.service.read(data).status.completed,46);assert.equal(Object.keys(JSON.parse(fs.readFileSync(c.file))).length,46);
  const restored=create({file:c.file,translator:translator(()=>{throw Error('must reuse cache');})});
  assert.equal(restored.service.read(data).status.completed,46);assert.equal(restored.service.running,null);
 }finally{c.cleanup();}
});
test('adaptive batch bounds keep long text small and repairs single-row',()=>{
 const c=create({translator:{model:'test',configured:()=>false}});
 try{const data=[...rows(15),...rows(4,'b').map(r=>({...r,body:'莉莉丝'.repeat(700)}))];
  for(const item of c.service.prepare(data))c.service.queue.set(item.key,item);
  assert.equal(c.service.takeBatch().length,12);
  const long=c.service.takeBatch();assert.equal(long[0].row.community_id,'b');assert.ok(long.length<=2);assert.ok(long.reduce((n,item)=>n+item.text.length+item.context.length,0)<=6000);
  for(const item of c.service.queue.values())c.service.repairKeys.add(item.key);
  assert.equal(c.service.takeBatch().length,1);
 }finally{c.cleanup();}
});
test('format/grounding retries are single-row and can run while an unrelated lane is still pending',async()=>{
 let releaseSlow;let repaired=false;const seen=[];
 const c=create({repairRetryMs:[5],translator:translator(async messages=>{
  const items=JSON.parse(messages[1].content).items;seen.push(items);
  if(items[0].community==='b'){await new Promise(resolve=>{releaseSlow=resolve;});return answer(items);}
  if(!seen.some((x,i)=>i<seen.length-1&&x[0].community==='a'))return {output_text:'invalid json'};
  repaired=true;assert.equal(items.length,1);return answer(items);
 })});
 try{c.service.read([...rows(1,'a'),...rows(1,'b'),...rows(20,'c')]);
  for(let i=0;i<30&&!repaired;i++)await sleep(5);
  assert.equal(repaired,true);assert.ok(c.service.running);releaseSlow();await c.service.running;
  assert.equal(c.service.stats.maxActive,2);assert.equal(c.service.stats.active,0);
 }finally{releaseSlow?.();c.cleanup();}
});
test('global 429 stops new work on both lanes while preserving successful in-flight result',async()=>{
 let calls=0;const c=create({retryMs:10000,translator:translator(async messages=>{
  calls++;const items=JSON.parse(messages[1].content).items;
  if(items[0].community==='a'){await sleep(5);throw Object.assign(Error('limit'),{code:'AI_TRANSLATION_HTTP_429'});}
  await sleep(15);return answer(items);
 })});
 try{const data=[...rows(25,'a'),...rows(25,'b')];c.service.read(data);await c.service.running;
  assert.equal(calls,2);assert.equal(c.service.stats.active,0);assert.ok(c.service.cooldownUntil>Date.now());
  c.service.read(rows(5,'new'));await sleep(10);assert.equal(calls,2);
  assert.equal(Object.values(c.service.cache).length,12);assert.ok(c.service.retries.size>0);
 }finally{c.cleanup();}
});
test('generic unsupported phrases are discarded without model repair and evidence boundary remains intact',async()=>{
 const c=create({translator:translator(async()=>({output_text:JSON.stringify({items:[{id:0,topics:[{text:'每个人',evidence:'每个人',source:'content'},{text:'收集好了吧',evidence:'收集好了吧',source:'content'}]}]})}))});
 try{c.service.read([{id:'1',body:'每个人都收集好了吧'}]);await c.service.running;
  assert.equal(c.service.read([{id:'1',body:'每个人都收集好了吧'}]).status.withKeywords,0);assert.equal(c.service.retries.size,0);
 }finally{c.cleanup();}
});
