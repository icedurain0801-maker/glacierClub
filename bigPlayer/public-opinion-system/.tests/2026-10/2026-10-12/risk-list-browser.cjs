const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require('playwright');
const build = require('./risk-list-build.json'), live = process.argv.includes('--live');
const root = 'https://lfy3001.dev.q1op.com';
const output = path.resolve(__dirname, '../../bigPlayer/public-opinion-system/.tests/2026-10/2026-10-12');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await context.newPage();
  const errors = [], requests = []; let mock = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) {
      assert(['GET', 'HEAD'].includes(req.method()), 'Only read-only verification permitted');
      requests.push(url.pathname + url.search);
      if (mock && url.pathname === '/api/public-opinion/contents') {
        const n = Number(url.searchParams.get('page')), pending = url.searchParams.get('handlingStatus') === 'pending';
        const total = pending ? 1 : 25, count = pending ? 1 : n === 1 ? 20 : 5;
        return route.fulfill({ json: { data: Array.from({length: count}, (_, i) => ({id: 'mock-' + n + '-' + i, external_id: String(n * 100 + i), body: '<script>bad()</script>', severity: i % 2 ? 'negative' : 'urgent', display_type: i % 2 ? 'post' : 'comment', handling_status: 'pending', published_at: '2026-10-12T01:00:00Z'})), meta: { total } } });
      }
    }
    if (!live && ['alerts.html', 'assets/alerts.js'].some(p => url.pathname === '/admin/PublicOpinion/' + p)) {
      return route.fulfill({body: fs.readFileSync(path.join(build.candidate, 'public', url.pathname)), contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/html'});
    }
    return route.continue();
  });
  async function loaded() { await page.waitForFunction(() => /^共 \d+ 条$/.test(document.querySelector('#resultHint')?.textContent || ''), null, {timeout: 90000}); }
  async function refresh(action) { await page.evaluate(() => document.querySelector('#resultHint').textContent = '等待'); await action(); await loaded(); }
  try {
    await page.goto(root + '/admin/PublicOpinion/alerts.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5', {waitUntil:'domcontentloaded'});
    await loaded();
    const data = await page.evaluate(async () => {
      const query = riskQuery(); query.set('pageSize','100');
      const response = await fetch('/api/public-opinion/contents?' + query); const contents = await response.json();
      query.delete('riskMode'); query.delete('severity'); query.delete('page'); query.delete('pageSize');
      const stats = await (await fetch('/api/public-opinion/contents/stats?' + query)).json();
      return { total: contents.meta.total, urgent: stats.data.urgent, ids: contents.data.map(x=>x.id), query: query.toString(), levels: [...new Set(contents.data.map(x=>x.severity))] };
    });
    assert.equal(data.total, data.urgent);
    assert.equal(await page.locator('#resultHint').textContent(), '共 ' + data.total + ' 条');
    const rowIds = await page.locator('[data-risk-content]').evaluateAll(es=>es.map(e=>e.dataset.riskContent));
    assert.deepEqual(rowIds, data.ids.slice(0,20));
    if (rowIds.length) {
      const href = await page.locator('[data-risk-content]').first().getAttribute('href');
      assert.equal(new URL(href, root).searchParams.get('contentId'), rowIds[0]);
      const detail = await page.context().newPage();
      await detail.goto(root + '/admin/PublicOpinion/' + href, {waitUntil:'domcontentloaded'});
      await detail.waitForFunction(()=>document.querySelector('#drawerMask')?.classList.contains('open') && !document.querySelector('#drawerContent')?.textContent.includes('正在加载'),null,{timeout:90000});
      assert(!/加载失败/.test(await detail.locator('#drawerContent').textContent())); await detail.close();
    }
    await page.screenshot({path:path.join(output,'risk-list-'+(live?'live':'candidate')+'.png'),fullPage:true});
    await refresh(()=>page.locator('[data-risk-period="all"]').click());
    const historyTotal = Number((await page.locator('#resultHint').textContent()).match(/\d+/)[0]); assert(historyTotal >= data.total);
    const url = page.url(); await page.reload({waitUntil:'domcontentloaded'}); await loaded();
    assert.equal(await page.locator('#riskFrom').inputValue(),''); assert.equal(await page.locator('#riskTo').inputValue(),'');
    await page.locator('[data-module="quality"]').click();
    await page.waitForFunction(()=>/^共 \d/.test(document.querySelector('#qualityResultHint')?.textContent||''),null,{timeout:90000});
    assert(await page.locator('#riskControls').isHidden());
    await page.locator('[data-module="risk"]').click(); await loaded();
    if (!live) {
      mock = true; await refresh(()=>page.locator('#queryBtn').click()); assert.equal(await page.locator('[data-risk-content]').count(),20);
      await refresh(()=>page.locator('#riskNext').click()); assert.equal(await page.locator('[data-risk-content]').count(),5);
      assert.match(await page.locator('#riskPageHint').textContent(),/第 2 \/ 2 页，共 25 条/);
      await page.reload({waitUntil:'domcontentloaded'}); await loaded(); assert.match(await page.locator('#riskPageHint').textContent(),/第 2/);
      await refresh(()=>page.locator('#statusFilter').selectOption('pending')); assert.match(await page.locator('#riskPageHint').textContent(),/第 1 \/ 1 页，共 1 条/);
      assert.equal(await page.locator('#tableContent script').count(),0);
      await page.locator('#riskFrom').fill('2026-10-13'); await page.locator('#riskTo').fill('2026-10-12'); await page.locator('#queryBtn').click(); assert.match(await page.locator('#toast').textContent(),/开始日期/);
    }
    assert.deepEqual(errors,[]); assert(!requests.some(x=>/^\/api\/public-opinion\/alerts[?]/.test(x)));
    const result={passed:true,live,data,historyTotal,historyUrl:url,errors,readOnly:true}; fs.writeFileSync(path.join(output,'risk-list-'+(live?'live':'candidate')+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
