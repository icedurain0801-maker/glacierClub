'use strict';
// No timer/consumer/abort: admitted operations retain their leases until safe
// completion. Caller must also stop scan/poll admissions before shutdown.
function createDrainController() {
  let draining = false, active = 0; const waiters = new Set(), tickets = new WeakSet();
  const settle = () => { if (active) return; for (const resolve of waiters) resolve(); waiters.clear(); };
  return Object.freeze({ request() { draining = true; settle(); }, isDraining: () => draining,
    admit() { if (draining) return null; active++; let released = false;
      const ticket = Object.freeze({ release() { if (released) return; released = true; tickets.delete(ticket); active--; settle(); } });
      tickets.add(ticket); return ticket; },
    owns: ticket => tickets.has(ticket),
    whenIdle: () => active === 0 ? Promise.resolve() : new Promise(resolve => waiters.add(resolve)),
    stats: () => ({ draining, active }) });
}
module.exports = { createDrainController };
