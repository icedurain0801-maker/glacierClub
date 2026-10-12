'use strict';
const {isTrustedRunContractJournal}=require('./overseasBigPlayerRunContractJournal');
const {scheduledFirstClaimContext}=require('../../server/src/db/overseasScheduledAdmissionStore');
// Isolated epoch1 only; publishing is not permission for a later HTTP call.
async function publishScheduledFirstClaim({repo,journal,proof}={}){
  if(!isTrustedRunContractJournal(journal))throw Object.assign(Error('Journal required'),{code:'OVERSEAS_SCHEDULED_JOURNAL_REQUIRED'});
  const context=scheduledFirstClaimContext(proof,repo);
  await context.verify(proof.contract);await journal.create(proof.contract);await context.verify(proof.contract);
  return proof.contract;
}
module.exports={publishScheduledFirstClaim};
