'use strict';

const crypto = require('node:crypto');
const { Resolver } = require('node:dns').promises;
const { isIP } = require('node:net');
const { ServiceError } = require('../errors');
const { bindingKey, normalizeFacebookWebUrl } = require('../../../shared/facebookBrowser');

// Facebook renders these labels in the browser's explicitly selected timezone.
// Relative labels such as "2h" must never be converted to fabricated timestamps.
function parseFacebookTimestamp(value) {
  const text=String(value||'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();
  const chinese=text.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(?:(?:周|星期)[一二三四五六日天]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(chinese){
    const [,y,m,d,h,mi,s='0']=chinese;const year=Number(y),month=Number(m)-1,day=Number(d),hour=Number(h),minute=Number(mi),second=Number(s);
    if(year<1970||month<0||month>11||day<1||hour>23||minute>59||second>59)return null;
    const timestamp=Date.UTC(year,month,day,hour-8,minute,second),check=new Date(timestamp+8*3600000);
    return check.getUTCFullYear()===year&&check.getUTCMonth()===month&&check.getUTCDate()===day?new Date(timestamp).toISOString():null;
  }
  const match=text.match(/(?:^|, )(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),? (\d{4}) at (\d{1,2}):(\d{2})(?::(\d{2}))? ([AP]M)$/i);
  if(!match)return null;
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month=months.indexOf(match[1].toLowerCase()),day=Number(match[2]),year=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]||0);
  if(year<1970||hour<1||hour>12||minute>59||second>59||day<1||day>31)return null;
  const localHour=hour%12+(match[7].toUpperCase()==='PM'?12:0);
  const timestamp=Date.UTC(year,month,day,localHour-8,minute,second);
  const check=new Date(timestamp+8*3600000);
  return check.getUTCFullYear()===year&&check.getUTCMonth()===month&&check.getUTCDate()===day?new Date(timestamp).toISOString():null;
}
function facebookPostUrl(baseUrl,postId,commentId='') {
  const base=new URL(normalizeFacebookWebUrl(baseUrl));
  if(!/^[A-Za-z0-9_]+$/.test(String(postId)) || (commentId&&!/^[A-Za-z0-9_]+$/.test(String(commentId))))throw new ServiceError('INVALID_INPUT','内容 ID 无效',400);
  let target;
  if(base.pathname==='/profile.php'){
    target=new URL('https://www.facebook.com/permalink.php');target.searchParams.set('story_fbid',postId);target.searchParams.set('id',base.searchParams.get('id'));
  }else{
    const path=base.pathname.replace(/\/$/,'');
    const profile=path.match(/^\/(?:people|pages)\/[^/]+\/(\d+)$/);
    target=new URL(`https://www.facebook.com${profile?'/'+profile[1]:path}/posts/${encodeURIComponent(postId)}`);
  }
  if(commentId)target.searchParams.set('comment_id',commentId);
  return target.href;
}

