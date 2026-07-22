const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { analyzePageImages, formatImageInsights } = require('./communityImageAnalysis');
const settings = require('./communitySyncSettings');
const { CommunitySyncCancelledError } = require('./communityCrawler');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0';

function isQ1CommunityUrl(value) {
  try {
    return new URL(value).host === 'club.q1.com';
  } catch {
    return false;
  }
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new CommunitySyncCancelledError();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function abortableSleep(ms, signal) {
  if (!ms || ms <= 0) {
    throwIfCancelled(signal);
    return;
  }
  throwIfCancelled(signal);
  await sleep(ms);
  throwIfCancelled(signal);
}

function parseJsonp(text) {
  const match = String(text || '').match(/\((\{.*\})\)\s*$/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function buildQ1Context(baseUrl, loginUrl) {
  const source = new URL(loginUrl || baseUrl);
  const env = source.searchParams.get('env') || 'web';
  const gameId = source.searchParams.get('gameId') || '2131';
  const gameVersion = source.searchParams.get('gameVersion') || '2131-CN-ZS';
  const lang = source.searchParams.get('lang') || 'zh-CN';
  const rootUrl = `https://club.q1.com/?lang=${encodeURIComponent(lang)}&env=${encodeURIComponent(env)}&gameId=${encodeURIComponent(gameId)}&gameVersion=${encodeURIComponent(gameVersion)}`;
  if (loginUrl) {
    return { env, gameId, gameVersion, lang, rootUrl, loginShellUrl: loginUrl };
  }

  const redirect = encodeURIComponent(encodeURIComponent(`/?lang=${lang}`));
  const params = new URLSearchParams({
    redirect,
    back: redirect,
    env,
    gameId,
    gameVersion,
    lang,
  });
  return {
    env,
    gameId,
    gameVersion,
    lang,
    rootUrl,
    loginShellUrl: `https://club.q1.com/pages/user/login/index?${params.toString()}`,
  };
}

function hasBrowserProfile(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  const markers = ['Local State', 'Default', 'Network', 'Cookies', 'Preferences'];
  return markers.some(marker => fs.existsSync(path.join(dir, marker)));
}

function buildDedicatedProfileDir(options, q1) {
  return path.resolve(
    __dirname,
    '../../../.temp/community-sync-browser/q1',
    `${q1.gameVersion || 'default'}-v${options.versionId || 'default'}`
  );
}

function resolveProfileCandidates(options, q1) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (dir, profileName, allowLogin) => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push({ dir: resolved, profileName, allowLogin });
  };

  if (options.q1ProfileDir) {
    const provided = path.resolve(options.q1ProfileDir);
    if (hasBrowserProfile(provided)) {
      addCandidate(provided, 'configured-profile', true);
    } else {
      addCandidate(path.join(provided, `version-${options.versionId || 'default'}`), 'configured-version-profile', true);
    }
    return candidates;
  }

  const reusableProfiles = [
    path.resolve(__dirname, '../../../.temp/chrome-community-sync-profile'),
    path.resolve(__dirname, '../../../.temp/chrome-community-debug'),
    path.resolve(__dirname, '../../../.temp/chrome-community-sync-shot'),
  ];
  for (const dir of reusableProfiles) {
    if (hasBrowserProfile(dir)) addCandidate(dir, path.basename(dir), false);
  }

  addCandidate(buildDedicatedProfileDir(options, q1), 'dedicated-q1-profile', true);
  return candidates;
}

async function launchContext(profileDir, options) {
  fs.mkdirSync(profileDir, { recursive: true });
  const attempts = [];
  if (options.browserExecutablePath) attempts.push({ executablePath: options.browserExecutablePath });
  if (options.browserChannel) attempts.push({ channel: options.browserChannel });
  attempts.push({ channel: 'msedge' });
  attempts.push({ channel: 'chrome' });
  attempts.push({});

  let lastError;
  for (const item of attempts) {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        headless: options.browserHeadless !== false,
        viewport: { width: 1440, height: 900 },
        userAgent: BROWSER_UA,
        ...item,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Unable to launch browser for Q1 sync: ${lastError?.message || 'unknown error'}`);
}

async function readQ1Token(page) {
  const tokens = await page.evaluate(() => {
    const results = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.includes('@token')) continue;
      results.push({
        key,
        value: localStorage.getItem(key),
      });
    }
    return results;
  });
  return tokens.find(item => String(item.value || '').startsWith('Bearer ')) || null;
}

async function fetchJson(url, { headers, signal, timeoutMs = 15000 } = {}) {
  throwIfCancelled(signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortHandler = () => controller.abort();

  try {
    signal?.addEventListener('abort', abortHandler, { once: true });
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Q1 API HTTP ${res.status}: ${url}`);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Q1 API returned invalid JSON: ${url}`);
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortHandler);
  }
}

function buildApiHeaders(token, q1, options) {
  return {
    authorization: token,
    'content-language': q1.lang,
    referer: q1.rootUrl,
    'user-agent': options.userAgent || BROWSER_UA,
  };
}

function isUnlimitedMaxPages(value) {
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed <= 0;
}

function looksLikeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return /^https?:$/.test(url.protocol);
  } catch {
    return false;
  }
}

function isLoggedInContext(payload) {
  const accountId = Number(payload?.data?.account?.id);
  return Number.isFinite(accountId) && accountId > 0;
}

function isCaptchaMessage(message) {
  const text = String(message || '');
  return ['验证码', '驗證碼', 'captcha', 'verify code'].some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
}

async function trySessionFromProfile(candidate, q1, options) {
  const context = await launchContext(candidate.dir, options);
  const page = context.pages()[0] || await context.newPage();

  try {
    throwIfCancelled(options.signal);
    await page.goto(q1.rootUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.requestTimeoutMs || 30000,
    });
    await abortableSleep(2000, options.signal);

    const tokenInfo = await readQ1Token(page);
    if (!tokenInfo?.value) return null;

    const payload = await fetchJson('https://club.q1.com/api/club/v1/auth/user/context', {
      headers: buildApiHeaders(tokenInfo.value, q1, options),
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs,
    }).catch(() => null);

    if (!isLoggedInContext(payload)) return null;

    await settings.resetLoginFailures(options.versionId);
    return {
      q1,
      token: tokenInfo.value,
      headers: buildApiHeaders(tokenInfo.value, q1, options),
      profileDir: candidate.dir,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function loginWithPassword(candidate, q1, options) {
  const guard = await settings.getLoginGuard(options.versionId);
  if (guard.blockedUntil && new Date(guard.blockedUntil).getTime() > Date.now()) {
    throw new Error(`Q1 登录已被临时锁定，请在 ${new Date(guard.blockedUntil).toLocaleString('zh-CN')} 后重试`);
  }
  if (!options.username || !options.password) {
    throw new Error('Q1 登录态已失效，请填写账号密码，或先在服务器浏览器中完成一次登录');
  }

  const context = await launchContext(candidate.dir, options);
  const page = context.pages()[0] || await context.newPage();
  let loginResult = null;

  const responseHandler = async response => {
    const url = response.url();
    if (!url.includes('MobileUserLogOn2')) return;
    try {
      loginResult = parseJsonp(await response.text());
    } catch {
      loginResult = null;
    }
  };

  try {
    page.on('response', responseHandler);
    await page.goto(q1.loginShellUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.requestTimeoutMs || 30000,
    });

    const iframe = await page.waitForSelector('iframe[src*="login1.q1.com"]', {
      timeout: options.requestTimeoutMs || 30000,
    });
    const frame = await iframe.contentFrame();
    if (!frame) throw new Error('Q1 login iframe is not available');

    const account = frame.locator('input.weui-input--account');
    const password = frame.locator('input[name="password"]');
    await account.click();
    await account.fill('');
    await account.type(options.username, { delay: 50 });
    await password.click();
    await password.fill('');
    await password.type(options.password, { delay: 50 });
    await password.press('Tab');
    await abortableSleep(800, options.signal);
    await frame.locator('button.submit-btn').click({ force: true });

    const deadline = Date.now() + Math.max(options.requestTimeoutMs || 30000, 30000);
    while (!loginResult && Date.now() < deadline) {
      await abortableSleep(300, options.signal);
    }

    if (loginResult?.e && Number(loginResult.e) < 0) {
      const message = loginResult.m || 'Q1 login failed';
      await settings.recordLoginFailure(options.versionId, message, {
        threshold: options.q1LoginBlockThreshold,
        blockMinutes: options.q1LoginBlockMinutes,
      });
      if (isCaptchaMessage(message)) {
        throw new Error(`Q1 登录需要验证码，已暂停自动重试。请先手动在服务器浏览器登录一次，或等待风控解除后再试。原始提示：${message}`);
      }
      throw new Error(`Q1 登录失败：${message}`);
    }

    await page.waitForURL(/club\.q1\.com\/(\?|$)/, {
      timeout: Math.max(options.requestTimeoutMs || 30000, 30000),
      waitUntil: 'domcontentloaded',
    });
    await abortableSleep(2500, options.signal);

    const tokenInfo = await readQ1Token(page);
    if (!tokenInfo?.value) {
      await settings.recordLoginFailure(options.versionId, '登录成功后未获取到 token', {
        threshold: options.q1LoginBlockThreshold,
        blockMinutes: options.q1LoginBlockMinutes,
      });
      throw new Error('登录成功后未获取到 token');
    }

    const payload = await fetchJson('https://club.q1.com/api/club/v1/auth/user/context', {
      headers: buildApiHeaders(tokenInfo.value, q1, options),
      signal: options.signal,
      timeoutMs: options.requestTimeoutMs,
    });
    if (!isLoggedInContext(payload)) {
      await settings.recordLoginFailure(options.versionId, '登录后仍然是游客态', {
        threshold: options.q1LoginBlockThreshold,
        blockMinutes: options.q1LoginBlockMinutes,
      });
      throw new Error('登录后仍然是游客态，请确认账号密码或站点风控状态');
    }

    await settings.resetLoginFailures(options.versionId);
    return {
      q1,
      token: tokenInfo.value,
      headers: buildApiHeaders(tokenInfo.value, q1, options),
      profileDir: candidate.dir,
    };
  } finally {
    page.removeListener('response', responseHandler);
    await context.close().catch(() => {});
  }
}

async function authenticateQ1(options) {
  const q1 = buildQ1Context(options.baseUrl, options.loginUrl);
  const candidates = resolveProfileCandidates(options, q1);

  for (const candidate of candidates) {
    const session = await trySessionFromProfile(candidate, q1, options);
    if (session) return session;
  }

  for (const candidate of candidates) {
    if (!candidate.allowLogin) continue;
    return loginWithPassword(candidate, q1, options);
  }

  throw new Error('Q1 登录态已失效，请先在服务器浏览器中登录社区一次，或配置有效的 Cookie / Token');
}

function normalizeBlock(item) {
  if (!item) return '';
  const text = String(item.data || '').replace(/\u00a0/g, ' ').trim();
  if (item.type === 0) return text;
  if (item.type === 1 && looksLikeUrl(text)) return '[图片]';
  if (item.type === 2 && looksLikeUrl(text)) return '[视频]';
  if (item.type === 1) return text ? `[图片] ${text}` : '[图片]';
  if (item.type === 2) return text ? `[视频] ${text}` : '[视频]';
  return text ? `[类型${item.type}] ${text}` : '';
}

function normalizeRichContent(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeBlock)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function collectUrlsDeep(node, out, depth = 0) {
  if (!node || depth > 4) return;
  if (typeof node === 'string') {
    if (looksLikeUrl(node)) out.push(node.trim());
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectUrlsDeep(item, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (/(?:url|src|image|cover|origin|thumb)/i.test(key) && looksLikeUrl(value)) {
        out.push(value.trim());
      }
      continue;
    }
    if (value && typeof value === 'object') collectUrlsDeep(value, out, depth + 1);
  }
}

function collectImageUrlsFromRichContent(items) {
  const urls = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.type !== 1) continue;
    if (looksLikeUrl(item.data)) urls.push(String(item.data).trim());
    collectUrlsDeep(item, urls);
  }
  return [...new Set(urls)];
}

function pickPostTitle(post) {
  const title = String(post?.title || '').trim();
  if (title) return title;
  const content = normalizeRichContent(post?.content);
  return content.split('\n').find(Boolean)?.slice(0, 80) || `帖子 #${post?.id || ''}`.trim();
}

function pickUserName(user) {
  return user?.personality?.nickName || user?.account?.name || '匿名用户';
}

function mapReply(reply) {
  return {
    id: reply?.id || '',
    authorName: pickUserName(reply?.user),
    replyTo: reply?.targetInfo?.personality?.nickName || reply?.targetInfo?.account?.name || '',
    createdAt: reply?.createTime || '',
    content: normalizeRichContent(reply?.content),
  };
}

function mapComment(comment) {
  return {
    id: comment?.id || '',
    authorName: pickUserName(comment?.user),
    createdAt: comment?.createTime || '',
    content: normalizeRichContent(comment?.content),
    replies: (Array.isArray(comment?.replies) ? comment.replies : []).map(mapReply),
  };
}

function buildPostUrl(q1, postId) {
  return `https://club.q1.com/pages/post/detail/index?id=${encodeURIComponent(postId)}&env=${encodeURIComponent(q1.env)}&gameId=${encodeURIComponent(q1.gameId)}&gameVersion=${encodeURIComponent(q1.gameVersion)}&lang=${encodeURIComponent(q1.lang)}`;
}

function formatComment(comment, indent = '') {
  const user = comment?.user?.personality?.nickName || comment?.user?.account?.name || '匿名用户';
  const body = normalizeRichContent(comment?.content);
  const lines = [];

  lines.push(`${indent}${user} @ ${comment?.createTime || ''}`);
  if (body) lines.push(`${indent}${body}`);

  const replies = Array.isArray(comment?.replies) ? comment.replies : [];
  for (const reply of replies) {
    const replyUser = reply?.user?.personality?.nickName || reply?.user?.account?.name || '匿名用户';
    const replyBody = normalizeRichContent(reply?.content);
    const target = reply?.targetInfo?.personality?.nickName || reply?.targetInfo?.account?.name || '';
    lines.push(`${indent}  -> ${replyUser}${target ? ` 回复 ${target}` : ''} @ ${reply?.createTime || ''}`);
    if (replyBody) lines.push(`${indent}  ${replyBody}`);
  }

  return lines.join('\n').trim();
}

class Q1CommunityCrawler {
  constructor(options = {}) {
    this.options = options;
    this.postPageSize = Math.min(Math.max(parseInt(options.q1PostPageSize, 10) || 20, 1), 50);
    this.commentPageSize = Math.min(Math.max(parseInt(options.q1CommentPageSize, 10) || 50, 1), 100);
    this.session = null;
    this.knownPageUrls = new Set(
      (Array.isArray(options.existingPageUrls) ? options.existingPageUrls : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    );
  }

  async apiGet(pathname, searchParams) {
    const query = new URLSearchParams(searchParams || {});
    const url = `https://club.q1.com${pathname}${query.toString() ? `?${query.toString()}` : ''}`;
    return fetchJson(url, {
      headers: this.session.headers,
      signal: this.options.signal,
      timeoutMs: this.options.requestTimeoutMs,
    });
  }

  async fetchBoards() {
    const payload = await this.apiGet('/api/club/v1/auth/user/context');
    const boards = Array.isArray(payload?.data?.boards) ? payload.data.boards : [];
    return boards
      .map(board => ({
        id: board.id,
        name: board.name || `板块 ${board.id}`,
      }))
      .filter(board => Number.isFinite(Number(board.id)));
  }

  async fetchPostList(boardId, pageIndex) {
    const payload = await this.apiGet('/api/club/v1/auth/post/model/merged-list', {
      counter: 0,
      boardId,
      pageIndex,
      pageSize: this.postPageSize,
      dataLength: 0,
      offsetId: 0,
      resetData: 'true',
      offset: 0,
    });
    return Array.isArray(payload?.data) ? payload.data : [];
  }

  async fetchPostDetail(postId) {
    const payload = await this.apiGet('/api/club/v1/auth/post/', {
      postId,
      source: 0,
    });
    return payload?.data || null;
  }

  async fetchComments(postId) {
    const all = [];
    let offsetId = 0;

    for (;;) {
      throwIfCancelled(this.options.signal);
      const payload = await this.apiGet(`/api/club/v1/auth/comment/${postId}`, {
        offsetId,
        pageSize: this.commentPageSize,
        postId,
        commentId: '',
        sortType: 0,
      });
      const batch = Array.isArray(payload?.data) ? payload.data : [];
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < this.commentPageSize) break;

      const lastId = batch[batch.length - 1]?.id;
      if (!lastId || lastId === offsetId) break;
      offsetId = lastId;
      await abortableSleep(this.options.delayMs, this.options.signal);
    }

    return all;
  }

  async buildImageInsights(imageUrls) {
    return analyzePageImages({
      versionId: this.options.versionId,
      imageUrls,
      maxImagesPerPage: this.options.maxImageAnalysesPerPage,
      signal: this.options.signal,
      fetchImage: async imageUrl => {
        const res = await fetch(imageUrl, {
          headers: {
            ...this.session.headers,
            accept: 'image/*,*/*;q=0.8',
          },
          signal: this.options.signal,
        });
        if (!res.ok) throw new Error(`Q1 image HTTP ${res.status}: ${imageUrl}`);
        return {
          url: res.url || imageUrl,
          buffer: Buffer.from(await res.arrayBuffer()),
          mimeType: res.headers.get('content-type') || '',
        };
      },
    });
  }

  async buildPage(board, post, comments) {
    const postText = normalizeRichContent(post?.content);
    const author = pickUserName(post?.user);
    const commentText = comments.map(comment => formatComment(comment)).filter(Boolean).join('\n\n');
    const imageUrls = [
      ...collectImageUrlsFromRichContent(post?.content),
      ...comments.flatMap(comment => [
        ...collectImageUrlsFromRichContent(comment?.content),
        ...(Array.isArray(comment?.replies)
          ? comment.replies.flatMap(reply => collectImageUrlsFromRichContent(reply?.content))
          : []),
      ]),
    ];
    const imageInsights = await this.buildImageInsights(imageUrls);
    const imageSupplement = formatImageInsights(imageInsights);
    const content = [
      `\u677f\u5757\uff1a${board.name}`,
      `\u4f5c\u8005\uff1a${author}`,
      post?.createTime ? `\u53d1\u5e03\u65f6\u95f4\uff1a${post.createTime}` : '',
      '',
      '\u5e16\u5b50\u6b63\u6587\uff1a',
      postText || '(\u65e0\u6b63\u6587)',
      '',
      '\u8bc4\u8bba\uff1a',
      commentText || '(\u65e0\u8bc4\u8bba)',
    ].filter(Boolean).join('\n');
    const contentWithImages = imageSupplement
      ? `${content}\n\n${imageSupplement}`
      : content;

    return {
      url: buildPostUrl(this.session.q1, post.id),
      title: pickPostTitle(post),
      content: contentWithImages,
      rawContent: contentWithImages,
      thread: {
        type: 'q1_post',
        board: {
          id: board.id,
          name: board.name || '',
        },
        post: {
          id: post?.id || '',
          title: pickPostTitle(post),
          authorName: author,
          createdAt: post?.createTime || '',
          content: postText || '',
        },
        comments: comments.map(mapComment),
        imageInsights,
      },
    };
  }

  async crawl() {
    this.session = await authenticateQ1(this.options);
    const boards = await this.fetchBoards();
    const pages = [];
    const seen = new Set();
    let processedCount = 0;
    const unlimitedMaxPages = isUnlimitedMaxPages(this.options.maxPages);

    for (const board of boards) {
      let pageIndex = 1;
      while (unlimitedMaxPages || pages.length < this.options.maxPages) {
        throwIfCancelled(this.options.signal);
        const posts = await this.fetchPostList(board.id, pageIndex);
        if (!posts.length) break;

        for (const item of posts) {
          throwIfCancelled(this.options.signal);
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          const postUrl = buildPostUrl(this.session.q1, item.id);
          if (this.knownPageUrls.has(postUrl)) {
            await abortableSleep(this.options.delayMs, this.options.signal);
            continue;
          }

          const detail = await this.fetchPostDetail(item.id).catch(() => item);
          await abortableSleep(this.options.delayMs, this.options.signal);
          const comments = await this.fetchComments(item.id).catch(() => []);
          processedCount += 1;

          const pageData = await this.buildPage(board, detail || item, comments);
          if (this.knownPageUrls.has(pageData.url)) {
            await abortableSleep(this.options.delayMs, this.options.signal);
            continue;
          }
          const accepted = pageData.content.length >= this.options.minContentChars;
          if (accepted) {
            pages.push(pageData);
            this.knownPageUrls.add(pageData.url);
          }

          if (typeof this.options.onPage === 'function') {
            await this.options.onPage({
              ...pageData,
              accepted,
              contentLength: pageData.content.length,
              depth: 1,
              seenCount: seen.size,
              processedCount,
              queuedCount: 0,
            });
          }

          if (!unlimitedMaxPages && pages.length >= this.options.maxPages) break;
          await abortableSleep(this.options.delayMs, this.options.signal);
        }

        if (posts.length < this.postPageSize) break;
        pageIndex += 1;
        await abortableSleep(this.options.delayMs, this.options.signal);
      }

      if (!unlimitedMaxPages && pages.length >= this.options.maxPages) break;
    }

    return { pages, seenCount: seen.size };
  }
}

module.exports = {
  Q1CommunityCrawler,
  authenticateQ1,
  buildDedicatedProfileDir,
  buildQ1Context,
  collectImageUrlsFromRichContent,
  formatComment,
  isQ1CommunityUrl,
  normalizeRichContent,
  pickPostTitle,
  resolveProfileCandidates,
};
