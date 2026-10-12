'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {inventory,verifyInventory}=require('../../scripts/lastnight-runtime-inventory');
test('complete recursive inventory includes Repository dependencies and excludes shared worker',()=>{
  const files=inventory(),plan={files,nodeVersion:process.version};verifyInventory(plan);
  for(const suffix of ['contentDisplayType.js','sourceValidators.js','bigplayerMultiSiteRuns.js','riskModes.js','bigPlayerBoardSchema.js']) assert.ok(files.some(file=>file.path.endsWith(suffix)),suffix);
  assert.ok(!files.some(file=>file.path.endsWith('lastNightOverseasDailyJob.js')||file.path.endsWith(path.join('src','worker.js'))));
  assert.ok(files.some(file=>file.path.endsWith('package-lock.json')));assert.ok(files.some(file=>file.path.includes(`${path.sep}node_modules${path.sep}`)));
  for(const removed of files.filter(file=>!file.path.includes(`${path.sep}node_modules${path.sep}`))) assert.throws(()=>verifyInventory({...plan,files:files.filter(file=>file!==removed)}),/INVENTORY_INVALID/);
  for(const altered of [files.map((file,i)=>i?file:files[1]),files.map((file,i)=>i?file:{...file,path:path.resolve(__dirname,'../../../../AGENTS.md')}),files.map((file,i)=>i?file:{...file,sha256:'0'.repeat(64)})]) assert.throws(()=>verifyInventory({...plan,files:altered}),/INVENTORY_INVALID/);
  assert.throws(()=>verifyInventory({...plan,nodeVersion:'wrong'}),/INVENTORY_INVALID/);
});
test('CLI missing dependency refuses before env, DB construction or HTTP',async()=>{
  const fs=require('node:fs'),crypto=require('node:crypto');
  const root=path.resolve(__dirname,'../../../../.temp/bigplayer-recovery-20261009');
  const dir=fs.mkdtempSync(path.join(root,'inventory-negative-'));
  const cli=require.resolve('../../scripts/lastnight-bounded-runtime');
  const files=inventory();const plan={approved:true,authorizationMode:'lastnight-bounded-current-runtime',stage:'metadata',
    cliSha256:crypto.createHash('sha256').update(fs.readFileSync(cli)).digest('hex'),nodeVersion:process.version,
    envFile:path.join(dir,'DO_NOT_READ.env'),output:path.join(dir,'result.json'),files:files.slice(1)};
  const file=path.join(dir,'invalid-plan.json');fs.writeFileSync(file,JSON.stringify(plan),{flag:'wx'});
  const original=process.loadEnvFile;let loaded=false;
  process.loadEnvFile=()=>{loaded=true;throw new Error('ENV_MUST_NOT_LOAD');};
  try {await assert.rejects(require(cli).main([process.execPath,cli,'--approved-plan',file]),/INVENTORY_INVALID/);assert.equal(loaded,false);}
  finally {process.loadEnvFile=original;}
});
