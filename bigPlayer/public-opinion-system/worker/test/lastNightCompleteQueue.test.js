'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertCompleteQueue,observeExactAnalysis}=require('../src/lastNightProtectedStore');
const after=[{change:'inserted',content:{id:'fixture-a',fingerprint:'fp-a'}},{change:'changed',content:{id:'fixture-b',fingerprint:'fp-b'}},{change:'unchanged',content:{id:'fixture-c',fingerprint:'fp-c'}}];
const queued=[{contentId:'fixture-a',jobId:'job-a',fingerprint:'fp-a'},{contentId:'fixture-b',jobId:'job-b',fingerprint:'fp-b'}];
const evidence={phase:'queue_result',version:'fixture-v1',after,queue:{status:'EXACT_AI_QUEUED',remaining:[],queued}};
test('exact changed universe required; subset/duplicates/missing/extra/fingerprint mismatch all reject before analysis SQL',async()=>{
  assertCompleteQueue(evidence);
  const mutations=[
    {...evidence,phase:'committed'},
    {...evidence,queue:{...evidence.queue,status:'STORE_COMMITTED_QUEUE_INCOMPLETE'}},
    {...evidence,queue:{...evidence.queue,remaining:[{id:'fixture-b'}]}},
    {...evidence,queue:{...evidence.queue,queued:queued.slice(0,1)}},
    {...evidence,queue:{...evidence.queue,queued:[queued[0],queued[0]]}},
    {...evidence,queue:{...evidence.queue,queued:[queued[0],{...queued[1],jobId:'job-a'}]}},
    {...evidence,queue:{...evidence.queue,queued:[queued[0],{...queued[1],contentId:'fixture-extra'}]}},
    {...evidence,queue:{...evidence.queue,queued:[queued[0],{...queued[1],fingerprint:'wrong'}]}},
    {...evidence,after:[after[0],after[0],after[2]]}
  ];
  for(const invalid of mutations)assert.throws(()=>assertCompleteQueue(invalid),/AI_QUEUE_INCOMPLETE/);
  let queries=0;
  await assert.rejects(observeExactAnalysis({repo:{query:async()=>{queries++;return[];}},queue:{...evidence.queue,queued:queued.slice(0,1)},after,version:evidence.version}),/AI_QUEUE_INCOMPLETE/);
  assert.equal(queries,0);
});
