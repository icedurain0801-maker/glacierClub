#!/usr/bin/env node
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const pages = ['home', 'bet', 'record', 'rules', 'share'];

  for (const p of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const pg = await ctx.newPage();
    await pg.goto(fileUrl);
    await pg.waitForTimeout(500);
    await pg.evaluate((target) => {
      const tab = document.querySelector(`.page-tab[data-page="${target}"]`);
      if (tab) tab.click();
    }, p);
    await pg.waitForTimeout(500);
    // 在 bet 页面展开第一行
    if (p === 'bet') {
      await pg.evaluate(() => {
        const row = document.querySelector('.match-row-head');
        if (row) row.click();
      });
      await pg.waitForTimeout(300);
    }
    await pg.screenshot({ path: `docs/preview-${p}.png` });
    await ctx.close();
    console.log('done', p);
  }
  await browser.close();
})();
