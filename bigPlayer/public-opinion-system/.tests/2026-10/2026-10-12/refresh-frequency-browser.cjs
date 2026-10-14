const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '../../../../..');
const plan = JSON.parse(fs.readFileSync(path.join(repo, '.temp/refresh-frequency/plan.json')));
const live = process.argv.includes('--live');
const origin = 'https://lfy3001.dev.q1op.com';
const evidence = [], errors = [];
(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    if (!live) {
      await page.route('**/admin/PublicOpinion/index.html?**', route => route.fulfill({ path: path.join(plan.candidate, 'public/admin/PublicOpinion/index.html'), contentType: 'text/html' }));
      await page.route('**/admin/PublicOpinion/assets/app.js?**', route => route.fulfill({ path: path.join(plan.candidate, 'public/admin/PublicOpinion/assets/app.js'), contentType: 'application/javascript' }));
    }
    await page.goto(origin + '/admin/PublicOpinion/index.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#refreshFrequency')?.textContent === '数据每6小时刷新');
    async function check(name) {
      await page.waitForLoadState('networkidle');
      const query = await page.evaluate(() => state.scope.query().toString());
      const apiResponse = await page.request.get(origin + '/api/public-opinion/sources?' + query);
      assert.equal(apiResponse.status(), 200);
      const apiBody = await apiResponse.json();
      const expectedSources = Array.isArray(apiBody.data) ? apiBody.data : apiBody.data.items;
      console.log(JSON.stringify({ checking: name, expectedIds: expectedSources.map(s => s.id), current: await page.evaluate(() => ({ query: state.scope.query().toString(), ids: state.sources.map(s => s.id), text: document.querySelector('#refreshFrequency').textContent })), errors }));
      await page.waitForFunction(expected => JSON.stringify(state.sources.map(s => s.id)) === JSON.stringify(expected) && !!state.overview?.metrics && !document.querySelector('#refreshFrequency').textContent.includes('加载'), expectedSources.map(s => s.id));
      const result = await page.evaluate(() => ({ text: document.querySelector('#refreshFrequency').textContent, query: state.scope.query().toString(), sources: state.sources.map(s => ({ id: s.id, enabled: s.enabled, frequency_seconds: s.frequency_seconds })), metricsLoaded: !!state.overview?.metrics }));
      const response = await page.request.get(origin + '/api/public-opinion/sources?' + result.query);
      assert.equal(response.status(), 200);
      const body = await response.json(), sources = Array.isArray(body.data) ? body.data : body.data.items;
      assert.deepEqual(result.sources, sources.map(s => ({ id: s.id, enabled: s.enabled, frequency_seconds: s.frequency_seconds })));
      assert.equal(result.text, await page.evaluate(s => refreshFrequencyText(s), sources));
      assert.ok(result.metricsLoaded);
      evidence.push({ name, ...result, apiStatus: response.status() });
    }
    await check('overseas-configured-6h');
    await page.locator('#refreshFrequency').screenshot({ path: path.join(__dirname, `refresh-frequency-${live ? 'live' : 'candidate'}.png`) });
    await page.reload({ waitUntil: 'networkidle' });
    await check('reload');
    await page.locator('[data-po-region]').selectOption('domestic');
    await page.waitForFunction(() => state.scope.selected().regionCode === 'domestic' && state.scope.available() && !!state.overview?.metrics && !document.querySelector('#refreshFrequency').textContent.includes('加载'));
    await check('switch-domestic');
    await page.locator('[data-po-platform-select]').selectOption('taptap');
    await page.waitForFunction(() => state.scope.selected().platform === 'taptap' && !!state.overview?.metrics && !document.querySelector('#refreshFrequency').textContent.includes('加载'));
    await check('switch-platform');
    const cases = [
      [[{ enabled: 1, frequency_seconds: 3600 }], '数据每1小时刷新'],
      [[{ enabled: true, frequencySeconds: 21600 }], '数据每6小时刷新'],
      [[{ enabled: 1, frequency_seconds: 86400 }], '数据每24小时刷新'],
      [[{ enabled: 1, frequency_seconds: 3600 }, { enabled: 1, frequency_seconds: 21600 }], '数据按账号配置刷新（每1小时、每6小时）'],
      [[{ enabled: 0, frequency_seconds: 3600 }, { enabled: 1, frequency_seconds: 21600 }], '数据每6小时刷新'],
      [[], '暂无抓取账号配置'],
      [[{ enabled: 0, frequency_seconds: 21600 }], '抓取账号已停用'],
      [[{ enabled: 1 }], '采集频率待确认']
    ];
    for (const [sources, expected] of cases) assert.equal(await page.evaluate(s => refreshFrequencyText(s), sources), expected);
    if (!live) {
      await page.route('**/api/public-opinion/sources?**', route => route.fulfill({ status: 503, json: { error: { message: '隔离测试：来源接口不可用' } } }));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('#refreshFrequency').textContent === '采集频率加载失败');
      evidence.push({ name: 'isolated-source-failure', text: await page.locator('#refreshFrequency').innerText() });
    }
    assert.deepEqual(errors, []);
    const result = { mode: live ? 'live website, real APIs, headed Chromium' : 'candidate static files, real read-only APIs; isolated failure response at end', evidence, formatCasesPassed: cases.length, errors };
    fs.writeFileSync(path.join(__dirname, `refresh-frequency-${live ? 'live' : 'candidate'}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
