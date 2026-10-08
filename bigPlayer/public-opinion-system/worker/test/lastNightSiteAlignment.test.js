'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID,
  inspectSiteAlignment } = require('../src/lastNightOverseasDailyJob');
const { applyLastNightSiteAlignment } = require('../src/lastNightSiteAlignment');

const sites = [1, 2, 3].map(index => ({ siteId: `site-${index}`,
  url: `https://club-en.q1.com/?gameId=2177&site=${index}`, enabled: true }));
const source = { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
  region_code: 'overseas', platform: 'bigplayer_h5', enabled: 1, community_status: 'enabled',
  config: JSON.stringify({ boardId: BOARD_ID, siteUrls: sites, unrelatedSetting: 'preserved' }) };
const legacy = { site_id: 'legacy-existing', url: sites[0].url, enabled: 1 };
const planHash = inspectSiteAlignment(source, [legacy], ['legacy-existing']).planHash;

function fakePool({ activeRun = false, activeLease = false, failInsert = false } = {}) {
  const state = { source: { ...source }, registry: [{ ...legacy }], queries: [], commits: 0,
    rollbacks: 0, releases: 0, begun: 0 };
  const connection = {
    async beginTransaction() { state.begun++; },
    async commit() { state.commits++; },
    async rollback() { state.rollbacks++; },
    release() { state.releases++; },
    async query(sql, params) {
      state.queries.push({ sql, params });
      if (sql.includes('FROM po_sources s JOIN')) return [[state.source]];
      if (sql.includes('SELECT id FROM po_sync_runs')) return [activeRun ? [{ id: 'active-run' }] : []];
      if (sql.includes('FROM po_source_schedule_state')) return [[{ active_lease: activeLease ? 1 : 0 }]];
      if (sql.includes('FROM po_source_sites')) return [state.registry.map(row => ({ ...row }))];
      if (sql.includes('SELECT DISTINCT site_id FROM po_sync_runs')) return [[{ site_id: legacy.site_id }]];
      if (sql.includes('SELECT DISTINCT cp.site_id')) return [[]];
      if (sql.startsWith('UPDATE po_sources')) {
        assert.equal(params[1], SOURCE_ID);
        assert.equal(params[2], state.source.config);
        state.source.config = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO po_source_sites')) {
        if (failInsert) throw Object.assign(new Error('isolated insert failure'), { code: 'ER_DUP_ENTRY' });
        state.registry.push({ site_id: params[2], url: params[3], enabled: 1 });
        return [{ affectedRows: 1 }];
      }
      throw new Error('UNEXPECTED_QUERY');
    }
  };
  return { state, pool: { getConnection: async () => connection } };
}

test('alignment updates only source config and inserts two sites in one transaction', async () => {
  const { pool, state } = fakePool();
  const result = await applyLastNightSiteAlignment({ pool, approvedPlanHash: planHash });
  assert.equal(result.status, 'aligned');
  assert.equal(result.insertedSites, 2);
  assert.equal(result.historicalIdentityChanged, false);
  assert.deepEqual([state.begun, state.commits, state.rollbacks, state.releases], [1, 1, 0, 1]);
  assert.deepEqual(state.registry.map(row => row.site_id), ['legacy-existing', 'site-2', 'site-3']);
  const updated = JSON.parse(state.source.config);
  assert.equal(updated.siteUrls[0].siteId, 'legacy-existing');
  assert.deepEqual(updated.siteUrls.slice(1), sites.slice(1));
  assert.equal(updated.unrelatedSetting, 'preserved');
  assert.equal(state.queries.filter(item => item.sql.startsWith('UPDATE')).length, 1);
  assert.equal(state.queries.filter(item => item.sql.includes('INSERT INTO')).length, 2);
  assert.equal(state.queries.some(item => /\bDELETE\b/i.test(item.sql)), false);
});

test('plan drift, active run and insert failure roll back without commit', async () => {
  for (const options of [{}, { activeRun: true }, { failInsert: true }]) {
    const { pool, state } = fakePool(options);
    const approval = options.activeRun || options.failInsert ? planHash : '0'.repeat(64);
    await assert.rejects(applyLastNightSiteAlignment({ pool, approvedPlanHash: approval }));
    assert.deepEqual([state.commits, state.rollbacks, state.releases], [0, 1, 1]);
  }
});

test('missing approved plan hash cannot open a database connection', async () => {
  let connections = 0;
  await assert.rejects(applyLastNightSiteAlignment({ pool: { getConnection: async () => { connections++; } } }),
    { code: 'LAST_NIGHT_ALIGNMENT_APPROVAL_REQUIRED' });
  assert.equal(connections, 0);
});
