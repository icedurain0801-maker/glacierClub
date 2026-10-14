'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {limits,assertHistoryUsage,assertHistoryNextPage}=require('../../server/src/db/overseasHistoryBudget');
test('fixed RSS and heap boundaries deny at the limit without runtime override',()=>{
 assert.equal(Object.isFrozen(limits),true);
 assert.doesNotThrow(()=>assertHistoryUsage({elapsedMs:9999,rss:limits.maxRssBytes-1,heapUsed:limits.maxHeapBytes-1}));
 for(const patch of [{rss:limits.maxRssBytes},{heapUsed:limits.maxHeapBytes}])assert.throws(()=>assertHistoryUsage({elapsedMs:0,rss:1,heapUsed:1,...patch}),{code:'OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET'});
 assert.throws(()=>assertHistoryUsage({elapsedMs:10000,rss:1,heapUsed:1}),{code:'OVERSEAS_COVERAGE_HISTORY_BUDGET'});
});
test('next page at 10000 is denied; final page is allowed to finish before next-page check',()=>{
 assert.doesNotThrow(()=>assertHistoryNextPage(9999));assert.throws(()=>assertHistoryNextPage(10000),{code:'OVERSEAS_COVERAGE_HISTORY_BUDGET'});
 assert.throws(()=>assertHistoryNextPage(-1),{code:'OVERSEAS_COVERAGE_HISTORY_INVALID'});
});
