#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.goto(fileUrl);
  await pg.waitForTimeout(500);

  // 等待手机渲染完毕，截取手机区域
  const frame = await pg.$('.phone-frame');
  await frame.screenshot({ path: 'docs/closeup-home.png' });

  // 切到 bet 页 + 展开第一条（page-tabs 已移除，改为手机内导航）
  await pg.evaluate(() => {
    if (window.__app && window.__app.goto) {
      window.__app.goto('bet');
    } else {
      // fallback：调用 home 上"去竞猜"按钮
      const btn = document.querySelector('[data-action="goto-bet"]');
      if (btn) btn.click();
    }
  });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => {
    const row = document.querySelector('.match-row-head');
    if (row) row.click();
  });
  await pg.waitForTimeout(300);
  await frame.screenshot({ path: 'docs/closeup-bet.png' });

  await ctx.close();
  await browser.close();
  console.log('done closeups');
})();
