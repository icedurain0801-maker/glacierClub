const { createSchedulerCandidateLoader } = require('./schedulerCandidateLoader');
const { createSourceSchedulerRuntime } = require('./sourceSchedulerRuntime');

async function runUnifiedSourceSchedulerOnce({
  connection,
  workerId,
  now,
  connectorCapabilities,
  lastProcessedBySource = {},
  existingEvidence = [],
  leaseDurationMs,
  idFactory,
  sourceAllowlist
} = {}) {
  const loader = createSchedulerCandidateLoader(connection, { sourceAllowlist });

  let candidates;
  try {
    candidates = await loader.load();
  } catch {
    return {
      status: 'failed',
      reasonCode: 'CANDIDATE_LOAD_FAILED',
      candidateCount: 0,
      decisions: [],
      evidence: [...existingEvidence]
    };
  }

  const runtimeOptions = { connection, workerId };
  if (leaseDurationMs !== undefined) runtimeOptions.leaseDurationMs = leaseDurationMs;
  if (idFactory !== undefined) runtimeOptions.idFactory = idFactory;
  const runtime = createSourceSchedulerRuntime(runtimeOptions);
  const scheduled = await runtime.run({
    sources: candidates.sources,
    accounts: candidates.accounts,
    connectorCapabilities,
    now,
    lastProcessedBySource: lastProcessedBySource && Object.keys(lastProcessedBySource).length
      ? lastProcessedBySource
      : Object.fromEntries(candidates.sources.map(source => [source.id, source.last_scheduled_at]).filter(([, value]) => value)),
    existingEvidence
  });

  return {
    status: 'completed',
    reasonCode: null,
    candidateCount: candidates.sources.length,
    decisions: scheduled.decisions,
    evidence: scheduled.evidence
  };
}

module.exports = { runUnifiedSourceSchedulerOnce };
