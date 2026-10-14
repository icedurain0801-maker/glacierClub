'use strict';
// No CLI on purpose: a real cutover requires a separately authorized adapter.
const fs = require('node:fs');
const crypto = require('node:crypto');

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = (message, code = 'WORKER_ONLY_CUTOVER_FAILED') => {
  throw Object.assign(new Error(message), { code });
};
function same(left, right) {
  return left.wrapper === right.wrapper && left.xml === right.xml && left.state === right.state;
}
function snapshot(api, worker) {
  return {
    api: { wrapper: hash(api.wrapper), xml: hash(api.xml), state: api.state() },
    worker: { wrapper: fs.readFileSync(worker.wrapper), xml: fs.readFileSync(worker.xml), state: worker.state() }
  };
}
async function stopAndAwaitMutationSafety(worker, stage) {
  await worker.stop();
  // The controlled controller always supplies this gate. Keeping the generic
  // transaction compatible avoids silently turning legacy test adapters into
  // service/process inspectors.
  if (typeof worker.awaitMutationSafe === 'function') await worker.awaitMutationSafe(stage);
}
async function cutover({ api, worker, candidate, readiness, audit = () => {} }) {
  const before = snapshot(api, worker);
  const apiNow = () => ({ wrapper: hash(api.wrapper), xml: hash(api.xml), state: api.state() });
  const assertApi = () => { if (!same(before.api, apiNow())) fail('API_OR_3001_CHANGED'); };
  let artifactsMutated = false;

  try {
    assertApi();
    if (!candidate.wrapper || !candidate.xml || !candidate.release) fail('CANDIDATE_INCOMPLETE');
    audit('snapshot_saved');
    await stopAndAwaitMutationSafety(worker, 'cutover');
    // From this point onward, even a failed copy may have changed target bytes.
    artifactsMutated = true;
    fs.copyFileSync(candidate.wrapper, worker.wrapper);
    fs.writeFileSync(worker.xml, candidate.xml);
    await worker.install();
    await worker.start();
    await readiness();
    assertApi();
    audit('cutover_ready');
    return { status: 'PASS' };
  } catch (error) {
    audit(`cutover_failed:${error.code || error.message}`);
    if (!artifactsMutated) {
      return {
        status: 'MANUAL_STOP_REQUIRED',
        error: error.code || error.message,
        rollbackSkipped: true,
        manual: 'Worker artifacts were not changed. Inspect the stopped process or file lock before another authorized attempt.'
      };
    }
    try {
      // A failed readiness/start may leave WinSW or its Node child alive. Never
      // restore bytes until the same process-and-exclusive-file gate passes.
      await stopAndAwaitMutationSafety(worker, 'rollback');
      fs.writeFileSync(worker.wrapper, before.worker.wrapper);
      fs.writeFileSync(worker.xml, before.worker.xml);
      await worker.install();
      await worker.start();
      assertApi();
      audit('rollback_ready');
      return { status: 'ROLLED_BACK', error: error.code || error.message };
    } catch (rollbackError) {
      audit(`rollback_failed:${rollbackError.code || rollbackError.message}`);
      return {
        status: 'MANUAL_STOP_REQUIRED',
        error: error.code || error.message,
        rollbackError: rollbackError.code || rollbackError.message,
        manual: 'Do not use global rollback; stop only PublicOpinionWorker and escalate.'
      };
    }
  }
}

module.exports = { cutover };
