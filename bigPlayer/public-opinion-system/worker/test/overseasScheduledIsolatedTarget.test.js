'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createScheduledIsolatedTarget,assertScheduledIsolatedTarget}=require('../../server/src/db/overseasScheduledIsolatedTarget');
const root=path.resolve(__dirname,'../../../..');
function fixture(){const directory=fs.mkdtempSync(path.join(root,'.temp/overseas-real-db-target-test-'));fs.mkdirSync(path.join(directory,'data'));fs.writeFileSync(path.join(directory,'mysqld.pid'),'12345',{flag:'wx'});
  const repo={pool:{getConnection(){throw Error('no connection');}}},target=createScheduledIsolatedTarget({repo,repositoryRoot:root,directory,serverPid:12345});
  const identity={port:13316,server_id:20261036,datadir:path.join(directory,'data'),pid_file:path.join(directory,'mysqld.pid'),selected_database:'po_overseas_fixture'};
  return {repo,target,identity,directory};}
test('isolated target is repo-bound and every check only queries exact identity',async()=>{const f=fixture(),calls=[];assert.equal(assertScheduledIsolatedTarget(f.target,f.repo),f.target);
  assert.throws(()=>assertScheduledIsolatedTarget({...f.target},f.repo),{code:'OVERSEAS_SCHEDULED_ISOLATED_TARGET_REJECTED'});
  assert.throws(()=>assertScheduledIsolatedTarget(f.target,{}),{code:'OVERSEAS_SCHEDULED_ISOLATED_TARGET_REJECTED'});
  const conn={query:async sql=>{calls.push(sql);assert.ok(sql.startsWith('SELECT @@port'));return [[f.identity]];}};
  assert.equal(await f.target.verifyConnection(conn),true);assert.equal(await f.target.verifyConnection(conn),true);assert.equal(calls.length,2);
});
test('3306, wrong server/schema/datadir/PID path all reject before any mutation',async()=>{const f=fixture();for(const patch of [{port:3306},{server_id:1},{selected_database:'public_opinion_test'},{selected_database:'public_opinion'},{datadir:'C:/xampp/mysql/data'},{pid_file:'C:/xampp/mysql/data/mysql.pid'}]){
  let calls=0;await assert.rejects(f.target.verifyConnection({query:async sql=>{calls++;assert.ok(sql.startsWith('SELECT '));return [[{...f.identity,...patch}]];}}),{code:'OVERSEAS_SCHEDULED_ISOLATED_TARGET_REJECTED'});assert.equal(calls,1);
}});
test('changed owned PID rejects before requesting any SQL',async()=>{const f=fixture();fs.writeFileSync(path.join(f.directory,'mysqld.pid'),'54321');let calls=0;
  await assert.rejects(f.target.verifyConnection({query:async()=>{calls++;return [[f.identity]];}}),{code:'OVERSEAS_SCHEDULED_ISOLATED_TARGET_REJECTED'});assert.equal(calls,0);
});
