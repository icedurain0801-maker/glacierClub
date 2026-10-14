const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const c=await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});
 const report={responses:[],errors:[],checks:[]};
 try{
  const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.url().includes('/api/public-opinion/'))report.responses.push({path:new URL(r.url()).pathname,status:r.status()});});
  await p.goto((process.env.PO_TEST_ORIGIN||'https://club-opinion.q1.com')+'/admin/PublicOpinion/content.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&pageSize=20');
  await p.locator('[data-date-preset="7d"]').click();
  await p.locator('#tableContent [data-content]').first().waitFor({timeout:60000});
  for(const sentiment of ['positive','neutral','negative']){
   await p.locator('#sentimentFilter').selectOption(sentiment);
   await p.waitForFunction(s=>{const cells=[...document.querySelectorAll('#tableContent td.sentiment')];return cells.length&&cells.every(c=>c.classList.contains(s));},sentiment,{timeout:60000});
   const items=await p.evaluate(()=>state.contents);
   const cells=await p.locator('#tableContent td.sentiment').allTextContents();
   assert.equal(items.length,cells.length);
   let percent=0;
   items.forEach((item,i)=>{
    const score=sentiment==='negative'?item.negative_score:item.sentiment_score;
    if(score!=null){assert(cells[i].includes(Math.round(Number(score)*100)+'%'));percent++;}
   });assert(percent>0,'expected model probabilities for '+sentiment);
   report.checks.push({sentiment,rows:items.length,percentRows:percent,examples:cells.slice(0,5)});
   await p.screenshot({path:__dirname+'/sentiment-percentage-'+sentiment+'.png'});
   await p.locator('#tableContent [data-content]').first().click();
   await p.locator('#drawerContent .analysis-reason').waitFor({timeout:60000});
   const detail=await p.locator('#drawerContent .sentiment-badge').textContent();
   assert.equal(detail.trim(),cells[0].trim());report.checks.at(-1).detail=detail;
   await p.locator('#drawerClose').click();
  }
  assert.equal(report.errors.length,0);assert(report.responses.every(r=>r.status<400));
 }finally{fs.writeFileSync(__dirname+'/sentiment-percentage-browser.json',JSON.stringify(report,null,2));await c.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.log(e.name,e.message);process.exitCode=1;});
