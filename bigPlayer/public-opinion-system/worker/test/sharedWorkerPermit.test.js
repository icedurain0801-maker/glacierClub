'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSharedWorkerPermit}=require('../src/sharedWorkerPermit');
test('initial and poll work share a single bounded permit without double release',async()=>{const p=createSharedWorkerPermit(1),first=await p.acquire();let granted=false;const second=p.acquire().then(s=>{granted=true;return s;});await Promise.resolve();assert.equal(granted,false);assert.deepEqual(p.inventory(),{active:1,waiting:1,limit:1});first.release();first.release();const s=await second;assert.deepEqual(p.inventory(),{active:1,waiting:0,limit:1});s.release();assert.equal(p.inventory().active,0);});
test('invalid concurrency never admits work',()=>{for(const n of [0,-1,1.1,1001,NaN])assert.throws(()=>createSharedWorkerPermit(n));});
