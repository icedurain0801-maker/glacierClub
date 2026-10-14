const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { isBigPlayerLoginUrl } = require('../../../login-session-service/src/adapters/bigPlayerH5Playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html?regionCode=domestic', { waitUntil: 'domcontentloaded' });
    const community = page.locator('[data-po-community]');
    await community.locator('option', { hasText: '欢乐战三国' }).waitFor({ state: 'attached' });
    await community.selectOption({ label: '欢乐战三国' });
    await page.waitForFunction(() => window.PublicOpinionScope.selected().communityLabel === '欢乐战三国');
    const platform = page.locator('[data-po-platform-select]');
    await platform.selectOption('bigplayer_h5');
    await page.locator('#addBtn').click();
    await page.locator('#cfgBoardId').fill('4');
    const baseUrl = 'https://club.iyogames.cn/?env=web&gameId=2144&gameVersion=2144-CN-ZS&lang=zh-CN';
    await page.locator('[data-site-url]').first().fill(baseUrl);
    assert.equal(await page.locator('[data-site-url]').first().inputValue(), baseUrl);
    const scope = await page.evaluate(() => window.PublicOpinionScope.selected());
    // No credential: the route must reject before creating a source or authenticating.
    const response = await page.request.post('https://lfy3001.dev.q1op.com/api/public-opinion/sources', { data: {
      communityId: scope.communityId, regionCode: 'domestic', platform: 'bigplayer_h5',
      displayName: 'iyogames domain validation only', baseUrl, boardId: '4', frequencySeconds: 3600
    } });
    const body = await response.json();
    assert.equal(response.status(), 400);
    assert.match(JSON.stringify(body), /apiToken or account password is required/);
    await page.locator('#btnCancel').click();
    const login = await browser.newPage();
    await login.goto('https://club.iyogames.cn/pages/user/login/index?env=web&gameId=2144&gameVersion=2144-CN-ZS&lang=zh-CN', { waitUntil: 'domcontentloaded' });
    await login.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.src.includes('login1.iyogames.cn')));
    let frame;
    for (let attempt = 0; attempt < 100; attempt++) {
      frame = login.frames().find(f => isBigPlayerLoginUrl(f.url()));
      if (frame) break;
      await login.waitForTimeout(100);
    }
    assert(frame);
    await frame.locator('input[type=password]').first().waitFor({ state: 'visible' });
    const result = { at: new Date().toISOString(), browser: 'Edge', headless: false, formDomain: 'club.iyogames.cn', boardId: 4,
      domainValidationStatus: response.status(), domainValidationResponse: body, loginFrameHost: new URL(frame.url()).hostname,
      passwordFieldVisible: true, loginSubmitted: false, sourceCreated: false, actualAuthenticatedCollectionVerified: false };
    fs.writeFileSync(path.join(__dirname, 'iyogames_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
