const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { chromium, devices } = require('playwright');

const HOST = '127.0.0.1';
const PORT = Number(process.env.CLUB_BATCH_UI_PORT || 3777);
const BASE_ORIGIN = 'http://club.test.q1.com';
const DEFAULT_ENV_MODE = 'web';
const GAME_VERSION = '2162-CN-DEV';
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

const runtime = {
  running: false,
  stopRequested: false,
  startedAt: '',
  finishedAt: '',
  config: null,
  accounts: [],
  globalLogs: [],
  summary: {
    total: 0,
    loginSuccess: 0,
    loginFailed: 0,
    finished: 0,
    likesDone: 0,
    commentsDone: 0,
    postsDone: 0,
  },
  nextId: 1,
};

const captchaWaiters = new Map();

function normalizeEnvMode(value) {
  return value === 'wechatMiniProgram' ? 'wechatMiniProgram' : DEFAULT_ENV_MODE;
}

function buildModeUrls(envMode) {
  const mode = normalizeEnvMode(envMode);
  const query = `env=${mode}&lang=zh-CN&gameVersion=${encodeURIComponent(GAME_VERSION)}`;
  const homePath = `/?${query}`;
  const encodedHomePath = encodeURIComponent(homePath);
  const doubleEncodedHomePath = encodeURIComponent(encodedHomePath);
  return {
    envMode: mode,
    homeUrl: `${BASE_ORIGIN}${homePath}`,
    loginUrl: `${BASE_ORIGIN}/pages/user/login/index?redirect=${doubleEncodedHomePath}&back=${doubleEncodedHomePath}&${query}`,
    createPostUrl: `${BASE_ORIGIN}/pages/post/create/index?postType=0&${query}`,
  };
}

function nowTs() {
  return new Date().toISOString();
}

function nowForText() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

function logGlobal(text) {
  const row = `[${nowForText()}] ${text}`;
  runtime.globalLogs.push(row);
  if (runtime.globalLogs.length > 400) {
    runtime.globalLogs = runtime.globalLogs.slice(-400);
  }
}

function logAccount(acc, text) {
  const row = `[${nowForText()}] ${text}`;
  acc.logs.push(row);
  if (acc.logs.length > 120) {
    acc.logs = acc.logs.slice(-120);
  }
}

function sanitizeAccount(acc) {
  return {
    id: acc.id,
    username: acc.username,
    status: acc.status,
    step: acc.step,
    currentUrl: acc.currentUrl,
    error: acc.error,
    logs: acc.logs.slice(-12),
    metrics: acc.metrics,
    captcha: acc.captcha,
    startedAt: acc.startedAt,
    finishedAt: acc.finishedAt,
  };
}

