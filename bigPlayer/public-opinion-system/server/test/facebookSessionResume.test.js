'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const{FacebookBrowserAutomation}=require('../../login-session-service/src/adapters/facebookBrowser');
const{FacebookBrowserConnector}=require('../src/connectors/facebookBrowserConnector');
const{createService}=require('../../login-session-service/src/index');
const binding={sourceId:'s',accountId:'a',platform:'facebook'};
const credentials={account:'fixture',password:'fixture-private',baseUrl:'https://www.facebook.com/Example',bindingRevision:'r1'};
function fixture(cookie=true,state='active'){
 const automation=new FacebookBrowserAutomation();const calls=[];
 const page={goto:async u=>calls.push(u),locator:()=>({first:()=>({waitFor:async()=>{}})}),close:async()=>calls.push('pageClosed')};
 const session={page,external:true,touched:0,context:{close:async()=>calls.push('contextClosed')}};
 automation.session=async(key,input)=>{assert.equal(input.scenario,'resume_external');return session};
 automation.authenticated=async()=>cookie;automation.state=async()=>state;
 return {automation,calls,session};
}
test('resume reuses bound browser and never submits credentials',async()=>{const{automation,calls,session}=fixture();assert.deepEqual(await automation.login({...binding,credentials,scenario:'resume_external'}),{kind:'success'});assert.equal(session.authorized,true);assert.deepEqual(calls,[credentials.baseUrl]);assert.equal(session.bindingRevision,'r1')});
test('resume without Facebook cookie fails closed without password login',async()=>{const{automation,calls}=fixture(false);assert.deepEqual(await automation.login({...binding,credentials,scenario:'resume_external'}),{kind:'failure',code:'LOGIN_REQUIRED'});assert.deepEqual(calls,[])});
test('resume does not approve security challenge even with cookie',async()=>{const{automation,session}=fixture(true,'challenge');assert.deepEqual(await automation.login({...binding,credentials,scenario:'resume_external'}),{kind:'failure',code:'MANUAL_VERIFICATION_REQUIRED'});assert.equal(session.authorized,false)});
test('external adapter disposal closes its page, never the shared browser context',async()=>{const{automation,calls,session}=fixture();automation.sessions.set('key',session);await automation.dispose('key');assert.deepEqual(calls,['pageClosed'])});
test('expired service reference is rebuilt from validated browser after restart and after one hour',async()=>{
 let now=0;const adapter={login:async input=>{assert.equal(input.scenario,'resume_external');return {kind:'success'}}};
 const make=()=>createService({}, {now:()=>now,credentialResolver:async()=>credentials,adapters:{facebook:adapter}});
 let service=make();service.bindAccount({...binding,credentialRef:'bound-credential'});await service.startLogin({...binding,scenario:'resume_external'});const old=service.getSessionReference(binding);
 now=3600001;assert.throws(()=>service.getSessionReference(binding),{code:'SESSION_NOT_ACTIVE'});
 service=make();service.bindAccount({...binding,credentialRef:'bound-credential'});await service.startLogin({...binding,scenario:'resume_external'});assert.notEqual(service.getSessionReference(binding).sessionRef,old.sessionRef);
 assert.throws(()=>service.getSessionReference({...binding,sourceId:'other'}),{code:'ACCOUNT_SCOPE_MISMATCH'});
});
test('connector restores missing binding using resume only and shares concurrent renewal',async()=>{
 let starts=0;const connector=new FacebookBrowserConnector({}, {loginSessionClient:{configured:()=>true,getStatus:async()=>{throw Object.assign(Error(),{code:'ACCOUNT_NOT_FOUND'})},bindAccount:async input=>assert.equal(input.accountId,binding.accountId),startLogin:async input=>{starts++;assert.equal(input.scenario,'resume_external');return {status:'active'}}}});
 const input={source:{id:'s',platform:'facebook',config:{collectionMode:'browser'}},account:{id:'a',auth_status:'authorized'}};
 const results=await Promise.all([connector.accountHealth(input),connector.accountHealth(input)]);assert.equal(results.every(r=>r.authorized),true);assert.equal(starts,1);assert.equal((await connector.accountHealth(input)).authorized,true);assert.equal(starts,2);
});
test('connector reports true recovery failure instead of generic expiration',async()=>{const connector=new FacebookBrowserConnector({}, {loginSessionClient:{configured:()=>true,getStatus:async()=>({status:'session_expired'}),bindAccount:async()=>{},startLogin:async()=>({status:'session_expired',failureCode:'LOGIN_REQUIRED'})}});assert.equal((await connector.accountHealth({source:{id:'s',platform:'facebook',config:{collectionMode:'browser'}},account:{id:'a',auth_status:'authorized'}})).reason,'LOGIN_REQUIRED')});
