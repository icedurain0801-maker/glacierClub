'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.resolve(__dirname, '../../../../admin/PublicOpinion/assets');
const Status = require(path.join(assets, 'source-status'));
const script = fs.readFileSync(path.join(assets, 'sources.js'), 'utf8');
const response = (data, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(status < 400 ? { data } : { error: data }) });
function harness(transport = async () => response([])) {
  const elements = new Map(), requests = [], sites = [{ value: 'https://example.invalid/a' }, { value: '' }];
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', textContent: '', innerHTML: '', options: [], isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } }, querySelectorAll() { return []; }, addEventListener() {}, focus() {} });
    return elements.get(selector);
  };
  const api = {}, scope = { selected: () => ({ communityId: 'community-a', communityLabel: '我要当老祖', communityStatus: 'enabled', regionCode: 'domestic', platform: 'bigplayer_h5' }),
    query: () => new URLSearchParams({ communityId: 'community-a', regionCode: 'domestic', platform: 'bigplayer_h5' }), epoch: () => 1, available: () => true };
  const context = { __PUBLIC_OPINION_TEST__: api, console, URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, addEventListener() {}, confirm: () => false,
    fetch: async (url, options = {}) => { requests.push({ url, method: options.method || 'GET', body: options.body }); return transport(url, options); },
    location: { pathname: '/admin/PublicOpinion/sources.html', search: '' }, history: { replaceState() {} },
    document: { querySelector: selector => ['#cfgH5Account', '#cfgH5Password', '#cfgToken'].includes(selector)
      && !element('#drawerContent').innerHTML.includes(`id="${selector.slice(1)}"`) ? null : element(selector),
      querySelectorAll: selector => selector === '[data-site-url]' ? sites : [], addEventListener() {} },
    SourceStatus: Status, SourceSyncProgress: { isTerminal: () => false, sequenceOf: () => 0,
      createController: () => ({ state: {}, snapshot: () => ({ run: {}, items: [], visibleLimit: 0 }), stop() {}, open() {} }) },
    PublicOpinionScope: { platforms: [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }], platformsForRegion: () => [], init: () => new Promise(() => {}) } };
  context.window = context; context.globalThis = context;
  vm.runInNewContext(script, context, { filename: 'sources.js' }); api.state.scope = scope;
  element('[data-po-platform-select]').value = 'bigplayer_h5';
  return { api, element, requests, sites, scope };
}
function savedForm(h, source) {
  h.element('#cfgName').value = source.display_name;
  h.element('#cfgFreq').value = '21600';
  h.element('#cfgBoardId').value = '2';
  h.sites.splice(0, h.sites.length, ...source.config.siteUrls.map(value => ({ value })));
  h.api.state.activeSourceId = source.id;
}
const saved = () => ({ id: 'real-source', platform: 'bigplayer_h5', community_id: 'community-a', region_code: 'domestic',
  display_name: '现有来源', frequency_seconds: 21600, config: { boardId: '2', siteUrls: ['https://example.invalid/a'] } });

