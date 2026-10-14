'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {patch,FILES}=require('./prepare-overseas-shared-exclusion');
const base='C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1';
const project=path.resolve(__dirname,'..');
const repoRoot=path.resolve(project,'../..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const win=value=>value.replace(/\//g,'\\');
function write(filename,value){fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,value,{flag:'wx'});}
function main(){
  const stamp=Date.now();
  const packageRoot=path.join(repoRoot,'.temp',`overseas-production-delivery-${stamp}`);
  const sharedName=`worker-release-v055-overseas-exclusion-${stamp}`;
  const dailyName=`overseas-daily-release-${stamp}`;
  const sharedRoot=path.join(packageRoot,sharedName),dailyRoot=path.join(packageRoot,dailyName);
  const sharedTarget=path.join('C:/ProgramData/PublicOpinion/releases',sharedName);
  const dailyTarget=path.join('C:/ProgramData/PublicOpinion/overseas-daily/releases',dailyName);
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'package-worker-release-manifest.json'),'utf8'));
  for(const file of manifest.files){
    if(path.isAbsolute(file.path)||file.path.split(/[\\/]/).includes('..')||/(^|\/)\.env($|\.)/.test(file.path))throw new Error('BASE_PACKAGE_PATH_REJECTED');
    const original=fs.readFileSync(path.join(base,file.path));
    const candidate=FILES.includes(file.path)?Buffer.from(patch(file.path,original.toString('utf8').replace(/\r\n/g,'\n')).replace(/\n/g,'\r\n')):original;
    write(path.join(sharedRoot,file.path),candidate);
    if(file.path.startsWith('node_modules/'))write(path.join(dailyRoot,file.path),original);
  }
  const closure=new Set();
  function include(relative){
    relative=relative.replace(/\\/g,'/');if(closure.has(relative))return;closure.add(relative);
    const filename=path.join(project,relative),body=fs.readFileSync(filename);
    write(path.join(dailyRoot,relative),body);
    if(!relative.endsWith('.js'))return;
    for(const match of body.toString('utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)){
      if(!match[1].startsWith('.'))continue;
      const resolved=require.resolve(path.resolve(path.dirname(filename),match[1]));
      const next=path.relative(project,resolved);
      if(next.startsWith('..')||path.isAbsolute(next))throw new Error('DEPENDENCY_OUTSIDE_PROJECT');
      include(next);
    }
  }
  include('worker/src/overseasProductionDaily.js');
  include('scripts/overseas-worker-switch-gate.js');
  const guard={sourceId:'081a16d2-5545-4afd-9c65-e04777e4540b',releaseRoot:win(sharedTarget),files:FILES.map(relative=>({path:relative,sha256:sha(fs.readFileSync(path.join(sharedRoot,relative)))}))};
  write(path.join(dailyRoot,'shared-exclusion.json'),JSON.stringify(guard,null,2)+'\n');
  const launcher=[
    '@echo off','setlocal','set "PUBLIC_OPINION_SERVICE_MODE=1"',
    'set "PUBLIC_OPINION_ENV_FILE=C:\\ProgramData\\PublicOpinion\\config\\public-opinion.env"',
    'set "OVERSEAS_DAILY_EXECUTION_ENABLED=true"',
    'set "OVERSEAS_DAILY_STATE_DIRECTORY=C:\\ProgramData\\PublicOpinion\\overseas-daily\\state"',
    `set "OVERSEAS_SHARED_EXCLUSION_MANIFEST=${win(path.join(dailyTarget,'shared-exclusion.json'))}"`,
    'set "OVERSEAS_DAILY_MAX_REQUESTS=84"','set "OVERSEAS_DAILY_MAX_PAGES_PER_SITE=10"',
    'set "DAILY_MODE=--execute"',
    'if "%~1"=="--preflight" set "DAILY_MODE=--preflight"',
    'if not "%~1"=="" if not "%~1"=="--preflight" exit /b 1',
    `cd /d "${win(path.join(dailyTarget,'worker'))}"`,
    'if errorlevel 1 exit /b 1',
    `"C:\\Program Files\\nodejs\\node.exe" "${win(path.join(dailyTarget,'worker/src/overseasProductionDaily.js'))}" %DAILY_MODE% >> "C:\\ProgramData\\PublicOpinion\\overseas-daily\\logs\\daily.log" 2>&1`,
    'exit /b %errorlevel%',''
  ].join('\r\n');
  write(path.join(dailyRoot,'worker/last-night-overseas-daily.cmd'),launcher);
  function releaseManifest(root,kind){
    const entries=[];
    function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isDirectory())walk(filename);else if(item.isFile())entries.push({path:path.relative(root,filename).replace(/\\/g,'/'),sha256:sha(fs.readFileSync(filename))});else throw new Error('REPARSE_PACKAGE_REJECTED');}}
    walk(root);write(path.join(root,'package-worker-release-manifest.json'),JSON.stringify({algorithm:'sha256',kind,files:entries},null,2)+'\n');
  }
  releaseManifest(sharedRoot,'worker');releaseManifest(dailyRoot,'overseas-daily');
  write(path.join(packageRoot,'delivery.json'),JSON.stringify({status:'PREPARED_NOT_DEPLOYED',base,sharedRoot,sharedTarget:win(sharedTarget),dailyRoot,dailyTarget:win(dailyTarget),sharedChanges:FILES,dailyDependencies:closure.size,launcher:win(path.join(dailyTarget,'worker/last-night-overseas-daily.cmd')),stateDirectory:'C:\\ProgramData\\PublicOpinion\\overseas-daily\\state'},null,2)+'\n');
  fs.copyFileSync('C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml',path.join(packageRoot,'PublicOpinionWorker.before.xml'),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(__dirname,'overseas-production-switch.ps1'),path.join(packageRoot,'overseas-production-switch.ps1'),fs.constants.COPYFILE_EXCL);
  console.log(JSON.stringify({status:'PREPARED_NOT_DEPLOYED',packageRoot,sharedFiles:manifest.files.length,sharedChangedFiles:FILES.length,dailyDependencies:closure.size}));
}
if(require.main===module)main();
