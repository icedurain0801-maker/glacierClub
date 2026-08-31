const { BaseConnector, ConnectorError, ConnectorPageError, ConnectorPageResult, normalizeRawContent, validatePagination } = require('./baseConnector');

// TapTap 网页端（www.taptap.cn）免登接口采集连接器。
// 所有请求走 /webapiv2/*，需要 X-UA 参数与浏览器 UA，无需登录 Cookie（2026-08 实测）。
// 端点验证记录见 .Codex/docs/2026-08/2026-08-28/v004_taptap_implementation_plan.md。

const DEFAULT_X_UA = 'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&UID=&OS=Windows&OSV=10&DT=PC';
const DEFAULT_BASE_URL = 'https://www.taptap.cn';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_ACCOUNT_IDS = 20;
const MAX_GROUP_IDS = 20;

function parseSourceConfig(source) {
  const raw = source && source.config;
  const cfg = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
  const numericIds = value => (Array.isArray(value) ? value.map(item => String(item || '').trim()) : String(value || '').split(/[,，\n\r]+/))
    .map(item => item.replace(/^.*\/group\/(\d+).*$/, '$1')) // 支持直接粘贴 group 页 URL
    .filter(/^\d+$/.test.bind(/^\d+$/));
  const accountIds = Array.isArray(cfg.accountIds) ? numericIds(cfg.accountIds) : (cfg.accountIds ? numericIds(cfg.accountIds) : []);
  const groupIds = cfg.groupIds ? numericIds(cfg.groupIds) : [];
  return { ...cfg, accountIds: [...new Set(accountIds)].slice(0, MAX_ACCOUNT_IDS), groupIds: [...new Set(groupIds)].slice(0, MAX_GROUP_IDS) };
}

function momentId(moment) {
  const id = moment?.id_str ?? moment?.id;
  if (id == null || String(id).trim() === '') return null;
  return String(id);
}

function momentText(moment) {
  // 动态类 moment 的文本载体是 topic.title + topic.summary；评测类附带 review.contents.text。
  const topic = moment?.topic || {};
  const parts = [String(topic.title || '').trim(), String(topic.summary || '').trim()];
  const reviewText = String(moment?.review?.contents?.text || '').trim();
  if (reviewText) parts.push(reviewText);
  return parts.filter(Boolean).join('\n').trim();
}

function taptapItem(moment) {
  const id = momentId(moment);
  if (!id) throw new ConnectorError('MALFORMED_RESPONSE', 'TapTap moment id is required');
  const user = moment?.author?.user || {};
  const stat = moment?.stat || {};
  const text = momentText(moment);
  const topic = moment?.topic || {};
  // normalizeRawContent 只保留核心字段，platformAuthorId 等附加字段在归一化后补回。
  const normalized = normalizeRawContent({
    externalId: id,
    contentType: 'post',
    title: String(topic.title || '').trim().slice(0, 120),
    body: text,
    authorName: String(user.name || '').trim(),
    publishedAt: moment.publish_time || moment.created_time ? new Date(Number(moment.publish_time || moment.created_time) * 1000) : null,
    sourceUrl: `${DEFAULT_BASE_URL}/moment/${id}`,
    engagement: {
      comments: Number(stat.comments || 0),
      likes: Number(stat.ups || 0),
      views: Number(stat.pv_total || 0),
      favorites: Number(stat.favorites || 0)
    },
    media: []
  });
  return { ...normalized, platformAuthorId: user.id == null ? null : String(user.id) };
}

function taptapComment(entry, { rootContentId, momentUrl }) {
  const id = entry?.id;
  if (id == null) throw new ConnectorError('MALFORMED_RESPONSE', 'TapTap comment id is required');
  const replyTo = entry.reply_to_user;
  // by-review 一次返回全部层级：reply_to_user 非空即二级回复。
  // platformParentId 交给 worker 的 flattenCommentTree 展开树结构。
  return {
    externalId: String(id),
    contentType: 'comment',
    title: '',
    body: String(entry?.contents?.text || '').trim(),
    authorName: String(entry?.author?.name || '').trim(),
    platformAuthorId: entry?.author?.id == null ? null : String(entry.author.id),
    publishedAt: entry.created_time ? new Date(Number(entry.created_time) * 1000) : null,
    sourceUrl: momentUrl,
    rootPlatformContentId: String(rootContentId),
    platformParentId: replyTo?.id == null ? null : String(replyTo.id),
    contentDepth: replyTo ? 2 : 1,
    engagement: { likes: Number(entry?.ups || 0), downs: Number(entry?.downs || 0) },
    isOfficial: entry?.is_official === true,
    isDeleted: entry?.collapsed === true
  };
}