// This adapter reads rendered Facebook pages. It never calls undocumented Graph
// endpoints, follows arbitrary URLs, or treats a login wall as an empty feed.
class FacebookBrowserAutomation {
  constructor({ playwright, executablePath, externalBrowserClient, headless = true, timeoutMs = 30000, now = () => Date.now(), maxSessions = 16, maxConcurrent = 2, queueTimeoutMs = 10000, verificationDnsServers = [], resolveVerificationHost } = {}) {
    this.playwright = playwright; this.executablePath = executablePath; this.headless = headless;
    this.externalBrowserClient = externalBrowserClient;
    this.timeoutMs = timeoutMs; this.now = now; this.maxSessions = maxSessions;
    this.sessions = new Map(); this.busy = new Set(); this.challenges = new Map(); this.maxConcurrent = maxConcurrent;
    this.activeOperations = 0; this.waiters = []; this.queueTimeoutMs = queueTimeoutMs;
    this.verificationDnsServers = verificationDnsServers;
    this.resolveVerificationHost = resolveVerificationHost || (async servers => {
      const resolver = new Resolver({ timeout: 2500, tries: 1 });
      resolver.setServers(servers); return resolver.resolve4('www.fbsbx.com');
    });
  }
  readiness() { return { available: true, mode: 'browser' }; }
  async locked(binding, operation) {
    const key = bindingKey(binding);
    if (this.busy.has(key)) throw new ServiceError('FACEBOOK_ACCOUNT_BUSY', '该社区 Facebook 账号正在执行任务，请稍后重试', 409);
    this.busy.add(key);
    let acquired = false;
    try { await this.acquireSlot(); acquired = true; return await operation(key); }
    finally { this.busy.delete(key); if (acquired) this.releaseSlot(); }
  }
  acquireSlot() {
    if (this.activeOperations < this.maxConcurrent) { this.activeOperations++; return Promise.resolve(); }
    if (this.waiters.length >= 32) return Promise.reject(new ServiceError('FACEBOOK_BROWSER_BUSY', '网页采集队列已满，请稍后重试', 503));
    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => { this.waiters = this.waiters.filter(row => row !== entry); reject(new ServiceError('FACEBOOK_BROWSER_BUSY', '网页采集排队超时，请稍后重试', 503)); }, this.queueTimeoutMs);
      this.waiters.push(entry);
    });
  }
  releaseSlot() {
    this.activeOperations--;
    const next = this.waiters.shift();
    if (next) { clearTimeout(next.timer); this.activeOperations++; next.resolve(); }
  }
  async getBrowser() {
    if (!this.browserPromise) this.browserPromise = (async () => {
      const pw = this.playwright || require('playwright');
      let args = [];
      if (this.verificationDnsServers.length) {
        if (this.verificationDnsServers.some(server => !isIP(server))) throw new ServiceError('FACEBOOK_VERIFICATION_DNS_INVALID', 'Facebook 验证域名 DNS 配置无效', 503);
        const addresses = await this.resolveVerificationHost(this.verificationDnsServers);
        const address = addresses.find(value => isIP(value) === 4 && !/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(value));
        if (!address) throw new ServiceError('FACEBOOK_VERIFICATION_DNS_FAILED', 'Facebook 验证域名解析失败', 503);
        // Only this verification hostname is mapped, with TLS hostname checks
        // unchanged. Never pin a manually supplied address into a release.
        args = [`--host-resolver-rules=MAP www.fbsbx.com ${address}`];
      }
      return pw.chromium.launch({ headless: this.headless, args, ...(this.executablePath ? { executablePath: this.executablePath } : {}) });
    })().catch(error => { this.browserPromise = null; if (error instanceof ServiceError) throw error; throw new ServiceError('FACEBOOK_BROWSER_UNAVAILABLE', 'Facebook 浏览器不可用', 503); });
    return this.browserPromise;
  }
  async dispose(key) {
    const session = this.sessions.get(key); this.sessions.delete(key);
    for (const [ref, entry] of this.challenges) if (entry.key === key) this.challenges.delete(ref);
    if (session) await (session.external ? session.page.close() : session.context.close()).catch(() => {});
  }
  async session(key, externalBinding = null) {
    const existing = this.sessions.get(key);
    if (existing && (!externalBinding || existing.external) && (existing.external || this.now() - existing.touched < 3600000) && !existing.page.isClosed()) { existing.touched = this.now(); return existing; }
    await this.dispose(key);
    for (const [oldKey, old] of this.sessions) if (!old.external && !this.busy.has(oldKey) && this.now() - old.touched >= 3600000) await this.dispose(oldKey);
    if (this.sessions.size >= this.maxSessions) throw new ServiceError('FACEBOOK_BROWSER_CAPACITY', '浏览器会话容量已满，请稍后重试', 503);
    let browser; let context;
    if (externalBinding) {
      if (!this.externalBrowserClient) throw new ServiceError('EXTERNAL_BROWSER_NOT_CONFIGURED', '请先启动本机真实浏览器登录助手', 503);
      const endpoint = await this.externalBrowserClient.open(externalBinding);
      browser = await (this.playwright || require('playwright')).chromium.connectOverCDP(endpoint);
      context = browser.contexts()[0];
      if (!context) { await browser.close(); throw new ServiceError('EXTERNAL_BROWSER_CONTEXT_MISSING', '真实浏览器会话不可用', 503); }
    } else { browser = await this.getBrowser(); context = await browser.newContext({ locale: 'en-US', timezoneId:'Asia/Shanghai', serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1024, height: 768 } }); }
    await context.route('**/*', async route => {
      let url; try { url = new URL(route.request().url()); } catch { return route.abort(); }
      const host = url.hostname;
      const allowed = ['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(domain => host === domain || host.endsWith('.' + domain));
      // Facebook's security iframe embeds Google's reCAPTCHA. Permit only
      // those resources, never top-level navigation away from Facebook.
      const captcha = ['www.google.com', 'www.gstatic.com', 'www.recaptcha.net'].includes(host) && url.pathname.startsWith('/recaptcha/') && !(route.request().isNavigationRequest() && route.request().frame() === page.mainFrame());
      if (url.protocol !== 'https:' || !(allowed || captcha) || url.username || url.password || (url.port && url.port !== '443')) return route.abort();
      return route.continue();
    });
    const startupPages = externalBinding ? context.pages() : [];
    const page = await context.newPage(); page.setDefaultTimeout(this.timeoutMs); page.setDefaultNavigationTimeout(this.timeoutMs);
    if (externalBinding) for (const startupPage of startupPages) if (startupPage.url() === 'about:blank') await startupPage.close().catch(() => {});
    if (externalBinding) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
      await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
      await cdp.detach();
      if (externalBinding.scenario !== 'resume_external') await page.bringToFront();
    }
    const session = { context, page, external: Boolean(externalBinding), browser, touched: this.now(), authorized: false, revision: crypto.randomUUID() };
    this.sessions.set(key, session); return session;
  }
  async authenticated(session) { return (await session.context.cookies('https://www.facebook.com')).some(cookie => cookie.name === 'c_user' && /^\d+$/.test(cookie.value)); }
  async state(page) {
    if (/\/(checkpoint|two_step_verification|confirmidentity|auth_platform)\b/.test(page.url())) return 'challenge';
    if (await page.locator('input[name="approvals_code"],input[autocomplete="one-time-code"]').count()) return 'challenge';
    if (await page.locator('input[name="email"],input[name="pass"]').count()) return 'login';
    if (await page.locator('[role="feed"],[role="navigation"],[aria-label="Your profile"],[aria-label="Account"]').count()) return 'active';
    return 'unknown';
  }
  async challenge(binding, key, session) {
    const ref = crypto.randomUUID(); this.challenges.set(ref, { key, binding, expires: this.now() + 300000 });
    const text = Boolean(await session.page.locator('input[name="approvals_code"],input[autocomplete="one-time-code"]').count());
    if (session.external) return { kind: 'challenge', challenge: { type: 'external_browser', adapterChallengeRef: ref, instruction: '请在已打开的真实 Facebook 浏览器中完成登录和验证。保持窗口打开，系统将自动检查结果并复用此会话采集。', allowsTextSubmission: false, requiresPolling: true } };
    return { kind: 'challenge', challenge: { type: text ? 'sms_code' : 'external_confirmation', adapterChallengeRef: ref, instruction: text ? '请输入 Facebook 要求的验证码' : '请打开人工验证画面，亲自完成 Facebook 安全验证，也可在已登录的可信设备批准登录，然后检查验证结果。', allowsTextSubmission: text, requiresPolling: !text } };
  }
  async login(input) {
    return this.locked(input, async key => {
      const session = await this.session(key, ['external_browser', 'resume_external'].includes(input.scenario) ? input : null); session.authorized = false; const page = session.page;
      const account = String(input.credentials?.account || '').trim(); const password = input.credentials?.password;
      if (!account || !password) throw new ServiceError('CREDENTIAL_NOT_FOUND', '请先保存本社区 Facebook 登录账密', 409);
      const targetUrl = normalizeFacebookWebUrl(input.credentials.baseUrl); session.bindingRevision = input.credentials.bindingRevision;
      if (input.scenario === 'resume_external') {
        // Rebuild the service reference only after checking the bound browser's
        // real Facebook session. Never submit credentials or bypass challenges.
        session.targetUrl = targetUrl;
        if (!await this.authenticated(session)) return { kind: 'failure', code: 'LOGIN_REQUIRED' };
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('[role="navigation"],[role="feed"],[aria-label="Your profile"],[aria-label="Account"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        const state = await this.state(page);
        if (state !== 'active' || !await this.authenticated(session)) return { kind: 'failure', code: state === 'challenge' ? 'MANUAL_VERIFICATION_REQUIRED' : 'LOGIN_REQUIRED' };
        session.authorized = true;
        return { kind: 'success' };
      }
      if (input.scenario === 'external_browser') {
        session.targetUrl = targetUrl;
        if(await this.authenticated(session)){
          await page.goto(targetUrl,{waitUntil:'domcontentloaded'});
          if(await this.state(page)==='active'){session.authorized=true;return {kind:'success'};}
        }
        await page.goto('https://www.facebook.com/login/', { waitUntil: 'domcontentloaded' });
        if (await page.locator('input[name="email"]:visible').count() && await page.locator('input[name="pass"]:visible').count()) {
          await page.locator('input[name="email"]').fill(account);
          await page.locator('input[name="pass"]').fill(password);
        }
        await page.bringToFront();
        return this.challenge(input, key, session);
      }
      // Wait for the login scripts as well as the initial HTML; the new form
      // can display inputs before its handlers are attached.
      await page.goto('https://www.facebook.com/login/', { waitUntil: 'load' });
      let status = await this.state(page);
      if (status === 'login') {
        await page.locator('input[name="email"]').fill(account); await page.locator('input[name="pass"]').fill(password);
        // Facebook serves both legacy forms and a newer div[role=button]
        // login control. Match the accessible action rather than its tag.
        const submit = page.getByRole('button', { name: /^(log\s*in|登录|登入)$/i })
          .or(page.locator('button[name="login"]:visible,button[type="submit"]:visible,input[type="submit"]:visible')).first();
        try { await submit.click({ timeout: Math.min(this.timeoutMs, 10000) }); }
        catch (error) {
          if (error.name !== 'TimeoutError') throw error;
          throw new ServiceError('FACEBOOK_LOGIN_CONTROL_UNAVAILABLE', 'Facebook 登录按钮未能响应，请稍后重试或检查登录页面', 502);
        }
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => !document.querySelector('input[name="pass"]') || /\/(checkpoint|two_step_verification|confirmidentity|auth_platform)\b/.test(location.pathname) || Array.from(document.querySelectorAll('#error_box,[role="alert"]')).some(node => node.textContent.trim()), null, { timeout: this.timeoutMs }).catch(error => {
          if (error.name !== 'TimeoutError') throw error;
          throw new ServiceError('FACEBOOK_LOGIN_RESPONSE_TIMEOUT', 'Facebook 未在时限内返回登录结果，请刷新登录状态确认后再重试', 504);
        });
        status = await this.state(page);
      }
      if (status === 'challenge') return this.challenge(input, key, session);
      if (status === 'login') { session.authorized = false; return { kind: 'failure', code: 'INVALID_CREDENTIALS' }; }
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      status = await this.state(page);
      if (status === 'challenge') return this.challenge(input, key, session);
      if (status !== 'active' || !await this.authenticated(session)) { session.authorized = false; return { kind: 'failure', code: status === 'login' ? 'SESSION_EXPIRED' : 'FACEBOOK_PAGE_UNAVAILABLE' }; }
      session.authorized = true; session.targetUrl = targetUrl; return { kind: 'success' };
    }).catch(error => {
      if (error.name === 'TimeoutError') throw new ServiceError('FACEBOOK_LOGIN_PAGE_TIMEOUT', 'Facebook 登录页面加载超时，请稍后重试', 504);
      throw error;
    });
  }
  async continueChallengeLogin(session, entry, credentials) {
    // CAPTCHA completion can return to the login form. Keep this browser and
    // submit the stored account once; never navigate away or operate CAPTCHA.
    if (session.external || entry.loginContinued || !await session.page.locator('input[name="email"]:visible').count()
      || !await session.page.locator('input[name="pass"]:visible').count()) return;
    const account = String(credentials?.account || '').trim();
    if (!account || !credentials?.password) throw new ServiceError('CREDENTIAL_NOT_FOUND', '请先保存本社区 Facebook 登录账密', 409);
    if (credentials.bindingRevision !== session.bindingRevision) throw new ServiceError('SESSION_EXPIRED', '账号配置已变化，请重新登录', 409);
    const targetUrl = normalizeFacebookWebUrl(credentials.baseUrl);
    const page = session.page;
    entry.loginContinued = true;
    await page.locator('input[name="email"]').fill(account);
    await page.locator('input[name="pass"]').fill(credentials.password);
    const submit = page.getByRole('button', { name: /^(log\s*in|登录|登入)$/i })
      .or(page.locator('button[name="login"]:visible,button[type="submit"]:visible,input[type="submit"]:visible')).first();
    await submit.click({ timeout: Math.min(this.timeoutMs, 10000) });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => !document.querySelector('input[name="pass"]') || /\/(checkpoint|two_step_verification|confirmidentity|auth_platform)\b/.test(location.pathname) || Array.from(document.querySelectorAll('#error_box,[role="alert"]')).some(node => node.textContent.trim()), null, { timeout: this.timeoutMs });
    if (await this.state(page) === 'login') throw new ServiceError('FACEBOOK_LOGIN_CONTINUATION_FAILED', '验证后登录未完成，请检查账号或 Facebook 登录提示', 409);
    if (await this.state(page) === 'active' && await this.authenticated(session)) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      session.targetUrl = targetUrl;
    }
  }
  async finishChallenge({ adapterChallengeRef, answer, credentials }) {
    const entry = this.challenges.get(adapterChallengeRef);
    if (!entry || entry.expires <= this.now()) throw new ServiceError('CHALLENGE_EXPIRED', '验证已过期，请重新登录', 409);
    return this.locked(entry.binding, async key => {
      const session = this.sessions.get(key); if (!session) throw new ServiceError('SESSION_EXPIRED', '会话已过期', 409);
      if (answer) {
        await session.page.locator('input[name="approvals_code"],input[autocomplete="one-time-code"]').first().fill(answer);
        await session.page.locator('button[type="submit"],button[name="submit[Continue]"]').first().click();
        await session.page.waitForLoadState('domcontentloaded');
      }
      if (credentials) await this.continueChallengeLogin(session, entry, credentials);
      if (session.external && credentials?.bindingRevision !== session.bindingRevision) throw new ServiceError('SESSION_EXPIRED', '账号配置已变化，请重新登录', 409);
      if (session.external && await this.state(session.page) === 'active' && await this.authenticated(session) && session.page.url() !== session.targetUrl) await session.page.goto(session.targetUrl, { waitUntil:'domcontentloaded' });
      const approved = await this.state(session.page) === 'active' && await this.authenticated(session);
      if (approved) { session.authorized = true; this.challenges.delete(adapterChallengeRef); }
      return { approved };
    });
  }
  async inspectChallenge({ adapterChallengeRef, action = 'view', x, y, credentials }) {
    const entry = this.challenges.get(adapterChallengeRef);
    if (!entry || entry.expires <= this.now()) throw new ServiceError('CHALLENGE_EXPIRED', '验证已过期，请重新登录', 409);
    return this.locked(entry.binding, async key => {
      const session = this.sessions.get(key);
      if (!session) throw new ServiceError('SESSION_EXPIRED', '会话已失效', 409);
      const { page } = session;
      if (credentials) await this.continueChallengeLogin(session, entry, credentials);
      if (await this.state(page) === 'active' && await this.authenticated(session)) return { approved: true };
      if (action === 'click') {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1024 || y >= 768) throw new ServiceError('INVALID_INPUT', '点击位置无效', 400);
        await page.mouse.click(x, y);
      } else if (action === 'reload') await page.reload({ waitUntil: 'load', timeout: Math.min(this.timeoutMs, 15000) });
      else if (action === 'scroll') await page.mouse.wheel(0, 500);
      else if (action !== 'view') throw new ServiceError('INVALID_INPUT', '不支持的操作', 400);
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      // A navigation to a verification URL can still be an empty Meta shell.
      // Include rendered child frames: CAPTCHA controls can live in an iframe.
      let ready = false;
      for (const frame of page.frames()) {
        const usable = await frame.evaluate(() => {
          const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
          return (document.body?.innerText?.trim().length || 0) > 30 || Array.from(document.querySelectorAll('button,[role="button"],input:not([type="hidden"]),canvas')).some(visible);
        }).catch(() => false);
        if (usable) { ready = true; break; }
      }
      const image = await page.screenshot({ type: 'jpeg', quality: 65, mask: [page.locator('input[name="email"],input[name="pass"]')] });
      return { imageBase64: image.toString('base64'), width: 1024, height: 768, loading: !ready, message: ready ? null : 'Facebook 安全验证页尚未加载出内容，请稍后刷新画面；若持续空白，请重新加载验证页。' };
    });
  }
  submitChallenge(input) { return this.finishChallenge(input); }
  pollChallenge(input) { return this.finishChallenge(input); }
  async disposeChallenge({ adapterChallengeRef }) {
    const entry = this.challenges.get(adapterChallengeRef); if (entry) await this.dispose(entry.key);
  }
  async revoke(binding) { return this.locked(binding, key => this.dispose(key)); }
  async readAbsoluteTimes(page,scope,rootId='') {
    const nonce=crypto.randomUUID();
    const tokens=await page.locator('[role="article"]').evaluateAll((nodes,{scope,nonce,rootId})=>nodes.map((node,index)=>{
      const own=selector=>[...node.querySelectorAll(selector)].find(el=>el.closest('[role="article"]')===node);
      if(node.hasAttribute('data-po-published-at')||own('time[datetime],abbr[data-utime],[data-utime]'))return null;
      if(!node.getClientRects().length)return null;
      const link=[...node.querySelectorAll('a[href]')].filter(el=>el.closest('[role="article"]')===node).find(el=>{
        const url=new URL(el.href);
        const postLink=/\/posts\/|story_fbid=|\/permalink\//.test(el.href);
        return scope==='posts'?postLink&&!url.searchParams.has('comment_id')&&(!rootId||url.pathname.split('/').filter(Boolean).at(-1)===rootId||url.searchParams.get('story_fbid')===rootId):postLink&&(scope!=='comments'||!url.searchParams.has('reply_comment_id'))&&/^\d+$/.test(url.searchParams.get(scope==='replies'?'reply_comment_id':'comment_id')||'');
      });
      if(!link)return null;const token=nonce+'-'+index;link.setAttribute('data-po-time-link',token);return token;
    }).filter(Boolean),{scope,nonce,rootId});
    const deadline=Date.now()+10000;
    for(const token of tokens.slice(0,20)){
      if(Date.now()>deadline)break;
      const link=page.locator(`[data-po-time-link="${token}"]`);
      let value;
      try{value=parseFacebookTimestamp(await link.getAttribute('aria-label',{timeout:500}))||parseFacebookTimestamp(await link.getAttribute('title',{timeout:500}));}
      catch{continue;} // Facebook may have replaced this article since the token snapshot.
      if(!value){
        // Hide any previous tooltip first so it cannot supply another row's time.
        await page.mouse.move(0,0);
        try{await page.getByRole('tooltip').waitFor({state:'hidden',timeout:500});await link.hover({timeout:1000});await page.getByRole('tooltip').waitFor({state:'visible',timeout:1800});
          const labels=await page.getByRole('tooltip').allTextContents();if(labels.length===1)value=parseFacebookTimestamp(labels[0]);
        }catch{ /* Missing exact metadata remains an explicit collection failure. */ }
      }
      if(value)await link.evaluate((el,time)=>el.closest('[role="article"]')?.setAttribute('data-po-published-at',time),value,{timeout:500}).catch(()=>{});
    }
  }
  async expandContent(page,scope) {
    // Dismiss only Facebook's browser-notification preference, never security challenges.
    const notification=page.getByRole('alertdialog',{name:'推送通知请求'});
    if(await notification.isVisible().catch(()=>false))await notification.getByRole('button',{name:'关闭',exact:true}).click({timeout:1000}).catch(()=>{});
    if(scope!=='posts'){
      const sort=page.getByRole('button',{name:/^(Most relevant|最相关)/i}).first();
      if(await sort.isVisible().catch(()=>false)){
        await sort.click({timeout:1000}).catch(()=>{});
        const all=page.getByRole('menuitem').filter({hasText:/^(All comments|所有评论)/i}).first();
        if(await all.isVisible().catch(()=>false)){await all.click({timeout:1000}).catch(()=>{});await page.waitForTimeout(500);}
      }
    }
    const names=scope==='posts'?/^(See more|展开)$/i:/^(See more|展开|View (?:\d+ )?(?:more |previous )?(?:comments|replies)|View all comments|查看更多评论|查看更多回复|查看之前的评论|全部\d+条回复|查看\s*\d+\s*条回复)$/i;
    const buttons=page.getByRole('button',{name:names});
    for(let index=0;index<12;index++){
      const button=buttons.first();if(!await button.isVisible().catch(()=>false))break;
      await button.click({timeout:1000}).catch(()=>{});
      await page.waitForTimeout(150);
    }
    const originals=page.getByRole('button',{name:/^(See original|查看原文)(?:[（(].*[）)])?$/i});
    for(let index=0;index<12;index++){
      const button=originals.first();if(!await button.isVisible().catch(()=>false))break;
      await button.click({timeout:1000}).catch(()=>{});
      await page.waitForTimeout(150);
    }
  }
  async collect(input) {
    return this.locked(input, async key => {
      const session = this.sessions.get(key);
      if (!session?.authorized || (!session.external && this.now() - session.touched >= 3600000)) throw new ServiceError('SESSION_EXPIRED', 'Facebook 登录会话已过期，请重新登录', 409);
      if (session.bindingRevision !== input.bindingRevision) { session.authorized = false; throw new ServiceError('FACEBOOK_CONFIGURATION_CHANGED', '账号或采集网页已变更，请重新登录', 409); }
      const { page } = session; const baseUrl = normalizeFacebookWebUrl(input.baseUrl);
      const scope = input.scope || 'posts'; if (!['posts', 'comments', 'replies'].includes(scope)) throw new ServiceError('INVALID_INPUT', '采集类型无效', 400);
      const rootId = String(input.postId || ''); const commentId = String(input.commentId || '');
      if ((scope !== 'posts' || rootId) && !/^[A-Za-z0-9_]+$/.test(rootId)) throw new ServiceError('INVALID_INPUT', '帖子 ID 无效', 400);
      if (scope === 'replies' && !/^[A-Za-z0-9_]+$/.test(commentId)) throw new ServiceError('INVALID_INPUT', '评论 ID 无效', 400);
      const target = scope === 'posts' && !rootId ? baseUrl : facebookPostUrl(baseUrl,rootId,scope==='replies'?commentId:'');
      let suppliedCursor;
      if (input.cursor) { try { suppliedCursor=JSON.parse(input.cursor); } catch { throw new ServiceError('INVALID_PAGINATION','断点无效',400); } }
      const fallbackWindow=require('../../../shared/facebookMedia').facebookWindow(this.now());
      const from=new Date(input.allVisible===true ? '2004-01-01T00:00:00Z' : input.publishedFrom || suppliedCursor?.from || fallbackWindow.publishedFrom).getTime();const to=new Date(input.publishedTo || suppliedCursor?.to || fallbackWindow.publishedTo).getTime();
      if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||(input.allVisible!==true&&to-from>2*86400000))throw new ServiceError('FACEBOOK_WINDOW_INVALID','Facebook 采集时间范围无效',400);
      const identity = crypto.createHash('sha256').update(JSON.stringify([key, baseUrl, scope, rootId, commentId, from,to,input.allVisible===true])).digest('hex');
      let seen = []; let round = 0;
      if (input.cursor) {
        let cursor; try { cursor = JSON.parse(input.cursor); } catch { throw new ServiceError('INVALID_PAGINATION', '断点无效', 400); }
        if (cursor.identity !== identity || !Array.isArray(cursor.seen) || cursor.seen.length > 2000 || !Number.isInteger(cursor.round) || cursor.round < 1 || cursor.round > 50) throw new ServiceError('INVALID_PAGINATION', '断点不属于当前社区或采集网页', 400);
        seen = cursor.seen; round = cursor.round;
      }
      const continuing = session.paging?.identity === identity && session.paging.round === round && page.url() === session.paging.url;
      if (!continuing) await page.goto(target, { waitUntil: 'domcontentloaded' });
      if (await this.state(page) !== 'active') { session.authorized = false; throw new ServiceError('MANUAL_VERIFICATION_REQUIRED', 'Facebook 要求重新登录或人工验证', 409); }
      if(scope !== 'posts') await page.locator('[role="dialog"] a[href*="comment_id="]').first().waitFor({state:'visible',timeout:15000}).catch(()=>{});
      // Facebook can expose a second pfbid for the same post in its comment
      // dialog. Accept only aliases owned by the visible target post itself.
      await page.locator('[role="article"] a[href*="/posts/"],[role="article"] a[href*="comment_id="],[role="article"] a[href*="story_fbid="]').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
      const resolveRootAliases = () => scope === 'posts' ? Promise.resolve([rootId]) : page.evaluate(requested => {
        const dialog=[...document.querySelectorAll('[role="dialog"]')].find(n=>n.getClientRects().length);
        if(!dialog)return [requested];
        for(const node of dialog.querySelectorAll('[role="article"]')){
          const own=[...node.querySelectorAll('a[href]')].filter(a=>a.closest('[role="article"]')===node).map(a=>new URL(a.href)).filter(u=>/\/posts\/|story_fbid=|\/permalink\//.test(u.href)&&!u.searchParams.has('comment_id'));
          const ids=own.map(u=>u.searchParams.get('story_fbid')||u.pathname.split('/').filter(Boolean).at(-1));
          if(ids.includes(requested))return [...new Set([requested,...ids])];
        }
        return [requested];
      },rootId);
      // The navigation completes before Facebook mounts the actual feed.
      await page.locator('[role="article"] a[href*="/posts/"],[role="article"] a[href*="comment_id="],[role="article"] a[href*="story_fbid="]').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100); const known = new Set(seen); const found = new Map();
      let missingMetadata = 0; let terminal = false; let previousRows=''; let stableRounds=0; const replyParents=new Set(); const started = this.now();
      // Replay a bounded scroll window after restart. IDs, never DOM offsets,
      // drive deduplication; a bounded stop must remain partial.
      for (let scroll = 0; scroll < (continuing ? 3 : round * 3 + 3); scroll++) {
        if (this.now() - started > 25000) throw new ServiceError('FACEBOOK_REPLAY_LIMIT', '网页断点恢复超过读取时限，请缩小采集范围后重试', 409);
        await this.expandContent(page,scope);
        if(scope !== 'posts') await page.locator('[role="dialog"] a[href*="comment_id="]:visible').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
        if(!input.allVisible) await this.readAbsoluteTimes(page,scope,rootId);
        const rootAliases = await resolveRootAliases();
        let rows = await page.locator('[role="article"]').evaluateAll((nodes, args) => nodes.map(node => {
          const own = selector => Array.from(node.querySelectorAll(selector)).find(el => el.closest('[role="article"]') === node);
          if(!node.getClientRects().length)return null;
          const link = Array.from(node.querySelectorAll('a[href]')).filter(a => a.closest('[role="article"]') === node).find(a => {const u=new URL(a.href),postLink=/\/posts\/|story_fbid=|\/permalink\//.test(a.href);return args.scope === 'posts' ? postLink&&!u.searchParams.has('comment_id')&&(!args.rootId||u.pathname.split('/').filter(Boolean).at(-1)===args.rootId||u.searchParams.get('story_fbid')===args.rootId) : postLink&&(args.scope!=='comments'||args.allVisible||!u.searchParams.has('reply_comment_id'))&&/^\d+$/.test(u.searchParams.get(args.scope==='replies'?'reply_comment_id':'comment_id')||'');});
          if (!link) return null;
          const url = new URL(link.href); const parts = url.pathname.split('/').filter(Boolean);
          if(args.scope!=='posts'&&!args.rootAliases.includes(parts[parts.length-1])&&!args.rootAliases.includes(url.searchParams.get('story_fbid')))return null;
          if(args.scope==='replies'&&url.searchParams.get('comment_id')!==args.commentId)return null;
          const isReply=args.scope==='replies'||args.allVisible&&args.scope==='comments'&&url.searchParams.has('reply_comment_id');
          const id = args.scope === 'posts' ? url.searchParams.get('story_fbid') || parts[parts.length - 1] : url.searchParams.get(isReply ? 'reply_comment_id' : 'comment_id');
          const time = own('time[datetime],abbr[data-utime],[data-utime]');
          const publishedAt = time?.getAttribute('datetime') || (time?.getAttribute('data-utime') ? new Date(Number(time.getAttribute('data-utime')) * 1000).toISOString() : node.getAttribute('data-po-published-at'));
          const author = own('h2 a,h3 a') || Array.from(node.querySelectorAll('a[role="link"]')).find(a=>a.closest('[role="article"]')===node&&a.textContent.trim()&&!/\/posts\/|story_fbid=|\/permalink\//.test(a.href)&&!a.querySelector('svg,img'));
          const message = own(args.scope === 'posts' ? '[data-ad-preview="message"],[data-ad-comet-preview="message"]' : '[data-testid="UFI2Comment/body"],[data-commentid] [dir="auto"],div[dir="auto"][style*="text-align"]');
          const messageCopy=message?.cloneNode(true);messageCopy?.querySelectorAll('[role="button"],button').forEach(button=>button.remove());
          const media=[...new Set(Array.from(node.querySelectorAll('img')).filter(image=>image.closest('[role="article"]')===node && !/profile picture|avatar|emoji|icon|头像|表情|图标/i.test(image.alt||'') && !image.closest('svg') && image.width>=100 && image.height>=100 && !/profile\.php|\/user\//.test(image.closest('a')?.href||'')).map(image=>image.currentSrc||image.src).filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&['fbcdn.net','fbsbx.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}}))];
          return { externalId: id, ...(isReply?{replyParentId:url.searchParams.get('comment_id')}:{}), body: messageCopy?.textContent?.trim() || '', media, authorName: author?.textContent?.trim() || '', platformAuthorId: author?.getAttribute('data-hovercard')?.match(/id=(\d+)/)?.[1] || (author?.href ? new URL(author.href).searchParams.get('id') : null), publishedAt, sourceUrl: url.href };
        }).filter(Boolean), { scope, rootId, commentId, rootAliases, allVisible:input.allVisible===true });
        let boundary=false;
        if(scope==='posts'){
          let previous=Infinity,older=0;
          for(let index=0;index<rows.length;index++){
            const time=Date.parse(rows[index].publishedAt);
            if(!Number.isFinite(time)||time>previous)break;
            previous=time;older=time<from?older+1:0;
            if(index>=2&&Date.parse(rows[0].publishedAt)>=from&&older>=2){rows=rows.slice(0,index+1);boundary=true;break;}
          }
        }
        missingMetadata=0;
        for (const row of rows) {
          if (!row.externalId) { missingMetadata++; continue; }
          const exactTime=Boolean(row.publishedAt && Number.isFinite(Date.parse(row.publishedAt)));
          // The single-post tool has no time window. Keep real IDs and text when
          // Facebook omits timestamps; never invent dates or relax scheduled scans.
          if (!exactTime && !input.allVisible) { missingMetadata++; continue; }
          if (!exactTime) row.publishedAt = null;
          if (exactTime && (Date.parse(row.publishedAt)<from || Date.parse(row.publishedAt)>=to)) continue;
          if(!row.body&&!row.media.length&&!input.allVisible){missingMetadata++;continue;}
          if (!known.has(row.externalId)) found.set(row.externalId, row);
        }
        terminal = await page.locator(scope==='posts'?'[role="feed"],main,[role="main"]':'[role="dialog"]').evaluateAll(nodes => nodes.some(node => /^(No more posts|No more comments|No posts yet|No comments yet|You're all caught up)[.!]?$/im.test(node.innerText)));
        // An ordered non-pinned feed can stop at the requested time boundary.
        // Require two older entries after the in-window entries, not one old pinned post.
        if(boundary)terminal=true;
        if(scope!=='posts'){
          const end=await page.evaluate(()=>{
            const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
            const dialog=[...document.querySelectorAll('[role="dialog"]')].find(visible);if(!dialog)return {ready:false,parents:[]};
            const buttons=[...dialog.querySelectorAll('[role="button"],button')].filter(visible).map(n=>n.innerText.trim().replace(/\uFEFF/g,''));
            const all=buttons.some(t=>/^(All comments|所有评论)$/i.test(t));
            const more=buttons.some(t=>/^(View .*comments|查看更多评论|查看之前的评论|View .*replies|全部\d+条回复|查看\s*\d+\s*条回复)$/i.test(t));
            const loading=[...dialog.querySelectorAll('[role="progressbar"],[aria-busy="true"]')].some(visible);
            const scrollers=[...dialog.querySelectorAll('div')].filter(n=>n.scrollHeight>n.clientHeight+30&&/auto|scroll/.test(getComputedStyle(n).overflowY));
            const bottom=scrollers.length>0&&scrollers.every(n=>n.scrollTop+n.clientHeight>=n.scrollHeight-5);
            const parents=[...dialog.querySelectorAll('a[href]')].map(a=>new URL(a.href)).filter(u=>u.searchParams.has('reply_comment_id')).map(u=>u.searchParams.get('comment_id')).filter(v=>/^\d+$/.test(v||''));
            return {ready:all&&!more&&!loading&&bottom,parents};
          });
          end.parents.forEach(parent=>replyParents.add(parent));
          const signature=JSON.stringify(rows.map(r=>[r.externalId,r.publishedAt,r.body,r.media.length]));
          stableRounds=signature===previousRows?stableRounds+1:0;previousRows=signature;
          if(end.ready&&stableRounds>=1&&!missingMetadata)terminal=true;
        }
        if (found.size >= limit || terminal) break;
        await page.evaluate(() => {
          const dialog=[...document.querySelectorAll('[role="dialog"]')].find(node=>node.getClientRects().length);
          const last=dialog?.querySelector('[role="article"]:last-of-type');let scrollable=last;
          while(scrollable&&!(scrollable.scrollHeight>scrollable.clientHeight+30&&/auto|scroll/.test(getComputedStyle(scrollable).overflowY)))scrollable=scrollable.parentElement;
          if(scrollable)scrollable.scrollBy(0,Math.max(scrollable.clientHeight,800));else window.scrollBy(0,Math.max(window.innerHeight,800));
        });
        await page.waitForTimeout(600);
      }
      if (!found.size && !seen.length && scope !== 'posts' && await page.locator('[role="dialog"] a[href*="comment_id="]').count()) throw new ServiceError('FACEBOOK_PAGE_LAYOUT_UNSUPPORTED', '评论区存在可见评论但未能核对归属，不能返回空报告', 409);
      if (!found.size && !terminal) throw new ServiceError(missingMetadata ? 'FACEBOOK_CONTENT_METADATA_MISSING' : 'FACEBOOK_PAGE_LAYOUT_UNSUPPORTED', '网页未返回可验证的内容 ID、正文和发布时间，不能标记采集完成', 409);
      const items = [...found.values()].slice(0, limit).map(row => ({ ...row, contentType: scope === 'posts' ? 'post' : 'comment', ...(scope === 'posts' ? {} : { rootPlatformContentId: rootId, platformParentId: row.replyParentId || (scope === 'replies' ? commentId : rootId), contentDepth: row.replyParentId || scope === 'replies' ? 2 : 1 }) }));
      const nextSeen = [...seen, ...items.map(row => row.externalId)];
      if (round >= 50 || nextSeen.length > 2000 || Buffer.byteLength(JSON.stringify(nextSeen)) > 40000) throw new ServiceError('FACEBOOK_SCROLL_LIMIT', '达到单轮网页读取上限，本次采集未完成', 409);
      session.touched = this.now();
      session.paging = { identity, round: round + 1, url: page.url() };
      const hasMore = !terminal || found.size > limit || missingMetadata > 0;
      if (terminal && missingMetadata) throw new ServiceError('FACEBOOK_CONTENT_METADATA_MISSING', '部分内容缺少真实发布时间，不能标记采集完成', 409);
      return { items, hasMore, nextCursor: hasMore ? JSON.stringify({ identity, from, to, seen: nextSeen, round: round + 1 }) : null, ...(scope==='comments'&&!input.allVisible?{replyTargets:[...replyParents].map(parent=>({postId:rootId,commentId:parent,sortType:0}))}:{}), capability: 'authorized_scope', completeness: hasMore ? 'partial' : 'complete' };
    });
  }
}
module.exports = { FacebookBrowserAutomation, parseFacebookTimestamp, facebookPostUrl };
