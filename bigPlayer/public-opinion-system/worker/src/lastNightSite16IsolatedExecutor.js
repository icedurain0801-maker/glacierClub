'use strict';
const {advanceSite16Tasks}=require('./lastNightSite16TaskFlow');
const fixtures=new WeakSet();
const fail=code=>{throw Object.assign(new Error(code),{code});};
// No DB/HTTP adapter is imported here. Only deliberately registered in-process
// fixture boundaries can run; production authorization is NOT implemented.
function registerSite16Fixture({store,loadPage}) {
 if(!store || typeof loadPage!=='function')fail('LAST_NIGHT_ISOLATED_FIXTURE_INVALID');
 const boundary=Object.freeze({store,loadPage});fixtures.add(boundary);return boundary;
}
async function executeSite16Isolated({mode,boundary,plan,maxPages=20,deadlineAt,now=Date.now}) {
 if(mode!=='isolated-test' || !fixtures.has(boundary))fail('PRODUCTION_EXECUTION_DISABLED');
 const result=await advanceSite16Tasks({plan,store:boundary.store,loadPage:boundary.loadPage,maxPages,deadlineAt,now});
 return{...result,executionEnvironment:'in-process-fixture',productionExecuted:false,fullChainComplete:false};
}
module.exports={registerSite16Fixture,executeSite16Isolated};
