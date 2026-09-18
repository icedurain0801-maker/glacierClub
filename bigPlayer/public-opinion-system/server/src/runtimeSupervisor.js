const DEFAULT_RETRY_DELAYS_MS = Object.freeze([5000, 30000, 60000]);

function redact(value) {
  return String(value == null ? '' : value)
    .replace(/(token|secret|password|authorization|cookie|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]');
}

function createSupervisor({ start, stop, logger = console, delays = DEFAULT_RETRY_DELAYS_MS, jitter = 0.1, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  if (typeof start !== 'function') throw new TypeError('start is required');
  let stopped = false; let timer = null; let attempt = 0; let running = null;
  const log = (level, message, extra) => logger?.[level]?.(redact(message), extra ? redact(JSON.stringify(extra)) : '');
  const schedule = () => {
    if (stopped) return;
    const base = Number(delays[Math.min(Math.max(0, attempt - 1), delays.length - 1)]) || 60000;
    const factor = 1 + ((Math.random() * 2 - 1) * Math.max(0, Number(jitter) || 0));
    timer = setTimeoutFn(() => { timer = null; run(); }, Math.max(0, Math.round(base * factor)));
  };
  const run = () => {
    if (stopped || running) return running;
    running = Promise.resolve().then(start).then(result => { attempt = 0; return result; }).catch(error => {
      log('error', `service start failed: ${error?.code || error?.message || error}`);
      attempt += 1; schedule(); return null;
    }).finally(() => { running = null; });
    return running;
  };
  return {
    start: run,
    stop: async () => { stopped = true; if (timer) clearTimeoutFn(timer); timer = null; if (running) await running; if (typeof stop === 'function') await stop(); },
    get state() { return { stopped, attempt, scheduled: Boolean(timer), running: Boolean(running) }; }
  };
}

module.exports = { createSupervisor, redact, DEFAULT_RETRY_DELAYS_MS };
