'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../../../../.temp/capability-timeout-fix-20261010');
const root = path.join(output, 'frontend-release/public');
const community = '8b1f0000000000000000000000000022';
const initial = { id: 'qa-source', platform: 'bigplayer_h5', community_id: community, region_code: 'domestic', community_name: '我要当老祖', display_name: '自测来源', frequency_seconds: 21600, enabled: true, auth_status: 'authorized', config: { boardId: '22', siteUrls: ['https://example.invalid/'], baseUrl: 'https://example.invalid/' }, account: { id: 'qa-account', hasAccountPassword: true, hasToken: false, credential_configured: true, auth_status: 'authorized' }, capabilities: { posts: 'unauthorized', comments: 'unauthorized' } };
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const cases = [];
  try {
    for (const mode of ['success', 'json504', 'html502', 'late504']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [], requests = []; let saved = structuredClone(initial), postSeen = false, refreshReads = 0, release;
      const delayed = new Promise(resolve => { release = resolve; });
      let seenRefresh; const refreshSeen = new Promise(resolve => { seenRefresh = resolve; });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        if (url.pathname.startsWith('/api/')) {
          requests.push({ path: url.pathname, method }); let data;
          if (url.pathname.endsWith('/communities')) data = [{ id: community, name: '我要当老祖', status: 'enabled', region_code: 'domestic' }];
          else if (url.pathname.endsWith('/login-status')) data = { status: 'active' };
          else if (method === 'POST' && url.pathname.endsWith('/check-capabilities')) {
            postSeen = true; saved = { ...saved, capabilities: { posts: 'authorized_scope', comments: 'authorized_scope' } };
            if (mode === 'html502') return route.fulfill({ status: 502, body: '<html>Upstream unavailable</html>', contentType: 'text/html' });
            if (mode !== 'success') return route.fulfill({ status: 504, json: { error: { code: 'UPSTREAM_TIMEOUT', message: 'timeout' } } });
            data = { authorized: true, capabilities: saved.capabilities };
          } else if (url.pathname.endsWith('/sources/qa-source')) {
            if (postSeen) { refreshReads++; seenRefresh(); if (mode === 'late504') await delayed; }
            data = saved;
          } else data = [saved];
          return route.fulfill({ json: { data, meta: {} } });
        }
        const file = path.resolve(root, '.' + url.pathname); assert(file.startsWith(root + path.sep));
        const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
        return route.fulfill({ body: fs.existsSync(file) ? fs.readFileSync(file) : '', contentType: types[path.extname(file)] || 'text/plain' });
      });
      await page.goto(`https://fixture.invalid/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${community}&platform=bigplayer_h5`);
      await page.locator('[data-manage-source="qa-source"]').click();
      await page.locator('#btnCheckCapabilities').waitFor();
      await page.locator('#btnCheckCapabilities').click();
      if (mode === 'late504') {
        await refreshSeen;
        await page.locator('#btnCancel').click(); await page.locator('#addBtn').click();
        await page.locator('#cfgName').fill('迟到响应不得覆盖'); release();
        await page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/sources/qa-source'));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('#cfgName').inputValue(), '迟到响应不得覆盖');
        assert.equal(await page.locator('#btnCreate').count(), 1);
        assert.equal(await page.locator('#btnCheckCapabilities').count(), 0);
      } else {
        const expected = mode === 'success' ? '能力检测完成' : '最近保存的状态';
        await page.locator('#toast').filter({ hasText: expected }).waitFor();
        await page.waitForFunction(() => { const b = document.querySelector('#btnCheckCapabilities'); return b && !b.disabled; });
        const drawer = await page.locator('#drawerContent').textContent();
        assert(!drawer.includes('未授权')); assert(drawer.includes('授权范围'));
        assert.equal(await page.locator('#drawerMask').evaluate(e => e.classList.contains('open')), true);
        if (mode !== 'success') {
          const toast = await page.locator('#toast').textContent();
          assert(toast.includes('本次检测可能仍在后台执行')); assert(!toast.includes('能力检测完成')); assert(!toast.includes('无法解析'));
          assert.equal(refreshReads, 1);
        }
      }
      assert.equal(requests.filter(r => r.method === 'POST').length, 1); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, `browser-${mode}.png`) });
      cases.push({ mode, result: 'PASS', posts: 1, refreshReads, pageErrors: errors }); await page.close();
    }
  } finally { await browser.close(); }
  const report = { result: 'PASS', cases, realNetworkRequests: 0 };
  fs.writeFileSync(path.join(output, 'browser-selftest.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
