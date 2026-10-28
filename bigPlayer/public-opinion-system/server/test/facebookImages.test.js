const test = require('node:test');
const assert = require('node:assert/strict');
const { FacebookImageAnalyzer, publicAddress } = require('../src/integrations/facebookImageAnalyzer');
const { imageUrls, mediaHash, evidenceText, facebookWindow } = require('../../shared/facebookMedia');
const { analysisText, assertUrgentValidated } = require('../src/services/urgentValidation');
const { normalizePlatformItem } = require('../../worker/src/worker');
const url = 'https://scontent.fbcdn.net/photo.jpg?token=a';
const env = { AI_ANALYSIS_URL:'https://fixture.invalid/chat/completions', AI_ANALYSIS_TOKEN:'fixture', AI_ANALYSIS_MODEL:'fixture-vision' };
test('Facebook 完整悬浮时间按北京时间解析，拒绝相对时间与无年份猜测',()=>{
 const {parseFacebookTimestamp}=require('../../login-session-service/src/adapters/facebookBrowser');
 assert.equal(parseFacebookTimestamp('Tuesday, October 20, 2026 at 12:30\u202fPM'),'2026-10-20T04:30:00.000Z');
 assert.equal(parseFacebookTimestamp('October 19, 2026 at 12:00 AM'),'2026-10-18T16:00:00.000Z');
 assert.equal(parseFacebookTimestamp('2026年10月20日周二12:30'),'2026-10-20T04:30:00.000Z');
 assert.equal(parseFacebookTimestamp('2026年10月19日星期一 00:00'),'2026-10-18T16:00:00.000Z');
 for(const value of ['4小时','1天','10月20日12:30','2026年2月30日周一12:30','2026年10月20日24:30'])assert.equal(parseFacebookTimestamp(value),null);
 for(const value of ['2h','yesterday','October 20 at 12:30 PM','February 30, 2026 at 1:00 PM'])assert.equal(parseFacebookTimestamp(value),null);
});
test('评论打开本来源真实帖子路径，支持 pfbid、群组与 profile.php',()=>{
 const {facebookPostUrl}=require('../../login-session-service/src/adapters/facebookBrowser');
 assert.equal(facebookPostUrl('https://www.facebook.com/LastLightSurvival','pfbid123'),'https://www.facebook.com/LastLightSurvival/posts/pfbid123');
 assert.equal(facebookPostUrl('https://www.facebook.com/groups/77','123','456'),'https://www.facebook.com/groups/77/posts/123?comment_id=456');
 assert.equal(facebookPostUrl('https://www.facebook.com/profile.php?id=77','123'),'https://www.facebook.com/permalink.php?story_fbid=123&id=77');
 assert.throws(()=>facebookPostUrl('https://www.facebook.com/Test','../other'),{code:'INVALID_INPUT'});
});
const evidence = media => ({version:'facebook-image-v1',status:'complete',mediaHash:mediaHash(media),images:[{url,text:'Error 7391',description:'游戏错误提示'}]});
test('北京时间昨天零点至本轮开始，跨月仍正确',()=>{
 const window=facebookWindow('2026-11-01T01:30:00+08:00');
 assert.equal(window.publishedFrom.toISOString(),'2026-10-30T16:00:00.000Z');
 assert.equal(window.publishedTo.toISOString(),'2026-10-31T17:30:00.000Z');
});
test('图片 URL 只允许官方 HTTPS CDN，签名刷新不改变内容指纹',()=>{
 assert.deepEqual(imageUrls([url,url,'http://scontent.fbcdn.net/a','https://fbcdn.net.evil.test/a','https://user:pass@fbcdn.net/a']),[url]);
 assert.equal(mediaHash([url]),mediaHash([url.replace('token=a','token=b')]));
 assert.notEqual(mediaHash([url]),mediaHash([url.replace('photo','other')]));
});
test('下载拒绝本地、私网、IPv6 映射与保留地址',()=>{
 for(const ip of ['127.0.0.1','10.0.0.2','172.16.0.1','192.168.1.1','100.64.0.1','169.254.1.1','::ffff:127.0.0.1','::1','224.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('157.240.13.14'),true);
});
test('实际发送图片字节给视觉模型，并持久保存独立证据',async()=>{
 let payload;const ai=new FacebookImageAnalyzer(env,{loadImageImpl:async()=>({mime:'image/png',base64:'cGl4ZWxz'}),fetchImpl:async(_,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({text:'Error 7391',description:'游戏错误提示'})}}],usage:{prompt_tokens:5,completion_tokens:3}})}}});
 const result=await ai.analyze({platform:'facebook',media:[url]});
 assert.equal(payload.messages[1].content[1].image_url.url,'data:image/png;base64,cGl4ZWxz');
 assert.equal(result.images[0].text,'Error 7391');assert.equal(result.totalTokens,8);
 assert.equal(result.status,'complete');
});
test('图片失败不产生成功证据，重试重新下载并调用 AI',async()=>{
 let calls=0;const ai=new FacebookImageAnalyzer(env,{loadImageImpl:async()=>{if(++calls===1)throw Object.assign(Error(),{code:'FACEBOOK_IMAGE_TIMEOUT'});return {mime:'image/png',base64:'eA=='}},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{"text":"","description":"可见游戏画面"}'}}]})})});
 await assert.rejects(ai.analyze({platform:'facebook',media:[url]}),{code:'FACEBOOK_IMAGE_TIMEOUT'});
 assert.equal((await ai.analyze({platform:'facebook',media:[url]})).status,'complete');assert.equal(calls,2);
});
test('纯图片也生成分析文本，保留原文且拒绝错配图片证据',()=>{
 const item={contentType:'post',body:'',media:[url]};const raw=evidence(item.media);
 assert.match(analysisText({...item,facebookMediaEvidence:raw}),/Error 7391/);assert.equal(item.body,'');
 assert.equal(evidenceText({...item,media:['https://fbcdn.net/other.jpg']},raw),'');
 assert.throws(()=>assertUrgentValidated({rawAnalysis:{facebookMediaEvidence:raw}},{...item,media:[]}),{code:'FACEBOOK_IMAGE_EVIDENCE_MISMATCH'});
});
test('Worker 标准化保留 Facebook 本条图片且图片变化更新指纹',()=>{
 const raw={externalId:'123',body:'text',publishedAt:'2026-10-20T01:00:00Z',media:[url]};
 const first=normalizePlatformItem(raw,{platform:'facebook',scope:'posts'});
 assert.deepEqual(first.media,[url]);
 const second=normalizePlatformItem({...raw,media:['https://fbcdn.net/other.jpg']},{platform:'facebook',scope:'posts'});
 assert.notEqual(first.fingerprint,second.fingerprint);
});
test('纯图片经过现有初判、独立复核及落库校验，未误走空文字正常分支',async()=>{
 const {fixtureAI,reviewValue}=require('./fixtures/contextualReview');
 const {normalizeAnalysisResult}=require('../src/services/riskSeverityNormalizer');
 const {ai,requests}=fixtureAI({level:'L2',review:input=>reviewValue(input,{level:'L2',hasIssue:true,quote:'游戏错误提示',reason:'本条附图显示游戏错误提示，需要核查具体异常。',sentiment:'neutral',sentimentReason:'图片呈现错误提示，未表达明确情绪。'})});
 ai.imageAnalyzer={analyze:async()=>({...evidence([url]),inputTokens:5,outputTokens:3,totalTokens:8})};
 const item={platform:'facebook',contentType:'post',body:'',media:[url]};
 const result=await ai.analyze(item);
 assert.equal(result.severity,'negative');assert.equal(result.rawAnalysis.facebookMediaEvidence.status,'complete');
 assert.match(requests[0].input.text,/图片文字：Error 7391/);
 assert.match(result.reason,/附图/);assert.equal(normalizeAnalysisResult(result,item).severity,'negative');assert.equal(item.body,'');
});
test('图片失败在批处理内标记单条失败，可重试且不生成正常结果',async()=>{
 const {fixtureAI}=require('./fixtures/contextualReview');const {ai}=fixtureAI();
 ai.imageAnalyzer={analyze:async()=>{throw Object.assign(Error(),{code:'FACEBOOK_IMAGE_TIMEOUT'})}};
 const [result]=await ai.analyzeBatch([{platform:'facebook',body:'',media:[url]}],'light',{settleErrors:true});
 assert.equal(result.analysisError.code,'FACEBOOK_IMAGE_TIMEOUT');assert.equal(result.severity,undefined);assert.equal(ai.cache.size,0);
});
test('图文即使初判正常也独立复核全部图片证据',async()=>{
 const {fixtureAI,reviewValue}=require('./fixtures/contextualReview');
 const {ai,requests}=fixtureAI({level:'L0',review:input=>reviewValue(input,{level:'L0',sentiment:'neutral',quote:'游戏错误提示',reason:'附图只是展示游戏提示，尚无明确异常投诉。',sentimentReason:'本条图片没有表达明确的正负态度。'})});
 ai.imageAnalyzer={analyze:async()=>({...evidence([url]),inputTokens:0,outputTokens:0,totalTokens:0})};
 const result=await ai.analyze({platform:'facebook',contentType:'post',body:'',media:[url]});
 assert.equal(requests.length,0);assert.equal(result.severity,'normal');assert.match(result.reason,/普通游戏讨论|附图/);
});
