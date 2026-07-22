const cfg = require('../config/communitySync');
const { analyzePageImages, formatImageInsights } = require('./communityImageAnalysis');
const { extractHiddenInputs, extractImageUrls, extractLinks, extractTitle, htmlToText } = require('./htmlText');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CommunitySyncCancelledError extends Error {
  constructor(message = 'community sync cancelled') {
    super(message);
    this.name = 'CommunitySyncCancelledError';
  }
}

function throwIfCancelled(signal) {
  if (signal && signal.aborted) throw new CommunitySyncCancelledError();
}

function abortableSleep(ms, signal) {
  if (!ms || ms <= 0) {
    throwIfCancelled(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    throwIfCancelled(signal);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new CommunitySyncCancelledError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isUnlimitedMaxPages(value) {
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed <= 0;
}

function splitSetCookie(value) {
  if (!value) return [];
  return String(value).split(/,(?=[^;,]+=)/g).map(item => item.trim()).filter(Boolean);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setCookieHeader(headerValue) {
    for (const part of String(headerValue || '').split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      this.cookies.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }

  ingest(headers) {
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : splitSetCookie(headers.get('set-cookie'));
    for (const value of values) {
      const first = String(value || '').split(';')[0];
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }

  toHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

class CommunityCrawler {
  constructor(options = cfg) {
    this.options = options;
    this.jar = new CookieJar();
    this.knownPageUrls = new Set(
      (Array.isArray(options.existingPageUrls) ? options.existingPageUrls : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
    );
  }

  buildUrl(pathOrUrl) {
    return new URL(pathOrUrl, this.options.baseUrl).toString();
  }

  async fetchResponse(pathOrUrl, init = {}, readBody) {
    if (typeof fetch !== 'function') throw new Error('Node.js fetch is not available');
    const url = this.buildUrl(pathOrUrl);
    let lastErr;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      throwIfCancelled(this.options.signal);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      const timer = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
      try {
        if (this.options.signal) this.options.signal.addEventListener('abort', onAbort, { once: true });
        const headers = {
          'User-Agent': this.options.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(init.headers || {}),
        };
        const cookie = this.jar.toHeader();
        if (cookie) headers.Cookie = cookie;
        const res = await fetch(url, {
          ...init,
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });
        this.jar.ingest(res.headers);
        const body = await readBody(res);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return { url: res.url || url, status: res.status, headers: res.headers, body };
      } catch (err) {
        if (this.options.signal && this.options.signal.aborted) {
          throw new CommunitySyncCancelledError();
        }
        lastErr = err;
        if (attempt < this.options.maxRetries) {
          await abortableSleep(this.options.retryBaseMs * Math.pow(2, attempt), this.options.signal);
        }
      } finally {
        clearTimeout(timer);
        if (this.options.signal) this.options.signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr;
  }

  async request(pathOrUrl, init = {}) {
    return this.fetchResponse(pathOrUrl, init, res => res.text());
  }

  async requestBuffer(pathOrUrl, init = {}) {
    return this.fetchResponse(pathOrUrl, init, async res => Buffer.from(await res.arrayBuffer()));
  }

  async buildImageSupplement(imageUrls) {
    const insights = await analyzePageImages({
      versionId: this.options.versionId,
      imageUrls,
      maxImagesPerPage: this.options.maxImageAnalysesPerPage,
      signal: this.options.signal,
      fetchImage: async imageUrl => {
        const res = await this.requestBuffer(imageUrl, {
          headers: { Accept: 'image/*,*/*;q=0.8' },
        });
        return {
          url: res.url || imageUrl,
          buffer: res.body,
          mimeType: res.headers.get('content-type') || '',
        };
      },
    });
    return formatImageInsights(insights);
  }

  async login() {
    if (!this.options.baseUrl) throw new Error('COMMUNITY_SYNC_BASE_URL is required');
    if (this.options.authCookie) {
      this.jar.setCookieHeader(this.options.authCookie);
      await this.assertAuthenticated();
      return;
    }
    if (!this.options.loginUrl || !this.options.username || !this.options.password) {
      throw new Error('community sync credentials are not configured');
    }

    const loginPage = await this.request(this.options.loginUrl);
    const fields = {
      ...extractHiddenInputs(loginPage.body),
      ...(this.options.extraLoginFields || {}),
      [this.options.usernameField]: this.options.username,
      [this.options.passwordField]: this.options.password,
    };
    const body = new URLSearchParams(fields).toString();
    const posted = await this.request(this.options.loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (this.options.loginFailureText && posted.body.includes(this.options.loginFailureText)) {
      throw new Error('community login failed');
    }
    if (this.options.loginSuccessText && !posted.body.includes(this.options.loginSuccessText)) {
      throw new Error('community login success marker not found');
    }
    await this.assertAuthenticated();
  }

  async assertAuthenticated() {
    if (!this.options.authCheckPath) return;
    const checked = await this.request(this.options.authCheckPath);
    if (this.options.authCheckText && !checked.body.includes(this.options.authCheckText)) {
      throw new Error('community auth check failed');
    }
    if (this.options.loginFailureText && checked.body.includes(this.options.loginFailureText)) {
      throw new Error('community auth check returned login page');
    }
  }

  async crawl() {
    throwIfCancelled(this.options.signal);
    await this.login();
    const queue = this.options.startPaths.map(path => ({ url: this.buildUrl(path), depth: 0 }));
    const seen = new Set();
    const pages = [];
    let processedCount = 0;
    const unlimitedMaxPages = isUnlimitedMaxPages(this.options.maxPages);

    while (queue.length > 0 && (unlimitedMaxPages || seen.size < this.options.maxPages)) {
      throwIfCancelled(this.options.signal);
      const current = queue.shift();
      if (seen.has(current.url) || current.depth > this.options.maxDepth) continue;
      seen.add(current.url);
      if (this.options.delayMs > 0) await abortableSleep(this.options.delayMs, this.options.signal);

      const res = await this.request(current.url);
      const resolvedUrl = String(res.url || current.url || '').trim();
      if (this.knownPageUrls.has(resolvedUrl)) {
        if (current.depth < this.options.maxDepth) {
          for (const link of extractLinks(res.body, res.url, this.options.allowedHosts)) {
            if (!seen.has(link)) queue.push({ url: link, depth: current.depth + 1 });
          }
        }
        continue;
      }
      const title = extractTitle(res.body);
      const text = htmlToText(res.body);
      const imageSupplement = await this.buildImageSupplement(
        extractImageUrls(res.body, res.url, this.options.allowedHosts)
      );
      const combinedContent = [text, imageSupplement].filter(Boolean).join('\n\n');
      const finalContent = combinedContent.slice(0, this.options.maxContentChars);
      processedCount += 1;
      const pageData = { url: resolvedUrl, title, content: finalContent };
      if (finalContent.length >= this.options.minContentChars) {
        pages.push(pageData);
        this.knownPageUrls.add(resolvedUrl);
      }
      if (typeof this.options.onPage === 'function') {
        await this.options.onPage({
          ...pageData,
          accepted: finalContent.length >= this.options.minContentChars,
          contentLength: finalContent.length,
          depth: current.depth,
          seenCount: seen.size,
          processedCount,
          queuedCount: queue.length,
        });
      }

      if (current.depth >= this.options.maxDepth) continue;
      for (const link of extractLinks(res.body, res.url, this.options.allowedHosts)) {
        if (!seen.has(link)) queue.push({ url: link, depth: current.depth + 1 });
      }
    }

    return { pages, seenCount: seen.size };
  }
}

module.exports = { CommunityCrawler, CookieJar, CommunitySyncCancelledError };
