const test = require('node:test');
const assert = require('node:assert/strict');
const SyncProgress = require('./source-sync-progress.js');

test('cancelled run is terminal, fetches final contents once, and does not schedule another poll', async () => {
  const scheduled = [];
  const requests = [];
  let terminal;
  const controller = SyncProgress.createController({
    pollMs: 10,
    setTimeout: callback => { scheduled.push(callback); return scheduled.length; },
    clearTimeout: () => {},
    request: async (kind) => {
      requests.push(kind);
      if (kind === 'run') return { id: 'run-cancelled', status: 'cancelled', error_code: 'SYNC_RUN_CANCELLED', error_message: 'cancelled before worker claim' };
      return { items: [], hasMore: false };
    },
    onTerminal: snapshot => { terminal = snapshot; }
  });

  controller.open('taptap-source', 'run-cancelled', 'queued');
  await controller.poll();

  assert.deepEqual(requests, ['run', 'contents']);
  assert.equal(controller.snapshot().status, 'cancelled');
  assert.equal(controller.snapshot().run.message, 'cancelled before worker claim');
  assert.equal(terminal.status, 'cancelled');
  assert.equal(scheduled.length, 1, 'open() only schedules its initial poll');
});
