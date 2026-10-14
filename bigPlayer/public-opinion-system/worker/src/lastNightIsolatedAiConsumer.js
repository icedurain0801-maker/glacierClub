'use strict';

const { LastNightIsolatedStore } = require('./lastNightIsolatedStore');
const { consumeIsolatedAnalysis } = require('./lastNightIsolatedPipeline');

function fail(code) { const error = new Error(code); error.code = code; throw error; }

function waitForPoll(signal, pollMs) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, pollMs);
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
  });
}

async function runIsolatedAiConsumer({ store, ai, deepPolicy, signal,
  pollMs = 5000, limit = 20, onCycle } = {}) {
  if (!(store instanceof LastNightIsolatedStore) ||
    !Number.isInteger(store.identity?.port) ||
    store.identity.port < 43300 || store.identity.port > 43399 ||
    !signal || typeof deepPolicy !== 'function' ||
    !Number.isInteger(pollMs) || pollMs < 10 || pollMs > 60000 ||
    !Number.isInteger(limit) || limit < 1 || limit > 100) fail('LAST_NIGHT_AI_CONSUMER_CONFIG_INVALID');
  let processed = 0;
  while (!signal.aborted) {
    const result = await consumeIsolatedAnalysis({ store, ai, deepPolicy, limit });
    processed += result.jobs;
    if (onCycle) await onCycle(result);
    if (!result.jobs) await waitForPoll(signal, pollMs);
  }
  return { status: 'stopped', processed };
}

module.exports = { runIsolatedAiConsumer };
