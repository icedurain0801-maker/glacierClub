'use strict';
// Package only a new independent daily release. The active shared worker and
// its exclusion manifest remain the already deployed release.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function main(){
  if(process.argv.length!==3)throw new Error('EXPECTED_EXISTING_PACKAGE_ROOT');
  const original=JSON.parse(fs.readFileSync(path.join(process.argv[2],'delivery.json'),'utf8'));
  const project=path.resolve(__dirname,'..'),repo=path.resolve(project,'../..'),stamp=Date.now();
  const packageRoot=path.join(repo,'.temp',`overseas-production-patch-${stamp}`);
  const dailyName=`overseas-daily-release-handoff-${stamp}`;
  const dailyRoot=path.join(packageRoot,dailyName);
  const dailyTarget=path.join('C:/ProgramData/PublicOpinion/overseas-daily/releases',dailyName).replace(/\//g,'\\');
  const base=original.dailyTarget;
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'package-worker-release-manifest.json'),'utf8'));
  for(const file of manifest.files){
    if(path.isAbsolute(file.path)||file.path.split(/[\\/]/).includes('..'))throw new Error('INVALID_DAILY_BASE_PATH');
    const destination=path.join(dailyRoot,file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});
    let body=fs.readFileSync(path.join(base,file.path));
    if(file.path==='worker/src/overseasProductionDaily.js')body=fs.readFileSync(path.join(project,file.path));
    if(file.path==='worker/last-night-overseas-daily.cmd')body=Buffer.from(body.toString('utf8').split(base).join(dailyTarget));
    fs.writeFileSync(destination,body,{flag:'wx'});
  }
  const entries=manifest.files.map(file=>({path:file.path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dailyRoot,file.path))).digest('hex')}));
  fs.writeFileSync(path.join(dailyRoot,'package-worker-release-manifest.json'),JSON.stringify({algorithm:'sha256',kind:'overseas-daily',files:entries},null,2)+'\n',{flag:'wx'});
  const delivery={...original,status:'PREPARED_DAILY_PATCH_NOT_INSTALLED',dailyRoot,dailyTarget,launcher:path.join(dailyTarget,'worker/last-night-overseas-daily.cmd').replace(/\//g,'\\'),previousDailyTarget:base};
  fs.writeFileSync(path.join(packageRoot,'delivery.json'),JSON.stringify(delivery,null,2)+'\n',{flag:'wx'});
  fs.copyFileSync(path.join(__dirname,'overseas-production-switch.ps1'),path.join(packageRoot,'overseas-production-switch.ps1'),fs.constants.COPYFILE_EXCL);
  console.log(JSON.stringify({status:delivery.status,packageRoot,dailyTarget,sharedWorkerRestartRequired:false,changedDailyFiles:['worker/src/overseasProductionDaily.js','worker/last-night-overseas-daily.cmd']}));
}
if(require.main===module)main();
