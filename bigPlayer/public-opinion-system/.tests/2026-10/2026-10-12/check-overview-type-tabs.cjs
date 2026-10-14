'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const workspace=process.env.TEST_ASSET_ROOT||'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/admin/PublicOpinion';
const live=process.argv.includes('--live');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],requests=[],responses=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(!live)await page.route('**/admin/PublicOpinion/**',r=>{const relative=new URL(r.request().url()).pathname.split('/admin/PublicOpinion/')[1];const file=path.join(workspace,relative);if(fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});return r.continue();});
 page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/public-opinion/contents'){try{responses.push({url:r.url(),status:r.status(),data:(await r.json()).data});}catch{}}});
 await page.route('**/api/**',r=>{if(!['GET','HEAD'].includes(r.request().method())){writes.push(r.request().method());return r.abort();}if(new URL(r.request().url()).pathname==='/api/public-opinion/contents')requests.push(new URL(r.request().url()));return r.continue();});
 await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&period=yesterday',{waitUntil:'networkidle'});
 const tab=(mode,type)=>page.locator(`[data-hot-mode="${mode}"][data-hot-type="${type}"]`);
 for(const mode of ['negative','attention']){assert.equal(await tab(mode,'post').getAttribute('aria-selected'),'true');}
 await page.waitForFunction(()=>['#hotList','#attentionList'].every(s=>!document.querySelector(s).textContent.includes('加载中')));
 for(const mode of ['negative','attention']){
   await tab(mode,'comment').click();
   await page.waitForFunction(selector=>document.querySelector(selector).querySelectorAll('.hot-row').length>0 && [...document.querySelector(selector).querySelectorAll('.severity')].every(el=>el.textContent==='评论'),mode==='negative'?'#hotList':'#attentionList');
   assert.equal(await tab(mode,'comment').getAttribute('aria-selected'),'true');
   const selector=mode==='negative'?'#hotList':'#attentionList';
   const pills=await page.locator(selector+' .severity').allTextContents();assert(pills.every(p=>p==='评论'));
   const link=new URL(await page.locator(mode==='negative'?'#viewAllNegative':'#viewAllAttention').getAttribute('href'),'https://lfy3001.dev.q1op.com/admin/PublicOpinion/');assert.equal(link.searchParams.get('contentType'),'comment');assert.equal(link.searchParams.get('riskMode'),mode);assert(link.searchParams.get('publishedFrom'));
   if(mode==='negative')assert.equal(await tab('attention','post').getAttribute('aria-selected'),'true');
 }
 // Rapid switching must finish on the newest selection.
 await tab('negative','post').click();await tab('negative','comment').click();await tab('negative','post').click();await page.waitForFunction(()=>document.querySelectorAll('#hotList .hot-row').length>0 && [...document.querySelectorAll('#hotList .severity')].every(el=>['帖子','动态'].includes(el.textContent)));assert.equal(await tab('negative','post').getAttribute('aria-selected'),'true');assert((await page.locator('#hotList .severity').allTextContents()).every(p=>['帖子','动态'].includes(p)));
 await page.locator('.overview-two-equal').screenshot({path:__dirname+'/overview-type-tabs-'+(live?'live':'candidate')+'.png'});
 const href=await page.locator('#viewAllAttention').getAttribute('href');await page.goto(new URL(href,page.url()).href,{waitUntil:'networkidle'});
 const last=requests.filter(u=>u.searchParams.get('riskMode')==='attention').at(-1);assert.equal(last.searchParams.get('contentType'),'comment');assert((await page.locator('#resultHint').textContent()).includes('评论'));
 await page.locator('#tableContent tbody tr').first().waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 assert(responses.length>=5);
 for(const r of responses){assert.equal(r.status,200);const q=new URL(r.url).searchParams;assert(Array.isArray(r.data));assert(r.data.every(item=>item.content_type===q.get('contentType')));}
 const report={status:'PASS',live,checks:['default posts','independent tabs','server filters before pagination','rapid switches','all-content link preserves type/date/scope','content page preserves type','no mutations'],responses:responses.map(r=>({query:new URL(r.url).search,rowCount:r.data.length,status:r.status})),errors,writes};fs.writeFileSync(__dirname+'/overview-type-tabs-'+(live?'live':'candidate')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