function getStatePayload() {
  return {
    running: runtime.running,
    stopRequested: runtime.stopRequested,
    startedAt: runtime.startedAt,
    finishedAt: runtime.finishedAt,
    config: runtime.config
      ? {
          likeCount: runtime.config.likeCount,
          commentCount: runtime.config.commentCount,
          postCount: runtime.config.postCount,
          differentPosts: runtime.config.differentPosts,
          concurrency: runtime.config.concurrency,
          envMode: runtime.config.envMode,
        }
      : null,
    summary: runtime.summary,
    accounts: runtime.accounts.map(sanitizeAccount),
    globalLogs: runtime.globalLogs.slice(-200),
  };
}

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function text(res, code, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total > 1024 * 1024) {
      throw new Error('Request body too large');
    }
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function parseAccounts(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#'));

  const result = [];
  for (const line of lines) {
    const parts = line
      .split(/[,\t| ]+/)
      .map(v => v.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    result.push({ username: parts[0], password: parts.slice(1).join(' ') });
  }
  return result;
}

function normalizeConfig(input) {
  const accounts = parseAccounts(input.accountsText || '');
  const envMode = normalizeEnvMode(input.envMode);
  const config = {
    accounts,
    envMode,
    urls: buildModeUrls(envMode),
    likeCount: Math.max(0, Number(input.likeCount || 0) || 0),
    commentCount: Math.max(0, Number(input.commentCount || 0) || 0),
    postCount: Math.max(0, Number(input.postCount || 0) || 0),
    differentPosts: Boolean(input.differentPosts),
    concurrency: Math.max(1, Number(input.concurrency || accounts.length || 1) || 1),
    commentTemplates: String(input.commentTemplates || '')
      .split(/\r?\n/)
      .map(v => v.trim())
      .filter(Boolean),
    postTitlePrefix: String(input.postTitlePrefix || '自动化帖子').trim() || '自动化帖子',
    postBodyPrefix: String(input.postBodyPrefix || '自动化内容').trim() || '自动化内容',
    headless: input.headless !== false,
    captchaTimeoutSec: Math.max(30, Number(input.captchaTimeoutSec || 300) || 300),
  };
  if (config.accounts.length === 0) {
    throw new Error('至少输入 1 个账号（每行：账号,密码）');
  }
  config.concurrency = Math.min(config.concurrency, config.accounts.length);
  return config;
}

function resetRuntime(config) {
  runtime.running = true;
  runtime.stopRequested = false;
  runtime.startedAt = nowTs();
  runtime.finishedAt = '';
  runtime.config = {
    likeCount: config.likeCount,
    commentCount: config.commentCount,
    postCount: config.postCount,
    differentPosts: config.differentPosts,
    concurrency: config.concurrency,
    captchaTimeoutSec: config.captchaTimeoutSec,
    envMode: config.envMode,
  };
  runtime.accounts = config.accounts.map(row => ({
    id: runtime.nextId++,
    username: row.username,
    password: row.password,
    status: 'queued',
    step: '等待执行',
    currentUrl: '',
    error: '',
    logs: [],
    captcha: { needed: false, image: '' },
    metrics: {
      likesTarget: config.likeCount,
      commentsTarget: config.commentCount,
      postsTarget: config.postCount,
      likesDone: 0,
      commentsDone: 0,
      postsDone: 0,
      loginOk: false,
    },
    startedAt: '',
    finishedAt: '',
  }));
  runtime.summary = {
    total: runtime.accounts.length,
    loginSuccess: 0,
    loginFailed: 0,
    finished: 0,
    likesDone: 0,
    commentsDone: 0,
    postsDone: 0,
  };
  runtime.globalLogs = [];
}

function requestStop() {
  runtime.stopRequested = true;
  logGlobal('收到停止指令，正在等待各账号任务收尾。');
  for (const [accountId, waiter] of captchaWaiters.entries()) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error('任务已停止'));
    captchaWaiters.delete(accountId);
  }
}

async function waitForCaptchaAnswer(accountId, timeoutSec) {
  if (runtime.stopRequested) throw new Error('任务已停止');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      captchaWaiters.delete(accountId);
      reject(new Error('验证码等待超时'));
    }, timeoutSec * 1000);
    captchaWaiters.set(accountId, { resolve, reject, timer });
  });
}

function resolveCaptchaAnswer(accountId, answer) {
  const waiter = captchaWaiters.get(accountId);
  if (!waiter) return false;
  clearTimeout(waiter.timer);
  captchaWaiters.delete(accountId);
  waiter.resolve(String(answer || '').trim());
  return true;
}

function isDetailUrl(urlText) {
  return /\/pages\/post\/detail\/index/.test(urlText || '');
}

