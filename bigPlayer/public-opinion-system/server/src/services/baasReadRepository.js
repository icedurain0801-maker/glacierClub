const { BaasClient, readToken } = require('./baasDataClient');
const { COLLECTION, publishMetadata } = require('./baasReadMetadata');
const { normalizeRiskFilters, severitiesForRiskMode } = require('../../../shared/riskModes');
const { VERSION: URGENT_REVIEW_VERSION } = require('./urgentValidation');
const { qualityEligibility, candidatePolicy } = require('./qualityPolicy');
const { normalizeQualityCandidate, normalizeAlertWithIndependentReviews } = require('../db/repository');
const { topicsForRow } = require('./topicClassifier');
const { frequentFeedbackBySentiment } = require('./frequentFeedback');
const parse = (value, fallback = {}) => { if (typeof value !== 'string') return value ?? fallback; try { return JSON.parse(value); } catch { return fallback; } };
const timestamp = value => value ? Date.parse(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:/.test(value) ? value.replace(' ', 'T') + 'Z' : value) : NaN;
const descending = (a, b) => (timestamp(b.published_at) || 0) - (timestamp(a.published_at) || 0) || String(b.id).localeCompare(String(a.id));
const page = (rows, filters) => { const size = Math.min(100, Math.max(1, Number(filters.pageSize) || 20)); return rows.slice((Math.max(1, Number(filters.page) || 1) - 1) * size, Math.max(1, Number(filters.page) || 1) * size); };
const index = rows => new Map((rows || []).map(row => [String(row.id), row]));

