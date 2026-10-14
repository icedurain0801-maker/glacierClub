'use strict';
const crypto=require('node:crypto');
const {canonical,contractOf}=require('../../../worker/src/overseasBigPlayerRunContractJournal');
const {assertScheduledIsolatedTarget}=require('./overseasScheduledIsolatedTarget');
const brands=new WeakMap();
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
// NOT_INTEGRATED. Connection exclusion only, not a lease/claim/write proof.
async function acquireOverseasScheduledExecutionGate({repo,isolation,contract}={}){
  assertScheduledIsolatedTarget(isolation,repo);
  const c=contractOf(contract),contractSha256=hash(canonical(c));
  const name=hash(canonical({namespace:'overseas-scheduled-execution-v1',runId:c.runId.toLowerCase(),leaseEpoch:c.leaseEpoch}));
  const conn=await repo.pool.getConnection(),raw=conn.connection||conn;
  let alive=true,finished=false,acquired=false,id=null,gate,closing,queue=Promise.resolve(),running=false,drained=Promise.resolve();
  const serial=work=>{const result=queue.then(work);queue=result.catch(()=>{});return result;};
  const destroy=()=>{alive=false;if(finished)return;finished=true;try{conn.destroy();}catch{try{raw.destroy();}catch{}}};
  const lost=()=>destroy();
  const bounded=async work=>{
    let timer;
    try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
      timer=setTimeout(()=>{destroy();reject(Object.assign(Error('OVERSEAS_SCHEDULED_GATE_TIMEOUT'),{code:'OVERSEAS_SCHEDULED_GATE_TIMEOUT'}));},3000);
    })]);}finally{clearTimeout(timer);}
  };
  const query=(sql,params)=>bounded(()=>conn.query(sql,params));
  const live=()=>{if(!alive||finished)fail('OVERSEAS_SCHEDULED_GATE_CLOSED');};
  const detach=()=>{for(const event of ['error','end','close'])raw.removeListener(event,lost);};
  async function identity(){
    live();assertScheduledIsolatedTarget(isolation,repo);await bounded(()=>isolation.verifyConnection(conn));live();
    const [rows]=await query('SELECT CONNECTION_ID() AS connection_id,IS_USED_LOCK(?) AS lock_owner',[name]);live();
    const row=rows?.[0],value=Number(row?.connection_id);
    if(rows?.length!==1||!Number.isSafeInteger(value)||value<1||(id!==null&&value!==id)
      ||(acquired&&(row.lock_owner==null||Number(row.lock_owner)!==value)))fail('OVERSEAS_SCHEDULED_GATE_IDENTITY_CHANGED');
    return value;
  }
  try{
    if(typeof raw.on!=='function'||typeof raw.removeListener!=='function'||typeof conn.destroy!=='function'||typeof conn.release!=='function')
      fail('OVERSEAS_SCHEDULED_GATE_CONNECTION_INVALID');
    for(const event of ['error','end','close'])raw.on(event,lost);
    id=await identity();const [rows]=await query('SELECT GET_LOCK(?,0) AS acquired',[name]);live();
    if(rows?.length!==1||rows[0]?.acquired==null||Number(rows[0].acquired)!==1)fail('OVERSEAS_SCHEDULED_GATE_BUSY');
    acquired=true;await identity();
    const branded=value=>{if(value!==gate||brands.get(value)?.repo!==repo)fail('OVERSEAS_SCHEDULED_GATE_BRAND_INVALID');};
    async function verify(){branded(this);return serial(async()=>{try{await identity();live();return true;}catch(e){destroy();throw e;}});}
    async function run(work){
      branded(this);live();if(running||typeof work!=='function')fail('OVERSEAS_SCHEDULED_GATE_EXECUTION_CONFLICT');
      running=true;let resolveDrain;drained=new Promise(resolve=>{resolveDrain=resolve;});
      try{await verify.call(gate);const result=await work();live();return result;}
      finally{running=false;resolveDrain();}
    }
    async function verifyExecution(){branded(this);if(!running)fail('OVERSEAS_SCHEDULED_GATE_EXECUTION_REQUIRED');return verify.call(gate);}
    function close(){
      branded(this);if(closing)return closing;
      const canRelease=alive&&!finished;alive=false;
      // Wait outside the query queue: in-flight operations may still need
      // a queued check to observe revocation and unwind.
      closing=drained.then(()=>serial(async()=>{
        if(!canRelease||finished){destroy();return;}
        try{
          assertScheduledIsolatedTarget(isolation,repo);await bounded(()=>isolation.verifyConnection(conn));
          const [rows]=await query('SELECT CONNECTION_ID() AS connection_id,IS_USED_LOCK(?) AS lock_owner',[name]);
          const row=rows?.[0];if(finished||rows?.length!==1||Number(row.connection_id)!==id||row.lock_owner==null||Number(row.lock_owner)!==id)
            fail('OVERSEAS_SCHEDULED_GATE_IDENTITY_CHANGED');
          const [released]=await query('SELECT RELEASE_LOCK(?) AS released',[name]);
          if(finished||released?.length!==1||released[0]?.released==null||Number(released[0].released)!==1)fail('OVERSEAS_SCHEDULED_GATE_RELEASE_UNKNOWN');
          detach();conn.release();finished=true;
        }catch(e){destroy();throw e;}
      }));return closing;
    }
    gate=Object.freeze({runId:c.runId,leaseEpoch:c.leaseEpoch,contractSha256,integrationStatus:'EXECUTION_SCOPE_AVAILABLE',productionActivationAllowed:false,verify,verifyExecution,run,close});
    brands.set(gate,{repo,isolation,contractSha256});return gate;
  }catch(e){destroy();throw e;}
}
async function assertOverseasScheduledExecutionGate(gate,{repo,isolation,contract}={}){
  const ctx=brands.get(gate);if(!ctx||ctx.repo!==repo||ctx.isolation!==isolation)fail('OVERSEAS_SCHEDULED_GATE_BRAND_INVALID');
  if(ctx.contractSha256!==hash(canonical(contractOf(contract))))fail('OVERSEAS_SCHEDULED_GATE_CONTRACT_CHANGED');
  assertScheduledIsolatedTarget(isolation,repo);return gate.verify();
}
module.exports={acquireOverseasScheduledExecutionGate,assertOverseasScheduledExecutionGate};
