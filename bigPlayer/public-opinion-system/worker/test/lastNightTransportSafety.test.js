'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {enforceStrictTls,transportDiagnostic}=require('../src/lastNightTransportSafety');
test('TLS env0 corrected locally, env reload corrected again; no certificate bypass',()=>{
  const env={NODE_TLS_REJECT_UNAUTHORIZED:'0',OTHER:'unchanged'};
  assert.deepEqual(enforceStrictTls(env),{certificateVerification:'strict',inheritedDisableCorrected:true});
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED,'1');assert.equal(env.OTHER,'unchanged');
  env.NODE_TLS_REJECT_UNAUTHORIZED='0';enforceStrictTls(env);assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED,'1');
});
test('CLI entry corrects inherited env0 even before plan gate, import has no mutation',()=>{
  const child=require('node:child_process');const cli=require.resolve('../../scripts/lastnight-bounded-runtime');
  const code=`const cli=require(${JSON.stringify(cli)});if(process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0')process.exit(2);cli.main([]).catch(()=>{console.log(process.env.NODE_TLS_REJECT_UNAUTHORIZED);});`;
  const result=child.spawnSync(process.execPath,['-e',code],{env:{...process.env,NODE_TLS_REJECT_UNAUTHORIZED:'0'},encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'1');assert.ok(!result.stderr.includes('disables certificate verification'));
  assert.deepEqual(transportDiagnostic({name:'secret',code:'secret',cause:{code:'secret'}}),{code:'UNCLASSIFIED',name:'UNCLASSIFIED',causeCode:'UNCLASSIFIED'});
});
