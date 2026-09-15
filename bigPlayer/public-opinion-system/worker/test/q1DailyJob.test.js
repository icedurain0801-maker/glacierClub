'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runQ1Daily, runCrawler, runQ1Preflight, buildDailyReport, sanitizeMessage, legacyScheduledGate } = require('../src/q1DailyJob');

test('enabled unified mode yields scheduled Q1 runs while off and manual keep legacy entry behavior', async () => {
  const result = await runQ1Daily({ unifiedSchedulerMode: 'enabled' });
  assert.deepEqual(result, {
    status: 'skipped',
    reasonCode: 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS'
  });
  assert.equal(legacyScheduledGate({ mode: 'off' }), null);
  assert.equal(legacyScheduledGate({ mode: undefined }), null);
  assert.equal(legacyScheduledGate({ mode: 'enabled', triggerType: 'manual' }), null);
  await assert.rejects(
    () => runQ1Daily({ unifiedSchedulerMode: 'enabled', triggerType: 'manual' }),
    /sourceId is required/
  );
});

test('builds a fixed sanitized daily report with analysis counters', () => {
  const report = buildDailyReport({
    sourceId: 'source-1',
    window: { businessDate: '2026-08-24', publishedFrom: 'from', publishedTo: 'to' },
    summary: { posts: 2, rawPosts: 5, uniquePosts: 2, comments: 3, replies: 1, import: { items: 6, inserted: 4, changed: 2, analysisEligibleIds: ['a', 'b'] } },
    analysis: { total: 2, completed: 2, pending: 0, running: 0, retryable: 0, failed: 0 }
  });
  assert.deepEqual(report, {
    sourceId: 'source-1', regionCode: null, externalCommunity: null, internalGameId: null, internalCommunityId: null,
    businessDate: '2026-08-24', publishedFrom: 'from', publishedTo: 'to',
    posts: 2, rawPosts: 5, uniquePosts: 2, commentsReplies: 4, comments: 3, replies: 1,
    databaseTotal: 6, inserted: 4, changed: 2, unchanged: 0, failedBatches: 0, failedItems: 0, analysisEligibleTotal: 2,
    analysisTotal: 2, analysisCompleted: 2, analysisPending: 0, analysisRunning: 0, analysisRetryable: 0, analysisFailed: 0, complete: true, status: 'completed'
  });
  assert.doesNotMatch(JSON.stringify(report), /token|cookie|password|api[_ -]?key|secret/i);
});

test('daily report exposes external and canonical audit scope', () => {
  const report = buildDailyReport({
    sourceId: 's1',
    window: { businessDate: '2026-08-24' },
    scope: { regionCode: 'overseas', externalCommunity: 'western', gameId: 'canonical-game', communityId: 'community-a' }
  });
  assert.deepEqual({
    regionCode: report.regionCode,
    externalCommunity: report.externalCommunity,
    internalGameId: report.internalGameId,
    internalCommunityId: report.internalCommunityId
  }, { regionCode: 'overseas', externalCommunity: 'western', internalGameId: 'canonical-game', internalCommunityId: 'community-a' });
});

test('runs manual collection with an isolated analysis claim, persists report, and prevents duplicate rerun', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-test-'));
  const outDir = path.join(root, 'run');
  const lockDir = path.join(root, 'locks');
  let collections = 0;
  let analyses = 0;
  const crawler = async ({ args }) => {
    collections += 1;
    assert.deepEqual(args.slice(0, 7), ['--source-id', 'source-1', '--since', '2026-08-23T16:00:00.000Z', '--until', '2026-08-24T16:00:00.000Z', '--out']);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ status: 'collection_completed', window: '2026-08-24', posts: 2, comments: 3, replies: 1, import: { inserted: 4, changed: 1, analysisEligibleIds: ['a', 'b'] } }));
  };
  class FakeAnalysisRunner {
    constructor(options) { analyses += 1; assert.deepEqual(options.contentIds, ['a', 'b']); assert.equal(options.manualClaim, true); assert.equal(options.businessDate, '2026-08-24'); }
    async run() { return { status: 'completed', total: 2, completed: 2, pending: 0, running: 0, retryable: 0, failed: 0 }; }
  }
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, preflight: async () => ({ probed: true }), close: async () => {} });
  const first = await runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, triggerType: 'manual', runnerOptions: { lockDir, productionFactory } });
  assert.equal(first.report.complete, true);
  const second = await runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, triggerType: 'manual', runnerOptions: { lockDir, productionFactory } });
  assert.equal(second.skipped, true);
  assert.equal(collections, 1);
  assert.equal(analyses, 1);
  const report = JSON.parse(await fs.readFile(path.join(outDir, 'daily-report.json'), 'utf8'));
  assert.equal(report.status, 'skipped_duplicate');
});

