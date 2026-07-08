const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:5280/glacierClub/emotionbot-web/';
const screenshotPath = process.argv[3] || '.codex-temp/emotionbot-fixed-preview.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const messages = [];

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    messages.push(`pageerror: ${error.message}`);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  const state = await page.evaluate(() => {
    const root = document.querySelector('#root');
    const phone = document.querySelector('.phone-frame');
    const list = document.querySelector('.message-list');
    const bubble = document.querySelector('.message-bubble');
    const rootBox = root?.getBoundingClientRect();
    const phoneBox = phone?.getBoundingClientRect();
    const listBox = list?.getBoundingClientRect();
    const bubbleBox = bubble?.getBoundingClientRect();

    return {
      title: document.title,
      rootTextLength: root?.innerText?.trim().length || 0,
      hasRootChildren: Boolean(root?.children.length),
      hasPhone: Boolean(phone),
      hasBubble: Boolean(bubble),
      rootBox,
      phoneBox,
      listBox,
      bubbleBox
    };
  });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  console.log(JSON.stringify({ url, screenshotPath, state, messages }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
