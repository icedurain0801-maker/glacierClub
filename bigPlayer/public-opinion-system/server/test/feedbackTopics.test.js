const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { FeedbackTopics, VERSION, MIN_DISPLAY_COUNT, validEvidence, normalizeLabel, groundedTopic, obviousNoise } = require('../src/services/feedbackTopics');
test('概览保留单条有依据的具体关键词，重复内容不重复计数', () => {
 const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => false } });
 const rows = [{ id:'1', community_id:'c', body:'赛季结算奖励' }, { id:'2', community_id:'c', body:'赛季结算奖励' }, { id:'3', community_id:'c', body:'竞技场第三回合卡死' }];
 const prepared = service.prepare(rows); const t = (text) => ({ text, evidence:text, source:'content' });
 service.cache[prepared[0].key] = { version:VERSION, communityId:'c', topics:[t('赛季结算奖励')] };
 service.cache[prepared[1].key] = { version:VERSION, communityId:'c', topics:[t('赛季结算奖励')] };
 service.cache[prepared[2].key] = { version:VERSION, communityId:'c', topics:[t('竞技场第三回合卡死')] };
 const result = service.read(rows); assert.equal(MIN_DISPLAY_COUNT, 1); assert.deepEqual(result.groups.all.map(item=>item.text), ['赛季结算奖励','竞技场第三回合卡死']);
});
const topic = (text, evidence = text, source = 'content') => ({ text, evidence, source });
test('only unambiguous greetings and nontext are prefiltered, never concrete objects or problems', () => {
 for(const value of ['你好！','👍👍','签到','https://example.test/image.png']) assert.equal(obviousNoise(value),true);
 for(const value of ['签到活动奖励','莉莉丝','登录不了','100','我也遇到了','抽卡运气不错']) assert.equal(obviousNoise(value),false);
});
test('format compatibility still requires evidence literally present in the correct source', () => {
 const item={text:'莉莉丝觉醒材料',context:'试炼100通关',row:{content_type:'comment'}};
 assert.equal(validEvidence(groundedTopic('莉莉丝觉醒材料',item),item),true);
 assert.equal(validEvidence(groundedTopic({text:'觉醒材料',evidence:'莉莉丝觉醒材料'},item),item),true);
 assert.equal(validEvidence(groundedTopic('虚构关键词',item),item),false);
 assert.equal(validEvidence(groundedTopic({text:'试炼100通关',source:'originalPost'},item),item),false);
});
test('incremental semantic extraction counts distinct feedback, translates synonyms, uses parent context and reuses across dates', async () => {
  let calls = 0, inputs;
  const file = path.join(__dirname, '../../.tests/2026-10/2026-10-20/topics-' + process.pid + '.json');
  const translator = { model: 'test', configured: () => true, requireConfigured() {}, async callOnce(messages) {
    calls++; inputs = JSON.parse(messages[1].content);
    return { output_text: JSON.stringify({ items: inputs.items.map(item => ({ id: item.id, topics: /hello/i.test(item.text) ? [] : [item.originalPost ? topic('输出削弱', item.originalPost, 'context') : topic(item.text)] })) }) };
  } };
  const service = new FeedbackTopics({ file, translator });
  const rows = [{ id: 'p', community_id: 'a', body: '输出削弱', sentiment: 'negative' }, { id: 'c', community_id: 'a', body: '我也遇到了', content_type: 'comment', root_content_id: 'p', sentiment: 'negative' }, { id: 'en', community_id: 'a', body: 'damage nerf', sentiment: 'positive' }, { id: 'noise', community_id: 'a', body: 'hello!' }];
  try {
    const initial = service.read([...rows, rows[0]]); assert.equal(initial.status.total, 4); assert.equal(initial.status.pending, true);
    await service.running;
    const result = service.read(rows); assert.equal(result.status.mode, 'semantic'); assert.equal(result.groups.all[0].text, '伤害削弱'); assert.equal(result.groups.all[0].count, 3); assert.equal(result.groups.negative[0].count, 2); assert.equal(result.groups.positive[0].count, 1);
    assert.deepEqual([result.status.completed, result.status.withKeywords, result.status.withoutKeywords, result.status.remaining], [4, 3, 1, 0]);
    assert.equal(inputs.items[1].originalPost, '输出削弱');
    service.read(rows.slice(0, 2)); assert.equal(calls, 1);
    const restored = new FeedbackTopics({ file, translator }); restored.read(rows); assert.equal(calls, 1);
    service.read(rows.map(r => r.id === 'en' ? { ...r, body: 'damage too low' } : r)); await service.running; assert.equal(calls, 2);
    assert.notEqual(normalizeLabel('damage nerf'), normalizeLabel('damage too low'));
  } finally { fs.rmSync(file, { force: true }); }
});
test('invalid responses never cache invented counts or omitted content; failures back off', async () => {
  let calls = 0;
  const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => true, requireConfigured() {}, async callOnce() { calls++; return { output_text: '{"items":[{"id":99,"topics":["掉线"]}]}' }; } } });
  const rows = [{ id: '1', body: '掉线' }, { id: '2', body: '掉线' }];
  service.read(rows); await service.running; const result = service.read(rows);
  assert.equal(result.status.completed, 0); assert.equal(result.status.mode, 'rules'); assert.equal(calls, 1);
});
test('generic AI labels are discarded even from old caches', () => {
  const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => false } });
  const rows = [{ id: '1', body: 'hello' }, { id: '2', body: 'great post' }];
  for (const item of service.prepare(rows)) service.cache[item.key] = { version: VERSION, communityId: item.row.community_id, topics: [topic('问候', item.text)] };
  assert.deepEqual(service.read(rows).groups.all, []);
});
test('out-of-range original post supplies context but never increments feedback counts', async () => {
  const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => false } });
  const rows = [{ id: 'c', community_id: 'a', content_type: 'comment', root_content_id: 'p', body: '我也掉线' }];
  const parents = [{ id: 'p', community_id: 'a', body: '经常掉线' }];
  const prepared = service.prepare(rows, parents);
  assert.equal(prepared.length, 1); assert.equal(prepared[0].context, '经常掉线');
  service.cache[prepared[0].key] = { version: VERSION, communityId: 'a', topics: [topic('掉线问题', '经常掉线', 'context')] };
  assert.equal(service.read(rows, parents).groups.all[0].count, 1);
  assert.equal(validEvidence(topic('掉线问题', '经常掉线', 'context'), { ...prepared[0], text: '赞' }), false);
  assert.equal(validEvidence(topic('掉线问题', '虚构的证据'), prepared[0]), false);
  assert.equal(service.prepare(rows, [{ ...parents[0], community_id: 'other' }])[0].context, '');
});
test('community-isolated adaptive batches cap at 12 and repeated reads never requeue in-flight work', async () => {
  const file = path.join(__dirname, '../../.tests/2026-10/2026-10-20/topics-batches-' + process.pid + '.json');
  let release, first = true; const batches = [];
  const service = new FeedbackTopics({ file, batchDelayMs: 0, translator: { model: 'test', configured: () => true, requireConfigured() {}, async callOnce(messages) {
    const inputs = JSON.parse(messages[1].content).items; batches.push(inputs);
    if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
    return { output_text: JSON.stringify({ items: inputs.map(item => ({ id: item.id, topics: [topic(item.text)] })) }) };
  } } });
  const rows = Array.from({ length: 29 }, (_, i) => ({ id: String(i), community_id: i % 2 ? 'b' : 'a', body: '英雄' + i + '觉醒材料' }));
  try {
    service.read(rows); service.read(rows); release(); await service.running;
    assert.equal(batches.reduce((sum, batch) => sum + batch.length, 0), 29);
    assert.ok(batches.every(batch => batch.length <= 12 && new Set(batch.map(item => item.community)).size === 1));
    assert.equal(service.read(rows).status.completed, 29);
  } finally { fs.rmSync(file, { force: true }); }
});
test('old records cannot mark v3 completed and specific singleton topics remain visible', () => {
  const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => false } });
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: String(i), community_id: 'a', body: '英雄' + i + '觉醒材料' }));
  const prepared = service.prepare(rows);
  service.cache[prepared[0].key] = ['英雄觉醒']; assert.equal(service.read(rows).status.completed, 0);
  for (const item of prepared.slice(0, 30)) service.cache[item.key] = { version: VERSION, communityId: 'a', topics: [topic(item.text)] };
  const partial = service.read(rows); assert.equal(partial.status.mode, 'semantic-partial'); assert.equal(partial.status.remaining, 30); assert.equal(partial.groups.all.length,30);
  for (const item of prepared) service.cache[item.key] = { version: VERSION, communityId: 'a', topics: [topic(item.text)] };
  assert.equal(service.read(rows).groups.all.length, 60);
});
test('fabricated evidence rejects the affected content and retries back off', async () => {
  let calls = 0;
  const service = new FeedbackTopics({ file: 'NUL', translator: { model: 'test', configured: () => true, requireConfigured() {}, async callOnce() {
    calls++; return { output_text: JSON.stringify({ items: [{ id: 0, topics: [topic('觉醒材料', '原文没有这个片段')] }] }) };
  } } });
  const rows = [{ id: 'x', body: '莉莉丝觉醒材料' }]; service.read(rows); await service.running;
  assert.equal(service.read(rows).status.completed, 0); assert.equal(calls, 1); assert.equal(service.inFlight.size, 0);
});
test('invalid evidence on one row does not discard other valid rows in the batch', async () => {
  const file = path.join(__dirname, '../../.tests/2026-10/2026-10-20/topics-partial-' + process.pid + '.json');
  const service = new FeedbackTopics({ file, translator: { model: 'test', configured: () => true, requireConfigured() {}, async callOnce() {
    return { output_text: JSON.stringify({ items: [{ id: 0, topics: [topic('觉醒材料', '虚构证据')] }, { id: 1, topics: [topic('莉莉丝觉醒材料')] }] }) };
  } } });
  try {
    service.read([{ id:'bad',body:'掉线' }, { id:'good',body:'莉莉丝觉醒材料' }]); await service.running;
    const result=service.read([{ id:'bad',body:'掉线' }, { id:'good',body:'莉莉丝觉醒材料' }]);
    assert.equal(result.status.completed,1); assert.equal(result.status.withKeywords,1);
    assert.equal(result.status.errorCode,'INVALID_TOPIC_EVIDENCE_NOT_FOUND');
  } finally { fs.rmSync(file,{force:true}); }
});
test('missing IDs preserve returned rows and retry automatically without a page refresh', async () => {
 const file=path.join(__dirname,'../../.tests/2026-10/2026-10-20/topics-retry-'+process.pid+'.json');let calls=0;
 const service=new FeedbackTopics({file,retryMs:5,repairRetryMs:[5],batchDelayMs:0,translator:{model:'test',configured:()=>true,requireConfigured(){},async callOnce(messages){
  calls++;const inputs=JSON.parse(messages[1].content).items;
  return {output_text:JSON.stringify({items:inputs.filter((_,i)=>calls>1||i===0).map(item=>({id:item.id,topics:[topic(item.text)]}))})};
 }}});
 const rows=[{id:'1',body:'莉莉丝觉醒材料'},{id:'2',body:'试炼100通关'}];
 try{service.read(rows);await service.running;assert.equal(Object.keys(service.cache).length,1);
  await new Promise(resolve=>setTimeout(resolve,30));if(service.running)await service.running;
  assert.equal(Object.keys(service.cache).length,2);assert.equal(calls,2);assert.equal(service.read(rows).status.remaining,0);
 }finally{if(service.retryTimer)clearTimeout(service.retryTimer);fs.rmSync(file,{force:true});}
});