test('does not start analysis when crawler reports incomplete collection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-partial-'));
  const outDir = path.join(root, 'run'); const lockDir = path.join(root, 'locks'); let analyses = 0;
  const crawler = async () => { await fs.mkdir(outDir, { recursive: true }); await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ status: 'collection_partial', window: '2026-08-24', truncatedFeeds: [{ feed: 'circle/all' }], import: { analysisEligibleIds: ['a'] } })); };
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, preflight: async () => {}, close: async () => {} });
  class FakeAnalysisRunner { constructor() { analyses += 1; } async run() { return {}; } }
  await assert.rejects(() => runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, runnerOptions: { lockDir, productionFactory } }), error => error.code === 'Q1_COLLECTION_INCOMPLETE');
  assert.equal(analyses, 0);
});

test('continues analysis when importer reports import_partial with eligible ids', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-importpartial-'));
  const outDir = path.join(root, 'run'); const lockDir = path.join(root, 'locks'); let analyses = 0;
  const crawler = async () => {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({
      status: 'import_partial', window: '2026-08-24', truncatedFeeds: [],
      import: { inserted: 4, changed: 1, analysisEligibleIds: ['a', 'b'], failedBatches: 1 }
    }));
  };
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, preflight: async () => ({ probed: true }), close: async () => {} });
  class FakeAnalysisRunner {
    constructor(options) { analyses += 1; assert.deepEqual(options.contentIds, ['a', 'b']); }
    async run() { return { status: 'completed', total: 2, completed: 2, pending: 0, running: 0, retryable: 0, failed: 0 }; }
  }
  const result = await runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, runnerOptions: { lockDir, productionFactory } });
  assert.equal(analyses, 1);
  assert.equal(result.report.complete, true);
  assert.equal(result.report.status, 'completed_partial');
});
test('sanitizes sensitive values in failure text', () => {
  assert.equal(sanitizeMessage('authorization: abc token=xyz cookie=def'), 'authorization: [redacted] token=[redacted] cookie=[redacted]');
});

test('writes phase evidence with stable counts and redacts errors', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-evidence-'));
  const outDir = path.join(root, 'run'); const lockDir = path.join(root, 'locks'); const events = [];
  const crawler = async () => {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ status: 'collection_completed', window: '2026-08-24', posts: 2, comments: 3, replies: 1, import: { inserted: 4, analysisEligibleIds: ['a', 'b'] } }));
  };
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, preflight: async () => ({ probed: true }), close: async () => {} });
  class FakeAnalysisRunner { async run() { return { status: 'completed', total: 2, completed: 2, pending: 0, running: 0, retryable: 0, failed: 0 }; } }
  await runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, log: value => events.push(value), runnerOptions: { lockDir, productionFactory } });
  const phases = events.map(value => JSON.parse(value).phase);
  for (const phase of ['target', 'preflight', 'fetch', 'import', 'analysis', 'completion']) assert.ok(phases.includes(phase), phase);
  assert.ok(events.some(value => JSON.parse(value).phase === 'import' && JSON.parse(value).counts.analysisEligibleTotal === 2));
  assert.ok(events.some(value => JSON.parse(value).phase === 'completion' && JSON.parse(value).counts.analysisTotal === 2));
  assert.doesNotMatch(events.join('\n'), /token-secret|password-secret|authorization-secret/i);
  await fs.rm(root, { recursive: true, force: true });
});

