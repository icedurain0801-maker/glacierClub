'use strict';
// Mechanical isolated copy and integrity/evidence generation only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const project=path.resolve(__dirname,'..'),repositoryRoot=path.resolve(project,'../..');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function extras(){return ['server/test','worker/test','migrations','scripts/q1_crawler.py',...fs.readdirSync(path.join(project,'scripts')).filter(n=>/\.(js|cjs|ps1|cmd)$/.test(n)).map(n=>'scripts/'+n),...fs.readdirSync(path.join(project,'worker')).filter(n=>/\.(cmd|ps1)$/.test(n)).map(n=>'worker/'+n)];}
function exclusions(file){
 if(file==='server/test/app.routes.test.js')return 'REAL_DB_ROUTE_INTEGRATION_NOT_ISOLATED';
 if(file==='server/test/runtimeEnv.test.js')return 'ENV_FILE_INTEGRATION_NOT_RUN_UNDER_DENY_GUARD';
 if(file==='worker/test/q1DailyJob.test.js')return 'TRANSITIVE_CHILD_PROCESS_CONTRACT';
 if(file.startsWith('server/test/v019'))return 'SEPARATE_RELEASE_OR_ENV_MOCK_CONTRACT';
 if(file==='server/test/publicOpinionSourcesMultisite.contract.test.js')return 'PROJECT_EXTERNAL_UI_ASSETS';
 if(/child_process|loadEnvFile|\.listen\(/.test(fs.readFileSync(path.join(project,file),'utf8')))return 'CHILD_SOCKET_OR_ENV_CONTRACT_REQUIRES_SEPARATE_ISOLATION';
 return null;
}
function allTests(){return ['server','worker'].flatMap(dir=>fs.readdirSync(path.join(project,dir,'test')).filter(n=>n.endsWith('.test.js')).map(n=>dir+'/test/'+n)).sort();}
function testFiles(){return allTests().filter(file=>!exclusions(file));}
function freeze(){
 const temp=path.join(repositoryRoot,'.temp');for(const p of [repositoryRoot,temp]){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(p)!==p)throw Error('FREEZE_PATH_INVALID');}
 const target=fs.mkdtempSync(path.join(temp,'overseas-qa-candidate17-manual-'));
 const extraFiles=extras(),source=require('./overseas-candidate-inventory').inventory(extraFiles);
 for(const e of source.files){const relative=path.relative(project,e.path),dest=path.join(target,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});
  if(e.kind==='file')fs.copyFileSync(e.path,dest,fs.constants.COPYFILE_EXCL);
  else if(e.kind==='workspace-link')fs.symlinkSync(path.join(target,path.basename(e.path)==='public-opinion-system-server'?'server':'worker'),dest,'junction');
  else throw Error('FREEZE_KIND_INVALID');
 }
 require('./overseas-candidate-inventory').verifyInventory(source,extraFiles);
 const inventory=require(path.join(target,'scripts/overseas-candidate-inventory')).inventory(extraFiles);
 const manifest={format:'overseas-manual-candidate17-safe-v2',snapshotRoot:target,nodeVersion:process.version,mariaDbVersion:'10.4.14-MariaDB',scope:'isolated manual ledger/audit/recovery/security entry; scheduled disabled',productionActivationAllowed:false,extraFiles,testFiles:testFiles(),excludedTests:allTests().filter(exclusions).map(file=>({file,status:'NOT_TESTED',reason:exclusions(file)})),offlinePolicy:'sanitized env; immutable DB/env/socket/listen/DNS/UDP/child/Worker deny; per-file no-isolation; trusted code accident guard, not hostile code sandbox',inventory,commands:{offline:'node scripts/freeze-overseas-manual-candidate.js --test <externally recorded manifest SHA256>',verify:'node scripts/freeze-overseas-manual-candidate.js --verify <externally recorded manifest SHA256>',sql:'node scripts/overseas-isolated-mariadb.js --isolated'}};
 const manifestPath=path.join(target,'manual-freeze-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({snapshotRoot:target,manifestPath,manifestSha256:digest(manifestPath),files:inventory.files.length}));
}
function read(){return JSON.parse(fs.readFileSync(path.join(project,'manual-freeze-manifest.json'),'utf8'));}
function verify(){const expected=process.argv[3];if(!/^[a-f0-9]{64}$/.test(expected||'')||digest(path.join(project,'manual-freeze-manifest.json'))!==expected)throw Error('FREEZE_EXTERNAL_MANIFEST_ANCHOR_MISMATCH');const m=read();if(project!==m.snapshotRoot)throw Error('FREEZE_ROOT_MISMATCH');require('./overseas-candidate-inventory').verifyInventory(m.inventory,m.extraFiles);return m;}
function test(){
 const m=verify();if(m.format!=='overseas-manual-candidate17-safe-v2'||JSON.stringify(m.testFiles)!==JSON.stringify(testFiles()))throw Error('UNSAFE_OFFLINE_MANIFEST_REJECTED');
 const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 const guard=path.join(project,'scripts/offline-test-guard.cjs').replace(/\\/g,'/');env.NODE_OPTIONS=`--require="${guard}"`;
 const common={cwd:project,env,encoding:'utf8',windowsHide:true,shell:false,timeout:30000,maxBuffer:4*1024*1024};
 const preflight=spawnSync(process.execPath,[path.join(project,'scripts/offline-test-guard-selftest.cjs')],common);
 if(preflight.status!==0||!preflight.stdout.includes('"guardSelftest":"PASS","checked":26'))throw Error('OFFLINE_GUARD_PREFLIGHT_FAILED');
 const results=[],started=Date.now();let output=(preflight.stdout||'')+(preflight.stderr||'');
 for(const file of m.testFiles){
  if(Date.now()-started>240000){results.push(...m.testFiles.slice(results.length).map(file=>({file,status:'NOT_TESTED',reason:'SUITE_DEADLINE'})));break;}
  const r=spawnSync(process.execPath,['--experimental-test-isolation=none','--test','--test-concurrency=1',file],common);
  const raw=(r.stdout||'')+(r.stderr||'');output+=`\nFILE ${file}\n${raw}`;
  const marker=raw.match(/^OFFLINE_GUARD_DENIALS:(.*)$/m);let denials=null;try{denials=JSON.parse(marker?.[1]);}catch{}
  const tap={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...raw.matchAll(new RegExp('^# '+key+' (\\d+)$','gm'))];tap[key]=matches.length?Number(matches[matches.length-1][1]):null;}
  const denialCount=denials?Object.values(denials).reduce((n,v)=>n+v,0):null;
  const passed=r.status===0&&denialCount===0&&!/^OFFLINE_GUARD_DENIED:/m.test(raw)&&tap.tests>0&&tap.fail===0&&tap.cancelled===0&&tap.skipped===0&&tap.todo===0&&tap.pass===tap.tests;
  results.push({file,status:passed?'PASS':'FAIL',exitCode:r.status,error:r.error?.code||null,denials,tap});
  if(!passed)console.log(JSON.stringify(results[results.length-1]));
 }
 const stamp=Date.now(),rawPath=path.join(project,`offline-safe-raw-${stamp}.txt`);fs.writeFileSync(rawPath,output,{flag:'wx'});verify();
 const summary={guardPreflight:'PASS',files:results.length,passedFiles:results.filter(r=>r.status==='PASS').length,failedFiles:results.filter(r=>r.status==='FAIL').length,notTestedFiles:results.filter(r=>r.status==='NOT_TESTED').length,excludedTests:m.excludedTests,results,rawPath,rawSha256:digest(rawPath)};
 fs.writeFileSync(path.join(project,`offline-safe-result-${stamp}.json`),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(summary));process.exitCode=summary.failedFiles||summary.notTestedFiles?1:0;
}
if(process.argv[2]==='--freeze'?process.argv.length!==3:process.argv.length!==4)throw Error('FREEZE_EXPLICIT_MODE_REQUIRED');
if(process.argv[2]==='--freeze')freeze();else if(process.argv[2]==='--verify'){const m=verify();console.log(JSON.stringify({verified:true,files:m.inventory.files.length}));}else if(process.argv[2]==='--test')test();else throw Error('FREEZE_MODE_INVALID');
