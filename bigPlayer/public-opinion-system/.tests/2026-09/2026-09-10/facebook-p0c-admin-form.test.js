const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcesScript = path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/sources.js');
const sourceStatus = require(path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/source-status.js'));

function response(data, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(ok ? { data } : { error: data }) };
}

function loadHarness(fetchImpl = async () => response([])) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', inert: false,
      options: [], isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {}, focus() {}, closest() { return null; }, querySelectorAll() { return []; }
    });
    return elements.get(selector);
  };
  element('#platformFilter').value = '';
  element('#statusFilter').value = '';
  const api = {};
  const context = {
    __PUBLIC_OPINION_TEST__: api,
    console,
    URL: class TestURL extends URL { constructor(input, base = 'http://127.0.0.1') { super(input, base); } },
    URLSearchParams,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: fetchImpl,
    confirm: () => false,
    addEventListener() {},
    history: { replaceState() {} },
    location: { pathname: '/admin/PublicOpinion/sources.html', search: '' },
    document: { querySelector: element, addEventListener() {}, head: { appendChild() {} } },
    SourceStatus: sourceStatus,
    SourceSyncProgress: {
      isTerminal: () => false,
      sequenceOf: () => 0,
      createController: () => ({ state: {}, snapshot: () => ({ run: {}, items: [], visibleLimit: 0 }), stop() {}, open() {} })
    },
    PublicOpinionScope: {
      platforms: [{ value: 'facebook', label: 'Facebook' }],
      platformsForRegion: () => [{ value: 'facebook', label: 'Facebook' }],
      init: () => new Promise(() => {})
    },
    formatBeijingTime: value => String(value)
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcesScript, 'utf8'), context, { filename: sourcesScript });
  return { api, element };
}

function facebookSource(overrides = {}) {
  return {
    id: 'facebook-source',
    platform: 'facebook',
    community_id: '00000000-0000-0000-0000-000000000102',
    community_name: 'Last Night',
    community_status: 'enabled',
    region_code: 'overseas',
    display_name: 'Last Night Facebook',
    enabled: false,
    auth_status: 'authorized',
    systemCredentialStatus: 'configured',
    config: { baseUrl: 'https://www.facebook.com/LastLightSurvival', syncMode: 'incremental', historyStart: null },
    account: { auth_status: 'authorized', platform_account_id: '123456789' },
    capabilities: {
      page: 'authorized_scope', pageManagement: 'authorized_scope', moderate: 'authorized_scope',
      posts: 'authorized_scope', comments: 'authorized_scope', replies: 'authorized_scope'
    },
    ...overrides
  };
}

function setForm(element, values = {}) {
  const defaults = {
    '#cfgName': { value: 'Last Night Facebook' },
    '#cfgBaseUrl': { value: 'https://www.facebook.com/LastLightSurvival' },
    '#cfgFacebookInitialSync': { value: 'incremental' },
    '#cfgHistoryStart': { value: '' },
    '#cfgFreq': { value: '3600' },
    '#cfgEnabled': { checked: false }
  };
  for (const [selector, fields] of Object.entries({ ...defaults, ...values })) Object.assign(element(selector), fields);
}

test('Facebook 主页地址规范化移除跟踪参数，并拒绝非主页或非官方地址', () => {
  const { api } = loadHarness();
  assert.equal(api.parseFacebookPageUrl('https://facebook.com/LastLightSurvival/?utm_source=admin&fbclid=x').url, 'https://www.facebook.com/LastLightSurvival');
  assert.match(api.parseFacebookPageUrl('https://evil.example/LastLightSurvival').error, /仅支持/);
  assert.match(api.parseFacebookPageUrl('https://www.facebook.com/groups/example').error, /单个 Facebook 主页/);
});

