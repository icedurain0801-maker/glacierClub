const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const id='392183de-041e-4778-9b24-10d6684bf7ad',scope='regionCode=overseas&communityId=8b1f0000000000000000000000100016&platform=bigplayer_h5';
(async()=>{const c=await chromium.launchPersistentContext(path.resolve(__dirname,'../../../../../.temp/baas-sso-20261012/edge-profile'),{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,viewport:{width:1440,height:1000},serviceWorkers:'block'});try{
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`https://club-opinion.q1.com/admin/PublicOpinion/content.html?${scope}&contentId=${id}&contentType=comment&publishedFrom=2026-10-14&publishedTo=2026-10-14`);
 await p.locator('.original-post').waitFor({timeout:60000});
 const original=await p.evaluate(async ({id,scope})=>(await (await fetch(`/api/public-opinion/contents/${id}?${scope}`)).json()),{id,scope});
 const forbidden=await p.evaluate(async id=>(await fetch(`/api/public-opinion/contents/${id}?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5`)).status,id);assert.notEqual(forbidden,200);
 const post=await p.evaluate(async({id,scope})=>(await(await fetch(`/api/public-opinion/contents/${id}?${scope}`)).json()).data,{id:original.data.originalPost.id,scope});assert.equal(post.originalPost,null);
 await p.screenshot({path:path.join(__dirname,'comment-detail-live-viewport.png')});
 let requests=0;
 await p.route(`**/api/public-opinion/contents/${id}?*`,async route=>{
  requests++;const data=structuredClone(original);
  data.data.content.body='Translation refresh fixture';data.data.content.translation={status:requests===1?'pending':'completed',body:requests===1?null:'自动刷新后的中文译文'};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await p.reload();await p.locator('#drawerContent .translation-state').filter({hasText:'中文翻译排队中'}).waitFor({timeout:60000});
 await p.locator('#drawerContent .translation-text').filter({hasText:'自动刷新后的中文译文'}).waitFor({timeout:30000});assert.equal(requests,2);
 // No subsequent refresh after terminal state or closing the drawer.
 await p.locator('#drawerClose').click();await p.waitForTimeout(16000);assert.equal(requests,2);assert.deepEqual(errors,[]);
 const report={forbiddenScopeHttpStatus:forbidden,postHasOriginalPost:post.originalPost,translationRefreshRequests:requests,terminalAndClosedStopPolling:true,businessWrites:false,errors};fs.writeFileSync(path.join(__dirname,'comment-detail-refresh-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await c.close()}})().catch(e=>{console.log(e.name,e.message);process.exitCode=1});
