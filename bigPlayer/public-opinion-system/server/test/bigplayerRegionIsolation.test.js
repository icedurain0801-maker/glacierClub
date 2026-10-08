'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');

test('REG-04 domestic and overseas BigPlayer fixtures keep independent configured origins', async () => {
  const requested = [];
  const connector = new BigPlayerH5Connector({}, { fetchImpl: async url => {
    requested.push(String(url));
    return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { items: [], hasMore: false } }) };
  } });
  const domestic = { id: 'domestic-source', region_code: 'domestic', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=domestic&gameVersion=1' } };
  const overseas = { id: 'overseas-source', region_code: 'overseas', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=overseas&gameVersion=1' } };
  assert.match(connector.resolveBaseUrl(domestic), /gameId=domestic/);
  assert.match(connector.resolveBaseUrl(overseas), /gameId=overseas/);
  assert.notEqual(connector.resolveBaseUrl(domestic), connector.resolveBaseUrl(overseas));
  assert.equal(requested.length, 0);
});
