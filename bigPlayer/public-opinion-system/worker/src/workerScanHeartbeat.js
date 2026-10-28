'use strict';

// A scan can contain slow, valid collection work. Liveness must not depend on
// its completion, and refreshing liveness must never reset its real start time.
function createWorkerScanHeartbeat({ write, intervalMs = 30000, now = () => new Date(),
  setTimer = setInterval, clearTimer = clearInterval, warn = () => {} }) {
  const startedAt = now();
  let stage = 'startup', detail = null, timer = null, pending = null, stopped = false, warned = false;
  const currentScan = () => `${stage}${detail ? `:${detail()}` : ''}`.slice(0, 128);
  const snapshot = () => ({ scanStartedAt: startedAt, scanFinishedAt: null,
    scanStatus: 'running', scanError: null, currentScan: currentScan() });
  const refresh = () => {
    if (stopped || pending) return pending;
    pending = Promise.resolve().then(() => write(snapshot())).finally(() => { pending = null; });
    return pending;
  };
  return {
    async start() {
      await refresh();
      timer = setTimer(() => {
        if (!warned && now().getTime() - startedAt.getTime() > 600000) {
          warned = true;
          warn({ phase: currentScan(), errorCode: 'WORKER_SCAN_OVERDUE' });
        }
        void refresh()?.catch(() => {});
      }, intervalMs);
      timer?.unref?.();
    },
    stage(value, describe = null) { stage = value; detail = describe; },
    async finish(status, error = null) {
      stopped = true;
      if (timer) clearTimer(timer);
      // Serialize the final write behind an in-flight tick; otherwise a late
      // running heartbeat can overwrite a completed/failed scan.
      if (pending) await pending.catch(() => {});
      await write({ scanStartedAt: startedAt, scanFinishedAt: now(), scanStatus: status,
        scanError: error, currentScan: null });
    }
  };
}

module.exports = { createWorkerScanHeartbeat };