test('new H5 draft keeps Create after switching both auth modes and preserves basic/site input', () => {
  const h = harness(); h.api.openCreateDrawer();
  h.element('#cfgName').value = '未提交的名称'; h.element('#cfgBoardId').value = '9'; h.element('#cfgFreq').value = '86400';
  h.element('#h5AuthPassword').onclick();
  assert.match(h.element('#drawerContent').innerHTML, /新增采集源/);
  assert.match(h.element('#drawerContent').innerHTML, /id="btnCreate"/);
  assert.doesNotMatch(h.element('#drawerContent').innerHTML, /id="(?:btnSaveSource|btnCheckAuth|btnCheckCapabilities|btnCheckLogin)"/);
  assert.equal(h.element('#cfgName').value, '未提交的名称'); assert.equal(h.element('#cfgBoardId').value, '9');
  assert.equal(h.element('#cfgFreq').value, '86400');
  assert.match(h.element('#cfgSiteUrlList').innerHTML, /https:\/\/example.invalid\/a/);
  assert.equal((h.element('#cfgSiteUrlList').innerHTML.match(/data-site-url-row/g) || []).length, 2);
  h.element('#h5AuthToken').onclick(); assert.match(h.element('#drawerContent').innerHTML, /id="btnCreate"/);
  assert.equal(h.requests.length, 0);
});
test('account text survives password-token-password with absent inactive fields', () => {
  const h = harness(); h.api.openCreateDrawer(); h.element('#h5AuthPassword').onclick();
  h.element('#cfgH5Account').value = 'synthetic-account'; h.element('#h5AuthToken').onclick();
  h.element('#h5AuthPassword').onclick(); assert.equal(h.element('#cfgH5Account').value, 'synthetic-account');
  assert.doesNotMatch(h.element('#drawerContent').innerHTML, /synthetic-account/);
  assert.equal(h.requests.length, 0);
});
test('draft IDs cannot save or invoke either check or login endpoints', async () => {
  const h = harness();
  for (const id of [undefined, '', 'undefined', 'null']) {
    const draft = { id, platform: 'bigplayer_h5' };
    await h.api.saveSource(draft); await h.api.runSourceAction(draft, 'check-auth');
    await h.api.runSourceAction(draft, 'check-capabilities'); await h.api.checkLogin(draft);
  }
  assert.equal(h.requests.length, 0); assert.match(h.element('#toast').textContent, /请先创建/);
});
test('404 preserves form, reports stale source in Chinese and blocks repeated invalid requests', async () => {
  const h = harness(async () => response({ code: 'NOT_FOUND', message: 'source not found' }, 404)), source = saved(); savedForm(h, source);
  await h.api.runSourceAction(source, 'check-auth');
  assert.match(h.element('#toast').textContent, /采集源已不存在或页面已过期/);
  assert.equal(h.element('#cfgName').value, source.display_name);
  await h.api.runSourceAction(source, 'check-capabilities'); await h.api.saveSource(source);
  assert.equal(h.requests.length, 1); assert.doesNotMatch(h.element('#toast').textContent, /密码错误/);
});
test('unsaved configuration and scope changes block checking the old source', async () => {
  const h = harness(), source = saved(); savedForm(h, source);
  h.element('#cfgName').value = '待保存'; await h.api.runSourceAction(source, 'check-auth');
  assert.equal(h.requests.length, 0); assert.match(h.element('#toast').textContent, /请先保存配置/);
  h.element('#cfgName').value = source.display_name;
  h.scope.selected = () => ({ communityId: 'another-community', regionCode: 'domestic' });
  await h.api.checkLogin(source); assert.equal(h.requests.length, 0); assert.match(h.element('#toast').textContent, /页面已切换/);
});
test('create is single-flight, uses POST sources and keeps form on failure', async () => {
  let complete;
  const h = harness(() => new Promise(resolve => { complete = resolve; })); h.api.openCreateDrawer();
  for (const [key, value] of Object.entries({ cfgPlatform: 'bigplayer_h5', cfgCommunity: 'community-a', cfgName: '草稿', cfgFreq: '21600', cfgBoardId: '2', cfgToken: 'synthetic-token' })) h.element('#' + key).value = value;
  h.sites.splice(0, h.sites.length, { value: 'https://example.invalid/a' });
  h.api.state.h5AuthMode = 'token'; const pending = h.api.createSource(); await h.api.createSource();
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, '/api/public-opinion/sources');
  assert.equal(h.requests[0].method, 'POST');
  complete(response({ code: 'INVALID_INPUT', message: 'synthetic rejected' }, 400)); await pending;
  assert.equal(h.element('#cfgName').value, '草稿'); assert.equal(h.api.state.creating, false);
  assert.match(h.element('#drawerContent').innerHTML, /id="btnCreate"/);
});
function draftForm(h) {
  h.api.openCreateDrawer();
  for (const [key, value] of Object.entries({ cfgPlatform: 'bigplayer_h5', cfgCommunity: 'community-a', cfgName: '草稿', cfgFreq: '21600', cfgBoardId: '2', cfgToken: 'synthetic-token' })) h.element('#' + key).value = value;
  h.sites.splice(0, h.sites.length, { value: 'https://example.invalid/a' }); h.api.state.h5AuthMode = 'token';
}
test('successful response without source ID never becomes a saved source or repeats POST automatically', async () => {
  const h = harness(async () => response({ platform: 'bigplayer_h5' })); draftForm(h);
  await h.api.createSource(); await h.api.createSource();
  assert.equal(h.requests.length, 1); assert.equal(h.api.state.sources.length, 0);
  assert.match(h.element('#toast').textContent, /创建结果尚未确认/);
});
test('unparseable successful create response has unknown outcome and cannot repeat POST', async () => {
  const h = harness(async () => ({ ok: true, status: 201, text: async () => 'invalid json' })); draftForm(h);
  await h.api.createSource(); await h.api.createSource(); assert.equal(h.requests.length, 1);
  assert.match(h.element('#toast').textContent, /创建结果尚未确认/);
});
test('late create success cannot close or replace a newer draft in the same scope', async () => {
  let complete;
  const h = harness((url, options) => options.method === 'POST' ? new Promise(resolve => { complete = resolve; }) : response([]));
  draftForm(h); const pending = h.api.createSource();
  h.api.openCreateDrawer(); h.element('#cfgName').value = '重新打开后的草稿';
  complete(response(saved())); await pending;
  assert.equal(h.element('#cfgName').value, '重新打开后的草稿');
  assert.match(h.element('#drawerContent').innerHTML, /id="btnCreate"/);
  assert.equal(h.requests.filter(item => item.method === 'POST').length, 1);
});
test('late save success or failure cannot close or mark a newer draft', async () => {
  for (const status of [200, 404]) {
    let complete;
    const h = harness((url, options) => options.method === 'PATCH' ? new Promise(resolve => { complete = resolve; }) : response([]));
    const open = new Set(); h.element('#drawerMask').classList = { add: name => open.add(name), remove: name => open.delete(name) };
    const source = { ...saved(), account: { hasToken: true } }; savedForm(h, source);
    const pending = h.api.saveSource(source); h.api.openCreateDrawer();
    h.element('#cfgName').value = '新的未保存草稿';
    complete(status === 200 ? response(source) : response({ code: 'NOT_FOUND', message: 'source not found' }, 404)); await pending;
    assert(open.has('open')); assert.equal(h.element('#cfgName').value, '新的未保存草稿');
    assert.match(h.element('#drawerContent').innerHTML, /id="btnCreate"/);
    assert.equal(source._sourceUnavailable, undefined); assert.equal(h.requests.length, 1);
  }
});
test('save response after a scope switch cannot close the active drawer', async () => {
  let complete;
  const h = harness(() => new Promise(resolve => { complete = resolve; }));
  const source = { ...saved(), account: { hasToken: true } }; savedForm(h, source);
  const open = new Set(['open']); h.element('#drawerMask').classList = { add: name => open.add(name), remove: name => open.delete(name) };
  const pending = h.api.saveSource(source); h.scope.selected = () => ({ communityId: 'community-b', regionCode: 'domestic' });
  complete(response(source)); await pending;
  assert(open.has('open')); assert.equal(h.requests.length, 1);
});
