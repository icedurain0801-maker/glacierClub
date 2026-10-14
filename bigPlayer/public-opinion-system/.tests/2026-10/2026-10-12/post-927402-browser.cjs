'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const out='C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.tests/2026-10/2026-10-12';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),writes=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{if(!['GET','HEAD'].includes(r.request().method())){writes.push(r.request().method());return r.abort();}return r.continue();});
  const q=new URLSearchParams({regionCode:'domestic',communityId:'00000000-0000-0000-0000-000000000101',platform:'bigplayer_h5',contentType:'post',postId:'927402',publishedFrom:'2026-10-11T00:00:00+08:00',publishedTo:'2026-10-12T00:00:00+08:00'});
  const origin='https://lfy3001.dev.q1op.com';
  const r=await page.request.get(origin+'/api/public-opinion/contents?'+q);assert.equal(r.status(),200);const {data}=await r.json();assert.equal(data.length,1);
  const row=data[0],raw=typeof row.raw_payload==='string'?JSON.parse(row.raw_payload):row.raw_payload;
  assert.equal(Number(raw.type),0);assert.equal(row.display_type,'post');
  await page.goto(origin+'/admin/PublicOpinion/content.html?'+q,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#tableContent tbody .type-pill')?.textContent==='帖子');
  assert.equal((await page.locator('#tableContent tbody tr').first().locator('td').nth(1).textContent()).trim(),'927402');
  assert.equal((await page.locator('#tableContent .content-title').textContent()).trim(),row.title.trim());
  await page.screenshot({path:out+'/post-927402-list-live.png',timeout:15000});
  await page.locator('#tableContent [data-content]').click();
  await page.waitForFunction(()=>document.querySelector('#drawerContent h2')?.textContent==='药剂鬼才与吟游诗人' || !!document.querySelector('#drawerContent .detail-block'));
  assert.equal((await page.locator('#drawerContent h2').textContent()).trim(),row.title.trim());
  await page.screenshot({path:out+'/post-927402-detail-live.png',timeout:15000});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const report={status:'PASS',externalId:row.external_id,upstreamType:Number(raw.type),displayType:row.display_type,listLabel:'帖子',detailTitlePreserved:true,errors,writes,url:origin+'/admin/PublicOpinion/content.html?'+q};
  fs.writeFileSync(out+'/post-927402-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
