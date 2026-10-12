'use strict';
async function withDeadlineConnection(pool,work,{timeoutMs=15000,code='LAST_NIGHT_TRANSACTION_TIMEOUT'}={}) {
  let connection,expired=false,rejectDeadline;
  const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});deadline.catch(()=>{});
  const error=()=>Object.assign(new Error(code),{code});
  const timer=setTimeout(()=>{expired=true;connection?.destroy();rejectDeadline(error());},timeoutMs);
  const bounded=promise=>Promise.race([promise,deadline]);
  try {
    const pending=pool.getConnection();pending.then(value=>{if(expired)value.destroy();},()=>{});
    connection=await bounded(pending);
    const query=(sql,params=[])=>{if(expired)throw error();return bounded(connection.query({sql,timeout:Math.min(8000,timeoutMs)},params));};
    return await bounded(work({query,bounded}));
  } finally {clearTimeout(timer);connection?.destroy();}
}
module.exports={withDeadlineConnection};
