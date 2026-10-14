'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runProtected, selectAllowed, verifyIdentity, PATHS } = require('../../scripts/domestic-readonly-executor');
const identity={identity:'fixture_ro@127.0.0.1',database_name:'public_opinion',port:3306};
const grants=[{'Grants':'GRANT USAGE ON *.* TO fixture'},{'Grants':'GRANT SELECT ON `public_opinion`.* TO fixture'}];
test('fixed 43322 executor serves five GET through guarded pool and preserves baselines',async()=>{
  let ended=0;
  const result=await runProtected({baselineFiles:[__filename],expectedIdentity:identity.identity,
    createPool:()=>({query:async value=>value.sql.includes('CURRENT_USER')?[[identity]]:value.sql==='SHOW GRANTS'?[grants]:[[{fixture:1}]],end:async()=>{ended++;}}),
    loadApp:factory=>{
      const pool=factory.createPool();
      return {handler:async(req,res)=>{await pool.query('SELECT 1');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{items:[]}}));}};
    }});
  assert.equal(result.status,'PASS_READONLY_HTTP');assert.equal(result.hashesUnchanged,true);
  assert.deepEqual(result.results.map(item=>item.path),PATHS);assert.equal(result.queryTrace.length,5);assert.equal(ended,1);
});
test('existing write privileges allowed, but wrong identity/target and SQL writes fail closed',async()=>{
  assert.equal(selectAllowed('UPDATE po_sources SET enabled=0'),false);
  for(const sql of ['SELECT 1; DELETE FROM x','SELECT SLEEP(1)','SELECT * FROM x FOR UPDATE','SELECT 1 INTO OUTFILE \'x\'']) assert.equal(selectAllowed(sql),false);
  assert.doesNotThrow(()=>verifyIdentity(identity,[{x:'GRANT ALL PRIVILEGES ON *.* TO fixture WITH GRANT OPTION'}],identity.identity));
  for(const wrong of [{...identity,identity:'other@127.0.0.1'},{...identity,database_name:'other'},{...identity,port:3307}])
    assert.throws(()=>verifyIdentity(wrong,grants,identity.identity),{code:'READONLY_IDENTITY_MISMATCH'});
  assert.throws(()=>verifyIdentity(identity,grants,null),{code:'READONLY_IDENTITY_MISMATCH'});
  let ended=0;
  await assert.rejects(runProtected({baselineFiles:[__filename],expectedIdentity:identity.identity,
    createPool:()=>({query:async()=>{throw new Error('must never reach DB');},end:async()=>{ended++;}}),
    loadApp:factory=>{factory.createPool().execute('DELETE');}}),{code:'READONLY_GUARD'});
  assert.equal(ended,1);
});
test('static artifact exactly substitutes one byte span and full/summary counts agree',()=>{
  const root='C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/domestic-pending-bMQyMh';
  const manifest=JSON.parse(fs.readFileSync(`${root}/manifest.json`));
  const original=fs.readFileSync(`${root}/sources.before.js`);
  const updated=fs.readFileSync(`${root}/sources.js`);
  const offset=manifest.byteOffset;
  assert.deepEqual(updated,Buffer.concat([original.subarray(0,offset),Buffer.from(manifest.after),original.subarray(offset+Buffer.byteLength(manifest.before))]));
  const prefix='const checkpoints=rows;const pick=(item,...keys)=>keys.map(key=>item[key]).find(value=>value!=null);';
  const count=rows=>vm.runInNewContext(prefix+manifest.after+'pending',{rows});
  assert.equal(count([{status:'idle'},{status:'running'},{status:'failed'}]),2);
  assert.equal(count([{status:'idle',checkpoint_count:72524},{status:'running',checkpoint_count:'2190'},{status:'failed',checkpoint_count:10}]),74714);
  assert.equal(count([]),0);assert.equal(count([{status:'idle',checkpoint_count:null}]),1);
  assert.equal(count([{status:'idle',checkpoint_count:0}]),0);
  assert.ok(Number.isNaN(count([{status:'idle',checkpoint_count:'bad'}])));
});

test('baseline drift throws and retains failure report without changing any baseline file',async()=>{
  const originalRead=fs.readFileSync;
  let drift=false;
  const root='C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009';
  const reportPath=require('node:path').join(fs.mkdtempSync(root+'/executor-drift-'),'result.json');
  fs.readFileSync=function(file,...args){const result=originalRead.call(this,file,...args);return drift&&file===__filename?Buffer.concat([result,Buffer.from('fixture drift')]):result;};
  try {
    await assert.rejects(runProtected({baselineFiles:[__filename],expectedIdentity:identity.identity,output:reportPath,
      createPool:()=>({query:async value=>value.sql.includes('CURRENT_USER')?[[identity]]:[grants],end:async()=>{drift=true;}}),
      loadApp:factory=>{factory.createPool();return{handler:async(req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}');}};}}),{code:'BASELINE_CHANGED'});
  } finally {fs.readFileSync=originalRead;}
  assert.equal(JSON.parse(fs.readFileSync(reportPath)).status,'FAIL_BASELINE_CHANGED');
});

test('deadline covers identity validation and stalled cleanup, destroys only owned pool, retains report',async()=>{
  for(const stage of ['identity','cleanup']) {
    let destroyed=0;
    const root='C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009';
    const output=require('node:path').join(fs.mkdtempSync(root+'/executor-timeout-'),'result.json');
    const started=Date.now();
    await assert.rejects(runProtected({baselineFiles:[__filename],expectedIdentity:identity.identity,deadlineAt:Date.now()+100,output,
      createPool:()=>({forceDestroy:()=>{destroyed++;},query:async value=>stage==='identity'?new Promise(()=>{}):value.sql.includes('CURRENT_USER')?[[identity]]:[grants],
        end:async()=>stage==='cleanup'?new Promise(()=>{}):undefined}),
      loadApp:factory=>{factory.createPool();return{handler:async(req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end('{}');}};}}),{code:'READONLY_DEADLINE_EXCEEDED'});
    assert.ok(Date.now()-started<1000);assert.ok(destroyed>=1);
    assert.equal(JSON.parse(fs.readFileSync(output)).errorCode,'READONLY_DEADLINE_EXCEEDED');
  }
});

test('timeout failure propagated to CLI-style catch exits nonzero',()=>{
  const executor=require.resolve('../../scripts/domestic-readonly-executor');
  const code=`const {runProtected}=require(${JSON.stringify(executor)});runProtected({baselineFiles:[${JSON.stringify(__filename)}],expectedIdentity:'fixture',deadlineAt:Date.now()+50,createPool:()=>({query:()=>new Promise(()=>{}),end:async()=>{},forceDestroy:()=>{}}),loadApp:f=>{f.createPool();return{};}}).catch(e=>{console.error(e.code);process.exitCode=1;});`;
  const child=require('node:child_process').spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:2000,windowsHide:true});
  assert.equal(child.status,1);assert.match(child.stderr,/READONLY_DEADLINE_EXCEEDED/);
});
