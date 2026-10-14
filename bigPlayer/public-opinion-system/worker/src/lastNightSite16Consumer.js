'use strict';
const {buildSite16Tasks,advanceSite16Tasks}=require('./lastNightSite16TaskFlow');
const {createTaskCheckpointStore}=require('./lastNightTaskCheckpointStore');
const {assertLastNightSiteUrl}=require('../../server/src/connectors/lastNightUrlContract');
const {finishSegment}=require('./lastNightSegmentFinalizer');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Called only inside an authenticated account-locked session. No scheduling,
// connection acquisition, login/refresh or shared worker is owned here.
async function consumeSite16({query,bounded,token,runId,runEpoch,repo,runtime,connector,descriptors,publishedFrom,publishedTo,persistEvidence,commitState,deadlineAt,maxPages=20}){
 const account=runtime?.account;
 let config;try{config=JSON.parse(runtime.source.config);}catch{fail('LAST_NIGHT_SITE16_CONSUMER_CONFIG_INVALID');}
 const site=config.siteUrls?.find(row=>row.siteId==='site-3bb48be7f9a82185d6a045e9a5cbd3d7');
 if(!site || assertLastNightSiteUrl(site.url).searchParams.get('languageId')!=='16' || site.enabled===false
   || account?.id!==token?.accountId || !connector?.listFeedContents || !connector?.listComments)fail('LAST_NIGHT_SITE16_CONSUMER_SCOPE_INVALID');
 const plan=buildSite16Tasks({accountId:account.id,publishedFrom,publishedTo,descriptors});
 const store=createTaskCheckpointStore({query,bounded,repo,account,token,runId,runEpoch,plan,persistEvidence,commitState});
 const source={...runtime.source,siteId:site.siteId,config:{...config,baseUrl:site.url}};
 const loadPage=async(task,cursor)=>{
  const controller=new AbortController();
  try{
   if(task.kind==='q1_feed'){
    let segmentId=runId;if(cursor!=null){let parsed;try{parsed=JSON.parse(cursor);}catch{fail('LAST_NIGHT_SITE16_CURSOR_UNSAFE');}
     if(parsed.version!==2 || parsed.feedKey!==task.taskKey || !parsed.segmentId)fail('LAST_NIGHT_SITE16_CURSOR_UNSAFE');segmentId=parsed.segmentId;
    }
    return await bounded(connector.listFeedContents({source,account,feed:task.feed,cursor,segmentId,limit:50,dailyBounded:true,publishedFrom,publishedTo,signal:controller.signal}));
   }
   if(cursor!=null){let parsed;try{parsed=JSON.parse(cursor);}catch{fail('LAST_NIGHT_SITE16_CURSOR_UNSAFE');}
    if(parsed.version!==1 || String(parsed.commentId??'')!==String(task.parentId??'') || Number(parsed.sortType)!==Number(task.sortType??0))fail('LAST_NIGHT_SITE16_CURSOR_UNSAFE');
   }
   return await bounded(connector.listComments({source,account,postId:task.rootId,commentId:task.kind==='replies'?task.parentId:null,sortType:task.sortType??0,cursor,limit:50,dailyBounded:true,publishedFrom,publishedTo,signal:controller.signal}));
  }finally{controller.abort();}
 };
 const result=await advanceSite16Tasks({plan,store,loadPage,deadlineAt,maxPages});
 const segment=await finishSegment({query,bounded,token,runId,runEpoch,completed:result.status==='LAST_NIGHT_SITE16_TASKS_COMPLETED',persistEvidence,commitState});
 return{...result,runId,segmentStatus:segment.status,fullChainComplete:false,requiresSegmentFinalization:false};
}
module.exports={consumeSite16};
