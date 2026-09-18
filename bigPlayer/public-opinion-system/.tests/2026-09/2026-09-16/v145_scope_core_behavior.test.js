const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scopeSource = fs.readFileSync(path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/scope.js'), 'utf8');

function makeHarness({ url = 'http://test/admin/PublicOpinion/index.html', session = {} } = {}) {
  const listeners = new Map(); const pending = []; const sessionValues = new Map([[ 'publicOpinionScope', JSON.stringify(session) ]]);
  const location = new URL(url); const history = { pushes: [], replaces: [], pushState(_state, _title, next) { this.pushes.push(next); setLocation(next); }, replaceState(_state, _title, next) { this.replaces.push(next); setLocation(next); } };
  const select = values => ({ value: values[0], disabled: false, onchange: null, options: values.map(value => ({ value })), set innerHTML(html) { this.options = [...html.matchAll(/value="([^"]+)"/g)].map(match => ({ value: match[1] })); if (!this.options.some(option => option.value === this.value)) this.value = this.options[0]?.value || ''; }, get innerHTML() { return ''; } });
  const region = select(['domestic', 'overseas']); const community = select([]); const platform = select([]);
  const host = { querySelector(selector) { if (selector === '[data-po-region]') return region; if (selector === '[data-po-community]') return community; if (selector === '[data-po-platform-select]') return platform; return null; }, insertAdjacentHTML(_position, html) { if (html.includes('data-po-region')) return; if (html.includes('data-po-platform-select')) return; } };
  const document = { head: { appendChild() {} }, createElement() { return { textContent: '' }; }, querySelector(selector) { return selector === '[data-po-scope]' || selector === '[data-po-platform-scope]' ? host : null; } };
  function setLocation(next) { const value = new URL(next, location.href); location.pathname = value.pathname; location.search = value.search; location.hash = value.hash; }
  const window = { PUBLIC_OPINION_API: '/api/public-opinion', addEventListener(type, callback) { listeners.set(type, callback); }, dispatchEvent() {}, location };
  const context = { window, document, location, history, URL, URLSearchParams, AbortController, Intl, fetch: (requestUrl, options) => new Promise(resolve => pending.push({ requestUrl, options, resolve })), sessionStorage: { getItem(key) { return sessionValues.get(key) || null; }, setItem(key, value) { sessionValues.set(key, value); } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
  vm.runInNewContext(scopeSource, context, { filename: 'scope.js' });
  return { scope: window.PublicOpinionScope, region, community, platform, pending, history, location, sessionValues, async resolve(index, communities) { pending[index].resolve({ ok: true, text: async () => JSON.stringify({ data: communities }) }); await Promise.resolve(); }, async popstate(next) { setLocation(next); await listeners.get('popstate')(); } };
}

test('page transport injects immutable scope, cancels stale reads and blocks empty scope', async () => {
  const harness = makeHarness(); const initialized = harness.scope.init();
  await harness.resolve(0, [{ id: 'one', name: 'One', status: 'enabled' }]); await initialized;
  let sent; let resolveRead;
  const pending = harness.scope.withScope('/sync-runs/run-one?scope=posts', {}, (url, options) => {
    sent = { url, options }; return new Promise(resolve => { resolveRead = resolve; });
  });
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  assert.match(sent.url, /regionCode=domestic/); assert.match(sent.url, /communityId=one/); assert.match(sent.url, /scope=posts/);
  harness.region.value = 'overseas'; const changing = harness.region.onchange();
  assert.equal(sent.options.signal.aborted, true);
  resolveRead({ id: 'old' }); await rejection;
  await harness.resolve(1, []); await changing;
  let called = false;
  await assert.rejects(harness.scope.withScope('/contents', {}, () => { called = true; }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('absent URL community cannot mask a legal non-first session selection', async () => {
  const harness = makeHarness({ session: { regionCode: 'domestic', communityId: 'two' } });
  const initialized = harness.scope.init();
  await harness.resolve(0, [{ id: 'one', name: 'One', status: 'enabled' }, { id: 'two', name: 'Two', status: 'enabled' }]);
  await initialized; assert.equal(harness.scope.selected().communityId, 'two');
});

test('Scope validates URL/session, ignores stale community responses, and aborts active business work', async () => {
  const harness = makeHarness({ url: 'http://test/admin/PublicOpinion/index.html?regionCode=invalid&communityId=invalid', session: { regionCode: 'domestic', communityId: 'session-community' } });
  const changes = []; const initializing = harness.scope.init({ onChange: (_query, selected) => changes.push(selected) });
  await harness.resolve(0, [{ id: 'session-community', name: 'Session', status: 'enabled' }]); await initializing;
  assert.equal(harness.scope.selected().communityId, 'session-community', '非法 URL 回退 session 中仍可用社区');
  const work = harness.scope.beginRequest(); assert.equal(work.allowed, true);

  harness.region.value = 'overseas'; const olderChange = harness.region.onchange();
  assert.equal(harness.scope.available(), false, '地区社区加载期间立即不可用');
  assert.equal(work.signal.aborted, true, 'Scope 变化立即取消已有业务请求');
  assert.equal(work.isCurrent(), false);
  harness.region.value = 'domestic'; const newerChange = harness.region.onchange();
  await harness.resolve(1, [{ id: 'stale-overseas', name: 'Stale', status: 'enabled' }]);
  await harness.resolve(2, [{ id: 'fresh-domestic', name: 'Fresh', status: 'enabled' }]);
  await Promise.all([olderChange, newerChange]);
  assert.equal(harness.scope.selected().communityId, 'fresh-domestic');
  assert.equal(changes.length, 1, '过期响应不得追加通知');
  assert.equal(harness.history.pushes.length, 1, '过期响应不得追加 history');
  assert.match(harness.history.pushes[0], /communityId=fresh-domestic/);
});

test('Scope restores legal popstate and denies business request when no enabled community exists', async () => {
  const harness = makeHarness({ url: 'http://test/admin/PublicOpinion/index.html?regionCode=domestic&communityId=one' });
  const changes = []; const initialized = harness.scope.init({ onChange: (_query, selected) => changes.push(selected) });
  await harness.resolve(0, [{ id: 'one', name: 'One', status: 'enabled' }]); await initialized;
  const restoring = harness.popstate('/admin/PublicOpinion/index.html?regionCode=overseas&communityId=two');
  await harness.resolve(1, [{ id: 'two', name: 'Two', status: 'enabled' }]); await restoring;
  assert.equal(harness.scope.selected().regionCode, 'overseas');
  assert.equal(harness.scope.selected().communityId, 'two');
  assert.equal(changes.length, 1, 'popstate 只触发一次 Scope 变更');

  const empty = makeHarness(); const emptyInit = empty.scope.init();
  await empty.resolve(0, [{ id: 'disabled', name: 'Disabled', status: 'disabled' }]); await emptyInit;
  const blocked = empty.scope.beginRequest();
  assert.equal(empty.scope.available(), false);
  assert.equal(blocked.allowed, false, '无 enabled 社区时不允许业务请求');
  assert.equal(blocked.signal.aborted, true);
  empty.platform.value = 'taptap'; empty.platform.onchange();
  assert.equal(empty.history.pushes.length, 0, '无社区时平台交互不改变 Scope 或触发业务链路');
});

test('platform control cannot cancel a pending region normalization', async () => {
  const harness = makeHarness({ url: 'http://test/admin/PublicOpinion/index.html?regionCode=domestic&communityId=one' });
  const changes = []; const initialized = harness.scope.init({ onChange: (_query, selected) => changes.push(selected) });
  await harness.resolve(0, [{ id: 'one', name: 'One', status: 'enabled' }]); await initialized;
  harness.region.value = 'overseas'; const changingRegion = harness.region.onchange();
  assert.equal(harness.platform.disabled, true, '社区加载期间禁用平台控件');
  harness.platform.value = 'discord'; harness.platform.onchange();
  assert.equal(harness.history.pushes.length, 0, '加载中的平台交互不能中断地区归一化');
  await harness.resolve(1, [{ id: 'overseas-community', name: 'Overseas', status: 'enabled' }]); await changingRegion;
  assert.equal(harness.scope.available(), true);
  assert.equal(harness.platform.disabled, false, '社区加载完成后恢复平台控件');
  assert.equal(harness.scope.selected().communityId, 'overseas-community');
  assert.equal(changes.length, 1);
  assert.match(harness.history.pushes[0], /regionCode=overseas/);
});
