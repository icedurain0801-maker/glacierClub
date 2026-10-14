const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const context=await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,serviceWorkers:'block',viewport:{width:1920,height:1080}});
  try {
    if(process.env.PO_AUTH_CANDIDATE)await context.route('**/assets/baas-auth.js*',r=>r.fulfill({path:process.env.PO_AUTH_CANDIDATE,contentType:'application/javascript'}));
    const page=await context.newPage(),errors=[],results=[];
    page.on('pageerror',e=>errors.push(String(e.message).split('\n')[0]));
    const cases=['index','content','alerts','sources','collection-runs','keywords','permissions'].map(name=>({name,width:1920}));
    cases.push({name:'sources',width:1280},{name:'sources',width:390});
    for(const c of cases){
      await page.setViewportSize({width:c.width,height:1080});
      await page.goto('https://club-opinion.q1.com/admin/PublicOpinion/'+c.name+'.html',{waitUntil:'networkidle'});
      if(await page.getByRole('button',{name:'重新登录',exact:true}).count())await page.getByRole('button',{name:'重新登录',exact:true}).click();
      await page.locator('.po-auth-user-trigger').waitFor();
      const geometry=await page.evaluate(()=>{
        const center=el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;};
        const trigger=document.querySelector('.po-auth-user-trigger'),r=trigger.getBoundingClientRect();
        return {height:r.height,left:r.left,right:r.right,deltas:Object.fromEntries(['avatar','identity','name','role','chevron'].map(name=>[name,center(document.querySelector('.po-auth-'+name))-center(trigger)])),arrow:getComputedStyle(document.querySelector('.po-auth-chevron'),'::before').content};
      });
      for(const [name,delta]of Object.entries(geometry.deltas))assert(Math.abs(delta)<=0.5,`${c.name}/${c.width}: ${name} vertical delta ${delta}`);
      assert.equal(geometry.height,40);assert.equal(geometry.arrow,'""');
      assert(geometry.left>=0&&geometry.right<=c.width+1,'account must remain inside viewport');
      await page.locator('.po-auth-user-trigger').click();
      assert(await page.locator('.po-auth-user-menu').evaluate(e=>e.open));
      await page.getByRole('button',{name:'退出登录',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.po-auth-user-menu').evaluate(e=>e.open),false);
      results.push({...c,...geometry});
      if(c.name==='sources'&&process.env.PO_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.PO_SCREENSHOT_DIR,`account-${c.width}.png`)});
    }
    const apiStatus=await page.evaluate(async()=> (await fetch('/api/public-opinion/games')).status);
    assert.equal(apiStatus,200);assert.deepEqual(errors,[]);
    const phase=process.env.PO_AUTH_CANDIDATE?'candidate':'live';
    const report={passed:true,phase,apiStatus,errors,results};
    fs.writeFileSync(path.join(__dirname,`account-align-${phase}.json`),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:true,phase,apiStatus,cases:results.length,errors}));
  }finally{await context.close();}
})().catch(e=>{console.error(String(e.message).split('\n')[0]);process.exitCode=1});
