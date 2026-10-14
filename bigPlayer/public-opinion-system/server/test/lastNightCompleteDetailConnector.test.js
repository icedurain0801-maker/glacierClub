'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {LastNightCompleteDetailConnector}=require('../src/connectors/lastNightCompleteDetailConnector');
const siteId='site-3bb48be7f9a82185d6a045e9a5cbd3d7';
test('real Connector independent adapter accepts opaque detail without treating it as body text',async()=>{
 const details={id:'p',content:[{type:5,data:'opaque string'}]};let requests=0;
 const connector=new LastNightCompleteDetailConnector({},{fetchImpl:async url=>{requests++;const isDetail=new URL(url).pathname.endsWith('/post/');return{ok:true,status:200,url:String(url),json:async()=>isDetail?{code:0,data:details}:{code:0,data:{items:[{id:'p',title:'Actual provider title',createTime:'2026-10-08T00:00:00Z',content:[{type:0,data:'summary must not survive'}]}],hasMore:false,total:1}}};},credentialContext:{loadApiToken:async()=>({apiToken:'fixture'})}});
 const source={siteId,config:{boardId:'100017',baseUrl:'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=16'}};
 const page=await connector.listFeedContents({source,account:{id:'a'},feed:{boardId:'100017',feedKey:'100017:home:merged::0:::',pageKind:'home',endpointKind:'merged',sectionId:'0'},limit:20,dailyBounded:true,publishedFrom:'2026-10-02T03:07:34.810Z',publishedTo:'2026-10-09T03:07:34.810Z'});
 assert.equal(requests,2);assert.equal(page.items[0].body,'');assert.equal(page.items[0].title,'Actual provider title');
 assert.deepEqual(page.items[0].rawPayload._lastNightProviderDetail,details);assert.equal(page.items[0].rawPayload._lastNightAnalysisBasis.opaqueAnalyzed,false);
 assert.equal(page.items[0].rawPayload._contentIntegrity.basis,'validated-provider-nontext-envelope');
 assert.match(page.items[0].rawPayload._lastNightProviderDetailSha256,/^[a-f0-9]{64}$/);
});
