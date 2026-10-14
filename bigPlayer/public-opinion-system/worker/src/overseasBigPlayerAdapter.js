'use strict';
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { createOverseasBigPlayerSiteSession, contextOf } = require('../../server/src/connectors/overseasBigPlayerSiteSession');
const { createOverseasBigPlayerPageStore } = require('./overseasBigPlayerPageStore');
const fail = code => { throw Object.assign(new Error(code), { code }); };
// Dependency adapter only: no process, timer, enqueue, migration or queue claim.
// Runtime activation belongs to a separately reviewed single-consumer contract.
function createOverseasBigPlayerAdapter({ env = {}, repo, credentialContext, authRefreshCoordinator, loginSessionClient, transport,
  verifyRunContract, verifyHistoricalScope, beforeCommit, dispatchGuard, stageCoverage, scheduledProof } = {}) {
  if (!repo || typeof transport !== 'function') fail('OVERSEAS_ADAPTER_DEPENDENCIES_REQUIRED');
  const session = createOverseasBigPlayerSiteSession({ transport });
  const connector = new BigPlayerH5Connector({ ...env, BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club-en.q1.com' },
    { credentialContext, authRefreshCoordinator, loginSessionClient, fetchImpl: transport, overseasSiteSession: session });
  const guarded = new Proxy(connector, { get(target, key) {
    const method = target[key];
    if (typeof method !== 'function') return method;
    // Pure synchronous capability/config helpers do not dispatch or load credentials.
    if (['hasCapability', 'assertCapability', 'hasSourceCapability', 'hostAllowed', 'resolveBaseUrl', 'endpointFor', 'endpointStatus'].includes(key)) return method.bind(target);
    if (dispatchGuard) return (...args) => {
      const input = args[0], source = input?.source || (input?.platform ? input : key === 'requestQ1' ? args[1] : null);
      return dispatchGuard.invoke(source, input?.account, () => method.apply(target, args));
    };
    if (!['listPosts', 'listComments', 'listFeedContents', 'discoverFeeds', 'detectCapabilities', 'healthCheck'].includes(key)) return method.bind(target);
    return input => { contextOf({ ...input.source, account: input.account || input.source.account }); return method.call(target, input); };
  } });
  const pageStore = verifyRunContract ? createOverseasBigPlayerPageStore({ repo, verifyRunContract, verifyHistoricalScope, beforeCommit, stageCoverage, scheduledProof }) : null;
  return Object.freeze({ connector: guarded, repo, pageStore, close: () => session.clear(),
    async inspectRuntimeSchema() {
      const required = { po_contents: ['board_id', 'board_name', 'board_key'], po_sync_runs: ['board_id', 'site_url_snapshot'] };
      const rows = await repo.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('po_contents','po_sync_runs')");
      const missing = Object.entries(required).flatMap(([table, columns]) => columns.filter(column => !rows.some(row => row.table_name === table && row.column_name === column)).map(column => `${table}.${column}`));
      return { ready: missing.length === 0, missing, productionActivationAllowed: false };
    }
  });
}
module.exports = { createOverseasBigPlayerAdapter };
