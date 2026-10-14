const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const {
  FacebookGraphConnector,
  SUPPORTED_GRAPH_VERSIONS,
  parseFacebookPageUrl,
  validateGraphUrl
} = require('../src/connectors/facebookGraphConnector');
const {
  SOURCE_PLATFORMS,
  normalizeFacebookPageUrl,
  validateFacebookPageUrl
} = require('../src/services/sourceValidators');

const TOKEN = 'EAAB-test-token-never-expose';
const VERSION = 'v26.0';

function response(url, { ok = true, status = 200, payload = { data: [] } } = {}) {
  return {
    ok,
    status,
    url: String(url),
    headers: { get: () => null },
    json: async () => payload
  };
}

function connector(fetchImpl) {
  return new FacebookGraphConnector({
    FACEBOOK_GRAPH_ENABLED: 'true',
    FACEBOOK_GRAPH_API_VERSION: VERSION,
    FACEBOOK_GRAPH_TIMEOUT_MS: '1000',
    FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN: TOKEN
  }, { fetchImpl });
}

test('Facebook Page URL is normalized and rejects non-official or credential-bearing targets', () => {
  assert.deepEqual(
    parseFacebookPageUrl('https://www.facebook.com/LastLightSurvival/?utm_source=test'),
    {
      pageRef: 'LastLightSurvival',
      normalizedUrl: 'https://www.facebook.com/LastLightSurvival'
    }
  );

  for (const value of [
    'http://www.facebook.com/LastLightSurvival',
    'https://facebook.com.evil.example/LastLightSurvival',
    'https://127.0.0.1/LastLightSurvival',
    'https://user:password@www.facebook.com/LastLightSurvival',
    'https://www.facebook.com:8443/LastLightSurvival',
    'https://www.facebook.com/LastLightSurvival#fragment',
    'https://www.facebook.com/LastLightSurvival?access_token=secret',
    'https://www.facebook.com/groups/LastLightSurvival'
  ]) {
    assert.throws(
      () => parseFacebookPageUrl(value),
      error => error.code === 'FACEBOOK_URL_INVALID',
      value
    );
  }
});

test('source write validation and connector Page parsing share the same URL contract', () => {
  assert.equal(SOURCE_PLATFORMS.has('facebook'), true);
  const accepted = [
    'https://facebook.com/LastLightSurvival',
    'https://www.facebook.com/1234567890/?utm_source=test&fbclid=tracking'
  ];
  for (const value of accepted) {
    const parsed = parseFacebookPageUrl(value);
    assert.equal(validateFacebookPageUrl(value), null);
    assert.equal(normalizeFacebookPageUrl(value), parsed.normalizedUrl);
  }

  const rejected = [
    'https://www.facebook.com/a',
    'https://www.facebook.com/business',
    'https://www.facebook.com/settings',
    'https://www.facebook.com/LastLightSurvival?next=https://127.0.0.1',
    `https://www.facebook.com/LastLightSurvival?access_token=${TOKEN}`
  ];
  for (const value of rejected) {
    assert.ok(validateFacebookPageUrl(value), value);
    assert.throws(() => parseFacebookPageUrl(value), error => error.code === 'FACEBOOK_URL_INVALID', value);
  }
});

test('Graph endpoints accept only an approved HTTPS host and exact configured version', () => {
  assert.ok(SUPPORTED_GRAPH_VERSIONS.includes(VERSION));
  assert.equal(
    validateGraphUrl(`https://graph.facebook.com/${VERSION}/page/posts?after=cursor`, VERSION).hostname,
    'graph.facebook.com'
  );

  for (const value of [
    `http://graph.facebook.com/${VERSION}/page/posts`,
    `https://graph.facebook.com.evil.example/${VERSION}/page/posts`,
    `https://127.0.0.1/${VERSION}/page/posts`,
    `https://graph.facebook.com:8443/${VERSION}/page/posts`,
    `https://user:password@graph.facebook.com/${VERSION}/page/posts`,
    `https://graph.facebook.com/v25.0/page/posts`,
    `https://graph.facebook.com/${VERSION}/page/posts#fragment`,
    `https://graph.facebook.com/${VERSION}/page/posts?access_token=${TOKEN}`,
    `https://graph.facebook.com/${VERSION}/page%2f..%2fmetadata`
  ]) {
    assert.throws(
      () => validateGraphUrl(value, VERSION),
      error => ['FACEBOOK_PAGING_URL_INVALID', 'FACEBOOK_GRAPH_VERSION_UNSUPPORTED'].includes(error.code),
      value
    );
  }
});

