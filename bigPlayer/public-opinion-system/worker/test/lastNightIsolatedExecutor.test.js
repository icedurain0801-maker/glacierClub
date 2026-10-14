'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { executeIsolatedFixture } = require('../src/lastNightIsolatedExecutor');
const { LastNightIsolatedStore } = require('../src/lastNightIsolatedStore');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');

test('production and injected shared stores fail before any IO', async () => {
  let calls = 0;
  const store = { identity: { port: 43319 }, isolatedTest: true,
    async freezeSites() { calls += 1; } };
  for (const mode of [undefined, 'production', 'isolated-test']) {
    await assert.rejects(executeIsolatedFixture({ mode, store }),
      { code: 'PRODUCTION_EXECUTION_DISABLED' });
  }
  assert.equal(calls, 0);
});

test('real connector collision and unregistered wrapper fail before freezeSites', async () => {
  let freezes = 0;
  let requests = 0;
  const store = Object.create(LastNightIsolatedStore.prototype);
  store.identity = { port: 43319 };
  store.freezeSites = async () => { freezes += 1; };
  const connector = new BigPlayerH5Connector({}, {
    fetchImpl: async () => { requests += 1; }
  });
  const sites = ['2', '9', '16'].map((languageId, index) => ({ siteId: `site-${index}`,
    url: `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${languageId}` }));
  const input = { mode: 'isolated-test', store, sites, connector,
    source: { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
      region_code: 'overseas', platform: 'bigplayer_h5', config: { boardId: BOARD_ID } },
    account: { id: 'fixture-account', source_id: SOURCE_ID, platform: 'bigplayer_h5' },
    publishedFrom: '2026-10-07T00:00:00.000Z', publishedTo: '2026-10-08T00:00:00.000Z',
    ai: {}, deepPolicy: () => false };
  await assert.rejects(executeIsolatedFixture(input),
    { code: 'LAST_NIGHT_UPSTREAM_SITE_COLLISION' });
  const wrapped = {
    discoverFeeds: (...args) => connector.discoverFeeds(...args),
    listFeedContents: (...args) => connector.listFeedContents(...args),
    listComments: (...args) => connector.listComments(...args)
  };
  await assert.rejects(executeIsolatedFixture({ ...input, connector: wrapped }),
    { code: 'LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED' });
  assert.equal(freezes, 0);
  assert.equal(requests, 0);
});
