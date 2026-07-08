const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const tempDir = __dirname;
const answerPath = path.join(tempDir, 'captcha-answer.txt');
const captchaPath = path.join(tempDir, 'captcha.png');
const screenshotPath = path.join(tempDir, 'captcha-page.png');
const statePath = path.join(tempDir, 'club-storage-state.json');
const statusPath = path.join(tempDir, 'login-status.json');

function writeStatus(status) {
  fs.writeFileSync(statusPath, JSON.stringify({ at: new Date().toISOString(), ...status }, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForAnswer() {
  for (let i = 0; i < 240; i += 1) {
    if (fs.existsSync(answerPath)) {
      return fs.readFileSync(answerPath, 'utf8').trim();
    }
    await sleep(1000);
  }
  throw new Error('Timed out waiting for captcha answer');
}

async function clickGoLogin(page) {
  const vp = page.viewportSize();
  if (!vp) return;
  await page.mouse.click(vp.width * 0.9, vp.height - 25);
  await page.waitForTimeout(1200);
  const candidates = await page.locator('uni-view.link, uni-view, [role="button"], button, a').all();
  for (const candidate of candidates) {
    const text = ((await candidate.innerText().catch(() => '')) || '').replace(/\s+/g, '');
    if (text.includes('去登录')) {
      await candidate.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }
  }
  // Fallback to known popup area coordinate.
  await page.mouse.click(vp.width / 2, 618);
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' });
  const page = await context.newPage();
  try {
    if (fs.existsSync(answerPath)) fs.unlinkSync(answerPath);
    writeStatus({ stage: 'opening-site' });
    await page.goto('http://club.test.q1.com/?env=web&lang=zh-CN', {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.waitForTimeout(6000);

    if (!page.url().includes('/pages/user/login/index')) {
      await clickGoLogin(page);
    }
    if (!page.url().includes('/pages/user/login/index')) {
      await page.goto('http://club.test.q1.com/pages/user/login/index?redirect=%252F%253Fenv%253Dweb%2526lang%253Dzh-CN&back=%252F%253Fenv%253Dweb%2526lang%253Dzh-CN&env=web&lang=zh-CN', {
        waitUntil: 'load',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }

    writeStatus({ stage: 'filling-login' });
    const loginFrame = page.frames().find(frame => frame.url().includes('login.dev.q1.com/h5/account.html'));
    if (!loginFrame) throw new Error('login iframe not found');
    await loginFrame.locator('input[name="account"]').first().fill(process.env.CLUB_USER || '');
    await loginFrame.locator('input[name="password"]').fill(process.env.CLUB_PASS || '');
    await loginFrame.locator('button').first().click();
    await page.waitForTimeout(6000);

    if (!page.url().includes('/pages/user/login/index')) {
      await context.storageState({ path: statePath });
      writeStatus({ stage: 'logged-in', statePath, url: page.url() });
      await browser.close();
      return;
    }

    const frame = page.frames().find(item => item.url().includes('login.dev.q1.com'));
    if (!frame) throw new Error('captcha frame not found');
    const captcha = frame.locator('#imgageCaptcha');
    await captcha.screenshot({ path: captchaPath });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeStatus({ stage: 'needs-captcha', captchaPath, screenshotPath });

    const answer = await waitForAnswer();
    await frame.locator('#verifyImageCode').fill(answer);
    await frame.locator('button').first().click();
    await page.waitForTimeout(10000);

    if (page.url().includes('/pages/user/login/index')) {
      const text = await frame.locator('body').innerText().catch(() => '');
      throw new Error(`login still on login page: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }

    await context.storageState({ path: statePath });
    writeStatus({ stage: 'logged-in', statePath, url: page.url() });
  } catch (error) {
    writeStatus({ stage: 'error', error: String(error.stack || error.message || error) });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
