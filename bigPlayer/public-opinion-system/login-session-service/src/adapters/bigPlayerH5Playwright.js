'use strict';

const { ServiceError } = require('../errors');

// Q1 的 token 存于 localStorage，key 为 `clubApp@web-${gameVersion}@token`，
// 后缀是 baseUrl 中的 gameVersion（如 2131-CN-ZS），随游戏版本而变，不能写死。
const TOKEN_KEY_PATTERN = /^clubApp@web-[^@]+@token$/;
// 兼容旧导出（外部可能引用）
const TOKEN_KEY = 'clubApp@web-default@token';

function loadPlaywright() {
  try { return require('playwright'); } catch { throw new ServiceError('AUTOMATION_NOT_CONFIGURED', 'Playwright is not available', 503); }
}

class BigPlayerH5PlaywrightAutomation {
  constructor({ credentialResolver, playwright, headless = true, timeoutMs = 30000, challengeTtlMs = 300000 } = {}) {
    if (typeof credentialResolver !== 'function') throw new TypeError('credentialResolver is required');
    this.credentialResolver = credentialResolver;
    this.playwright = playwright || loadPlaywright();
    this.headless = headless;
    this.timeoutMs = timeoutMs;
    this.challengeTtlMs = challengeTtlMs;
    this.handles = new Map();
  }

