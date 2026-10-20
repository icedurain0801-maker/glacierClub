const { normalizeRiskFilters, severitiesForRiskMode } = require('./riskModes');
const COLLECTION = 'po_query_contents_v1';
const VERSION = 1;
const error = (code, message) => Object.assign(new Error(message), { code, status: 503 });
const utc = value => {
  if (!value) return null;
  const text = typeof value === 'string' && /^\d{4}-\d\d-\d\d /.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw error('BAAS_QUERY_INVALID_DATE', '查询数据时间格式无效');
  return new Date(ms).toISOString();
};
function project(row) {
  const { raw_payload, risk_context, media, ...safe } = row;
  const published = utc(row.published_at);
  const searchable = [row.title, row.body, row.author_name].map(value => String(value || '')).join('\n').toLocaleLowerCase();
  const riskFilter = ['neutral', 'negative'].includes(row.sentiment)
    ? row.severity === 'attention' ? 'attention' : row.severity === 'negative' || row.severity === 'urgent' && row.urgent_validated ? 'urgent' : 'normal'
    : 'normal';
  return { ...safe, schemaVersion: VERSION, body: String(row.body || '').slice(0, 500), published_at: published,
    search_text: searchable, sentiment_filter: row.sentiment || 'unclassified', risk_filter: riskFilter,
    severity_filter: row.severity === 'urgent' && !row.urgent_validated ? 'unverified_urgent' : row.severity || 'normal',
    is_deleted: Number(Boolean(row.is_deleted)), sort_key: `${published || '0000'}|${row.id}` };
}
function whereFor(input = {}) {
  const filters = normalizeRiskFilters(input);
  const where = { schemaVersion: VERSION };
  if (filters.allowedCommunityIds) {
    if (!filters.allowedCommunityIds.length || filters.communityId && !filters.allowedCommunityIds.includes(String(filters.communityId))) return { empty: true, where };
    where.community_id = { $in: [...filters.allowedCommunityIds] };
  }
  for (const [key, field] of Object.entries({ contentId: 'id', communityId: 'community_id', regionCode: 'region_code', gameId: 'game_id', sourceId: 'source_id', platform: 'platform', accountId: 'account_id', contentType: 'content_type', postId: 'external_id', analysisStatus: 'analysis_status', analysisLevel: 'analysis_level', handlingStatus: 'handling_status' })) {
    if (filters[key]) where[field] = String(filters[key]);
  }
  if (input.contentIds) {
    if (!Array.isArray(input.contentIds) || input.contentIds.length > 500) throw error('BAAS_QUERY_RANGE_TOO_LARGE', '详情关联内容较多，请分页查看');
    if (!input.contentIds.length || filters.contentId && !input.contentIds.includes(filters.contentId)) return { empty: true, where };
    if (!filters.contentId) where.id = { $in: input.contentIds.map(String) };
  }
  if (!filters.includeDeleted) where.is_deleted = 0;
  if (filters.bigPlayerContentKind) {
    if (!['post', 'dynamic'].includes(filters.bigPlayerContentKind)) throw Object.assign(new Error('内容类型无效'), { code: 'INVALID_INPUT', status: 400 });
    where.platform = 'bigplayer_h5'; where.content_type = 'post'; where.display_type = filters.bigPlayerContentKind;
  }
  if (filters.riskMode) where.risk_filter = filters.riskMode === 'attention' ? 'attention' : 'urgent';
  else {
    if (filters.sentiment) where.sentiment_filter = filters.sentiment;
    if (filters.severity) where.severity_filter = filters.severity;
  }
  if (filters.keyword) {
    // BaaS treats %/_ as wildcards. Escape user literals; never silently change search semantics.
    where.search_text = { $like: '%' + String(filters.keyword).toLocaleLowerCase().replace(/[\\%_]/g, value => '\\' + value) + '%' };
  }
  if (filters.publishedFrom || filters.publishedTo) {
    where.published_at = {};
    if (filters.publishedFrom) where.published_at.$gte = utc(filters.publishedFrom);
    if (filters.publishedTo) where.published_at.$lt = utc(filters.publishedTo);
  }
  return { empty: false, where };
}
module.exports = { COLLECTION, VERSION, utc, project, whereFor, error };
