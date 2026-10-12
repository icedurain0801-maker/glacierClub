'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {canonical,contractOf,isTrustedRunContractJournal}=require('./overseasBigPlayerRunContractJournal');
const {isTrustedManualReceipt}=require('./overseasManualReceipt');
const {expiredDescriptor}=require('./overseasManualProgressRecovery');
const proofs=new WeakMap();
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Object.assign(Error('Recovery intent invalid'),{code:'OVERSEAS_RECOVERY_INTENT_INVALID'});};
const scope=c=>Object.fromEntries(Object.entries(c).filter(([key])=>!['leaseOwner','leaseEpoch'].includes(key)));
function checked(value){
 if(!value||Object.keys(value).sort().join(',')!=='intentId,next,previous,previousSha256,requestId,scope'
  ||!['intentId','requestId','previousSha256'].every(k=>/^[a-f0-9]{64}$/.test(value[k]||'')))fail();
 const old=value.previous,next=value.next;
 for(const tuple of [old,next])if(!tuple||Object.keys(tuple).sort().join(',')!=='attempts,leaseEpoch,leaseOwner'
  ||!Number.isSafeInteger(tuple.leaseEpoch)||tuple.leaseEpoch<1||tuple.attempts!==tuple.leaseEpoch)fail();
 if(next.leaseEpoch!==old.leaseEpoch+1||old.leaseOwner===next.leaseOwner)fail();
 const oldContract=contractOf({...value.scope,leaseOwner:old.leaseOwner,leaseEpoch:old.leaseEpoch});
 contractOf({...value.scope,leaseOwner:next.leaseOwner,leaseEpoch:next.leaseEpoch});
 if(sha(canonical(oldContract))!==value.previousSha256
  ||value.intentId!==sha(canonical({requestId:value.requestId,scope:value.scope,previous:old,previousSha256:value.previousSha256})))fail();
 return Object.freeze({...value,scope:Object.freeze({...value.scope}),previous:Object.freeze({...old}),next:Object.freeze({...next})});
}
async function createOverseasRecoveryIntent({repositoryRoot,directory,receipt,journal,statePolicy}={}){
 if(!isTrustedManualReceipt(receipt)||!isTrustedRunContractJournal(journal)||!path.isAbsolute(repositoryRoot||'')||!path.isAbsolute(directory||''))fail();
 const root=await fs.realpath(repositoryRoot),target=path.resolve(directory),relative=path.relative(path.join(root,'.temp'),target);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail();
 async function recheck(){if(statePolicy!=null)await require('./overseasStateDirectoryPolicy').resolveStateDirectory({policy:statePolicy,directory:target});let current=root;for(const part of ['.temp',...relative.split(path.sep)]){
  current=path.join(current,part);const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail();
 }if(await fs.realpath(target)!==target)fail();}
 await recheck();
 const filename=id=>{if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))fail();return path.join(target,`overseas-intent-${id}.json`);};
 const envelope=intent=>({format:'overseas-recovery-intent-v1',intent,intentSha256:sha(canonical(intent))});
 async function read(intentId){
  await recheck();let handle;
  try{
   const file=filename(intentId),stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>32768)fail();
   handle=await fs.open(file,'r');const opened=await handle.stat();if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)fail();
   const raw=await handle.readFile('utf8');let parsed;try{parsed=JSON.parse(raw);}catch{fail();}
   if(parsed?.format!=='overseas-recovery-intent-v1'||Object.keys(parsed).sort().join(',')!=='format,intent,intentSha256')fail();
   const intent=checked(parsed.intent);if(intent.intentId!==intentId||raw!==canonical(envelope(intent))+'\n')fail();
   const request=await receipt.recover(intent.requestId),matches=request.bindings.filter(b=>b.runId===intent.scope.runId);
   if(matches.length!==1||canonical(matches[0])!==canonical(intent.scope))fail();
   const old=await journal.recover({runId:intent.scope.runId,leaseEpoch:intent.previous.leaseEpoch});
   if(old.contractSha256!==intent.previousSha256||canonical(scope(old.contract))!==canonical(intent.scope)||old.contract.leaseOwner!==intent.previous.leaseOwner)fail();
   proofs.set(intent,{receipt,journal});return intent;
  }finally{await handle?.close();}
 }
 async function prepare({plan,runId}={}){
  const descriptor=expiredDescriptor(plan,runId),previous={leaseOwner:descriptor.previousContract.leaseOwner,leaseEpoch:descriptor.previousContract.leaseEpoch,attempts:descriptor.attempts};
  const identity={requestId:descriptor.requestId,scope:descriptor.binding,previous,previousSha256:descriptor.previousSha256},intentId=sha(canonical(identity));
  const intent=checked({...identity,intentId,next:{leaseOwner:`overseas-recovery:${crypto.randomUUID()}`,leaseEpoch:previous.leaseEpoch+1,attempts:previous.attempts+1}});
  await recheck();const pending=path.join(target,`.intent-${crypto.randomUUID()}.pending`);let handle,created=false;
  try{
   handle=await fs.open(pending,'wx',0o600);created=true;await handle.writeFile(canonical(envelope(intent))+'\n');await handle.sync();await handle.close();handle=null;
   await recheck();try{await fs.link(pending,filename(intentId));}catch(error){if(error.code!=='EEXIST')throw error;}
   await fs.unlink(pending);created=false;return await read(intentId);
  }finally{await handle?.close();if(created)try{await fs.unlink(pending);}catch{}}
 }
 return Object.freeze({prepare,read,productionActivationAllowed:false});
}
function assertRecoveryIntentProof(proof){if(!proofs.has(proof))fail();return proof;}
function assertRecoveryIntentContext(proof,{journal,receipt}={}){const context=proofs.get(proof);if(!context||context.journal!==journal||(receipt&&context.receipt!==receipt))fail();}
module.exports={createOverseasRecoveryIntent,assertRecoveryIntentProof,assertRecoveryIntentContext};
