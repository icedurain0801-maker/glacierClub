'use strict';
// This script is packaged for a separately approved maintenance action.
// --status is read-only. --acquire/--release change only the existing scan lease.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const SOURCE='081a16d2-5545-4afd-9c65-e04777e4540b';
const ACCOUNT='75c8205f-37eb-4bdf-b6a4-f4f502e35658';
async function main(argv=process.argv.slice(2)){
  if(!['--status','--acquire','--release','--retire-overseas'].includes(argv[0])||argv.length!==1)throw Object.assign(new Error('Invalid arguments'),{code:'GATE_ARGUMENTS'});
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const {Repository}=require('../server/src/db/repository');
  const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});
  try{
    if(argv[0]==='--status'){
      const [scan]=await repo.query("SELECT owner_id,epoch,lease_until,lease_until>UTC_TIMESTAMP(3) AS live FROM po_worker_leases WHERE lease_key='worker_scheduler'");
      const active=await repo.query("SELECT r.source_id,g.region_code,COUNT(*) AS count FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id JOIN po_games g ON g.id=a.game_id WHERE r.status IN ('running','pausing','cancelling') AND (r.lease_until IS NULL OR r.lease_until>UTC_TIMESTAMP(3)) GROUP BY r.source_id,g.region_code");
      const [overseas]=await repo.query("SELECT IS_USED_LOCK('po-overseas-production:081a16d2-5545-4afd-9c65-e04777e4540b') AS connectionId");
      console.log(JSON.stringify({status:'READONLY',scan,active,overseas}));return;
    }
    if(argv[0]==='--retire-overseas'){
      // STOP and the connection-bound lock ensure the new collector cannot
      // dispatch while its recoverable rows are retired for domestic rollback.
      const directory=process.env.OVERSEAS_DAILY_STATE_DIRECTORY;
      if(!directory||!fs.existsSync(path.join(directory,'STOP')))throw Object.assign(new Error('STOP required'),{code:'GATE_STOP_REQUIRED'});
      const intents=fs.readdirSync(directory).filter(name=>/^slot-\d{13}\.json$/.test(name)).map(name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')));
      if(intents.some(intent=>intent.format!=='overseas-production-slot-v1'||intent.sourceId!==SOURCE||intent.accountId!==ACCOUNT))throw Object.assign(new Error('Invalid retirement scope'),{code:'GATE_SCOPE_INVALID'});
      const conn=await repo.pool.getConnection();let begun=false,committing=false,broken=false;
      try{
        const [[lock]]=await conn.query('SELECT GET_LOCK(?,0) AS acquired',[`po-overseas-production:${SOURCE}`]);
        if(Number(lock.acquired)!==1)throw Object.assign(new Error('Consumer not drained'),{code:'GATE_OVERSEAS_BUSY'});
        await conn.query('SET SESSION innodb_lock_wait_timeout=3');await conn.beginTransaction();begun=true;
        const snapshots=[];let retired=0;
        const [[state]]=await conn.query('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE]);
        for(const intent of intents){
          const [rows]=await conn.query('SELECT * FROM po_sync_runs WHERE (id=? OR parent_run_id=?) AND source_id=? AND account_id=? FOR UPDATE',[intent.parentId,intent.parentId,SOURCE,ACCOUNT]);
          const owned=rows.some(row=>String(row.lease_owner||'').startsWith('overseas-daily:')||String(row.error_message||'').includes('"operation":"overseas-production-daily-v1"'));
          if(!owned)continue;
          snapshots.push({parentId:intent.parentId,intentStatus:intent.status,runs:rows});
          const [result]=await conn.query("UPDATE po_sync_runs SET status='partial',lease_owner=NULL,lease_until=NULL,lease_epoch=lease_epoch+1,finished_at=UTC_TIMESTAMP(3),error_code='OVERSEAS_DOMESTIC_ROLLBACK_RETIRED' WHERE (id=? OR parent_run_id=?) AND source_id=? AND account_id=? AND status IN ('queued','running','pausing','cancelling')",[intent.parentId,intent.parentId,SOURCE,ACCOUNT]);
          retired+=result.affectedRows;
        }
        const filename=path.join(directory,`domestic-rollback-${Date.now()}.json`);
        const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({status:'RETIRE_INTENT',snapshots})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        if(String(state?.lease_owner||'').startsWith('overseas-daily:'))await conn.query('UPDATE po_source_schedule_state SET lease_owner=NULL,lease_until=NULL,lease_run_id=NULL,lease_epoch=lease_epoch+1 WHERE source_id=? AND lease_epoch=?',[SOURCE,state.lease_epoch]);
        committing=true;await conn.commit();begun=false;committing=false;
        console.log(JSON.stringify({status:'OVERSEAS_RETIRED_FOR_DOMESTIC_ROLLBACK',retired,receipt:filename}));
      }catch(error){
        if(committing){broken=true;conn.destroy();error.code='GATE_COMMIT_UNKNOWN';}
        else if(begun){try{await conn.rollback();}catch{broken=true;conn.destroy();}}
        throw error;
      }finally{if(!broken){try{await conn.query('SELECT RELEASE_LOCK(?)',[`po-overseas-production:${SOURCE}`]);conn.release();}catch{conn.destroy();}}}
      return;
    }
    const filename=process.env.OVERSEAS_SWITCH_GATE_FILE;
    if(!filename)throw Object.assign(new Error('Missing receipt path'),{code:'GATE_RECEIPT_REQUIRED'});
    if(argv[0]==='--release'){
      const token=JSON.parse(fs.readFileSync(filename,'utf8'));
      await repo.query("UPDATE po_worker_leases SET owner_id=NULL,lease_until=NULL WHERE lease_key='worker_scheduler' AND owner_id=? AND epoch=?",[token.owner,token.epoch]);
      console.log(JSON.stringify({status:'RELEASED'}));return;
    }
    const owner=`overseas-maintenance:${crypto.randomUUID()}`;
    const result=await repo.query("UPDATE po_worker_leases SET owner_id=?,epoch=epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE lease_key='worker_scheduler' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))",[owner]);
    if(result.affectedRows!==1)throw Object.assign(new Error('Scan has not drained'),{code:'GATE_SCAN_BUSY'});
    const [token]=await repo.query("SELECT epoch FROM po_worker_leases WHERE lease_key='worker_scheduler' AND owner_id=?",[owner]);
    const [{total}]=await repo.query("SELECT COUNT(*) AS total FROM po_sync_runs WHERE status IN ('running','pausing','cancelling') AND (lease_until IS NULL OR lease_until>UTC_TIMESTAMP(3))");
    if(Number(total)){
      await repo.query("UPDATE po_worker_leases SET owner_id=NULL,lease_until=NULL WHERE lease_key='worker_scheduler' AND owner_id=? AND epoch=?",[owner,token.epoch]);
      throw Object.assign(new Error('Active collection remains'),{code:'GATE_COLLECTION_NOT_DRAINED'});
    }
    try{fs.writeFileSync(filename,JSON.stringify({owner,epoch:token.epoch,expiresInSeconds:300})+'\n',{flag:'wx',mode:0o600});}
    catch(error){await repo.query("UPDATE po_worker_leases SET owner_id=NULL,lease_until=NULL WHERE lease_key='worker_scheduler' AND owner_id=? AND epoch=?",[owner,token.epoch]);throw error;}
    console.log(JSON.stringify({status:'ACQUIRED',expiresInSeconds:300}));
  }finally{await repo.pool.end();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({status:'blocked',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'GATE_FAILED'}));process.exitCode=1;});
