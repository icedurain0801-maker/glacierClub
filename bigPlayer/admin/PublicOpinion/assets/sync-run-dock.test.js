const test = require('node:test');
const assert = require('node:assert/strict');
const Dock = require('./sync-run-dock.js');
test('normalizes an active run and permits only valid controls', () => { const run = Dock.normalize({ run_id: 'run-1', source_id: 'source-1', status: 'running', fetched_count: 3, discovered_count: 7 }); assert.deepEqual({ id: run.id, sourceId: run.sourceId, status: run.status, fetched: run.fetched, discovered: run.discovered }, { id: 'run-1', sourceId: 'source-1', status: 'running', fetched: 3, discovered: 7 }); assert.equal(Dock.canControl('running', 'pause'), true); assert.equal(Dock.canControl('running', 'resume'), false); assert.equal(Dock.canControl('paused', 'resume'), true); assert.equal(Dock.canControl('cancelled', 'cancel'), false); });
test('normalizes multi-site projection while keeping legacy runs single-site', () => {
  const parent = Dock.normalize({ id: 'parent-1', runRole: 'parent', triggerType: 'scheduled', site_total: 3, site_terminal: 2, site_succeeded: 1, site_failed: 1 });
  assert.deepEqual({ runRole: parent.runRole, triggerType: parent.triggerType, siteTotal: parent.siteTotal, siteTerminal: parent.siteTerminal, siteSucceeded: parent.siteSucceeded, siteFailed: parent.siteFailed }, { runRole: 'parent', triggerType: 'scheduled', siteTotal: 3, siteTerminal: 2, siteSucceeded: 1, siteFailed: 1 });
  const child = Dock.normalize({ id: 'child-1', parent_run_id: 'parent-1', site_id: 'ja-jp', trigger_type: 'scheduled_site' });
  assert.deepEqual({ runRole: child.runRole, triggerType: child.triggerType, siteId: child.siteId }, { runRole: 'site', triggerType: 'scheduled_site', siteId: 'ja-jp' });
  assert.equal(Dock.normalize({ id: 'legacy-1' }).runRole, 'single');
  assert.equal(Dock.canControl('running', 'pause'), true, 'control compatibility is unchanged');
});
test('parent summary controls fail closed while scheduled children and legacy runs retain run-level controls', () => {
  assert.equal(Dock.canControl('running', 'pause', 'parent', true), false);
  assert.equal(Dock.canControl('running', 'cancel', 'parent', true), false);
  assert.equal(Dock.canControl('running', 'pause', 'site'), true);
  assert.equal(Dock.canControl('running', 'cancel', 'site'), true);
  assert.equal(Dock.canControl('running', 'pause', 'single'), true);
});
test('control request uses the run-level endpoint and persists the returned state', async () => { const values = new Map(); const calls = []; const dock = Dock.create({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, text: async () => JSON.stringify({ data: { id: 'run-1', status: 'pausing' } }) }; }, document: null, apiBase: '/api/public-opinion' }); dock.track({ id: 'run-1', status: 'running' }); await dock.control('pause'); assert.equal(calls[0].url, '/api/public-opinion/sync-runs/run-1/pause'); assert.equal(calls[0].options.method, 'POST'); assert.equal(dock.snapshot().status, 'pausing'); dock.clear(); });
test('delegated dock actions cancel through the API and dismiss without changing run state', async () => { const values = new Map(); const calls = []; const dock = Dock.create({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, text: async () => JSON.stringify({ data: { id: 'run-1', status: 'cancelled' } }) }; }, document: null, apiBase: '/api/public-opinion' }); dock.track({ id: 'run-1', status: 'running' }); assert.equal(dock.handleDockClick({ closest: () => ({ dataset: { syncRunAction: 'cancel' }, hasAttribute: () => false }) }), true); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls[0].url, '/api/public-opinion/sync-runs/run-1/cancel'); assert.equal(dock.snapshot().status, 'cancelled'); assert.equal(dock.handleDockClick({ closest: () => ({ dataset: {}, hasAttribute: name => name === 'data-sync-run-dismiss' }) }), true); assert.equal(dock.snapshot(), null); assert.equal(calls.length, 1); });
test('dismiss clears the Dock pointer and sync deep-link so a refresh cannot recover it', () => {
  const values = new Map(); const priorLocation = globalThis.location; const priorHistory = globalThis.history; const calls = [];
  globalThis.location = { pathname: '/admin/PublicOpinion/sources.html', search: '?syncSourceId=source-1&syncRunId=run-1&regionCode=domestic', hash: '' };
  globalThis.history = { replaceState: (_state, _title, url) => calls.push(url) };
  try {
    const dock = Dock.create({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, document: null });
    dock.track({ id: 'run-1', sourceId: 'source-1', status: 'cancelled' });
    dock.dismiss();
    assert.equal(values.has(Dock.STORAGE_KEY), false);
    assert.equal(dock.snapshot(), null);
    assert.deepEqual(calls, ['/admin/PublicOpinion/sources.html?regionCode=domestic']);
  } finally { globalThis.location = priorLocation; globalThis.history = priorHistory; }
});

test('stale polling cannot overwrite a completed cancel response', async () => {
  const values = new Map(); let resolveGet; const calls = [];
  const dock = Dock.create({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, fetch: async (url, options) => { calls.push({ url, options }); if (options.method === 'POST') return { ok: true, text: async () => JSON.stringify({ data: { id: 'run-1', status: 'cancelled' } }) }; return new Promise(resolve => { resolveGet = resolve; }); }, document: null, apiBase: '/api/public-opinion' });
  dock.track({ id: 'run-1', status: 'running' }); const refreshing = dock.refresh(); const cancelling = dock.control('cancel'); await cancelling; resolveGet({ ok: true, text: async () => JSON.stringify({ data: { id: 'run-1', status: 'running' } }) }); await refreshing; assert.equal(dock.snapshot().status, 'cancelled'); assert.equal(calls[1].url, '/api/public-opinion/sync-runs/run-1/cancel'); dock.clear();
});

test('closing invalidates an in-flight poll and keeps the Dock hidden', async () => {
  const values = new Map(); let resolveGet; const dock = Dock.create({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, fetch: async () => new Promise(resolve => { resolveGet = resolve; }), document: null, apiBase: '/api/public-opinion' });
  dock.track({ id: 'run-1', status: 'running' }); const refreshing = dock.refresh(); dock.dismiss(); resolveGet({ ok: true, text: async () => JSON.stringify({ data: { id: 'run-1', status: 'running' } }) }); await refreshing; assert.equal(dock.snapshot(), null);
});
