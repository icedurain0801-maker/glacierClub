const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const RiskModes = window.PublicOpinionRiskModes;
const PERIOD_LABELS = { today: '今日', yesterday: '昨日', '7d': '近7天', '30d': '近30天' };
const OVERVIEW_PERIOD_STORAGE_KEY = 'public-opinion:overview:period';
function validPeriod(value) { return Object.prototype.hasOwnProperty.call(PERIOD_LABELS, value); }
function readSavedPeriod(storage = window.localStorage) { try { const value = storage.getItem(OVERVIEW_PERIOD_STORAGE_KEY); return validPeriod(value) ? value : null; } catch (_) { return null; } }
function savePeriod(value, storage = window.localStorage) { try { if (validPeriod(value)) storage.setItem(OVERVIEW_PERIOD_STORAGE_KEY, value); else storage.removeItem(OVERVIEW_PERIOD_STORAGE_KEY); } catch (_) { /* private mode must not block overview refresh */ } }
function resolveOverviewPeriod(params = new URLSearchParams(window.location.search), storage = window.localStorage) { const requested = params.get('period'); return validPeriod(requested) ? requested : readSavedPeriod(storage) || 'today'; }
const state = { sources: [], overview: null, contents: [], alerts: [], scope: null, period: resolveOverviewPeriod() };
function validOverviewWindow(params = new URLSearchParams(location.search)) {
  const from = params.get('publishedFrom'); const to = params.get('publishedTo');
  return from?.includes('T') && to?.includes('T') && Number.isFinite(Date.parse(from)) && Date.parse(to) > Date.parse(from) && Date.parse(to) - Date.parse(from) <= 31 * 86400000 ? { publishedFrom: from, publishedTo: to } : null;
}
state.window = validOverviewWindow();
const beijingIso = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().replace('Z', '+08:00');
function negativeContentHref(mode = 'negative') {
  const params = state.scope?.query() || new URLSearchParams();
  params.set('contentMode', mode);
  params.delete('riskMode'); params.delete('sentiment'); params.delete('severity');
  const severity = RiskModes?.severityForRiskMode(mode);
  if (severity) { params.set('riskMode', mode); params.set('severity', severity); }
  const range = state.window;
  if (range) { params.set('publishedFrom', range.publishedFrom); params.set('publishedTo', range.publishedTo); }
  params.delete('page'); params.delete('contentId');
  return `content.html?${params}`;
}
const Detail = window.PublicOpinionAlertDetail;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hotContentText = item => {
  const title = String(item?.title ?? '').trim();
  const body = String(item?.body ?? '').trim();
  const isAssetUrl = value => /^(?:https?:\/\/)?(?:opsoss\.q1\.com|[^\s/]+\.(?:png|jpe?g|gif|webp))(?:\/|$)/i.test(value);
  const clean = value => String(value || '').replace(/https?:\/\/opsoss\.q1\.com\/\S+/gi, '').trim();
  return [title, body].map(clean).find(value => value && !isAssetUrl(value)) || '（无内容）';
};
const hotSummaryText = item => {
  const summary = String(item?.summary ?? '').trim();
  return `内容摘要：${summary || '暂无摘要'}`;
};
const sourceName = id => state.sources.find(item => item.id === id)?.display_name || state.sources.find(item => item.id === id)?.source_name || state.sources.find(item => item.id === id)?.platform || id;

