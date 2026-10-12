const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const RiskModes = window.PublicOpinionRiskModes;
const PERIOD_LABELS = { today: '今日', yesterday: '昨日', '7d': '近7天', '30d': '近30天' };
const OVERVIEW_PERIOD_STORAGE_KEY = 'public-opinion:overview:period';
function validPeriod(value) { return Object.prototype.hasOwnProperty.call(PERIOD_LABELS, value); }
function readSavedPeriod(storage = window.localStorage) { try { const value = storage.getItem(OVERVIEW_PERIOD_STORAGE_KEY); return validPeriod(value) ? value : null; } catch (_) { return null; } }
function savePeriod(value, storage = window.localStorage) { try { if (validPeriod(value)) storage.setItem(OVERVIEW_PERIOD_STORAGE_KEY, value); else storage.removeItem(OVERVIEW_PERIOD_STORAGE_KEY); } catch (_) { /* private mode must not block overview refresh */ } }
function resolveOverviewPeriod(params = new URLSearchParams(window.location.search), storage = window.localStorage) { const requested = params.get('period'); return validPeriod(requested) ? requested : readSavedPeriod(storage) || 'today'; }
const state = { sources: [], overview: null, contents: [], alerts: [], scope: null, period: resolveOverviewPeriod() };
const hotPanels = {
  negative: { type: 'post', items: [], serial: 0, selector: '#hotList', link: '#viewAllNegative' },
  attention: { type: 'post', items: [], serial: 0, selector: '#attentionList', link: '#viewAllAttention' }
};
let hotPanelsReady = false;
function validOverviewWindow(params = new URLSearchParams(location.search)) {
  const from = params.get('publishedFrom'); const to = params.get('publishedTo');
  return from?.includes('T') && to?.includes('T') && Number.isFinite(Date.parse(from)) && Date.parse(to) > Date.parse(from) && Date.parse(to) - Date.parse(from) <= 31 * 86400000 ? { publishedFrom: from, publishedTo: to } : null;
}
state.window = validOverviewWindow();
const beijingIso = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().replace('Z', '+08:00');
function negativeContentHref(mode = 'negative') {
  const params = state.scope?.query() || new URLSearchParams();
  params.set('contentMode', mode);
  params.set('contentType', hotPanels[mode]?.type || 'post');
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

function refreshFrequencyText(sources) {
  if (!sources.length) return '暂无抓取账号配置';
  const enabled = sources.filter(source => source.enabled === true || Number(source.enabled) === 1);
  if (!enabled.length) return '抓取账号已停用';
  const frequencies = [...new Set(enabled.map(source => Number(source.frequency_seconds ?? source.frequencySeconds)))].sort((a, b) => a - b);
  if (frequencies.some(value => !Number.isFinite(value) || value <= 0)) return '采集频率待确认';
  const labels = frequencies.map(seconds => seconds % 3600 === 0 ? `${seconds / 3600}小时` : seconds % 60 === 0 ? `${seconds / 60}分钟` : `${seconds}秒`);
  return labels.length === 1 ? `数据每${labels[0]}刷新` : `数据按账号配置刷新（每${labels.join('、每')}）`;
}
function renderRefreshFrequency(text) {
  const el = $('#refreshFrequency');
  if (el) el.textContent = text;
}

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
  const breakdown = index => {
    const keys = [['postCount', 'commentCount'], ['attentionPostCount', 'attentionCommentCount'], ['urgentPostCount', 'urgentCommentCount']][index];
    if (keys.some(key => metrics[key] == null)) return '';
    return `<span class="metric-breakdown"><span>帖子/动态 <b>${Number(metrics[keys[0]]).toLocaleString()}</b></span><span>评论 <b>${Number(metrics[keys[1]]).toLocaleString()}</b></span></span>`;
  };
  const cards = [[`${periodLabel()}发布内容`, Number(metrics.newCount ?? metrics.total ?? 0).toLocaleString(), '当前筛选范围内新增', '总'], ['关注级', Number(metrics.attention ?? 0).toLocaleString(), '已识别的关注级内容', '注'], ['紧急告警', Number(metrics.urgent ?? 0).toLocaleString(), '已识别的待处理风险内容', '警']];
  const accent = index => ['', ' metric-attention', ' metric-urgent'][index] || '';
  const metricsEl = $('#metrics'); if (!metricsEl) return;
  metricsEl.innerHTML = cards.map(([label, value, foot, icon], index) => `<div class="metric${accent(index)}"><div class="metric-head"><span>${label}</span><span class="metric-icon">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot metric-total-foot ${index > 0 ? 'up' : ''}"><span>${foot}</span>${breakdown(index)}</div></div>`).join('');
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
    const current = grouped.get(key) || { date: key, positive: 0, negative: 0, neutral: 0, unclassified: 0, total: 0 };
    ['positive', 'negative', 'neutral', 'unclassified'].forEach(field => {
      const value = Number(item?.[field]);
      if (Number.isFinite(value) && value >= 0) current[field] += value;
    });
    grouped.set(key, current);
  });
  return [...grouped.values()].map(day => ({ ...day, total: day.positive + day.negative + day.neutral + day.unclassified })).sort((a, b) => a.date.localeCompare(b.date));
}
// This chart owns its time range; the overview date controls never enter its query.
const lineTrendState = { period: '7d', serial: 0, controller: null };
function lineTrendDays(overview, period) {
  const count = period === '30d' ? 30 : 7;
  const start = overview?.window?.publishedFrom;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const first = start && Number.isFinite(Date.parse(start)) ? beijingIso(start).slice(0, 10) : new Date(Date.parse(`${today}T00:00:00Z`) - (count - 1) * 86400000).toISOString().slice(0, 10);
  const grouped = new Map(normalizeTrend(overview?.trend).map(day => [day.date, day]));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.parse(`${first}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
    return grouped.get(date) || { date, positive: 0, neutral: 0, negative: 0, unclassified: 0, total: 0 };
  });
}
function renderLineTrend(overview) {
  const container = $('#lineTrend');
  if (!container) return;
  const days = lineTrendDays(overview, lineTrendState.period);
  const series = [['positive', '正向', '#60a5fa'], ['neutral', '中性', '#64748b'], ['negative', '负面', '#ef4444']];
  if (days.some(day => day.unclassified > 0)) series.push(['unclassified', '暂未分析', '#f59e0b']);
  const max = Math.max(1, ...days.flatMap(day => series.map(([key]) => day[key])));
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const x = index => 46 + index * 634 / (days.length - 1);
  const y = value => 182 - value * 158 / ceiling;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = ceiling * index / 4;
    return `<line x1="46" x2="680" y1="${y(value)}" y2="${y(value)}" stroke="#eaecf0"/><text x="38" y="${y(value) + 4}" text-anchor="end">${value}</text>`;
  }).join('');
  const labels = days.map((day, index) => index === 0 || index === days.length - 1 || index % (days.length > 7 ? 5 : 1) === 0 ? `<text x="${x(index)}" y="205" text-anchor="middle">${day.date.slice(5).replace('-', '/')}</text>` : '').join('');
  const paths = series.map(([key, label, color]) => `<polyline fill="none" stroke="${color}" stroke-width="2" points="${days.map((day, index) => `${x(index)},${y(day[key])}`).join(' ')}"/>${days.map((day, index) => `<circle tabindex="0" aria-label="${day.date} ${label} ${day[key]}条" cx="${x(index)}" cy="${y(day[key])}" r="3" fill="${color}"><title>${day.date} ${label}：${day[key]}条</title></circle>`).join('')}`).join('');
  const empty = days.every(day => day.total === 0);
  container.dataset.period = lineTrendState.period;
  container.dataset.from = days[0].date;
  container.dataset.to = days[days.length - 1].date;
  container.innerHTML = `<div class="legend">${series.map(([, label, color]) => `<span><i style="background:${color}"></i>${label}</span>`).join('')}<span>单位：条</span></div><div class="line-trend-scroll"><svg viewBox="0 0 710 220" role="img" aria-label="${PERIOD_LABELS[lineTrendState.period]}每日口碑内容数量折线图"><g fill="#667085" font-size="11">${grid}${labels}</g>${paths}</svg></div><div class="line-trend-caption">${days[0].date} 至 ${days[days.length - 1].date} · 北京时间${empty ? ' · 暂无内容' : ''}</div>`;
}
const LINE_TREND_CACHE_KEY = 'public-opinion:line-trend-cache:v1';
const LINE_TREND_CACHE_TTL = 5 * 60 * 1000;
const lineTrendPending = new Map();
const lineTrendCache = new Map();
function readLineTrendCache(key) {
  try {
    if (!lineTrendCache.has(key)) {
      const saved = JSON.parse(sessionStorage.getItem(LINE_TREND_CACHE_KEY) || '[]');
      saved.forEach(([savedKey, entry]) => { if (entry?.expiresAt > Date.now()) lineTrendCache.set(savedKey, entry); });
    }
  } catch (_) { /* Storage is optional. */ }
  const entry = lineTrendCache.get(key);
  if (entry?.expiresAt > Date.now()) return entry.data;
  lineTrendCache.delete(key);
  return null;
}
function saveLineTrendCache(key, data) {
  lineTrendCache.delete(key);
  const snapshotTime = Date.parse(data?.window?.publishedTo);
  const expiresAt = Math.min(Date.now(), Number.isFinite(snapshotTime) ? snapshotTime : Date.now()) + LINE_TREND_CACHE_TTL;
  lineTrendCache.set(key, { data, expiresAt });
  while (lineTrendCache.size > 24) lineTrendCache.delete(lineTrendCache.keys().next().value);
  try { sessionStorage.setItem(LINE_TREND_CACHE_KEY, JSON.stringify([...lineTrendCache])); } catch (_) { /* Storage is optional. */ }
}
async function loadLineTrend() {
  const container = $('#lineTrend');
  if (!container || !state.scope) return;
  const serial = ++lineTrendState.serial;
  const period = lineTrendState.period;
  document.querySelectorAll('[data-line-period]').forEach(button => {
    const active = button.dataset.linePeriod === period;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  container.setAttribute('aria-busy', 'false');
  if (!state.scope.available()) { container.innerHTML = '<div class="module-state">当前地区暂无可用社区</div>'; return; }
  const params = new URLSearchParams(state.scope.query());
  params.set('period', period);
  params.sort();
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const key = `${day}:${params}`;
  const cached = readLineTrendCache(key);
  if (cached) { renderLineTrend(cached); return; }
  container.innerHTML = '<div class="module-state">折线图加载中…</div>';
  container.setAttribute('aria-busy', 'true');
  const pendingKey = `${state.scope.epoch()}:${key}`;
  let pending = lineTrendPending.get(pendingKey);
  if (!pending) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    pending = api(`/overview-trend?${params}`, { signal: controller.signal }).then(overview => {
      saveLineTrendCache(key, overview);
      return overview;
    }).finally(() => {
      clearTimeout(timeout);
      if (lineTrendPending.get(pendingKey) === pending) lineTrendPending.delete(pendingKey);
    });
    lineTrendPending.set(pendingKey, pending);
  }
  try {
    const overview = await pending;
    if (serial === lineTrendState.serial) renderLineTrend(overview);
  } catch (error) {
    if (serial !== lineTrendState.serial) return;
    container.innerHTML = '<div class="module-state">折线图加载失败，请重试 <button type="button" class="btn" data-line-retry>重试</button></div>';
    container.querySelector('[data-line-retry]').onclick = loadLineTrend;
  } finally {
    if (serial === lineTrendState.serial) container.setAttribute('aria-busy', 'false');
  }
}

function bindLineTrend() {
  document.querySelectorAll('[data-line-period]').forEach(button => {
    button.onclick = () => {
      if (lineTrendState.period === button.dataset.linePeriod) return;
      lineTrendState.period = button.dataset.linePeriod;
      loadLineTrend();
    };
  });
}

function renderTrend(items, sentiment) {
  const container = $('#trend');
  if (!container) return;
  const normalized = normalizeTrend(items);
  const unclassifiedLegend = $('#trendUnclassifiedLegend');
  if (unclassifiedLegend) unclassifiedLegend.hidden = true;
  if (!normalized.length) { container.innerHTML = `<div class="module-state">${esc(scopeEmpty(`${periodLabel()}采集数据`))}</div>`; return; }
  const totals = normalizeSentiment(sentiment, normalized);
  if (unclassifiedLegend) unclassifiedLegend.hidden = !(totals.unclassified > 0 || normalized.some(day => day.unclassified > 0));
  const classifiedTotal = totals.positive + totals.neutral + totals.negative;
  const positiveRate = classifiedTotal ? totals.positive / classifiedTotal * 100 : 0;
  const negativeRate = classifiedTotal ? totals.negative / classifiedTotal * 100 : 0;
  const neutralRate = classifiedTotal ? totals.neutral / classifiedTotal * 100 : 0;
  const max = Math.max(...normalized.map(day => day.total), 1);
  const barHeight = 150;
  const bar = value => {
    const v = Number(value || 0);
    const h = v > 0 ? Math.max(3, barHeight * v / max) : 0;
    return `<div class="trend-bar ${v > 0 ? '' : 'empty'}" style="height:${h.toFixed(1)}px"></div>`;
  };
  const labelEvery = Math.max(1, Math.ceil(normalized.length / 8));
  const singlePoint = normalized.length === 1;
  container.innerHTML = `<div class="emotion-summary"><div class="positive"><strong>${positiveRate.toFixed(1)}%</strong><span>正向率 <b>${periodLabel()}</b></span></div><div class="danger"><strong>${negativeRate.toFixed(1)}%</strong><span>负面率 <b>${periodLabel()}</b></span></div><div class="neutral"><strong>${neutralRate.toFixed(1)}%</strong><span>中性率 <b>${periodLabel()}</b></span></div>${totals.unclassified > 0 ? `<div class="unclassified"><strong>${totals.unclassified.toLocaleString()}</strong><span>暂未分析</span></div>` : ''}</div><div class="topic-note">共 ${(classifiedTotal + totals.unclassified).toLocaleString()} 条，已分析 ${classifiedTotal.toLocaleString()} 条；情感比例按已分析内容计算。</div><div class="trend-bars${singlePoint ? ' single-point' : ''}">${normalized.map((day, index) => { const positive = day.positive; const negative = day.negative; const neutral = day.neutral; const unclassified = day.unclassified; const label = index % labelEvery === 0 || index === normalized.length - 1 ? day.date.slice(5) : ''; return `<div class="trend-day-col" title="${esc(day.date)} · 正向 ${positive.toLocaleString()} · 中性 ${neutral.toLocaleString()} · 负面 ${negative.toLocaleString()}${unclassified > 0 ? ` · 暂未分析 ${unclassified.toLocaleString()}` : ''} · 共 ${day.total.toLocaleString()}"><div class="trend-bar-pair"><div class="trend-bar-group positive">${bar(positive)}<b>${positive.toLocaleString()}</b></div><div class="trend-bar-group neutral">${bar(neutral)}<b>${neutral.toLocaleString()}</b></div><div class="trend-bar-group negative">${bar(negative)}<b>${negative.toLocaleString()}</b></div>${unclassified > 0 ? `<div class="trend-bar-group unclassified">${bar(unclassified)}<b>${unclassified.toLocaleString()}</b></div>` : ''}</div><span class="trend-day-label">${esc(label)}</span></div>`; }).join('')}</div>`;
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
function renderAlerts(items, urgentContents = [], urgentTotal = urgentContents.length) {
  const section = $('#currentAlertsSection'); if (section) section.hidden = !items?.length && !urgentContents.length;
  renumberOverviewSections();
  const container = $('#alerts');
  if (!container) return;
  const viewAll = $('#viewAlerts');
  if (viewAll) viewAll.onclick = () => {
    if (!items?.length && urgentContents.length) {
      const url = new URL(negativeContentHref('urgent'), window.location.href);
      url.searchParams.delete('contentType'); window.location.href = url.href;
    } else {
      const params = state.scope?.query?.() || new URLSearchParams(); params.set('period', state.period);
      window.location.href = `alerts.html?${params}`;
    }
  };
  container.innerHTML = items && items.length ? items.map(alert => { const summary = Detail.extractAiSummary(alert.trigger_detail || alert.trigger || ''); const title = summary || alert.title || '暂无告警标题'; const created = alert.created_at || alert.createdAt; return `<div class="alert-row"><span class="severity ${alert.severity}">${alert.severity === 'urgent' ? 'P0 紧急' : alert.severity === 'attention' ? 'P1 关注' : 'P2 提示'}</span><div class="row-main"><div class="row-title">${esc(title)}</div><div class="row-meta">${esc(scopePath(alert))} · ${(created && window.formatBeijingTime) ? window.formatBeijingTime(created) : (created || '')} · ${alert.status === 'processing' ? '处理中' : '待处理'} ${alert.alert_type ? '· ' + alert.alert_type : ''}</div></div><span class="row-action" data-alert="${alert.id}">详情</span></div>`; }).join('') : `<div class="row-meta" style="padding:20px 0">${esc(scopeEmpty('待处理告警'))}</div>`;
  container.querySelectorAll('[data-alert]').forEach(el => { el.onclick = () => openAlert(el.dataset.alert); });
  if (urgentContents.length) {
    if (!items?.length) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', urgentContents.map(item => `<div class="alert-row urgent-content-row"><span class="severity urgent">P0 紧急</span><div class="row-main"><div class="row-title">${esc(item.summary || item.title || item.body || '严重内容')}</div><div class="row-meta">${esc(scopePath(item))} · 严重内容 · 尚未生成告警事件</div></div><button class="row-action" data-urgent-content="${esc(item.id)}">查看</button></div>`).join(''));
    container.querySelectorAll('[data-urgent-content]').forEach(el => { el.onclick = () => openContent(el.dataset.urgentContent); });
    if (urgentTotal > urgentContents.length) {
      container.insertAdjacentHTML('beforeend', `<div class="row-meta">共 ${Number(urgentTotal).toLocaleString()} 条尚未生成事件的严重内容，显示最新 ${urgentContents.length} 条。<button class="row-action" id="viewUrgentContents">查看全部严重内容</button></div>`);
      $('#viewUrgentContents').onclick = () => { const url = new URL(negativeContentHref('urgent'), window.location.href); url.searchParams.delete('contentType'); window.location.href = url.href; };
    }
  }
}
function renderHot(items, selector = '#hotList') {
  const container = $(selector);
  if (!container) return;
  container.innerHTML = items && items.length ? items.map(item => `<div class="hot-row"><span class="severity attention">${esc(({ post: '帖子', dynamic: '动态', comment: '评论', review: '评论', video: '帖子' })[item.display_type || item.content_type] || '帖子')}</span><div class="row-main"><div class="row-title">${esc(hotContentText(item))}</div><div class="row-meta">${esc(hotSummaryText(item))}</div></div><span class="row-action" data-content="${item.id}">查看</span></div>`).join('') : `<div class="row-meta" style="padding:20px 0">${esc(scopeEmpty(selector === '#attentionList' ? '关注级内容' : '负面内容'))}</div>`;
  container.querySelectorAll('[data-content]').forEach(el => { el.onclick = () => openContent(el.dataset.content); });
}
function updateHotTabs(mode) {
  const panel = hotPanels[mode];
  document.querySelectorAll(`[data-hot-mode="${mode}"]`).forEach(button => {
    const active = button.dataset.hotType === panel.type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const link = $(panel.link); if (link) link.href = negativeContentHref(mode);
}
async function loadHotPanel(mode) {
  const panel = hotPanels[mode];
  updateHotTabs(mode);
  if (!hotPanelsReady || !state.window) return;
  const serial = ++panel.serial, overviewSerial = loadSerial, type = panel.type;
  const lifecycle = state.scope?.beginRequest?.();
  if (!lifecycle?.allowed) return;
  const query = state.scope.query();
  query.set('contentType', type); query.set('riskMode', mode);
  query.set('publishedFrom', state.window.publishedFrom); query.set('publishedTo', state.window.publishedTo);
  query.set('page', '1'); query.set('pageSize', '20'); query.set('sort', 'published_desc');
  panel.items = [];
  moduleLoading(panel.selector, type === 'post' ? '帖子/动态' : '评论');
  const current = () => serial === panel.serial && overviewSerial === loadSerial && lifecycle.isCurrent();
  try {
    const result = await api(`/contents?${query}`, { signal: lifecycle.signal });
    if (!current()) return;
    panel.items = Array.isArray(result) ? result : result?.items || [];
    renderHot(panel.items, panel.selector);
    if (!panel.items.length) $(panel.selector).innerHTML = `<div class="row-meta" style="padding:20px 0">暂无${mode === 'negative' ? '负面' : '关注级'}${type === 'post' ? '帖子/动态' : '评论'}</div>`;
    markOverviewModule(mode === 'negative' ? 'hotList' : 'attentionList');
  } catch (error) {
    if (current() && error.name !== 'AbortError') {
      moduleError(panel.selector, error);
      markOverviewModule(mode === 'negative' ? 'hotList' : 'attentionList', true);
    }
  } finally { lifecycle.release(); }
}
function bindHotTabs() {
  document.querySelectorAll('[data-hot-mode]').forEach(button => {
    button.onclick = () => {
      const mode = button.dataset.hotMode, panel = hotPanels[mode];
      if (panel.type === button.dataset.hotType) return;
      panel.type = button.dataset.hotType;
      loadHotPanel(mode);
    };
  });
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
function renderOverviewContent(item, originalPost, detailError = '') { const published = item.published_at || item.publishedAt; const media = Array.isArray(item.media) ? item.media : []; const mediaHtml = media.map(url => `<img class="content-image" src="${esc(url)}" alt="帖子图片" loading="lazy">`).join(''); $('#drawerContent').innerHTML = `<h2>${esc(item.title || '(无标题)')}</h2><div class="row-meta">${esc(scopePath(item))} · ${esc(sourceName(item.source_id || item.sourceId || item.platform))} · ${(published && window.formatBeijingTime) ? window.formatBeijingTime(published) : (published || '-')}</div><div class="detail-block"><div class="detail-label">原文内容</div><div class="detail-text">${Detail.renderBodyWithImages(item.body, esc)}</div>${mediaHtml}</div>${Detail.renderTranslation(item, esc)}<div class="detail-block"><div class="detail-label">内容分析</div><div class="detail-text">情感：${item.sentiment === 'negative' ? '负面' : item.sentiment === 'positive' ? '正面' : '中性'} · 负面强度 ${Math.round(Number(item.negative_score || item.negativeScore || 0) * 100)}%<br>话题：${esc((item.topics || []).join ? (item.topics || []).join('、') : item.topic || '未分类')}<br>命中关键词：${esc((item.matched_keywords || item.keywords || []).join ? (item.matched_keywords || item.keywords || []).join('、') : '无')}<br>摘要：${esc(item.summary || '暂无摘要')}</div></div><div class="detail-block"><div class="detail-label">来源信息</div><div class="detail-text">作者：${esc(item.author_name || item.author || '未知')}<br>来源链接：<a href="${esc(item.source_url || item.url || '#')}" target="_blank" rel="noreferrer">打开来源</a></div></div>`; if (item.content_type === 'comment') $('#drawerContent').insertAdjacentHTML('beforeend', '<div class="detail-block original-post"><div class="detail-label">所属原帖</div>' + (originalPost ? Detail.renderContentNode(originalPost, new Set(), originalPost.is_deleted ? '原帖（已删除 / 隐藏）' : '原帖', esc) : '<div class="detail-text">' + esc(detailError ? '原帖加载失败，请关闭后重试：' + detailError : '原帖暂未采集或不可访问') + '</div>') + '</div>'); hydrateOverviewTranslations(); }
function hydrateOverviewTranslations() {
  const nodes = [...$('#drawerContent').querySelectorAll('[data-translation-id]')];
  const scope = state.scope?.query?.() || new URLSearchParams();
  const valid = node => node.isConnected && $('#drawerMask').classList.contains('open') && $('#drawerContent').contains(node);
  const showError = (node, message) => {
    if (!valid(node)) return;
    const status = node.querySelector('.translation-state'); if (status) status.textContent = message;
    const retry = node.querySelector('[data-translation-retry]'); if (retry) { retry.hidden = false; retry.onclick = () => run(node); }
  };
  const run = async node => {
    if (!valid(node) || node.dataset.translationReady === 'true' || node.dataset.translationBusy === 'true') return;
    node.dataset.translationBusy = 'true';
    const retry = node.querySelector('[data-translation-retry]'); if (!retry) { node.dataset.translationBusy = 'false'; return; }
    retry.hidden = true;
    const status = node.querySelector('.translation-state'); if (status) status.textContent = '正在生成中文翻译…';
    const id = node.dataset.translationId;
    const url = '/contents/' + encodeURIComponent(id);
    try {
      let detail = await api(url + '?' + scope);
      if (!valid(node)) return;
      if (detail.content.translation?.status !== 'completed') {
        const result = await api(url + '/translation?' + scope, { method: 'POST', body: '{}' });
        if (!valid(node)) return;
        if (result.errorCode === 'AI_TRANSLATION_DAILY_LIMIT_REACHED') { showError(node, '今日翻译额度已用完，请稍后重试'); return; }
        if (['failed', 'unavailable'].includes(result.status)) { showError(node, '中文翻译生成失败，请重试'); return; }
      }
      for (let attempt = 0; attempt < 30 && valid(node); attempt++) {
        detail = await api(url + '?' + scope);
        if (!valid(node)) return;
        const translation = detail.content.translation;
        if (translation?.status === 'completed') { node.outerHTML = Detail.renderTranslation(detail.content, esc); return; }
        if (translation?.errorCode === 'AI_TRANSLATION_DAILY_LIMIT_REACHED') { showError(node, '今日翻译额度已用完，请稍后重试'); return; }
        if (translation?.status === 'failed') { showError(node, '中文翻译生成失败，请重试'); return; }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      showError(node, '翻译仍在生成中，请稍后重试');
    } catch (error) { if (error.name !== 'AbortError') showError(node, '翻译暂不可用，请重试'); }
    finally { node.dataset.translationBusy = 'false'; }
  };
  let next = 0;
  const drain = async () => { while (next < nodes.length) { const node = nodes[next++]; if (!valid(node)) return; await run(node); } };
  drain(); drain();
}

let contentDetailSerial = 0;
async function openContent(id) {
  const serial = ++contentDetailSerial; ++alertDetailSerial;
  const item = Object.values(hotPanels).flatMap(panel => panel.items).find(x => x.id === id) || state.contents.find(x => x.id === id) || state.overview?.urgentUnlinkedContents?.find(x => x.id === id);
  if (!item) return;
  $('#drawerMask').classList.add('open');
  $('#drawerContent').innerHTML = '<div class="detail-loading">正在加载内容与原帖…</div>';
  try {
    const scope = state.scope?.query?.() || new URLSearchParams();
    const detail = await api('/contents/' + encodeURIComponent(id) + '?' + scope);
    if (serial === contentDetailSerial && $('#drawerMask').classList.contains('open')) renderOverviewContent({ ...item, ...detail.content }, detail.originalPost);
  } catch (error) {
    if (error.name !== 'AbortError' && serial === contentDetailSerial && $('#drawerMask').classList.contains('open')) renderOverviewContent(item, null, error.message);
  }
}
const dingLabel = status => ({ not_sent: '未推送', sent: '已推送', failed: '推送失败' }[status] || status || '未推送');
function alertScopePath(id) { const scope = state.scope?.query?.() || new URLSearchParams(); return `/alerts/${encodeURIComponent(id)}?${scope}`; }
function renderAlertDetail(alert, { detailError = '' } = {}) { $('#drawerContent').innerHTML = Detail.render(alert, { esc, scopePath, dingLabel, detailError }); hydrateOverviewTranslations(); $('#alertStatus').value = alert.status; $('#saveAlert').onclick = async () => { try { await api(alertScopePath(alert.id), { method: 'PATCH', body: JSON.stringify({ status: $('#alertStatus').value, resolutionNote: $('#resolutionNote').value }) }); closeDrawer(); await load(); toast('告警处置结果已保存'); } catch (error) { toast(`保存失败：${error.message}`); } }; }
let alertDetailSerial = 0;
async function openAlert(id) { ++contentDetailSerial; const serial = ++alertDetailSerial; const fallback = state.alerts.find(x => x.id === id) || state.overview?.activeAlerts?.find(x => x.id === id); if (!fallback) return; $('#drawerMask').classList.add('open'); $('#drawerContent').innerHTML = `<h2>${esc(Detail.formatTitle(fallback))}</h2><div class="detail-loading">正在加载告警详情…</div>`; try { const detail = await api(alertScopePath(id)); if (serial === alertDetailSerial && $('#drawerMask').classList.contains('open')) renderAlertDetail({ ...fallback, ...detail }); } catch (error) { if (error.name !== 'AbortError' && serial === alertDetailSerial && $('#drawerMask').classList.contains('open')) renderAlertDetail(fallback, { detailError: error.message }); } }
function closeDrawer() { ++contentDetailSerial; ++alertDetailSerial; $('#drawerMask').classList.remove('open'); }
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
  hotPanelsReady = true;
  loadHotPanel('attention');
  renderAlerts(state.overview.activeAlerts || [], state.overview.urgentUnlinkedContents || [], state.overview.metrics?.urgentUnlinkedTotal || 0);
  loadHotPanel('negative');
}
async function load() {
  renderRefreshFrequency('采集频率加载中…');
  hotPanelsReady = false;
  Object.values(hotPanels).forEach(panel => { panel.serial += 1; panel.items = []; });
  renderAlerts([]);
  const serial = ++loadSerial;
  const lifecycle = state.scope?.beginRequest?.();
  if (lifecycle && !lifecycle.allowed) {
    renderRefreshFrequency('暂无可用社区');
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
      markOverviewGroup(['metrics', 'sourceDist', 'trend', 'topics', 'alerts']);
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
      renderRefreshFrequency(refreshFrequencyText(state.sources));
      renderMetrics(state.overview?.metrics || {});
      markOverviewModule('sources');
    })
    .catch(error => {
      if (error.name !== 'AbortError' && serial === loadSerial && lifecycle?.isCurrent?.()) { renderRefreshFrequency('采集频率加载失败'); moduleError('#metrics', error); markOverviewModule('sources', true); }
    });

  await Promise.allSettled([overviewTask, sourcesTask]);
  lifecycle?.release?.();
  // 内容分析进度已按需求隐藏：不再启动 5s 轮询（renderAnalysisProgress/pollAnalysisProgress 函数保留）
  // pollAnalysisProgress();
}
function bind() { bindLineTrend(); bindHotTabs(); document.querySelectorAll('[data-period]').forEach(button => { button.onclick = () => { if (button.dataset.period === state.period) return; state.period = button.dataset.period; syncPeriodUrl(); updatePeriodUi(); load(); }; }); const periodSelect = $('[data-period-select]'); if (periodSelect) periodSelect.onchange = () => { if (!PERIOD_LABELS[periodSelect.value] || periodSelect.value === state.period) return; state.period = periodSelect.value; syncPeriodUrl(); updatePeriodUi(); load(); }; $('#drawerClose').onclick = closeDrawer; $('#drawerMask').onclick = event => { if (event.target === $('#drawerMask')) closeDrawer(); }; $('#viewAlerts').onclick = () => { const params = state.scope?.query?.() || new URLSearchParams(); params.set('period', state.period); window.location.href = `alerts.html?${params}`; }; }
bind();
async function scopeChanged() { alertDetailSerial += 1; closeDrawer(); state.overview = null; state.sources = []; state.window = validOverviewWindow(); state.period = resolveOverviewPeriod(new URLSearchParams(location.search)); loadLineTrend(); await load(); }
PublicOpinionScope.init({ host: '[data-po-scope]', onChange: scopeChanged }).then(scope => {
  state.scope = scope; loadLineTrend();
  load();
}).catch(error => {
  renderRefreshFrequency('采集频率加载失败');
  state.scope = null;
  ['#metrics', '#trend', '#topics', '#attentionList', '#alerts', '#hotList', '#sourceDistribution'].forEach(selector => moduleError(selector, error));
  // 内容分析进度已隐藏：失败兜底也不再拉取（函数保留）
  // pollAnalysisProgress();
});
