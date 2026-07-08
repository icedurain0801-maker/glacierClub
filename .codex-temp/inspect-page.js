const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
  const messages = [];
  page.on('console', (message) => messages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  await page.goto('http://localhost:5273', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => ({
    title: document.title,
    bodyText: document.body.innerText.slice(0, 1000),
    textareaCount: document.querySelectorAll('textarea').length,
    buttonTexts: [...document.querySelectorAll('button')].map((button) => button.innerText.trim()).slice(0, 20)
  }));
  console.log(JSON.stringify({ state, messages }, null, 2));
  await page.screenshot({ path: path.resolve('.codex-temp/emotionbot-page-inspect.png'), fullPage: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
