function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/\r/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeText(match[1]).slice(0, 255) : '';
}

function htmlToText(html) {
  const withoutNoise = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeText(withoutNoise);
}

function readAttrs(tag) {
  const attrs = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = attrRe.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2] || match[3] || match[4] || '');
  }
  return attrs;
}

function extractHiddenInputs(html) {
  const out = {};
  const inputRe = /<input\b[^>]*>/gi;
  for (const input of String(html || '').match(inputRe) || []) {
    const attrs = readAttrs(input);
    if (!attrs.name) continue;
    if ((attrs.type || '').toLowerCase() === 'hidden') out[attrs.name] = attrs.value || '';
  }
  return out;
}

function isCrawlableUrl(url) {
  if (!/^https?:$/.test(url.protocol)) return false;
  url.hash = '';
  if (/\b(logout|signout)\b/i.test(url.pathname)) return false;
  return !/\.(?:png|jpe?g|gif|webp|svg|ico|css|js|pdf|zip|rar|7z|mp4|mp3|mov|avi|docx?|xlsx?)$/i.test(url.pathname);
}

function hostNameOnly(host) {
  return String(host || '').toLowerCase().replace(/:\d+$/, '');
}

function rootDomain(host) {
  const value = hostNameOnly(host);
  if (!value || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value === 'localhost') return value;
  const parts = value.split('.').filter(Boolean);
  return parts.length <= 2 ? value : parts.slice(-2).join('.');
}

function isAllowedAssetHost(host, pageUrl, allowedHosts) {
  const normalizedHost = String(host || '').toLowerCase();
  if (!normalizedHost) return false;

  const allowed = Array.isArray(allowedHosts)
    ? allowedHosts.map(item => String(item || '').toLowerCase()).filter(Boolean)
    : [];
  if (!allowed.length) return true;
  if (allowed.includes(normalizedHost)) return true;

  try {
    const pageHost = new URL(pageUrl).host.toLowerCase();
    if (pageHost === normalizedHost) return true;
  } catch {
    // Ignore page URL parse failure and fall back to allowed hosts only.
  }

  const hostRoot = rootDomain(normalizedHost);
  return allowed.some(item => rootDomain(item) === hostRoot);
}

function parseSrcset(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function extractImageUrls(html, pageUrl, allowedHosts) {
  const urls = [];
  const tagRe = /<(?:img|source)\b[^>]*>/gi;
  for (const tag of String(html || '').match(tagRe) || []) {
    const attrs = readAttrs(tag);
    const candidates = [
      attrs.src,
      attrs['data-src'],
      attrs['data-original'],
      attrs['data-lazy-src'],
      attrs['data-url'],
      ...parseSrcset(attrs.srcset),
      ...parseSrcset(attrs['data-srcset']),
    ];

    for (const candidate of candidates) {
      if (!candidate || /^(?:data:|blob:|javascript:)/i.test(candidate)) continue;
      try {
        const url = new URL(candidate, pageUrl);
        if (!/^https?:$/.test(url.protocol)) continue;
        url.hash = '';
        if (!isAllowedAssetHost(url.host, pageUrl, allowedHosts)) continue;
        urls.push(url.toString());
      } catch {
        // Ignore malformed image URLs in source HTML.
      }
    }
  }
  return [...new Set(urls)];
}

function extractLinks(html, pageUrl, allowedHosts) {
  const links = [];
  const allowed = new Set((allowedHosts || []).filter(Boolean));
  const anchorRe = /<a\b[^>]*>/gi;
  for (const anchor of String(html || '').match(anchorRe) || []) {
    const attrs = readAttrs(anchor);
    if (!attrs.href || /^(?:javascript:|mailto:|tel:)/i.test(attrs.href)) continue;
    try {
      const url = new URL(attrs.href, pageUrl);
      if (allowed.size > 0 && !allowed.has(url.host)) continue;
      if (!isCrawlableUrl(url)) continue;
      links.push(url.toString());
    } catch {
      // Ignore malformed links in source HTML.
    }
  }
  return [...new Set(links)];
}

module.exports = {
  extractTitle,
  extractLinks,
  extractImageUrls,
  extractHiddenInputs,
  htmlToText,
  normalizeText,
};
