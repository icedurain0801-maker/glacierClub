const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSiteUrls, normalizeUrl, derivedSiteId } = require('../src/services/bigplayerSiteConfig');

test('normalizes a controlled three-site fixture and keeps stable order', () => {
  const result = normalizeSiteUrls({ siteUrls: [
    { url: 'https://A.example.com///', siteId: 'cn', authStatus: 'authorized' },
    { url: 'https://b.example.com/path/' },
    { url: 'https://c.example.com' }
  ] }, { allowedHosts: ['a.example.com', 'b.example.com', 'c.example.com'] });
  assert.deepEqual(result.siteUrls.map(site => site.url), ['https://a.example.com/', 'https://b.example.com/path', 'https://c.example.com/']);
  assert.equal(result.baseUrl, result.siteUrls[0].url);
  assert.equal(result.siteUrls[0].siteId, 'cn');
  assert.equal(result.siteUrls[1].siteId, derivedSiteId(result.siteUrls[1].url));
});

test('maps legacy baseUrl to siteUrls[0] and preserves canonical baseUrl', () => {
  const result = normalizeSiteUrls({ baseUrl: 'https://club.q1.com/' }, { allowedHosts: ['club.q1.com'] });
  assert.equal(result.siteUrls.length, 1);
  assert.equal(result.siteUrls[0].url, 'https://club.q1.com/');
  assert.equal(result.baseUrl, 'https://club.q1.com/');
});

test('rejects normalized duplicate URLs and duplicate site IDs', () => {
  assert.throws(() => normalizeSiteUrls({ siteUrls: ['https://a.example.com', 'https://A.example.com/'] }), error => error.code === 'SITE_URL_DUPLICATE');
  assert.throws(() => normalizeSiteUrls({ siteUrls: [{ url: 'https://a.example.com', siteId: 'same' }, { url: 'https://b.example.com', siteId: 'same' }] }), error => error.code === 'SITE_ID_DUPLICATE');
});

test('rejects unsafe, disallowed, and empty site URLs', () => {
  assert.throws(() => normalizeUrl('ftp://a.example.com'), error => error.code === 'SITE_URL_PROTOCOL');
  assert.throws(() => normalizeUrl('https://user:pass@a.example.com'), error => error.code === 'SITE_URL_UNSAFE');
  assert.throws(() => normalizeUrl('https://a.example.com', { allowedHosts: ['b.example.com'] }), error => error.code === 'SITE_URL_HOST_NOT_ALLOWED');
  assert.throws(() => normalizeSiteUrls({}), error => error.code === 'SITE_URL_REQUIRED');
});
