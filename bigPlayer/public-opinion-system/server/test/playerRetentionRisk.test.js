const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeAnalysisResult}=require('../src/services/riskSeverityNormalizer');
function result(body){return normalizeAnalysisResult({sentiment:'negative',severity:'attention',confidence:0.9,riskDecision:{level:'L1',claim_type:'emotion',issue_object:'',claim_evidence:body,issue_summary:null,confidence:0.9,hit_rules:['G1'],rule_evidence:{},evidence_types:[]}}, {body});}
test('serious player churn reports become urgent even when model calls them emotion',()=>{
 for(const body of ['玩家流失严重，公司策划管理设计 太水','因为玩家流失严重','公会成员过半流失','大量玩家退游']) {const r=result(body);assert.equal(r.severity,'urgent',body);assert(r.riskDecision.hit_rules.includes('R14'));assert.equal(r.riskDecision.claim_type,'allegation');}
});
test('concrete matchmaking complaints become negative independently',()=>{
 assert.equal(result('匹配机制成谜，我们全员无梦蕊，只有3-4个永夜，对方几乎人均真理了，这种盟按说怎么也匹不到我们啊').severity,'negative');
 assert.equal(result('匹配不公平').severity,'negative');
});
test('legacy results without riskDecision also use explicit source reports',()=>{
 assert.equal(normalizeAnalysisResult({sentiment:'negative',severity:'attention',confidence:0.94},{body:'玩家流失严重，公司策划管理设计 太水'}).severity,'urgent');
 assert.equal(normalizeAnalysisResult({sentiment:'negative',severity:'attention',confidence:0.94},{body:'匹配机制成谜，我们只有3个永夜，对方几乎人均真理'}).severity,'negative');
});
test('bare topic, personal quitting, hypothetical, denial and resolved reports do not become urgent',()=>{
 for(const body of ['匹配机制','沙币匹配','我弃坑了','如果玩家流失严重怎么办','玩家流失不严重','没有玩家流失严重的问题','玩家流失严重已改善','玩家流失严重已解决']) assert.notEqual(result(body).severity,'urgent',body);
 assert.equal(result('谢谢大佬').severity,'attention');
});