test('泛赞泛词被过滤，具体对象和负向语义仍保留并按内容去重', () => {
 const service=new FeedbackTopics({file:'NUL',translator:{model:'test',configured:()=>false}});
 const rows=[{id:'1',body:'厉害 很好 坚持 正常 材料 酒馆收益偏低 没有红抽 没拿到红抽',community_id:'a'},{id:'2',body:'红抽 英雄合成条件',community_id:'a'}];
 for(const item of service.prepare(rows))service.cache[item.key]={version:VERSION,communityId:'a',topics:item.text.split(' ').map(t=>topic(t))};
 // Model payload and cache contract cap a content to eight topics.
 const first=service.prepare(rows)[0];service.cache[first.key].topics=service.cache[first.key].topics.filter(t=>t.text!=='材料');
 const groups=service.read(rows).groups.all;
 assert.deepEqual(new Set(groups.map(t=>t.text)),new Set(['酒馆收益偏低','未获得红抽','红抽','英雄合成条件']));
 assert.equal(groups.find(t=>t.text==='未获得红抽').count,1);
 assert.notEqual(normalizeLabel('红抽'),normalizeLabel('没有红抽'));
});
test('具体词扩容至80，超过上限稳定截断且反馈ID精确',()=>{
 const service=new FeedbackTopics({file:'NUL',translator:{model:'test',configured:()=>false}});
 const rows=Array.from({length:90},(_,i)=>({id:String(i),body:'英雄'+i+'觉醒材料',community_id:'a'}));
 for(const item of service.prepare(rows))service.cache[item.key]={version:VERSION,communityId:'a',topics:[topic(item.text)]};
 const output=service.read(rows);assert.equal(output.groups.all.length,80);assert(output.groups.all.every(t=>t.count===1&&t.feedbackIds.length===1));assert.equal(output.status.completed,90);
});
