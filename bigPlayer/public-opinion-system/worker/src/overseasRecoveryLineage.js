'use strict';
const { canonical, contractOf } = require('./overseasBigPlayerRunContractJournal');
const { assertRecoveryIntentProof, assertRecoveryIntentContext } = require('./overseasRecoveryIntent');
const fail = () => { throw Object.assign(Error('Recovery lineage unverified'), { code: 'OVERSEAS_RECOVERY_LINEAGE_UNVERIFIED' }); };
// Explicit evidence IDs only; no directory scanning or permissions inferred from filenames.
async function verifyRecoveryLineage({ contract, requestId, receipt, journal, intentReader, intentIds } = {}) {
  const c = contractOf(contract);
  if (!Array.isArray(intentIds) || new Set(intentIds).size !== intentIds.length || typeof intentReader?.read !== 'function') fail();
  const candidates = [];
  for (const id of intentIds) {
    const proof = assertRecoveryIntentProof(await intentReader.read(id));
    assertRecoveryIntentContext(proof, { receipt, journal });
    if (proof.requestId === requestId && proof.scope.runId === c.runId) candidates.push(proof);
  }
  let current = c;
  while (current.leaseEpoch > 1) {
    const matches = candidates.filter(p => p.next.leaseEpoch === current.leaseEpoch);
    if (matches.length !== 1) fail();
    const p = matches[0], expected = contractOf({ ...p.scope, leaseOwner: p.next.leaseOwner, leaseEpoch: p.next.leaseEpoch });
    if (canonical(current) !== canonical(expected)) fail();
    const previous = await journal.recover({ runId: current.runId, leaseEpoch: p.previous.leaseEpoch });
    if (previous.contractSha256 !== p.previousSha256 || previous.contract.leaseOwner !== p.previous.leaseOwner) fail();
    current = previous.contract;
  }
  await journal.read(current);
  return true;
}
module.exports = { verifyRecoveryLineage };
