'use strict';
// Integrity-only new Node process. No DB/HTTP/env/worker import.
const {createScheduledRequestJournal,scheduledRequestEvidence}=require('../worker/src/overseasScheduledRequestJournal');
if(process.argv.length!==5)throw Error('SCHEDULED_REQUEST_READ_ONLY_ARGUMENTS');
(async()=>{
  const journal=await createScheduledRequestJournal({repositoryRoot:process.argv[2],directory:process.argv[3]});
  const record=await journal.recover(process.argv[4]);
  process.stdout.write(JSON.stringify({requestSha256:record.requestSha256,batchSha256:record.batchSha256,
    request:scheduledRequestEvidence(record,journal),automaticWriteAllowed:false})+'\n');
})().catch(e=>{process.stderr.write((e.code||'SCHEDULED_REQUEST_READ_FAILED')+'\n');process.exitCode=1;});
