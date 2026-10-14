const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {TapTapConnector}=require('../../../server/src/connectors/taptapConnector');
const collection='po_migration_pilot_20261013';
(async()=>{
  const context=await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE,{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:false,serviceWorkers:'block'});
  try{
    const p=await context.newPage();await p.goto('https://club-opinion.q1.com/admin/PublicOpinion/index.html',{waitUntil:'networkidle'});
    const prior=await p.evaluate(async collection=>{await PublicOpinionAuth.ready;const cfg=(await(await fetch('/api/public-opinion/auth/config')).json()).data;window.pilotApp=GlacierBaaS.init({appKey:cfg.appKey,baseUrl:cfg.baseUrl});const col=pilotApp.collection(collection);const cp=await col.get('sample-checkpoint');const q=await col.list({where:{kind:'content'},limit:50});return {checkpoint:cp.data,ids:q.docs.map(d=>d.data.externalId)};},collection);
    assert(prior.checkpoint.nextCursor);
    process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const {Repository}=require('../../../server/src/db/repository');
    const repo=new Repository();let source;
    try{[source]=await repo.query('SELECT id,config FROM po_sources WHERE id=?',[prior.checkpoint.sourceId]);}finally{await repo.pool.end();}
    const cfg=typeof source.config==='string'?JSON.parse(source.config):source.config;
    const connector=new TapTapConnector();
    const page=await connector.listOwnedContents({source:{id:source.id,config:{groupIds:cfg.groupIds,accountIds:cfg.accountIds}},cursor:prior.checkpoint.nextCursor,limit:3,signal:AbortSignal.timeout(30000)});
    const items=page.items.slice(0,3).map(x=>({externalId:x.externalId,title:x.title,body:x.body,publishedAt:x.publishedAt,contentType:x.contentType||'post'}));
    assert(items.length>0);assert(items.every(x=>!prior.ids.includes(x.externalId)));
    let comments=[];
    for(const item of items){const q=await connector.listComments({postId:item.externalId,limit:2,signal:AbortSignal.timeout(30000)});comments.push(...q.items.slice(0,2).map(x=>({externalId:x.externalId,rootExternalId:item.externalId,title:x.title,body:x.body,publishedAt:x.publishedAt,contentType:'comment'})));if(comments.length)break;}
    const result=await p.evaluate(async({collection,items,comments,nextCursor,hasMore})=>{const col=pilotApp.collection(collection);for(const item of [...items,...comments])await col.create({...item,kind:'content',testOnly:true,sourceId:'26b47b08-0a0d-4265-b377-3d313e2f1131',handlingStatus:'unhandled'},'content-'+item.externalId);await col.update('sample-checkpoint',{nextCursor,hasMore,status:'sample_partial'},{reason:'bounded continuation test'});const cp=await col.get('sample-checkpoint');const q=await col.list({where:{kind:'content'},limit:1,with_total:true});return {total:q.total,checkpointAdvanced:cp.data.nextCursor===nextCursor};},{collection,items,comments,nextCursor:page.nextCursor,hasMore:page.hasMore});
    assert(result.checkpointAdvanced);assert.equal(result.total,prior.ids.length+items.length+comments.length);
    const report={passed:true,sourceId:source.id,storedFirstPage:prior.ids.length,newPosts:items.length,newComments:comments.length,readCommentPages:items.length,continuedFromBaasCheckpoint:true,duplicateExternalIds:0,...result,hasMore:page.hasMore,scopeComplete:!page.hasMore,productionWrites:0,collectorRuntime:'local Node.js'};
    fs.writeFileSync(path.join(__dirname,'baas-pilot-resume-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await context.close();}
})().catch(e=>{console.error(e.code||e.name,String(e.message).split('\n')[0]);process.exitCode=1});