  async login({ credentialRef, sourceId, accountId, credentials }) {
    const resolvedCredentials = credentials || await this.credentialResolver({ credentialRef, sourceId, accountId, platform: 'bigplayer_h5' });
    if (!resolvedCredentials?.baseUrl || !resolvedCredentials?.account || typeof resolvedCredentials.password !== 'string') throw new ServiceError('CREDENTIAL_RESOLVE_INVALID', 'Resolved BigPlayer credential is incomplete', 502);
    const browser = await this.playwright.chromium.launch({ headless: this.headless });
    const context = await browser.newContext({ locale: 'zh-CN' });
    const page = await context.newPage();
    const close = async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); };
    try {
      await page.goto(resolvedCredentials.baseUrl, { waitUntil: 'load', timeout: this.timeoutMs });
      let loginFrame = page.frames().find(frame => /login\d*(?:\.dev)?\.q1\.com/i.test(frame.url()));
      if (!loginFrame && typeof page.getByText === 'function') {
        let loginEntry = page.getByText('去登录', { exact: true }).first();
        if (!(await loginEntry.count())) {
          const profileEntry = page.getByText('我的', { exact: true }).first();
          if (await profileEntry.count()) {
            await profileEntry.click();
            const entryDeadline = Date.now() + Math.min(this.timeoutMs, 10000);
            do {
              loginEntry = page.getByText('去登录', { exact: true }).first();
              if (await loginEntry.count()) break;
              await page.waitForTimeout(100);
            } while (Date.now() < entryDeadline);
          }
        }
        if (await loginEntry.count()) {
          await loginEntry.click();
          const frameDeadline = Date.now() + Math.min(this.timeoutMs, 10000);
          do {
            loginFrame = page.frames().find(frame => /login\d*(?:\.dev)?\.q1\.com/i.test(frame.url()));
            if (loginFrame) break;
            await page.waitForTimeout(100);
          } while (Date.now() < frameDeadline);
        }
      }
      if (!loginFrame) throw new ServiceError('LOGIN_FRAME_NOT_FOUND', 'BigPlayer login frame was not found', 502);
      await loginFrame.locator('input[name="account"]').first().click();
      await loginFrame.locator('input[name="account"]').first().type(resolvedCredentials.account, { delay: 15 });
      await loginFrame.locator('input[name="password"]').first().click();
      await loginFrame.locator('input[name="password"]').first().type(resolvedCredentials.password, { delay: 15 });
      await loginFrame.locator('button.submit-btn').first().click();
      await page.waitForTimeout(1000);
      return await this.finishOrChallenge({ page, loginFrame, close });
    } catch (error) { await close(); throw error; }
  }

  async finishOrChallenge({ page, loginFrame, close }) {
    const deadline = Date.now() + Math.min(this.timeoutMs, 15000);
    let token = null;
    do {
      token = await this.readToken(page);
      if (token) { await close(); return { kind: 'success', apiToken: token }; }
      await page.waitForTimeout(250);
    } while (Date.now() < deadline);

    const captcha = loginFrame.locator('#imgageCaptcha').first();
    if (await captcha.count() && (!captcha.isVisible || await captcha.isVisible())) {
      const challengeId = `browser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const buffer = await captcha.screenshot();
      this.handles.set(challengeId, { page, loginFrame, close, expiresAt: Date.now() + this.challengeTtlMs });
      return { kind: 'challenge', challenge: { adapterChallengeRef: challengeId, type: 'image_captcha', displayRef: `data:image/png;base64,${buffer.toString('base64')}`, instruction: '请输入图片验证码', allowsTextSubmission: true, requiresPolling: false } };
    }

    const state = await this.inspectLoginState(loginFrame);
    await close();
    return { kind: 'failure', code: state.code };
  }

  async inspectLoginState(loginFrame) {
    try {
      const body = loginFrame.locator('body').first();
      if (await body.count() && typeof body.innerText === 'function') {
        const text = String(await body.innerText()).replace(/\s+/g, ' ').trim();
        if (/(账号|用户名|密码).*(错误|不正确|无效)|登录失败|账号不存在/i.test(text)) {
          return { code: 'INVALID_CREDENTIALS' };
        }
        if (/(短信|验证码|滑块|二维码|扫码|设备确认|安全验证|二次验证)/i.test(text)) {
          return { code: 'LOGIN_CHALLENGE_REQUIRED' };
        }
      }
    } catch {}
    return { code: 'LOGIN_STATE_UNKNOWN' };
  }

  async readToken(page) {
    const contexts = [page, ...(typeof page.frames === 'function' ? page.frames() : [])];
    for (const context of contexts) {
      try {
        // 先精确扫描匹配 `clubApp@web-<gameVersion>@token` 的 key，再回退到固定默认 key。
        const token = await context.evaluate((pattern) => {
          const re = new RegExp(pattern);
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && re.test(key)) {
              const value = window.localStorage.getItem(key);
              if (value) return value;
            }
          }
          return window.localStorage.getItem('clubApp@web-default@token') || null;
        }, TOKEN_KEY_PATTERN.source);
        if (token) return token;
      } catch {}
    }
    return null;
  }

  handleFor(challenge, adapterChallengeRef) {
    const ref = adapterChallengeRef || challenge?.adapterChallengeRef;
    const handle = this.handles.get(ref);
    if (!handle || Date.now() >= handle.expiresAt) { this.handles.delete(ref); if (handle) handle.close(); throw new ServiceError('CHALLENGE_EXPIRED', 'Challenge has expired', 410); }
    return handle;
  }

  async submitChallenge({ challenge, adapterChallengeRef, answer }) {
    const handle = this.handleFor(challenge, adapterChallengeRef);
    try {
      await handle.loginFrame.locator('#verifyImageCode').first().click();
      await handle.loginFrame.locator('#verifyImageCode').first().type(answer, { delay: 15 });
      await handle.loginFrame.locator('button').first().click();
      await handle.page.waitForTimeout(1000);
      const token = await this.readToken(handle.page);
      if (!token) return { approved: false };
      await handle.close(); this.handles.delete(adapterChallengeRef || challenge.adapterChallengeRef);
      return { approved: true, apiToken: token };
    } catch (error) { await handle.close(); this.handles.delete(adapterChallengeRef || challenge.adapterChallengeRef); throw error; }
  }

  async pollChallenge({ challenge, adapterChallengeRef }) {
    const handle = this.handleFor(challenge, adapterChallengeRef);
    const token = await this.readToken(handle.page);
    if (!token) return { approved: false };
    await handle.close(); this.handles.delete(adapterChallengeRef || challenge.adapterChallengeRef);
    return { approved: true, apiToken: token };
  }

  async disposeChallenge({ challenge, adapterChallengeRef } = {}) { const ref = adapterChallengeRef || challenge?.adapterChallengeRef; const handle = this.handles.get(ref); if (handle) { this.handles.delete(ref); await handle.close(); } }
}

module.exports = { BigPlayerH5PlaywrightAutomation, TOKEN_KEY };
