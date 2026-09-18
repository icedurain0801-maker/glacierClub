(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SourceSyncProgress = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TERMINAL = new Set(['completed', 'completed_full', 'completed_authorized_scope', 'partial', 'awaiting_manual_verification', 'done', 'failed', 'cancelled', 'canceled']);
  const RETRY_DELAYS = [3000, 5000, 10000];
  const pick = (object, ...keys) => keys.map(key => object?.[key]).find(value => value !== undefined && value !== null);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const statusOf = run => String(pick(run, 'status', 'state', 'syncStatus', 'sync_status') || 'running').toLowerCase();
  const sequenceOf = item => number(pick(item, 'sequenceNo', 'sequence_no', 'sequence', 'seq', 'syncSequence', 'sync_sequence'));

  function normalizeRun(raw, fallback = {}) {
    const run = raw?.run || raw?.syncRun || raw?.sync_run || raw || {};
    return {
      ...run,
      id: pick(run, 'id', 'runId', 'run_id') || fallback.runId || '',
      status: statusOf(run),
      discovered: number(pick(run, 'discovered', 'discoveredCount', 'discovered_count', 'itemsDiscovered', 'items_discovered', 'itemsFound', 'items_found', 'total', 'totalItems', 'total_items', 'itemsTotal', 'items_total')),
      fetched: number(pick(run, 'fetched', 'fetchedCount', 'fetched_count', 'itemsFetched', 'items_fetched', 'processed')),
      created: number(pick(run, 'created', 'insertedCount', 'inserted_count', 'itemsCreated', 'items_created', 'inserted')),
      updated: number(pick(run, 'updated', 'changedCount', 'changed_count', 'itemsUpdated', 'items_updated', 'changed')),
      unchanged: number(pick(run, 'unchanged', 'unchangedCount', 'unchanged_count')),
      comments: number(pick(run, 'comments', 'commentCount', 'comment_count')),
      failed: number(pick(run, 'failed', 'itemsFailed', 'items_failed', 'errorCount', 'error_count')),
      message: pick(run, 'message', 'errorMessage', 'error_message', 'lastError', 'last_error') || ''
    };
  }

  function normalizeContents(raw) {
    const items = Array.isArray(raw) ? raw : raw?.items || raw?.contents || raw?.rows || [];
    const hasMore = pick(raw, 'hasMore', 'has_more');
    return {
      items: Array.isArray(items) ? items : [],
      hasMore: hasMore == null ? null : Boolean(hasMore),
      nextAfter: number(pick(raw, 'nextAfter', 'next_after'))
    };
  }

  function mergeBySequence(current, incoming) {
    const bySequence = new Map();
    current.concat(incoming).forEach(item => {
      const sequence = sequenceOf(item);
      if (sequence > 0) bySequence.set(sequence, item);
    });
    return [...bySequence.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  }

  function createController(options) {
    const request = options.request;
    const notify = options.onChange || function () {};
    const terminal = options.onTerminal || function () {};
    const schedule = options.setTimeout || setTimeout;
    const unschedule = options.clearTimeout || clearTimeout;
    const pollMs = options.pollMs || 1500;
    const retryDelays = options.retryDelays || RETRY_DELAYS;
    const pageSize = options.pageSize || 50;
    const batchSize = options.batchSize || 100;
    const state = {
      sourceId: '', runId: '', status: '', run: null, items: [], after: 0,
      visibleLimit: options.initialVisibleLimit || batchSize, hasMore: false, contentInitialized: false, loading: false, error: '', retryCount: 0,
      pageSize, batchSize, timer: null, serial: 0
    };

    function snapshot() { return { ...state, items: state.items.slice(), expanded: Boolean(state.runId) }; }
    function emit() { notify(snapshot()); }
    function clearTimer() { if (state.timer !== null) unschedule(state.timer); state.timer = null; }
    function queue(delay, serial) { clearTimer(); state.timer = schedule(() => poll(serial), delay); }
    function isCurrent(serial) { return serial === state.serial && Boolean(state.runId); }
    function runChanged(next) {
      if (!state.run) return true;
      return ['status', 'discovered', 'fetched', 'created', 'updated', 'unchanged', 'comments', 'failed', 'message']
        .some(key => state.run[key] !== next[key]);
    }

    async function fetchContents(serial, finalFetch) {
      if (!isCurrent(serial)) return;
      const raw = await request('contents', { sourceId: state.sourceId, runId: state.runId, after: state.after, limit: state.pageSize, final: Boolean(finalFetch) });
      if (!isCurrent(serial)) return;
      const page = normalizeContents(raw);
      state.items = mergeBySequence(state.items, page.items);
      state.contentInitialized = true;
      state.after = Math.max(state.after, page.nextAfter, ...page.items.map(sequenceOf));
      state.hasMore = page.hasMore == null ? page.items.length === state.pageSize : page.hasMore;
    }

    async function poll(serial = state.serial) {
      if (!isCurrent(serial) || state.loading) return;
      state.loading = true; state.error = ''; emit();
      try {
        const nextRun = normalizeRun(await request('run', { sourceId: state.sourceId, runId: state.runId }), state);
        if (!isCurrent(serial)) return;
        const changed = runChanged(nextRun);
        state.run = nextRun; state.status = nextRun.status; state.retryCount = 0;
        if (!state.contentInitialized || changed || TERMINAL.has(nextRun.status)) await fetchContents(serial, TERMINAL.has(nextRun.status));
        if (!isCurrent(serial)) return;
        state.loading = false; emit();
        if (TERMINAL.has(nextRun.status)) {
          clearTimer();
          terminal(snapshot());
        } else queue(pollMs, serial);
      } catch (error) {
        if (!isCurrent(serial)) return;
        state.loading = false; state.error = error?.message || String(error); state.retryCount += 1; emit();
        queue(retryDelays[Math.min(state.retryCount - 1, retryDelays.length - 1)], serial);
      }
    }

    function open(sourceId, runId, status) {
      stop(false);
      state.sourceId = String(sourceId || ''); state.runId = String(runId || ''); state.status = String(status || 'running').toLowerCase();
      state.run = normalizeRun({ id: state.runId, status: state.status }, state);
      state.items = []; state.after = 0; state.visibleLimit = state.batchSize; state.hasMore = false; state.contentInitialized = false; state.error = ''; state.retryCount = 0;
      const serial = state.serial; emit(); queue(0, serial);
    }

    function stop(emitChange = true) {
      clearTimer(); state.serial += 1; state.loading = false;
      state.sourceId = ''; state.runId = ''; state.status = ''; state.run = null; state.items = []; state.after = 0; state.hasMore = false; state.contentInitialized = false; state.error = ''; state.retryCount = 0;
      if (emitChange) emit();
    }

    async function loadMore() {
      if (!state.runId || state.loading) return;
      state.visibleLimit += state.batchSize;
      if (state.items.length < state.visibleLimit && state.hasMore) {
        const serial = state.serial; state.loading = true; emit();
        try {
          const pages = Math.max(1, Math.ceil(state.batchSize / state.pageSize));
          for (let page = 0; page < pages && state.items.length < state.visibleLimit && state.hasMore; page += 1) await fetchContents(serial, false);
          state.error = '';
        }
        catch (error) { if (isCurrent(serial)) state.error = error?.message || String(error); }
        if (isCurrent(serial)) { state.loading = false; emit(); }
      } else emit();
    }

    return { state, snapshot, open, stop, poll, loadMore, isTerminal: status => TERMINAL.has(String(status || '').toLowerCase()) };
  }

  return { RETRY_DELAYS, normalizeRun, normalizeContents, mergeBySequence, sequenceOf, isTerminal: status => TERMINAL.has(String(status || '').toLowerCase()), createController };
}));
