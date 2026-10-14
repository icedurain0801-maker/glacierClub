'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../../admin/PublicOpinion');
const source = fs.readFileSync(path.join(root, 'assets/scope.js'), 'utf8');
function harness(regionCode = 'domestic', preferred = 'hidden') {
  const location = new URL(`http://test/index.html?regionCode=${regionCode}&communityId=${preferred}&keyword=keep`);
  const storage = new Map([['publicOpinionScope', JSON.stringify({ regionCode, communityId: preferred })]]);
  const pending = [], listeners = new Map();
  const select = () => ({ value: '', disabled: false, options: [], set innerHTML(html) { this.options = [...html.matchAll(/value="([^"]*)"/g)].map(m => ({ value: m[1] })); } });
  const region = select(), community = select(), platform = select();
  const host = { querySelector: s => ({ '[data-po-region]': region, '[data-po-community]': community, '[data-po-platform-select]': platform })[s] || null, insertAdjacentHTML() {} };
  const document = { querySelector: s => ['[data-po-scope]', '[data-po-platform-scope]'].includes(s) ? host : null, createElement: () => ({}), head: { appendChild() {} } };
  const setLocation = next => { const u = new URL(next, location); location.pathname = u.pathname; location.search = u.search; location.hash = u.hash; };
  const history = { pushState: (_s, _t, next) => setLocation(next), replaceState: (_s, _t, next) => setLocation(next) };
  const window = { addEventListener: (type, cb) => listeners.set(type, cb), dispatchEvent() {} };
  vm.runInNewContext(source, { window, document, location, history, URL, URLSearchParams, AbortController, Intl, CustomEvent: class {},
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, fetch: () => new Promise(resolve => pending.push(resolve)) });
  return { scope: window.PublicOpinionScope, region, community, location, storage,
    async resolve(index, items) { pending[index]({ ok: true, text: async () => JSON.stringify({ data: items }) }); await Promise.resolve(); },
    async pop(next) { setLocation(next); await listeners.get('popstate')(); } };
}
test('domestic order repairs hidden URL/session and preserves permissions and epoch cancellation', async () => {
  const h = harness(), p = h.scope.init();
  await h.resolve(0, [{ id: 'hidden', name: '其他' }, { id: '3', name: '我要当老祖' }, { id: '2', name: '圣魂纷争' }, { id: '1', name: '超能世界国服版', permissions: { canWrite: false } }]); await p;
  assert.deepEqual(h.community.options.map(v => v.value), ['1', '2', '3']);
  assert.equal(h.scope.query().get('communityId'), '1'); assert.equal(h.location.searchParams.get('communityId'), '1');
  assert.equal(JSON.parse(h.storage.get('publicOpinionScope')).communityId, '1'); assert.equal(h.scope.selected().canWrite, false);
  assert.equal(h.location.searchParams.get('keyword'), 'keep');
  const work = h.scope.beginRequest(); h.community.value = 'hidden'; h.community.onchange();
  assert.equal(work.signal.aborted, true); assert.equal(h.scope.selected().communityId, '1');
});
test('overseas case/order and hidden popstate URL are normalized', async () => {
  const h = harness('overseas'); const items = [{ id: 'h', name: 'Hero Clash' }, { id: 'l', name: 'Last Light' }, { id: 'x', name: 'X-clash' }, { id: 'hidden', name: 'other' }];
  const p = h.scope.init(); await h.resolve(0, items); await p;
  assert.deepEqual(h.community.options.map(v => v.value), ['x', 'l', 'h']);
  const pop = h.pop('/index.html?regionCode=overseas&communityId=hidden'); await h.resolve(1, items); await pop;
  assert.equal(h.location.searchParams.get('communityId'), 'x'); assert.equal(h.scope.selected().communityId, 'x');
});
test('disabled/hidden-only scope blocks reads, legal non-first selection survives', async () => {
  const h = harness('domestic', '2'), p = h.scope.init();
  await h.resolve(0, [{ id: '1', name: '超能世界国服版', status: 'disabled' }, { id: '2', name: '圣魂纷争', status: 'enabled' }]); await p;
  assert.equal(h.scope.selected().communityId, '2');
  for (const items of [[{ id: 'hidden', name: 'other' }], [{ id: '1', name: '超能世界国服版', status: 'disabled' }]]) {
    const empty = harness(), init = empty.scope.init(); await empty.resolve(0, items); await init;
    assert.equal(empty.scope.available(), false); assert.equal(empty.scope.selected().communityId, '');
    assert.equal(empty.location.searchParams.has('communityId'), false);
    let called = false; await assert.rejects(empty.scope.withScope('/contents', {}, () => { called = true; }), { name: 'AbortError' }); assert.equal(called, false);
  }
});
test('six page cache references match', () => {
  for (const name of ['index', 'content', 'alerts', 'sources', 'collection-runs', 'keywords']) {
    const html = fs.readFileSync(path.join(root, name + '.html'), 'utf8'); assert.match(html, /assets\/scope\.js\?v=148/); assert.doesNotMatch(html, /assets\/scope\.js\?v=147/);
  }
});
