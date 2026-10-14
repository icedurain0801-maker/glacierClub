'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SHARED_CLOSED_WINDOW,routePlan}=require('../src/lastNightDailyRoute');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
const release='C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/sourceScheduler.js';
const {activeWindowAllows,scheduleSources}=require(release);
test('real release scheduler interprets explicit route window closed at every minute, domestic untouched',()=>{
 const window=JSON.parse(SHARED_CLOSED_WINDOW);
 for(let minute=0;minute<1440;minute++)assert.equal(activeWindowAllows(window,new Date(Date.UTC(2026,9,9,0,minute))),false);
 assert.equal(activeWindowAllows(null,new Date('2026-10-09T18:00:00Z')),true);
});
test('both startup orders after route admission allow only independent execution; existing shared pre-route slot must drain first',async()=>{
 for(const order of [['windows','shared'],['shared','windows']]){
  let independent=0,sharedAcquire=0,sharedEnqueue=0;
  const source={id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,region_code:'overseas',platform:'bigplayer_h5',enabled:1,game_enabled:1,community_status:'enabled',default_account_id:'a',auth_status:'authorized',active_window:SHARED_CLOSED_WINDOW,frequency_seconds:86400};
  const account={id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',enabled:1,auth_status:'authorized'};
  for(const actor of order)if(actor==='windows')independent++;else await scheduleSources({sources:[source],accounts:[account],now:new Date('2026-10-09T18:00:00Z'),connectorCapabilities:{bigplayer_h5:{available:true,supportsScheduling:true}},leaseAdapter:{acquire:async()=>{sharedAcquire++;return{acquired:true};}},enqueue:async()=>{sharedEnqueue++;}});
  assert.equal(independent,1);assert.equal(sharedAcquire,0);assert.equal(sharedEnqueue,0);
 }
 const source={id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,platform:'bigplayer_h5',enabled:1,region_code:'overseas',community_status:'enabled',schedule_version:1,frequency_seconds:21600,active_window:null,config:'{}'};
 const state={source_id:SOURCE_ID,schedule_version:1,lease_epoch:1534};const plan=routePlan(source,state);assert.equal(plan.after.version,2);assert.equal(plan.after.frequencySeconds,86400);assert.equal(source.active_window,null);
 state.lease_epoch++;assert.notEqual(routePlan(source,state).hash,plan.hash);
});
