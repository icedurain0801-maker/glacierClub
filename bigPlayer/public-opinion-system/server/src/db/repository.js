const mysql = require('mysql2/promise');
const crypto = require('node:crypto');

const uuid = () => crypto.randomUUID();

// 软删除过滤片段：config.deleted 为 true 的源不出现在列表，也不进调度/手动采集。
// （表别名统一用 s；MySQL/MariaDB 下 JSON_EXTRACT 缺失键返回 NULL，存 true 时 = false 不成立故被过滤掉。）
const NOT_DELETED = "(JSON_EXTRACT(s.config,'$.deleted') IS NULL OR JSON_EXTRACT(s.config,'$.deleted') = false)";
function parseConfig(raw) { return typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {}); }
function comparableDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.getTime();
  const text = String(value).trim();
  const mysqlUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const timestamp = Date.parse(mysqlUtc);
  return Number.isNaN(timestamp) ? text : timestamp;
}
function canonicalJson(value) {
  const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
  if (Array.isArray(parsed)) return parsed.map(canonicalJson);
  if (parsed && typeof parsed === 'object') return Object.fromEntries(Object.keys(parsed).sort().map(key => [key, canonicalJson(parsed[key])]));
  return parsed;
}
function comparableJson(value, fallback) { return JSON.stringify(canonicalJson(value == null ? fallback : value)); }
function totalCommentCountSql(contentAlias, childAlias) {
  return `CASE WHEN ${contentAlias}.content_type='post' THEN GREATEST((SELECT COUNT(*) FROM po_contents ${childAlias} WHERE ${childAlias}.root_content_id=${contentAlias}.id AND ${childAlias}.content_type='comment' AND ${childAlias}.is_deleted=0), COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${contentAlias}.engagement,'$.comments')) AS UNSIGNED), CAST(JSON_UNQUOTE(JSON_EXTRACT(${contentAlias}.engagement,'$.comment')) AS UNSIGNED), 0)) ELSE 0 END`;
}