test('does not replace an existing successful report with a failure report', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-report-'));
  const outDir = path.join(root, 'run'); const lockDir = path.join(root, 'locks');
  await fs.mkdir(outDir, { recursive: true });
  const success = { status: 'completed', complete: true, businessDate: '2026-08-24' };
  await fs.writeFile(path.join(outDir, 'daily-report.json'), JSON.stringify(success));
  const productionFactory = async () => ({ source: { id: 'source-1' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, close: async () => {} });
  await assert.rejects(() => runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), runnerOptions: { lockDir, productionFactory, preflight: async () => { const error = new Error('failed'); error.code = 'FAILED'; throw error; } } }));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(outDir, 'daily-report.json'), 'utf8')), success);
  await fs.rm(root, { recursive: true, force: true });
});

test('sanitizes JSON and query-string sensitive values in failure text', () => {
  const message = sanitizeMessage('{"password":"pw-secret","token":"tok-secret","cookie":"cookie-secret","authorization":"Bearer auth-secret","apiKey":"key-secret"} https://q1.test/?token=query-secret&api_key=query-key');
  assert.doesNotMatch(message, /pw-secret|tok-secret|cookie-secret|auth-secret|key-secret|query-secret|query-key/);
  assert.match(message, /password.*redacted/i);
  assert.match(message, /token.*redacted/i);
  assert.match(message, /cookie.*redacted/i);
  assert.match(message, /authorization.*redacted/i);
  assert.match(message, /apiKey.*redacted/i);
});

test('sanitizes crawler stderr before forwarding it', async () => {
  const script = path.join((await fs.mkdtemp(path.join(os.tmpdir(), 'q1-crawler-stderr-'))), 'fake.js');
  await fs.writeFile(script, "process.stderr.write(JSON.stringify({password:'stderr-secret', authorization:'Bearer auth-secret', apiKey:'key-secret'})); process.exit(1);");
  const lines = [];
  await assert.rejects(() => runCrawler({ script, python: process.execPath, log: line => lines.push(line) }));
  const output = lines.join(' ');
  assert.doesNotMatch(output, /stderr-secret|auth-secret|key-secret/);
  assert.match(output, /password.*redacted/i);
  assert.match(output, /authorization.*redacted/i);
  assert.match(output, /apiKey.*redacted/i);
});

test('retries an authorization preflight exactly once after refresh', async () => {
  let probes = 0; let refreshes = 0;
  const result = await runQ1Preflight({ source: { id: 's1' }, account: { id: 'a1' }, preflight: async () => {
    probes += 1;
    if (probes === 1) { const error = new Error('unauthorized'); error.code = 'UNAUTHORIZED'; throw error; }
    return { probed: true };
  }, refreshAuth: async () => { refreshes += 1; } });
  assert.deepEqual(result, { probed: true });
  assert.equal(probes, 2); assert.equal(refreshes, 1);
});

test('writes preflight failure and preserves structured error code', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-preflight-'));
  const outDir = path.join(root, 'run');
  const lockDir = path.join(root, 'locks');
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, close: async () => {} });
  await assert.rejects(() => runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), runnerOptions: { lockDir, productionFactory, preflight: async () => { const error = new Error('denied token=secret'); error.code = 'PERMISSION_DENIED'; throw error; } }, crawler: async () => { throw new Error('must not run'); } }), error => error.code === 'PERMISSION_DENIED' && error.report.failurePhase === 'preflight');
  const report = JSON.parse(await fs.readFile(path.join(outDir, 'daily-report.json'), 'utf8'));
  assert.equal(report.errorCode, 'PERMISSION_DENIED');
  assert.equal(report.failurePhase, 'preflight');
  assert.doesNotMatch(JSON.stringify(report), /secret/);
});

test('uses the default production preflight path when no preflight is injected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'q1-daily-default-preflight-'));
  const outDir = path.join(root, 'run'); const lockDir = path.join(root, 'locks'); let probed = 0;
  const productionFactory = async () => ({ source: { id: 'source-1', platform: 'bigplayer_h5' }, account: { id: 'account-1' }, connector: {}, credentialContext: {}, ai: { configured: () => true }, preflight: async () => { probed += 1; }, close: async () => {} });
  const crawler = async () => { await fs.mkdir(outDir, { recursive: true }); await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({ window: '2026-08-24', status: 'collection_completed', import: { analysisEligibleIds: [] } })); };
  class FakeAnalysisRunner { async run() { return { status: 'completed', total: 0, completed: 0 }; } }
  await runQ1Daily({ sourceId: 'source-1', outDir, now: new Date('2026-08-25T01:00:00+08:00'), crawler, analysisRunner: FakeAnalysisRunner, runnerOptions: { lockDir, productionFactory } });
  assert.equal(probed, 1);
});

