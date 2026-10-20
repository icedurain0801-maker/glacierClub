'use strict';
// Waiting accounts consume no execution slot. Initial and polled work must use
// this same pool; account exclusion happens before the run is claimed.
function createFairCollectionPool(limit = 3) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 32) throw new TypeError('Invalid collection concurrency');
  const queues = new Map(), activeKeys = new Set(), idleWaiters = [];
  let active = 0;
  function pump() {
    for (const [key, queue] of queues) {
      if (active >= limit) break;
      if (activeKeys.has(key) || !queue.length) continue;
      const task = queue.shift(); queues.delete(key);
      // Move the account to the tail, giving other communities their turn.
      if (queue.length) queues.set(key, queue);
      active++; activeKeys.add(key);
      Promise.resolve().then(task.operation).then(task.resolve, task.reject).finally(() => {
        active--; activeKeys.delete(key); pump();
        if (!active && !queues.size) idleWaiters.splice(0).forEach(resolve => resolve());
      });
    }
  }
  return {
    submit(key, operation) {
      return new Promise((resolve, reject) => {
        const queue = queues.get(key) || []; queue.push({ operation, resolve, reject }); queues.set(key, queue); pump();
      });
    },
    idle: () => !active && !queues.size ? Promise.resolve() : new Promise(resolve => idleWaiters.push(resolve)),
    inventory: () => ({ active, waiting: [...queues.values()].reduce((sum, q) => sum + q.length, 0), limit })
  };
}
const collectionAccountKey = item => String(item.syncRun?.account_id || item.syncRun?.accountId || item.source?.default_account_id || item.source?.id);
module.exports = { createFairCollectionPool, collectionAccountKey };
