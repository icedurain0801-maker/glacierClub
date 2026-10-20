const { BaasReadRepository } = require('./baasReadRepository');
const { BaasClient, readToken } = require('./baasDataClient');
const { COLLECTION: METADATA } = require('./baasReadMetadata');
const { COLLECTION, VERSION, whereFor, error, utc } = require('../../../shared/cloudQueryProjection');
const { AsyncLocalStorage } = require('node:async_hooks');
class BaasQueryRepository extends BaasReadRepository {
  constructor(options = {}) {
    super(options); this.queryClient = options.queryClient || options.client;
    this.queryCache = new Map(); this.queryPending = new Map(); this.readyCache = null;
    this.budgets = new AsyncLocalStorage(); this.requestTimeoutMs = Math.min(7000, Math.max(1, options.requestTimeoutMs || 7000));
  }
  transport() {
    if (this.queryClient) return this.queryClient;
    if (!this.transportCache || this.transportCache.expiresAt < Date.now()) this.transportCache = { client: new BaasClient(readToken(this.tokenFile)), expiresAt: Date.now() + 60000 };
    return this.transportCache.client;
  }
  async request(method, path, data) {
    let timer;
    const wait = Math.min(this.requestTimeoutMs, (this.budgets.getStore()?.deadline || Date.now() + 14000) - Date.now());
    if (wait <= 0) throw error('BAAS_QUERY_TIMEOUT', '云端查询超时，请稍后重试');
    try {
      return await Promise.race([this.transport().request(method, path, data, { signal: AbortSignal.timeout(wait), timeoutMs: wait }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(error('BAAS_QUERY_TIMEOUT', '云端查询超时，请稍后重试')), wait); })]);
    } finally { clearTimeout(timer); }
  }
  invalidate() { this.queryCache.clear(); this.readyCache = null; this.metadataCache = null; this.directoryCache = null; }
  async ready() {
    if (this.readyCache?.expiresAt > Date.now()) return;
    if (!this.readyPending) this.readyPending = (async () => {
      const result = await this.request('GET', `v1/collections/${METADATA}/docs/query-current`);
      if (result.data?.schemaVersion !== VERSION || result.data?.status !== 'ready') throw error('BAAS_QUERY_NOT_READY', '云端查询数据尚未完整构建');
      this.readyCache = { expiresAt: Date.now() + 5000 };
    })().finally(() => { this.readyPending = null; });
    await this.readyPending;
  }
  async load() {
    if (this.metadataCache?.expiresAt > Date.now()) return this.metadataCache;
    if (!this.metadataPending) this.metadataPending = (async () => {
      const { data: manifest } = await this.request('GET', `v1/collections/${METADATA}/docs/current`);
      if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.chunks)) throw error('BAAS_DATA_UNAVAILABLE', '云端目录数据无效');
      const metadata = { games: [], communities: [], sources: [], accounts: [], handlings: [], analysisJobs: [], translationJobs: [], quality: [], alerts: [], alertLinks: [] };
      let offset = 0;
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (offset < manifest.chunks.length) {
          const chunk = manifest.chunks[offset++];
          if (!Object.hasOwn(metadata, chunk.table)) throw error('BAAS_DATA_UNAVAILABLE', '云端目录类型无效');
          let data = this.metadataChunks.get(chunk.id);
          if (!data) { ({ data } = await this.request('GET', `v1/collections/${METADATA}/docs/${encodeURIComponent(chunk.id)}`)); this.metadataChunks.set(chunk.id, data); }
          if (data?.table !== chunk.table || !Array.isArray(data.rows)) throw error('BAAS_DATA_UNAVAILABLE', '云端目录分块无效');
          metadata[chunk.table].push(...data.rows);
        }
      }));
      const active = new Set(manifest.chunks.map(chunk => chunk.id));
      for (const key of this.metadataChunks.keys()) if (!active.has(key)) this.metadataChunks.delete(key);
      return (this.metadataCache = { metadata, expiresAt: Date.now() + 15000 });
    })().finally(() => { this.metadataPending = null; });
    return this.metadataPending;
  }
  async query(filters = {}, { limit = 20, offset = 0, extra = {}, order = 'sort_key' } = {}) {
    const scoped = whereFor(filters);
    if (scoped.empty) return { docs: [], total: 0 };
    const input = { where: { ...scoped.where, ...extra }, limit: Math.min(500, Math.max(1, limit)), offset, with_total: true, order_by: order, desc: true };
    const key = JSON.stringify(input), scope = this.budgets.getStore(), cached = this.queryCache.get(key);
    if (scope?.reads.has(key)) return scope.reads.get(key);
    if (cached?.expiresAt > Date.now()) { scope?.reads.set(key, cached.result); return cached.result; }
    if (this.queryPending.has(key)) { const shared = this.queryPending.get(key); scope?.reads.set(key, shared); return shared; }
    const pending = (async () => {
      await this.ready();
      const result = await this.request('POST', `v1/collections/${COLLECTION}/query`, input);
      if (!Array.isArray(result.docs) || !Number.isSafeInteger(result.total) || result.total < 0 || result.docs.some(doc => doc.data?.schemaVersion !== VERSION || doc.data.id !== doc.id)) throw error('BAAS_QUERY_INVALID_RESPONSE', '云端查询响应无效');
      this.queryCache.delete(key); this.queryCache.set(key, { result, expiresAt: Date.now() + 1500 });
      while (this.queryCache.size > 100) this.queryCache.delete(this.queryCache.keys().next().value);
      return result;
    })().finally(() => { this.queryPending.delete(key); });
    this.queryPending.set(key, pending); scope?.reads.set(key, pending); return pending;
  }
  async getContentStats(filters = {}, { includeBreakdown = false } = {}) {
    const base = { ...filters }; delete base.riskMode; delete base.severity; delete base.sentiment;
    const counts = [['post', { ...base, contentType: 'post' }], ['comment', { ...base, contentType: 'comment' }]];
    for (const mode of ['attention', 'negative', 'urgent']) {
      counts.push([mode, { ...base, riskMode: mode, handlingStatus: 'pending' }]);
      if (includeBreakdown) for (const type of ['post', 'comment']) counts.push([`${mode}${type === 'post' ? 'Post' : 'Comment'}Count`, { ...base, riskMode: mode, handlingStatus: 'pending', contentType: type }]);
    }
    return Object.fromEntries(await Promise.all(counts.map(async ([key, query]) => [key, await this.countContents(query)])));
  }
  async listContents(filters = {}) {
    if (whereFor(filters).empty) return [];
    const size = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
    // Read risk pages in the cloud and overlay authoritative handling state.
    if (filters.handlingStatus && this.reviewRepository) {
      if (filters.allowedCommunityIds && !filters.communityId) throw error('BAAS_QUERY_SCOPE_REQUIRED', '处理状态筛选需要选择已授权社区');
      const start = (Math.max(1, Number(filters.page) || 1) - 1) * size;
      const selected = []; let offset = 0;
      do {
        const result = await this.query({ ...filters, handlingStatus: undefined }, { limit: 100, offset, order: filters.sort === 'engagement' ? 'engagement_score' : 'sort_key' });
        const rows = await this.currentHandlingRows(result.docs.map(doc => doc.data));
        selected.push(...rows.filter(row => row.handling_status === filters.handlingStatus));
        offset += rows.length;
        if (selected.length >= start + size || offset >= result.total) break;
        if (!rows.length) throw error('BAAS_QUERY_INCOMPLETE', '云端处理状态分页不完整');
      } while (true);
      const rows = selected.slice(start, start + size);
      return filters.contentId ? Promise.all(rows.map(row => this.hydrate(row))) : rows;
    }
    const result = await this.query(filters, { limit: size, offset: (Math.max(1, Number(filters.page) || 1) - 1) * size, order: filters.sort === 'engagement' ? 'engagement_score' : 'sort_key' });
    const rows = result.docs.map(doc => doc.data);
    return this.currentHandlingRows(filters.contentId ? await Promise.all(rows.map(row => this.hydrate(row))) : rows);
  }
  async countContents(filters = {}) {
    if (whereFor(filters).empty) return 0;
    if (filters.handlingStatus && this.reviewRepository) {
      if (filters.allowedCommunityIds && !filters.communityId) throw error('BAAS_QUERY_SCOPE_REQUIRED', '处理状态筛选需要选择已授权社区');
      const local = { ...filters };
      for (const key of ['publishedFrom', 'publishedTo']) if (local[key]) local[key] = utc(local[key]).replace('T', ' ').replace('Z', '');
      return this.reviewRepository.countContents(local);
    }
    return (await this.query(filters, { limit: 1 })).total;
  }
  async listContentTree(filters = {}) { return this.listContents(filters); }
  async filtered(filters = {}) {
    if (filters.allowedCommunityIds?.length === 0) return [];
    if (!filters.communityId && !filters.gameId && !filters.sourceId && !filters.contentId && !filters.contentIds?.length && !filters.allowedCommunityIds?.length && !filters.publishedFrom) throw error('BAAS_QUERY_SCOPE_REQUIRED', '云端汇总需要社区或日期范围');
    const first = await this.query(filters, { limit: 200, offset: 0 });
    if (first.total > 50000) throw error('BAAS_QUERY_RANGE_TOO_LARGE', '云端汇总范围较大，请缩小日期范围');
    const pages = [first]; let nextOffset = 200, stopped = false;
    const completed = await Promise.allSettled(Array.from({ length: Math.min(4, Math.ceil(Math.max(0, first.total - 200) / 200)) }, async () => {
      while (nextOffset < first.total && !stopped) {
        const offset = nextOffset; nextOffset += 200;
        try {
          const page = await this.query(filters, { limit: 200, offset });
          if (page.total !== first.total || page.docs.length !== Math.min(200, first.total - offset)) throw error('BAAS_QUERY_INCOMPLETE', '云端内容更新中，请刷新重试');
          pages[offset / 200] = page;
        } catch (e) { stopped = true; throw e; }
      }
    }));
    const failure = completed.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
    const rows = pages.flatMap(page => page.docs.map(doc => doc.data));
    if (rows.length !== first.total || new Set(rows.map(row => row.id)).size !== rows.length) throw error('BAAS_QUERY_INCOMPLETE', '云端内容更新中，请刷新重试');
    return this.currentHandlingRows(rows);
  }
  async getContentTree(id, filters = {}) {
    const [root, children] = await Promise.all([this.query({ ...filters, contentId: id }, { limit: 1 }), this.query(filters, { limit: 500, extra: { root_content_id: id } })]);
    if (children.total > 500) throw error('BAAS_QUERY_RANGE_TOO_LARGE', '评论较多，请分页查看');
    const rows = [...new Map([...root.docs, ...children.docs].map(doc => [doc.id, doc.data])).values()];
    return this.currentHandlingRows(await Promise.all(rows.map(row => row.id === id ? this.hydrate(row) : row)));
  }
  async hydrate(row) {
    const { data } = await this.request('GET', `v1/collections/po_live_contents_v1/docs/${encodeURIComponent(row.id)}`);
    if (data?.schemaVersion !== 1 || data.content?.id !== row.id || data.content.fingerprint !== row.fingerprint) throw error('BAAS_QUERY_STATE_SYNC_PENDING', '正文与查询状态正在同步，请稍后重试');
    return { ...row, title: data.content.title, body: data.content.body, media: data.content.media, raw_payload: data.originalType == null ? null : { type: data.originalType } };
  }
  async synchronizeMetadata() { this.invalidate(); }
  async loadDirectory() { return this.load(); }
  async getQualityContent(id, filters = {}) {
    const { metadata } = await this.load();
    const candidate = metadata.quality.find(row => row.id === id);
    if (!candidate) return null;
    const row = await super.getQualityContent(id, { ...filters, contentId: candidate.content_id });
    if (!row) return null;
    const detail = await this.hydrate({ ...row, id: row.content_id });
    return { ...detail, id: row.id };
  }
  async getAlert(id, filters = {}) {
    const { metadata } = await this.load();
    if (!metadata.alerts.some(row => row.id === id)) return null;
    const contentIds = [...new Set(metadata.alertLinks.filter(row => row.alert_id === id).map(row => row.content_id))];
    if (!contentIds.length) return null;
    return super.getAlert(id, { ...filters, contentIds });
  }
}
// All public reads share one total budget, including nested counts and metadata reads.
for (const name of ['listContents', 'countContents', 'listContentTree', 'getContentStats', 'getContentTree', 'getOverview', 'getOverviewTrend', 'listQualityContents', 'countQualityContents', 'getQualityContent', 'listAlerts', 'getAlert', 'listGames', 'listCommunities']) {
  const method = BaasQueryRepository.prototype[name];
  BaasQueryRepository.prototype[name] = function (...args) {
    if (this.budgets.getStore()) return method.apply(this, args);
    return this.budgets.run({ deadline: Date.now() + 14000, reads: new Map() }, async () => {
      let timer;
      try { return await Promise.race([method.apply(this, args), new Promise((_, reject) => { timer = setTimeout(() => reject(error('BAAS_QUERY_TIMEOUT', '云端查询超过总时间预算')), 14000); })]); }
      finally { clearTimeout(timer); }
    });
  };
}
module.exports = { BaasQueryRepository };
