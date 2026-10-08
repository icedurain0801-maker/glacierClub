'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID, inspectSiteAlignment,
  runLastNightDaily } = require('../src/lastNightOverseasDailyJob');

const sites = [1, 2, 3].map(number => ({ siteId: `site-${number}`,
  url: `https://club-en.q1.com/?gameId=2177&site=${number}`, enabled: true }));
const source = { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
  region_code: 'overseas', platform: 'bigplayer_h5', enabled: 1, community_status: 'enabled',
  config: JSON.stringify({ boardId: BOARD_ID, siteUrls: sites }) };
const legacy = { site_id: 'legacy-existing', url: sites[0].url, enabled: 1 };
const aligned = [{ ...legacy }, ...sites.slice(1).map(site => ({ site_id: site.siteId,
  url: site.url, enabled: 1 }))];

function fakeRepo(registry, children = [], targetSource = source, parentStatus = 'completed') {
  const queries = [];
  return { queries,
    async query(sql, params) {
      queries.push({ sql, params });
      assert.ok(params.includes(SOURCE_ID) || params.includes('parent-1'));
      if (sql.includes('FROM po_sources s JOIN')) return [targetSource];
      if (sql.includes('FROM po_source_sites')) return registry;
      if (sql.includes('SELECT DISTINCT site_id FROM po_sync_runs')) return [{ site_id: 'legacy-existing' }];
      if (sql.includes('SELECT DISTINCT cp.site_id')) return [];
      if (sql.includes('SELECT * FROM po_sync_runs')) return children;
      throw new Error('UNEXPECTED_QUERY');
    },
    async getSyncRun(id, options) {
      assert.equal(options.sourceId, SOURCE_ID);
      if (id === 'parent-1') return { status: parentStatus };
      assert.ok(children.some(child => child.id === id));
      return { status: 'completed' };
    }
  };
}

test('one legacy URL yields a plan without changing historical identity', () => {
  const plan = inspectSiteAlignment(source, [legacy], ['legacy-existing']);
  assert.equal(plan.status, 'alignment_required');
  assert.equal(plan.legacySiteId, 'legacy-existing');
  assert.deepEqual(plan.missingSiteIds, ['site-2', 'site-3']);
  assert.equal(plan.plannedConfig.siteUrls[0].siteId, 'legacy-existing');
  assert.deepEqual(plan.plannedConfig.siteUrls.slice(1).map(site => site.siteId), ['site-2', 'site-3']);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
});

test('ambiguous registry, foreign history and domestic scope fail closed', () => {
  assert.throws(() => inspectSiteAlignment(source, [legacy, { site_id: 'unexpected', url: sites[1].url, enabled: 1 }]),
    { code: 'LAST_NIGHT_SITE_IDENTITY_UNSAFE' });
  assert.throws(() => inspectSiteAlignment(source, [legacy], ['legacy-existing', 'site-old']),
    { code: 'LAST_NIGHT_HISTORY_IDENTITY_UNSAFE' });
  assert.throws(() => inspectSiteAlignment({ ...source, region_code: 'domestic' }, [legacy]),
    { code: 'LAST_NIGHT_SCOPE_MISMATCH' });
});

test('misaligned source cannot schedule or process any platform', async () => {
  const repo = fakeRepo([legacy]);
  let calls = 0;
  await assert.rejects(runLastNightDaily({ deps: { repo, unifiedScheduler: {} },
    schedule: async () => { calls++; }, processRun: async () => { calls++; },
    analyze: async () => { calls++; } }), { code: 'LAST_NIGHT_SITE_ALIGNMENT_REQUIRED' });
  assert.equal(calls, 0);
  assert.equal(repo.queries.length, 4);
});

test('aligned source uses unified scheduler, three scoped child runs and scoped AI', async () => {
  const normalizedSource = { ...source, config: JSON.stringify({ boardId: BOARD_ID,
    siteUrls: [{ ...sites[0], siteId: 'legacy-existing' }, ...sites.slice(1)] }) };
  const children = aligned.map((site, index) => ({ id: `child-${index + 1}`,
    source_id: SOURCE_ID, community_id: COMMUNITY_ID, board_id: BOARD_ID,
    site_id: site.site_id, site_url_snapshot: site.url,
    window_start: '2026-10-07 00:00:00.000', window_end: '2026-10-08 00:00:00.000' }));
  const repo = fakeRepo(aligned, children, normalizedSource);
  const processed = [];
  let analysisOptions;
  const result = await runLastNightDaily({ deps: { repo, unifiedScheduler: { mode: 'enabled', workerId: 'test' } },
    schedule: async options => {
      assert.deepEqual(options.sourceAllowlist, [SOURCE_ID]);
      assert.equal(options.mode, 'enabled');
      assert.equal(options.recoverySourceId, null);
      return { status: 'completed', candidateCount: 1,
        decisions: [{ sourceId: SOURCE_ID, status: 'enqueued', runId: 'parent-1' }] };
    },
    processRun: async (_deps, actualSource, child) => {
      assert.equal(actualSource.id, SOURCE_ID);
      processed.push(child.site_id);
    },
    analyze: async options => { analysisOptions = options; return { status: 'completed' }; } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(processed, ['legacy-existing', 'site-2', 'site-3']);
  assert.equal(analysisOptions.sourceId, SOURCE_ID);
  assert.deepEqual(analysisOptions.scope, { regionCode: 'overseas', gameId: GAME_ID, communityId: COMMUNITY_ID });
  assert.equal(analysisOptions.publishedFrom, '2026-10-07T00:00:00.000Z');
  assert.equal(repo.queries.length, 5);
});

test('incomplete parent aggregation blocks scoped AI', async () => {
  const normalizedSource = { ...source, config: JSON.stringify({ boardId: BOARD_ID,
    siteUrls: [{ ...sites[0], siteId: 'legacy-existing' }, ...sites.slice(1)] }) };
  const children = aligned.map((site, index) => ({ id: `child-${index + 1}`,
    source_id: SOURCE_ID, community_id: COMMUNITY_ID, board_id: BOARD_ID,
    site_id: site.site_id, site_url_snapshot: site.url,
    window_start: '2026-10-07 00:00:00.000', window_end: '2026-10-08 00:00:00.000' }));
  const repo = fakeRepo(aligned, children, normalizedSource, 'queued');
  let analysisCalls = 0;
  await assert.rejects(runLastNightDaily({ deps: { repo, unifiedScheduler: {} },
    schedule: async () => ({ status: 'completed', candidateCount: 1,
      decisions: [{ sourceId: SOURCE_ID, status: 'enqueued', runId: 'parent-1' }] }),
    processRun: async () => {}, analyze: async () => { analysisCalls++; } }),
  { code: 'LAST_NIGHT_PARENT_RUN_INCOMPLETE' });
  assert.equal(analysisCalls, 0);
});

test('dry-run loads no service env and opens no database connection', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../src/lastNightOverseasDailyJob.js'), '--dry-run'],
    { encoding: 'utf8', env: { PATH: process.env.PATH, PUBLIC_OPINION_ENV_FILE: 'C:/missing/never-read.env' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).productionReadAttempted, false);
});
