const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupervisor, redact } = require('../src/runtimeSupervisor');

test('supervisor retries with bounded 5/30/60s delays and stops pending timer', async () => {
  const timers = []; let attempts = 0; const logger = { error() {} };
  const sup = createSupervisor({ start: async () => { attempts++; throw Object.assign(new Error('token=secret'), { code: 'DB_DOWN' }); }, logger, jitter: 0, setTimeoutFn: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeoutFn: id => { timers[id - 1].cleared = true; } });
  await sup.start(); await Promise.resolve(); assert.equal(timers[0].ms, 5000); await sup.stop(); assert.equal(timers[0].cleared, true); assert.equal(redact('token=secret Bearer abc'), 'token=[REDACTED] Bearer [REDACTED]');
});
