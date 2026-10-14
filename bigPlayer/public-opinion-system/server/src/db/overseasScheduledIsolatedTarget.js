'use strict';
const fs=require('node:fs'),path=require('node:path');
const targets=new WeakMap();
const fail=()=>{throw Object.assign(new Error('Scheduled isolated target rejected'),{code:'OVERSEAS_SCHEDULED_ISOLATED_TARGET_REJECTED'});};
function plain(directory){const s=fs.lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||path.resolve(fs.realpathSync(directory)).toLowerCase()!==directory.toLowerCase())fail();}
// Temporary isolated-only admission identity, never a production capability.
function createScheduledIsolatedTarget({repo,repositoryRoot,directory,serverPid}={}){
  if(typeof repo?.pool?.getConnection!=='function'||!path.isAbsolute(repositoryRoot||'')||!path.isAbsolute(directory||'')||!Number.isSafeInteger(serverPid)||serverPid<1)fail();
  const root=path.resolve(repositoryRoot),temp=path.join(root,'.temp'),owned=path.resolve(directory),data=path.join(owned,'data'),pidFile=path.join(owned,'mysqld.pid');
  if(path.dirname(owned)!==temp||!path.basename(owned).startsWith('overseas-real-db-'))fail();
  for(const p of [root,temp,owned,data])plain(p);
  const checkPid=()=>{const s=fs.lstatSync(pidFile);if(!s.isFile()||s.isSymbolicLink()||Number(fs.readFileSync(pidFile,'utf8').trim())!==serverPid)fail();};checkPid();
  async function verifyConnection(conn){checkPid();const [rows]=await conn.query('SELECT @@port AS port,@@server_id AS server_id,@@datadir AS datadir,@@pid_file AS pid_file,DATABASE() AS selected_database');
    const r=rows[0];if(rows.length!==1||Number(r.port)!==13316||Number(r.server_id)!==20261036||r.selected_database!=='po_overseas_fixture'
      ||path.resolve(r.datadir).toLowerCase()!==data.toLowerCase()||path.resolve(r.pid_file).toLowerCase()!==pidFile.toLowerCase())fail();
    for(const p of [owned,data])plain(p);checkPid();return true;}
  const target=Object.freeze({verifyConnection,productionActivationAllowed:false});targets.set(target,{repo,root,owned});return target;
}
function assertScheduledIsolatedTarget(target,repo){if(targets.get(target)?.repo!==repo)fail();return target;}
function scheduledIsolationContext(target,repo){assertScheduledIsolatedTarget(target,repo);return Object.freeze({...targets.get(target)});}
module.exports={createScheduledIsolatedTarget,assertScheduledIsolatedTarget,scheduledIsolationContext};
