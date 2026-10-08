'use strict';

const { LastNightIsolatedStore } = require('./lastNightIsolatedStore');
const { collectIsolated, consumeIsolatedAnalysis } = require('./lastNightIsolatedPipeline');

function fail(code) { const error = new Error(code); error.code = code; throw error; }

async function executeIsolatedFixture({ mode, store, sites, configHash, source, account,
  connector, credentialContext, publishedFrom, publishedTo, ai, deepPolicy,
  pageSize, maxPagesPerFeed, maxCommentPages } = {}) {
  if (mode !== 'isolated-test' || !(store instanceof LastNightIsolatedStore) ||
    !Number.isInteger(store.identity.port) ||
    store.identity.port < 43300 || store.identity.port > 43399) {
    fail('PRODUCTION_EXECUTION_DISABLED');
  }
  if (!ai || typeof deepPolicy !== 'function') fail('LAST_NIGHT_ISOLATED_EXECUTOR_DEPS_INVALID');
  await store.freezeSites({ sites, configHash });
  const collection = await collectIsolated({ source, account, sites, connector,
    credentialContext, store, publishedFrom, publishedTo, pageSize,
    maxPagesPerFeed, maxCommentPages });
  let analysisJobs = 0;
  for (;;) {
    const result = await consumeIsolatedAnalysis({ store, ai, deepPolicy });
    analysisJobs += result.jobs;
    if (!result.jobs) break;
  }
  return { collection, analysisJobs };
}

module.exports = { executeIsolatedFixture };
