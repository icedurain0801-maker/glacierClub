const test=require('node:test'),assert=require('node:assert/strict');
const {TranslationCache}=require('../../../worker/src/translationCache');
const {runContinuousLoop,runOnce}=require('../../../worker/src/translationWorker');
const {AiTranslator}=require('../../../server/src/integrations/aiTranslator');
const {Repository}=require('../../../server/src/db/repository');
const Detail=require('../../../../admin/PublicOpinion/assets/alert-detail');
const env={AI_TRANSLATION_ENABLED:'true',AI_TRANSLATION_URL:'https://example.test',AI_TRANSLATION_TOKEN:'fixture',AI_TRANSLATION_MODEL:'fixture'};
test('emoji-only skips provider while multilingual text remains translatable',async()=>{
 const t=new AiTranslator(env);t.callOnce=()=>{throw Error('must not call')};
 for(const body of ['😀😃','!!!','❤️ 🎉 https://img.test/x.png']){assert.equal((await t.translate({body})).modelName,'no-translatable-text');assert.equal(Detail.hasTranslationText({body}),false);}
 for(const body of ['Hello 😀','안녕하세요','こんにちは','中文'])assert.equal(Detail.hasTranslationText({body}),true);
});
test('cache deduplicates concurrent inputs and reused usage is zero',async()=>{
 const cache=new TranslationCache();let calls=0;
 const t=new AiTranslator(env);t.translate=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return {translatedBody:'你好',usage:{totalTokens:4}}};
 const job={source_id:'s',community_id:'c',body:'Hello',translation_version:'v',target_language:'zh-CN'};
 const [first,second]=await Promise.all([cache.translate(t,job),cache.translate(t,{...job,id:'other'})]);
 assert.equal(calls,1);assert.equal(first.usage.totalTokens,4);assert.equal(second.usage.totalTokens,0);assert.equal(second.reused,true);
 assert.equal((await cache.translate(t,job)).reused,true);assert.equal(calls,1);
 for(const patch of [{community_id:'other'},{source_id:'other'},{body:'Other'},{translation_version:'v2'},{target_language:'ko-KR'}])await cache.translate(t,{...job,...patch});
 assert.equal(calls,6);
});
test('cache failures are retried and LRU storage is bounded',async()=>{
 const cache=new TranslationCache({limit:2}),t=new AiTranslator(env);let calls=0;
 t.translate=async()=>{if(++calls===1)throw Error('temporary');return {translatedBody:'中文',usage:{}}};
 await assert.rejects(cache.translate(t,{body:'a'}));await cache.translate(t,{body:'a'});assert.equal(calls,2);
 await cache.translate(t,{body:'b'});await cache.translate(t,{body:'c'});assert.equal(cache.completed.size,2);assert.equal(cache.inflight.size,0);
 await cache.translate(t,{body:'a'});assert.equal(calls,5);
});
test('continuous lanes fill a free slot without waiting for slow lane and never scan every job',async()=>{
 const stop=new AbortController();let next=0,releaseSlow,started=0,active=0,maxActive=0,repairs=0;const order=[];
 const slow=new Promise(resolve=>{releaseSlow=resolve});
 const deps={concurrency:2,version:'v',backfillBatchSize:100,translator:{configured:()=>true,dailyCallLimit:100,translate:async job=>{active++;maxActive=Math.max(maxActive,active);order.push(job.id);if(job.id==='0')await slow;active--;return {translatedBody:'中文'}}},repo:{enqueueMissingTranslations:async()=>{repairs++},claimTranslationJobs:async input=>{assert.equal(input.limit,1);if(next>=4)return [];started++;return [{id:String(next++),lease_owner:'owner'}]},completeTranslationJob:async()=>{if(started>=4){stop.abort();releaseSlow()}return true}}};
 const wait=async(ms,signal)=>{if(ms>=60000)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));else await new Promise(resolve=>setTimeout(resolve,1));};
 await runContinuousLoop(deps,{signal:stop.signal,sleepFn:wait});
 assert.deepEqual(order,['0','1','2','3']);assert.equal(maxActive,2);assert.equal(repairs,0);
});
test('periodic repair is independent and latest priority leaves a share for old jobs',async()=>{
 const stop=new AbortController(),orders=[];let repairs=0;
 const deps={concurrency:1,version:'v',backfillBatchSize:100,translator:{configured:()=>true,translate:async()=>({translatedBody:'中文'})},repo:{enqueueMissingTranslations:async()=>{repairs++;return 0},claimTranslationJobs:async input=>{orders.push(input.newestFirst);return [{id:String(orders.length),lease_owner:'owner'}]},completeTranslationJob:async()=>{if(orders.length===6)stop.abort();return true}}};
 let maintenance=0;const wait=async(ms,signal)=>{if(ms>=60000&&++maintenance>1&&!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));};
 await runContinuousLoop(deps,{signal:stop.signal,sleepFn:wait});
 assert.deepEqual(orders,[true,true,true,true,false,true]);assert.equal(repairs,1);
});
test('single-slot claim skips repair and covers its provider lease',async()=>{
 let input;
 await runOnce({batchSize:20,translator:{configured:()=>true,timeoutMs:30000,maxRetries:3},repo:{claimTranslationJobs:async x=>{input=x;return []},enqueueMissingTranslations:async()=>{throw Error('must not scan')}}},{skipBackfill:true,limit:1,newestFirst:true});
 assert.equal(input.limit,1);assert.equal(input.newestFirst,true);assert.ok(input.leaseSeconds>=300);
});
test('queue ordering is whitelisted and stale fingerprints/held jobs are excluded',async()=>{
 const r=new Repository({DB_HOST:'127.0.0.1',DB_NAME:'never_connect'});const calls=[];r.query=async(sql,params)=>{calls.push(sql);return []};
 try{await r.claimTranslationJobs({leaseOwner:'fixture',newestFirst:true});assert.match(calls[0],/ORDER BY j.created_at DESC/);assert.match(calls[0],/j.content_fingerprint=c.fingerprint/);assert.match(calls[0],/OVERSEAS_BOUNDED_VERIFICATION_HOLD/);
 calls.length=0;await r.claimTranslationJobs({leaseOwner:'fixture'});assert.match(calls[0],/ORDER BY j.created_at ASC/);
 calls.length=0;await r.enqueueMissingTranslations();assert.match(calls[0],/OVERSEAS_BOUNDED_VERIFICATION_HOLD/);
 }finally{await r.pool.end()}
});
