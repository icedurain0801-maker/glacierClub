'use strict';
const crypto=require('node:crypto');
const { createIsolatedLastNightSiteSession }=require('../server/src/connectors/lastNightSiteSession');
const { BigPlayerH5Connector }=require('../server/src/connectors/bigPlayerH5Connector');
const {assertLastNightSiteUrl}=require('../server/src/connectors/lastNightUrlContract');
const SOURCE_ID='081a16d2-5545-4afd-9c65-e04777e4540b';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const LANGUAGES=['2','9','16'];

async function runAuthorizationCheck({mode,source,account,expectedAccountId,sites,token,transport,windowMs=90000}={}) {
  if(mode!=='isolated' || typeof transport!=='function' || transport===globalThis.fetch) fail('PRODUCTION_EXECUTION_DISABLED');
  if(source?.id!==SOURCE_ID || !expectedAccountId || account?.id!==expectedAccountId || account.source_id!==SOURCE_ID
    || typeof token!=='string' || !token.trim() || !Array.isArray(sites) || sites.length!==3
    || !Number.isInteger(windowMs) || windowMs<1 || windowMs>90000) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
  const approved=sites.map(site=>{
    const url=assertLastNightSiteUrl(site.url);
    const allowed=new Set(['env','gameId','gameVersion','languageId','lang']);
    if(url.origin!=='https://club-en.q1.com' || url.pathname!=='/' || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some(key=>!allowed.has(key))
      || url.searchParams.get('gameId')!=='2177' || url.searchParams.get('gameVersion')!=='2177-US-ZS'
      || !LANGUAGES.includes(url.searchParams.get('languageId'))) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
    return {url,languageId:url.searchParams.get('languageId')};
  });
  if(new Set(approved.map(site=>site.languageId)).size!==3) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
  const report={sourceId:SOURCE_ID,accountId:expectedAccountId,status:'PENDING',requests:[],sites:[],feedRequests:0};
  const controller=new AbortController();
  let rejectTimeout;
  const expired=new Promise((_,reject)=>{rejectTimeout=reject;});expired.catch(()=>{});
  const timer=setTimeout(()=>{controller.abort();rejectTimeout(Object.assign(new Error('LAST_NIGHT_AUTH_TIMEOUT'),{code:'LAST_NIGHT_AUTH_TIMEOUT'}));},windowMs);
  let currentLanguage,phase=0;
  const guarded=async(value,options)=>{
    const url=new URL(value);
    const allowedPaths=['/api/club/v1/login/token','/api/club/v1/auth/user/context','/api/club/v2/auth/board'];
    if(controller.signal.aborted || report.requests.length>=9 || url.origin!=='https://club-en.q1.com'
      || url.pathname!==allowedPaths[phase] || options.redirect!=='manual' || (options.method||'GET')!=='GET') fail('LAST_NIGHT_AUTH_REQUEST_REJECTED');
    if(phase===0 && url.searchParams.get('languageId')!==currentLanguage) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
    if(phase===1 && url.searchParams.size!==0) fail('LAST_NIGHT_AUTH_REQUEST_REJECTED');
    if(phase===2 && (url.searchParams.size!==1 || url.searchParams.get('id')!=='100017')) fail('LAST_NIGHT_AUTH_REQUEST_REJECTED');
    const parameters=[...url.searchParams].map(([key,value])=>[key,/token/i.test(key)?'[REDACTED]':value]);
    const signature={method:'GET',origin:url.origin,path:url.pathname,parameters,authorization:'[REDACTED]'};
    const entry={languageId:currentLanguage,startedAt:new Date().toISOString(),signature,
      signatureSha256:crypto.createHash('sha256').update(JSON.stringify(signature)).digest('hex')};
    report.requests.push(entry);
    try {
      const response=await Promise.race([transport(url,{...options,signal:AbortSignal.any([controller.signal,options.signal])}),expired]);
      let payload;
      try {payload=await Promise.race([response.json(),expired]);} catch {fail('MALFORMED_RESPONSE');}
      entry.httpStatus=response.status;entry.providerCode=typeof payload?.code==='number'?payload.code:null;
      if(!response.ok || payload?.code!==0) fail(payload?.code===1?'Q1_TOURIST_LOGIN':response.status===401?'UNAUTHORIZED':response.status===403?'PERMISSION_DENIED':'Q1_SITE_AUTH_REJECTED');
      phase++;
      return {...response,ok:response.ok,status:response.status,url:response.url,json:async()=>payload};
    } catch(error) {
      entry.errorCode=/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'LAST_NIGHT_AUTH_TRANSPORT_FAILED';
      fail(entry.errorCode);
    } finally {entry.finishedAt=new Date().toISOString();}
  };
  const session=createIsolatedLastNightSiteSession({isolated:true,transport:guarded});
  const connector=new BigPlayerH5Connector({}, {fetchImpl:guarded,isolatedSiteSession:session,credentialContext:{loadApiToken:async()=>token}});
  try {
    for(const site of approved) {
      currentLanguage=site.languageId;phase=0;
      const target={...source,account,config:{baseUrl:site.url.toString(),boardId:'100017'}};
      const feeds=await Promise.race([connector.discoverFeeds({source:target,account,signal:controller.signal}),expired]);
      if(phase!==3 || !feeds.length || feeds.some(feed=>feed.boardId!=='100017')) fail('BOARD_NOT_ACCESSIBLE');
      report.sites.push({languageId:site.languageId,boardIds:['100017'],authorized:true});
    }
    report.status='PASS_ISOLATED_AUTHORIZATION';
  } catch(error) {
    report.status='NO_GO';report.errorCode=/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'LAST_NIGHT_AUTH_FAILED';
    controller.abort();
  } finally {clearTimeout(timer);session.clear();token=null;}
  return report;
}

function main(argv=process.argv) {
  if(argv.length===3 && argv[2]==='--dry-run') {
    console.log(JSON.stringify({status:'prepared',sourceId:SOURCE_ID,boardId:'100017',languages:LANGUAGES,maxRequests:9,windowMs:90000,productionExecution:false}));return;
  }
  fail('PRODUCTION_EXECUTION_DISABLED');
}
if(require.main===module) try {main();} catch(error) {console.error(error.code);process.exitCode=1;}
module.exports={runAuthorizationCheck,main};
