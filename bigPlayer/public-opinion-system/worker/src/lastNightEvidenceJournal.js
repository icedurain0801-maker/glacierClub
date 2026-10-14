'use strict';
const fs=require('node:fs');const path=require('node:path');const cipher=require('../../server/src/integrations/credentialCipher');
function createEvidenceJournal({directory,env,transactionId}) {
  if(!path.isAbsolute(directory)||!fs.statSync(directory).isDirectory()||!transactionId) throw new Error('LAST_NIGHT_EVIDENCE_DIRECTORY_REQUIRED');
  let sequence=0;
  return async state=>{
    const file=path.join(directory,`${transactionId}-${String(++sequence).padStart(4,'0')}.encrypted.json`);
    const encrypted=cipher.encrypt(JSON.stringify(state),env,{aad:`lastnight-store:${transactionId}`});
    const fd=fs.openSync(file,'wx',0o600);
    try{fs.writeFileSync(fd,encrypted+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    return {file,phase:state.phase};
  };
}
module.exports={createEvidenceJournal};
