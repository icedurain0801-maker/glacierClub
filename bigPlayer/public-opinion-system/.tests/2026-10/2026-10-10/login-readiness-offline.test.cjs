'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BigPlayerH5PlaywrightAutomation}=require(require('node:path').resolve(__dirname, '../../../../../.temp/sync-auth-persistence-fix-20261010/login-release/login-session-service/src/adapters/bigPlayerH5Playwright'));
test('login waits for delayed app navigation, opens profile and then the real login frame',async()=>{
 let ticks=0,profile=false,frameOpen=false,submitted=false,closed=0;
 const input={first(){return this;},count:async()=>1,isVisible:async()=>true,click:async()=>{},fill:async()=>{}};
 const frame={url:()=> 'https://login1.q1.com/frame',locator:selector=>selector.includes('button')?{...input,click:async()=>{submitted=true;}}:input};
 const page={goto:async()=>{},frames:()=>frameOpen?[frame]:[],waitForTimeout:async()=>{ticks++;},evaluate:async()=>submitted?'synthetic-token':null,
 getByText(label){return {first(){return this;},count:async()=>label==='我的'?(ticks>=3?1:0):(profile?1:0),isVisible:async()=>true,click:async()=>{if(label==='我的')profile=true;else frameOpen=true;}};}};
 const context={newPage:async()=>page,close:async()=>{closed++;}},browser={newContext:async()=>context,close:async()=>{closed++;}};
 const a=new BigPlayerH5PlaywrightAutomation({credentialResolver:async()=>({baseUrl:'https://club.q1.com/?gameVersion=synthetic',account:'synthetic',password:'synthetic'}),playwright:{chromium:{launch:async()=>browser}}});
 const result=await a.login({sourceId:'s',accountId:'a',credentialRef:'synthetic'});
 assert.equal(result.kind,'success');assert(ticks>=3);assert(profile);assert(frameOpen);assert.equal(closed,2);
});
