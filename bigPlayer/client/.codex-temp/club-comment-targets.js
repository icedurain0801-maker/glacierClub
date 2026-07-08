const path = require('path');
const { chromium, devices } = require('playwright');

function nowText() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function collectVisibleCommentIcons(page) {
  const vp = page.viewportSize() || { width: 390, height: 844 };
  const icons = page.locator('[class*="comment-tip"]');
  const total = await icons.count();
  const rows = [];
  for (let i = 0; i < total; i += 1) {
    const el = icons.nth(i);
    const visible = await el.isVisible().catch(() => false);
    if (!visible) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.y < 200 || box.y > vp.height - 10) continue;
    const text = ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const cls = (await el.getAttribute('class').catch(() => '')) || '';
    rows.push({
      index: i,
      y: Math.round(box.y),
      x: Math.round(box.x),
      text,
      cls,
    });
  }
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  return rows;
}

async function commentOnDetail(page, content) {
  const result = {
    url: page.url(),
    beforeCount: '',
    afterCount: '',
    published: false,
    usedContent: content,
  };

  const countEl = page.locator('.post-detail-footer .comment-tip').first();
  result.beforeCount = ((await countEl.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

  await page.locator('.input-tip').first().click({ force: true });
  await page.waitForTimeout(1200);

  const editor = page.locator('.comment-input .ql-editor').first();
  await editor.click({ force: true });
  await editor.fill(content);
  await page.waitForTimeout(600);

  const publishBtn = page.locator('.comment-input').getByText('发布', { exact: true }).first();
  await publishBtn.click({ force: true });
  await page.waitForTimeout(3000);

  result.afterCount = ((await countEl.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  result.published = true;
  return result;
}

(async () => {
  const outDir = __dirname;
  const statePath = path.join(outDir, 'club-storage-state.json');
  const shotPath = path.join(outDir, 'club-comment-result.png');

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
    if (!/auth\/comment/i.test(url)) return;
    const body = (await resp.text().catch(() => '')).slice(0, 1200);
    api.push({ status: resp.status(), url, body });
  });

  const summary = {
    round1: null,
    round2: null,
  };

  await page.goto('http://club.test.q1.com/?env=web&lang=zh-CN', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  // Round 1: top visible comment icon.
  let visible = await collectVisibleCommentIcons(page);
  if (visible.length > 0) {
    const picked = visible[0];
    await page.locator('[class*="comment-tip"]').nth(picked.index).click({ force: true });
    await page.waitForTimeout(5000);
    const content = `自动化测试评论，请忽略 ${nowText()}`;
    const detail = await commentOnDetail(page, content);
    summary.round1 = { picked, detail };
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4500);
  } else {
    summary.round1 = { error: 'no visible comment icon in round1' };
  }

  // Round 2: scroll down and use next area icon.
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(1300);
  visible = await collectVisibleCommentIcons(page);
  if (visible.length > 0) {
    const picked = visible[0];
    await page.locator('[class*="comment-tip"]').nth(picked.index).click({ force: true });
    await page.waitForTimeout(5000);
    const content = `自动化测试评论2，请忽略 ${nowText()}`;
    const detail = await commentOnDetail(page, content);
    summary.round2 = { picked, detail };
  } else {
    summary.round2 = { error: 'no visible comment icon in round2' };
  }

  await page.screenshot({ path: shotPath, fullPage: true });
  const finalInfo = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1800),
  }));

  console.log(JSON.stringify({
    summary,
    finalInfo,
    navs: navs.slice(-30),
    commentApis: api.slice(-40),
    screenshot: shotPath,
  }, null, 2));

  await browser.close();
})();
