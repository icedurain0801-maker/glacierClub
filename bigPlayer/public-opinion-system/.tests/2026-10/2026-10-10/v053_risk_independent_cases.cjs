'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const manifest=JSON.parse(fs.readFileSync('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-8JLSfB/runtime-overlay-manifest.json'));
global.fetch=async()=>{throw Error('QA_EXTERNAL_NETWORK_FORBIDDEN');};
const checks=[];
function check(role,name,fn){try{fn();checks.push({role,name,status:'PASS'});}catch(e){checks.push({role,name,status:'FAIL',error:e.message});}}
for(const [role,o] of Object.entries(manifest.overlays)){
 const n=require(path.join(o.runtime,'server/src/services/riskSeverityNormalizer'));
 for(const [score,expected] of [[.499,'attention'],[.5,'urgent'],[.501,'urgent']])check(role,`score_${score}_confidence0`,()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'attention',negativeScore:score,confidence:0,gameComplaint:false}).severity,expected));
 check(role,'low_score_semantic_complaint',()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'attention',negativeScore:.01,confidence:0,gameComplaint:true}).severity,'urgent'));
 check(role,'already_urgent',()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'urgent',negativeScore:.01,gameComplaint:false}).severity,'urgent'));
 check(role,'neutral_question',()=>assert.equal(n.normalizeSeverity({sentiment:'neutral',severity:'normal',negativeScore:.99,body:'中奖率是不是调高了，还是参与人数太少了？'}).severity,'normal'));
 check(role,'positive_quality_idempotent',()=>{const x={sentiment:'positive',severity:'urgent',negativeScore:.99,gameComplaint:true,qualityScore:.98,recommendHome:true,recommendPin:true,recommendFeature:true};const y=n.normalizeAnalysisResult(n.normalizeAnalysisResult(x));assert.equal(y.severity,'normal');assert.equal(y.sentiment,'positive');assert.equal(y.rawAnalysis.severity,'urgent');assert.equal(y.qualityScore,.98);assert(y.recommendHome&&y.recommendPin&&y.recommendFeature);});
 const {AiAnalyzer}=require(path.join(o.runtime,'server/src/integrations/aiAnalyzer'));const ai=new AiAnalyzer({});
 const parse=(body,gc,ge)=>ai.parseResponse({choices:[{message:{content:JSON.stringify([{i:0,s:'negative',v:'attention',n:.1,c:0,gc,ge}])}}]},1,ai.profiles.light,[],[{body}])[0];
 check(role,'exact_complaint_evidence',()=>assert.equal(parse('Matchmaking is unfair; I cannot enjoy this game.',true,'Matchmaking is unfair').severity,'urgent'));
 check(role,'invented_evidence_rejected',()=>assert.equal(parse('Where is the bug FAQ?',true,'Matchmaking is unfair').severity,'attention'));
 check(role,'explicit_consultation_not_upgraded',()=>assert.equal(parse('请问bug修复公告在哪看？',false,'').severity,'attention'));
 check(role,'legacy_consultation_missing_semantic_flag',()=>assert.equal(n.normalizeAnalysisResult({sentiment:'negative',severity:'attention',negativeScore:.1,confidence:1},{body:'请问bug修复公告在哪看？'}).severity,'attention'));
}
const output={candidate:manifest.policyVersion,checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,externalRequests:0,productionTouched:false};
const target=path.resolve(__dirname,'../../../../../.temp',`qa-v053-risk-cases-${Date.now()}.json`);
fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...output,evidencePath:target},null,2));if(output.failed)process.exitCode=1;
