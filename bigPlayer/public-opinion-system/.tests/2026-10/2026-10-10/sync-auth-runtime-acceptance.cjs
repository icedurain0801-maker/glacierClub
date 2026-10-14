'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../../../../.temp/sync-auth-persistence-fix-20261010');
const origin='https://lfy3001.dev.q1op.com',sourceId='a11c81b6-e4c4-4342-a3b1-17035cffe1b5';
const query='?regionCode=domestic&communityId=8b1f0000000000000000000000000022&platform=bigplayer_h5';
const expected=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,'frontend-release/public/admin/PublicOpinion/assets/sources.js'))).digest('hex');
const reportFile=path.join(output,'runtime-acceptance.json');
function write(report){fs.writeFileSync(reportFile,JSON.stringify(report,null,2));}
function safeRun(run){return {id:run.id,status:run.status,errorCode:run.error_code||null,discovered:run.discovered_count,fetched:run.fetched_count,stored:run.stored_count,inserted:run.inserted_count,comments:run.comment_count,startedAt:run.started_at,finishedAt:run.finished_at};}
(async()=>{
 assert(process.argv.includes('--approved-one-sync'),'Requires user approval for release, saved authorization and one real sync with normal processing');
 const report={status:'running',layers:[],sourceId};write(report);
 for(const layer of ['http://127.0.0.1:3001','http://172.16.2.48:3001',origin]){
  const url=layer+'/admin/PublicOpinion/sources.html'+query,r=await fetch(url);assert.equal(r.status,200);const html=await r.text();assert(html.includes('sources.js?v=214'));
  let resources=0;for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)){assert.equal((await fetch(new URL(match[1],url))).status,200);resources++;}
  const js=await fetch(layer+'/admin/PublicOpinion/assets/sources.js?v=214');assert.equal(crypto.createHash('sha256').update(await js.text()).digest('hex'),expected);
  report.layers.push({origin:layer,status:200,resources,hashMatches:true});write(report);
 }
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const errors=[],failed=[],warnings=[],blocked=[];let authCount=0,syncCount=0;
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(new URL(r.url()).pathname));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.type());});
  await page.route('**/api/**',route=>{
   const r=route.request(),p=new URL(r.url()).pathname;if(['GET','HEAD'].includes(r.method()))return route.continue();
   if(r.method()==='POST'&&p===`/api/public-opinion/sources/${sourceId}/check-auth`&&authCount===0){authCount++;return route.continue();}
   if(r.method()==='POST'&&p===`/api/public-opinion/sources/${sourceId}/sync`&&syncCount===0){syncCount++;return route.continue();}
   blocked.push(p);return route.abort();
  });
  await page.goto(origin+'/admin/PublicOpinion/sources.html'+query,{waitUntil:'networkidle'});
  await page.locator(`[data-manage-source="${sourceId}"]`).click();await page.locator('#btnCheckAuth').waitFor();
  if (!process.argv.includes('--use-saved-auth')) {
  const authResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/public-opinion/sources/${sourceId}/check-auth`&&r.request().method()==='POST',{timeout:45000});
  const authAt=Date.now();await page.locator('#btnCheckAuth').click();const ar=await authResponse,ab=await ar.json();
  report.auth={http:ar.status(),authStatus:ab.data?.authStatus,reason:ab.data?.reason,durationMs:Date.now()-authAt};write(report);assert.equal(ar.status(),200);assert.equal(ab.data.authStatus,'authorized');
  await page.waitForFunction(()=>!document.querySelector('#btnCheckAuth')?.disabled);
  }
  const dr=await page.request.get(origin+`/api/public-opinion/sources/${sourceId}`+query),d=(await dr.json()).data;
  assert.equal(d.account.hasToken,true);assert.equal(d.account.hasAccountPassword,true);report.credential={hasToken:true,hasAccountPassword:true};write(report);
  assert.equal(d.auth_status,'authorized');assert.equal(d.account.auth_status,'authorized');
  await page.locator('#btnCancel').click();
  const syncResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/public-opinion/sources/${sourceId}/sync`&&r.request().method()==='POST',{timeout:45000});
  const syncAt=Date.now();await page.locator(`[data-sync-source="${sourceId}"]`).click();const sr=await syncResponse,sb=await sr.json();
  report.sync={http:sr.status(),runId:sb.data?.runId,status:sb.data?.status,errorCode:sb.error?.code,durationMs:Date.now()-syncAt};write(report);assert.equal(sr.status(),200,JSON.stringify(report.sync));assert(sb.data.runId);
  const runId=sb.data.runId;let terminal=false;
  for(let attempt=0;attempt<48;attempt++){
   const response=await page.request.get(origin+`/api/public-opinion/sync-runs/${runId}`);assert.equal(response.status(),200);const body=await response.json(),run=body.data?.run||body.data;
   report.run=safeRun(run);write(report);console.log(JSON.stringify({phase:'sync',...report.run}));
   if(['completed','completed_full','completed_authorized_scope','partial','failed','cancelled','awaiting_manual_verification'].includes(run.status)){terminal=true;break;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  assert(terminal,'Sync still active after four minutes; continue read-only monitoring');
  assert(['completed','completed_full','completed_authorized_scope'].includes(report.run.status),'Sync did not fully complete: '+JSON.stringify(report.run));
  await page.reload({waitUntil:'networkidle'});await page.locator(`[data-manage-source="${sourceId}"]`).click();await page.locator('#btnCheckAuth').waitFor();
  assert.equal(await page.locator('#h5AuthPassword').getAttribute('aria-selected'),'true');assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(warnings,[]);assert.deepEqual(blocked,[]);
  await page.screenshot({path:path.join(output,'external-sync-fixed.png')});
  report.browser={authCount,syncCount,errors,failed,warnings,blocked};report.status='PASS';write(report);console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
