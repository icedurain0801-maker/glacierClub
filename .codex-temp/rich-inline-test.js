const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });

  await page.goto('http://localhost:5273', { waitUntil: 'networkidle' });
  await page.fill('textarea', '薇珀有哪些技能');
  await page.press('textarea', 'Enter');
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll('.message-row.from-bot')];
      const last = rows.at(-1);
      return (
        last &&
        last.textContent.length > 80 &&
        last.querySelectorAll('.message-inline-visual img').length >= 1
      );
    },
    null,
    { timeout: 90000 }
  );
  await page.waitForTimeout(2500);

  const metrics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.message-row.from-bot')];
    const last = rows.at(-1);
    const content = last?.querySelector('.message-content');
    const images = [...(last?.querySelectorAll('.message-inline-visual img') || [])];
    const srcs = images.map((img) => img.currentSrc || img.src);

    return {
      heroBlocks: last?.querySelectorAll('.hero-visuals, .hero-visual-card').length || 0,
      inlineBlocks: last?.querySelectorAll('.message-inline-visuals').length || 0,
      inlineImages: srcs.length,
      contentImages: content?.querySelectorAll('img').length || 0,
      duplicateSrcCount: srcs.length - new Set(srcs).size,
      failedImages: images.filter((img) => !img.complete || img.naturalWidth === 0).length,
      images: images.map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt,
        previousText: img.closest('.message-inline-visuals')?.previousElementSibling?.textContent.trim().slice(0, 90) || ''
      })),
      blocks: [...(content?.children || [])].map((node, index) => ({
        index,
        className: node.className,
        text: node.textContent.trim().slice(0, 90),
        imageCount: node.querySelectorAll?.('img').length || 0
      }))
    };
  });

  console.log(JSON.stringify(metrics, null, 2));
  await page.locator('.message-row.from-bot .message-content').last().screenshot({
    path: path.resolve('.codex-temp/emotionbot-client-rich-inline-final-content.png')
  });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
