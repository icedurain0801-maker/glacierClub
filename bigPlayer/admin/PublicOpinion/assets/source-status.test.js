const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Status = require('./source-status');

test('authLabel exposes stable Chinese labels for verification states', () => {
  assert.equal(Status.authLabel('awaiting_manual_verification'), '待人工验证');
  assert.equal(Status.authLabel('pending_verification'), '待验证');
  assert.equal(Status.authLabel('authorized'), '已授权');
});

test('H5 token sources do not require login validation workspace', () => {
  const source = { platform: 'bigplayer_h5' };
  assert.equal(Status.needsLoginValidation(source, 'token'), false);
  assert.equal(Status.needsLoginValidation(source, 'account_password'), true);
});

test('social login sources still require login validation', () => {
  assert.equal(Status.needsLoginValidation({ platform: 'douyin' }, 'token'), true);
  assert.equal(Status.needsLoginValidation({ platform: 'xiaohongshu' }, 'account_password'), true);
});

test('H5 credential summary reads account-level credential flags', () => {
  const meta = Status.h5CredentialMeta({
    account: {
      hasToken: true,
      hasAccountPassword: true,
      maskedAccount: 'pl****er'
    }
  });
  assert.deepEqual(meta, {
    hasCredential: true,
    hasToken: true,
    hasPassword: true,
    account: 'pl****er'
  });
});
test('explicit credential state accepts safe boolean aliases without inspecting masks', () => {
  for (const field of ['hasCredential', 'has_credential', 'credentialConfigured', 'credential_configured']) {
    assert.equal(Status.explicitCredentialState({ account: { [field]: true } }), true, field);
    assert.equal(Status.explicitCredentialState({ [field]: false }), false, field);
  }
  assert.equal(Status.explicitCredentialState({ account: { credentialMask: '•' } }), undefined);
  assert.equal(Status.explicitCredentialState({ account: { credentialMask: '*' } }), undefined);
});

test('H5 credential summary recognizes all safe configured flags without plaintext', () => {
  for (const field of ['credential_configured', 'credentialConfigured', 'hasToken', 'has_token']) {
    const source = { platform: 'bigplayer_h5', account: { [field]: true } };
    assert.equal(Status.h5CredentialMeta(source).hasToken || Boolean(source.account[field]), true, field);
  }
});
test('H5 credential update keeps confirmation-password validation', () => {
  assert.deepEqual(Status.validateH5CredentialUpdate({ account: 'player', password: 'secret', confirmPassword: 'secret' }), {
    credential: { credentialType: 'account_password', account: 'player', password: 'secret', confirmPassword: 'secret' }
  });
  assert.equal(Status.validateH5CredentialUpdate({ account: 'player', password: 'secret', confirmPassword: 'wrong' }).error, '两次输入的密码不一致');
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function loadSourcesHarness(fetch) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      value: '',
      textContent: '',
      innerHTML: '',
      options: [],
      classList: { _values: new Set(), add(...values) { values.forEach(value => this._values.add(value)); }, remove(...values) { values.forEach(value => this._values.delete(value)); }, contains(value) { return this._values.has(value); } },
      addEventListener() {},
      querySelectorAll() { return []; },
      closest() { return null; }
    });
    return elements.get(selector);
  };
  element('#platformFilter').value = '';
  element('#statusFilter').value = '';
  const testApi = {};
  const context = {
    __PUBLIC_OPINION_TEST__: testApi,
    console,
    URL: class TestURL extends URL { constructor(input, base = 'http://127.0.0.1') { super(input, base); } },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch,
    confirm: () => false,
    addEventListener() {},
    history: { replaceState() {} },
    location: { pathname: '/admin/PublicOpinion/sources.html', search: '' },
    document: {
      querySelector: element,
      querySelectorAll: () => [],
      addEventListener() {},
      head: { appendChild() {} }
    },
    SourceStatus: Status,
    SourceSyncProgress: {
      isTerminal: () => false,
      sequenceOf: () => 0,
      createController: () => ({ state: {}, snapshot: () => ({ run: {}, items: [], visibleLimit: 0 }), stop() {}, open() {} })
    },
    PublicOpinionScope: {
      platforms: [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }, { value: 'taptap', label: 'TapTap' }],
      platformsForRegion: () => [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }, { value: 'taptap', label: 'TapTap' }],
      init: () => new Promise(() => {})
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('./sources.js'), 'utf8'), context, { filename: 'sources.js' });
  return { api: testApi, elements };
}