// moment-comment 的 contents 是富文本 JSON（slate 结构），递归提取纯文本。
function richTextToPlain(contents) {
  const json = contents?.json;
  if (Array.isArray(json)) {
    const walk = node => typeof node?.text === 'string' ? node.text : Array.isArray(node?.children) ? node.children.map(walk).join('') : '';
    return json.map(walk).join(' ').replace(/\s+/g, ' ').trim();
  }
  return String(contents?.text || '').trim();
}

function taptapMomentComment(entry, { rootContentId, momentUrl }) {
  // moment-comment/v1/by-moment 返回一级楼层；comments 字段是子回复数（二级回复走 by-comment，暂不展开）。
  const id = entry?.id_str ?? entry?.id;
  if (id == null) throw new ConnectorError('MALFORMED_RESPONSE', 'TapTap moment comment id is required');
  return {
    externalId: String(id),
    contentType: 'comment',
    title: '',
    body: richTextToPlain(entry?.contents),
    authorName: String(entry?.author?.name || '').trim(),
    platformAuthorId: entry?.author?.id == null ? null : String(entry.author.id),
    publishedAt: entry.created_time ? new Date(Number(entry.created_time) * 1000) : null,
    sourceUrl: momentUrl,
    rootPlatformContentId: String(rootContentId),
    platformParentId: null,
    contentDepth: 1,
    engagement: { likes: Number(entry?.comments || 0) },
    isOfficial: entry?.is_official === true,
    isDeleted: false
  };
}

function decodeCursor(value) {
  if (value == null || value === '') return { version: 1, from: 0, accountIdx: 0 };
  try {
    const parsed = JSON.parse(String(value));
    const from = Number(parsed.from);
    const accountIdx = Number(parsed.accountIdx || 0);
    if (parsed.version === 1 && Number.isInteger(from) && from >= 0 && Number.isInteger(accountIdx) && accountIdx >= 0) return { version: 1, from, accountIdx };
  } catch {}
  throw new ConnectorError('INVALID_PAGINATION', 'TapTap pagination cursor is invalid');
}