// active_window 形如 { days:[1..7 (1=周一,7=周日)], start:'HH:MM', end:'HH:MM' }；
// 空/缺省视为全天生效。start>end 视为跨零点（夜间窗口）。判定用本地时区。
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function isWithinActiveWindow(activeWindow, now = new Date()) {
  const win = parseJson(activeWindow, null);
  if (!win || (!win.days && !win.start && !win.end)) return true;
  const dow = now.getDay() === 0 ? 7 : now.getDay(); // JS 周日=0 → 归一到 7
  if (Array.isArray(win.days) && win.days.length && !win.days.includes(dow)) return false;
  if (!win.start || !win.end) return true;
  const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMin(win.start); const end = toMin(win.end);
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

class Repository {
  constructor(env = process.env) {
    this.advisoryLocks = new Map();
    this.syncUpsertMaxAttempts = Math.max(1, Number(env.SYNC_UPSERT_MAX_RETRIES || 4));
    this.syncUpsertRetryBaseMs = Math.max(0, Number(env.SYNC_UPSERT_RETRY_BASE_MS == null ? 80 : env.SYNC_UPSERT_RETRY_BASE_MS));
    this.syncUpsertLockWaitSeconds = Math.max(1, Number(env.SYNC_UPSERT_LOCK_WAIT_SECONDS || 30));
    this.pool = mysql.createPool(env.DATABASE_URL || {
      host: env.DB_HOST || '127.0.0.1',
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'public_opinion',
      waitForConnections: true,
      connectionLimit: Number(env.DB_POOL_SIZE || 10),
      charset: 'utf8mb4_unicode_ci',
      timezone: 'Z',
      dateStrings: true
    });
  }
  async query(sql, params = []) { const [rows] = await this.pool.query(sql, params); return rows; }
  async health() { const rows = await this.query('SELECT 1 AS ok'); return rows[0]; }
  async listGames({ regionCode } = {}) { const values = []; const where = regionCode ? 'WHERE region_code=?' : ''; if (regionCode) values.push(regionCode); return this.query(`SELECT * FROM po_games ${where} ORDER BY kind, name`, values); }
  async getGame(id) { return (await this.query('SELECT * FROM po_games WHERE id=?', [id]))[0] || null; }
  async listCommunities({ gameId, regionCode, includeDisabled = true } = {}) {
    const values = []; const clauses = [];
    if (gameId) { clauses.push('c.game_id=?'); values.push(gameId); }
    if (regionCode) { clauses.push('g.region_code=?'); values.push(regionCode); }
    if (!includeDisabled) clauses.push("c.status='enabled'");
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.query(`SELECT c.*, g.name AS game_name, g.region_code, COALESCE(source_stats.source_count,0) AS source_count, COALESCE(content_stats.content_count,0) AS content_count FROM po_communities c JOIN po_games g ON g.id=c.game_id LEFT JOIN (SELECT community_id, COUNT(*) AS source_count FROM po_sources WHERE (JSON_EXTRACT(config,'$.deleted') IS NULL OR JSON_EXTRACT(config,'$.deleted')=false) GROUP BY community_id) source_stats ON source_stats.community_id=c.id LEFT JOIN (SELECT community_id, COUNT(*) AS content_count FROM po_contents GROUP BY community_id) content_stats ON content_stats.community_id=c.id ${where} ORDER BY g.region_code, g.name, c.sort_order, c.name`, values);
  }
  async getCommunity(id) { return (await this.listCommunities({})).find(row => String(row.id) === String(id)) || null; }
  async syncCommunityMirror(items = []) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const gameIds = [...new Set(items.map(item => item.gameId))];
      const [games] = gameIds.length ? await conn.query(`SELECT id, region_code FROM po_games WHERE id IN (${gameIds.map(() => '?').join(',')}) FOR UPDATE`, gameIds) : [[]];
      const gameById = new Map(games.map(game => [String(game.id), game]));
      for (const item of items) {
        const game = gameById.get(String(item.gameId));
        if (!game) { const error = new Error(`community game does not exist: ${item.gameId}`); error.code = 'COMMUNITY_PROVIDER_UNKNOWN_GAME'; throw error; }
        if (item.regionCode && item.regionCode !== game.region_code) { const error = new Error(`community region does not match game: ${item.id}`); error.code = 'COMMUNITY_PROVIDER_REGION_MISMATCH'; throw error; }
      }
      for (const item of items) await conn.query("INSERT INTO po_communities (id, game_id, name, status, sort_order) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE game_id=VALUES(game_id), name=VALUES(name), status=VALUES(status), sort_order=VALUES(sort_order), updated_at=NOW()", [item.id, item.gameId, item.name, item.status, item.sortOrder]);
      if (items.length) await conn.query(`UPDATE po_communities SET status='disabled', updated_at=NOW() WHERE id NOT IN (${items.map(() => '?').join(',')}) AND status<>'disabled'`, items.map(item => item.id));
      else await conn.query("UPDATE po_communities SET status='disabled', updated_at=NOW() WHERE status<>'disabled'");
      await conn.commit();
      return { synchronized: items.length };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  async getCommunityForGame(communityId, gameId, { enabledOnly = false } = {}) { const rows = await this.query(`SELECT c.*, g.name AS game_name, g.region_code FROM po_communities c JOIN po_games g ON g.id=c.game_id WHERE c.id=? AND c.game_id=?${enabledOnly ? " AND c.status='enabled'" : ''} LIMIT 1`, [communityId, gameId]); return rows[0] || null; }
  async listSources(gameId, { regionCode, communityId, platform } = {}) { const values = []; const clauses = [NOT_DELETED]; if (gameId) { clauses.push('s.game_id=?'); values.push(gameId); } if (regionCode) { clauses.push('g.region_code=?'); values.push(regionCode); } if (communityId) { clauses.push('s.community_id=?'); values.push(communityId); } if (platform) { clauses.push('s.platform=?'); values.push(platform); } return this.query(`SELECT s.*, g.name AS game_name, g.region_code, c.name AS community_name, c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id LEFT JOIN po_communities c ON c.id=s.community_id WHERE ${clauses.join(' AND ')} ORDER BY s.updated_at ASC`, values); }
  async findSourceByIdentity({ gameId, platform, displayName, communityId } = {}) {
    const scope = communityId ? ' AND community_id=?' : '';
    const params = communityId ? [gameId, platform, displayName, communityId] : [gameId, platform, displayName];
    return (await this.query(`SELECT * FROM po_sources WHERE game_id=? AND platform=? AND display_name=?${scope} LIMIT 1`, params))[0] || null;
  }
  async listEnabledSources() { return this.query(`SELECT s.*, g.name AS game_name, g.region_code, g.enabled AS game_enabled, c.name AS community_name, c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.enabled=1 AND g.enabled=1 AND c.status='enabled' AND ${NOT_DELETED} ORDER BY s.updated_at ASC`); }
  async getOverview({ regionCode, gameId, communityId, sourceId, platform, from, to } = {}) {
    const values = []; const clauses = [];
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (gameId) { values.push(gameId); clauses.push('c.game_id=?'); }
    if (communityId) { values.push(communityId); clauses.push('c.community_id=?'); }
    if (sourceId) { values.push(sourceId); clauses.push('c.source_id=?'); }
    if (platform) { values.push(platform); clauses.push('s.platform=?'); }
    if (from) { values.push(from); clauses.push('c.published_at >= ?'); }
    if (to) { values.push(to); clauses.push('c.published_at < ?'); }
    clauses.push('c.published_at IS NOT NULL');
    clauses.push("c.content_type='post'");
    if (!clauses.some(clause => clause.includes('c.is_deleted'))) clauses.push('COALESCE(c.is_deleted,0)=0');
    if (!from && !to) { values.push(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); clauses.push('c.published_at >= ?'); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const contentJoin = ' JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id';
    const alertClauses = ["a.status NOT IN ('resolved','false_positive')"]; const alertValues = [];
    if (regionCode) { alertValues.push(regionCode); alertClauses.push('g.region_code=?'); }
    if (gameId) { alertValues.push(gameId); alertClauses.push('a.game_id=?'); }
    if (communityId) { alertValues.push(communityId); alertClauses.push('a.community_id=?'); }
    if (sourceId) { alertValues.push(sourceId); alertClauses.push('c.source_id=?'); }
    if (platform) { alertValues.push(platform); alertClauses.push('s.platform=?'); }
    if (from) { alertValues.push(from); alertClauses.push('a.created_at >= ?'); }
    if (to) { alertValues.push(to); alertClauses.push('a.created_at < ?'); }
    if (!from && !to) { alertValues.push(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); alertClauses.push('a.created_at >= ?'); }
    const [metrics, sentiments, sources, alerts, trend, hotNegative] = await Promise.all([
      // 性能：po_analyses 聚合必须 FORCE 覆盖索引（content_id, sentiment, severity），
      // 否则按唯一键逐行回表读 sentiment/severity，UUID 主键随机分布实测 ~2s；覆盖索引 ~100ms。
      // po_games/po_sources 均为 1-2 行小表，优化器以其驱动会导致 contents 全表扫描 + filesort，
      // STRAIGHT_JOIN 强制 c 驱动（与 listContents 同因；实测 sources 3.7s → 250ms）。
      this.query(`SELECT COALESCE(COUNT(*),0) AS total, COALESCE(SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END),0) AS negative, COALESCE(SUM(CASE WHEN a.severity='urgent' THEN 1 ELSE 0 END),0) AS urgent FROM po_contents c FORCE INDEX (po_contents_game_collected_idx) STRAIGHT_JOIN po_sources s ON s.id=c.source_id STRAIGHT_JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a FORCE INDEX (po_analyses_sentiment_cover_idx) ON a.content_id=c.id ${where}`, values),
      this.query(`SELECT COALESCE(a.sentiment,'unclassified') AS sentiment, COUNT(*) AS count FROM po_contents c FORCE INDEX (po_contents_game_collected_idx) STRAIGHT_JOIN po_sources s ON s.id=c.source_id STRAIGHT_JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a FORCE INDEX (po_analyses_sentiment_cover_idx) ON a.content_id=c.id ${where} GROUP BY a.sentiment`, values),
      this.query(`SELECT s.platform, COUNT(*) AS count FROM po_contents c FORCE INDEX (po_contents_source_collected_idx) STRAIGHT_JOIN po_sources s ON s.id=c.source_id STRAIGHT_JOIN po_games g ON g.id=c.game_id ${where} GROUP BY s.platform ORDER BY count DESC`, values),
      this.query(`SELECT DISTINCT a.*, g.name AS game_name, g.region_code, cm.name AS community_name, cm.status AS community_status FROM po_alerts a LEFT JOIN po_alert_contents ac ON ac.alert_id=a.id LEFT JOIN po_contents c ON c.id=ac.content_id LEFT JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=a.game_id LEFT JOIN po_communities cm ON cm.id=a.community_id WHERE ${alertClauses.join(' AND ')} ORDER BY a.created_at DESC LIMIT 10`, alertValues),
      // 按当前概览时间窗口聚合情感趋势；计数 CAST 为整数便于前端比较。
      this.query(`SELECT DATE_ADD(c.published_at, INTERVAL 8 HOUR) AS date, CAST(SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS SIGNED) AS negative, CAST(SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS SIGNED) AS positive, CAST(SUM(CASE WHEN a.sentiment='neutral' THEN 1 ELSE 0 END) AS SIGNED) AS neutral, CAST(SUM(CASE WHEN a.content_id IS NULL THEN 1 ELSE 0 END) AS SIGNED) AS unclassified, CAST(COUNT(*) AS SIGNED) AS total FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id ${where || 'WHERE COALESCE(c.is_deleted,0)=0'} GROUP BY DATE_ADD(c.published_at, INTERVAL 8 HOUR) ORDER BY date ASC`, values),
      // 负面热点 Top10（按互动量降序，供仪表盘热点榜；engagement 字段直接给前端展示互动数）
      this.query(`SELECT c.id, c.game_id, c.community_id, c.title, c.body, c.source_url, c.author_name, c.source_id, c.published_at, s.platform, g.name AS game_name, g.region_code, cm.name AS community_name, a.sentiment, a.negative_score, a.severity, a.topics, a.matched_keywords, a.summary, (COALESCE(CAST(JSON_EXTRACT(c.engagement,'$.like') AS UNSIGNED),0)+COALESCE(CAST(JSON_EXTRACT(c.engagement,'$.comment') AS UNSIGNED),0)+COALESCE(CAST(JSON_EXTRACT(c.engagement,'$.share') AS UNSIGNED),0)) AS engagement FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_communities cm ON cm.id=c.community_id JOIN po_analyses a ON a.content_id=c.id ${where ? `${where} AND` : 'WHERE'} a.sentiment='negative' ORDER BY engagement DESC, a.negative_score DESC LIMIT 10`, values)
    ]);
    return { metrics: metrics[0], sentiment: sentiments, sourceDistribution: sources, activeAlerts: alerts, trend, hotNegative };
  }
  async listContents({ contentId, accountId, regionCode, gameId, communityId, sourceId, platform, contentType, sentiment, severity, keyword, postId, analysisStatus, analysisLevel, publishedFrom, publishedTo, includeDeleted = false, page = 1, pageSize = 20 } = {}) {
    const values = []; const clauses = [];
    if (!includeDeleted) clauses.push('c.is_deleted=0');
    if (postId) { values.push(postId); clauses.push('c.external_id=?'); }
    if (sentiment === 'unclassified') clauses.push('a.content_id IS NULL');
    for (const [, value, sql] of [['contentId', contentId, 'c.id'], ['accountId', accountId, 'c.account_id'], ['gameId', gameId, 'c.game_id'], ['communityId', communityId, 'c.community_id'], ['sourceId', sourceId, 'c.source_id'], ['contentType', contentType, 'c.content_type'], ['sentiment', sentiment === 'unclassified' ? null : sentiment, 'a.sentiment'], ['severity', severity, 'a.severity'], ['analysisLevel', analysisLevel, 'a.analysis_level']]) if (value) { values.push(value); clauses.push(`${sql}=?`); }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (platform) { values.push(platform); clauses.push('s.platform=?'); }
    if (publishedFrom) { values.push(publishedFrom); clauses.push('c.published_at>=?'); }
    if (publishedTo) { values.push(publishedTo); clauses.push('c.published_at<?'); }
    const lightVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    // analysisStatus 筛选：具体任务状态（pending/running/retryable/failed/completed）改为
    // JS 两段式——先查 jobs 拿 content_id 集合，再以 IN + 时间索引查 contents。
    // 直接 SQL 无论 COALESCE join（15s）、semi-join 大集合（4.5s）还是派生表 JOIN（小集合快/大集合慢）
    // 都会踩优化器陷阱；两段式实测 pending ~300ms、completed ~560ms。
    const jobStatuses = new Set(['pending', 'running', 'retryable', 'failed', 'completed']);
    let statusFilterIds = null;
    if (analysisStatus && jobStatuses.has(analysisStatus)) {
      const idRows = await this.query("SELECT DISTINCT content_id FROM po_analysis_jobs WHERE status=? AND analysis_profile='light' AND analysis_version=?", [analysisStatus, lightVersion]);
      statusFilterIds = idRows.map(row => row.content_id);
      if (!statusFilterIds.length) return [];
      clauses.push(`c.id IN (${statusFilterIds.map(() => '?').join(',')})`);
      values.push(...statusFilterIds);
    } else if (analysisStatus) {
      values.push(analysisStatus); clauses.push("COALESCE(j.status,CASE WHEN a.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END)=?");
    }
    if (keyword) { const like = `%${keyword}%`; values.push(like, like, like); clauses.push('(c.title LIKE ? OR c.body LIKE ? OR c.author_name LIKE ?)'); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100); const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const needsJobs = Boolean(analysisStatus) && !jobStatuses.has(analysisStatus);
    // 性能（4 万行 contents / jobs 后优化器选错计划，实测 5-20s → ~40ms-800ms）：
    // - STRAIGHT_JOIN + FORCE INDEX (published_at, id)：优化器以 1 行的 po_sources 驱动导致
    //   contents 全表扫描 + filesort，且 SELECT 含 s 列时 FORCE INDEX 单独使用会被无视；
    //   STRAIGHT_JOIN 强制 c 驱动走排序索引，消除 filesort（默认列表 20s → 40ms）。
    // - 具体状态筛选（两段式 IN 集合）：小集合时主键探测更快、时间索引反而逐行过滤慢
    //   （failed 1 条：无 hint 2ms vs FORCE INDEX 3.8s）；大集合时时间索引排序快
    //   （pending 1.3 万条：FORCE INDEX 360ms vs 无 hint 4.7s）。按集合大小自适应。
    // - comment_count 关联子查询 / jobs join（COALESCE 非 sargable）同样会让计划退化，
    //   均拆成行取回后按 id 补查。
    // - severity/sentiment 稀疏值筛选：c 沿时间索引扫描需逐行回表 po_analyses 判断
    //   （urgent 124/3.7 万，实测 ~2s）。改为覆盖索引派生表先物化命中集合再按 c 主键
    //   JOIN + 限制排序，实测 ~50ms。
    const rareAnalysisFilter = (severity === 'urgent' || severity === 'attention') && !statusFilterIds;
    const smallStatusSet = statusFilterIds && statusFilterIds.length <= 1000;
    const cIndexHint = smallStatusSet || rareAnalysisFilter ? '' : 'FORCE INDEX (po_contents_published_time_idx)';
    const joinHint = smallStatusSet || rareAnalysisFilter ? 'JOIN' : 'STRAIGHT_JOIN';
    const severityJoin = rareAnalysisFilter ? ` JOIN (SELECT content_id FROM po_analyses FORCE INDEX (po_analyses_sentiment_cover_idx) WHERE severity=?) sf ON sf.content_id=c.id` : '';
    const base = `FROM po_contents c ${cIndexHint} ${severityJoin} ${joinHint} po_sources s ON s.id=c.source_id ${joinHint} po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id${needsJobs ? ` LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile=COALESCE(a.analysis_level,'light') AND j.analysis_version=COALESCE(a.analysis_version,?)` : ''}`;
    const rows = await this.query(`SELECT c.*, s.platform, s.display_name AS source_name, a.sentiment, a.negative_score, a.confidence, a.quality_score, a.recommend_home, a.recommend_pin, a.recommend_feature, a.quality_reason, a.severity, a.topics, a.matched_keywords, a.summary, a.model_name, a.analysis_level, a.analysis_version, a.trigger_reason, a.analysis_reason, a.analyzed_at${needsJobs ? `, COALESCE(j.status,CASE WHEN a.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END) AS analysis_status, j.error_code AS analysis_error_code, j.error_message AS analysis_error_message` : `, CASE WHEN a.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END AS analysis_status`} ${base} ${where} ORDER BY c.published_at DESC, c.id DESC LIMIT ? OFFSET ?`, [...(rareAnalysisFilter ? [severity] : []), ...(needsJobs ? [lightVersion] : []), ...values, limit, offset]);
    if (rows.length) {
      const idPlaceholders = rows.map(() => '?').join(',');
      // 补查评论数：本地评论数与 engagement JSON 里的较大值（与原 totalCommentCountSql 口径一致）
      const commentRows = await this.query(`SELECT root_content_id, COUNT(*) AS cnt FROM po_contents WHERE root_content_id IN (${idPlaceholders}) AND content_type='comment' AND is_deleted=0 GROUP BY root_content_id`, rows.map(row => row.id));
      const commentCount = new Map(commentRows.map(row => [row.root_content_id, Number(row.cnt)]));
      const engagementComments = row => {
        const engagement = typeof row.engagement === 'string' ? JSON.parse(row.engagement || '{}') : (row.engagement || {});
        return Number(engagement?.comments ?? engagement?.comment ?? 0) || 0;
      };
      for (const row of rows) {
        row.comment_count = row.content_type === 'post' ? Math.max(commentCount.get(row.id) || 0, engagementComments(row)) : 0;
      }
      if (!needsJobs) {
        // 补查这页内容的 jobs 状态（pending/failed 等覆盖展示）
        const jobRows = await this.query(`SELECT j.content_id, j.status, j.error_code, j.error_message FROM po_analysis_jobs j WHERE j.content_id IN (${idPlaceholders}) AND j.analysis_profile='light' AND j.analysis_version=? ORDER BY j.updated_at ASC`, [...rows.map(row => row.id), lightVersion]);
        const jobByContent = new Map();
        for (const job of jobRows) {
          const current = jobByContent.get(job.content_id);
          if (!current || (current.status === 'completed' && job.status !== 'completed')) jobByContent.set(job.content_id, job);
        }
        for (const row of rows) {
          const job = jobByContent.get(row.id);
          if (job && job.status !== 'completed') { row.analysis_status = job.status; row.analysis_error_code = job.error_code; row.analysis_error_message = job.error_message; }
        }
      }
    }
    return rows;
  }
  async countContents({ contentId, accountId, regionCode, gameId, communityId, sourceId, platform, contentType, sentiment, severity, keyword, postId, analysisStatus, analysisLevel, publishedFrom, publishedTo, includeDeleted = false } = {}) {
    const values = []; const clauses = [];
    const lightVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    const jobStatuses = new Set(['pending', 'running', 'retryable', 'failed', 'completed']);
    const isUnclassified = analysisStatus === 'unclassified' || sentiment === 'unclassified';
    if (isUnclassified) {
      // unclassified = 无分析行且无当前版本 light 任务。COALESCE join 写法实测 4-9s，
      // 双 NOT EXISTS 反连接 ~170ms，结果一致。
      clauses.push("NOT EXISTS (SELECT 1 FROM po_analyses a WHERE a.content_id=c.id)");
      clauses.push(`NOT EXISTS (SELECT 1 FROM po_analysis_jobs j WHERE j.content_id=c.id AND j.analysis_profile='light' AND j.analysis_version='${lightVersion}')`);
    }
    for (const [, value, sql] of [['contentId', contentId, 'c.id'], ['accountId', accountId, 'c.account_id'], ['gameId', gameId, 'c.game_id'], ['communityId', communityId, 'c.community_id'], ['sourceId', sourceId, 'c.source_id'], ['contentType', contentType, 'c.content_type'], ['sentiment', sentiment === 'unclassified' ? null : sentiment, 'a.sentiment'], ['severity', severity, 'a.severity'], ['analysisLevel', analysisLevel, 'a.analysis_level'], ['postId', postId, 'c.external_id']]) if (value) { values.push(value); clauses.push(`${sql}=?`); }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (platform) { values.push(platform); clauses.push('s.platform=?'); }
    if (publishedFrom) { values.push(publishedFrom); clauses.push('c.published_at>=?'); }
    if (publishedTo) { values.push(publishedTo); clauses.push('c.published_at<?'); }
    if (!includeDeleted) clauses.push('c.is_deleted=0');
    // 具体任务状态与 listContents 一致走 JS 两段式（COALESCE join 实测 9s，两段式 ~300ms）
    let statusFilterIds = null;
    if (analysisStatus && jobStatuses.has(analysisStatus)) {
      const idRows = await this.query("SELECT DISTINCT content_id FROM po_analysis_jobs WHERE status=? AND analysis_profile='light' AND analysis_version=?", [analysisStatus, lightVersion]);
      statusFilterIds = idRows.map(row => row.content_id);
      if (!statusFilterIds.length) return 0;
      clauses.push(`c.id IN (${statusFilterIds.map(() => '?').join(',')})`);
      values.push(...statusFilterIds);
    } else if (analysisStatus && !isUnclassified) { values.push(analysisStatus); clauses.push("COALESCE(j.status,CASE WHEN a.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END)=?"); }
    if (keyword) { const like = `%${keyword}%`; values.push(like, like, like); clauses.push('(c.title LIKE ? OR c.body LIKE ? OR c.author_name LIKE ?)'); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // j join 仅为非具体状态值（需 COALESCE(j.status,...) 比较）保留；
    // unclassified 已改为双 NOT EXISTS，不再需要 join
    const needsJobsJoin = Boolean(analysisStatus) && !jobStatuses.has(analysisStatus) && !isUnclassified;
    const needsAnalysis = needsJobsJoin || Boolean(sentiment && sentiment !== 'unclassified' || severity || analysisLevel);
    const analysisJoin = needsAnalysis ? ` LEFT JOIN po_analyses a ON a.content_id=c.id${needsJobsJoin ? " LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile='light' AND j.analysis_version='sentiment-v1'" : ''}` : '';
    const rows = await this.query(`SELECT COUNT(*) AS total FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id${analysisJoin} ${where}`, values);
    return Number(rows[0]?.total || 0);
  }
  async getContentStats(filters = {}) {
    const dimensions = [
      ['post', { contentType: 'post' }],
      ['comment', { contentType: 'comment' }],
      ['negative', { sentiment: 'negative' }],
      ['attention', { severity: 'attention' }]
    ];
    const entries = await Promise.all(dimensions.map(async ([key, extra]) => [key, await this.countContents({ ...filters, ...extra })]));
    return Object.fromEntries(entries.map(([key, value]) => [key, Number(value) || 0]));
  }
  async getContent(id) { return (await this.query('SELECT * FROM po_contents WHERE id=? LIMIT 1', [id]))[0] || null; }
  async listAlerts({ regionCode, gameId, communityId, sourceId, platform, status, severity, page = 1, pageSize = 20 } = {}) {
    const values = []; const clauses = [];
    for (const [value, sql] of [[gameId, 'a.game_id'], [communityId, 'a.community_id'], [sourceId, 'co.source_id'], [status, 'a.status'], [severity, 'a.severity']]) if (value) { values.push(value); clauses.push(`${sql}=?`); }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (platform) { values.push(platform); clauses.push('s.platform=?'); }
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const currentPage = Math.max(Number(page) || 1, 1);
    const offset = (currentPage - 1) * limit;
    return this.query(`SELECT DISTINCT a.*, g.name AS game_name, g.region_code, cm.name AS community_name, cm.status AS community_status FROM po_alerts a LEFT JOIN po_alert_contents acl ON acl.alert_id=a.id LEFT JOIN po_contents co ON co.id=acl.content_id LEFT JOIN po_sources s ON s.id=co.source_id JOIN po_games g ON g.id=a.game_id LEFT JOIN po_communities cm ON cm.id=a.community_id ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  }
  async getAlert(id, scope = {}) {
    const values = [id]; const clauses = ['a.id=?'];
    for (const [value, sql] of [[scope.gameId, 'a.game_id'], [scope.communityId, 'a.community_id'], [scope.sourceId, 'co.source_id'], [scope.platform, 's.platform']]) if (value) { clauses.push(`${sql}=?`); values.push(value); }
    if (scope.regionCode) { clauses.push('g.region_code=?'); values.push(scope.regionCode); }
    const alert = (await this.query(`SELECT DISTINCT a.* FROM po_alerts a LEFT JOIN po_alert_contents acl ON acl.alert_id=a.id LEFT JOIN po_contents co ON co.id=acl.content_id LEFT JOIN po_sources s ON s.id=co.source_id JOIN po_games g ON g.id=a.game_id WHERE ${clauses.join(' AND ')} LIMIT 1`, values))[0] || null;
    if (!alert) return null;
    const contentValues = [id]; const contentClauses = ['ac.alert_id=?'];
    for (const [value, sql] of [[scope.gameId, 'c.game_id'], [scope.communityId, 'c.community_id'], [scope.sourceId, 'c.source_id'], [scope.platform, 's.platform']]) if (value) { contentClauses.push(`${sql}=?`); contentValues.push(value); }
    if (scope.regionCode) { contentClauses.push('g.region_code=?'); contentValues.push(scope.regionCode); }
    let relatedContents = await this.query(`SELECT c.*, c.platform_author_id AS author_id FROM po_alert_contents ac JOIN po_contents c ON c.id=ac.content_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id WHERE ${contentClauses.join(' AND ')} ORDER BY c.published_at ASC, c.id ASC`, contentValues);
    let relationStatus = relatedContents.length ? 'linked' : 'missing';
    if (!relatedContents.length) {
      const detail = String(alert.trigger_detail || '');
      const sourceUrl = detail.match(/^链接：(.+)$/m)?.[1]?.trim();
      const excerpt = detail.match(/^摘录：(.+)$/m)?.[1]?.trim().replace(/…$/, '');
      const summary = detail.match(/^AI 摘要：(.+)$/m)?.[1]?.trim();
      const reason = detail.match(/^升级原因：(.+)$/m)?.[1]?.trim();
      let recovered = [];
      if (summary) {
        const values = [alert.game_id, summary];
        let analysisWhere = 'a.summary=?';
        if (reason) { analysisWhere += ' AND a.analysis_reason=?'; values.push(reason); }
        recovered = await this.query(`SELECT c.*, c.platform_author_id AS author_id FROM po_contents c JOIN po_analyses a ON a.content_id=c.id WHERE c.game_id=? AND COALESCE(c.is_deleted,0)=0 AND ${analysisWhere} GROUP BY c.id ORDER BY MAX(a.analyzed_at) DESC LIMIT 2`, values);
      }
      if (!recovered.length) {
        const clauses = []; const values = [alert.game_id];
        if (sourceUrl) { clauses.push('source_url=?'); values.push(sourceUrl); }
        if (excerpt) {
          const compact = excerpt.replace(/\s+/g, '');
          clauses.push("(REPLACE(REPLACE(REPLACE(COALESCE(title,''),' ',''),'\\r',''),'\\n','') LIKE ? OR REPLACE(REPLACE(REPLACE(COALESCE(body,''),' ',''),'\\r',''),'\\n','') LIKE ?)");
          values.push(`%${compact}%`, `%${compact}%`);
        }
        if (clauses.length) recovered = await this.query(`SELECT c.*, c.platform_author_id AS author_id FROM po_contents c WHERE c.game_id=? AND COALESCE(c.is_deleted,0)=0 AND (${clauses.join(' OR ')}) ORDER BY c.published_at DESC LIMIT 2`, values);
      }
      if (recovered.length === 1) {
        relatedContents = recovered; relationStatus = 'recovered';
        await this.linkAlertContent(id, recovered[0].id);
      } else if (recovered.length > 1) relationStatus = 'ambiguous';
    }
    const matchedIds = new Set(relatedContents.map(item => item.id));
    const rootIds = [...new Set(relatedContents.map(item => item.root_content_id || item.id))];
    const relatedThreads = [];
    for (const rootId of rootIds) {
      const rows = await this.query('SELECT c.*, c.platform_author_id AS author_id FROM po_contents c WHERE c.id=? OR c.root_content_id=? ORDER BY c.content_depth, c.published_at ASC, c.id ASC', [rootId, rootId]);
      const root = rows.find(item => item.id === rootId);
      if (!root) continue;
      relatedThreads.push({ root, comments: rows.filter(item => item.id !== rootId), matched_content_ids: [...matchedIds].filter(contentId => contentId === rootId || rows.some(item => item.id === contentId)) });
    }
    return { ...alert, relation_status: relationStatus, related_contents: relatedContents, related_threads: relatedThreads };
  }
  async updateAlert(id, patch, scope = {}) {
    const current = await this.getAlert(id, scope);
    if (!current) return null;
    await this.query('UPDATE po_alerts SET status=COALESCE(?,status), assignee_id=COALESCE(?,assignee_id), resolution_note=COALESCE(?,resolution_note), resolved_at=CASE WHEN ? IN (\'resolved\',\'false_positive\') THEN NOW() ELSE resolved_at END WHERE id=?', [patch.status || null, patch.assigneeId || null, patch.resolutionNote || null, patch.status || null, id]);
    return this.getAlert(id, scope);
  }
  async createRun(sourceId) { const id = uuid(); await this.query('INSERT INTO po_collection_runs (id, source_id, status) VALUES (?, ?, ?)', [id, sourceId, 'running']); return (await this.query('SELECT * FROM po_collection_runs WHERE id=?', [id]))[0]; }
  async finishRun(id, patch) { await this.query('UPDATE po_collection_runs SET status=?, finished_at=NOW(), discovered_count=?, stored_count=?, analyzed_count=?, alerted_count=?, error_code=?, error_message=? WHERE id=?', [patch.status, patch.discoveredCount || 0, patch.storedCount || 0, patch.analyzedCount || 0, patch.alertedCount || 0, patch.errorCode || null, patch.errorMessage || null, id]); }
  // 回写源表「最近运行」状态：成功 → last_success_at=NOW()，last_error 清空；失败 → last_error 写错误信息。
  // 这样采集源列表页的"最近运行"列才能显示真实时间，而不是永远 "-"。
  async markSourceRun(sourceId, patch) {
    if (patch.status === 'success') await this.query('UPDATE po_sources SET last_success_at=NOW(), last_error=NULL WHERE id=?', [sourceId]);
    else if (patch.status === 'failed') await this.query('UPDATE po_sources SET last_error=? WHERE id=?', [patch.errorMessage || patch.errorCode || 'unknown', sourceId]);
  }
  async insertContent(source, raw) {
    const media = JSON.stringify(Array.isArray(raw.media) ? raw.media : []);
    const rawPayload = raw.rawPayload == null ? null : JSON.stringify(raw.rawPayload);
    const result = await this.query('INSERT INTO po_contents (id, game_id, community_id, source_id, external_id, content_type, author_name, title, body, media, published_at, source_url, engagement, fingerprint, raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE author_name=VALUES(author_name), title=VALUES(title), body=IF(CHAR_LENGTH(TRIM(VALUES(body))) > CHAR_LENGTH(TRIM(po_contents.body)), VALUES(body), po_contents.body), media=IF(JSON_LENGTH(VALUES(media)) > 0, VALUES(media), po_contents.media), published_at=VALUES(published_at), source_url=VALUES(source_url), engagement=VALUES(engagement), fingerprint=VALUES(fingerprint), raw_payload=IF(VALUES(raw_payload) IS NOT NULL, VALUES(raw_payload), po_contents.raw_payload)', [id, source.game_id, source.community_id || null, source.id, raw.externalId, raw.contentType, raw.authorName, raw.title, raw.body, media, raw.publishedAt, raw.sourceUrl, JSON.stringify(raw.engagement || {}), raw.fingerprint, rawPayload]);
    if (!result.affectedRows) return null;
    return (await this.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [source.id, raw.externalId]))[0] || null;
  }
  async getLightAnalysis(contentId) {
    // po_analyses 的唯一键是 content_id，deep 的 insertAnalysis 用 ON DUPLICATE KEY UPDATE 会覆盖 light 行
    // （analysis_level 从 'light' 变为 'deep'），导致查不到 light 的 severity。
    // 改从 po_analysis_cache 查：cache 按 cache_key（fingerprint+profile+model+version 组合）存储，
    // light 和 deep 各自独立，不会被覆盖。
    return (await this.query(
      "SELECT ac.severity, ac.analysis_profile, ac.sentiment, ac.summary, ac.reason FROM po_analysis_cache ac JOIN po_contents c ON c.fingerprint = ac.content_fingerprint WHERE c.id = ? AND ac.analysis_profile = 'light' ORDER BY ac.updated_at DESC LIMIT 1",
      [contentId]
    ))[0] || null;
  }
  async insertAnalysis(contentId, analysis) {
    await this.query('INSERT INTO po_analyses (id, content_id, analysis_level, analysis_version, content_fingerprint, trigger_reason, analysis_reason, sentiment, negative_score, confidence, quality_score, recommend_home, recommend_pin, recommend_feature, quality_reason, severity, topics, matched_keywords, summary, model_name, input_tokens, output_tokens, total_tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE analysis_level=VALUES(analysis_level), analysis_version=VALUES(analysis_version), content_fingerprint=VALUES(content_fingerprint), trigger_reason=VALUES(trigger_reason), analysis_reason=VALUES(analysis_reason), sentiment=VALUES(sentiment), negative_score=VALUES(negative_score), confidence=VALUES(confidence), quality_score=VALUES(quality_score), recommend_home=VALUES(recommend_home), recommend_pin=VALUES(recommend_pin), recommend_feature=VALUES(recommend_feature), quality_reason=VALUES(quality_reason), severity=VALUES(severity), topics=VALUES(topics), matched_keywords=VALUES(matched_keywords), summary=VALUES(summary), model_name=VALUES(model_name), input_tokens=VALUES(input_tokens), output_tokens=VALUES(output_tokens), total_tokens=VALUES(total_tokens), analyzed_at=NOW()', [uuid(), contentId, analysis.analysisLevel || analysis.profile || 'light', analysis.analysisVersion || 'sentiment-v2', analysis.contentFingerprint || null, analysis.triggerReason || null, analysis.reason || null, analysis.sentiment || 'neutral', Number.isFinite(Number(analysis.negativeScore)) ? Number(analysis.negativeScore) : 0, analysis.confidence == null ? 0 : Number(analysis.confidence), analysis.qualityScore == null ? 0 : Number(analysis.qualityScore), analysis.recommendHome ? 1 : 0, analysis.recommendPin ? 1 : 0, analysis.recommendFeature ? 1 : 0, analysis.qualityReason || null, analysis.severity, JSON.stringify(analysis.topics || []), JSON.stringify(analysis.matchedKeywords || []), analysis.summary || '', analysis.modelName || null, Number(analysis.usage?.inputTokens || analysis.inputTokens || 0), Number(analysis.usage?.outputTokens || analysis.outputTokens || 0), Number(analysis.usage?.totalTokens || analysis.totalTokens || 0)]);
  }
  async enqueueAnalysisJob(contentId, { profile = 'light', version = 'sentiment-v2', contentFingerprint, triggerReason, matchedKeywords = [], force = false } = {}) {
    const id = uuid();
    await this.query(`INSERT INTO po_analysis_jobs (id, content_id, analysis_profile, analysis_version, content_fingerprint, trigger_reason, matched_keywords, status) VALUES (?,?,?,?,?,?,?,'pending') ON DUPLICATE KEY UPDATE content_fingerprint=VALUES(content_fingerprint), trigger_reason=VALUES(trigger_reason), matched_keywords=VALUES(matched_keywords), status=IF(?,'pending',IF(status IN ('completed','running'),status,'pending')), attempts=IF(?,0,attempts), next_retry_at=IF(?,NULL,next_retry_at), error_code=IF(?,NULL,error_code), error_message=IF(?,NULL,error_message), updated_at=NOW()`, [id, contentId, profile, version, contentFingerprint, triggerReason || null, JSON.stringify(matchedKeywords || []), force ? 1 : 0, force ? 1 : 0, force ? 1 : 0, force ? 1 : 0, force ? 1 : 0]);
    return (await this.query('SELECT * FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=?', [contentId, profile, version]))[0] || null;
  }
  async claimAnalysisJobs({ profile, version, leaseOwner, leaseSeconds = 300, limit = 100, sourceId, accountId, gameId, communityId, publishedFrom, publishedTo, contentIds } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const claimOwner = `${leaseOwner || 'analysis'}:${uuid()}`;
    const params = [claimOwner, Number(leaseSeconds), profile, version];
    const clauses = ['c.is_deleted=0'];
    for (const [value, sql] of [[sourceId, 'c.source_id'], [accountId, 'c.account_id'], [gameId, 'c.game_id'], [communityId, 'c.community_id']]) if (value) { clauses.push(`${sql}=?`); params.push(value); }
    if (publishedFrom) { clauses.push('c.published_at>=?'); params.push(publishedFrom); }
    if (publishedTo) { clauses.push('c.published_at<?'); params.push(publishedTo); }
    if (Array.isArray(contentIds) && contentIds.length) {
      const ids = [...new Set(contentIds.map(value => String(value || '').trim()).filter(Boolean))];
      clauses.push(`c.id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
    params.push(safeLimit);
    await this.query(`UPDATE po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id SET j.status='running', j.lease_owner=?, j.lease_until=DATE_ADD(NOW(), INTERVAL ? SECOND), j.attempts=j.attempts+1, j.error_code=NULL, j.error_message=NULL WHERE j.analysis_profile=? AND j.analysis_version=? AND ${clauses.join(' AND ')} AND (j.status='pending' OR (j.status='retryable' AND (j.next_retry_at IS NULL OR j.next_retry_at<=NOW())) OR (j.status='running' AND j.lease_until<NOW())) ORDER BY j.created_at ASC LIMIT ?`, params);
    return this.query("SELECT j.*, c.game_id, c.community_id, c.source_id, c.account_id, c.content_type, c.external_id, c.author_name, c.title, c.body, c.media, c.published_at, c.fingerprint, c.is_deleted, s.platform, g.name AS game_name, g.region_code, cm.name AS community_name FROM po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_communities cm ON cm.id=c.community_id WHERE j.lease_owner=? AND j.status='running' AND j.analysis_profile=? AND j.analysis_version=? ORDER BY j.created_at ASC", [claimOwner, profile, version]);
  }
  async finishAnalysisJob(id, { leaseOwner, status = 'completed', errorCode, errorMessage, retryAt } = {}) { await this.query('UPDATE po_analysis_jobs SET status=?, error_code=?, error_message=?, next_retry_at=?, completed_at=CASE WHEN ?=\'completed\' THEN NOW() ELSE completed_at END, lease_owner=NULL, lease_until=NULL, updated_at=NOW() WHERE id=? AND lease_owner=?', [status, errorCode || null, errorMessage ? String(errorMessage).slice(0, 500) : null, retryAt || null, status, id, leaseOwner]); }
  async getAnalysisCache(cacheKeys = []) { if (!cacheKeys.length) return []; return this.query(`SELECT * FROM po_analysis_cache WHERE cache_key IN (${cacheKeys.map(() => '?').join(',')})`, cacheKeys); }
  async upsertAnalysisCache(entry) { await this.query('INSERT INTO po_analysis_cache (cache_key, content_fingerprint, analysis_profile, analysis_version, model_name, sentiment, negative_score, confidence, quality_score, recommend_home, recommend_pin, recommend_feature, quality_reason, severity, topics, summary, needs_deep, reason, input_tokens, output_tokens, total_tokens, usage_estimated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE sentiment=VALUES(sentiment), negative_score=VALUES(negative_score), confidence=VALUES(confidence), quality_score=VALUES(quality_score), recommend_home=VALUES(recommend_home), recommend_pin=VALUES(recommend_pin), recommend_feature=VALUES(recommend_feature), quality_reason=VALUES(quality_reason), severity=VALUES(severity), topics=VALUES(topics), summary=VALUES(summary), needs_deep=VALUES(needs_deep), reason=VALUES(reason), input_tokens=VALUES(input_tokens), output_tokens=VALUES(output_tokens), total_tokens=VALUES(total_tokens), usage_estimated=VALUES(usage_estimated), updated_at=NOW()', [entry.cacheKey, entry.contentFingerprint, entry.profile, entry.version, entry.modelName, entry.sentiment || 'neutral', Number.isFinite(Number(entry.negativeScore)) ? Number(entry.negativeScore) : 0, entry.confidence == null ? 0 : Number(entry.confidence), entry.qualityScore == null ? 0 : Number(entry.qualityScore), entry.recommendHome ? 1 : 0, entry.recommendPin ? 1 : 0, entry.recommendFeature ? 1 : 0, entry.qualityReason || null, entry.severity, JSON.stringify(entry.topics || []), entry.summary || '', entry.needsDeep ? 1 : 0, entry.reason || null, Number(entry.usage?.inputTokens || 0), Number(entry.usage?.outputTokens || 0), Number(entry.usage?.totalTokens || 0), entry.usage?.estimated ? 1 : 0]); }
  async upsertQualityCandidate(contentId, analysis = {}) {
    const recommended = Boolean(analysis.recommendHome || analysis.recommendPin || analysis.recommendFeature);
    const sentiment = String(analysis.sentiment || '').toLowerCase();
    const bodyLength = String(analysis.body || '').trim().length;
    const qualityScore = analysis.qualityScore == null ? null : Number(analysis.qualityScore);
    if (!recommended || sentiment === 'negative' || bodyLength < 50 || !Number.isFinite(qualityScore) || qualityScore < 0.8) {
      await this.query('DELETE FROM po_quality_candidates WHERE content_id=?', [contentId]);
      return null;
    }
    await this.query(`INSERT INTO po_quality_candidates (id, content_id, quality_score, recommend_home, recommend_pin, recommend_feature, quality_reason, analysis_version, model_name, content_fingerprint)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE quality_score=VALUES(quality_score), recommend_home=VALUES(recommend_home), recommend_pin=VALUES(recommend_pin), recommend_feature=VALUES(recommend_feature), quality_reason=VALUES(quality_reason), analysis_version=VALUES(analysis_version), model_name=VALUES(model_name), content_fingerprint=VALUES(content_fingerprint), updated_at=NOW()`,
    [uuid(), contentId, analysis.qualityScore == null ? null : Number(analysis.qualityScore), analysis.recommendHome ? 1 : 0, analysis.recommendPin ? 1 : 0, analysis.recommendFeature ? 1 : 0, analysis.qualityReason || null, analysis.analysisVersion || analysis.version || 'quality-v1', analysis.modelName || null, analysis.contentFingerprint || null]);
    return (await this.query('SELECT * FROM po_quality_candidates WHERE content_id=? LIMIT 1', [contentId]))[0] || null;
  }
  async cleanupInvalidQualityCandidates() {
    const result = await this.query(`DELETE q FROM po_quality_candidates q JOIN po_contents c ON c.id=q.content_id LEFT JOIN po_analyses a ON a.content_id=c.id WHERE a.sentiment='negative' OR (q.recommend_home=0 AND q.recommend_pin=0 AND q.recommend_feature=0)`);
    return Number(result.affectedRows || 0);
  }
  qualityContentFilter({ regionCode, gameId, communityId, sourceId, platform, recommendationType, reviewStatus, publishedFrom, publishedTo } = {}) {
    const values = []; const clauses = ['c.is_deleted=0', "COALESCE(a.sentiment,'') <> 'negative'", '(q.recommend_home=1 OR q.recommend_pin=1 OR q.recommend_feature=1)', 'CHAR_LENGTH(TRIM(COALESCE(c.body,\'\'))) >= 50', 'q.quality_score >= 0.8'];
    for (const [value, sql] of [[gameId, 'c.game_id'], [communityId, 'c.community_id'], [sourceId, 'c.source_id']]) if (value) { clauses.push(`${sql}=?`); values.push(value); }
    if (regionCode) { clauses.push('g.region_code=?'); values.push(regionCode); }
    if (platform) { clauses.push('s.platform=?'); values.push(platform); }
    if (publishedFrom) { clauses.push('c.published_at>=?'); values.push(publishedFrom); }
    if (publishedTo) { clauses.push('c.published_at<?'); values.push(publishedTo); }
    const recommendationColumns = { home: ['q.recommend_home', 'q.home_review_status'], pin: ['q.recommend_pin', 'q.pin_review_status'], feature: ['q.recommend_feature', 'q.feature_review_status'] };
    if (recommendationType) { const columns = recommendationColumns[recommendationType]; if (!columns) { const error = new Error('recommendationType is not supported'); error.code = 'INVALID_INPUT'; throw error; } clauses.push(`${columns[0]}=1`); if (reviewStatus) { clauses.push(`${columns[1]}=?`); values.push(reviewStatus); } }
    else if (reviewStatus) { clauses.push('((q.recommend_home=1 AND q.home_review_status=?) OR (q.recommend_pin=1 AND q.pin_review_status=?) OR (q.recommend_feature=1 AND q.feature_review_status=?))'); values.push(reviewStatus, reviewStatus, reviewStatus); }
    return { clauses, values };
  }
  async listQualityContents(filters = {}) {
    const { clauses, values } = this.qualityContentFilter(filters); const limit = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100); const page = Math.max(Number(filters.page) || 1, 1); const offset = (page - 1) * limit;
    return this.query(`SELECT q.*, c.game_id, c.community_id, c.source_id, c.content_type, c.external_id, c.author_name, c.title, c.body, c.media, c.published_at, c.source_url, c.engagement, c.fingerprint, s.platform, s.display_name AS source_name, g.name AS game_name, g.region_code, cm.name AS community_name, cm.status AS community_status FROM po_quality_candidates q JOIN po_contents c ON c.id=q.content_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id LEFT JOIN po_communities cm ON cm.id=c.community_id WHERE ${clauses.join(' AND ')} ORDER BY c.published_at DESC, q.quality_score DESC, q.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  }
  async countQualityContents(filters = {}) { const { clauses, values } = this.qualityContentFilter(filters); const rows = await this.query(`SELECT COUNT(*) AS total FROM po_quality_candidates q JOIN po_contents c ON c.id=q.content_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id WHERE ${clauses.join(' AND ')}`, values); return Number(rows[0]?.total || 0); }
  async getQualityContent(id, scope = {}) {
    const { clauses, values } = this.qualityContentFilter(scope); clauses.unshift('q.id=?'); values.unshift(id);
    const rows = await this.query(`SELECT q.*, c.game_id, c.community_id, c.source_id, c.content_type, c.external_id, c.author_name, c.title, c.body, c.media, c.published_at, c.source_url, c.engagement, c.fingerprint, s.platform, s.display_name AS source_name, g.name AS game_name, g.region_code, cm.name AS community_name, cm.status AS community_status FROM po_quality_candidates q JOIN po_contents c ON c.id=q.content_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analyses a ON a.content_id=c.id LEFT JOIN po_communities cm ON cm.id=c.community_id WHERE ${clauses.join(' AND ')} LIMIT 1`, values);
    return rows[0] || null;
  }
  async updateQualityCandidate(id, patch = {}, reviewerId = 'admin', scope = {}) {
    const current = await this.getQualityContent(id, scope);
    if (!current) return null;
    const fieldMap = { homeReviewStatus: 'home_review_status', homeAdopted: 'home_adopted', pinReviewStatus: 'pin_review_status', pinAdopted: 'pin_adopted', featureReviewStatus: 'feature_review_status', featureAdopted: 'feature_adopted', reviewNote: 'review_note' };
    const entries = Object.entries(patch).filter(([key, value]) => fieldMap[key] && value !== undefined);
    if (!entries.length) { const error = new Error('quality candidate patch is empty'); error.code = 'INVALID_INPUT'; throw error; }
    const setters = entries.map(([key]) => `${fieldMap[key]}=?`); const values = entries.map(([key, value]) => key.endsWith('Adopted') ? (value ? 1 : 0) : value);
    setters.push('reviewer_id=?', 'reviewed_at=NOW()', 'updated_at=NOW()'); values.push(reviewerId || 'admin', id);
    const result = await this.query(`UPDATE po_quality_candidates SET ${setters.join(', ')} WHERE id=?`, values);
    return result.affectedRows ? this.getQualityContent(id, scope) : null;
  }
  async addAiUsage({ profile, calls = 0, inputTokens = 0, outputTokens = 0, totalTokens = 0 } = {}) { await this.query('INSERT INTO po_ai_usage_daily (usage_date, profile, call_count, input_tokens, output_tokens, total_tokens) VALUES (UTC_DATE(),?,?,?,?,?) ON DUPLICATE KEY UPDATE call_count=call_count+VALUES(call_count), input_tokens=input_tokens+VALUES(input_tokens), output_tokens=output_tokens+VALUES(output_tokens), total_tokens=total_tokens+VALUES(total_tokens)', [profile, Number(calls), Number(inputTokens), Number(outputTokens), Number(totalTokens)]); return (await this.query('SELECT * FROM po_ai_usage_daily WHERE usage_date=UTC_DATE() AND profile=?', [profile]))[0]; }
  async enqueueAnalysisBatch({ contentIds = [], profile = 'light', version = 'sentiment-v2', triggerReason = 'q1_import' } = {}) {
    if (!Array.isArray(contentIds) || !contentIds.length) { const error = new Error('contentIds must be a non-empty array'); error.code = 'INVALID_INPUT'; throw error; }
    const uniqueIds = [...new Set(contentIds.map(value => String(value || '').trim()).filter(Boolean))];
    const result = { requested: uniqueIds.length, submitted: 0, skipped: 0, failed: 0, failedIds: [] };
    for (const contentId of uniqueIds) {
      const content = (await this.query('SELECT id, fingerprint, is_deleted FROM po_contents WHERE id=? LIMIT 1', [contentId]))[0];
      if (!content) { result.failed += 1; result.failedIds.push(contentId); continue; }
      if (content.is_deleted) { result.skipped += 1; continue; }
      const before = await this.query('SELECT status FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=? LIMIT 1', [contentId, profile, version]);
      const job = await this.enqueueAnalysisJob(contentId, { profile, version, contentFingerprint: content.fingerprint, triggerReason, force: false });
      if (before[0] && ['pending', 'running', 'completed'].includes(before[0].status)) result.skipped += 1;
      else if (job?.status === 'completed' || job?.status === 'running') result.skipped += 1;
      else result.submitted += 1;
    }
    return result;
  }
  async enqueueMissingAnalysis({ version = 'sentiment-v2', profile = 'light', limit = 100, accountId, regionCode, gameId, communityId, sourceId, contentType, publishedFrom, publishedTo, contentIds, force = false } = {}) {
    const values = [profile, version];
    const clauses = ['c.is_deleted=0', force ? "(j.id IS NULL OR j.status IN ('failed','retryable'))" : 'j.id IS NULL'];
    for (const [value, sql] of [[accountId, 'c.account_id'], [gameId, 'c.game_id'], [communityId, 'c.community_id'], [sourceId, 'c.source_id'], [contentType, 'c.content_type']]) {
      if (value) { values.push(value); clauses.push(`${sql}=?`); }
    }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (publishedFrom) { values.push(publishedFrom); clauses.push('c.published_at>=?'); }
    if (publishedTo) { values.push(publishedTo); clauses.push('c.published_at<?'); }
    if (Array.isArray(contentIds) && contentIds.length) {
      const ids = [...new Set(contentIds.map(value => String(value || '').trim()).filter(Boolean))];
      clauses.push(`c.id IN (${ids.map(() => '?').join(',')})`);
      values.push(...ids);
    }
    values.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
    const rows = await this.query(`SELECT c.id, c.fingerprint FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile=? AND j.analysis_version=? WHERE ${clauses.join(' AND ')} ORDER BY c.collected_at ASC LIMIT ?`, values);
    for (const row of rows) await this.enqueueAnalysisJob(row.id, { profile, version, contentFingerprint: row.fingerprint, triggerReason: 'version_backfill', force });
    return rows.length;
  }
  async countAnalysisJobs({ profile, version, sourceId, accountId, gameId, communityId, contentIds, contentType, sentiment, severity, analysisStatus, analysisLevel, keyword, publishedFrom, publishedTo } = {}) {
    const clauses = ['j.analysis_profile=?', 'j.analysis_version=?', 'c.is_deleted=0'];
    const values = [profile, version];
    for (const [value, sql] of [[sourceId, 'c.source_id'], [accountId, 'c.account_id'], [gameId, 'c.game_id'], [communityId, 'c.community_id'], [contentType, 'c.content_type']]) {
      if (value) { clauses.push(`${sql}=?`); values.push(value); }
    }
    if (Array.isArray(contentIds)) {
      const ids = [...new Set(contentIds.map(value => String(value || '').trim()).filter(Boolean))];
      if (!ids.length) return { pending: 0, running: 0, retryable: 0, completed: 0, failed: 0, total: 0, completionRate: 0, updatedAt: null };
      clauses.push(`c.id IN (${ids.map(() => '?').join(',')})`); values.push(...ids);
    }
    if (sentiment) { clauses.push('a.sentiment=?'); values.push(sentiment); }
    if (severity) { clauses.push('a.severity=?'); values.push(severity); }
    if (analysisStatus) { clauses.push('j.status=?'); values.push(analysisStatus); }
    if (analysisLevel) { clauses.push('j.analysis_profile=?'); values.push(analysisLevel); }
    if (keyword) { clauses.push('(c.title LIKE ? OR c.body LIKE ? OR c.author_name LIKE ?)'); const value = `%${keyword}%`; values.push(value, value, value); }
    if (publishedFrom) { clauses.push('c.published_at>=?'); values.push(publishedFrom); }
    if (publishedTo) { clauses.push('c.published_at<?'); values.push(publishedTo); }
    const rows = await this.query(`SELECT j.status, COUNT(*) AS count, MAX(j.updated_at) AS updated_at FROM po_analysis_jobs j JOIN po_contents c ON c.id=j.content_id LEFT JOIN po_analyses a ON a.content_id=c.id WHERE ${clauses.join(' AND ')} GROUP BY j.status`, values);
    const result = { pending: 0, running: 0, retryable: 0, completed: 0, failed: 0, total: 0, completionRate: 0, updatedAt: null };
    for (const row of rows) { if (Object.prototype.hasOwnProperty.call(result, row.status)) result[row.status] = Number(row.count || 0); if (row.updated_at && (!result.updatedAt || row.updated_at > result.updatedAt)) result.updatedAt = row.updated_at; }
    result.total = result.pending + result.running + result.retryable + result.completed + result.failed;
    result.completionRate = result.total ? Number((result.completed / result.total * 100).toFixed(1)) : 0;
    return result;
  }
  async countContentsByType({ publishedFrom, publishedTo } = {}) {
    const clauses = ['c.is_deleted=0'];
    const values = [];
    if (publishedFrom) { clauses.push('c.published_at>=?'); values.push(publishedFrom); }
    if (publishedTo) { clauses.push('c.published_at<?'); values.push(publishedTo); }
    const rows = await this.query(`SELECT c.content_type, COUNT(*) AS count FROM po_contents c WHERE ${clauses.join(' AND ')} GROUP BY c.content_type`, values);
    return Object.fromEntries(rows.map(row => [row.content_type, Number(row.count || 0)]));
  }
  async acquireAdvisoryLock(lockName, timeoutSeconds = 0) {
    const key = String(lockName).slice(0, 64);
    if (this.advisoryLocks.has(key)) return false;
    const connection = await this.pool.getConnection();
    try {
      const result = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [key, Math.max(0, Number(timeoutSeconds) || 0)]);
      const rows = Array.isArray(result[0]) ? result[0] : result;
      if (Number(rows[0]?.acquired) !== 1) { connection.release(); return false; }
      this.advisoryLocks.set(key, connection);
      return true;
    } catch (error) {
      connection.release();
      throw error;
    }
  }
  async releaseAdvisoryLock(lockName) {
    const key = String(lockName).slice(0, 64);
    const connection = this.advisoryLocks.get(key);
    if (!connection) return false;
    try {
      const result = await connection.query('SELECT RELEASE_LOCK(?) AS released', [key]);
      const rows = Array.isArray(result[0]) ? result[0] : result;
      return Number(rows[0]?.released) === 1;
    } finally {
      this.advisoryLocks.delete(key);
      connection.release();
    }
  }

  // ── 第一阶段：自有账号同步底座 ──
  async createAccount({ gameId, sourceId, platform, platformAccountId, accountName, accountType = 'official', profileUrl, enabled = true, authStatus = 'unconfigured', authExpireAt, metadata = {} } = {}) {
    const id = uuid();
    await this.query('INSERT INTO po_accounts (id, game_id, source_id, platform, platform_account_id, account_name, account_type, profile_url, enabled, auth_status, auth_expire_at, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, gameId, sourceId, platform, platformAccountId, accountName, accountType, profileUrl || null, enabled ? 1 : 0, authStatus, authExpireAt || null, JSON.stringify(metadata || {})]);
    return this.getAccount(id);
  }
  async getAccount(id) { return (await this.query('SELECT * FROM po_accounts WHERE id=?', [id]))[0] || null; }
  async listAccounts({ regionCode, gameId, communityId, sourceId, platform, enabled, authStatus } = {}) {
    const values = []; const clauses = [];
    for (const [value, sql] of [[gameId, 'a.game_id'], [communityId, 'a.community_id'], [sourceId, 'a.source_id'], [platform, 'a.platform'], [authStatus, 'a.auth_status']]) if (value) { values.push(value); clauses.push(`${sql}=?`); }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (enabled != null) { values.push(enabled ? 1 : 0); clauses.push('a.enabled=?'); }
    return this.query(`SELECT a.*, g.name AS game_name, g.region_code, c.name AS community_name, c.status AS community_status, s.display_name AS source_name FROM po_accounts a JOIN po_games g ON g.id=a.game_id JOIN po_sources s ON s.id=a.source_id LEFT JOIN po_communities c ON c.id=a.community_id ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY a.updated_at DESC`, values);
  }
  async updateAccount(id, patch = {}) {
    const fields = { platform_account_id: patch.platformAccountId, account_name: patch.accountName, account_type: patch.accountType, profile_url: patch.profileUrl, enabled: patch.enabled == null ? undefined : (patch.enabled ? 1 : 0), auth_status: patch.authStatus, auth_expire_at: patch.authExpireAt, last_full_sync_at: patch.lastFullSyncAt, last_incremental_sync_at: patch.lastIncrementalSyncAt, masked_login_identifier: patch.maskedLoginIdentifier, metadata: patch.metadata == null ? undefined : JSON.stringify(patch.metadata) };
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (!entries.length) return this.getAccount(id);
    await this.query(`UPDATE po_accounts SET ${entries.map(([key]) => `${key}=?`).join(', ')}, updated_at=NOW() WHERE id=?`, [...entries.map(([, value]) => value), id]);
    return this.getAccount(id);
  }
  async deleteAccount(id) { const result = await this.query('DELETE FROM po_accounts WHERE id=?', [id]); return Boolean(result.affectedRows); }
  async getDefaultAccount({ gameId, sourceId, platform } = {}) { const rows = await this.listAccounts({ gameId, sourceId, platform, enabled: true }); return rows[0] || null; }
  async getAccountCredentialSummary(accountId) { return this.query('SELECT id, account_id, credential_type, status, expire_at, last_checked_at, failure_reason, (secret_cipher IS NOT NULL) AS has_secret_cipher, (secret_ref IS NOT NULL AND secret_ref <> \'\') AS has_secret_ref FROM po_credentials WHERE account_id=? ORDER BY updated_at DESC', [accountId]); }
  async getCredentialByAccount(accountId, credentialType, { includeSecret = false } = {}) {
    const secretColumns = includeSecret ? ', secret_ref, secret_cipher' : '';
    const rows = await this.query(`SELECT id, account_id, credential_type, status, expire_at, last_checked_at, failure_reason${secretColumns} FROM po_credentials WHERE account_id=?${credentialType ? ' AND credential_type=?' : ''} ORDER BY updated_at DESC LIMIT 1`, credentialType ? [accountId, credentialType] : [accountId]);
    return rows[0] || null;
  }
  async upsertAccountCredential(accountId, { credentialType = 'api_token', secretCipher, secretRef, status = 'active', expireAt } = {}) {
    await this.query(`INSERT INTO po_credentials
      (id, account_id, source_id, credential_type, secret_ref, secret_cipher, status, expire_at)
      SELECT ?, a.id, a.source_id, ?, ?, ?, ?, ?
      FROM po_accounts a
      WHERE a.id=?
      ON DUPLICATE KEY UPDATE
        secret_cipher=COALESCE(VALUES(secret_cipher), secret_cipher),
        secret_ref=COALESCE(VALUES(secret_ref), secret_ref),
        status=COALESCE(VALUES(status), status),
        expire_at=COALESCE(VALUES(expire_at), expire_at),
        failure_reason=NULL,
        last_checked_at=NOW(),
        updated_at=NOW()`, [uuid(), credentialType, secretRef || '', secretCipher || null, status, expireAt || null, accountId]);
    return this.getCredentialByAccount(accountId, credentialType);
  }
  async clearAccountCredential(accountId, credentialType) {
    const result = await this.query('UPDATE po_credentials SET secret_cipher=NULL, secret_ref=NULL, status=\'unconfigured\', expire_at=NULL, failure_reason=NULL, last_checked_at=NULL, updated_at=NOW() WHERE account_id=? AND credential_type=?', [accountId, credentialType]);
    return Boolean(result.affectedRows);
  }
  async createAccountSession({ accountId, sessionType = 'direct_login', status = 'active', maskedLoginIdentifier, credentialId, expiresAt, metadata = {} } = {}) {
    const id = uuid();
    await this.query('INSERT INTO po_account_sessions (id, account_id, session_type, status, masked_login_identifier, credential_id, expires_at, metadata) VALUES (?,?,?,?,?,?,?,?)', [id, accountId, sessionType, status, maskedLoginIdentifier || null, credentialId || null, expiresAt || null, JSON.stringify(metadata || {})]);
    return (await this.query('SELECT * FROM po_account_sessions WHERE id=?', [id]))[0] || null;
  }
  async getAccountSession(id) { return (await this.query('SELECT * FROM po_account_sessions WHERE id=?', [id]))[0] || null; }
  async updateAccountSession(id, patch = {}) {
    const fields = { status: patch.status, masked_login_identifier: patch.maskedLoginIdentifier, expires_at: patch.expiresAt, last_used_at: patch.lastUsedAt, metadata: patch.metadata == null ? undefined : JSON.stringify(patch.metadata) };
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
    if (entries.length) await this.query(`UPDATE po_account_sessions SET ${entries.map(([key]) => `${key}=?`).join(', ')}, updated_at=NOW() WHERE id=?`, [...entries.map(([, value]) => value), id]);
    return this.getAccountSession(id);
  }
  async createLoginChallenge({ accountId, challengeType = 'direct_login', status = 'pending', challengeRef, maskedLoginIdentifier, expiresAt, metadata = {} } = {}) {
    const id = uuid();
    await this.query('INSERT INTO po_login_challenges (id, account_id, challenge_type, status, challenge_ref, masked_login_identifier, expires_at, metadata) VALUES (?,?,?,?,?,?,?,?)', [id, accountId, challengeType, status, challengeRef || null, maskedLoginIdentifier || null, expiresAt, JSON.stringify(metadata || {})]);
    return (await this.query('SELECT * FROM po_login_challenges WHERE id=?', [id]))[0] || null;
  }
  async getLoginChallenge(id) { return (await this.query('SELECT * FROM po_login_challenges WHERE id=?', [id]))[0] || null; }
  async updateLoginChallenge(id, patch = {}) { await this.query('UPDATE po_login_challenges SET status=COALESCE(?,status), completed_at=COALESCE(?,completed_at), metadata=COALESCE(?,metadata) WHERE id=?', [patch.status || null, patch.completedAt || null, patch.metadata == null ? null : JSON.stringify(patch.metadata), id]); return this.getLoginChallenge(id); }
  async upsertSourceCapability(sourceId, capability, { status = 'unknown', detail = {} } = {}) { await this.query('INSERT INTO po_source_capabilities (id, source_id, capability, status, detail) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), detail=VALUES(detail), checked_at=NOW()', [uuid(), sourceId, capability, status, JSON.stringify(detail || {})]); return (await this.query('SELECT * FROM po_source_capabilities WHERE source_id=? AND capability=?', [sourceId, capability]))[0] || null; }
  async listSourceCapabilities(sourceId) { return this.query('SELECT * FROM po_source_capabilities WHERE source_id=? ORDER BY capability', [sourceId]); }
  async recordAuditEvent({ gameId, sourceId, accountId, actorType = 'system', actorId, eventType, outcome = 'success', detail = {} } = {}) { const id = uuid(); await this.query('INSERT INTO po_audit_events (id, game_id, source_id, account_id, actor_type, actor_id, event_type, outcome, detail) VALUES (?,?,?,?,?,?,?,?,?)', [id, gameId || null, sourceId || null, accountId || null, actorType, actorId || null, eventType, outcome, JSON.stringify(detail || {})]); return (await this.query('SELECT * FROM po_audit_events WHERE id=?', [id]))[0] || null; }
  async listAuditEvents({ accountId, sourceId, eventType, limit = 100 } = {}) { const values = []; const clauses = []; for (const [value, sql] of [[accountId, 'account_id'], [sourceId, 'source_id'], [eventType, 'event_type']]) if (value) { values.push(value); clauses.push(`${sql}=?`); } values.push(Number(limit)); return this.query(`SELECT * FROM po_audit_events ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, values); }

  async getSyncCheckpoint({ accountId, syncScope, rootPlatformContentId = '', taskKind = 'sync', taskKey = '' }) { return (await this.query('SELECT * FROM po_sync_checkpoints WHERE account_id=? AND task_kind=? AND task_key=? AND sync_scope=? AND root_platform_content_id=?', [accountId, taskKind, taskKey, syncScope, rootPlatformContentId]))[0] || null; }
  async claimSyncCheckpoint({ accountId, syncScope, rootPlatformContentId = '', syncMode = 'incremental', taskKind = 'sync', taskKey = '', leaseOwner, leaseSeconds = 300 }) {
    if (syncScope === 'replies') return null;
    const id = uuid();
    await this.query('INSERT IGNORE INTO po_sync_checkpoints (id, account_id, task_kind, task_key, sync_scope, root_platform_content_id, sync_mode, status) VALUES (?,?,?,?,?,?,?,\'idle\')', [id, accountId, taskKind, taskKey, syncScope, rootPlatformContentId, syncMode]);
    const claimed = await this.query('UPDATE po_sync_checkpoints SET status=\'running\', lease_owner=?, lease_until=DATE_ADD(NOW(), INTERVAL ? SECOND), sync_mode=?, error_code=NULL, error_message=NULL WHERE account_id=? AND task_kind=? AND task_key=? AND sync_scope=? AND root_platform_content_id=? AND (status IN (\'idle\',\'failed\',\'completed\') OR (status=\'running\' AND lease_until<NOW()))', [leaseOwner || null, Number(leaseSeconds), syncMode, accountId, taskKind, taskKey, syncScope, rootPlatformContentId]);
    if (!claimed.affectedRows) return null;
    const checkpoint = await this.getSyncCheckpoint({ accountId, taskKind, taskKey, syncScope, rootPlatformContentId });
    return checkpoint && checkpoint.status === 'running' && checkpoint.lease_owner === (leaseOwner || null) ? checkpoint : null;
  }
  async releaseSyncCheckpoint(id, patch = {}) {
    const ownership = patch.leaseOwner == null ? '' : ' AND lease_owner=?';
    const cursorSql = Object.prototype.hasOwnProperty.call(patch, 'cursor') ? '`cursor`=?' : '`cursor`=`cursor`';
    const params = [patch.status || 'idle', patch.lastItemAt || null, patch.itemsFetched == null ? null : Number(patch.itemsFetched), patch.errorCode || null, patch.errorMessage || null, id];
    if (Object.prototype.hasOwnProperty.call(patch, 'cursor')) params.splice(1, 0, patch.cursor);
    if (patch.leaseOwner != null) params.push(patch.leaseOwner);
    await this.query('UPDATE po_sync_checkpoints SET status=COALESCE(?,status), ' + cursorSql + ', last_item_at=COALESCE(?,last_item_at), items_fetched=COALESCE(?,items_fetched), error_code=?, error_message=?, lease_owner=NULL, lease_until=NULL WHERE id=?' + ownership, params);
    return (await this.query('SELECT * FROM po_sync_checkpoints WHERE id=?', [id]))[0] || null;
  }
  async pauseSyncCheckpoint(id, patch = {}) { return this.releaseSyncCheckpoint(id, { ...patch, status: 'paused' }); }
  async resetSyncCheckpoint({ accountId, syncScope, rootPlatformContentId = '', taskKind = 'sync', taskKey = '' }) { await this.query('UPDATE po_sync_checkpoints SET status=\'idle\', `cursor`=NULL, items_fetched=0, last_item_at=NULL, error_code=NULL, error_message=NULL, lease_owner=NULL, lease_until=NULL WHERE account_id=? AND task_kind=? AND task_key=? AND sync_scope=? AND root_platform_content_id=?', [accountId, taskKind, taskKey, syncScope, rootPlatformContentId]); return this.getSyncCheckpoint({ accountId, taskKind, taskKey, syncScope, rootPlatformContentId }); }
  async getSyncStatus({ accountId, syncScope } = {}) {
    if (syncScope === 'replies') return [];
    return this.query(`SELECT * FROM po_sync_checkpoints WHERE account_id=? AND sync_scope<>'replies'${syncScope ? ' AND sync_scope=?' : ''} ORDER BY sync_scope, root_platform_content_id`, syncScope ? [accountId, syncScope] : [accountId]);
  }
  async listSyncParents(accountId, syncScope, { includeCompleted = false, includeFailed = false, publishedFrom = null, publishedTo = null, limit = 0 } = {}) {
    if (syncScope === 'comments') {
      const pendingStatuses = includeFailed ? "('idle','failed')" : "('idle')";
      const checkpointClause = includeCompleted
        ? "(cp.id IS NULL OR cp.status<>'running' OR cp.lease_until IS NULL OR cp.lease_until<NOW())"
        : `(cp.id IS NULL OR cp.status IN ${pendingStatuses} OR (cp.status='running' AND (cp.lease_until IS NULL OR cp.lease_until<NOW())))`;
      const predicates = ['c.account_id=?', 'c.content_depth=0', 'c.is_deleted=0', checkpointClause];
      const params = [accountId];
      if (publishedFrom != null) { predicates.push('c.published_at>=?'); params.push(publishedFrom); }
      if (publishedTo != null) { predicates.push('c.published_at<?'); params.push(publishedTo); }
      const safeLimit = Number(limit) > 0 ? Math.min(Number(limit), 10000) : 0;
      if (safeLimit) params.push(safeLimit);
      return this.query(`SELECT c.external_id AS root_platform_content_id, c.external_id AS post_platform_id FROM po_contents c LEFT JOIN po_sync_checkpoints cp ON cp.account_id=c.account_id AND cp.sync_scope='comments' AND cp.task_kind='comments' AND cp.task_key=c.external_id AND cp.root_platform_content_id=c.external_id WHERE ${predicates.join(' AND ')} ORDER BY c.published_at IS NULL, c.published_at DESC${safeLimit ? ' LIMIT ?' : ''}`, params);
    }
    return [];
  }
  async createSyncRun(accountId, { syncMode = 'incremental', status = 'running' } = {}) { const id = uuid(); await this.query('INSERT INTO po_sync_runs (id, account_id, status, sync_mode, started_at) VALUES (?,?,?,?,CASE WHEN ?=\'running\' THEN NOW() ELSE NULL END)', [id, accountId, status, syncMode, status]); return this.getSyncRun(id); }
  async enqueueSyncRun({ sourceId, accountId, syncMode = 'incremental' } = {}) {
    const active = await this.getLatestSyncRunForSource(sourceId, { accountId });
    if (active && ['queued', 'running'].includes(active.status)) return active;
    return this.createSyncRun(accountId, { syncMode, status: 'queued' });
  }
  async listRunnableSyncRuns({ limit = 100 } = {}) {
    return this.query(`SELECT r.*, s.id AS source_id, s.game_id, s.community_id, s.platform, s.source_type, s.display_name, s.enabled, s.frequency_seconds, s.config, s.active_window, s.auth_status, s.auth_expire_at, s.collect_requested_at, s.last_success_at, g.name AS game_name, g.region_code, g.enabled AS game_enabled, c.name AS community_name, c.status AS community_status FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id JOIN po_sources s ON s.id=a.source_id JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.enabled=1 AND g.enabled=1 AND c.status='enabled' AND ${NOT_DELETED} AND (r.status='queued' OR (r.status='running' AND (r.lease_until IS NULL OR r.lease_until<NOW()))) ORDER BY CASE WHEN r.status='queued' THEN 0 ELSE 1 END, r.created_at ASC LIMIT ?`, [Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }
  async getSyncRun(id, { accountId, sourceId, regionCode, gameId, communityId } = {}) {
    const params = [id]; const clauses = ['r.id=?'];
    for (const [value, sql] of [[accountId, 'r.account_id'], [sourceId, 'a.source_id'], [gameId, 'a.game_id'], [communityId, 'a.community_id']]) if (value) { clauses.push(`${sql}=?`); params.push(value); }
    if (regionCode) { clauses.push('g.region_code=?'); params.push(regionCode); }
    return (await this.query(`SELECT r.id,r.account_id,r.status,r.sync_mode,r.requested_at,r.created_at,r.started_at,r.finished_at,r.discovered_count,r.stored_count,r.fetched_count,r.inserted_count,r.changed_count,r.unchanged_count,r.comment_count,r.error_code,r.error_message,a.game_id,a.community_id,a.platform,a.platform_account_id,a.account_name,s.id AS source_id,s.display_name AS source_name,g.name AS game_name,g.region_code,c.name AS community_name,c.status AS community_status FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id JOIN po_sources s ON s.id=a.source_id JOIN po_games g ON g.id=a.game_id LEFT JOIN po_communities c ON c.id=a.community_id WHERE ${clauses.join(' AND ')} LIMIT 1`, params))[0] || null;
  }
  async getLatestSyncRunForSource(sourceId, { accountId } = {}) { const params = [sourceId]; const accountClause = accountId ? ' AND r.account_id=?' : ''; if (accountId) params.push(accountId); return (await this.query(`SELECT r.*, a.source_id FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id WHERE a.source_id=?${accountClause} ORDER BY CASE WHEN r.status IN ('queued','running') THEN 0 ELSE 1 END, r.created_at DESC LIMIT 1`, params))[0] || null; }
  async listSyncRuns({ accountId, sourceId, regionCode, gameId, communityId, platform, status, syncMode, startedFrom, startedTo, runId, page = 1, pageSize = 20 } = {}) {
    const values = []; const clauses = [];
    for (const [value, sql] of [[accountId, 'r.account_id'], [sourceId, 'a.source_id'], [gameId, 'a.game_id'], [communityId, 'a.community_id'], [platform, 'a.platform'], [status, 'r.status'], [syncMode, 'r.sync_mode'], [runId, 'r.id']]) if (value) { clauses.push(`${sql}=?`); values.push(value); }
    if (regionCode) { clauses.push('g.region_code=?'); values.push(regionCode); }
    if (startedFrom) { clauses.push('COALESCE(r.started_at,r.requested_at,r.created_at)>=?'); values.push(startedFrom); }
    if (startedTo) { clauses.push('COALESCE(r.started_at,r.requested_at,r.created_at)<?'); values.push(startedTo); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''; const base = `FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id JOIN po_sources s ON s.id=a.source_id JOIN po_games g ON g.id=a.game_id LEFT JOIN po_communities c ON c.id=a.community_id ${where}`;
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100); const currentPage = Math.max(Number(page) || 1, 1); const offset = (currentPage - 1) * limit;
    const [countRows, items] = await Promise.all([this.query(`SELECT COUNT(*) AS total ${base}`, values), this.query(`SELECT r.id,r.account_id,r.status,r.sync_mode,r.requested_at,r.created_at,r.started_at,r.finished_at,r.discovered_count,r.stored_count,r.fetched_count,r.inserted_count,r.changed_count,r.unchanged_count,r.comment_count,r.error_code,r.error_message,a.game_id,a.community_id,a.platform,a.platform_account_id,a.account_name,s.id AS source_id,s.display_name AS source_name,g.name AS game_name,g.region_code,c.name AS community_name,c.status AS community_status ${base} ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset])]);
    return { items, total: Number(countRows[0]?.total || 0), page: currentPage, pageSize: limit };
  }
  async getDeletePreview(runId) {
    const run = await this.getSyncRun(runId); if (!run) return null;
    const rows = await this.query(`SELECT DISTINCT rc.content_id, EXISTS(SELECT 1 FROM po_sync_run_contents x WHERE x.content_id=rc.content_id AND x.run_id<>rc.run_id) AS shared, EXISTS(SELECT 1 FROM po_alert_contents ac WHERE ac.content_id=rc.content_id) AS alert_protected, EXISTS(SELECT 1 FROM po_quality_candidates qc WHERE qc.content_id=rc.content_id) AS quality_protected, EXISTS(SELECT 1 FROM po_contents child WHERE child.root_content_id=rc.content_id OR child.parent_content_id=rc.content_id) AS ancestor_protected FROM po_sync_run_contents rc WHERE rc.run_id=?`, [runId]);
    const orphan = rows.filter(row => !Number(row.shared));
    return { associationCount: rows.length, orphanCandidateCount: orphan.length, deletableOrphanCount: orphan.filter(row => !Number(row.alert_protected) && !Number(row.quality_protected) && !Number(row.ancestor_protected)).length, alertProtectedCount: orphan.filter(row => Number(row.alert_protected)).length, qualityProtectedCount: orphan.filter(row => Number(row.quality_protected)).length, retainedSharedCount: rows.filter(row => Number(row.shared)).length, ancestorProtectedCount: orphan.filter(row => Number(row.ancestor_protected)).length, confirmationSuffix: String(runId).slice(-6) };
  }
  async deleteSyncRun(runId, confirmation) {
    const terminal = new Set(['completed','completed_full','completed_authorized_scope','partial','awaiting_manual_verification','failed','cancelled','canceled']); const conn = await this.pool.getConnection();
    try { await conn.beginTransaction(); const result = await conn.query('SELECT r.id,r.status,r.account_id,a.game_id,a.source_id FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id WHERE r.id=? FOR UPDATE', [runId]); const rows = Array.isArray(result[0]) ? result[0] : result; const run = rows[0];
      if (!run) { const e = new Error('sync run not found'); e.code = 'NOT_FOUND'; throw e; } if (!terminal.has(run.status)) { const e = new Error('sync run is still active'); e.code = 'RUN_ACTIVE'; throw e; } if (String(confirmation || '') !== String(runId).slice(-6)) { const e = new Error('confirmation does not match run id suffix'); e.code = 'INVALID_CONFIRMATION'; throw e; }
      const idResult = await conn.query('SELECT DISTINCT content_id FROM po_sync_run_contents WHERE run_id=? FOR UPDATE', [runId]); const contentIds = (Array.isArray(idResult[0]) ? idResult[0] : idResult).map(row => row.content_id);
      const associations = [];
      for (const contentId of contentIds) {
        await conn.query('SELECT id FROM po_contents WHERE id=? FOR UPDATE', [contentId]);
        const protectionResult = await conn.query(`SELECT EXISTS(SELECT 1 FROM po_sync_run_contents x WHERE x.content_id=? AND x.run_id<>?) AS shared, EXISTS(SELECT 1 FROM po_alert_contents ac WHERE ac.content_id=?) AS alert_protected, EXISTS(SELECT 1 FROM po_quality_candidates qc WHERE qc.content_id=?) AS quality_protected, EXISTS(SELECT 1 FROM po_contents child WHERE child.root_content_id=? OR child.parent_content_id=?) AS ancestor_protected`, [contentId, runId, contentId, contentId, contentId, contentId]);
        const protectionRows = Array.isArray(protectionResult[0]) ? protectionResult[0] : protectionResult;
        associations.push({ content_id: contentId, ...(protectionRows[0] || {}) });
      }
      const deletable = associations.filter(row => !Number(row.shared) && !Number(row.alert_protected) && !Number(row.quality_protected) && !Number(row.ancestor_protected)).map(row => row.content_id); const sharedCount = associations.filter(row => Number(row.shared)).length; const alertProtectedCount = associations.filter(row => !Number(row.shared) && Number(row.alert_protected)).length; const qualityProtectedCount = associations.filter(row => !Number(row.shared) && Number(row.quality_protected)).length; const ancestorProtectedCount = associations.filter(row => !Number(row.shared) && Number(row.ancestor_protected)).length;
      await conn.query('DELETE FROM po_sync_runs WHERE id=?', [runId]); for (const contentId of deletable) await conn.query('DELETE FROM po_contents WHERE id=?', [contentId]); const detail = { runId, associationCount: associations.length, deletedContentCount: deletable.length, retainedSharedCount: sharedCount, alertProtectedCount, qualityProtectedCount, ancestorProtectedCount }; await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)', [uuid(), run.game_id, run.source_id, run.account_id, 'system', 'sync_run_deleted', 'success', JSON.stringify(detail)]); await conn.commit(); return { deleted: true, ...detail };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  async claimSyncRun({ runId, accountId, leaseOwner, leaseSeconds = 300 } = {}) {
    const params = [leaseOwner || null, Number(leaseSeconds)];
    let where = "status='queued' OR (status='running' AND (lease_until IS NULL OR lease_until<NOW()))";
    if (runId) { where = `id=? AND (${where})`; params.push(runId); }
    else if (accountId) { where = `account_id=? AND (${where}) ORDER BY created_at ASC LIMIT 1`; params.push(accountId); }
    else where = `(${where}) ORDER BY created_at ASC LIMIT 1`;
    const result = await this.query(`UPDATE po_sync_runs SET status='running', started_at=COALESCE(started_at,NOW()), lease_owner=?, lease_until=DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at=NOW() WHERE ${where}`, params);
    if (!result.affectedRows) return null;
    if (runId) return this.getSyncRun(runId, { accountId });
    return (await this.query('SELECT * FROM po_sync_runs WHERE lease_owner=? AND status=\'running\' ORDER BY updated_at DESC LIMIT 1', [leaseOwner || null]))[0] || null;
  }
  async finishSyncRun(id, patch = {}) { const params = [patch.status || 'completed_full', patch.discoveredCount == null ? null : Number(patch.discoveredCount), patch.storedCount == null ? null : Number(patch.storedCount), patch.errorCode || null, patch.errorMessage || null, id]; let ownership = ''; if (patch.leaseOwner != null) { ownership = ' AND lease_owner=?'; params.push(patch.leaseOwner); } await this.query(`UPDATE po_sync_runs SET status=?, finished_at=NOW(), discovered_count=COALESCE(?,discovered_count), stored_count=COALESCE(?,stored_count), error_code=?, error_message=?, lease_owner=NULL, lease_until=NULL, updated_at=NOW() WHERE id=?${ownership}`, params); return this.getSyncRun(id); }
  async listSyncRunContents(runId, { accountId, sourceId, regionCode, gameId, communityId, syncScope = 'posts', after = 0, limit = 50 } = {}) { const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100); const params = [runId, syncScope, Number(after) || 0]; const clauses = ['rc.run_id=?', 'rc.sync_scope=?', 'rc.sequence_no>?']; for (const [value, sql] of [[accountId, 'r.account_id'], [sourceId, 'a.source_id'], [gameId, 'a.game_id'], [communityId, 'a.community_id']]) if (value) { clauses.push(`${sql}=?`); params.push(value); } if (regionCode) { clauses.push('g.region_code=?'); params.push(regionCode); } params.push(safeLimit); return this.query(`SELECT rc.sequence_no, rc.change_type, rc.sync_scope, rc.fetched_at, c.id, c.external_id, c.content_type, c.community_id, c.platform_author_id, c.author_name, c.title, c.body, c.media, c.published_at, c.source_url, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.engagement,'$.comments')) AS UNSIGNED),CAST(JSON_UNQUOTE(JSON_EXTRACT(c.engagement,'$.comment')) AS UNSIGNED),0) AS comment_count FROM po_sync_run_contents rc JOIN po_sync_runs r ON r.id=rc.run_id JOIN po_accounts a ON a.id=r.account_id JOIN po_games g ON g.id=a.game_id JOIN po_contents c ON c.id=rc.content_id AND c.account_id=a.id AND c.source_id=a.source_id AND c.game_id=a.game_id AND (c.community_id<=>a.community_id) WHERE ${clauses.join(' AND ')} ORDER BY rc.sequence_no ASC LIMIT ?`, params); }

  async importContentBatch({ sourceId, accountId, items = [], feeds = [] } = {}) {
    const source = (await this.query('SELECT * FROM po_sources WHERE id=? LIMIT 1', [sourceId]))[0] || null;
    if (!source) { const error = new Error('source not found'); error.code = 'NOT_FOUND'; throw error; }
    if (!source.enabled) { const error = new Error('source is disabled'); error.code = 'SOURCE_DISABLED'; throw error; }
    const account = accountId ? await this.getAccount(accountId) : await this.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform });
    if (!account || String(account.source_id) !== String(source.id)) { const error = new Error('account does not belong to source'); error.code = 'ACCOUNT_SCOPE_MISMATCH'; throw error; }
    if (!Array.isArray(items)) { const error = new Error('items must be an array'); error.code = 'INVALID_INPUT'; throw error; }
    const feedByKey = new Map((Array.isArray(feeds) ? feeds : []).filter(feed => feed && feed.feedKey).map(feed => [String(feed.feedKey), feed]));
    const seen = new Set();
    for (const item of items) {
      if (!item || !item.externalId) { const error = new Error('each item requires externalId'); error.code = 'INVALID_INPUT'; throw error; }
      if (seen.has(String(item.externalId))) { const error = new Error(`duplicate externalId: ${item.externalId}`); error.code = 'INVALID_INPUT'; throw error; }
      seen.add(String(item.externalId));
      if (!['post', 'comment'].includes(item.contentType)) { const error = new Error(`unsupported contentType: ${item.contentType}`); error.code = 'INVALID_INPUT'; throw error; }
      const contentDepth = item.contentDepth == null ? (item.contentType === 'post' ? 0 : 1) : Number(item.contentDepth);
      if (!Number.isInteger(contentDepth) || contentDepth < 0) { const error = new Error(`invalid contentDepth: ${item.externalId}`); error.code = 'INVALID_INPUT'; throw error; }
      item.contentDepth = contentDepth;
      if (!item.fingerprint) item.fingerprint = crypto.createHash('sha256').update(`${account.id}:${item.contentType}:${item.externalId}`).digest('hex');
    }
    const totals = { items: items.length, inserted: 0, changed: 0, unchanged: 0, batches: 0, contents: [], analysisEligibleIds: [] };
    const collect = committed => {
      for (const entry of committed.contents || []) {
        if (entry?.change && totals[entry.change] != null) totals[entry.change] += 1;
        if (entry?.content) {
          const result = { contentId: entry.content.id, externalId: entry.content.external_id, contentType: entry.content.content_type, change: entry.change };
          totals.contents.push(result);
          if (entry.change === 'inserted' || entry.change === 'changed') totals.analysisEligibleIds.push(entry.content.id);
        }
      }
      totals.batches += 1;
    };
    const posts = items.filter(item => item.contentType === 'post');
    const comments = items.filter(item => item.contentType === 'comment').sort((a, b) => Number(a.contentDepth || 0) - Number(b.contentDepth || 0) || String(a.externalId).localeCompare(String(b.externalId)));
    const postGroups = new Map();
    for (const item of posts) {
      const key = item.feed?.feedKey ? String(item.feed.feedKey) : '__default__';
      if (!postGroups.has(key)) postGroups.set(key, []);
      postGroups.get(key).push(item);
    }
    for (const [key, group] of postGroups) {
      const committed = await this.upsertContentPage({ account, syncScope: 'posts', items: group, hasMore: false, feed: key === '__default__' ? null : (feedByKey.get(key) || group[0].feed) });
      collect(committed);
    }
    const commentsByDepth = new Map();
    for (const item of comments) {
      const depth = Number(item.contentDepth || 1);
      if (!commentsByDepth.has(depth)) commentsByDepth.set(depth, []);
      commentsByDepth.get(depth).push(item);
    }
    for (const depth of [...commentsByDepth.keys()].sort((a, b) => a - b)) {
      const committed = await this.upsertContentPage({ account, syncScope: 'comments', items: commentsByDepth.get(depth), hasMore: false });
      collect(committed);
    }
    return { ...totals, sourceId: source.id, accountId: account.id };
  }

  async upsertContentPage(input = {}) {
    let committed;
    for (let attempt = 0; attempt < this.syncUpsertMaxAttempts; attempt += 1) {
      try {
        committed = await this._upsertContentPageAttempt(input);
        break;
      } catch (error) {
        const retryable = error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT';
        if (!retryable || attempt + 1 >= this.syncUpsertMaxAttempts) throw error;
        const backoff = this.syncUpsertRetryBaseMs * 2 ** attempt;
        const jitter = backoff ? Math.floor(Math.random() * backoff) : 0;
        await new Promise(resolve => setTimeout(resolve, backoff + jitter));
      }
    }
    const checkpointId = input.checkpointId;
    const checkpoint = checkpointId ? (await this.query('SELECT * FROM po_sync_checkpoints WHERE id=?', [checkpointId]))[0] || null : null;
    return { ...committed, checkpoint };
  }
  async _upsertContentPageAttempt({ account, syncRunId, syncScope, rootPlatformContentId = '', items = [], nextCursor = null, hasMore = false, syncMode = 'incremental', checkpointId, leaseOwner, leaseSeconds = 300, lastItemAt = null, feed = null } = {}) {
    const conn = await this.pool.getConnection(); const contents = []; let storedCount = 0; let transactionStarted = false;
    try {
      await conn.query('SET SESSION innodb_lock_wait_timeout=?', [this.syncUpsertLockWaitSeconds]);
      if (syncRunId) {
        const runRows = (await conn.query('SELECT r.id FROM po_sync_runs r JOIN po_accounts a ON a.id=r.account_id WHERE r.id=? AND r.account_id=? AND a.source_id=?', [syncRunId, account.id, account.source_id]))[0];
        if (!runRows?.[0]) { const error = new Error('sync run does not belong to account/source'); error.code = 'SYNC_RUN_SCOPE_MISMATCH'; throw error; }
      }
      await conn.beginTransaction(); transactionStarted = true;
      let fetchedCount = 0; let insertedCount = 0; let changedCount = 0; let unchangedCount = 0; let commentCount = 0;
      const orderedItems = items.map((raw, index) => ({ raw, index })).sort((left, right) => String(left.raw.externalId || '').localeCompare(String(right.raw.externalId || '')) || left.index - right.index);
      for (const { raw, index: sourceIndex } of orderedItems) {
        const id = uuid();
        const existingResult = await conn.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [account.source_id, raw.externalId]);
        const existingRows = Array.isArray(existingResult[0]) ? existingResult[0] : [];
        const existing = existingRows[0] && existingRows[0].external_id != null ? existingRows[0] : null;
        const rootExternalId = raw.rootPlatformContentId || (syncScope === 'posts' ? null : rootPlatformContentId);
        const parentExternalId = raw.platformParentId || (syncScope === 'comments' ? rootPlatformContentId : null);
        const rootRow = rootExternalId ? (await conn.query('SELECT id FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [account.source_id, rootExternalId]))[0]?.[0] : null;
        const parentRow = parentExternalId ? (await conn.query('SELECT id FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [account.source_id, parentExternalId]))[0]?.[0] : null;
        const engagement = JSON.stringify(raw.engagement || {}); const media = JSON.stringify(Array.isArray(raw.media) ? raw.media : []); const rawPayload = raw.rawPayload == null ? null : JSON.stringify(raw.rawPayload);
        const comparable = [raw.contentType || (syncScope === 'posts' ? 'post' : 'comment'), raw.platformAuthorId || null, rootRow?.id || null, parentRow?.id || null, parentExternalId || null, Number(raw.contentDepth || 0), raw.isDeleted ? 1 : 0, raw.authorName || null, raw.title || null, raw.body || '', comparableDate(raw.publishedAt), raw.sourceUrl || '', comparableJson(raw.engagement, {}), comparableJson(raw.media, []), raw.fingerprint || null, comparableJson(raw.rawPayload, null)];
        const previous = existing && [existing.content_type, existing.platform_author_id, existing.root_content_id, existing.parent_content_id, existing.platform_parent_id, Number(existing.content_depth || 0), Number(existing.is_deleted || 0), existing.author_name, existing.title, existing.body, comparableDate(existing.published_at), existing.source_url, comparableJson(existing.engagement, {}), comparableJson(existing.media, []), existing.fingerprint, comparableJson(existing.raw_payload, null)];
        const change = !existing ? 'inserted' : JSON.stringify(previous) === JSON.stringify(comparable) ? 'unchanged' : 'changed';
        if (account.community_id) {
          await conn.query('INSERT INTO po_contents (id, game_id, community_id, source_id, account_id, external_id, content_type, platform_author_id, root_content_id, parent_content_id, platform_parent_id, content_depth, is_deleted, author_name, title, body, media, published_at, source_url, engagement, fingerprint, raw_payload, first_seen_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id), community_id=VALUES(community_id), content_type=VALUES(content_type), platform_author_id=VALUES(platform_author_id), root_content_id=VALUES(root_content_id), parent_content_id=VALUES(parent_content_id), platform_parent_id=VALUES(platform_parent_id), content_depth=VALUES(content_depth), is_deleted=VALUES(is_deleted), author_name=VALUES(author_name), title=VALUES(title), body=VALUES(body), media=VALUES(media), published_at=VALUES(published_at), source_url=VALUES(source_url), engagement=VALUES(engagement), fingerprint=VALUES(fingerprint), raw_payload=VALUES(raw_payload), last_seen_at=NOW()', [id, account.game_id, account.community_id, account.source_id, account.id, raw.externalId, raw.contentType || (syncScope === 'posts' ? 'post' : 'comment'), raw.platformAuthorId || null, rootRow?.id || null, parentRow?.id || null, parentExternalId || null, Number(raw.contentDepth || 0), raw.isDeleted ? 1 : 0, raw.authorName || null, raw.title || null, raw.body || '', JSON.stringify(raw.media || []), raw.publishedAt || null, raw.sourceUrl || '', engagement, raw.fingerprint || null, rawPayload]);
        } else {
          await conn.query('INSERT INTO po_contents (id, game_id, source_id, account_id, external_id, content_type, platform_author_id, root_content_id, parent_content_id, platform_parent_id, content_depth, is_deleted, author_name, title, body, media, published_at, source_url, engagement, fingerprint, raw_payload, first_seen_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id), content_type=VALUES(content_type), platform_author_id=VALUES(platform_author_id), root_content_id=VALUES(root_content_id), parent_content_id=VALUES(parent_content_id), platform_parent_id=VALUES(platform_parent_id), content_depth=VALUES(content_depth), is_deleted=VALUES(is_deleted), author_name=VALUES(author_name), title=VALUES(title), body=VALUES(body), media=VALUES(media), published_at=VALUES(published_at), source_url=VALUES(source_url), engagement=VALUES(engagement), fingerprint=VALUES(fingerprint), raw_payload=VALUES(raw_payload), last_seen_at=NOW()', [id, account.game_id, account.source_id, account.id, raw.externalId, raw.contentType || (syncScope === 'posts' ? 'post' : 'comment'), raw.platformAuthorId || null, rootRow?.id || null, parentRow?.id || null, parentExternalId || null, Number(raw.contentDepth || 0), raw.isDeleted ? 1 : 0, raw.authorName || null, raw.title || null, raw.body || '', JSON.stringify(raw.media || []), raw.publishedAt || null, raw.sourceUrl || '', engagement, raw.fingerprint || null, rawPayload]);
        }
        if (change !== 'unchanged') storedCount += 1;
        const row = (await conn.query('SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [account.source_id, raw.externalId]))[0]?.[0];
        if (row) {
          contents[sourceIndex] = { content: row, change };
          if (feed?.feedKey && syncScope === 'posts') {
            await conn.query('INSERT INTO po_content_feed_memberships (id, account_id, content_id, feed_key, page_kind, section_id, feed_metadata) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE page_kind=VALUES(page_kind), section_id=VALUES(section_id), feed_metadata=VALUES(feed_metadata), last_seen_at=NOW()', [uuid(), account.id, row.id, String(feed.feedKey), feed.pageKind || null, feed.sectionId == null ? null : String(feed.sectionId), JSON.stringify(feed)]);
          }
          if (syncRunId) {
            const associationResult = await conn.query('INSERT IGNORE INTO po_sync_run_contents (run_id, content_id, change_type, sync_scope) VALUES (?,?,?,?)', [syncRunId, row.id, change, syncScope]);
            const association = Array.isArray(associationResult) ? associationResult[0] : associationResult;
            if (association?.affectedRows && syncScope === 'posts') {
              fetchedCount += 1;
              if (change === 'inserted') insertedCount += 1;
              else if (change === 'changed') changedCount += 1;
              else unchangedCount += 1;
              commentCount += Number(raw.commentCount ?? raw.engagement?.comments ?? raw.engagement?.comment ?? 0) || 0;
            }
          }
        }
      }
      if (syncRunId) {
        const runUpdateResult = await conn.query('UPDATE po_sync_runs SET fetched_count=fetched_count+?, inserted_count=inserted_count+?, changed_count=changed_count+?, unchanged_count=unchanged_count+?, comment_count=comment_count+?, discovered_count=discovered_count+?, stored_count=stored_count+?, lease_until=CASE WHEN lease_owner=? THEN DATE_ADD(NOW(), INTERVAL ? SECOND) ELSE lease_until END, updated_at=NOW() WHERE id=? AND (? IS NULL OR lease_owner=?)', [fetchedCount, insertedCount, changedCount, unchangedCount, commentCount, fetchedCount, insertedCount + changedCount, leaseOwner || null, Number(leaseSeconds), syncRunId, leaseOwner || null, leaseOwner || null]);
        const runUpdate = Array.isArray(runUpdateResult) ? runUpdateResult[0] : runUpdateResult;
        if (!runUpdate?.affectedRows) { const error = new Error('sync run lease lost'); error.code = 'SYNC_RUN_LEASE_LOST'; throw error; }
      }
      if (checkpointId) {
        const checkpointResult = await conn.query('UPDATE po_sync_checkpoints SET `cursor`=?, status=?, sync_mode=?, items_fetched=items_fetched+?, last_item_at=COALESCE(?,last_item_at), lease_owner=IF(?, lease_owner, NULL), lease_until=IF(?, DATE_ADD(NOW(), INTERVAL ? SECOND), NULL), error_code=NULL, error_message=NULL WHERE id=? AND lease_owner=? AND status=\'running\'', [nextCursor, hasMore ? 'running' : 'completed', syncMode, items.length, lastItemAt, hasMore ? 1 : 0, hasMore ? 1 : 0, Number(leaseSeconds), checkpointId, leaseOwner]);
        const checkpointUpdate = Array.isArray(checkpointResult) ? checkpointResult[0] : checkpointResult;
        if (!checkpointUpdate?.affectedRows) { const error = new Error('sync checkpoint lease lost'); error.code = 'CHECKPOINT_LEASE_LOST'; throw error; }
      }
      await conn.commit();
    } catch (error) { if (transactionStarted) await conn.rollback(); throw error; } finally { conn.release(); }
    return { contents, storedCount };
  }
  async listContentTree({ accountId, regionCode, gameId, communityId, sourceId, platform, rootContentId, contentType, sentiment, severity, keyword, postId, analysisStatus, analysisLevel, publishedFrom, publishedTo, includeDeleted = false, page = 1, pageSize = 20 } = {}) {
    const values = []; const clauses = [];
    const lightVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    for (const [value, sql] of [[accountId, 'c.account_id'], [gameId, 'c.game_id'], [communityId, 'c.community_id'], [sourceId, 'c.source_id'], [contentType, 'c.content_type'], [severity, 'an.severity'], [analysisLevel, 'an.analysis_level'], [postId, 'c.external_id']]) if (value) { values.push(value); clauses.push(`${sql}=?`); }
    if (regionCode) { values.push(regionCode); clauses.push('g.region_code=?'); }
    if (platform) { values.push(platform); clauses.push('s.platform=?'); }
    if (publishedFrom) { values.push(publishedFrom); clauses.push('c.published_at>=?'); }
    if (publishedTo) { values.push(publishedTo); clauses.push('c.published_at<?'); }
    if (sentiment === 'unclassified') clauses.push('an.content_id IS NULL');
    else if (sentiment) { values.push(sentiment); clauses.push('an.sentiment=?'); }
    if (analysisStatus) { values.push(analysisStatus); clauses.push("COALESCE(j.status,CASE WHEN an.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END)=?"); }
    if (rootContentId) { values.push(rootContentId, rootContentId); clauses.push('(c.id=? OR c.root_content_id=?)'); }
    if (!includeDeleted) clauses.push('c.is_deleted=0');
    if (keyword) { const like = `%${keyword}%`; values.push(like, like, like); clauses.push('(c.title LIKE ? OR c.body LIKE ? OR c.author_name LIKE ?)'); }
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100); const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    const orderBy = contentType
      ? 'c.published_at IS NULL, c.published_at DESC, c.id DESC'
      : 'COALESCE(c.root_content_id,c.id), c.content_depth, c.published_at IS NULL, c.published_at DESC';
    return this.query(`SELECT c.*, a.account_name, s.platform, s.display_name AS source_name,
      an.sentiment, an.negative_score, an.confidence, an.quality_score, an.recommend_home, an.recommend_pin, an.recommend_feature, an.quality_reason, an.severity, an.topics, an.matched_keywords, an.summary,
      an.model_name, an.analysis_level, an.analysis_version, an.trigger_reason, an.analysis_reason, an.analyzed_at,
      COALESCE(j.status,CASE WHEN an.content_id IS NOT NULL THEN 'completed' ELSE 'unclassified' END) AS analysis_status,
      j.error_code AS analysis_error_code, j.error_message AS analysis_error_message,
      CASE WHEN c.content_type='post' THEN (SELECT COUNT(*) FROM po_contents tc WHERE tc.root_content_id=c.id AND tc.content_type='comment' AND tc.content_depth=1 AND tc.is_deleted=0) ELSE 0 END AS top_level_comment_count,
      CASE WHEN c.content_type='post' THEN (SELECT COUNT(*) FROM po_contents rc WHERE rc.root_content_id=c.id AND rc.content_type='comment' AND rc.content_depth>1 AND rc.is_deleted=0) ELSE 0 END AS reply_count,
      ${totalCommentCountSql('c', 'ac')} AS comment_count,
      ${totalCommentCountSql('c', 'tac')} AS total_comment_count
      FROM po_contents c LEFT JOIN po_accounts a ON a.id=c.account_id JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id
      LEFT JOIN po_analyses an ON an.content_id=c.id
      LEFT JOIN po_analysis_jobs j ON j.content_id=c.id AND j.analysis_profile=COALESCE(an.analysis_level,'light') AND j.analysis_version=COALESCE(an.analysis_version,?)
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [lightVersion, ...values, limit, offset]);
  }
  async getContentTree(rootContentId, options = {}) { return this.listContentTree({ ...options, rootContentId, page: 1, pageSize: options.pageSize || 1000 }); }


  // 到期采集源：启用 + 距上次成功已过 frequency + 处于生效时段（active_window 在应用层判定）
  async listDueSources(now = new Date()) {
    const rows = await this.query(`SELECT s.*, g.name AS game_name, g.enabled AS game_enabled, c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.enabled=1 AND g.enabled=1 AND c.status='enabled' AND ${NOT_DELETED} AND (s.last_success_at IS NULL OR s.last_success_at <= (NOW() - INTERVAL s.frequency_seconds SECOND)) ORDER BY s.last_success_at IS NOT NULL, s.last_success_at ASC`);
    return rows.filter(row => isWithinActiveWindow(row.active_window, now));
  }

  // 凭据引用（只返回 secret_ref 键名与状态，绝不含明文）
  async getCredential(sourceId) { return (await this.query('SELECT * FROM po_credentials WHERE source_id=?', [sourceId]))[0] || null; }

  // 回写采集源授权状态（授权闸门判定后调用）
  async updateSourceAuth(sourceId, { authStatus, authExpireAt } = {}) {
    await this.query('UPDATE po_sources SET auth_status=COALESCE(?,auth_status), auth_expire_at=COALESCE(?,auth_expire_at) WHERE id=?', [authStatus || null, authExpireAt || null, sourceId]);
  }
  async updateCredentialCheck(sourceId, { status, failureReason, expireAt } = {}) {
    await this.query('UPDATE po_credentials SET status=COALESCE(?,status), failure_reason=?, expire_at=COALESCE(?,expire_at), last_checked_at=NOW() WHERE source_id=?', [status || null, failureReason || null, expireAt || null, sourceId]);
  }

  // 社区级规则优先，未配置时兼容游戏级规则；同层级的平台规则优先于通用规则。
  async loadKeywordRules(gameId, platform, communityId) {
    const scoped = communityId ? ' AND (community_id=? OR community_id IS NULL)' : ' AND community_id IS NULL';
    const params = communityId ? [gameId, communityId, platform || null] : [gameId, platform || null];
    const rows = await this.query(`SELECT * FROM po_keyword_rules WHERE game_id=?${scoped} AND enabled=1 AND (platform=? OR platform IS NULL) ORDER BY created_at DESC, id DESC`, params);
    const byKeyword = new Map();
    const rank = row => (communityId && row.community_id != null ? 2 : 0) + (row.platform ? 1 : 0);
    for (const row of rows) {
      const key = String(row.keyword || '').trim().normalize('NFKC').toLocaleLowerCase();
      const prev = byKeyword.get(key);
      if (!prev || rank(row) > rank(prev)) byKeyword.set(key, row);
    }
    return [...byKeyword.values()];
  }

  // 滑窗命中计数：统计 [now-windowSeconds, now] 内同游戏命中给定关键词组的内容数
  async countWindowHits({ gameId, communityId, groupName, windowSeconds }) {
    const scope = communityId ? ' AND c.community_id=?' : '';
    const params = communityId ? [gameId, communityId, Number(windowSeconds), groupName] : [gameId, Number(windowSeconds), groupName];
    const rows = await this.query(`SELECT COUNT(DISTINCT c.id) AS hits FROM po_contents c JOIN po_analyses a ON a.content_id=c.id WHERE c.game_id=?${scope} AND c.collected_at >= (NOW() - INTERVAL ? SECOND) AND JSON_CONTAINS(a.matched_keywords, JSON_QUOTE(?))`, params);
    return Number(rows[0]?.hits || 0);
  }

  // 查找同游戏 + 同类型未闭环告警（去重防轰炸；cooldownSeconds 内的最近一条）
  async findOpenAlert({ gameId, communityId, alertType, cooldownSeconds }) {
    const scope = communityId ? ' AND community_id=?' : '';
    const params = communityId ? [gameId, communityId, alertType, Number(cooldownSeconds || 0)] : [gameId, alertType, Number(cooldownSeconds || 0)];
    const rows = await this.query(`SELECT * FROM po_alerts WHERE game_id=?${scope} AND alert_type=? AND status NOT IN ('resolved','false_positive') AND created_at >= (NOW() - INTERVAL ? SECOND) ORDER BY created_at DESC LIMIT 1`, params);
    return rows[0] || null;
  }

  // 创建告警 + 关联内容（单事务：告警主体 + 命中内容多对多）
  async insertAlert({ gameId, communityId, severity, alertType, title, triggerDetail, contentIds = [] }) {
    const id = uuid(); const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      if (communityId) await conn.query('INSERT INTO po_alerts (id, game_id, community_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?,?)', [id, gameId, communityId, severity, alertType, title, triggerDetail]);
      else await conn.query('INSERT INTO po_alerts (id, game_id, severity, alert_type, title, trigger_detail) VALUES (?,?,?,?,?,?)', [id, gameId, severity, alertType, title, triggerDetail]);
      for (const contentId of [...new Set(contentIds.filter(Boolean))]) await conn.query('INSERT IGNORE INTO po_alert_contents (alert_id, content_id) VALUES (?,?)', [id, contentId]);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    return (await this.query('SELECT * FROM po_alerts WHERE id=?', [id]))[0];
  }
  async linkAlertContent(alertId, contentId) { await this.query('INSERT IGNORE INTO po_alert_contents (alert_id, content_id) VALUES (?,?)', [alertId, contentId]); }

  // 回写钉钉推送状态（幂等：sent/failed/not_sent）
  async updateDingStatus(alertId, status) { await this.query('UPDATE po_alerts SET ding_talk_status=? WHERE id=?', [status, alertId]); }

  // ── 任务包A：后台配置写入（采集源 / 凭据加密 / 关键词规则） ──

  // 手动采集入队（A5）：打「立即到期」标记 collect_requested_at=NOW()。
  // 不做同步阻塞采集；Worker 下个 tick 经 listManualDueSources 捞起并清标记。
  // 授权闸门在 Worker runSource 内仍生效（fail-closed，未授权不采集）。
  async requestCollect(sourceId) { await this.query('UPDATE po_sources SET collect_requested_at=NOW() WHERE id=?', [sourceId]); }

  // 用户主动开始同步：启用源、保存同步模式、写入手动队列必须原子完成，避免出现“已启用但未入队”。
  async startSourceSync({ sourceId, accountId, metadata = {}, syncMode = 'incremental' } = {}) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sourceRows] = await conn.query(`SELECT s.id, s.enabled, c.status AS community_status, g.enabled AS game_enabled FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? AND ${NOT_DELETED} FOR UPDATE`, [sourceId]);
      const source = sourceRows[0];
      if (!source) { const error = new Error('source not found'); error.code = 'SOURCE_NOT_FOUND'; throw error; }
      if (source.community_status && source.community_status !== 'enabled') { const error = new Error('community is disabled'); error.code = 'COMMUNITY_DISABLED'; throw error; }
      if (!source.game_enabled) { const error = new Error('game is disabled'); error.code = 'GAME_DISABLED'; throw error; }
      const [accountRows] = await conn.query('SELECT id FROM po_accounts WHERE id=? AND source_id=? AND enabled=1 FOR UPDATE', [accountId, sourceId]);
      if (!accountRows[0]) { const error = new Error('enabled default account is required'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
      await conn.query('UPDATE po_accounts SET metadata=?, updated_at=NOW() WHERE id=?', [JSON.stringify(metadata || {}), accountId]);
      await conn.query('UPDATE po_sources SET enabled=1, collect_requested_at=NOW(), updated_at=NOW() WHERE id=?', [sourceId]);
      const [activeRuns] = await conn.query("SELECT * FROM po_sync_runs WHERE account_id=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [accountId]);
      let run = activeRuns[0];
      const reused = Boolean(run);
      if (!run) {
        const runId = uuid();
        await conn.query("INSERT INTO po_sync_runs (id, account_id, status, sync_mode, started_at) VALUES (?,?, 'queued', ?, NULL)", [runId, accountId, syncMode]);
        [run] = (await conn.query('SELECT * FROM po_sync_runs WHERE id=?', [runId]))[0];
      }
      await conn.commit();
      return { enabled: true, previouslyEnabled: Boolean(source.enabled), reused, run };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }

  // 授权范围全量回溯：重置全部断点并创建独立的新运行，旧运行保留审计记录。
  async resetSourceSync({ sourceId, accountId, metadata = {}, syncMode = 'backfill' } = {}) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sourceRows] = await conn.query(`SELECT s.id, s.enabled, c.status AS community_status, g.enabled AS game_enabled FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? AND ${NOT_DELETED} FOR UPDATE`, [sourceId]);
      const source = sourceRows[0];
      if (!source) { const error = new Error('source not found'); error.code = 'SOURCE_NOT_FOUND'; throw error; }
      if (source.community_status && source.community_status !== 'enabled') { const error = new Error('community is disabled'); error.code = 'COMMUNITY_DISABLED'; throw error; }
      if (!source.game_enabled) { const error = new Error('game is disabled'); error.code = 'GAME_DISABLED'; throw error; }
      const [accountRows] = await conn.query('SELECT id FROM po_accounts WHERE id=? AND source_id=? AND enabled=1 FOR UPDATE', [accountId, sourceId]);
      if (!accountRows[0]) { const error = new Error('enabled default account is required'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
      await conn.query("UPDATE po_sync_checkpoints SET status='idle', `cursor`=NULL, items_fetched=0, last_item_at=NULL, error_code=NULL, error_message=NULL, lease_owner=NULL, lease_until=NULL WHERE account_id=?", [accountId]);
      await conn.query("UPDATE po_sync_runs SET status='cancelled', finished_at=NOW(), error_code='RESET_BY_USER', error_message='run superseded by authorized-scope reset', lease_owner=NULL, lease_until=NULL, updated_at=NOW() WHERE account_id=? AND status IN ('queued','running')", [accountId]);
      await conn.query('UPDATE po_accounts SET metadata=?, updated_at=NOW() WHERE id=?', [JSON.stringify(metadata || {}), accountId]);
      await conn.query('UPDATE po_sources SET enabled=1, collect_requested_at=NOW(), updated_at=NOW() WHERE id=?', [sourceId]);
      const runId = uuid();
      await conn.query("INSERT INTO po_sync_runs (id, account_id, status, sync_mode, started_at) VALUES (?,?, 'queued', ?, NULL)", [runId, accountId, syncMode]);
      const [runRows] = await conn.query('SELECT * FROM po_sync_runs WHERE id=?', [runId]);
      await conn.commit();
      return { enabled: true, reset: true, reused: false, run: runRows[0] };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }

  // 被手动请求采集的源（collect_requested_at 非空）；捞出后即由 Worker 清空标记。
  async listManualDueSources() { return this.query(`SELECT s.*, g.name AS game_name, g.enabled AS game_enabled, c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.enabled=1 AND g.enabled=1 AND c.status='enabled' AND s.collect_requested_at IS NOT NULL AND ${NOT_DELETED} ORDER BY s.collect_requested_at ASC`); }
  async clearManualRequest(sourceId) { await this.query('UPDATE po_sources SET collect_requested_at=NULL WHERE id=?', [sourceId]); }

  async adoptLegacySourceWithAccount({ sourceId, accountId, sourceType = 'owned_community', displayName, baseUrl, startPaths, board, postsApiUrl, commentsApiUrl, frequencySeconds = 3600, activeWindow, accountName, metadata = {}, credentialType = 'api_token', secretCipher } = {}) {
    const config = { baseUrl: baseUrl || '', startPaths: Array.isArray(startPaths) && startPaths.length ? startPaths : ['/'], ...(board ? { board } : {}), ...(postsApiUrl ? { postsApiUrl } : {}), ...(commentsApiUrl ? { commentsApiUrl } : {}) };
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sourceRows] = await conn.query('SELECT * FROM po_sources WHERE id=? FOR UPDATE', [sourceId]);
      const source = sourceRows[0];
      if (!source) { const error = new Error('legacy source not found'); error.code = 'SOURCE_NOT_FOUND'; throw error; }
      const [accountRows] = await conn.query('SELECT * FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE', [accountId, sourceId]);
      const account = accountRows[0];
      const currentConfig = parseConfig(source.config);
      const adoptable = account && String(account.platform_account_id || '').startsWith('legacy-source:') && !String(currentConfig.baseUrl || '').trim() && source.auth_status !== 'authorized';
      if (!adoptable) { const error = new Error('source already exists'); error.code = 'SOURCE_ALREADY_EXISTS'; throw error; }
      await conn.query('UPDATE po_sources SET source_type=?, display_name=?, enabled=0, frequency_seconds=?, config=?, active_window=?, auth_status=\'unconfigured\', auth_expire_at=NULL, updated_at=NOW() WHERE id=?', [sourceType, displayName, Number(frequencySeconds), JSON.stringify(config), activeWindow ? JSON.stringify(activeWindow) : null, sourceId]);
      await conn.query('UPDATE po_accounts SET account_name=?, enabled=1, auth_status=\'unconfigured\', auth_expire_at=NULL, metadata=?, updated_at=NOW() WHERE id=?', [accountName || displayName, JSON.stringify(metadata || {}), accountId]);
      if (credentialType && secretCipher) await conn.query('INSERT INTO po_credentials (id, account_id, source_id, credential_type, secret_ref, secret_cipher, status) VALUES (?,?,?,?,?,?,\'active\') ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher), secret_ref=\'\', status=\'active\', failure_reason=NULL, last_checked_at=NOW(), updated_at=NOW()', [uuid(), accountId, sourceId, credentialType, '', secretCipher]);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    return { source: (await this.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null, account: await this.getAccount(accountId) };
  }

  // 新增采集源与默认账号使用同一事务，避免 OAuth 源创建后没有可授权账号。
  async createSourceWithAccount({ gameId, communityId, platform, sourceType = 'owned_community', displayName, baseUrl, startPaths, board, postsApiUrl, commentsApiUrl, accountIds, groupIds, frequencySeconds = 3600, activeWindow, sourceId = uuid(), accountId = uuid(), platformAccountId, accountName, accountType = 'official', accountEnabled = true, authStatus = 'unconfigured', maskedLoginIdentifier, metadata = {}, credentialType, secretCipher } = {}) {
    const config = {
      baseUrl: baseUrl || '',
      startPaths: Array.isArray(startPaths) && startPaths.length ? startPaths : ['/'],
      ...(board ? { board } : {}),
      ...(postsApiUrl ? { postsApiUrl } : {}),
      ...(commentsApiUrl ? { commentsApiUrl } : {}),
      ...(Array.isArray(accountIds) && accountIds.length ? { accountIds } : {}),
      ...(Array.isArray(groupIds) && groupIds.length ? { groupIds } : {})
    };
    const identity = platformAccountId || `pending:${accountId}`;
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('INSERT INTO po_sources (id, game_id, community_id, platform, source_type, display_name, enabled, frequency_seconds, config, active_window) VALUES (?,?,?,?,?,?,?,?,?,?)', [sourceId, gameId, communityId, platform, sourceType, displayName, 0, Number(frequencySeconds), JSON.stringify(config), activeWindow ? JSON.stringify(activeWindow) : null]);
      if (maskedLoginIdentifier) await conn.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, account_type, enabled, auth_status, masked_login_identifier, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [accountId, gameId, communityId, sourceId, platform, identity, accountName || displayName, accountType, accountEnabled ? 1 : 0, authStatus, maskedLoginIdentifier, JSON.stringify(metadata || {})]);
      else if (communityId) await conn.query('INSERT INTO po_accounts (id, game_id, community_id, source_id, platform, platform_account_id, account_name, account_type, enabled, auth_status, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [accountId, gameId, communityId, sourceId, platform, identity, accountName || displayName, accountType, accountEnabled ? 1 : 0, authStatus, JSON.stringify(metadata || {})]);
      else await conn.query('INSERT INTO po_accounts (id, game_id, source_id, platform, platform_account_id, account_name, account_type, enabled, auth_status, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)', [accountId, gameId, sourceId, platform, identity, accountName || displayName, accountType, accountEnabled ? 1 : 0, authStatus, JSON.stringify(metadata || {})]);
      if (credentialType && secretCipher) await conn.query('INSERT INTO po_credentials (id, account_id, source_id, credential_type, secret_ref, secret_cipher, status) VALUES (?,?,?,?,?,?,?)', [uuid(), accountId, sourceId, credentialType, '', secretCipher, 'active']);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
    return { source: (await this.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null, account: await this.getAccount(accountId) };
  }

  // 新增采集源：config 写 { baseUrl, startPaths, board }；enabled 默认 0（需配凭据+检测授权后才启用）。
  async createSource({ gameId, platform, sourceType = 'owned_community', displayName, baseUrl, startPaths, board, frequencySeconds = 3600, activeWindow } = {}) {
    const id = uuid();
    const config = { baseUrl: baseUrl || '', startPaths: Array.isArray(startPaths) && startPaths.length ? startPaths : ['/'], ...(board ? { board } : {}) };
    await this.query('INSERT INTO po_sources (id, game_id, platform, source_type, display_name, enabled, frequency_seconds, config, active_window) VALUES (?,?,?,?,?,?,?,?,?)', [id, gameId, platform, sourceType, displayName, 0, Number(frequencySeconds) || 3600, JSON.stringify(config), activeWindow ? JSON.stringify(activeWindow) : null]);
    return (await this.query('SELECT * FROM po_sources WHERE id=?', [id]))[0] || null;
  }

  // 软删除：config 合并 deleted:true，不物理删除；历史内容/分析/告警全部保留可追溯。
  async softDeleteSource(sourceId) {
    const row = (await this.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0];
    if (!row) return false;
    const config = { ...parseConfig(row.config), deleted: true };
    await this.query('UPDATE po_sources SET config=?, enabled=0, updated_at=NOW() WHERE id=?', [JSON.stringify(config), sourceId]);
    return true;
  }

  // 更新采集源可配置字段（启用开关、采集频率、生效时段、名称、config 内 baseUrl/startPaths）；只更新传入字段。
  async updateSource(sourceId, { enabled, frequencySeconds, activeWindow, displayName, baseUrl, startPaths } = {}) {
    let configJson = null;
    if (baseUrl !== undefined || startPaths !== undefined) {
      const row = (await this.query('SELECT config FROM po_sources WHERE id=?', [sourceId]))[0];
      if (!row) return null;
      const config = parseConfig(row.config);
      if (baseUrl !== undefined) config.baseUrl = baseUrl;
      if (startPaths !== undefined) config.startPaths = Array.isArray(startPaths) && startPaths.length ? startPaths : ['/'];
      configJson = JSON.stringify(config);
    }
    await this.query('UPDATE po_sources SET enabled=COALESCE(?,enabled), frequency_seconds=COALESCE(?,frequency_seconds), active_window=COALESCE(?,active_window), display_name=COALESCE(?,display_name), config=COALESCE(?,config), updated_at=NOW() WHERE id=?', [
      enabled == null ? null : (enabled ? 1 : 0),
      frequencySeconds == null ? null : Number(frequencySeconds),
      activeWindow == null ? null : JSON.stringify(activeWindow),
      displayName || null,
      configJson,
      sourceId
    ]);
    return (await this.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null;
  }

  async updateSourceConfig(sourceId, config, { enabled, frequencySeconds, activeWindow, displayName } = {}) {
    await this.query('UPDATE po_sources SET enabled=COALESCE(?,enabled), frequency_seconds=COALESCE(?,frequency_seconds), active_window=COALESCE(?,active_window), display_name=COALESCE(?,display_name), config=?, updated_at=NOW() WHERE id=?', [
      enabled == null ? null : (enabled ? 1 : 0), frequencySeconds == null ? null : Number(frequencySeconds), activeWindow == null ? null : JSON.stringify(activeWindow), displayName || null, JSON.stringify(config || {}), sourceId
    ]);
    return (await this.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null;
  }

  // H5 配置与账号元数据、凭据必须原子提交；凭据为空时保留已有凭据。
  async updateSourceConfiguration(sourceId, { displayName, baseUrl, frequencySeconds, syncMode, historyStart, enabled, credential, credentialCipher, accountIds, groupIds } = {}) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sourceRows] = await conn.query('SELECT * FROM po_sources WHERE id=? FOR UPDATE', [sourceId]);
      const source = sourceRows[0];
      if (!source) { const error = new Error('source not found'); error.code = 'NOT_FOUND'; throw error; }
      const [accountRows] = await conn.query('SELECT * FROM po_accounts WHERE source_id=? AND enabled=1 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE', [sourceId]);
      const account = accountRows[0];
      if (!account) { const error = new Error('default account not found'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
      const config = { ...parseConfig(source.config), baseUrl, syncMode, historyStart: historyStart || null, ...(Array.isArray(accountIds) ? { accountIds } : {}), ...(Array.isArray(groupIds) ? { groupIds } : {}) };
      await conn.query('UPDATE po_sources SET display_name=?, enabled=?, frequency_seconds=?, config=?, updated_at=NOW() WHERE id=?', [displayName, enabled ? 1 : 0, Number(frequencySeconds), JSON.stringify(config), sourceId]);
      const metadata = { ...parseConfig(account.metadata), syncMode, historyStart: historyStart || null };
      await conn.query('UPDATE po_accounts SET metadata=?, updated_at=NOW() WHERE id=?', [JSON.stringify(metadata), account.id]);
      if (credentialCipher) {
        await conn.query(`INSERT INTO po_credentials (id, account_id, source_id, credential_type, secret_ref, secret_cipher, status)
          VALUES (?,?,?,?,?,?, 'active')
          ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher), secret_ref='', status='active', failure_reason=NULL, last_checked_at=NOW(), updated_at=NOW()`, [uuid(), account.id, sourceId, credential.credentialType, '', credentialCipher]);
      }
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
    const updatedSource = (await this.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null;
    const updatedAccount = (await this.listAccounts({ sourceId }))[0] || null;
    return { source: updatedSource, account: updatedAccount };
  }

  // secretRef 保留为外部密钥库/环境变量引用兼容路径，两者可并存。
  async upsertCredential(sourceId, { secretCipher, secretRef, status, expireAt } = {}) {
    const existing = await this.getCredential(sourceId);
    if (existing) {
      await this.query('UPDATE po_credentials SET secret_cipher=COALESCE(?,secret_cipher), secret_ref=COALESCE(?,secret_ref), status=COALESCE(?,status), expire_at=COALESCE(?,expire_at), failure_reason=NULL, last_checked_at=NOW(), updated_at=NOW() WHERE source_id=?', [secretCipher || null, secretRef || null, status || null, expireAt || null, sourceId]);
    } else {
      await this.query('INSERT INTO po_credentials (id, source_id, secret_ref, secret_cipher, status, expire_at) VALUES (?,?,?,?,?,?)', [uuid(), sourceId, secretRef || '', secretCipher || null, status || 'active', expireAt || null]);
    }
    return this.getCredential(sourceId);
  }

  // 原始关键词规则（后台编辑用，返回全部字段含 platform/trigger_mode/window_seconds/threshold_count）
  async listKeywordRulesRaw(gameId, communityId, platform) {
    const scope = communityId ? ' AND community_id=?' : ' AND community_id IS NULL';
    const params = communityId ? [gameId, communityId] : [gameId];
    const platformScope = platform ? ' AND platform=?' : '';
    if (platform) params.push(platform);
    return this.query(`SELECT * FROM po_keyword_rules WHERE game_id=?${scope}${platformScope} ORDER BY platform, severity DESC, keyword`, params);
  }

  async replaceKeywordRules(gameId, communityId, rules = [], platform) {
    if (Array.isArray(communityId)) { rules = communityId; communityId = null; }
    const conn = await this.pool.getConnection();
    const scope = communityId ? ' AND community_id=?' : ' AND community_id IS NULL';
    const scopeParams = communityId ? [gameId, communityId] : [gameId];
    const platformScope = platform ? ' AND platform=?' : '';
    if (platform) scopeParams.push(platform);
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM po_keyword_rules WHERE game_id=?${scope}${platformScope}`, scopeParams);
      for (const r of rules) {
        if (communityId) {
          await conn.query('INSERT INTO po_keyword_rules (id, game_id, community_id, platform, keyword, group_name, severity, trigger_mode, window_seconds, threshold_count, enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [uuid(), gameId, communityId, platform || null, r.keyword, r.groupName || r.group_name || null, r.severity || 'attention', r.triggerMode || r.trigger_mode || 'aggregate', Number(r.windowSeconds || r.window_seconds || 1800), Number(r.thresholdCount || r.threshold_count || 1), r.enabled === false ? 0 : 1]);
        } else {
          await conn.query('INSERT INTO po_keyword_rules (id, game_id, platform, keyword, group_name, severity, trigger_mode, window_seconds, threshold_count, enabled) VALUES (?,?,?,?,?,?,?,?,?,?)', [uuid(), gameId, platform || null, r.keyword, r.groupName || r.group_name || null, r.severity || 'attention', r.triggerMode || r.trigger_mode || 'aggregate', Number(r.windowSeconds || r.window_seconds || 1800), Number(r.thresholdCount || r.threshold_count || 1), r.enabled === false ? 0 : 1]);
        }
      }
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
    return this.listKeywordRulesRaw(gameId, communityId, platform);
  }
}
module.exports = { Repository, uuid, isWithinActiveWindow };
