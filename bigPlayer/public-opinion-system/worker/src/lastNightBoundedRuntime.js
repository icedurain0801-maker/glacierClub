'use strict';
const crypto=require('node:crypto');
const {normalizeRawContent}=require('../../server/src/connectors/baseConnector');
const { BigPlayerH5Connector,q1PageData }=require('../../server/src/connectors/bigPlayerH5Connector');
const { createApprovedLastNightSiteSession }=require('../../server/src/connectors/lastNightSiteSession');
const { resolveLastNightRuntime }=require('./lastNightRuntimeResolver');
const {assertLastNightSiteUrl}=require('../../server/src/connectors/lastNightUrlContract');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const {transportDiagnostic}=require('./lastNightTransportSafety');
const {protectedStorePage,queueExactChanges,observeExactAnalysis}=require('./lastNightProtectedStore');
const {inspectWriteSchema}=require('./lastNightWriteSchema');
async function runBoundedLastNight({plan,repo,transport,analyze,cipher,env,persistEvidence}={}) {
  if(plan?.authorizationMode!=='lastnight-bounded-current-runtime'||!['metadata','collect','store-ai'].includes(plan.stage)
    || !['direct-api-token','site-exchange'].includes(plan.tokenMode)||typeof transport!=='function') fail('LAST_NIGHT_PLAN_INVALID');
  const from=new Date(plan.publishedFrom),to=new Date(plan.publishedTo);
  if((plan.stage!=='metadata'&&(!plan.publishedFrom||!plan.publishedTo||!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from||to-from>86400000))||!['2','9','16'].includes(String(plan.languageId))) fail('LAST_NIGHT_WINDOW_INVALID');
  const controller=new AbortController();let rejectTimeout;
  const expired=new Promise((_,reject)=>{rejectTimeout=reject;});expired.catch(()=>{});
  const timer=setTimeout(()=>{controller.abort();rejectTimeout(Object.assign(new Error('LAST_NIGHT_RUNTIME_TIMEOUT'),{code:'LAST_NIGHT_RUNTIME_TIMEOUT'}));},120000);
  const bounded=promise=>Promise.race([promise,expired]);
  const report={status:'NO_GO',sourceId:SOURCE_ID,stage:plan.stage,requests:[],stored:0,analysis:'not_requested'};
  let session,lock,fatal;
  try {
    const runtime=await bounded(resolveLastNightRuntime({repo,accountId:plan.accountId,expectedIdentity:plan.expectedIdentity,cipher,env}));
    const config=typeof runtime.source.config==='string'?JSON.parse(runtime.source.config):runtime.source.config;
    const matching=(config.siteUrls||[]).filter(site=>{try{return new URL(site.url).searchParams.get('languageId')===String(plan.languageId);}catch{return false;}});
    if(matching.length!==1||matching[0].enabled===false) fail('LAST_NIGHT_SITE_SCOPE_MISMATCH');
    const site=matching[0],base=assertLastNightSiteUrl(site.url);
    if(base.origin!=='https://club-en.q1.com'||base.username||base.password||base.hash||base.searchParams.get('gameId')!=='2177'||base.searchParams.get('gameVersion')!=='2177-US-ZS') fail('LAST_NIGHT_SITE_SCOPE_MISMATCH');
    if(plan.stage==='store-ai') {
      report.schema=await bounded(inspectWriteSchema(repo,'store'));
      if(report.schema.status!=='LAST_NIGHT_WRITE_SCHEMA_READY') fail('LAST_NIGHT_WRITE_SCHEMA_NOT_READY');
      const registered=runtime.registry.find(row=>row.site_id===site.siteId&&row.url===site.url&&Number(row.enabled)===1);
      if(!registered) fail('LAST_NIGHT_SITE_ALIGNMENT_REQUIRED');
      lock=await bounded(repo.pool.getConnection());
      const [[row]]=await bounded(lock.query('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${runtime.account.id}`]));
      if(Number(row.acquired)!==1) fail('LAST_NIGHT_DUPLICATE_EXECUTION');
      const active=await bounded(repo.query("SELECT id FROM po_sync_runs WHERE account_id=? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1",[runtime.account.id]));
      if(active.length) fail('LAST_NIGHT_ACTIVE_RUN');
    }
    let token;
    const discoveredPostIds=new Set();let feedRequested=false;
    const guarded=async(value,options)=>{
      if(fatal) fail(fatal);
      const url=new URL(value);
      const allowed=['/api/club/v1/login/token','/api/club/v1/auth/user/context','/api/club/v2/auth/board','/api/club/v1/auth/post/model/merged-list','/api/club/v1/auth/post/'];
      if(url.origin!==base.origin||!allowed.includes(url.pathname)||report.requests.length>=24||options.redirect!=='manual'||(options.method||'GET')!=='GET') fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      if(plan.stage==='metadata'&&url.pathname.includes('/post/')) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      if(url.searchParams.has('boardId')&&url.searchParams.get('boardId')!==BOARD_ID) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      const keys=[...url.searchParams.keys()];
      if(new Set(keys).size!==keys.length) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      if(url.pathname.endsWith('/user/context')&&keys.length) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      if(url.pathname.endsWith('/auth/board')&&(keys.length!==1||url.searchParams.get('id')!==BOARD_ID)) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      if(url.pathname.endsWith('/merged-list')) {
        if(feedRequested||keys.sort().join(',')!=='boardId,offsetId,pageIndex,pageSize,sectionId'||url.searchParams.get('sectionId')!=='0'||url.searchParams.get('offsetId')!=='0'||url.searchParams.get('pageIndex')!=='1'||url.searchParams.get('pageSize')!=='20') fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
        feedRequested=true;
      }
      if(url.pathname.endsWith('/auth/post/')&&(keys.sort().join(',')!=='postId,source'||url.searchParams.get('source')!=='0'||!discoveredPostIds.has(url.searchParams.get('postId')))) fail('LAST_NIGHT_HTTP_SCOPE_MISMATCH');
      const params=[...url.searchParams].map(([key,val])=>[key,/token/i.test(key)?'[REDACTED]':val]);
      const entry={path:url.pathname,parameters:params,startedAt:new Date().toISOString(),signatureSha256:crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex')};report.requests.push(entry);
      try {
        const response=await bounded(transport(url,{...options,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}));
        if(response.url&&response.url!==url.toString()) {fatal='LAST_NIGHT_HTTP_SCOPE_MISMATCH';controller.abort();fail(fatal);}
        entry.http=response.status;
        if(response.status===401||response.status===403) {
          fatal=response.status===401?'UNAUTHORIZED':'PERMISSION_DENIED';
          controller.abort();fail(fatal);
        }
        const payload=await bounded(response.json());entry.providerCode=typeof payload?.code==='number'?payload.code:null;
        if(!response.ok||payload?.code!==0) {
          fatal=payload?.code===1?'Q1_TOURIST_LOGIN':response.status===401?'UNAUTHORIZED':response.status===403?'PERMISSION_DENIED':'Q1_AUTH_REJECTED';
          controller.abort();fail(fatal);
        }
        if(url.pathname.endsWith('/merged-list')) {
          const rows=q1PageData(payload).items;
          if(!Array.isArray(rows)||rows.length>20) fail('LAST_NIGHT_CONTENT_SCOPE_MISMATCH');
          for(const item of rows) discoveredPostIds.add(String(item.id));
        }
        return {...response,ok:response.ok,status:response.status,url:response.url,json:async()=>payload};
      } catch(error) {
        entry.transportError=transportDiagnostic(error);
        fatal ||= 'LAST_NIGHT_HTTP_FAILED';controller.abort();fail(fatal);
      }
      finally {entry.finishedAt=new Date().toISOString();}
    };
    token=await runtime.credentialContext.loadApiToken(runtime.account);
    const source={...runtime.source,account:runtime.account,config:{...config,baseUrl:site.url,boardId:BOARD_ID}};
    session=plan.tokenMode==='site-exchange'?createApprovedLastNightSiteSession({authorizationMode:plan.authorizationMode,transport:guarded}):null;
    const siteToken=session?await bounded(session.tokenFor(source,token,controller.signal)):token;
    const connector=new BigPlayerH5Connector({}, {fetchImpl:(url,options)=>guarded(url,session?{...options,headers:{...options.headers,authorization:siteToken}}:options),credentialContext:runtime.credentialContext});
    const feeds=await bounded(connector.discoverFeeds({source,account:runtime.account,signal:controller.signal}));
    const feed=feeds.find(item=>item.endpointKind==='merged'&&item.boardId===BOARD_ID);
    if(!feed) fail('BOARD_NOT_ACCESSIBLE');report.boardIds=[BOARD_ID];
    if(plan.stage!=='metadata') {
      const page=await bounded(connector.listFeedContents({source,account:runtime.account,feed,limit:20,signal:controller.signal,dailyBounded:true,publishedFrom:from.toISOString(),publishedTo:to.toISOString()}));
      const items=page.items.filter(item=>{const at=new Date(item.publishedAt);return at>=from&&at<to;});
      if(page.items.length>20||items.some(item=>item.boardId!==BOARD_ID)) fail('LAST_NIGHT_CONTENT_SCOPE_MISMATCH');
      report.fetched=page.items.length;report.inWindow=items.length;report.hasMore=page.hasMore;
      report.details={enriched:0,fallback:0,reasons:{}};
      for(const item of items) {
        const integrity=item.rawPayload?._contentIntegrity;
        if(integrity?.status==='detail_enriched') report.details.enriched++;
        else {report.details.fallback++;const reason=/^[A-Z0-9_]+$/.test(integrity?.code||'')?integrity.code:'DETAIL_NOT_ENRICHED';report.details.reasons[reason]=(report.details.reasons[reason]||0)+1;}
      }
      if(fatal) fail(fatal);
      if(report.details.fallback) fail('LAST_NIGHT_DETAIL_INCOMPLETE');
      if(plan.stage==='store-ai'&&items.length) {
        const normalized=items.map(item=>({...item,...normalizeRawContent(item),boardId:BOARD_ID,boardName:feed.boardName}));
        const contentMode=report.schema.contentMode;
        const stored=await bounded(protectedStorePage({repo,account:runtime.account,items:normalized,feed,persistEvidence,contentMode}));
        const ids=stored.contents.map(item=>item.content.id);
        report.stored=stored.storedCount;report.contentIds=ids;
        const version=env?.AI_ANALYSIS_LIGHT_VERSION||env?.AI_ANALYSIS_VERSION||'sentiment-v1';
        const queue=await bounded(queueExactChanges({repo,account:runtime.account,contents:stored.contents,version,contentMode}));
        report.queue=queue;report.analysisQueued=queue.queued.length;
        await bounded(persistEvidence({...stored.protection,phase:'queue_result',queue,version}));
        if(queue.status!=='EXACT_AI_QUEUED') {report.status=queue.status;report.errorCode=queue.errorCode;return report;}
        report.analysis=await bounded(observeExactAnalysis({repo,queue,after:stored.protection.after,version,accountId:runtime.account.id,contentMode}));
      }
    }
    report.status=plan.stage!=='metadata'&&!report.inWindow?'EMPTY_SAMPLE':plan.stage==='store-ai'?(report.analysis?.status==='EXACT_AI_COMPLETED'?'STORE_COMMITTED_AI_COMPLETED':'STORE_COMMITTED_AI_NOT_COMPLETED'):'PASS_BOUNDED_STAGE';report.completeness=plan.stage==='metadata'?'metadata_only':'sampled_one_page';
  } catch(error) {report.errorCode=fatal||(/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'LAST_NIGHT_RUNTIME_FAILED');}
  finally {
    clearTimeout(timer);controller.abort();session?.clear();
    if(lock){try{await Promise.race([lock.query('SELECT RELEASE_LOCK(?)',[`public-opinion-sync-account-${plan.accountId}`]),new Promise(resolve=>setTimeout(resolve,1000))]);}finally{lock.destroy?.();}}
  }
  return report;
}
module.exports={runBoundedLastNight};
