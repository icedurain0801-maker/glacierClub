const test=require('node:test'),assert=require('node:assert/strict');
const {AiTranslator}=require('../../../server/src/integrations/aiTranslator');
const Detail=require('../../../../admin/PublicOpinion/assets/alert-detail');
const {runOnce}=require('../../../worker/src/translationWorker');
const env={AI_TRANSLATION_ENABLED:'true',AI_TRANSLATION_URL:'https://example.test',AI_TRANSLATION_TOKEN:'fixture',AI_TRANSLATION_MODEL:'fixture'};
test('image-only translation completes without quota or provider calls',async()=>{
 const t=new AiTranslator(env,{reserveCall:()=>{throw Error('must not spend')}});t.callOnce=()=>{throw Error('must not call')};
 for(const body of ['https://img.test/x.png','<img src="https://img.test/x.png">','![image](https://img.test/x.png)']){
  const result=await t.translate({body});assert.equal(result.modelName,'no-translatable-text');assert.equal(result.usage.totalTokens,0);
  assert.equal(Detail.translationMessage({body},{status:'pending'}),'无可翻译文字（图片或视频不进行文字翻译）');
 }
});
test('mixed image and text translates only readable text',()=>{
 const message=new AiTranslator(env).buildMessages({body:'Hello https://img.test/x.png world'});
 assert.equal(JSON.parse(message[1].content).body,'Hello world');
 assert.equal(Detail.hasTranslationText({body:'Hello https://img.test/x.png'}),true);
});
test('translation states describe queue, retry, quota and failure accurately',()=>{
 const item={body:'Hello'};
 for(const [status,message] of Object.entries({pending:'中文翻译排队中',running:'中文翻译生成中',failed:'中文翻译生成失败',retryable:'中文翻译等待重试',not_requested:'暂无中文翻译'}))assert.equal(Detail.translationMessage(item,{status}),message);
 assert.match(Detail.translationMessage(item,{status:'retryable',errorCode:'AI_TRANSLATION_DAILY_LIMIT_REACHED'}),/明日自动继续/);
});
test('batch concurrency is bounded and lease covers all slow requests',async()=>{
 let active=0,maximum=0,claim;const jobs=Array.from({length:8},(_,i)=>({id:String(i),lease_owner:'fixture'}));
 const result=await runOnce({batchSize:8,version:'fixture',translator:{configured:()=>true,timeoutMs:30000,maxRetries:3,translate:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return {translatedBody:'中文'}}},repo:{enqueueMissingTranslations:async()=>{},claimTranslationJobs:async input=>{claim=input;return jobs},completeTranslationJob:async()=>true}});
 assert.equal(maximum,3);assert.equal(result.completed,8);assert.ok(claim.leaseSeconds>=450);
});
