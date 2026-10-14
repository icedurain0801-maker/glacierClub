const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const sample=JSON.parse(fs.readFileSync(process.env.PO_BAAS_SAMPLE,'utf8'));
const collection='po_migration_pilot_20261013';
(async()=>{const context=await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,serviceWorkers:'block',viewport:{width:1280,height:900}});try{
  const page=await context.newPage();
  await page.goto('https://club-opinion.q1.com/admin/PublicOpinion/index.html',{waitUntil:'networkidle'});
  const result=await page.evaluate(async({sample,collection})=>{
    await PublicOpinionAuth.ready;
    const cfg=(await(await fetch('/api/public-opinion/auth/config')).json()).data;
    const app=GlacierBaaS.init({appKey:cfg.appKey,baseUrl:cfg.baseUrl});
    const col=app.collection(collection),checks=[],timings=[];
    await app.admin.setCollectionAcl([{collection,acl:'private',audit:true}]);
    const sourceKey='sample-source',checkpointKey='sample-checkpoint';
    async function ensure(id,data){try{await col.get(id);await col.update(id,data,{reason:'isolated migration evaluation'});}catch(e){if(e.status!==404&&e.code!=='not_found')throw e;await col.create(data,id);}}
    await ensure(sourceKey,{kind:'source',sourceId:sample.sourceId,platform:'taptap',testOnly:true,scheduled:false});
    const docs=[...sample.posts,...sample.comments];
    for(const item of docs){const t=performance.now();await ensure('content-'+item.externalId,{...item,kind:'content',sourceId:sample.sourceId,testOnly:true,handlingStatus:'unhandled'});timings.push(Math.round(performance.now()-t));}
    const query=await col.list({where:{kind:'content',sourceId:sample.sourceId},limit:2,offset:0,with_total:true,orderBy:'externalId',desc:false});
    const second=await col.list({where:{kind:'content',sourceId:sample.sourceId},limit:2,offset:2,orderBy:'externalId',desc:false});
    checks.push({name:'real-source-storage-pagination',passed:query.docs.length===2&&second.docs.length>=1,total:query.total});
    const first='content-'+docs[0].externalId;
    let duplicateStatus;try{await col.create({kind:'must-not-overwrite'},first);duplicateStatus=200;}catch(e){duplicateStatus=e.status;}
    const afterDuplicate=await col.get(first);
    checks.push({name:'duplicate-id-does-not-overwrite',passed:duplicateStatus===409&&afterDuplicate.data.kind==='content',status:duplicateStatus});
    await ensure(checkpointKey,{kind:'checkpoint',sourceId:sample.sourceId,testOnly:true,nextCursor:sample.nextCursor,hasMore:sample.hasMore,status:'sample_partial'});
    const checkpoint=await col.get(checkpointKey);
    checks.push({name:'checkpoint-roundtrip',passed:checkpoint.data.nextCursor===sample.nextCursor});
    const limitResult=await app._req('POST','/v1/collections/'+collection+'/query',{limit:501}).then(()=>200,e=>e.status);
    checks.push({name:'server-limit-501-rejected',passed:limitResult===422,status:limitResult});
    let ai={passed:false};
    try{
      const text=await app.ai.chat([{role:'system',content:'你是舆情分析员。仅返回JSON，包含sentiment（positive/neutral/negative）、qualityScore（0到1）、summary（简短中文）。'}, {role:'user',content:(docs[0].title||'')+'\n'+(docs[0].body||'')}],{json:true,max_tokens:200,temperature:0});
      const parsed=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));
      if(!['positive','neutral','negative'].includes(parsed.sentiment)||typeof parsed.qualityScore!=='number'||parsed.qualityScore<0||parsed.qualityScore>1||typeof parsed.summary!=='string')throw Error('invalid analysis contract');
      await col.update(first,{analysis:parsed},{reason:'isolated AI analysis'});
      ai={passed:true,stored:true};
    }catch(e){ai={passed:false,status:e.status||null,code:e.code||e.name};}
    checks.push({name:'real-baas-ai-analysis',...ai});
    await col.update(first,{handlingStatus:'reviewed'},{reason:'isolated review test'});
    checks.push({name:'review-update-readback',passed:(await col.get(first)).data.handlingStatus==='reviewed'});
    const audit=await col.audit({docId:first,limit:10});
    const auditKeys=Object.keys(audit),auditRows=Object.values(audit).find(Array.isArray)||[];
    checks.push({name:'audit-read',passed:auditRows.length>0,count:auditRows.length,keys:auditKeys});
    const frame=document.createElement('iframe');frame.hidden=true;document.body.append(frame);
    const unauth=await frame.contentWindow.fetch(cfg.baseUrl+'/v1/collections/'+collection+'/query',{method:'POST',headers:{'content-type':'application/json','x-app-key':cfg.appKey},body:JSON.stringify({limit:1})});frame.remove();
    checks.push({name:'without-bearer-denied',passed:[401,403].includes(unauth.status),status:unauth.status});
    const quota=await app._req('GET','/v1/admin/apps/app_2473f541984b4e0696bb/usage').then(r=>({available:true,...r}),e=>({available:false,status:e.status,code:e.code}));
    window.pilotCollection=col;
    return {checks,quota,writeLatencyMs:timings,storedSamples:docs.length,comments:sample.comments.length,productionWrites:0,collection,collectionAcl:'private',collectorRuntime:'local Node.js; not BaaS hosted',collectionScope:'bounded sample; hasMore='+sample.hasMore};
  },{sample,collection});
  await page.reload({waitUntil:'networkidle'});
  const persisted=await page.evaluate(async collection=>{await PublicOpinionAuth.ready;const cfg=(await(await fetch('/api/public-opinion/auth/config')).json()).data;const app=GlacierBaaS.init({appKey:cfg.appKey,baseUrl:cfg.baseUrl});const r=await app.collection(collection).list({where:{kind:'content'},limit:10});return r.docs.length;},collection);
  result.checks.push({name:'browser-reload-persistence',passed:persisted===result.storedSamples,count:persisted});
  result.passed=result.checks.every(c=>c.passed);
  fs.writeFileSync(path.join(__dirname,'baas-pilot-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await context.close();}})().catch(e=>{console.error(e.code||e.name,String(e.message).split('\n')[0]);process.exitCode=1});