class TapTapConnector extends BaseConnector {
  constructor(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
    super({ platform: 'taptap', capabilities: ['posts', 'comments', 'owned_content', 'keyword_search'] });
    this.enabled = env.TAPTAP_ENABLED === 'true' || env.TAPTAP_ENABLED === '1';
    this.baseUrl = String(env.TAPTAP_WEB_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.xUa = env.TAPTAP_X_UA || DEFAULT_X_UA;
    this.maxPages = Number(env.TAPTAP_MAX_PAGES || 50);
    this.delayMs = Number(env.TAPTAP_DELAY_MS || 800);
    this.timeoutMs = Number(env.TAPTAP_TIMEOUT_MS || 15000);
    this.pageLimit = Number(env.TAPTAP_PAGE_LIMIT || 20);
    this.fetchImpl = fetchImpl;
  }

  async installationHealth() {
    const installed = this.enabled && Boolean(this.baseUrl);
    return {
      platform: this.platform,
      installed,
      configured: installed,
      reason: installed ? null : (this.enabled ? 'web base URL required' : 'disabled by configuration'),
      capabilities: this.capabilities
    };
  }

  async accountHealth() {
    // 免登采集：安装即视为账号可用。
    const installation = await this.installationHealth();
    return { ...installation, authorized: installation.installed, configured: installation.installed, reason: installation.reason };
  }

  async healthCheck() {
    const health = await this.accountHealth();
    return { platform: health.platform, configured: health.configured, reason: health.reason };
  }

  async webapiv2(path, params = {}, { capability = 'posts', page = 1 } = {}) {
    // path 形如 'feed/v7/by-user'，拼接 /webapiv2/ 前缀。
    const endpoint = new URL(`/webapiv2/${path.replace(/^\//, '')}`, this.baseUrl);
    for (const [key, value] of Object.entries(params)) if (value != null && value !== '') endpoint.searchParams.set(key, String(value));
    endpoint.searchParams.set('X-UA', this.xUa);
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        redirect: 'manual',
        headers: { accept: 'application/json', 'user-agent': BROWSER_UA },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new ConnectorPageError(this.platform, capability, page, error);
    }
    if (!response.ok) {
      const code = response.status === 403 ? 'PERMISSION_DENIED' : response.status === 429 ? 'RATE_LIMITED' : `TAPTAP_HTTP_${response.status}`;
      throw new ConnectorPageError(this.platform, capability, page, new ConnectorError(code, `TapTap API request failed with status ${response.status}`));
    }
    let payload;
    try { payload = await response.json(); } catch {
      throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('MALFORMED_RESPONSE', 'TapTap API returned invalid JSON'));
    }
    if (payload?.success === false) {
      throw new ConnectorPageError(this.platform, capability, page, new ConnectorError('TAPTAP_API_ERROR', payload?.data?.msg || 'TapTap API rejected the request'));
    }
    return payload;
  }

  async listOwnedContents({ source, cursor, limit } = {}) {
    const installation = await this.installationHealth();
    if (!installation.installed) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', installation.reason || 'TapTap connector is not installed');
    const { accountIds, groupIds } = parseSourceConfig(source);
    // 监控目标分两类：groupIds 抓游戏社区讨论组动态，accountIds 抓指定用户动态。
    // 游标域统一为 targetIdx：先遍历 groups（0..groupIds.length-1），再接 accounts。
    const targets = [
      ...groupIds.map(id => ({ kind: 'group', id })),
      ...accountIds.map(id => ({ kind: 'user', id }))
    ];
    if (!targets.length) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', 'TapTap source requires config.groupIds or config.accountIds');
    const current = decodeCursor(cursor);
    const targetIndex = Number(current.accountIdx || 0);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= targets.length) throw new ConnectorError('INVALID_PAGINATION', 'TapTap target cursor is out of range');
    const target = targets[targetIndex];
    // by-group 接口 limit 上限为 10（实测 20 即 400 max 校验失败），组目标强制钳制。
    const pageSize = Math.min(limit == null ? this.pageLimit : Number(limit), target.kind === 'group' ? 10 : this.pageLimit);
    if (this.delayMs && current.from > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    const payload = target.kind === 'group'
      ? await this.webapiv2('feed/v7/by-group', { group_id: target.id, from: current.from, limit: pageSize }, { capability: 'owned_content', page: Math.floor(current.from / pageSize) + 1 })
      : await this.webapiv2('feed/v7/by-user', { user_id: target.id, from: current.from, limit: pageSize }, { capability: 'owned_content', page: Math.floor(current.from / pageSize) + 1 });
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    const items = list.map(entry => entry?.moment).filter(Boolean).map(taptapItem);
    const hasMoreThisTarget = list.length >= pageSize;
    const nextCursor = hasMoreThisTarget
      ? JSON.stringify({ version: 1, accountIdx: targetIndex, from: current.from + list.length })
      : (targetIndex + 1 < targets.length ? JSON.stringify({ version: 1, accountIdx: targetIndex + 1, from: 0 }) : null);
    const page = new ConnectorPageResult({ items, nextCursor, hasMore: nextCursor != null, capability: 'owned_scope', raw: payload });
    // validatePagination 以 nextCursor 与请求 cursor 的差异判定推进；显式断言目标游标始终前进。
    if (page.hasMore) {
      const next = JSON.parse(page.nextCursor);
      if (next.accountIdx === targetIndex && next.from <= current.from) throw new ConnectorError('INVALID_PAGINATION', 'TapTap target pagination cursor did not advance');
    }
    return validatePagination({ cursor, limit, page });
  }

  async searchContents({ keyword, cursor, limit } = {}) {
    const installation = await this.installationHealth();
    if (!installation.installed) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', installation.reason || 'TapTap connector is not installed');
    const kw = String(keyword || '').trim();
    if (!kw) throw new ConnectorError('KEYWORD_REQUIRED', 'TapTap keyword search requires a keyword');
    const pageSize = limit == null ? this.pageLimit : Number(limit);
    const current = decodeCursor(cursor);
    if (this.delayMs && current.from > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    const payload = await this.webapiv2('search/v4/agg-search', { kw, types: 'community', from: current.from, limit: pageSize }, { capability: 'keyword_search', page: Math.floor(current.from / pageSize) + 1 });
    const groups = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    const entries = groups.flatMap(group => Array.isArray(group?.list) ? group.list : []);
    const moments = entries.map(entry => entry?.moment).filter(Boolean);
    // 搜索结果中的 moment 无独立正文（文本在 topic.title/summary），全部保留交给规则引擎。
    const items = moments.map(taptapItem);
    const hasMore = entries.length >= pageSize;
    return validatePagination({ cursor, limit, page: new ConnectorPageResult({ items, nextCursor: hasMore ? JSON.stringify({ version: 1, from: current.from + entries.length }) : null, hasMore, capability: 'keyword_search', raw: payload }) });
  }

  async listComments({ postId, cursor, limit } = {}) {
    const installation = await this.installationHealth();
    if (!installation.installed) throw new ConnectorError('CONNECTOR_NOT_CONFIGURED', installation.reason || 'TapTap connector is not installed');
    const id = postId == null || String(postId).trim() === '' ? null : String(postId).trim();
    if (!id) throw new ConnectorError('POST_ID_REQUIRED', 'postId is required');
    // 评论接口 limit 上限为 10（moment-comment 实测 50 即 400 max 校验失败），统一钳制。
    const pageSize = Math.min(limit == null ? this.pageLimit : Number(limit), 10);
    const current = decodeCursor(cursor);
    if (this.delayMs && current.from > 0) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    // 先取 moment 详情判断评论线程归属：评测类挂 review（review-comment/by-review），
    // 普通动态挂 moment 本身（moment-comment/by-moment）。
    const detail = await this.webapiv2('moment-mini/v1/multi-get', { ids: id }, { capability: 'comments', page: current.from + 1 });
    const moment = Array.isArray(detail?.data?.list) ? detail.data.list[0] : null;
    const reviewId = moment?.review?.id;
    const momentUrl = `${this.baseUrl}/moment/${id}`;
    if (reviewId == null) {
      // 普通动态：moment-comment/by-moment（sort=rank, order=desc）。
      const payload = await this.webapiv2('moment-comment/v1/by-moment', { moment_id: id, sort: 'rank', order: 'desc', from: current.from, limit: pageSize }, { capability: 'comments', page: Math.floor(current.from / pageSize) + 1 });
      const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
      const total = Number(payload?.data?.total || 0);
      const items = list.map(entry => taptapMomentComment(entry, { rootContentId: id, momentUrl }));
      const seen = new Set();
      for (const item of items) {
        if (seen.has(item.externalId)) throw new ConnectorError('MALFORMED_RESPONSE', 'TapTap comment page contains duplicate IDs');
        seen.add(item.externalId);
      }
      const hasMore = items.length > 0 && current.from + items.length < total;
      return validatePagination({ cursor, limit, page: new ConnectorPageResult({ items, nextCursor: hasMore ? JSON.stringify({ version: 1, from: current.from + items.length }) : null, hasMore, capability: 'comments', raw: payload }) });
    }
    // 评测类动态：review-comment/by-review 一次返回一级+二级（reply_to_user 标记层级）。
    const payload = await this.webapiv2('review-comment/v1/by-review', { review_id: reviewId, from: current.from, limit: pageSize, order: 'asc', show_top: 'true' }, { capability: 'comments', page: Math.floor(current.from / pageSize) + 1 });
    const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    const total = Number(payload?.data?.total || 0);
    const items = list.map(entry => taptapComment(entry, { rootContentId: id, momentUrl }));
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.externalId)) throw new ConnectorError('MALFORMED_RESPONSE', 'TapTap comment page contains duplicate IDs');
      seen.add(item.externalId);
    }
    const hasMore = items.length > 0 && current.from + items.length < total;
    return validatePagination({ cursor, limit, page: new ConnectorPageResult({ items, nextCursor: hasMore ? JSON.stringify({ version: 1, from: current.from + items.length }) : null, hasMore, capability: 'comments', raw: payload }) });
  }
}

module.exports = { TapTapConnector, parseSourceConfig, momentText, taptapItem, taptapComment, MAX_ACCOUNT_IDS };
