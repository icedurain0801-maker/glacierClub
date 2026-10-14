'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-nc7FdP/runtime-overlay-manifest.json'));
global.fetch=async()=>{throw Error('QA_EXTERNAL_NETWORK_FORBIDDEN');};
const cases=[
 ['prior_failure','请问bug修复公告在哪看？','attention'],
 ['english_bug_question','Where is the bug FAQ?','attention'],
 ['english_crash_question','Where can I find the crash troubleshooting guide?','attention'],
 ['bare_bug','bug','attention'],['bare_crash','崩溃','attention'],
 ['mechanism_question','匹配机制是怎么计算的？','attention'],
 ['bug_reporting_question','请问有bug反馈入口吗？','attention'],
 ['vulnerability_reporting_question','请问漏洞反馈入口在哪里？','attention'],
 ['real_bug','今天早上游戏出bug了，导致一直无法正常玩。','urgent'],
 ['real_crash','游戏一直崩溃，无法正常进入。','urgent'],
 ['real_english_crash','The game keeps crashing and I cannot play.','urgent']
];
const checks=[];function check(role,name,fn){try{fn();checks.push({role,name,status:'PASS'});}catch(e){checks.push({role,name,status:'FAIL',error:e.message});}}
for(const [role,o] of Object.entries(manifest.overlays)){
 const n=require(path.join(o.runtime,'server/src/services/riskSeverityNormalizer'));
 for(const [name,body,expected] of cases)check(role,name,()=>assert.equal(n.normalizeAnalysisResult({sentiment:'negative',severity:'attention',negativeScore:.1,confidence:0},{body}).severity,expected));
 check(role,'content_over_model_reason',()=>assert.equal(n.normalizeAnalysisResult({sentiment:'negative',severity:'attention',negativeScore:.1,topics:['游戏一直崩溃'],reason:'游戏出bug了'},{body:'请问公告在哪？'}).severity,'attention'));
 check(role,'explicit_true',()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'attention',negativeScore:.1,gameComplaint:true,body:'奖励价值太差'}).severity,'urgent'));
 check(role,'explicit_false',()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'attention',negativeScore:.1,gameComplaint:false,body:'请问游戏出bug了如何反馈？'}).severity,'attention'));
 check(role,'positive_priority',()=>assert.equal(n.normalizeSeverity({sentiment:'positive',severity:'urgent',negativeScore:1,gameComplaint:true,body:'游戏一直崩溃的解决方案分享'}).severity,'normal'));
 check(role,'score50_confidence0',()=>assert.equal(n.normalizeSeverity({sentiment:'negative',severity:'attention',negativeScore:.5,confidence:0,gameComplaint:false}).severity,'urgent'));
}
const output={candidate:'candidate-nc7FdP',checks,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,productionTouched:false,externalRequests:0};
const target=path.resolve(__dirname,'../../../../../.temp',`qa-v054-risk-recheck-${Date.now()}.json`);fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...output,evidencePath:target},null,2));if(output.failed)process.exitCode=1;