test('基础配置保存不再携带启用开关或历史回溯字段', () => {
  const sourceText = fs.readFileSync(require.resolve('./sources.js'), 'utf8');
  assert.match(sourceText, /const patch = \{ displayName: \$\('#cfgName'\)\.value\.trim\(\) \}; if \(!taptap\) patch\.frequencySeconds/);
  assert.doesNotMatch(sourceText, /const selectedMode = \$\('#cfgSyncMode'\)/);
  assert.doesNotMatch(sourceText, /const patch = \{ displayName:.*enabled: \$\('#cfgEnabled'\)\.checked/);
});

test('TapTap 仅展示网页地址并按社区填充默认 URL', () => {
  const { api } = loadSourcesHarness(async () => { throw new Error('unused'); });
  const superWorld = { platform: 'taptap', community_name: '超能世界', display_name: 'TapTap001', config: {} };
  const other = { platform: 'taptap', community_name: '其他社区', display_name: 'TapTap002', config: {} };
  const panel = api.platformPanel(superWorld);
  assert.equal(api.taptapDefaultUrl(superWorld), 'https://www.taptap.cn/app/239580/topic?os=android');
  assert.equal(api.taptapDefaultUrl(other), '');
  assert.match(panel, /id="cfgBaseUrl"/);
  assert.doesNotMatch(panel, /cfgAccountId|cfgFreq|cfgScheduleTime/);
  assert.doesNotMatch(api.commonFields(superWorld, false), /cfgAccountId|cfgFreq|cfgScheduleTime/);
});

test('列表启用开关仅提交来源 enabled 字段', async () => {
  const requests = [];
  const { api } = loadSourcesHarness(async (url, options = {}) => {
    requests.push({ url, method: options.method, body: options.body });
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { id: 'toggle-source', enabled: false } }) };
  });
  const source = { id: 'toggle-source', platform: 'bigplayer_h5', enabled: true, display_name: '切换源', config: {}, account: {} };
  api.state.sources = [source];
  api.state.sourcesLoading = false;
  api.state.scope = { query: () => new URLSearchParams() };

  await api.toggleSource(source, { checked: false, disabled: false });

  assert.deepEqual(requests, [{ url: '/api/public-opinion/sources/toggle-source', method: 'PATCH', body: JSON.stringify({ enabled: false }) }]);
  assert.equal(api.state.sources[0].enabled, false);
});
test('sources response parser accepts arrays and wrapped item collections', () => {
  const { api } = loadSourcesHarness(async () => { throw new Error('unused'); });
  assert.deepEqual(Array.from(api.sourceItems([{ id: 'array' }]), item => item.id), ['array']);
  assert.deepEqual(Array.from(api.sourceItems({ data: [{ id: 'data' }] }), item => item.id), ['data']);
  assert.deepEqual(Array.from(api.sourceItems({ items: [{ id: 'items' }] }), item => item.id), ['items']);
  assert.deepEqual(Array.from(api.sourceItems({ data: { items: [{ id: 'nested' }] } }), item => item.id), ['nested']);
});

test('Last Night detection refresh stays locked while TapTap coexists', async () => {
  const requests = [];
  const { api } = loadSourcesHarness(async (url, options = {}) => {
    const parsed = new URL(url, 'http://127.0.0.1');
    requests.push({ pathname: parsed.pathname, params: Object.fromEntries(parsed.searchParams), method: options.method || 'GET' });
    if (parsed.pathname.endsWith('/last-night-source/check-auth')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: { authStatus: 'authorized' } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [
      { id: 'taptap-source', game_id: 'last-night-game', community_id: 'last-night-community', region_code: 'overseas', platform: 'taptap', display_name: 'TapTap untouched' },
      { id: 'last-night-source', game_id: 'last-night-game', community_id: 'last-night-community', region_code: 'overseas', platform: 'bigplayer_h5', display_name: 'Last Night refreshed' }
    ] }) };
  });
  const lastNight = { id: 'last-night-source', game_id: 'last-night-game', community_id: 'last-night-community', region_code: 'overseas', platform: 'bigplayer_h5', display_name: 'Last Night old' };
  const taptap = { id: 'taptap-source', game_id: 'last-night-game', community_id: 'last-night-community', region_code: 'overseas', platform: 'taptap', display_name: 'TapTap original' };
  api.state.sources = [lastNight, taptap];
  api.state.sourcesLoading = false;
  api.state.gamesLoading = false;
  api.state.activeSourceId = lastNight.id;
  api.state.scope = { query: () => new URLSearchParams({ regionCode: 'overseas', gameId: 'last-night-game', communityId: 'last-night-community', platform: 'bigplayer_h5' }) };

  await api.runSourceAction(lastNight, 'check-auth', '授权检测完成', {}, { keepOpen: true });

  assert.deepEqual(requests[1].params, {
    sourceId: 'last-night-source',
    regionCode: 'overseas',
    communityId: 'last-night-community',
    platform: 'bigplayer_h5'
  });
  assert.equal(api.state.sources[0].display_name, 'Last Night refreshed');
  assert.equal(api.state.sources[1].display_name, 'TapTap original');
  assert.equal(api.state.activeSourceId, 'last-night-source');
});

