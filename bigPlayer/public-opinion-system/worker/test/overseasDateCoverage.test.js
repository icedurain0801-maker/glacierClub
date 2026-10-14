const test=require('node:test'),assert=require('node:assert/strict');
const {selectDueSlot,todaySlot}=require('../src/overseasProductionDaily');
const {runScheduled}=require('../src/overseasProductionDaily');
test('scheduled execution uses configured slots rather than manual refresh',async()=>{const calls=[];await runScheduled(['--execute'],async(argv,options)=>{calls.push(options?.refreshToday||false);return {status:'completed'};});assert.deepEqual(calls,[false]);});
test('failed rolling run stops for checkpoint recovery',async()=>{let calls=0;await runScheduled(['--execute'],async()=>{calls++;return {status:'partial'};});assert.equal(calls,1);});
test('catchup chooses oldest due day rather than latest day',()=>{const s=selectDueSlot('2026-10-10 18:00:00.000',new Date('2026-10-12T01:00:00Z'));assert.equal(s.scheduledAt,'2026-10-10T18:00:00.000Z');assert.equal(s.windowStart,'2026-10-09T16:00:00.000Z');});
test('caught up schedule does not repeat completed day',()=>assert.equal(selectDueSlot('2026-10-12 18:00:00.000',new Date('2026-10-12T01:00:00Z')),null));
test('all four six-hour slots span previous Beijing midnight to execution time',()=>{for(const hour of [2,8,14,20]){const now=new Date(Date.UTC(2026,9,12,hour-8));const s=todaySlot(now);assert.equal(s.windowStart,'2026-10-10T16:00:00.000Z');assert.equal(s.windowEnd,now.toISOString());assert.equal(s.kind,'today');assert.equal((+now-Date.parse(s.windowStart))/3600000,24+hour);}});
test('rolling previous midnight respects month boundary',()=>{const s=todaySlot(new Date('2026-10-31T18:00:00Z'));assert.equal(s.windowStart,'2026-10-30T16:00:00.000Z');});
