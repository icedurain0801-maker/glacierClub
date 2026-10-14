'use strict';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const { isAtomicPageStoreMethod } = require('./overseasBigPlayerPageStore');
function createSourceDepsResolver({ baseDeps, loadIdentity, createOverseasAdapter, loadRunContract, verifyNetworkContract } = {}) {
  if (!baseDeps?.repo || typeof loadIdentity !== 'function' || typeof createOverseasAdapter !== 'function'
    || typeof loadRunContract !== 'function') fail('WORKER_SOURCE_ROUTER_DEPENDENCIES_REQUIRED');
  return async (source, run) => {
    // Only explicitly classified targets enter this optional resolver. An
    // absent region must be canonicalized by the queue loader, not defaulted.
    if (source?.platform !== 'bigplayer_h5' || ['domestic'].includes(source.region_code)) return { deps: baseDeps, source };
    const identity = await loadIdentity(source, run);
    const s = identity?.source, a = identity?.account;
    if (!s || !a || s.id !== source.id || !['domestic', 'overseas'].includes(s.region_code) || !s.platform
      || a.source_id !== s.id || a.game_id !== s.game_id || a.community_id !== s.community_id || a.platform !== s.platform
      || (run?.account_id && run.account_id !== a.id) || (run?.source_id && run.source_id !== s.id)) fail('WORKER_SOURCE_IDENTITY_INVALID');
    if (s.region_code !== 'overseas' || s.platform !== 'bigplayer_h5') return { deps: baseDeps, source };
    if (identity.run && (['scheduled', 'scheduled_catchup', 'scheduled_site'].includes(identity.run.trigger_type)
      || identity.run.parent_run_id != null)) fail('OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE');
    const adapter = await createOverseasAdapter(identity, run);
    if (!adapter?.connector || typeof adapter.pageStore?.upsertContentPage !== 'function') fail('OVERSEAS_ADAPTER_REQUIRED');
    if (!isAtomicPageStoreMethod(adapter.pageStore.upsertContentPage)) fail('OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND');
    const routedRepo = new Proxy(baseDeps.repo, { get(target, key) {
      if (key === 'upsertContentPage') return adapter.pageStore.upsertContentPage;
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return { source: { ...source, ...s }, deps: { ...baseDeps, repo: routedRepo,
      connectors: { ...baseDeps.connectors, bigplayer_h5: adapter.connector },
      overseasAtomicPageJobs: true, getOverseasRunContract: input => loadRunContract(identity, input),
      verifyOverseasNetworkContract: verifyNetworkContract } };
  };
}
module.exports = { createSourceDepsResolver };
