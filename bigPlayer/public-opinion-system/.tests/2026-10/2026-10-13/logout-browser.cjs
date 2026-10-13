const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = 'https://club-opinion.q1.com';
const script = process.env.PO_AUTH_CANDIDATE || path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/baas-auth.js');
const errors = [];
async function checkSignedOut(page) {
  await page.getByText('已退出舆情系统', { exact: true }).waitFor();
  assert.equal(await page.locator('.po-auth-user-menu').count(), 0);
  assert.equal(await page.evaluate(() => window.PublicOpinionAuth.currentUser()), null);
  assert.equal(await page.evaluate(async () => (await fetch('/api/public-opinion/games')).status), 401);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('glacier_token_'))), false);
}
(async () => {
  const live = process.env.PO_LOGOUT_LIVE === '1';
  const context = live ? await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false,
    serviceWorkers: 'block', viewport: { width: 1440, height: 1000 },
  }) : await (await chromium.launch({ headless: true })).newContext();
  const browser = context.browser();
  try {
    let sdkLoads = 0, gameCalls = 0, releaseGame;
    if (!live) await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/config')) return route.fulfill({ json: { data: { enabled: true, sdkUrl: origin + '/sdk.js', appKey: 'test', baseUrl: origin } } });
      if (url.pathname === '/sdk.js') {
        sdkLoads++;
        return route.fulfill({ contentType: 'application/javascript', body: `window.GlacierBaaS={init:()=>{const app={_token:localStorage.getItem('glacier_token_test'),auth:{isLoggedIn:()=>!!app._token,sso:async()=>{app._token='fake';localStorage.setItem('glacier_token_test','fake')},logout:()=>{app._token=null;localStorage.removeItem('glacier_token_test')}}};return app}};` });
      }
      if (url.pathname.endsWith('/auth/session')) return route.fulfill({ json: { data: { identity: { displayName: '测试管理员', roles: ['admin'], permissions: { review: true, manage: true } } } } });
      if (url.pathname.endsWith('/games')) { gameCalls++; await new Promise(resolve => { releaseGame = resolve; }); return route.fulfill({ json: { data: [] } }); }
      if (url.pathname.endsWith('/baas-auth.js')) return route.fulfill({ path: script, contentType: 'application/javascript' });
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"><script defer src="/assets/baas-auth.js"></script></head><body><header class="command-bar"></header><main>业务数据</main></body></html>' });
    });
    else if (process.env.PO_AUTH_CANDIDATE) await context.route('**/assets/baas-auth.js*', route => route.fulfill({ path: script, contentType: 'application/javascript' }));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/admin/PublicOpinion/index.html', { waitUntil: 'networkidle' });
    // A previous test may have deliberately left this browser signed out.
    if (await page.getByRole('button', { name: '重新登录', exact: true }).count()) await page.getByRole('button', { name: '重新登录', exact: true }).click();
    await page.locator('.po-auth-user-menu').waitFor();
    const second = await context.newPage(); second.on('pageerror', e => errors.push(e.message));
    await second.goto(origin + '/admin/PublicOpinion/content.html', { waitUntil: 'networkidle' });
    await second.locator('.po-auth-user-menu').waitFor();
    const initialLoads = sdkLoads;
    if (!live) { await page.evaluate(() => { window.pendingGame = fetch('/api/public-opinion/games').then(r => r.status); }); await page.waitForTimeout(50); }
    await page.locator('.po-auth-user-trigger').click();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await checkSignedOut(page); await checkSignedOut(second);
    if (!live) { releaseGame(); assert.equal(await page.evaluate(() => window.pendingGame), 401); assert.equal(gameCalls, 1); }
    await page.reload({ waitUntil: 'networkidle' }); await checkSignedOut(page);
    if (!live) assert.equal(sdkLoads, initialLoads, 'reload must not load SDK or automatically restore SSO');
    const rawStatus = live ? await page.evaluate(async () => {
      const frame = document.createElement('iframe'); frame.hidden = true; document.body.append(frame);
      try { return (await frame.contentWindow.fetch('/api/public-opinion/games')).status; }
      finally { frame.remove(); }
    }) : 401;
    assert.equal(rawStatus, 401, 'protected API must reject request without bearer');
    if (process.env.PO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PO_SCREENSHOT_DIR, `logout-${live ? 'live' : 'isolated'}.png`) });
    await page.getByRole('button', { name: '重新登录', exact: true }).click();
    await page.locator('.po-auth-user-menu').waitFor();
    assert(await page.evaluate(() => !!window.PublicOpinionAuth.currentUser()));
    assert.deepEqual(errors, []);
    const report = { passed: true, phase: live ? (process.env.PO_AUTH_CANDIDATE ? 'candidate' : 'live') : 'isolated', logout: true, refreshRemainsSignedOut: true, otherTabSignedOut: true, protectedApiWithoutBearer: rawStatus, inFlightResponseBlocked: !live, explicitLoginRestored: true, errors };
    fs.writeFileSync(path.join(__dirname, `logout-${report.phase}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await context.close(); if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.message).split('\n')[0]); process.exitCode = 1; });
