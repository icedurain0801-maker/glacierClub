'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { contractOf, isTrustedRunContractJournal } = require('./overseasBigPlayerRunContractJournal');
const { verifyPersistedOverseasContract } = require('./overseasBigPlayerNetworkContractVerifier');
const { contextOf } = require('../../server/src/connectors/overseasBigPlayerSiteSession');
const scopeKey = Symbol('overseas-dispatch-scope'), scopes = new WeakMap();
const fail = code => { throw Object.assign(new Error(code), { code }); };
function assertSource(source, account, c) {
  const a = account || source?.account, context = contextOf({ ...source, account: a });
  for (const [key, value] of Object.entries({ sourceId: source.id, accountId: a.id, gameId: a.game_id,
    communityId: a.community_id, siteId: context.siteId, boardId: context.boardId, siteUrl: context.base.toString() })) {
    if (c[key] !== value) fail('OVERSEAS_DISPATCH_SCOPE_INVALID');
  }
}
function bindOverseasDispatchScope(source, account, value) {
  const c = contractOf(value); assertSource(source, account, c);
  const a = account || source.account;
  const snapshot = Object.fromEntries(['id', 'source_id', 'game_id', 'community_id', 'platform'].map(key => [key, a[key]]));
  const token = Object.freeze({}); scopes.set(token, { contract: c, account: Object.freeze(snapshot) });
  // Enumerable symbol survives the existing source spreads; no credential is stored.
  Object.defineProperty(source, scopeKey, { value: token, enumerable: true, configurable: true });
}
function createOverseasDispatchGuard({ repo, journal, manifestSha256, transport, scheduledProof } = {}) {
  const scheduled=scheduledProof?require('../../server/src/db/overseasScheduledAdmissionStore').scheduledFirstClaimContext(scheduledProof,repo):null;
  if (!repo?.pool?.getConnection || !isTrustedRunContractJournal(journal) || typeof transport !== 'function'
    || transport === globalThis.fetch || !/^[a-f0-9]{64}$/.test(manifestSha256 || '')) throw new TypeError('Isolated dispatch dependencies required');
  const context = new AsyncLocalStorage();
  const closed = new Set(), keyOf = c => JSON.stringify([c.runId, c.leaseOwner, c.leaseEpoch]);
  return Object.freeze({
    invoke(source, account, operation) {
      const binding = scopes.get(source?.[scopeKey]), c = binding?.contract;
      if (!c || c.manifestSha256 !== manifestSha256) fail('OVERSEAS_DISPATCH_SCOPE_UNBOUND');
      if (closed.has(keyOf(c))) fail('OVERSEAS_DISPATCH_CONTRACT_CLOSED');
      assertSource(source, account || source.account || binding.account, c);
      return context.run(c, operation);
    },
    async transport(url, options) {
      const c = context.getStore(); if (!c) fail('OVERSEAS_DISPATCH_SCOPE_UNBOUND');
      if (closed.has(keyOf(c))) fail('OVERSEAS_DISPATCH_CONTRACT_CLOSED');
      let target; try { target = new URL(url); } catch { fail('OVERSEAS_DISPATCH_URL_INVALID'); }
      if (target.origin !== 'https://club-en.q1.com' || target.username || target.password || target.hash
        || !/^\/api\/club\/v[12]\//.test(target.pathname)) fail('OVERSEAS_DISPATCH_URL_INVALID');
      await journal.read(c);
      let conn, started = false, dispatched = false, committing = false, destroyed = false, response;
      try {
        conn = await repo.pool.getConnection();
        await conn.query('SET SESSION innodb_lock_wait_timeout=?', [repo.syncUpsertLockWaitSeconds || 3]);
        await conn.beginTransaction(); started = true;
        if(scheduled)await scheduled.fence(conn,c,{lock:true});
        // Same run/site/source/account order as PageStore. No pool escape while locked.
        await conn.query('SELECT id FROM po_sync_runs WHERE id=? FOR UPDATE', [c.runId]);
        await conn.query('SELECT site_id FROM po_source_sites WHERE source_id=? AND site_id=? FOR UPDATE', [c.sourceId, c.siteId]);
        await conn.query('SELECT id FROM po_sources WHERE id=? FOR UPDATE', [c.sourceId]);
        await conn.query('SELECT id FROM po_accounts WHERE id=? FOR UPDATE', [c.accountId]);
        const pinned = { query: async (sql, params) => (await conn.query(sql + ' FOR UPDATE', params))[0] };
        await verifyPersistedOverseasContract(pinned, c);
        if(scheduled)await scheduled.fence(conn,c,{lock:true});
        if (closed.has(keyOf(c))) fail('OVERSEAS_DISPATCH_CONTRACT_CLOSED');
        if (options?.signal?.aborted) fail('COLLECTION_CANCELLED');
        // Trust boundary: supplied isolated transport must initiate dispatch on invocation,
        // not defer it behind its own asynchronous queue. Never await network under this lock.
        response = Promise.resolve(transport(url, options)); dispatched = true;
        response.catch(() => {});
        committing = true; await conn.commit(); started = false; committing = false;
      } catch (error) {
        if (committing && dispatched) {
          closed.add(keyOf(c));
          conn.destroy(); destroyed = true;
          fail('OVERSEAS_DISPATCH_COMMIT_UNKNOWN'); // May have sent; never retry here.
        }
        if (error?.code === 'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED') closed.add(keyOf(c));
        if (started) { try { await conn.rollback(); } catch { conn.destroy(); destroyed = true; } }
        throw error;
      } finally { if (conn && !destroyed) conn.release(); }
      return response;
    }
  });
}
module.exports = { bindOverseasDispatchScope, createOverseasDispatchGuard };
