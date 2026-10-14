'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const project=path.resolve(__dirname,'..');
const root=path.resolve(project,'../..','.temp/bigplayer-recovery-20261009');
const candidate=path.join(root,'v019-read-compat-vgfxk2');
const baseline='C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tasks=['BigPlayer Last Night Overseas Daily 02','BigPlayer Q1 Daily 02','BigPlayer Keep Server Alive'];
const entries=[path.join(project,'worker/last-night-overseas-daily.cmd'),path.join(project,'worker/q1-daily.cmd'),path.join(project,'scripts/run-hidden.vbs')];
const files=[...['server/src/app.js','server/src/db/repository.js','package-release-manifest.json'].map(file=>path.join(candidate,file)),
  ...['server/src/app.js','server/src/db/repository.js','package-release-manifest.json'].map(file=>path.join(baseline,file)),
  'C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml','C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml',
  'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js',
  'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/assets/sources.js',
  ...tasks.map(name=>'C:/Windows/System32/Tasks/'+name),...entries.filter(file=>fs.existsSync(file))];
const outputDir=fs.mkdtempSync(path.join(root,'domestic-approval-plan-'));
const plan={approved:false,executorSha256:hash(path.join(project,'scripts/domestic-readonly-executor.js')),
  authorizationMode:'current-runtime-protected-readonly',
  envFile:'C:/ProgramData/PublicOpinion/config/public-opinion.env',expectedIdentity:null,
  identitySource:'Existing runtime env DB_USER and manager-observed CURRENT_USER() exact identity; existing privileges allowed by user authorization. Identity/database/port remain bound; protected transport permits SELECT only. No account creation, permission change or account substitution.',
  output:path.join(outputDir,'readonly-result.json'),baselineFiles:files,expectedBefore:Object.fromEntries(files.map(file=>[file,hash(file)])),
  entryExistence:entries.map(file=>({file,exists:fs.existsSync(file),sha256:fs.existsSync(file)?hash(file):null})),
  taskStates:{'BigPlayer Last Night Overseas Daily 02':'Ready','BigPlayer Q1 Daily 02':'Ready','BigPlayer Keep Server Alive':'Disabled'},
  note:'Template only. approved:false is rejected before credentials or DB access. Approval must bind exact expectedIdentity and this complete inventory; preserve task definitions/states, natural run time/count changes are not config changes.'};
fs.writeFileSync(path.join(outputDir,'plan.unapproved.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({plan:path.join(outputDir,'plan.unapproved.json'),executorSha256:plan.executorSha256,baselineCount:files.length,missingEntries:plan.entryExistence.filter(item=>!item.exists)}));
