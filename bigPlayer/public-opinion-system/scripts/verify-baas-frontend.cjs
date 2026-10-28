'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Company gateway with DNS independent of this workstation's hosts file.
// club-opinion.q1.com is a local-only Apache alias and must never ship in hosting.
const HOSTED_API='https://lfy3001.dev.q1op.com/api/public-opinion';
function verify(report){
  const fail=message=>{throw new Error(message)};
  if(report.api!==HOSTED_API)fail('BaaS frontend must use the supported HTTPS API');
  const root=path.resolve(report.output),pages=['index','content','alerts','sources','collection-runs','keywords','permissions','api-config','single-post-analysis'];
  const inside=file=>file.startsWith(root+path.sep);
  const files=new Set(report.files.map(item=>item.path));
  for(const page of pages){const relative=`admin/PublicOpinion/${page}.html`;if(!files.has(relative))fail('Missing page: '+relative);const html=fs.readFileSync(path.join(root,relative),'utf8');if(!html.includes(`window.PUBLIC_OPINION_API=${JSON.stringify(HOSTED_API)};window.PUBLIC_OPINION_REQUIRE_SSO=true;`))fail('Missing supported API/SSO bootstrap: '+relative);}
  for(const item of report.files){const file=path.resolve(root,item.path);if(!inside(file)||!fs.existsSync(file))fail('Missing or escaped package file: '+item.path);if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==item.sha256)fail('Package hash mismatch: '+item.path);if(/\.(html|js)$/.test(file)){const text=fs.readFileSync(file,'utf8');if(/https?:\/\/(?:club-opinion\.q1\.com|localhost|127\.\d+\.\d+\.\d+|\[::1\])(?=[:/"'\s]|$)/i.test(text))fail('Local-only endpoint found: '+item.path);if(file.endsWith('.js'))new Function(text);if(file.endsWith('.html'))for(const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const ref=match[1].split(/[?#]/)[0];if(!ref||/^(?:https?:|data:|mailto:|javascript:)/.test(ref))continue;const target=ref.startsWith('/')?path.resolve(root,'.'+ref):path.resolve(path.dirname(file),ref);if(!inside(target)||!fs.existsSync(target))fail('Missing or escaped static dependency: '+item.path+' -> '+ref);}}}
  return {passed:true,api:report.api,pages:pages.length,files:files.size};
}
if(require.main===module){const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));console.log(JSON.stringify(verify(report)));}
module.exports={HOSTED_API,verify};