async function api(path, options = {}) {
  return state.scope && window.PublicOpinionScope.withScope ? window.PublicOpinionScope.withScope(path, options, rawApi) : rawApi(path, options);
}
async function rawApi(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (method !== 'GET' && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {
    const error = new Error('舆情服务返回了无法解析的响应');
    error.code = 'INVALID_RESPONSE';
    throw error;
  }
  if (!response.ok) throw new Error(body.error?.message || body.message || `请求失败 (${response.status})`);
  return body.data;
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
function periodLabel() { return PERIOD_LABELS[state.period] || PERIOD_LABELS.today; }
function updatePeriodUi() {
  const select = $('[data-period-select]'); if (select) select.value = state.period;
  document.querySelectorAll('[data-period]').forEach(button => button.classList.toggle('active', button.dataset.period === state.period));
  const label = periodLabel();
  const overviewTitle = $('#overviewTitle'); if (overviewTitle) overviewTitle.textContent = '概览';
  document.querySelectorAll('[data-overview-period-label]').forEach(element => { element.textContent = label; });
  const trendLabel = $('#trendLabel'); if (trendLabel) trendLabel.textContent = `${label} · ${state.scope?.selected().platformLabel || '大玩家社区'}`;
}
function overviewQuery(scope) {
  const params = new URLSearchParams(scope);
  if (state.window) { params.set('from', state.window.publishedFrom); params.set('to', state.window.publishedTo); }
  else params.set('period', state.period);
  return params;
}
function syncPeriodUrl() {
  const params = new URLSearchParams(window.location.search); params.set('period', state.period);
  savePeriod(state.period); state.window = null; params.delete('publishedFrom'); params.delete('publishedTo');
  history.pushState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
}
function renderMetrics(metrics) {
  metrics = metrics || {};
  const cards = [[`${periodLabel()}发布内容`, Number(metrics.newCount ?? metrics.total ?? 0).toLocaleString(), '当前筛选范围内新增', '总'], ['负面内容', Number(metrics.negativeCount ?? metrics.negative ?? 0).toLocaleString(), '已识别的负面内容', '负'], ['关注级内容', Number(metrics.attention ?? 0).toLocaleString(), '已识别的关注级内容', '注'], ['当前告警', Number(metrics.activeAlertCount ?? 0).toLocaleString(), '当前待处理告警', '警']];
  const accent = index => index === 1 ? ' accent-red' : index >= 2 ? ' accent-orange' : '';
  const metricsEl = $('#metrics'); if (!metricsEl) return;
  metricsEl.innerHTML = cards.map(([label, value, foot, icon], index) => `<div class="metric${accent(index)}"><div class="metric-head"><span>${label}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot ${index > 0 ? 'up' : ''}">${foot}</div></div>`).join('');
}
function normalizeSentiment(sentiment, trend) {
  const totals = { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
  if (Array.isArray(sentiment)) {
    sentiment.forEach(item => {
      const key = item.sentiment === 'pos' ? 'positive' : item.sentiment === 'neu' ? 'neutral' : item.sentiment;
      if (Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += Number(item.count || 0);
    });
  } else if (sentiment && typeof sentiment === 'object') {
    Object.keys(totals).forEach(key => { totals[key] = Number(sentiment[key] ?? 0); });
    totals.negative ||= Number(sentiment.neg || 0);
    totals.positive ||= Number(sentiment.pos || 0);
    totals.neutral ||= Number(sentiment.neu || 0);
  }
  if (!Object.values(totals).some(Boolean)) {
    (trend || []).forEach(day => Object.keys(totals).forEach(key => { totals[key] += Number(day[key] || 0); }));
  }
  return totals;
}
function normalizeTrend(items) {
  const grouped = new Map();
  (Array.isArray(items) ? items : []).forEach(item => {
    const rawDate = item?.date ?? item?.day ?? item?.publishedDate;
    const date = String(rawDate ?? '').trim();
    if (!date || /^\d+$/.test(date)) return;
    const key = date.slice(0, 10);
    const current = grouped.get(key) || { date: key, positive: 0, negative: 0, neutral: 0, total: 0 };
    ['positive', 'negative', 'neutral'].forEach(field => {
      const value = Number(item?.[field]);
      if (Number.isFinite(value) && value >= 0) current[field] += value;
    });
    grouped.set(key, current);
  });
  return [...grouped.values()].map(day => ({ ...day, total: day.positive + day.negative + day.neutral })).sort((a, b) => a.date.localeCompare(b.date));
}
function renderTrend(items, sentiment) {
  const container = $('#trend');
  if (!container) return;
  const normalized = normalizeTrend(items);
  if (!normalized.length) { container.innerHTML = `<div class="module-state">${esc(scopeEmpty(`${periodLabel()}采集数据`))}</div>`; return; }
  const totals = normalizeSentiment(sentiment, normalized);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  const negativeRate = totals.negative / total * 100;
  const healthyRate = (totals.positive + totals.neutral) / total * 100;
  const max = Math.max(...normalized.map(day => Math.max(day.total, day.positive + day.negative + day.neutral)), 1);
  const barHeight = 150;
  const bar = value => {
    const v = Number(value || 0);
    const h = v > 0 ? Math.max(3, barHeight * v / max) : 0;
    return `<div class="trend-bar ${v > 0 ? '' : 'empty'}" style="height:${h.toFixed(1)}px"></div>`;
  };
  const labelEvery = Math.max(1, Math.ceil(normalized.length / 8));
  const singlePoint = normalized.length === 1;
  container.innerHTML = `<div class="emotion-summary"><div><strong>${healthyRate.toFixed(1)}%</strong><span>正向 / 中性内容</span></div><div class="danger"><strong>${negativeRate.toFixed(1)}%</strong><span>负面率 <b>${periodLabel()}</b></span></div></div><div class="trend-bars${singlePoint ? ' single-point' : ''}">${normalized.map((day, index) => { const positive = day.positive; const negative = day.negative; const label = index % labelEvery === 0 || index === normalized.length - 1 ? day.date.slice(5) : ''; return `<div class="trend-day-col" title="${esc(day.date)} · 正向 ${positive.toLocaleString()} · 负面 ${negative.toLocaleString()}"><div class="trend-bar-pair"><div class="trend-bar-group positive">${bar(positive)}<b>${positive > 0 ? positive.toLocaleString() : ''}</b></div><div class="trend-bar-group negative">${bar(negative)}<b>${negative > 0 ? negative.toLocaleString() : ''}</b></div></div><span class="trend-day-label">${esc(label)}</span></div>`; }).join('')}</div>`;
}
// 议题分布：一条内容可命中多个议题，因此各议题之和会大于内容总量，占比统一按内容总量计算。
const PLATFORM_LABELS = { taptap: 'TapTap', bigplayer_h5: '大玩家 H5', douyin: '抖音', weibo: '微博', xueqiu: '雪球', tieba: '贴吧', nga: 'NGA', rednote: '小红书' };
// 平台来源分布：按平台渲染占比条形（复用遗留 .source-list/.source-row/.source-track 样式），空数据不塌陷
function renderSourceDistribution(items) {
  const rows = (Array.isArray(items) ? items : []).map(item => ({ platform: String(item?.platform ?? '').trim(), count: Number(item?.count || 0) })).filter(item => item.platform && item.count > 0);
  const el = $('#sourceDistribution');
  if (!el) return;
  const label = $('#sourceDistLabel'); if (label) label.textContent = `${periodLabel()} · ${state.scope?.selected().platformLabel || '全平台'}`;
  if (!rows.length) { el.innerHTML = `<div class="module-state">${esc(scopeEmpty(`${periodLabel()}平台来源数据`))}</div>`; return; }
  const total = rows.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...rows.map(item => item.count), 1);
  el.innerHTML = `${rows.map(item => `<div class="source-row" title="${esc(PLATFORM_LABELS[item.platform] || item.platform)} · ${item.count.toLocaleString()} 条"><span>${esc(PLATFORM_LABELS[item.platform] || item.platform)}</span><div class="source-track"><span style="width:${(item.count / max * 100).toFixed(1)}%"></span></div><b>${item.count.toLocaleString()} · ${(item.count / total * 100).toFixed(0)}%</b></div>`).join('')}<div class="topic-note">共 ${total.toLocaleString()} 条内容，按采集平台分布。</div>`;
}
function regionName(item, selected) { const code = item.region_code || item.regionCode; return item.region_name || item.regionName || (code === 'domestic' ? '境内' : code === 'overseas' ? '境外' : code) || selected.regionLabel; }function scopePath(item) { const selected = state.scope?.selected?.() || {}; return [regionName(item, selected), item.community_name || item.communityName || selected.communityLabel].filter(value => value && !String(value).startsWith('全部')).join(' / ') || '-'; }
function scopeEmpty(label) { return `暂无${label}`; }
function renderAlerts(items) {
  const section = $('#currentAlertsSection'); if (section) section.hidden = !items?.length;
  renumberOverviewSections();
  const container = $('#alerts');
  if (!container) return;
  container.innerHTML = items && items.length ? items.map(alert => { const summary = Detail.extractAiSummary(alert.trigger_detail || alert.trigger || ''); const title = summary || alert.title || '暂无告警标题'; const created = alert.created_at || alert.createdAt; return `<div class="alert-row"><span class="severity ${alert.severity}">${alert.severity === 'urgent' ? 'P0 紧急' : alert.severity === 'attention' ? 'P1 关注' : 'P2 提示'}</span><div class="row-main"><div class="row-title">${esc(title)}</div><div class="row-meta">${esc(scopePath(alert))} · ${(created && window.formatBeijingTime) ? window.formatBeijingTime(created) : (created || '')} · ${alert.status === 'processing' ? '处理中' : '待处理'} ${alert.alert_type ? '· ' + alert.alert_type : ''}</div></div><span class="row-action" data-alert="${alert.id}">详情</span></div>`; }).join('') : `<div class="row-meta" style="padding:20px 0">${esc(scopeEmpty('待处理告警'))}</div>`;
  container.querySelectorAll('[data-alert]').forEach(el => { el.onclick = () => openAlert(el.dataset.alert); });
}
function renderHot(items, selector = '#hotList') {
  const container = $(selector);
  if (!container) return;
  container.innerHTML = items && items.length ? items.map(item => `<div class="hot-row"><span class="severity attention">${esc(({ post: '帖子', dynamic: '动态', comment: '评论', review: '评论', video: '帖子' })[item.display_type || item.content_type] || '帖子')}</span><div class="row-main"><div class="row-title">${esc(hotContentText(item))}</div><div class="row-meta">${esc(hotSummaryText(item))}</div></div><span class="row-action" data-content="${item.id}">查看</span></div>`).join('') : `<div class="row-meta" style="padding:20px 0">${esc(scopeEmpty(selector === '#attentionList' ? '关注级内容' : '负面内容'))}</div>`;
  container.querySelectorAll('[data-content]').forEach(el => { el.onclick = () => openContent(el.dataset.content); });
}
function renumberOverviewSections() {
  let number = 0;
  document.querySelectorAll('.overview-workbench > .overview-section').forEach(section => {
    const label = section.querySelector('.overview-section-number');
    if (label) label.textContent = section.hidden ? '' : String(++number).padStart(2, '0');
  });
}
function renderTopics(items, metrics) {
  const container = $('#topics'); if (!container) return;
  const rows = (Array.isArray(items) ? items : []).map(item => ({ topic: String(item?.topic ?? '').trim(), count: Number(item?.count || 0), negative: Number(item?.negative || 0) })).filter(item => item.topic && item.count > 0);
  const label = $('#topicLabel'); if (label) label.textContent = `话题聚类 · ${periodLabel()}`;
  if (!rows.length) { container.innerHTML = `<div class="module-state">${esc(scopeEmpty(`${periodLabel()}议题数据`))}</div>`; return; }
  const total = Number(metrics?.newCount ?? metrics?.total ?? 0) || rows.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...rows.map(item => item.count), 1);
  container.innerHTML = `${rows.map(item => `<div class="topic-bar" title="${esc(item.topic)} · ${item.count.toLocaleString()} 条，其中负面 ${item.negative.toLocaleString()} 条"><span>${esc(item.topic)}</span><div class="topic-track"><i style="width:${(item.count / max * 100).toFixed(1)}%"></i></div><b>${item.count.toLocaleString()} 条 ${(item.count / total * 100).toFixed(0)}%${item.negative ? `<em>负 ${item.negative.toLocaleString()}</em>` : ''}</b></div>`).join('')}<div class="topic-note">按话题标签聚类，一条内容可命中多个议题，占比以${periodLabel()}内容总量为分母。</div>`;
}
function openContent(id) { const item = state.contents.find(x => x.id === id) || state.overview?.hotNegative?.find(x => x.id === id) || state.overview?.hotAttention?.find(x => x.id === id); if (!item) return; const published = item.published_at || item.publishedAt; const media = Array.isArray(item.media) ? item.media : []; const mediaHtml = media.map(url => `<img class="content-image" src="${esc(url)}" alt="帖子图片" loading="lazy">`).join(''); $('#drawerContent').innerHTML = `<h2>${esc(item.title || '(无标题)')}</h2><div class="row-meta">${esc(scopePath(item))} · ${esc(sourceName(item.source_id || item.sourceId || item.platform))} · ${(published && window.formatBeijingTime) ? window.formatBeijingTime(published) : (published || '-')}</div><div class="detail-block"><div class="detail-label">原文内容</div><div class="detail-text">${Detail.renderBodyWithImages(item.body, esc)}</div>${mediaHtml}</div><div class="detail-block"><div class="detail-label">内容分析</div><div class="detail-text">情感：${item.sentiment === 'negative' ? '负面' : item.sentiment === 'positive' ? '正面' : '中性'} · 负面强度 ${Math.round(Number(item.negative_score || item.negativeScore || 0) * 100)}%<br>话题：${esc((item.topics || []).join ? (item.topics || []).join('、') : item.topic || '未分类')}<br>命中关键词：${esc((item.matched_keywords || item.keywords || []).join ? (item.matched_keywords || item.keywords || []).join('、') : '无')}<br>摘要：${esc(item.summary || '暂无摘要')}</div></div><div class="detail-block"><div class="detail-label">来源信息</div><div class="detail-text">作者：${esc(item.author_name || item.author || '未知')}<br>来源链接：<a href="${esc(item.source_url || item.url || '#')}" target="_blank" rel="noreferrer">打开来源</a></div></div>`; $('#drawerMask').classList.add('open'); }
const dingLabel = status => ({ not_sent: '未推送', sent: '已推送', failed: '推送失败' }[status] || status || '未推送');
function alertScopePath(id) { const scope = state.scope?.query?.() || new URLSearchParams(); return `/alerts/${encodeURIComponent(id)}?${scope}`; }
function renderAlertDetail(alert, { detailError = '' } = {}) { $('#drawerContent').innerHTML = Detail.render(alert, { esc, scopePath, dingLabel, detailError }); $('#alertStatus').value = alert.status; $('#saveAlert').onclick = async () => { try { await api(alertScopePath(alert.id), { method: 'PATCH', body: JSON.stringify({ status: $('#alertStatus').value, resolutionNote: $('#resolutionNote').value }) }); closeDrawer(); await load(); toast('告警处置结果已保存'); } catch (error) { toast(`保存失败：${error.message}`); } }; }
let alertDetailSerial = 0;
async function openAlert(id) { const serial = ++alertDetailSerial; const fallback = state.alerts.find(x => x.id === id) || state.overview?.activeAlerts?.find(x => x.id === id); if (!fallback) return; $('#drawerMask').classList.add('open'); $('#drawerContent').innerHTML = `<h2>${esc(Detail.formatTitle(fallback))}</h2><div class="detail-loading">正在加载告警详情…</div>`; try { const detail = await api(alertScopePath(id)); if (serial === alertDetailSerial && $('#drawerMask').classList.contains('open')) renderAlertDetail({ ...fallback, ...detail }); } catch (error) { if (error.name !== 'AbortError' && serial === alertDetailSerial && $('#drawerMask').classList.contains('open')) renderAlertDetail(fallback, { detailError: error.message }); } }
function closeDrawer() { $('#drawerMask').classList.remove('open'); }
let loadSerial = 0;
let progressTimer = null;
let progressSerial = 0;
function renderAnalysisProgress(data) {
  const el = $('#analysisProgress'); if (!el) return;
  if (!data || data.batchStatus === 'batch_unavailable') { el.innerHTML = '<div class="module-state">暂无可用的 Q1 昨日分析批次</div>'; return; }
  const status = data.total === 0 ? '未开始' : (Number(data.pending || 0) + Number(data.running || 0) + Number(data.retryable || 0)) ? '分析中' : Number(data.failed || 0) ? '存在失败' : '已完成';
  const date = data.businessDate ? `批次 ${esc(data.businessDate)}` : '当前筛选范围';
  el.innerHTML = `<div class="analysis-progress-head"><span class="analysis-progress-title">Q1 昨日批次 内容分析 · ${status}</span><span class="analysis-progress-meta">${date} · ${data.updatedAt ? `更新于 ${esc((window.formatBeijingTime) ? window.formatBeijingTime(data.updatedAt) : data.updatedAt)}` : '等待任务状态'}</span></div><div class="analysis-progress-bar"><span style="width:${Math.min(100, Number(data.completionRate || 0))}%"></span></div><div class="analysis-progress-stats"><span>完成 <b>${data.completed}/${data.total}</b></span><span>待分析 <b>${data.pending}</b></span><span>分析中 <b>${data.running}</b></span><span>待重试 <b>${data.retryable}</b></span><span>失败 <b>${data.failed}</b></span><span>完成率 <b>${Number(data.completionRate || 0).toFixed(1)}%</b></span></div>`;
}
function stopProgressPolling() { if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; } }
async function pollAnalysisProgress() {
  stopProgressPolling(); const serial = ++progressSerial;
  try { const data = await api('/analysis/progress?scope=q1-latest'); if (serial !== progressSerial) return; renderAnalysisProgress(data); if (!data.terminal) progressTimer = setTimeout(pollAnalysisProgress, 5000); }
  catch (error) { if (serial === progressSerial) { const el = $('#analysisProgress'); if (el) el.innerHTML = `<div class="module-state error">内容分析进度加载失败：${esc(error.message)}（稍后重试）</div>`; progressTimer = setTimeout(pollAnalysisProgress, 5000); } }
}

const OVERVIEW_LOAD_MODULES = [
  { key: 'metrics', label: '指标概览' },
  { key: 'sources', label: '采集源' },
  { key: 'sourceDist', label: '平台来源' },
  { key: 'trend', label: '口碑趋势' },
  { key: 'topics', label: '议题分布' },
  { key: 'attentionList', label: '关注级内容' },
  { key: 'alerts', label: '当前告警' },
  { key: 'hotList', label: '负面内容' }
];
const OVERVIEW_TIMEOUT_MS = 30000; // 全部模块 30 秒仍未完成则进入超时错误态
const overviewLoadState = { active: false, done: new Set(), failed: new Set(), startedAt: 0, displayedPercent: 0, timedOut: false };
// 进度只按真实完成度驱动：每个模块完成（done/failed）各占 1/N，不做时间爬行。
function overviewMilestonePercent() {
  const total = OVERVIEW_LOAD_MODULES.length;
  const finished = overviewLoadState.done.size + overviewLoadState.failed.size;
  return Math.min(100, Math.round(finished / total * 100));
}
function renderOverviewLoading() {
  const el = $('#overviewLoading');
  if (!el) return;
  el.innerHTML = overviewLoadState.timedOut
    ? '<div class="module-state error">加载超时，请刷新重试</div>'
    : `<div class="module-state">正在加载概览数据（${overviewMilestonePercent()}%）</div>`;
}
function timeoutOverviewLoading() {
  if (!overviewLoadState.active || overviewLoadState.timedOut) return;
  overviewLoadState.timedOut = true;
  overviewLoadState.active = false;
  OVERVIEW_LOAD_MODULES.forEach(({ key }) => { if (!overviewLoadState.done.has(key)) overviewLoadState.failed.add(key); });
  loadSerial += 1;
  renderOverviewLoading();
  ['#metrics', '#sourceDistribution', '#trend', '#topics', '#attentionList', '#alerts', '#hotList'].forEach(selector => {
    const el = $(selector);
    if (el) el.innerHTML = '<div class="module-state error">加载超时，请刷新重试</div>';
  });
}
function startOverviewLoading() {
  overviewLoadState.active = true;
  overviewLoadState.done = new Set();
  overviewLoadState.failed = new Set();
  overviewLoadState.startedAt = Date.now();
  overviewLoadState.displayedPercent = 0;
  overviewLoadState.timedOut = false;
  if (overviewLoadState.timeoutTimer) clearTimeout(overviewLoadState.timeoutTimer);
  overviewLoadState.timeoutTimer = setTimeout(timeoutOverviewLoading, OVERVIEW_TIMEOUT_MS);
}
function finishOverviewLoading() {
  overviewLoadState.active = false;
  if (overviewLoadState.timeoutTimer) { clearTimeout(overviewLoadState.timeoutTimer); overviewLoadState.timeoutTimer = null; }
  const el = $('#overviewLoading');
  if (el && !overviewLoadState.failed.size) el.innerHTML = '';
}
function markOverviewModule(key, failed = false) {
  if (!overviewLoadState.active || overviewLoadState.timedOut) return;
  if (failed) overviewLoadState.failed.add(key);
  else overviewLoadState.done.add(key);
  renderOverviewLoading();
  if (overviewLoadState.done.size + overviewLoadState.failed.size >= OVERVIEW_LOAD_MODULES.length) finishOverviewLoading();
}
function markOverviewGroup(keys, failed = false) { keys.forEach(key => markOverviewModule(key, failed)); }

function moduleLoading(selector, label) {
  const el = $(selector);
  if (el) el.innerHTML = `<div class="module-state">${esc(label)}加载中…</div>`;
}
function moduleError(selector, error) {
  const el = $(selector);
  if (el) el.innerHTML = `<div class="module-state error">加载失败：${esc(error.message)}</div>`;
}
function renderOverview(overview) {
  if (overview.window?.publishedFrom && overview.window?.publishedTo) {
    state.window = Object.freeze({ publishedFrom: beijingIso(overview.window.publishedFrom), publishedTo: beijingIso(overview.window.publishedTo) });
    const params = new URLSearchParams(location.search); params.set('publishedFrom', state.window.publishedFrom); params.set('publishedTo', state.window.publishedTo);
    history.replaceState(null, '', `${location.pathname}?${params}`);
    const all = $('#viewAllNegative'); if (all) all.href = negativeContentHref();
    const attention = $('#viewAllAttention'); if (attention) attention.href = negativeContentHref('attention');
  }
  state.overview = overview || {};
  renderMetrics(state.overview.metrics || {});
  renderSourceDistribution(state.overview.sourceDistribution || []);
  renderTrend(state.overview.trend || [], state.overview.sentiment);
  renderTopics(state.overview.topicDistribution || [], state.overview.metrics || {});
  renderHot(state.overview.hotAttention || [], '#attentionList');
  renderAlerts(state.overview.activeAlerts || []);
  renderHot(state.overview.hotNegative || []);
}
async function load() {
  renderAlerts([]);
  const serial = ++loadSerial;
  const lifecycle = state.scope?.beginRequest?.();
  if (lifecycle && !lifecycle.allowed) {
    state.sources = []; state.overview = null; finishOverviewLoading();
    ['#metrics', '#sourceDistribution', '#trend', '#topics', '#attentionList', '#alerts', '#hotList'].forEach(selector => { const el = $(selector); if (el) el.innerHTML = '<div class="module-state">当前地区暂无可用社区</div>'; });
    return;
  }
  const scope = state.scope?.query?.() || new URLSearchParams();
  const overviewSuffix = overviewQuery(scope).toString();
  const sourceSuffix = scope.toString();
  updatePeriodUi();
  startOverviewLoading();
  renderOverviewLoading();

  const overviewTask = api(`/overview?${overviewSuffix}${overviewSuffix ? '&' : ''}fresh=1`, { signal: lifecycle?.signal })
    .then(overview => {
      if (serial !== loadSerial || !lifecycle?.isCurrent?.() || overviewLoadState.timedOut) return;
      renderOverview(overview);
      markOverviewGroup(['metrics', 'sourceDist', 'trend', 'topics', 'attentionList', 'alerts', 'hotList']);
    })
    .catch(error => {
      if (error.name !== 'AbortError' && serial === loadSerial && lifecycle?.isCurrent?.()) {
        ['#metrics', '#sourceDistribution', '#trend', '#topics', '#attentionList', '#alerts', '#hotList'].forEach(selector => moduleError(selector, error));
        markOverviewGroup(['metrics', 'sourceDist', 'trend', 'topics', 'attentionList', 'alerts', 'hotList'], true);
      }
    });

  const sourcesTask = api(`/sources${sourceSuffix ? `?${sourceSuffix}` : ''}`, { signal: lifecycle?.signal })
    .then(sources => {
      if (serial !== loadSerial || !lifecycle?.isCurrent?.() || overviewLoadState.timedOut) return;
      state.sources = Array.isArray(sources) ? sources : sources?.items || [];
      renderMetrics(state.overview?.metrics || {});
      markOverviewModule('sources');
    })
    .catch(error => {
      if (error.name !== 'AbortError' && serial === loadSerial && lifecycle?.isCurrent?.()) { moduleError('#metrics', error); markOverviewModule('sources', true); }
    });

  await Promise.allSettled([overviewTask, sourcesTask]);
  lifecycle?.release?.();
  // 内容分析进度已按需求隐藏：不再启动 5s 轮询（renderAnalysisProgress/pollAnalysisProgress 函数保留）
  // pollAnalysisProgress();
}
function bind() { document.querySelectorAll('[data-period]').forEach(button => { button.onclick = () => { if (button.dataset.period === state.period) return; state.period = button.dataset.period; syncPeriodUrl(); updatePeriodUi(); load(); }; }); const periodSelect = $('[data-period-select]'); if (periodSelect) periodSelect.onchange = () => { if (!PERIOD_LABELS[periodSelect.value] || periodSelect.value === state.period) return; state.period = periodSelect.value; syncPeriodUrl(); updatePeriodUi(); load(); }; $('#drawerClose').onclick = closeDrawer; $('#drawerMask').onclick = event => { if (event.target === $('#drawerMask')) closeDrawer(); }; $('#viewAlerts').onclick = () => { const params = state.scope?.query?.() || new URLSearchParams(); params.set('period', state.period); window.location.href = `alerts.html?${params}`; }; }
bind();
async function scopeChanged() { alertDetailSerial += 1; closeDrawer(); state.overview = null; state.sources = []; state.window = validOverviewWindow(); state.period = resolveOverviewPeriod(new URLSearchParams(location.search)); await load(); }
PublicOpinionScope.init({ host: '[data-po-scope]', onChange: scopeChanged }).then(scope => {
  state.scope = scope;
  load();
}).catch(error => {
  state.scope = null;
  ['#metrics', '#trend', '#topics', '#attentionList', '#alerts', '#hotList', '#sourceDistribution'].forEach(selector => moduleError(selector, error));
  // 内容分析进度已隐藏：失败兜底也不再拉取（函数保留）
  // pollAnalysisProgress();
});
