'use strict';
const { contextOf } = require('../../server/src/connectors/overseasBigPlayerSiteSession');
const { contractOf } = require('./overseasBigPlayerRunContractJournal');
const fail = () => { throw Object.assign(new Error('overseas network contract invalid'), { code: 'OVERSEAS_NETWORK_CONTRACT_INVALID' }); };
async function preflightOverseasNetwork(deps, { source, account, syncRunId }) {
  if (!require('./overseasBigPlayerPageStore').assertAtomicPageJobsBinding(deps, source)) return null;
  if (typeof deps.getOverseasRunContract !== 'function' || typeof deps.verifyOverseasNetworkContract !== 'function') fail();
  const c = contractOf(await deps.getOverseasRunContract({ source, account, syncRunId,
    leaseOwner: deps.leaseOwner, leaseEpoch: deps.syncRunLeaseEpoch,
    windowStart: deps.collectionWindow?.publishedFrom, windowEnd: deps.collectionWindow?.publishedTo }));
  const context = contextOf({ ...source, account });
  for (const [key, expected] of Object.entries({ runId: syncRunId, sourceId: source.id, accountId: account.id,
    gameId: account.game_id, communityId: account.community_id, siteId: context.siteId, boardId: context.boardId,
    siteUrl: context.base.toString(), leaseOwner: deps.leaseOwner, leaseEpoch: deps.syncRunLeaseEpoch })) if (c[key] !== expected) fail();
  if (new Date(deps.collectionWindow?.publishedFrom).toISOString() !== c.windowStart
    || new Date(deps.collectionWindow?.publishedTo).toISOString() !== c.windowEnd
    || await deps.verifyOverseasNetworkContract(c) !== true) fail();
  deps.leaseGuard?.check?.();
  require('./overseasBigPlayerDispatchGuard').bindOverseasDispatchScope(source, account, c);
  return c;
}
module.exports = { preflightOverseasNetwork };