test('Facebook 显式只读权限、部署级凭据与六能力门禁生效', () => {
  const { api } = loadHarness();
  assert.equal(api.facebookCanManage({ canWrite: false }), false);
  assert.equal(api.facebookCanManage({ permissions: { canManage: false } }), false);
  assert.equal(api.facebookCanManage({}), true);
  assert.equal(api.facebookReady(facebookSource()), true);
  const missingReplies = facebookSource({ capabilities: { page: 'authorized_scope', pageManagement: 'authorized_scope', moderate: 'authorized_scope', posts: 'authorized_scope', comments: 'authorized_scope', replies: 'untested' } });
  assert.equal(api.facebookReady(missingReplies), false);
  assert.match(api.facebookUnavailableReason(missingReplies), /回复列表与分页/);
  assert.equal(api.facebookReady(facebookSource({ systemCredentialStatus: 'expired' })), false);
  assert.match(api.facebookUnavailableReason(facebookSource({ systemCredentialStatus: 'expired' })), /官方采集凭据/);
});

test('Discord 列表继续展示 Guild 与频道范围摘要', () => {
  const { api, element } = loadHarness();
  api.state.sources = [{ id: 'discord-source', platform: 'discord', display_name: 'Discord', config: { guildId: '123456789012345', channelIds: ['111', '222'] } }];
  api.state.sourcesLoading = false;
  api.state.scope = { selected: () => ({ regionCode: 'overseas' }), query: () => new URLSearchParams() };
  api.renderRows();
  assert.match(element('#rows').innerHTML, /Guild：123456789012345/);
  assert.match(element('#rows').innerHTML, /频道：111、222/);
});

test('Facebook 规范化同址不触发变更，仅主页地址变更会 fail-closed', () => {
  const { api, element } = loadHarness();
  const source = facebookSource();
  setForm(element, { '#cfgBaseUrl': { value: 'https://facebook.com/LastLightSurvival/?utm_campaign=test' } });
  assert.equal(api.facebookFormChanged(source), false);
  element('#cfgBaseUrl').value = 'https://facebook.com/AnotherOfficialPage';
  assert.equal(api.facebookFormChanged(source), true);
  assert.equal(api.facebookFormPayload(source, false).payload.enabled, false);
});

test('Facebook 三种首次同步映射为明确的服务端合同', () => {
  const { api, element } = loadHarness();
  const source = facebookSource();
  setForm(element);

  element('#cfgFacebookInitialSync').value = 'all';
  let payload = api.facebookFormPayload(source, false).payload;
  assert.equal(payload.syncMode, 'backfill');
  assert.equal(payload.historyStart, '1970-01-01T00:00:00.000Z');

  element('#cfgFacebookInitialSync').value = 'since';
  element('#cfgHistoryStart').value = '2026-09-01';
  payload = api.facebookFormPayload(source, false).payload;
  assert.equal(payload.syncMode, 'backfill');
  assert.equal(payload.historyStart, '2026-09-01T00:00:00+08:00');

  element('#cfgFacebookInitialSync').value = 'incremental';
  payload = api.facebookFormPayload(source, false).payload;
  assert.equal(payload.syncMode, 'incremental');
  assert.equal(payload.historyStart, '');
});

test('创建和编辑 Facebook 来源不渲染也不发送任何敏感凭据字段', () => {
  const { api, element } = loadHarness();
  const source = facebookSource();
  setForm(element);
  const create = api.facebookFormPayload(source, true);
  const edit = api.facebookFormPayload(source, false);
  for (const result of [create, edit]) {
    assert.ok(result);
    for (const key of ['apiToken', 'token', 'cookie', 'account', 'password', 'credential']) assert.equal(Object.hasOwn(result.payload, key), false);
  }
  const html = api.facebookForm(source, false);
  assert.doesNotMatch(html, /cfgFacebookToken|Page Access Token|type="password"|Cookie|登录账号|密码/i);
  assert.match(html, /系统受控官方凭据（管理员无需填写）/);
  assert.match(html, /data-facebook-capability="pageManagement"/);
  assert.match(html, /data-facebook-capability="moderate"/);
});

