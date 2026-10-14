'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const project=path.resolve(__dirname,'..');
const root=path.resolve(project,'../..','.temp/bigplayer-recovery-20261009');
const output=fs.mkdtempSync(path.join(root,'lastnight-runtime-'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const {inventory}=require('./lastnight-runtime-inventory');
const files=inventory();
const evidenceDirectory=path.join(output,'protected-store-evidence');fs.mkdirSync(evidenceDirectory);
const plan={approved:false,authorizationMode:'lastnight-bounded-current-runtime',cliSha256:sha(path.join(project,'scripts/lastnight-bounded-runtime.js')),
  stage:'metadata',tokenMode:'direct-api-token',accountId:null,expectedIdentity:null,languageId:'2',
  nodeVersion:process.version,publishedFrom:null,publishedTo:null,evidenceDirectory,
  envFile:'C:/ProgramData/PublicOpinion/config/public-opinion.env',output:path.join(output,'metadata-result.json'),files};
fs.writeFileSync(path.join(output,'plan.unapproved.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
for(const stage of ['store-ai','restore-content','requeue-exact','observe-ai']) {
  const candidate={...plan,stage,output:path.join(output,`${stage}-result.json`),journalFile:null,journalSha256:null,analysisVersion:null};
  fs.writeFileSync(path.join(output,`${stage}.unapproved.json`),JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
}
for(const stage of ['inspect-alignment','apply-alignment']) {
  fs.writeFileSync(path.join(output,`${stage}.unapproved.json`),JSON.stringify({...plan,stage,alignmentCliSha256:sha(path.join(project,'scripts/lastnight-precise-alignment.js')),alignmentPlanHash:null,output:path.join(output,`${stage}-result.json`)},null,2)+'\n',{flag:'wx'});
}
for(const stage of ['inspect-handoff','apply-handoff','recover-site16-first-page','recover-catchup-bounded-pages','recover-site2-page','resume-recovery-page']) {
  fs.writeFileSync(path.join(output,`${stage}.unapproved.json`),JSON.stringify({...plan,stage,handoffCliSha256:sha(path.join(project,'scripts/lastnight-catchup-handoff.js')),snapshotHash:null,ownerId:null,recoveryInputFile:null,recoveryInputSha256:null,journalFile:null,journalSha256:null,output:path.join(output,`${stage}-result.json`)},null,2)+'\n',{flag:'wx'});
}
// Candidate only, NOT the existing Ready task's missing live entry path.
const cmd=['@echo off','setlocal EnableExtensions',
  'if not "%~1"=="--approved-plan" exit /b 2','if "%~2"=="" exit /b 2',
  'if not exist "C:\\Program Files\\nodejs\\node.exe" exit /b 9009',
  `"C:\\Program Files\\nodejs\\node.exe" "${path.join(project,'scripts/lastnight-bounded-runtime.js')}" --approved-plan "%~2"`,
  'exit /b %ERRORLEVEL%',''].join('\r\n');
fs.writeFileSync(path.join(output,'last-night-overseas-daily.candidate.cmd'),cmd,{flag:'wx'});
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({status:'QA_PENDING_NOT_DEPLOYED',nodeVersion:process.version,dependencyPolicy:'recursive-first-party-and-all-installed-node_modules-bytes-plus-lock-no-upgrade',files,commandSha256:sha(path.join(output,'last-night-overseas-daily.candidate.cmd'))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,plan:path.join(output,'plan.unapproved.json'),manifest:path.join(output,'manifest.json')}));