test('exact refresh keeps URL sourceId when active source state is temporarily absent', () => {
  const { api } = loadSourcesHarness(async () => { throw new Error('unused'); });
  api.state.scope = { query: () => new URLSearchParams({ regionCode: 'overseas', gameId: 'last-night-game', communityId: 'last-night-community', platform: 'bigplayer_h5' }) };
  api.state.activeSourceId = '';
  const params = api.exactSourceParams({ game_id: 'last-night-game', community_id: 'last-night-community', region_code: 'overseas', platform: 'bigplayer_h5' });
  assert.equal(params.get('sourceId'), null);
  api.state.activeSourceId = 'last-night-source';
  assert.equal(api.exactSourceParams(null).get('sourceId'), 'last-night-source');
});

test('stale sources response cannot replace the latest scope result', async () => {
  const first = deferred();
  const second = deferred();
  let call = 0;
  const { api } = loadSourcesHarness(async () => {
    const pending = call++ === 0 ? first : second;
    const body = await pending.promise;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  });
  let platform = 'bigplayer_h5';
  api.state.scope = { query: () => new URLSearchParams({ regionCode: 'overseas', gameId: 'last-night', communityId: 'en', platform }) };

  const olderLoad = api.loadSources();
  platform = 'taptap';
  const latestLoad = api.loadSources();
  second.resolve({ data: [{ id: 'tap', platform: 'taptap' }] });
  await latestLoad;
  first.resolve({ data: [{ id: 'overseas', platform: 'bigplayer_h5' }] });
  await olderLoad;

  assert.deepEqual(Array.from(api.state.sources, source => source.id), ['tap']);
  assert.equal(api.state.sourcesLoading, false);
});

test('管理首击立即打开加载态，详情慢响应回填且失败显示重试入口', async () => {
  const detail = deferred();
  let calls = 0;
  const { api, elements } = loadSourcesHarness(async () => {
    calls += 1;
    if (calls === 1) {
      const body = await detail.promise;
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: body }) };
    }
    throw new Error('detail unavailable');
  });
  const source = { id: 'slow-source', platform: 'bigplayer_h5', display_name: '慢详情源', enabled: true, config: { baseUrl: 'https://club.q1.com' }, account: {} };
  const failedSource = { id: 'failed-source', platform: 'bigplayer_h5', display_name: '失败详情源', enabled: true, config: { baseUrl: 'https://club.q1.com' }, account: {} };
  api.state.sources = [source, failedSource];

  const opening = api.openDrawer(source.id);
  assert.equal(elements.get('#drawerMask').classList.contains('open'), true);
  assert.match(elements.get('#drawerContent').innerHTML, /正在加载采集源详情/);
  const duplicate = api.openDrawer(source.id);
  assert.equal(await duplicate, undefined);
  detail.resolve(source);
  await opening;
  assert.match(elements.get('#drawerContent').innerHTML, /慢详情源/);

  await api.openDrawer(failedSource.id);
  assert.equal(calls, 2);
  assert.match(elements.get('#drawerContent').innerHTML, /详情加载失败：/);
  assert.match(elements.get('#drawerContent').innerHTML, /btnRetryDrawer/);
  elements.get('#btnRetryDrawer').onclick();
  assert.equal(calls, 3);
  assert.match(elements.get('#drawerContent').innerHTML, /正在加载采集源详情/);
});
