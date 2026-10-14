'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { syncStagePage } = require('../src/worker');
const { createSourceDepsResolver } = require('../src/overseasBigPlayerSourceRouter');
const { preflightOverseasNetwork } = require('../src/overseasBigPlayerNetworkPreflight');
test('truthy nonboolean flags reject overseas; non-target preflight makes zero calls',async()=>{
 for(const flag of ['true',1,{}])await assert.rejects(()=>preflightOverseasNetwork({overseasAtomicPageJobs:flag,repo:{}},{source:{platform:'bigplayer_h5',region_code:'overseas'}}),{code:'OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND'});
 let calls=0;
 for(const source of [{platform:'bigplayer_h5',region_code:'domestic'},{platform:'discord',region_code:'overseas'}]){
  assert.equal(await preflightOverseasNetwork({overseasAtomicPageJobs:true,getOverseasRunContract:async()=>{calls++;}},{source}),null);
 }
 assert.equal(calls,0);
});
test('invalid network contract prevents every connector/transport call', async () => {
  let calls = 0;
  const stage = { source: { platform: 'bigplayer_h5', region_code: 'overseas' }, account: {}, syncRunId: 'r', connector: { listComments: async () => { calls++; } } };
  await assert.rejects(() => syncStagePage({ overseasAtomicPageJobs: true, getOverseasRunContract: async () => ({}), verifyOverseasNetworkContract: async () => false }, stage));
  assert.equal(calls, 0);
});
test('forged atomic flag fails before contract loading and connector calls', async()=>{
 let calls=0;
 const stage={source:{platform:'bigplayer_h5',region_code:'overseas'},account:{},connector:{listPosts:async()=>{calls++;}}};
 await assert.rejects(()=>syncStagePage({repo:{upsertContentPage:async()=>({})},overseasAtomicPageJobs:true,
  getOverseasRunContract:async()=>{calls++;return {};},verifyOverseasNetworkContract:async()=>true},stage),{code:'OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND'});
 assert.equal(calls,0);
});
test('explicit non-target route preserves source, deps, and zero identity SQL', async () => {
  let reads = 0; const baseDeps = { repo: {}, connectors: {} };
  const resolve = createSourceDepsResolver({ baseDeps, loadIdentity: async () => { reads++; }, createOverseasAdapter: async () => null, loadRunContract: async () => null });
  for (const source of [{ platform: 'bigplayer_h5', region_code: 'domestic' }, { platform: 'discord', region_code: 'overseas' }]) {
    const result = await resolve(source); assert.equal(result.source, source); assert.equal(result.deps, baseDeps);
  }
  assert.equal(reads, 0);
});