test('does not refresh or use natural-language health reason as an error code', async () => {
  let refreshes = 0;
  await assert.rejects(() => runQ1Preflight({
    source: { id: 's1' }, account: { id: 'a1' },
    connector: {
      async installationHealth() { return { installed: true, configured: true }; },
      async accountHealth() { return { configured: false, authorized: false, reason: 'session expired at login page' }; }
    }, credentialContext: {}, ai: { configured: () => true },
    refreshAuth: async () => { refreshes += 1; }
  }), error => error.code === 'UNAUTHORIZED');
  assert.equal(refreshes, 0);
});

test('refreshes once when health reports an explicit authorization code', async () => {
  let probes = 0; let refreshes = 0;
  const result = await runQ1Preflight({
    source: { id: 's1' }, account: { id: 'a1' },
    connector: {
      async installationHealth() { return { installed: true, configured: true }; },
      async accountHealth() {
        probes += 1;
        if (probes === 1) return { configured: false, authorized: false, code: 'UNAUTHORIZED', reason: 'token rejected' };
        return { configured: true, authorized: true };
      }
    }, credentialContext: {}, ai: { configured: () => true },
    refreshAuth: async () => { refreshes += 1; }
  });
  assert.equal(result.probed, true);
  assert.equal(probes, 2);
  assert.equal(refreshes, 1);
});

test('normalizes manual verification health reason to stable challenge code', async () => {
  await assert.rejects(() => runQ1Preflight({
    source: { id: 's1' }, account: { id: 'a1' },
    connector: {
      async installationHealth() { return { installed: true, configured: true }; },
      async accountHealth() { return { configured: false, authorized: false, reason: 'awaiting_manual_verification' }; }
    }, credentialContext: {}, ai: { configured: () => true }
  }), error => error.code === 'AUTH_REFRESH_CHALLENGE_REQUIRED');
});

test('classifies all manual verification codes as awaiting without refreshing', async () => {
  for (const code of ['MANUAL_VERIFICATION_REQUIRED', 'AUTH_REFRESH_CHALLENGE_REQUIRED', 'LOGIN_CHALLENGE_REQUIRED', 'awaiting_manual_verification']) {
    let refreshes = 0;
    await assert.rejects(() => runQ1Preflight({
      source: { id: 's1' }, account: { id: 'a1' },
      connector: { async installationHealth() { return { installed: true, configured: true }; }, async accountHealth() { return { configured: false, authorized: false, code }; } },
      credentialContext: {}, ai: { configured: () => true }, refreshAuth: async () => { refreshes += 1; }
    }), error => error.code === 'AUTH_REFRESH_CHALLENGE_REQUIRED');
    assert.equal(refreshes, 0);
    const error = new Error('manual'); error.code = code;
    assert.equal(buildDailyReport({ sourceId: 's1', window: { businessDate: '2026-08-24' }, error }).status, 'awaiting_manual_verification');
  }
});

test('reports manual verification as awaiting status while preserving preflight phase', () => {
  const error = new Error('manual login verification is required');
  error.code = 'AUTH_REFRESH_CHALLENGE_REQUIRED';
  const report = buildDailyReport({
    sourceId: 'source-1',
    window: { businessDate: '2026-08-24' },
    phase: 'preflight',
    error
  });
  assert.equal(report.status, 'awaiting_manual_verification');
  assert.equal(report.errorCode, 'AUTH_REFRESH_CHALLENGE_REQUIRED');
  assert.equal(report.failurePhase, 'preflight');
});

test('parses structured crawler errors without collapsing the code', async () => {
  const script = path.join((await fs.mkdtemp(path.join(os.tmpdir(), 'q1-crawler-probe-'))), 'fake.js');
  await fs.writeFile(script, "process.stdout.write(JSON.stringify({errorCode:'TOKEN_EMPTY',failurePhase:'preflight',message:'token=secret'})); process.exit(1);");
  await assert.rejects(() => runCrawler({ script, python: process.execPath }), error => error.code === 'TOKEN_EMPTY' && error.failurePhase === 'preflight' && !/secret/.test(error.message));
});
