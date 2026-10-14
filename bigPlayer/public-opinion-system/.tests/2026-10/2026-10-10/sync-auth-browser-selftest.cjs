'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../../../../.temp/sync-auth-persistence-fix-20261010'),root=path.join(output,'frontend-release/public');
const community='8b1f0000000000000000000000000022';
const source={id:'qa-source',platform:'bigplayer_h5',community_id:community,region_code:'domestic',community_name:'我要当老祖',display_name:'自测来源',frequency_seconds:21600,enabled:true,auth_status:'authorized',config:{boardId:'22',baseUrl:'https://club.q1.com/?env=web&gameId=1022&gameVersion=test',siteUrls:['https://club.q1.com/?env=web&gameId=1022&gameVersion=test']},account:{id:'qa-account',hasAccountPassword:true,hasToken:true,credential_configured:true,auth_status:'authorized',enabled:true},capabilities:{posts:'authorized_scope',comments:'authorized_scope'}};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),cases=[];
 try {for(const mode of ['success','credential401','unknownFailed','unknownActive']) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url()),method=route.request().method();
   if(url.pathname.startsWith('/api/')) {
    requests.push({path:url.pathname,method});let data;
    if(url.pathname.endsWith('/communities')) data=[{id:community,name:'我要当老祖',status:'enabled',region_code:'domestic'}];
    else if(url.pathname.endsWith('/login-status'))data={status:'active'};
    else if(method==='POST'&&url.pathname.endsWith('/sync')) {
     if(mode==='credential401')return route.fulfill({status:401,json:{error:{code:'CREDENTIAL_NOT_FOUND',message:'未找到同步授权凭据，请重新检测授权后开始同步'}}});
     if(mode.startsWith('unknown'))return route.fulfill({status:504,json:{error:{code:'UPSTREAM_TIMEOUT',message:'同步请求超时'}}});
     data={sourceId:source.id,runId:'qa-run',status:'queued',enabled:true};
    } else if(url.pathname.endsWith('/sync-runs/latest')) data={id:'qa-run',source_id:source.id,status:mode==='unknownActive'?'running':'failed'};
    else if(url.pathname.includes('/sync-runs/'))data=url.pathname.endsWith('/contents')?{items:[],total:0}:{id:'qa-run',source_id:source.id,status:mode==='success'?'queued':'running'};
    else if(url.pathname.endsWith('/sources/qa-source'))data=source;
    else data=[source];
    return route.fulfill({json:{data,meta:{}}});
   }
   const file=path.resolve(root,'.'+url.pathname);assert(file.startsWith(root+path.sep));const types={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
   return route.fulfill({body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:types[path.extname(file)]||'text/plain'});
  });
  await page.goto(`https://fixture.invalid/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${community}&platform=bigplayer_h5`);
  await page.locator('[data-sync-source="qa-source"]').click();
  const expected={success:'同步任务已提交',credential401:'未找到同步授权凭据',unknownFailed:'同步失败',unknownActive:'本次提交结果尚未确认'}[mode];
  await page.locator('#toast').filter({hasText:expected}).waitFor();
  assert.equal(requests.filter(r=>r.method==='POST').length,1);
  const latest=requests.filter(r=>r.path.endsWith('/sync-runs/latest')).length;
  if(mode==='credential401')assert.equal(latest,0);
  if(mode==='unknownFailed')assert(!(await page.locator('#toast').textContent()).includes('已提交'));
  if(mode==='unknownActive')assert(!(await page.locator('#toast').textContent()).includes('已提交'));
  await page.locator('[data-manage-source="qa-source"]').click();await page.locator('#btnCheckAuth').waitFor();
  assert.equal(await page.locator('#h5AuthPassword').getAttribute('aria-selected'),'true','saved derived Token must not switch the password form to Token mode');
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,`browser-${mode}.png`)});
  cases.push({mode,result:'PASS',posts:1,latestReads:latest,passwordMode:true,pageErrors:errors});await page.close();
 }} finally {await browser.close();}
 const report={result:'PASS',cases,realNetworkRequests:0};fs.writeFileSync(path.join(output,'browser-selftest.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
