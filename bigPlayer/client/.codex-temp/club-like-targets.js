const path = require('path');
const { chromium, devices } = require('playwright');

function isActiveClass(cls) {
  return /active|liked|selected|checked/.test((cls || '').toLowerCase());
}

async function clickVisibleLikeIcons(page, label, maxClicks = 3) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  const icons = page.locator('[class*="comment-thumbs-up"], [class*="football"]');
  const total = await icons.count();
  let clicked = 0;
  const details = [];
  for (let i = 0; i < total; i += 1) {
    if (clicked >= maxClicks) break;
    const el = icons.nth(i);
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    const cls = await el.getAttribute('class').catch(() => '') || '';
    if (isActiveClass(cls)) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.y < 40 || box.y > viewport.height - 20) continue;
    const beforeText = await el.innerText().catch(() => '');
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    const afterCls = await el.getAttribute('class').catch(() => '') || '';
    const afterText = await el.innerText().catch(() => '');
    details.push({
      index: i,
      beforeText: (beforeText || '').replace(/\s+/g, ' ').trim(),
      afterText: (afterText || '').replace(/\s+/g, ' ').trim(),
      beforeClass: cls,
      afterClass: afterCls,
      y: Math.round(box.y),
    });
    clicked += 1;
  }
  return { label, clicked, scanned: total, details };
}

async function clickDetailLike(page) {
  const detail = { tried: false, clicked: false, method: '' };
  const url = page.url();
  if (!/\/pages\/post\/detail\/index/.test(url)) return detail;
  detail.tried = true;

  // Prefer the explicit detail like icon if available.
  const candidates = page.locator('[class*="comment-thumbs-up"], [class*="thumbs-up"], [class*="thumb"]');
  const total = await candidates.count();
  for (let i = 0; i < total; i += 1) {
    const el = candidates.nth(i);
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    const cls = await el.getAttribute('class').catch(() => '') || '';
    if (isActiveClass(cls)) continue;
    if (/fill/.test(cls.toLowerCase())) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.y < 120 || box.y > 760) continue;
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
    detail.clicked = true;
    detail.method = `selector:${cls.slice(0, 80)}`;
    return detail;
  }

  // Fallback: click the center like button area shown in provided screenshot.
  const vp = page.viewportSize() || { width: 390, height: 844 };
  await page.mouse.click(vp.width / 2, 525);
  await page.waitForTimeout(1000);
  detail.clicked = true;
  detail.method = 'coordinate-fallback';
  return detail;
}

(async () => {
  const outDir = __dirname;
  const statePath = path.join(outDir, 'club-storage-state.json');
  const shotPath = path.join(outDir, 'club-like-result.png');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'zh-CN',
    storageState: statePath,
  });
  const page = await context.newPage();
  const api = [];
  const navs = [];

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navs.push(frame.url());
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('/api/club')) return;
    const hit = /thumb|like|praise/i.test(url);
    if (!hit) return;
    const body = (await resp.text().catch(() => '')).slice(0, 1200);
    api.push({ status: resp.status(), url, body });
  });

  const result = {
    homeTop: null,
    homeRecommend: null,
    detailLike: null,
    infoFlowTop: null,
    infoFlowMore: null,
  };

  await page.goto('http://club.test.q1.com/?env=web&lang=zh-CN', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(9000);

  result.homeTop = await clickVisibleLikeIcons(page, 'home-top', 2);

  await page.mouse.wheel(0, 620);
  await page.waitForTimeout(1600);
  result.homeRecommend = await clickVisibleLikeIcons(page, 'home-recommend', 2);

  // Open a visible post card and click detail like area.
  const cards = page.locator('.post-card');
  if ((await cards.count()) > 0) {
    await cards.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(5000);
    result.detailLike = await clickDetailLike(page);
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
  } else {
    result.detailLike = { tried: false, clicked: false, method: 'no-post-card' };
  }

  // Bottom nav: 资讯
  const vp = page.viewportSize() || { width: 390, height: 844 };
  await page.mouse.click(vp.width * 0.28, vp.height - 24);
  await page.waitForTimeout(7000);

  result.infoFlowTop = await clickVisibleLikeIcons(page, 'info-top', 2);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1300);
  result.infoFlowMore = await clickVisibleLikeIcons(page, 'info-more', 2);

  await page.screenshot({ path: shotPath, fullPage: true });
  const finalInfo = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1800),
  }));

  console.log(JSON.stringify({
    result,
    finalInfo,
    navs: navs.slice(-20),
    likeApis: api.slice(-30),
    screenshot: shotPath,
  }, null, 2));

  await browser.close();
})();
