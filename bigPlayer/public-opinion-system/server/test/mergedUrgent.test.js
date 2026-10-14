const test=require('node:test'),assert=require('node:assert/strict');
const RiskModes=require('../../shared/riskModes');
const{Repository}=require('../src/db/repository');
test('merged urgent mode covers negative and urgent and legacy links remain valid',()=>{
for(const mode of ['negative','urgent']){assert.deepEqual(RiskModes.severitiesForRiskMode(mode),['negative','urgent']);for(const severity of ['negative','urgent']){const filters=RiskModes.normalizeRiskFilters({riskMode:mode,severity,sentiment:'positive'});assert.equal(filters.severity,'urgent');assert.equal(filters.sentiment,undefined);}}
assert.deepEqual(RiskModes.severitiesForRiskMode('attention'),['attention']);
assert.throws(()=>RiskModes.normalizeRiskFilters({riskMode:'urgent',severity:'attention'}),/conflict/);
});
test('merged SQL filters both levels before count and pagination',async()=>{
const repo=Object.create(Repository.prototype);const clauses=[],params=[];repo.addRiskModeFilter(clauses,params,'urgent');assert.deepEqual(params,['negative','urgent']);assert(clauses.includes('a.severity IN (?,?)'));
const calls=[];repo.countContents=async query=>{calls.push(query);return query.riskMode?RiskModes.severitiesForRiskMode(query.riskMode).length:0;};const stats=await repo.getContentStats({communityId:'community'},{includeBreakdown:true});assert.equal(stats.urgent,2);assert.equal(stats.urgentPostCount,2);assert.equal(stats.urgentCommentCount,2);assert(calls.every(x=>x.communityId==='community'));
});
