'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonical}=require('./overseasBigPlayerRunContractJournal');
const {requestOf}=require('../../server/src/db/overseasScheduledAdmissionStore');
const journals=new WeakSet(),records=new WeakMap(),intents=new WeakMap(),locations=new WeakMap();
const fail=()=>{throw Object.assign(Error('Scheduled request evidence invalid'),{code:'OVERSEAS_SCHEDULED_REQUEST_EVIDENCE_INVALID'});};
const sha=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const inputOf=r=>({batch:r.batch,expectedState:r.expectedState,leaseUntil:r.leaseUntil,nextSlotAt:r.nextSlotAt,ownerId:r.ownerId});
// Durable original request, never reconstructed from progressed source-state.
// Integrity/inspection evidence only: this record grants no claim or transport.
async function createScheduledRequestJournal({repositoryRoot,directory}={}){
  if(!path.isAbsolute(repositoryRoot||'')||!path.isAbsolute(directory||''))fail();
  const root=await fs.realpath(repositoryRoot),target=path.resolve(directory);
  const policy=await require('./overseasStateDirectoryPolicy').createIsolatedStateDirectoryPolicy({repositoryRoot:root,directory:target});
  const recheck=()=>policy.validate(target);
  const filename=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))fail();return path.join(target,`overseas-scheduled-request-${id}.json`);};
  const envelope=request=>({format:'overseas-scheduled-request-v1',request,requestSha256:sha(request)});
  let journal;
  async function recover(requestSha256){
    await recheck();let handle;
    try{
      const file=filename(requestSha256),stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>262144)fail();
      handle=await fs.open(file,'r');const opened=await handle.stat();
      if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)fail();
      const raw=await handle.readFile('utf8');let value;try{value=JSON.parse(raw);}catch{fail();}
      if(!value||Object.keys(value).sort().join(',')!=='format,request,requestSha256'||value.format!=='overseas-scheduled-request-v1')fail();
      const request=inputOf(requestOf(value.request));
      if(value.requestSha256!==requestSha256||sha(request)!==requestSha256||raw!==canonical(envelope(request))+'\n')fail();
      const record=Object.freeze({format:value.format,requestSha256,batchSha256:requestOf(request).batchSha256,automaticWriteAllowed:false});
      records.set(record,Object.freeze({journal,request:Object.freeze(request)}));return record;
    }catch(e){if(e.code==='ENOENT')fail();throw e;}finally{await handle?.close();}
  }
  async function prepare(input){
    const request=inputOf(requestOf(input)),id=sha(request);await recheck();
    const pending=path.join(target,`.scheduled-request-${crypto.randomUUID()}.pending`);let handle,created=false;
    try{
      handle=await fs.open(pending,'wx',0o600);created=true;await handle.writeFile(canonical(envelope(request))+'\n');await handle.sync();await handle.close();handle=null;
      await recheck();try{await fs.link(pending,filename(id));}catch(e){if(e.code!=='EEXIST')throw e;}
      await fs.unlink(pending);created=false;return recover(id);
    }finally{await handle?.close();if(created)try{await fs.unlink(pending);}catch{}}
  }
  const intentFile=id=>{if(!/^[a-f0-9]{64}$/.test(id||''))fail();return path.join(target,`overseas-scheduled-first-intent-${id}.json`);};
  async function readIntent({record,runId,leaseSeconds=300}={}){
    const request=scheduledRequestEvidence(record,journal),identity={requestSha256:record.requestSha256,runId,leaseSeconds},intentId=sha(identity);
    if(!request.batch.admissions.some(a=>a.runId===runId)||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail();
    await recheck();let handle;
    try{
      const stat=await fs.lstat(intentFile(intentId));if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192)fail();
      handle=await fs.open(intentFile(intentId),'r');const opened=await handle.stat();
      if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)fail();
      const raw=await handle.readFile('utf8');let value;try{value=JSON.parse(raw);}catch{fail();}
      const intent=value?.intent;
      if(!intent||Object.keys(value).sort().join(',')!=='format,intent,intentSha256'||value.format!=='overseas-scheduled-first-intent-v1'
        ||Object.keys(intent).sort().join(',')!=='intentId,leaseSeconds,nextOwner,requestSha256,runId'
        ||intent.intentId!==intentId||intent.requestSha256!==record.requestSha256||intent.runId!==runId||intent.leaseSeconds!==leaseSeconds
        ||!/^overseas-scheduled-first:[a-f0-9-]{36}$/.test(intent.nextOwner||'')
        ||value.intentSha256!==sha(intent)||raw!==canonical(value)+'\n')fail();
      const proof=Object.freeze({...intent,automaticWriteAllowed:false});intents.set(proof,Object.freeze({journal,record,request}));return proof;
    }finally{await handle?.close();}
  }
  async function prepareIntent(input={}){
    const {record,runId,leaseSeconds=300}=input;const request=scheduledRequestEvidence(record,journal);
    if(!request.batch.admissions.some(a=>a.runId===runId)||!Number.isSafeInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail();
    const identity={requestSha256:record.requestSha256,runId,leaseSeconds},intentId=sha(identity);
    const intent={...identity,intentId,nextOwner:`overseas-scheduled-first:${crypto.randomUUID()}`};
    const value={format:'overseas-scheduled-first-intent-v1',intent,intentSha256:sha(intent)};
    await recheck();const pending=path.join(target,`.scheduled-first-intent-${crypto.randomUUID()}.pending`);let handle,created=false;
    try{
      handle=await fs.open(pending,'wx',0o600);created=true;await handle.writeFile(canonical(value)+'\n');await handle.sync();await handle.close();handle=null;
      await recheck();try{await fs.link(pending,intentFile(intentId));}catch(e){if(e.code!=='EEXIST')throw e;}
      await fs.unlink(pending);created=false;return readIntent({record,runId,leaseSeconds});
    }finally{await handle?.close();if(created)try{await fs.unlink(pending);}catch{}}
  }
  journal=Object.freeze({prepare,recover,prepareIntent,readIntent,productionActivationAllowed:false});journals.add(journal);locations.set(journal,{root,directory:target});return journal;
}
function scheduledRequestEvidence(record,journal){
  const context=records.get(record);if(!journals.has(journal)||context?.journal!==journal)fail();return context.request;
}
function scheduledFirstIntentEvidence(intent,{requestJournal,record}={}){
  const context=intents.get(intent);if(!context||context.journal!==requestJournal||context.record!==record)fail();
  scheduledRequestEvidence(record,requestJournal);return context.request;
}
function scheduledRequestLocation(journal){if(!journals.has(journal))fail();return Object.freeze({...locations.get(journal)});}
module.exports={createScheduledRequestJournal,scheduledRequestEvidence,scheduledFirstIntentEvidence,scheduledRequestLocation};
