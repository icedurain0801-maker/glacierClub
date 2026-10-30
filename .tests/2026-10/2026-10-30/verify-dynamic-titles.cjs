const assert=require('node:assert/strict');
const {analyze}=require('../../../tools/dynamic-workbench/local-analyzer.js');
const researcher=analyze('10月28日下午，区人力资源局三级调研员余某走访企业，开展助企服务。');
assert.equal(researcher.position,'区人力资源局三级调研员');
assert.equal(researcher.level,'区级');
assert.equal(analyze('10月28日，市人力资源局二级调研员张某走访企业。').level,'市级');
assert.equal(analyze('10月28日，区人力资源局副局长张某走访企业。').level,'局级');
assert.equal(analyze('10月28日，区人力资源局一级主任科员张某走访企业。').position,'区人力资源局一级主任科员');
const cases=[
 ['10月28日下午，区政府党组成员、副区长陶梦媛同志主持召开观湖街道根治欠薪专题督导会议，区人力资源局、区住房和建设局分管负责同志，观湖街道主要及分管负责同志参会。\n    会议听取了观湖街道2026年以来欠薪治理工作开展情况，区人力资源局、区住建局通报相关工作数据与目标任务，梦媛同志对后续工作作出部署安排。','区政府召开观湖街道根治欠薪专题督导会议'],
 ['10月28日下午，龙华区政府副区长张某主持召开校园安全专项督导会议，相关部门参会。会议要求落实整改。','龙华区政府召开校园安全专项督导会议'],
 ['5月7日，市教育局副局长张某赴学校调研。会上研究校园安全问题，要求开展隐患排查并落实整改。','市教育局调研校园安全工作'],
 ['5月7日，区应急管理局组织开展专题培训。培训围绕消防安全，讲解火灾防范和应急逃生知识。','区应急管理局开展消防安全培训'],
 ['5月7日，区市场监督管理局局长张某带队检查。检查发现食品安全隐患，要求限期整改，尚未完成整改。','区市场监督管理局开展食品安全检查'],
 ['5月7日，龙华街道召开工作会议。会议研究垃圾分类和人居环境问题，部署环境卫生整治。','龙华街道研究部署环境整治'],
 ['5月7日，区人力资源局举办招聘活动。活动为求职人员提供就业咨询和岗位对接。','区人力资源局开展就业服务'],
 ['5月7日，景新社区开展宣传活动。现场宣讲消防安全知识，介绍火灾预防措施。','景新社区开展消防安全宣传'],
 ['5月7日，区应急管理局召开会议研究部署防汛工作。要求做好汛期排涝。','区应急管理局研究部署防汛工作'],
 ['5月7日，区民政局召开座谈会。会议围绕社会救助工作提出建议。','区民政局专题研究社会救助工作'],
 ['今天大家聚在一起。','待确认（未识别明确活动及议题）']
];
for(const [input,title]of cases){const actual=analyze(input);assert.equal(actual.title,title,input);assert.equal(actual.content,input);assert(!/圆满|取得|完成整改/.test(actual.title));}
// 同样的活动开头，后文议题改变，标题也应改变，而非固定截取首句。
const prefix='5月7日，区应急管理局组织开展专题培训。';
assert.notEqual(analyze(prefix+'培训讲解消防安全知识。').title,analyze(prefix+'培训讲解防汛排涝知识。').title);
// 参会单位和名单不影响主要机构/议题。
assert.equal(analyze('5月7日，区人力资源局召开座谈会研究欠薪问题。区教育局、消防部门、市场监督管理局等负责同志参加。').title,'区人力资源局专题研究欠薪治理工作');
console.log(JSON.stringify({titleCases:cases.length,fullTextTopicChangesTitle:true,attendeeNoiseIgnored:true,noFabricatedOutcome:true,originalContentUnchanged:true}));
