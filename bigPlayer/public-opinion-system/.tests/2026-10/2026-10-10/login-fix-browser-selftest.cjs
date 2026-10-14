'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../../../../.temp/login-authorization-fix-20261010');
const root = path.join(output, 'frontend-release/public');
const community = '8b1f0000000000000000000000000022';
const source = { id: 'qa-source', platform: 'bigplayer_h5', community_id: community, region_code: 'domestic', community_name: '我要当老祖', display_name: '自测来源', frequency_seconds: 21600, enabled: true, auth_status: 'unauthorized', config: { boardId: '22', siteUrls: ['https://example.invalid/'], baseUrl: 'https://example.invalid/' }, account: { id: 'qa-account', hasAccountPassword: true, credential_configured: true, auth_status: 'unauthorized' }, capabilities: { posts: 'unauthorized' } };
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        requests.push({ path: url.pathname, method: route.request().method() });
        let data;
        if (url.pathname.endsWith('/communities')) data = [{ id: community, name: '我要当老祖', status: 'enabled', region_code: 'domestic' }];
        else if (url.pathname.endsWith('/login-status')) data = { status: 'invalid_credentials', failureCode: 'INVALID_CREDENTIALS', updatedAt: '2026-10-10T09:00:00.000Z' };
        else if (url.pathname.endsWith('/check-auth')) data = { authStatus: 'unauthorized', reason: 'INVALID_CREDENTIALS' };
        else if (url.pathname.endsWith('/sources/qa-source')) data = source;
        else data = [source];
        return route.fulfill({ json: { data, meta: {} } });
      }
      const file = path.resolve(root, '.' + url.pathname);
      assert(file.startsWith(root + path.sep));
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
      return route.fulfill({ body: fs.existsSync(file) ? fs.readFileSync(file) : '', contentType: types[path.extname(file)] || 'text/plain' });
    });
    await page.goto(`https://fixture.invalid/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${community}&platform=bigplayer_h5`);
    await page.locator('[data-manage-source="qa-source"]').click();
    await page.locator('#btnCheckAuth').waitFor();
    assert((await page.locator('#drawerContent').textContent()).includes('账号或密码不正确'));
    assert(requests.some(request => request.path.endsWith('/login-status')));
    await page.locator('#btnCheckAuth').click();
    await page.locator('#toast').filter({ hasText: '账号或密码不正确' }).waitFor();
    assert.equal(requests.filter(request => request.method === 'POST').length, 1);
    assert.equal(requests.filter(request => request.path.endsWith('/login-status')).length, 2);
    await page.locator('#btnCancel').click();
    await page.locator('#addBtn').click();
    await page.locator('#cfgName').fill('新增草稿');
    await page.locator('#h5AuthPassword').click();
    assert.equal(await page.locator('#btnCreate').count(), 1);
    assert.equal(await page.locator('#cfgName').inputValue(), '新增草稿');
    assert.equal(await page.locator('#btnCheckAuth,#btnCheckLogin').count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'browser-selftest.png') });
    const report = { result: 'PASS', checks: ['saved source loads actual login status', 'specific Chinese login error is visible', 'failed auth refreshes login status', 'create draft remains protected'], requests, pageErrors: errors, realNetworkRequests: 0 };
    fs.writeFileSync(path.join(output, 'browser-selftest.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
