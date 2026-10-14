const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const c=await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,serviceWorkers:'block',viewport:{width:1920,height:1080}});try{
if(process.env.PO_SDK_CACHE)await c.route('https://chat.q1.com/baas/glacier-baas-sdk.js',r=>r.fulfill({path:process.env.PO_SDK_CACHE,contentType:'application/javascript'}));
if(process.env.PO_FRONT_CANDIDATE){for(const rel of ['sources.html','assets/sources.js'])await c.route('**/admin/PublicOpinion/'+rel+'*',r=>r.fulfill({path:path.join(process.env.PO_FRONT_CANDIDATE,'public/admin/PublicOpinion',rel),contentType:rel.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'}));}
const p=await c.newPage(),errors=[],results=[];p.on('pageerror',e=>errors.push(e.message));
for(const [region,community]of [['domestic','00000000-0000-0000-0000-000000000101'],['overseas','8b1f0000000000000000000000100016']]){
await p.goto(`https://club-opinion.q1.com/admin/PublicOpinion/sources.html?regionCode=${region}&communityId=${community}&platform=bigplayer_h5`,{waitUntil:'domcontentloaded',timeout:45000});
await p.locator('#rows [data-manage-source]').first().waitFor({timeout:20000}).catch(async e=>{console.log(JSON.stringify({url:p.url(),panel:await p.locator('.po-auth-panel').allTextContents(),rows:await p.locator('#rows').allTextContents(),errors}));throw e;});
const headers=await p.locator('.table>thead th').allTextContents();assert.deepEqual(headers,['采集源 / 账号','平台','授权','同步策略','最近同步','操作']);
const cells=await p.locator('#rows>tr').evaluateAll(rows=>rows.map(r=>r.cells.length));assert(cells.every(n=>n===6));
assert.equal(await p.locator('#rows td[data-label="归属范围"],#rows td[data-label="同步进度"]').count(),0);
const apiStatus=await p.evaluate(async()=> (await fetch('/api/public-opinion/sources')).status);assert.equal(apiStatus,200);
await p.locator('#rows [data-manage-source]').first().click();await p.locator('#drawerMask.active,#drawerMask.open,#drawerMask.show').waitFor({timeout:1000}).catch(async()=>assert(await p.locator('#drawerContent').isVisible()));
await p.locator('#drawerClose').click();
if(process.env.PO_SCREENSHOT_DIR)await p.screenshot({path:path.join(process.env.PO_SCREENSHOT_DIR,`columns-${region}.png`)});
results.push({region,headers,cells,apiStatus,managementOpened:true});
}
await p.evaluate(()=>{const select=document.querySelector('#platformFilter');select.add(new Option('隔离空状态检查','no_matching_platform'));select.value='no_matching_platform';select.dispatchEvent(new Event('change'));});await p.waitForTimeout(100);assert.equal(await p.locator('#rows td.empty').getAttribute('colspan'),'6');
assert.deepEqual(errors,[]);const phase=process.env.PO_FRONT_CANDIDATE?'candidate':'live';const report={passed:true,phase,results,emptyColspan:6,errors};fs.writeFileSync(path.join(__dirname,`source-columns-${phase}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,phase,cases:results.length,emptyColspan:6}));
}finally{await c.close();}})().catch(e=>{console.error(e.message.split('\n')[0]);process.exitCode=1});