class BaasReadRepository {
  constructor({ client, tokenFile = 'C:/ProgramData/PublicOpinion/config/baas-query-token.dpapi', ttl = 60000, reviewRepository } = {}) {
    this.client = client; this.tokenFile = tokenFile; this.ttl = ttl; this.cache = null; this.pending = null;
    this.reviewRepository = reviewRepository;
    this.reviewSyncDirty = false; this.reviewSyncRunning = false; this.reviewSyncTimer = null;
    this.handlingCache = null; this.handlingPending = null; this.handlingRevision = 0;
    this.metadataChunks = new Map();
  }
  invalidateHandling() { this.handlingRevision++; this.handlingCache = null; this.handlingPending = null; }
  async currentHandlingRows(rows) {
    if (!this.reviewRepository || !rows.length) return rows;
    if (!this.handlingCache || this.handlingCache.expiresAt <= Date.now()) {
      if (!this.handlingPending) {
        const revision = this.handlingRevision;
        const pending = this.reviewRepository.query('SELECT content_id,handling_method,handling_note,handled_by_name,handled_at FROM po_content_handlings')
          .then(records => {
            if (revision === this.handlingRevision) this.handlingCache = { records: new Map(records.map(record => [String(record.content_id), record])), expiresAt: Date.now() + 1000 };
          }).finally(() => { if (this.handlingPending === pending) this.handlingPending = null; });
        this.handlingPending = pending;
      }
      await this.handlingPending;
      // A save can invalidate a read already in flight. Never restore its stale snapshot.
      if (!this.handlingCache) return this.currentHandlingRows(rows);
    }
    return rows.map(row => {
      const eligible = ['attention', 'negative', 'urgent'].includes(row.severity) && row.handling_eligible !== false;
      const record = this.handlingCache.records.get(String(row.id));
      return { ...row, handling_eligible: eligible, handling_status: eligible ? record ? 'processed' : 'pending' : 'not_required',
        handling_method: record?.handling_method || null, handling_note: record?.handling_note || '', handled_by_name: record?.handled_by_name || (record ? '历史记录' : null), handled_at: record?.handled_at || null };
    });
  }
  scheduleReviewSync(repo = this.reviewRepository, delay = 0) {
    if (!repo) return;
    this.reviewSyncDirty = true;
    if (this.reviewSyncRunning || this.reviewSyncTimer) return;
    this.reviewSyncTimer = setTimeout(async () => {
      this.reviewSyncTimer = null; this.reviewSyncRunning = true; this.reviewSyncDirty = false;
      let failed = false;
      try { await this.synchronizeMetadata(repo); } catch { failed = true; }
      finally {
        this.reviewSyncRunning = false;
        if (failed || this.reviewSyncDirty) this.scheduleReviewSync(repo, failed ? 15000 : 0);
      }
    }, delay);
    this.reviewSyncTimer.unref?.();
  }
  async currentQualityRows(rows) {
    if (!this.reviewRepository || !rows.length) return rows;
    const current = [];
    for (let offset = 0; offset < rows.length; offset += 200) {
      const ids = rows.slice(offset, offset + 200).map(row => row.id);
      current.push(...await this.reviewRepository.query(`SELECT * FROM po_quality_candidates WHERE id IN (${ids.map(() => '?').join(',')})`, ids));
    }
    // Local review writes are authoritative; never resurrect a removed candidate.
    const live = index(current);
    return rows.flatMap(row => live.has(String(row.id)) ? [{ ...row, ...live.get(String(row.id)) }] : []);
  }
  invalidate() { if (this.cache) this.cache.expiresAt = 0; this.directoryCache = null; }
  async synchronizeMetadata(repo) {
    let lock;
    try {
      lock = await repo.pool.getConnection();
      const [rows] = await lock.query("SELECT GET_LOCK('po_baas_live_writer',10) acquired");
      if (!Number(rows[0].acquired)) throw new Error('Cloud writer busy');
      const cache = await this.load({ fresh: true });
      const token = this.client?.token || readToken(this.tokenFile);
      await publishMetadata({ repo, token, contentIds: [...cache.docs.keys()].sort() });
      this.invalidate();
    } catch {
      throw Object.assign(new Error('操作已保存，BaaS 状态同步待重试'), { code: 'BAAS_STATE_SYNC_PENDING', status: 503 });
    } finally {
      if (lock) { try { await lock.query("SELECT RELEASE_LOCK('po_baas_live_writer')"); } finally { lock.release(); } }
    }
  }
  async readMetadataChunk(client, chunk) {
    const cached = this.metadataChunks.get(chunk.id);
    if (cached?.table === chunk.table) return cached;
    const { data } = await client.request('GET', `v1/collections/${COLLECTION}/docs/${encodeURIComponent(chunk.id)}`);
    if (data?.table !== chunk.table || !Array.isArray(data.rows)) throw new Error('Invalid cloud metadata chunk');
    this.metadataChunks.set(chunk.id, data);
    return data;
  }
  async loadDirectory() {
    if (this.directoryCache?.expiresAt > Date.now()) return this.directoryCache;
    if (this.cache?.expiresAt > Date.now()) return this.cache;
    if (this.directoryPending) return this.directoryPending;
    this.directoryPending = (async () => {
      const client = this.client || new BaasClient(readToken(this.tokenFile));
      const { data: manifest } = await client.request('GET', `v1/collections/${COLLECTION}/docs/current`);
      if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.chunks)) throw new Error('Invalid cloud manifest');
      const metadata = { games: [], communities: [], sources: [] };
      const chunks = manifest.chunks.filter(chunk => Object.hasOwn(metadata, chunk.table));
      await Promise.all(chunks.map(async chunk => {
        const data = await this.readMetadataChunk(client, chunk);
        metadata[chunk.table].push(...data.rows);
      }));
      this.directoryCache = { metadata, expiresAt: Date.now() + this.ttl };
      return this.directoryCache;
    })().catch(() => { throw Object.assign(new Error('BaaS 社区目录读取失败，请稍后重试'), { code: 'BAAS_DATA_UNAVAILABLE', status: 503 }); }).finally(() => { this.directoryPending = null; });
    return this.directoryPending;
  }
  async load({ fresh = false } = {}) {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache;
    if (!this.pending) this.pending = this.refresh().catch(() => { throw Object.assign(new Error('BaaS 业务数据读取失败，请稍后重试'), { code: 'BAAS_DATA_UNAVAILABLE', status: 503 }); }).finally(() => { this.pending = null; });
    // Bound stale reads to 30 seconds beyond the normal TTL. Explicit invalidation
    // (expiresAt=0) and metadata publication always await the fresh read.
    if (!fresh && this.cache?.expiresAt > 0 && Date.now() - this.cache.expiresAt <= 30000) {
      this.pending.catch(() => {});
      return this.cache;
    }
    return this.pending;
  }
  async refresh() {
    const readStartedAt = Date.now();
    const client = this.client || new BaasClient(readToken(this.tokenFile));
    const manifestDoc = await client.request('GET', `v1/collections/${COLLECTION}/docs/current`);
    const manifest = manifestDoc.data;
    if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.chunks)) throw new Error('Invalid cloud manifest');
    let metadata = this.cache?.metadata;
    if (JSON.stringify(this.cache?.manifest) !== JSON.stringify(manifest)) {
      metadata = { games: [], communities: [], sources: [], accounts: [], handlings: [], analysisJobs: [], translationJobs: [], quality: [], alerts: [], alertLinks: [] };
      let position = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (position < manifest.chunks.length) {
          const chunk = manifest.chunks[position++];
          if (!Object.hasOwn(metadata, chunk.table)) throw new Error('Invalid cloud metadata table');
          const data = await this.readMetadataChunk(client, chunk);
          metadata[chunk.table].push(...data.rows);
        }
      }));
      const activeChunks = new Set(manifest.chunks.map(chunk => chunk.id));
      for (const id of this.metadataChunks.keys()) if (!activeChunks.has(id)) this.metadataChunks.delete(id);
    }
    // Initial read uses immutable creation order; subsequent reads stop after an overlap
    // below the prior updated_at watermark. Periodic complete reads recover external deletes.
    const prior = this.cache;
    const full = !prior || Date.now() - prior.fullReadAt > 10 * 60000;
    const docs = new Map(full ? [] : prior.docs);
    let total = 0; let watermark = full ? 0 : prior.watermark;
    const cutoff = full ? 0 : prior.watermark - 120000;
    let offset = 0;
    const batchSize = 100;
    const requestPage = async (offset, full, limit = batchSize) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { return await client.request('POST', 'v1/collections/po_live_contents_v1/query', { limit, offset, with_total: true, order_by: full ? 'created_at' : 'updated_at', desc: !full }); }
        catch (error) {
          if (error.code === 'BAAS_RESPONSE_TOO_LARGE' && limit > 1) {
            const half = Math.floor(limit / 2);
            const first = await requestPage(offset, full, half);
            const second = first.docs.length < half ? { docs: [], total: first.total } : await requestPage(offset + half, full, limit - half);
            return { docs: [...first.docs, ...second.docs], total: first.total };
          }
          if (attempt === 4 || ![429, 500, 502, 503, 504].includes(error.status) && !['BAAS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) throw error;
          await new Promise(resolve => setTimeout(resolve, Math.min(10000, 500 * 2 ** attempt)));
        }
      }
    };
    const addPage = result => {
      if (!Array.isArray(result.docs)) throw new Error('Invalid cloud content page');
      for (const doc of result.docs) {
        if (doc.data?.schemaVersion !== 1 || doc.data?.content?.id !== doc.id) throw new Error('Invalid cloud content document');
        docs.set(doc.id, doc.data); watermark = Math.max(watermark, timestamp(doc.updated_at) || 0);
      }
    };
    if (full) {
      const first = await requestPage(0, true); total = first.total; addPage(first);
      if (!Number.isSafeInteger(total) || total < 0 || total > 100000) throw new Error('Invalid cloud total');
      let nextOffset = batchSize;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (nextOffset < total) {
          const currentOffset = nextOffset; nextOffset += batchSize;
          const result = await requestPage(currentOffset, true); addPage(result);
        }
      }));
    } else
    while (true) {
      const result = await requestPage(offset, false);
      addPage(result);
      total = result.total;
      offset += result.docs.length;
      if (result.docs.length < batchSize || (!full && result.docs.every(doc => timestamp(doc.updated_at) < cutoff))) break;
    }
    if (full && docs.size !== total) throw new Error('Incomplete cloud content read');
    if (docs.size !== total && !full) { this.cache = null; return this.refresh(); }
    const cache = { docs, metadata, manifest, watermark: Math.max(watermark, readStartedAt - 30000), fullReadAt: full ? Date.now() : prior.fullReadAt, expiresAt: Date.now() + this.ttl };
    cache.rows = this.project(cache);
    this.cache = cache;
    return cache;
  }
  project({ docs, metadata }) {
    const games = index(metadata.games), communities = index(metadata.communities), sources = index(metadata.sources), accounts = index(metadata.accounts);
    const handlings = new Map(metadata.handlings.map(row => [row.content_id, row]));
    const jobs = new Map(), translationJobs = new Map();
    const lightVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    for (const job of [...metadata.analysisJobs].sort((a, b) => timestamp(a.updated_at) - timestamp(b.updated_at))) if (job.analysis_profile === 'light' && job.analysis_version === lightVersion) jobs.set(job.content_id, job);
    for (const job of metadata.translationJobs) if (job.target_language === 'zh-CN' && job.translation_version === (process.env.AI_TRANSLATION_VERSION || 'translation-v1')) translationJobs.set(job.content_id, job);
    const counts = new Map();
    for (const { content } of docs.values()) if (content.content_type === 'comment' && !content.is_deleted) {
      const count = counts.get(content.root_content_id) || { total: 0, top: 0, replies: 0 };
      count.total++; if (Number(content.content_depth) > 1) count.replies++; else count.top++;
      counts.set(content.root_content_id, count);
    }
    return [...docs.values()].map(({ content, originalType, analyses, translations }) => {
      const analysis = [...(analyses || [])].sort((a, b) => timestamp(b.analyzed_at) - timestamp(a.analyzed_at))[0];
      const context = parse(analysis?.risk_context), raw = context.rawAnalysis || {};
      const job = jobs.get(content.id), candidateTranslationJob = translationJobs.get(content.id);
      const translationJob = candidateTranslationJob?.content_fingerprint === content.fingerprint ? candidateTranslationJob : null;
      const translation = (translations || []).find(row => row.target_language === 'zh-CN' && row.translation_version === (process.env.AI_TRANSLATION_VERSION || 'translation-v1') && row.content_fingerprint === content.fingerprint);
      const game = games.get(content.game_id), community = communities.get(content.community_id), source = sources.get(content.source_id);
      if (!game || !source) throw new Error('Missing cloud content scope');
      const handling = handlings.get(content.id), eligible = ['attention', 'negative', 'urgent'].includes(analysis?.severity);
      const commentCounts = counts.get(content.id) || {};
      const engagement = parse(content.engagement);
      const review = analysis?.content_fingerprint === content.fingerprint ? raw.urgentReview : null;
      const fields = { ...analysis }; delete fields.id; delete fields.content_id;
      return { ...content, ...fields, raw_payload: originalType == null ? null : { type: originalType },
        display_type: content.content_type === 'post' && source.platform === 'bigplayer_h5' && originalType === 1 ? 'dynamic' : content.content_type,
        platform: source.platform, source_name: source.display_name, region_code: game.region_code, game_name: game.name,
        community_name: community?.name, community_status: community?.status, account_name: accounts.get(content.account_id)?.account_name,
        analysis_reason: raw.reason || raw.originalRiskDecision?.reason || analysis?.analysis_reason || null,
        sentiment_score: typeof raw.sentimentScore === 'number' ? raw.sentimentScore : null, urgent_review: review || null,
        urgent_validated: review?.version === URGENT_REVIEW_VERSION && review.status === 'approved' && review.level === 'L3',
        analysis_status: job?.status || (analysis ? 'completed' : 'unclassified'), analysis_error_code: job?.error_code || null, analysis_error_message: job?.error_message || null,
        translation_status: game.region_code === 'overseas' ? translationJob?.status || (translation ? 'completed' : 'not_requested') : 'not_requested',
        translation_target_language: translation?.target_language, translation_source_language: translation?.source_language,
        translated_title: translation?.translated_title, translated_body: translation?.translated_body, translation_version: translation?.translation_version, translated_at: translation?.translated_at,
        translation_error_code: translationJob?.error_code || null,
        comment_count: content.content_type === 'post' ? Math.max(commentCounts.total || 0, Number(engagement.comments ?? engagement.comment ?? 0)) : 0,
        total_comment_count: content.content_type === 'post' ? Math.max(commentCounts.total || 0, Number(engagement.comments ?? engagement.comment ?? 0)) : 0,
        top_level_comment_count: commentCounts.top || 0, reply_count: commentCounts.replies || 0,
        handling_eligible: eligible, handling_status: eligible ? handling ? 'processed' : 'pending' : 'not_required',
        handling_method: handling?.handling_method || null, handling_note: handling?.handling_note || '', handled_by_name: handling?.handled_by_name || (handling ? '历史记录' : null), handled_at: handling?.handled_at || null };
    });
  }
  async filtered(filters = {}) {
    filters = normalizeRiskFilters(filters);
    if (filters.bigPlayerContentKind && !['post', 'dynamic'].includes(filters.bigPlayerContentKind)) throw Object.assign(new Error('内容类型无效'), { code: 'INVALID_INPUT' });
    const { rows: cloudRows } = await this.load();
    const rows = await this.currentHandlingRows(cloudRows);
    return rows.filter(row => {
      if (filters.contentIds && !filters.contentIds.map(String).includes(String(row.id))) return false;
      if (filters.allowedCommunityIds && !filters.allowedCommunityIds.includes(String(row.community_id))) return false;
      if (!filters.includeDeleted && row.is_deleted) return false;
      for (const [key, column] of Object.entries({ contentId: 'id', regionCode: 'region_code', gameId: 'game_id', communityId: 'community_id', sourceId: 'source_id', platform: 'platform', accountId: 'account_id', contentType: 'content_type', postId: 'external_id', analysisLevel: 'analysis_level', analysisStatus: 'analysis_status', handlingStatus: 'handling_status' })) if (filters[key] && String(filters[key]) !== String(row[column])) return false;
      if (filters.rootContentId && row.id !== filters.rootContentId && row.root_content_id !== filters.rootContentId) return false;
      if (filters.bigPlayerContentKind && (row.platform !== 'bigplayer_h5' || row.content_type !== 'post' || row.display_type !== filters.bigPlayerContentKind)) return false;
      if (filters.sentiment && (filters.sentiment === 'unclassified' ? row.sentiment != null : row.sentiment !== filters.sentiment)) return false;
      if (filters.riskMode && (!['neutral', 'negative'].includes(row.sentiment) || !severitiesForRiskMode(filters.riskMode).includes(row.severity) || row.severity === 'urgent' && !row.urgent_validated)) return false;
      if (!filters.riskMode && filters.severity && (row.severity !== filters.severity || filters.severity === 'urgent' && !row.urgent_validated)) return false;
      if (filters.keyword && ![row.title, row.body, row.author_name].some(value => String(value || '').toLocaleLowerCase().includes(String(filters.keyword).toLocaleLowerCase()))) return false;
      if (filters.publishedFrom && !(timestamp(row.published_at) >= timestamp(filters.publishedFrom))) return false;
      if (filters.publishedTo && !(timestamp(row.published_at) < timestamp(filters.publishedTo))) return false;
      return true;
    });
  }
  async listContents(filters = {}) { return page((await this.filtered(filters)).sort(descending), filters); }
  async listContentTree(filters = {}) { return this.listContents(filters); }
  async countContents(filters = {}) { return (await this.filtered(filters)).length; }
  async getContentTree(id, filters = {}) { return (await this.filtered({ ...filters, rootContentId: id })).sort(descending); }
  async withContentHandling(items) { return items; }
  async getContentStats(filters = {}, { includeBreakdown = false } = {}) {
    const base = { ...filters }; delete base.riskMode; delete base.severity; delete base.sentiment;
    const result = { post: await this.countContents({ ...base, contentType: 'post' }), comment: await this.countContents({ ...base, contentType: 'comment' }) };
    for (const mode of ['attention', 'negative', 'urgent']) {
      result[mode] = await this.countContents({ ...base, riskMode: mode, handlingStatus: 'pending' });
      if (includeBreakdown) for (const type of ['post', 'comment']) result[`${mode}${type === 'post' ? 'Post' : 'Comment'}Count`] = await this.countContents({ ...base, riskMode: mode, handlingStatus: 'pending', contentType: type });
    }
    return result;
  }
  async getOverviewTrend(filters = {}) {
    const rows = await this.filtered({ ...filters, publishedFrom: filters.from, publishedTo: filters.to });
    const grouped = new Map();
    for (const row of rows) {
      if (!row.published_at) continue;
      const date = new Date(timestamp(row.published_at) + 8 * 3600000).toISOString().slice(0, 10);
      const day = grouped.get(date) || { date, negative: 0, neutral: 0, positive: 0, unclassified: 0, total: 0 };
      day[row.sentiment || 'unclassified']++; day.total++; grouped.set(date, day);
    }
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  async getOverview(filters = {}) {
    const query = { ...filters, publishedFrom: filters.from, publishedTo: filters.to };
    const rows = await this.filtered(query), stats = await this.getContentStats(query, { includeBreakdown: true });
    const sentiment = {}, sources = {}, topics = new Map();
    for (const row of rows) {
      if (!row.published_at) continue;
      sentiment[row.sentiment || 'unclassified'] = (sentiment[row.sentiment || 'unclassified'] || 0) + 1;
      sources[row.platform] = (sources[row.platform] || 0) + 1;
      for (const topic of row.sentiment ? topicsForRow(row) : []) {
        if (!topic) continue; const current = topics.get(topic) || { topic, count: 0, negative: 0 };
        current.count++; if (row.sentiment === 'negative') current.negative++; topics.set(topic, current);
      }
    }
    const activeAlerts = (await this.alertRows(query)).filter(alert => ['pending', 'processing'].includes(alert.status));
    const rowIds = new Set(rows.map(row => String(row.id)));
    const parentIds = [...new Set(rows.filter(row => row.content_type === 'comment').flatMap(row => [row.parent_content_id, row.root_content_id]).filter(id => id && !rowIds.has(String(id))))];
    const contextRows = [];
    // Parent context may predate the selected range; it never contributes to counts.
    for (let offset = 0; offset < parentIds.length; offset += 200) contextRows.push(...await this.filtered({ ...query, publishedFrom: undefined, publishedTo: undefined, contentIds: parentIds.slice(offset, offset + 200) }));
    const feedback = require('./feedbackTopics').feedbackTopics(rows, {
      contextRows,
      translator: new (require('../integrations/aiTranslator').AiTranslator)({ ...process.env, AI_TRANSLATION_MAX_RETRIES: '0', AI_TRANSLATION_TIMEOUT_MS: '20000', AI_TRANSLATION_MAX_OUTPUT_TOKENS: '4000' }, { reserveCall: limit => this.reviewRepository?.reserveTranslationCall(limit) || Promise.resolve(false) })
    });
    const feedbackGroups = feedback.groups;
    const linked = new Set((await this.load()).metadata.alertLinks.map(link => link.content_id));
    const urgentUnlinked = rows.filter(row => row.severity === 'urgent' && row.urgent_validated && ['neutral', 'negative'].includes(row.sentiment) && !linked.has(row.id));
    return { metrics: { total: stats.post + stats.comment, postCount: stats.post, commentCount: stats.comment, ...stats, activeAlertCount: activeAlerts.length, urgentAlertCount: activeAlerts.filter(row => row.severity === 'urgent').length, urgentUnlinkedTotal: urgentUnlinked.length },
      sentiment: Object.entries(sentiment).map(([sentiment, count]) => ({ sentiment, count })), sourceDistribution: Object.entries(sources).map(([platform, count]) => ({ platform, count })),
      activeAlerts, urgentUnlinkedContents: urgentUnlinked.slice(0, 20), trend: await this.getOverviewTrend(filters),
      hotNegative: await this.listContents({ ...query, riskMode: 'negative', handlingStatus: 'pending', pageSize: 10 }), hotAttention: await this.listContents({ ...query, riskMode: 'attention', handlingStatus: 'pending', pageSize: 10 }),
      frequentFeedback: feedbackGroups.all,
      frequentFeedbackBySentiment: feedbackGroups,
      feedbackTopicStatus: feedback.status,
      topicDistribution: [...topics.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)) };
  }
  async qualityRows(filters = {}) {
    const cache = await this.load(), contents = index(await this.filtered(filters));
    const candidates = await this.currentQualityRows(cache.metadata.quality);
    return candidates.flatMap(candidate => {
      const row = contents.get(candidate.content_id);
      if (!row || !qualityEligibility({ sentiment: row.sentiment, qualityScore: candidate.quality_score, recommendHome: Number(candidate.recommend_home) === 1, recommendPin: Number(candidate.recommend_pin) === 1, recommendFeature: Number(candidate.recommend_feature) === 1 }, row, candidatePolicy(candidate)).eligible) return [];
      const prefixes = filters.recommendationType ? [filters.recommendationType] : ['home', 'pin', 'feature'];
      if (!prefixes.some(prefix => Number(candidate[`recommend_${prefix}`]) === 1 && (!filters.reviewStatus || candidate[`${prefix}_review_status`] === filters.reviewStatus))) return [];
      return [normalizeQualityCandidate({ ...row, ...candidate })];
    }).sort(descending);
  }
  async listQualityContents(filters = {}) { return page(await this.qualityRows(filters), filters); }
  async countQualityContents(filters = {}) { return (await this.qualityRows(filters)).length; }
  async getQualityContent(id, filters = {}) { return (await this.qualityRows(filters)).find(row => row.id === id) || null; }
  async alertRows(filters = {}) {
    const cache = await this.load(), rows = index(await this.filtered(filters));
    const quality = await this.currentQualityRows(cache.metadata.quality);
    return cache.metadata.alerts.flatMap(alert => {
      if (filters.status && alert.status !== filters.status || filters.severity && alert.severity !== filters.severity) return [];
      const related = cache.metadata.alertLinks.filter(link => link.alert_id === alert.id).map(link => rows.get(link.content_id)).filter(Boolean).filter(row => alert.severity !== 'urgent' || !['pending', 'processing'].includes(alert.status) || row.urgent_validated && row.severity === 'urgent' && ['neutral', 'negative'].includes(row.sentiment));
      if (!related.length) return [];
      const independentReviews = related.flatMap(row => quality.filter(candidate => candidate.content_id === row.id).map(candidate => normalizeQualityCandidate({ ...candidate, candidateId: candidate.id, contentId: row.id, contentType: row.content_type, externalId: row.external_id, title: row.title, publishedAt: row.published_at })));
      return [normalizeAlertWithIndependentReviews({ ...alert, region_code: related[0].region_code, game_name: related[0].game_name, community_name: related[0].community_name, community_status: related[0].community_status, related_contents: related, related_threads: [], relation_status: 'linked', independent_reviews: independentReviews })];
    }).sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at) || String(b.id).localeCompare(String(a.id)));
  }
  async listAlerts(filters = {}) { return page(await this.alertRows(filters), filters); }
  async getAlert(id, filters = {}) { return (await this.alertRows(filters)).find(row => row.id === id) || null; }
  async listGames(filters = {}) { const { metadata } = await this.loadDirectory(); const allowedGames = filters.allowedCommunityIds ? new Set(metadata.communities.filter(row => filters.allowedCommunityIds.includes(String(row.id))).map(row => row.game_id)) : null; return metadata.games.filter(row => (!allowedGames || allowedGames.has(row.id)) && (!filters.regionCode || row.region_code === filters.regionCode) && (!filters.externalId || String(row.external_id) === String(filters.externalId))); }
  async listCommunities(filters = {}) {
    const { metadata } = await this.loadDirectory(); const rows = this.cache?.rows; const games = index(metadata.games);
    return metadata.communities.filter(row => (!filters.gameId || row.game_id === filters.gameId) && (!filters.regionCode || games.get(row.game_id)?.region_code === filters.regionCode) && (!filters.externalId || String(row.external_id) === String(filters.externalId)) && (filters.includeDisabled !== false || row.status === 'enabled') && (!filters.allowedCommunityIds || filters.allowedCommunityIds.includes(String(row.id))))
      .map(row => ({ ...row, region_code: games.get(row.game_id)?.region_code, game_name: games.get(row.game_id)?.name, content_count: rows ? rows.filter(content => content.community_id === row.id).length : null, source_count: metadata.sources.filter(source => source.community_id === row.id).length }));
  }
  forIdentity(identity) {
    const allowedCommunityIds = identity?.scoped ? identity.communityIds || [] : undefined;
    return new Proxy(this, { get: (target, key) => {
      const method = target[key]; if (typeof method !== 'function') return method;
      if (['load', 'invalidate', 'forIdentity', 'withContentHandling'].includes(key)) return method.bind(target);
      return (...args) => {
        const position = ['getContentTree', 'getQualityContent', 'getAlert'].includes(key) ? 1 : 0;
        args[position] = { ...(args[position] || {}), allowedCommunityIds }; return method.apply(target, args);
      };
    } });
  }
}
module.exports = { BaasReadRepository, timestamp };
