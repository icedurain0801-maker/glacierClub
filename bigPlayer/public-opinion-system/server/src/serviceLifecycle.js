'use strict';

// Share an outstanding DB check so a stalled dependency cannot accumulate probes.
function createReadinessProbe(check, timeoutMs = 3000) {
  let pending;
  return async () => {
    if (!pending) pending = Promise.resolve().then(check).finally(() => { pending = null; });
    let timer;
    try {
      await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('READINESS_TIMEOUT')), timeoutMs);
      })]);
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); }
  };
}

async function drainServer(server, pool, timeoutMs = 20000) {
  let timer;
  try {
    await new Promise((resolve, reject) => {
      server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
      server.closeIdleConnections?.();
      timer = setTimeout(() => server.closeAllConnections?.(), timeoutMs);
      timer.unref?.();
    });
  } finally { clearTimeout(timer); }
  // Existing request handlers may still need the DB while the listener drains.
  await pool?.end?.();
}

module.exports = { createReadinessProbe, drainServer };