test('Graph request sends token only in Authorization and disables redirect following', async () => {
  const calls = [];
  const subject = connector(async (url, options) => {
    calls.push({ url: String(url), options });
    return response(url, { payload: { id: 'page-1' } });
  });

  await subject.requestGraph({
    path: 'LastLightSurvival',
    params: { fields: 'id,name' },
    capability: 'page'
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(new URL(calls[0].url).origin, 'https://graph.facebook.com');
  assert.equal(calls[0].url.includes(TOKEN), false);
  assert.equal(new URL(calls[0].url).searchParams.has('access_token'), false);
  assert.equal(JSON.stringify(subject).includes(TOKEN), false);
});

test('Graph request rejects token query injection before fetch', async () => {
  let fetched = false;
  const subject = connector(async () => { fetched = true; });

  await assert.rejects(
    () => subject.requestGraph({ path: 'page/posts', params: { access_token: TOKEN } }),
    error => error.code === 'FACEBOOK_PAGING_URL_INVALID'
  );
  assert.equal(fetched, false);
});

test('paging.next is revalidated and never follows external, downgraded, or tokenized URLs', async () => {
  let fetched = false;
  const subject = connector(async () => { fetched = true; });
  const hostile = [
    `https://graph.facebook.com.evil.example/${VERSION}/page/posts?after=cursor`,
    `http://graph.facebook.com/${VERSION}/page/posts?after=cursor`,
    `https://graph.facebook.com/${VERSION}/page/posts?after=cursor&access_token=${TOKEN}`,
    `https://graph.facebook.com/v25.0/page/posts?after=cursor`
  ];

  for (const nextUrl of hostile) {
    await assert.rejects(
      () => subject.requestNextPage({ nextUrl, capability: 'posts', page: 2 }),
      error => ['FACEBOOK_PAGING_URL_INVALID', 'FACEBOOK_GRAPH_VERSION_UNSUPPORTED'].includes(error.code)
    );
  }
  assert.equal(fetched, false);
});

test('redirect responses and unexpected final URLs fail closed without a second request', async () => {
  for (const providerResponse of [
    response(`https://graph.facebook.com/${VERSION}/page/posts`, { ok: false, status: 302 }),
    response('https://evil.example/capture', { payload: { data: [] } })
  ]) {
    let count = 0;
    const subject = connector(async () => { count += 1; return providerResponse; });
    await assert.rejects(
      () => subject.requestGraph({ path: 'page/posts', capability: 'posts' }),
      error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'FACEBOOK_PAGING_URL_INVALID'
    );
    assert.equal(count, 1);
  }
});

test('transport and provider errors expose stable codes without token, URL query, or response body', async () => {
  const providerSecret = 'provider-body-must-not-leak';
  const subjects = [
    connector(async () => { throw new Error(`network failed ${TOKEN}`); }),
    connector(async url => response(url, {
      ok: false,
      status: 401,
      payload: { error: { code: 190, message: `${providerSecret} ${TOKEN}` } }
    }))
  ];

  for (const subject of subjects) {
    let error;
    try {
      await subject.requestGraph({ path: 'page/posts', capability: 'posts' });
      assert.fail('request should fail');
    } catch (caught) {
      error = caught;
    }
    const exposed = JSON.stringify({
      code: error.code,
      message: error.message,
      details: error.details,
      causeCode: error.cause?.code,
      causeMessage: error.cause?.message,
      causeDetails: error.cause?.details
    });
    assert.equal(exposed.includes(TOKEN), false);
    assert.equal(exposed.includes(providerSecret), false);
    assert.equal(exposed.includes('access_token='), false);
  }
});

test('deployment credential is the only Facebook credential source and missing configuration never fetches', async () => {
  let fetched = false;
  let credentialLoaded = false;
  const subject = new FacebookGraphConnector({
    FACEBOOK_GRAPH_ENABLED: 'true',
    FACEBOOK_GRAPH_API_VERSION: VERSION
  }, {
    fetchImpl: async () => { fetched = true; },
    credentialContext: {
      load: async () => { credentialLoaded = true; return TOKEN; },
      loadApiToken: async () => { credentialLoaded = true; return TOKEN; }
    }
  });

  await assert.rejects(
    () => subject.requestGraph({ path: 'page/posts', token: 'source-payload-token' }),
    error => error.code === 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED'
  );
  const health = await subject.accountHealth({
    source: { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } },
    account: { id: 'account-1' },
    credentialContext: { load: async () => TOKEN }
  });
  assert.equal(health.authorized, false);
  assert.equal(health.configured, false);
  assert.equal(health.reason, 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED');
  assert.equal(health.systemCredentialStatus, 'not_configured');
  assert.equal(fetched, false);
  assert.equal(credentialLoaded, false);
});

test('credential invalid and expired failures expose separate stable status without provider text', async () => {
  const cases = [
    { subcode: 458, code: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID', status: 'invalid' },
    { subcode: 463, code: 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED', status: 'expired' }
  ];
  for (const fixture of cases) {
    const subject = connector(async url => response(url, {
      ok: false,
      status: 400,
      payload: { error: { code: 190, error_subcode: fixture.subcode, message: `${TOKEN} provider detail` } }
    }));
    const capabilities = await subject.detectCapabilities({
      source: { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } }
    });
    assert.equal(capabilities.systemCredentialStatus, fixture.status);
    assert.equal(capabilities.page.status, 'unauthorized');
    assert.equal(capabilities.page.errorCode, fixture.code);
    assert.equal(JSON.stringify(capabilities).includes(TOKEN), false);
  }
});

test('management, MODERATE and edge capability failures are reported independently and fail closed', async () => {
  const source = { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } };
  const account = { platform_account_id: 'page-1' };
  const page = url => response(url, { payload: { id: 'page-1', name: 'Last Light' } });

  const unmanaged = connector(async url => {
    const pathname = new URL(String(url)).pathname;
    return pathname.endsWith('/LastLightSurvival') ? page(url) : response(url, { payload: { data: [] } });
  });
  let health = await unmanaged.accountHealth({ source, account });
  assert.equal(health.authorized, false);
  assert.equal(health.reason, 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED');
  assert.equal(health.capabilities.pageManagement.errorCode, 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED');

  const withoutModerate = connector(async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/LastLightSurvival')) return page(url);
    return response(url, { payload: { data: [{ id: 'page-1', tasks: ['CREATE_CONTENT'] }] } });
  });
  health = await withoutModerate.accountHealth({ source, account });
  assert.equal(health.authorized, false);
  assert.equal(health.reason, 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED');
  assert.equal(health.capabilities.moderate.errorCode, 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED');

  const missingPosts = connector(async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/LastLightSurvival')) return page(url);
    if (pathname.endsWith('/me/accounts')) return response(url, { payload: { data: [{ id: 'page-1', tasks: ['MODERATE'] }] } });
    return response(url, { ok: false, status: 403, payload: { error: { code: 200, message: `${TOKEN} hidden` } } });
  });
  health = await missingPosts.accountHealth({ source, account });
  assert.equal(health.authorized, false);
  assert.equal(health.reason, 'FACEBOOK_CAPABILITY_MISSING');
  assert.equal(health.capabilities.posts.errorCode, 'FACEBOOK_CAPABILITY_MISSING');
  assert.equal(JSON.stringify(health).includes(TOKEN), false);
});

test('account health authorizes only when all six Facebook capabilities pass', async () => {
  const subject = connector(async () => { throw new Error('fetch should be stubbed by detectCapabilities'); });
  const base = {
    systemCredentialStatus: 'configured',
    page: { status: 'available', pageId: 'page-1' },
    pageManagement: { status: 'available', pageId: 'page-1' },
    moderate: { status: 'available', pageId: 'page-1' },
    posts: { status: 'available' },
    comments: { status: 'available' },
    replies: { status: 'available' }
  };

  subject.detectCapabilities = async () => base;
  assert.equal((await subject.accountHealth({ source: { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } } })).authorized, true);

  const errors = {
    page: 'FACEBOOK_CAPABILITY_MISSING',
    pageManagement: 'FACEBOOK_PAGE_MANAGEMENT_REQUIRED',
    moderate: 'FACEBOOK_MODERATE_CAPABILITY_REQUIRED',
    posts: 'FACEBOOK_CAPABILITY_MISSING',
    comments: 'FACEBOOK_CAPABILITY_MISSING',
    replies: 'FACEBOOK_CAPABILITY_MISSING'
  };
  for (const capability of Object.keys(errors)) {
    subject.detectCapabilities = async () => ({ ...base, [capability]: { status: 'unavailable', errorCode: errors[capability] } });
    const health = await subject.accountHealth({ source: { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } } });
    assert.equal(health.authorized, false, capability);
    assert.equal(health.configured, false, capability);
    assert.equal(health.reason, errors[capability], capability);
  }
});

test('first authorization replaces a pending account identity but rejects a different bound Page', async () => {
  const subject = connector(async url => response(url, {
    payload: { id: 'resolved-page-1', name: 'Last Light Survival' }
  }));
  const source = { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' } };
  const resolved = await subject.resolvePage({
    source,
    account: { id: 'account-1', platform_account_id: 'pending:account-1' }
  });
  assert.equal(resolved.pageId, 'resolved-page-1');

  await assert.rejects(
    () => subject.resolvePage({
      source,
      account: { id: 'account-1', platform_account_id: 'another-real-page' }
    }),
    error => error.code === 'FACEBOOK_PAGE_MISMATCH'
  );
});

test('Facebook configuration rejects credential payloads and gates enablement on all six persisted capabilities', async () => {
  const app = require('../src/app');
  const source = {
    id: 'facebook-source-security-test',
    game_id: '00000000-0000-0000-0000-000000000002',
    community_id: '00000000-0000-0000-0000-000000000102',
    region_code: 'overseas',
    platform: 'facebook',
    display_name: 'Last Light Facebook',
    enabled: 0,
    frequency_seconds: 3600,
    auth_status: 'authorized',
    config: JSON.stringify({ baseUrl: 'https://www.facebook.com/LastLightSurvival' })
  };
  const account = {
    id: 'facebook-account-security-test',
    source_id: source.id,
    game_id: source.game_id,
    community_id: source.community_id,
    platform: 'facebook',
    enabled: 1,
    auth_status: 'authorized',
    platform_account_id: 'page-1'
  };
  let capabilityRows = ['page', 'pageManagement', 'moderate', 'posts', 'comments'];
  const updates = [];
  const restore = [];
  const stub = (object, key, value) => {
    restore.push(() => { object[key] = object[`__facebook_security_original_${key}`]; delete object[`__facebook_security_original_${key}`]; });
    object[`__facebook_security_original_${key}`] = object[key];
    object[key] = value;
  };

  stub(app.repo, 'listSources', async () => [source]);
  stub(app.repo, 'listAccounts', async () => [account]);
  stub(app.repo, 'getDefaultAccount', async () => account);
  stub(app.repo, 'getSyncStatus', async () => []);
  stub(app.repo, 'listSourceCapabilities', async () => capabilityRows.map(capability => ({ capability, status: 'authorized_scope' })));
  stub(app.repo, 'updateSourceConfiguration', async (sourceId, input) => {
    updates.push({ sourceId, input });
    return { source: { ...source, enabled: input.enabled ? 1 : 0 }, account };
  });
  stub(app.communityDirectory, 'requireEnabled', async () => ({ id: source.community_id, status: 'enabled' }));
  stub(app.connectors.facebook, 'accountHealth', async () => ({ authorized: true, configured: true, capabilities: {
    page: { status: 'available', pageId: 'page-1' },
    pageManagement: { status: 'available' },
    moderate: { status: 'available' },
    posts: { status: 'available' },
    comments: { status: 'available' },
    replies: { status: 'available' }
  } }));

  try {
    app.server.listen(0);
    await once(app.server, 'listening');
    const base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion`;
    const patchConfiguration = body => fetch(`${base}/sources/${source.id}/configuration`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const baseline = {
      displayName: source.display_name,
      baseUrl: 'https://www.facebook.com/LastLightSurvival',
      frequencySeconds: 3600,
      syncMode: 'incremental'
    };

    const rejectedCredential = await patchConfiguration({ ...baseline, enabled: false, credential: { credentialType: 'api_token', secret: TOKEN } });
    const rejectedBody = await rejectedCredential.json();
    assert.equal(rejectedCredential.status, 400);
    assert.equal(rejectedBody.error.code, 'INVALID_INPUT');
    assert.equal(JSON.stringify(rejectedBody).includes(TOKEN), false);
    assert.equal(updates.length, 0);

    const blocked = await patchConfiguration({ ...baseline, enabled: true });
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 409);
    assert.equal(blockedBody.error.code, 'FACEBOOK_CAPABILITY_MISSING');
    assert.equal(updates.length, 0, 'blocked enablement must not update the source');

    capabilityRows = ['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies'];
    const enabled = await patchConfiguration({ ...baseline, enabled: true });
    assert.equal(enabled.status, 200);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].input.enabled, true);
    assert.equal(updates[0].input.credential, null);
    assert.equal(updates[0].input.credentialCipher, null);
  } finally {
    if (app.server.listening) await new Promise(resolve => app.server.close(resolve));
    while (restore.length) restore.pop()();
    if (app.repo.pool && typeof app.repo.pool.end === 'function') await app.repo.pool.end();
  }
});
