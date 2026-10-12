'use strict';
const { createIsolatedOverseasCandidateDeps } = require('./overseasBigPlayerCandidateFactory');
const { createWorkerCandidateRuntime } = require('./workerCandidateRuntime');
const { runOnce } = require('./worker');
// Explicit caller assembly only. No timer, signal, env activation or service.
function createIsolatedSharedWorkerRuntime(options = {}) {
  const { baseDeps, scan = runOnce, ...candidateOptions } = options;
  if (!baseDeps?.repo || typeof scan !== 'function') throw new TypeError('Isolated shared runtime dependencies required');
  const deps = createIsolatedOverseasCandidateDeps({ ...candidateOptions, baseDeps });
  return createWorkerCandidateRuntime({ deps, scan });
}
module.exports = { createIsolatedSharedWorkerRuntime };
