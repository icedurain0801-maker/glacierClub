const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourceScript = fs.readFileSync(path.join(__dirname, '../../../admin/PublicOpinion/assets/sources.js'), 'utf8');

test('BigPlayer source form exposes multi-site input and legacy baseUrl fallback', () => {
  assert.match(sourceScript, /id="cfgSiteUrlList"/);
  assert.match(sourceScript, /site-url-field/);
  assert.match(sourceScript, /btnAddSiteUrl/);
  assert.match(sourceScript, /data-remove-site-url/);
  assert.match(sourceScript, /sourceSiteUrls\(source\)/);
  assert.match(sourceScript, /payload\.siteUrls = parsedSites\.urls/);
  assert.match(sourceScript, /patch\.siteUrls = parsedSites\.urls/);
  assert.match(sourceScript, /payload\.baseUrl = parsedSites\.urls\[0\]/);
  assert.match(sourceScript, /patch\.baseUrl = parsedSites\.urls\[0\]/);
});

test('BigPlayer form rejects unsafe and duplicate normalized URLs before API call', () => {
  assert.match(sourceScript, /SITE_URL|站点地址重复/);
  assert.match(sourceScript, /parsed\.username \|\| parsed\.password \|\| parsed\.hash/);
  assert.match(sourceScript, /seen\.has\(canonical\)/);
});

test('only BigPlayer Token editing renders a single-column drawer', () => {
  assert.match(sourceScript, /const usesSingleColumnDetailLayout = normalizedPlatform\(source\) === 'bigplayer_h5' && h5AuthMode\(source\) === 'token';/);
  assert.match(sourceScript, /detail-grid\$\{usesSingleColumnDetailLayout \? ' detail-grid--single' : ''\}/);
  assert.match(sourceScript, /\$\{usesSingleColumnDetailLayout \? '' : `<div class="detail-column validation-column">/);
});

test('TapTap editing retains a two-column validation workspace without active verification actions', () => {
  assert.match(sourceScript, /if \(platform === 'taptap'\) \{/);
  assert.match(sourceScript, /TapTap 采集验证工作区/);
  assert.match(sourceScript, /此处仅展示验证状态，不会自动发起授权或同步/);
});
