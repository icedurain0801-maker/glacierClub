const path = require('path');
const { chromium, devices } = require('playwright');

function nowText() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getPostId(urlText) {
  try {
    const u = new URL(urlText);
    return u.searchParams.get('id') || '';
  } catch {
    return '';
  }
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
    if (box.y < 180 || box.y > vp.height - 20) continue;
    rows.push({
      index: i,
      x: Math.round(box.x),
      y: Math.round(box.y),
      cx: Math.round(box.x + box.width / 2),
      cy: Math.round(box.y + box.height / 2),
      text: ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim(),
      cls: (await el.getAttribute('class').catch(() => '')) || '',
    });
  }
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  return rows;
}

async function clickCommentIcon(page, picked) {
  const loc = page.locator('[class*="comment-tip"]').nth(picked.index);
  await loc.click({ force: true }).catch(async () => {
    await page.mouse.click(picked.cx, picked.cy);
  });
  await page.waitForTimeout(4500);
}

async function commentOnDetail(page, content) {
  const footerCount = page.locator('.post-detail-footer .comment-tip').first();
  const beforeCount = ((await footerCount.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

  await page.locator('.input-tip').first().click({ force: true });
  await page.waitForTimeout(1200);

  const editor = page.locator('.comment-input .ql-editor').first();
  await editor.click({ force: true });
  await editor.fill(content);
  await page.waitForTimeout(500);

  const publishByText = page.locator('.comment-input').getByText(/发布|publish/i).first();
  const publishByClass = page.locator('.comment-input [class*="publish"]').first();
  const publishBtn = (await publishByText.count()) > 0 ? publishByText : publishByClass;
  await publishBtn.click({ force: true });
  await page.waitForTimeout(3000);

  const afterCount = ((await footerCount.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  return { beforeCount, afterCount };
}

(async () => {
  const outDir = __dirname;
  const statePath = path.join(outDir, 'club-storage-state.json');
  const screenshotPath = path.join(outDir, 'club-comment-second-entry.png');

  const excludePostId = process.argv[2] || '145694';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'zh-CN',
    storageState: statePath,
  });
  const page = await context.newPage();

  const navs = [];
  const commentApis = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) navs.push(frame.url());
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('/api/club') || !/auth\/comment/i.test(url)) return;
    const body = (await resp.text().catch(() => '')).slice(0, 1200);
    commentApis.push({ status: resp.status(), url, body });
  });

  const scanHistory = [];
  let final = { ok: false, reason: 'not-found' };

  await page.goto('http://club.test.q1.com/?env=web&lang=zh-CN', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(9000);

  const seenKeys = new Set();
  for (let step = 0; step < 10; step += 1) {
    if (final.ok) break;
    const icons = await collectVisibleCommentIcons(page);
    scanHistory.push({ step, icons });

    for (const picked of icons) {
      const key = `${step}|${picked.index}|${picked.y}|${picked.text}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      await clickCommentIcon(page, picked);
      const detailUrl = page.url();
      const postId = getPostId(detailUrl);
      const isDetail = /\/pages\/post\/detail\/index/.test(detailUrl);

      if (!isDetail) {
        continue;
      }

      if (postId && postId !== excludePostId) {
        const commentText = `自动化评论（第二入口）${nowText()}`;
        const detail = await commentOnDetail(page, commentText);
        final = {
          ok: true,
          excludePostId,
          picked,
          postId,
          detailUrl,
          detail,
          commentText,
        };
        break;
      }

      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(4500);
    }

    if (final.ok) break;
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(1400);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const finalInfo = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1600),
  }));

  console.log(JSON.stringify({
    final,
    finalInfo,
    navs: navs.slice(-40),
    commentApis: commentApis.slice(-50),
    screenshot: screenshotPath,
    scanHistory,
  }, null, 2));

  await browser.close();
})();
