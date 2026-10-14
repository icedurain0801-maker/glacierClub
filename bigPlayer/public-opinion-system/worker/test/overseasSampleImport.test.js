'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { importSample, prepareSample, deterministicRunId } = require('../src/overseasSampleImport');
function sample() {
  return { sourceId: '081a16d2-5545-4afd-9c65-e04777e4540b', sites: ['a','b','c'].map(siteId => ({ siteId,
    items: Array.from({length:20}, (_,i) => ({ externalId: String(i+1), boardId:'100017', contentType:'post',
      title:'fixture', body:'body '+i, sourceUrl:'https://club-en.q1.com/', rawPayload:{_contentIntegrity:{status:'detail_enriched'}} })) })) };
}
test('three site observations preserve one content identity without discarding observations', () => {
  const result = prepareSample({items:sample(),artifactSha:'a'.repeat(64)});
  assert.equal(result.size,20); assert.ok([...result.values()].every(xs=>xs.length===3));
  assert.notEqual(deterministicRunId('a'.repeat(64),'a'),deterministicRunId('a'.repeat(64),'b'));
});
test('conflicting bodies and boards, duplicate sites and missing observations reject before DB', () => {
  for (const mutate of [s=>{s.sites[1].items[0].body='changed';},s=>{s.sites[0].items[0].boardId='42';},
    s=>{s.sites[1].siteId='a';},s=>{s.sites[0].items.pop();}]) {
    const items=sample();mutate(items);assert.throws(()=>prepareSample({items,artifactSha:'a'.repeat(64)}));
  }
});
test('failed rollback destroys connection and performs no cleanup SQL or pool release', async () => {
  const calls=[], original=Object.assign(new Error('read failed'),{code:'READ_FAILED'});
  const conn={query:async sql=>{calls.push(sql);if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
    if(sql.startsWith('SET SESSION'))return [{}];throw original;},beginTransaction:async()=>calls.push('begin'),
    rollback:async()=>{calls.push('rollback');throw Error('rollback transport failed');},destroy:()=>calls.push('destroy'),release:()=>calls.push('release')};
  await assert.rejects(importSample({repo:{pool:{getConnection:async()=>conn}},items:sample(),artifactSha:'a'.repeat(64),analysisVersion:'v1',translationVersion:'v1'}), e=>e===original&&e.rollbackUnknown);
  assert.equal(calls.at(-1),'destroy');assert.ok(!calls.includes('release'));assert.ok(!calls.some(s=>s.includes('RELEASE_LOCK')));
});