function getPostId(urlText) {
  try {
    const u = new URL(urlText);
    return u.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function isActiveClass(cls) {
  return /active|liked|selected|checked|fill/.test((cls || '').toLowerCase());
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickGoLogin(page) {
  const vp = page.viewportSize() || { width: 390, height: 844 };
  const loginLink = page.locator('text=/去登录|登录|立即登录/i').first();
  if ((await loginLink.count()) > 0 && (await loginLink.isVisible().catch(() => false))) {
    await loginLink.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    return;
  }
  await page.mouse.click(vp.width * 0.9, vp.height - 25);
  await page.waitForTimeout(1200);
}

async function collectLoginFailureHint(page, loginFrame) {
  const pattern = /(验证码|错误|失败|密码|账号|账户|异常|频繁|无效|重新|超时|安全|风控|登录)/i;
  const selectors = [
    '[class*="error"]',
    '[class*="warn"]',
    '[class*="tip"]',
    '[class*="message"]',
    '.error',
    '.tips',
    '.msg',
    '.toast',
  ];

  for (const scope of [loginFrame, page]) {
    for (const selector of selectors) {
      const nodes = scope.locator(selector);
      const total = Math.min(await nodes.count().catch(() => 0), 20);
      for (let i = 0; i < total; i += 1) {
        const node = nodes.nth(i);
        const visible = await node.isVisible().catch(() => false);
        if (!visible) continue;
        const text = ((await node.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        if (pattern.test(text)) return text;
      }
    }
  }

  const frameBodyText = ((await loginFrame.locator('body').innerText().catch(() => '')) || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (frameBodyText) {
    const match = frameBodyText.match(/(验证码[^。]{0,24}|密码[^。]{0,24}|账号[^。]{0,24}|登录[^。]{0,24}|错误[^。]{0,24}|失败[^。]{0,24})/i);
    if (match) return match[1];
  }
  return '';
}

async function openLoginPage(page, config) {
  if (page.url().includes('/pages/user/login/index')) return;
  await clickGoLogin(page);
  if (!page.url().includes('/pages/user/login/index')) {
    await page.goto(config.urls.loginUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
}

async function loginWithAccount(page, account, config) {
  account.status = 'logging_in';
  account.step = '打开站点';
  logAccount(account, '打开首页并准备登录。');
  await page.goto(config.urls.homeUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  account.currentUrl = page.url();

  await openLoginPage(page, config);
  account.currentUrl = page.url();
  account.step = '填写账号密码';

  const loginFrame =
    page.frames().find(frame => frame.url().includes('login.dev.q1.com/h5/account.html')) ||
    page.frames().find(frame => frame.url().includes('login.dev.q1.com'));
  if (!loginFrame) {
    throw new Error('未找到登录 iframe');
  }

  await loginFrame.locator('input[name="account"]').first().fill(account.username);
  await loginFrame.locator('input[name="password"]').first().fill(account.password);
  await loginFrame.locator('button').first().click();
  await page.waitForTimeout(6000);

  if (!page.url().includes('/pages/user/login/index')) {
    account.currentUrl = page.url();
    account.metrics.loginOk = true;
    account.step = '登录成功';
    logAccount(account, '登录成功。');
    return;
  }

  const captchaLocator = loginFrame.locator('#imgageCaptcha').first();
  if ((await captchaLocator.count()) === 0) {
    const hint = await collectLoginFailureHint(page, loginFrame);
    throw new Error(`登录失败，且未出现验证码输入框${hint ? `: ${hint}` : ''}`);
  }

  const captchaBuffer = await captchaLocator.screenshot();
  account.captcha = {
    needed: true,
    image: `data:image/png;base64,${captchaBuffer.toString('base64')}`,
  };
  account.status = 'waiting_captcha';
  account.step = '等待验证码';
  logAccount(account, '需要验证码，等待界面输入。');

  const answer = await waitForCaptchaAnswer(account.id, config.captchaTimeoutSec);
  if (!answer) {
    throw new Error('未收到验证码');
  }

  account.captcha = { needed: false, image: '' };
  account.status = 'logging_in';
  account.step = '提交验证码';
  await loginFrame.locator('#verifyImageCode').first().fill(answer);
  await loginFrame.locator('button').first().click();
  await page.waitForTimeout(9000);

  if (page.url().includes('/pages/user/login/index')) {
    const hint = await collectLoginFailureHint(page, loginFrame);
    throw new Error(`验证码提交后仍停留在登录页${hint ? `: ${hint}` : ''}`);
  }

  account.currentUrl = page.url();
  account.metrics.loginOk = true;
  account.step = '登录成功';
  logAccount(account, '验证码通过，登录成功。');
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
    });
  }
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  return rows;
}

async function backToHome(page, config) {
  if (page.url().startsWith(config.urls.homeUrl)) return;
  if (isDetailUrl(page.url())) {
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(async () => {
      await page.goto(config.urls.homeUrl, { waitUntil: 'load', timeout: 30000 });
    });
    await page.waitForTimeout(2500);
    return;
  }
  await page.goto(config.urls.homeUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function openNextPostDetail(page, workState, requireDifferentPost, config) {
  await backToHome(page, config);
  for (let pass = 0; pass < 12; pass += 1) {
    const icons = await collectVisibleCommentIcons(page);
    for (const icon of icons) {
      const key = `${icon.x}|${icon.y}|${icon.index}|${icon.text}`;
      if (workState.seenEntryKeys.has(key)) continue;
      workState.seenEntryKeys.add(key);

      const loc = page.locator('[class*="comment-tip"]').nth(icon.index);
      await loc.click({ force: true }).catch(async () => {
        await page.mouse.click(icon.cx, icon.cy);
      });
      await page.waitForTimeout(3800);
      const currentUrl = page.url();
      if (!isDetailUrl(currentUrl)) {
        continue;
      }
      const postId = getPostId(currentUrl);
      if (!postId) {
        await backToHome(page, config);
        continue;
      }
      if (requireDifferentPost && workState.usedPostIds.has(postId)) {
        await backToHome(page, config);
        continue;
      }
      return { postId, currentUrl };
    }
    await page.mouse.wheel(0, 540);
    await page.waitForTimeout(1200);
  }
  return null;
}

async function clickDetailLike(page) {
  const selectors = [
    '.post-detail-footer [class*="comment-thumbs-up"]',
    '.post-detail-footer [class*="thumbs-up"]',
    '.post-detail-footer [class*="thumb"]',
    '[class*="comment-thumbs-up"]',
    '[class*="thumbs-up"]',
    '[class*="thumb"]',
  ];
  for (const selector of selectors) {
    const nodes = page.locator(selector);
    const total = await nodes.count();
    for (let i = 0; i < total; i += 1) {
      const el = nodes.nth(i);
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const cls = (await el.getAttribute('class').catch(() => '')) || '';
      if (isActiveClass(cls)) continue;
      const box = await el.boundingBox().catch(() => null);
      if (!box) continue;
      if (box.y < 120) continue;
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }

  const vp = page.viewportSize() || { width: 390, height: 844 };
  await page.mouse.click(vp.width / 2, vp.height - 22);
  await page.waitForTimeout(800);
  return true;
}

async function waitForCommentApi(page, timeoutMs = 6000) {
  const resp = await page
    .waitForResponse(
      item => {
        const u = item.url();
        return /\/api\/club\/v1\/auth\/comment\/\d+/.test(u) && item.request().method() === 'POST';
      },
      { timeout: timeoutMs }
    )
    .catch(() => null);
  if (!resp) return null;
  const body = await resp.text().catch(() => '');
  return { status: resp.status(), url: resp.url(), body };
}

async function commentOnDetail(page, textValue) {
  const inputTip = page.locator('.input-tip').first();
  if ((await inputTip.count()) === 0) return false;
  await inputTip.click({ force: true }).catch(() => {});
  await page.waitForTimeout(900);

  const editor = page.locator('.comment-input .ql-editor').first();
  if ((await editor.count()) === 0) return false;
  await editor.click({ force: true }).catch(() => {});
  await editor.fill(textValue);
  await page.waitForTimeout(500);

  const apiPromise = waitForCommentApi(page, 7000);
  const publishByText = page.locator('.comment-input').getByText(/发布|publish/i).first();
  const publishByClass = page.locator('.comment-input [class*="publish"]').first();
  let clicked = false;
  if ((await publishByText.count()) > 0) {
    await publishByText.click({ force: true }).catch(() => {});
    clicked = true;
  } else if ((await publishByClass.count()) > 0) {
    await publishByClass.click({ force: true }).catch(() => {});
    clicked = true;
  }
  if (!clicked) return false;
  await page.waitForTimeout(2200);
  const api = await apiPromise;
  if (!api) return true;
  return api.status === 200 && /"code"\s*:\s*0/.test(api.body);
}

function makeCommentText(config, account, index) {
  if (config.commentTemplates.length > 0) {
    const tpl = config.commentTemplates[index % config.commentTemplates.length];
    return `${tpl} [${account.username}] ${nowForText()}`;
  }
  return `自动化评论 [${account.username}] ${nowForText()}`;
}

function makePostTitle(config, account, index) {
  return `${config.postTitlePrefix} ${account.username} #${index + 1}`;
}

function makePostBody(config, account, index) {
  return `${config.postBodyPrefix}\n账号: ${account.username}\n序号: ${index + 1}\n时间: ${nowForText()}`;
}

async function waitForPostApi(page, timeoutMs = 10000) {
  const resp = await page
    .waitForResponse(
      item => {
        const u = item.url();
        return /\/api\/club\/v1\/auth\/post\?boardId=/.test(u) && item.request().method() === 'POST';
      },
      { timeout: timeoutMs }
    )
    .catch(() => null);
  if (!resp) return null;
  const body = await resp.text().catch(() => '');
  return { status: resp.status(), url: resp.url(), body };
}

async function createPost(page, title, body, config) {
  await page.goto(config.urls.createPostUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4500);

  const titleInput = page.locator('.title-container textarea, textarea.uni-textarea-textarea').first();
  await titleInput.click({ force: true }).catch(() => {});
  await titleInput.fill(title).catch(async () => {
    await page.keyboard.type(title);
  });
  await page.waitForTimeout(400);

  const editor = page.locator('.ql-editor').first();
  await editor.click({ force: true }).catch(() => {});
  await editor.fill(body);
  await page.waitForTimeout(400);

  const apiPromise = waitForPostApi(page, 12000);
  const publishBtn = page.locator('.right-panel').getByText('发布', { exact: true }).first();
  if ((await publishBtn.count()) > 0) {
    await publishBtn.click({ force: true }).catch(() => {});
  } else {
    await page.getByText('发布', { exact: true }).first().click({ force: true }).catch(() => {});
  }

  await page.waitForTimeout(900);
  const immediate = page.getByText('立即发布', { exact: true }).first();
  if ((await immediate.count()) > 0 && (await immediate.isVisible().catch(() => false))) {
    await immediate.click({ force: true }).catch(() => {});
  }

  const api = await apiPromise;
  await page.waitForTimeout(2800);
  const postIdFromUrl = getPostId(page.url());
  const okByUrl = isDetailUrl(page.url()) && Boolean(postIdFromUrl);
  const okByApi = Boolean(api && api.status === 200 && /"code"\s*:\s*0/.test(api.body));
  let postId = postIdFromUrl;
  if (!postId && api) {
    const match = api.body.match(/"data"\s*:\s*(\d+)/);
    if (match) postId = match[1];
  }
  return {
    ok: okByUrl || okByApi,
    postId: postId || '',
    url: page.url(),
  };
}

async function doLikes(page, account, config, workState) {
  for (let i = 0; i < config.likeCount; i += 1) {
    if (runtime.stopRequested) break;
    account.step = `点赞 ${i + 1}/${config.likeCount}`;
    const picked = await openNextPostDetail(page, workState, config.differentPosts, config);
    if (!picked) {
      logAccount(account, `点赞结束：找不到可用帖子（完成 ${account.metrics.likesDone}/${config.likeCount}）。`);
      break;
    }
    account.currentUrl = picked.currentUrl;
    const ok = await clickDetailLike(page);
    if (ok) {
      account.metrics.likesDone += 1;
      workState.usedPostIds.add(picked.postId);
      logAccount(account, `点赞成功：postId=${picked.postId}。`);
    } else {
      logAccount(account, `点赞失败：postId=${picked.postId}。`);
    }
  }
}

async function doComments(page, account, config, workState) {
  for (let i = 0; i < config.commentCount; i += 1) {
    if (runtime.stopRequested) break;
    account.step = `评论 ${i + 1}/${config.commentCount}`;
    const picked = await openNextPostDetail(page, workState, config.differentPosts, config);
    if (!picked) {
      logAccount(account, `评论结束：找不到可用帖子（完成 ${account.metrics.commentsDone}/${config.commentCount}）。`);
      break;
    }
    account.currentUrl = picked.currentUrl;
    const textValue = makeCommentText(config, account, i);
    const ok = await commentOnDetail(page, textValue);
    if (ok) {
      account.metrics.commentsDone += 1;
      workState.usedPostIds.add(picked.postId);
      logAccount(account, `评论成功：postId=${picked.postId}。`);
    } else {
      logAccount(account, `评论失败：postId=${picked.postId}。`);
    }
  }
}

async function doPosts(page, account, config) {
  for (let i = 0; i < config.postCount; i += 1) {
    if (runtime.stopRequested) break;
    account.step = `发帖 ${i + 1}/${config.postCount}`;
    const title = makePostTitle(config, account, i);
    const body = makePostBody(config, account, i);
    const created = await createPost(page, title, body, config);
    account.currentUrl = created.url;
    if (created.ok) {
      account.metrics.postsDone += 1;
      logAccount(account, `发帖成功：postId=${created.postId || 'unknown'}。`);
    } else {
      logAccount(account, '发帖失败：未确认成功返回。');
    }
  }
}

function recalcSummary() {
  runtime.summary.loginSuccess = runtime.accounts.filter(a => a.metrics.loginOk).length;
  runtime.summary.loginFailed = runtime.accounts.filter(a => !a.metrics.loginOk && a.status === 'failed').length;
  runtime.summary.finished = runtime.accounts.filter(a => ['done', 'failed', 'stopped'].includes(a.status)).length;
  runtime.summary.likesDone = runtime.accounts.reduce((n, a) => n + a.metrics.likesDone, 0);
  runtime.summary.commentsDone = runtime.accounts.reduce((n, a) => n + a.metrics.commentsDone, 0);
  runtime.summary.postsDone = runtime.accounts.reduce((n, a) => n + a.metrics.postsDone, 0);
}

async function runOneAccount(account, config) {
  account.status = 'running';
  account.startedAt = nowTs();
  logAccount(account, '任务开始。');

  let browser;
  let context;
  let page;
  const workState = {
    seenEntryKeys: new Set(),
    usedPostIds: new Set(),
  };

  try {
    browser = await chromium.launch({ headless: config.headless });
    context = await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'zh-CN',
    });
    page = await context.newPage();

    await loginWithAccount(page, account, config);
    recalcSummary();
    if (runtime.stopRequested) {
      throw new Error('任务已停止');
    }

    account.status = 'running';
    account.step = '执行互动任务';

    await doLikes(page, account, config, workState);
    await doComments(page, account, config, workState);
    await doPosts(page, account, config);

    if (runtime.stopRequested) {
      account.status = 'stopped';
      account.step = '已停止';
      logAccount(account, '收到停止指令，已结束。');
    } else {
      account.status = 'done';
      account.step = '完成';
      logAccount(account, '任务完成。');
    }
  } catch (error) {
    const message = String(error && (error.message || error.stack) ? error.message || error.stack : error);
    if (runtime.stopRequested && /任务已停止/.test(message)) {
      account.status = 'stopped';
      account.step = '已停止';
      logAccount(account, '停止执行。');
    } else {
      account.status = 'failed';
      account.step = '失败';
      account.error = message;
      logAccount(account, `失败：${message}`);
    }
  } finally {
    account.captcha = { needed: false, image: '' };
    if (page) account.currentUrl = page.url();
    account.finishedAt = nowTs();
    recalcSummary();
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: limit }, () =>
    (async () => {
      while (cursor < items.length) {
        if (runtime.stopRequested) break;
        const idx = cursor;
        cursor += 1;
        await worker(items[idx], idx);
      }
    })()
  );
  await Promise.all(workers);
}

async function startJob(configInput) {
  const config = configInput.accounts ? configInput : normalizeConfig(configInput);
  resetRuntime(config);

  logGlobal(
    `开始执行：账号 ${config.accounts.length} 个，并发 ${config.concurrency}，模式 ${config.envMode}，点赞 ${config.likeCount}，评论 ${config.commentCount}，发帖 ${config.postCount}。`
  );

  try {
    await runWithConcurrency(runtime.accounts, config.concurrency, async account => {
      if (runtime.stopRequested) {
        account.status = 'stopped';
        account.step = '已停止';
        return;
      }
      await runOneAccount(account, config);
    });
  } finally {
    runtime.running = false;
    runtime.finishedAt = nowTs();
    recalcSummary();
    if (runtime.stopRequested) {
      logGlobal('批量任务已停止。');
    } else {
      logGlobal('批量任务已完成。');
    }
  }
}

function serveIndex(res) {
  if (!fs.existsSync(INDEX_HTML_PATH)) {
    text(res, 500, 'index.html not found');
    return;
  }
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  text(res, 200, html, 'text/html; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
    const pathname = url.pathname;

    if (method === 'GET' && pathname === '/') {
      serveIndex(res);
      return;
    }
    if (method === 'GET' && pathname === '/api/state') {
      json(res, 200, getStatePayload());
      return;
    }
    if (method === 'POST' && pathname === '/api/start') {
      if (runtime.running) {
        json(res, 409, { ok: false, message: '当前任务仍在运行，请先停止。' });
        return;
      }
      const body = await readJsonBody(req);
      try {
        const config = normalizeConfig(body);
        void startJob(config).catch(error => {
          runtime.running = false;
          runtime.finishedAt = nowTs();
          logGlobal(`任务异常中断：${String(error.message || error)}`);
        });
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 400, { ok: false, message: String(error.message || error) });
      }
      return;
    }
    if (method === 'POST' && pathname === '/api/stop') {
      if (runtime.running) {
        requestStop();
      }
      json(res, 200, { ok: true });
      return;
    }
    if (method === 'POST' && pathname === '/api/captcha') {
      const body = await readJsonBody(req);
      const accountId = Number(body.accountId || 0);
      const answer = String(body.answer || '').trim();
      if (!accountId || !answer) {
        json(res, 400, { ok: false, message: 'accountId 和 answer 必填' });
        return;
      }
      const ok = resolveCaptchaAnswer(accountId, answer);
      json(res, 200, { ok, message: ok ? '已提交' : '当前账号不在等待验证码状态' });
      return;
    }

    text(res, 404, 'Not Found');
  } catch (error) {
    json(res, 500, { ok: false, message: String(error.message || error) });
  }
});

function openBrowser(url) {
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === 'darwin') {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`[club-batch-ui] running at ${url}`);
  logGlobal(`界面已启动：${url}`);
  openBrowser(url);
});
