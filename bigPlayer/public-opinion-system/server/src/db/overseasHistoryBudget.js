'use strict';
// Fixed safety admission checks, not OS-enforced RSS limits or hard deadlines.
const limits=Object.freeze({maxRoots:10000,maxMs:10000,maxRssBytes:256*1024*1024,maxHeapBytes:96*1024*1024});
const fail=code=>{throw Object.assign(Error(code),{code});};
function assertHistoryUsage({elapsedMs,rss,heapUsed}={}){
 if(![elapsedMs,rss,heapUsed].every(v=>Number.isFinite(v)&&v>=0))fail('OVERSEAS_COVERAGE_HISTORY_USAGE_INVALID');
 if(rss>=limits.maxRssBytes||heapUsed>=limits.maxHeapBytes)fail('OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET');
 if(elapsedMs>=limits.maxMs)fail('OVERSEAS_COVERAGE_HISTORY_BUDGET');
}
function assertHistoryNextPage(count){if(!Number.isSafeInteger(count)||count<0)fail('OVERSEAS_COVERAGE_HISTORY_INVALID');if(count>=limits.maxRoots)fail('OVERSEAS_COVERAGE_HISTORY_BUDGET');}
module.exports={limits,assertHistoryUsage,assertHistoryNextPage};
