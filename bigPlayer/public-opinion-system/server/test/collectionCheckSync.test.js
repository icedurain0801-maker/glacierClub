'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness({platform='win32',mode='1',exists=true}={}){
 const calls=[],child={on(){return this;},unref(){calls.push({unref:true});}};
 const context={module:{exports:{}},process:{platform,execPath:'node.exe',env:{PUBLIC_OPINION_SERVICE_MODE:mode}},console,require(name){
  if(name==='node:fs')return{existsSync:()=>exists};
  if(name==='node:child_process')return{spawn:(...args)=>{calls.push(args);return child;}};
  throw Error('Unexpected dependency');
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/collectionCheckSync'),'utf8'),context);
 return{run:context.module.exports.syncCollectionCheckTasks,calls};
}
test('source configuration refresh starts only installed Windows service-mode checker with a hidden console',()=>{
 const h=harness();h.run();assert.equal(h.calls[0][0],'node.exe');assert.equal(h.calls[0][1][1],'--sync');assert.equal(h.calls[0][2].windowsHide,true);assert.equal(h.calls[0][2].stdio,'ignore');assert.equal(h.calls[1].unref,true);
});
test('isolated tests and uninstalled runtimes never change Windows tasks',()=>{
 for(const options of [{platform:'linux'},{mode:'0'},{exists:false}]){const h=harness(options);h.run();assert.equal(h.calls.length,0);}
});