test('Facebook 六个 P0-R1 稳定错误码均有脱敏管理员文案', () => {
  const { api } = loadHarness();
  for (const code of [
    'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
    'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
    'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED',
    'FACEBOOK_PAGE_MANAGEMENT_REQUIRED',
    'FACEBOOK_MODERATE_CAPABILITY_REQUIRED',
    'FACEBOOK_CAPABILITY_MISSING'
  ]) {
    const message = api.facebookErrorMessage({ code });
    assert.notEqual(message, '操作未完成，请检查服务状态后重试；采集源保持停用时不会进入调度');
    assert.doesNotMatch(message, /token|cookie|密码/i);
  }
});

test('官方凭据通过后才检测六能力，并从服务端刷新最终状态', async () => {
  const requests = [];
  const refreshed = facebookSource();
  const { api, element } = loadHarness(async (url, options = {}) => {
    const pathname = new URL(url, 'http://127.0.0.1').pathname;
    requests.push({ pathname, method: options.method || 'GET' });
    if (pathname.endsWith('/check-auth')) return response({ authStatus: 'authorized', systemCredentialStatus: 'configured' });
    if (pathname.endsWith('/check-capabilities')) return response({ authorized: true, capabilities: refreshed.capabilities });
    if (pathname.endsWith('/facebook-source')) return response(refreshed);
    throw new Error(`unexpected request: ${pathname}`);
  });
  api.state.sources = [facebookSource({ auth_status: 'unconfigured', account: { auth_status: 'unconfigured' }, capabilities: {} })];
  api.state.scope = { selected: () => ({ regionCode: 'overseas' }), query: () => new URLSearchParams() };
  setForm(element);
  await api.checkFacebookSource(api.state.sources[0]);
  assert.deepEqual(requests.map(item => item.pathname), [
    '/api/public-opinion/sources/facebook-source/check-auth',
    '/api/public-opinion/sources/facebook-source/check-capabilities',
    '/api/public-opinion/sources/facebook-source'
  ]);
  assert.equal(api.facebookReady(api.state.sources[0]), true);
});

test('授权失败时仍检测并分项展示能力稳定码', async () => {
  const requests = [];
  const source = facebookSource({ auth_status: 'unconfigured', account: { auth_status: 'unconfigured' }, capabilities: {} });
  const { api, element } = loadHarness(async url => {
    const pathname = new URL(url, 'http://127.0.0.1').pathname;
    requests.push(pathname);
    if (pathname.endsWith('/check-auth')) return response({ authStatus: 'unauthorized', systemCredentialStatus: 'invalid', reason: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID' });
    if (pathname.endsWith('/check-capabilities')) return response({
      authorized: false,
      systemCredentialStatus: 'invalid',
      errorCode: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
      capabilities: Object.fromEntries(['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies'].map(key => [key, { status: 'unavailable', errorCode: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID' }]))
    });
    if (pathname.endsWith('/facebook-source')) return response({ ...source, systemCredentialStatus: 'invalid' });
    throw new Error(`unexpected request: ${pathname}`);
  });
  api.state.sources = [source];
  api.state.scope = { selected: () => ({ regionCode: 'overseas' }), query: () => new URLSearchParams() };
  setForm(element);
  await api.checkFacebookSource(source);
  assert.equal(requests.some(pathname => pathname.endsWith('/check-capabilities')), true);
  assert.equal(api.facebookReady(api.state.sources[0]), false);
  const html = api.facebookStatusFields(api.state.sources[0], false);
  assert.equal((html.match(/FACEBOOK_SYSTEM_CREDENTIAL_INVALID/g) || []).length, 6);
  assert.doesNotMatch(html, />未配置</);
  assert.match(html, /请联系运维更新服务端 Facebook 官方采集凭据后重新检测/);
});
