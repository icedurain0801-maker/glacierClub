const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const Detail = window.PublicOpinionAlertDetail;
const RiskModes = window.PublicOpinionRiskModes;
const state = { sources: [], contents: [], scope: null, contentMode: 'post', page: 1, pageSize: 50, total: 0, requestSerial: 0, statsSerial: 0, deepLinkOpened: '', publishedFrom: '', publishedTo: '' };
const CONTENT_DATE_STORAGE_KEY = 'public-opinion:content:published-range';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pick = (object, ...keys) => keys.map(key => object?.[key]).find(value => value !== undefined && value !== null);
const sourceById = id => state.sources.find(item => String(item.id) === String(id));
const sourceName = id => sourceById(id)?.display_name || sourceById(id)?.displayName || sourceById(id)?.platform || id || '-';
const typeLabel = type => ({ post: '帖子', dynamic: '动态', comment: '评论', review: '评论', video: '帖子' }[type] || type || '帖子');
const sentimentLabel = value => ({ negative: '负面', positive: '正面', neutral: '中性', unclassified: '未分类' }[value] || '未分类');
const analysisStatusLabel = value => ({ pending: '待分析', running: '分析中', retryable: '待重试', completed: '已完成', failed: '分析失败', unclassified: '未分类' }[value] || '未分类');
const analysisLevelLabel = value => ({ light: '轻量分析', deep: '深度分析' }[value] || '未设置');
const analysisStatus = item => pick(item, 'analysis_status', 'analysisStatus') || (item.sentiment ? 'completed' : 'unclassified');
const analysisLevel = item => pick(item, 'analysis_level', 'analysisLevel');
const analysisReasonText = item => {
  const status = analysisStatus(item);
  const reason = String(pick(item, 'analysis_reason', 'analysisReason') || '').trim();
  if (status === 'completed' && reason) return `分析原因：${reason}`;
  if (['pending', 'running'].includes(status)) return '分析完成后将生成原因。';
  if (['retryable', 'failed'].includes(status)) return '分析原因生成失败，可重新分析。';
  return '暂无分析原因，可点击重新分析生成。';
};
const severityLabel = value => ({ urgent: '紧急', attention: '关注', normal: '正常' }[value] || '正常');
const contentType = item => pick(item, 'content_type', 'contentType') || 'post';
const hasRealTitle = item => String(pick(item, 'title') ?? '').trim().length > 0;
const selectedPlatform = () => String(state.scope?.selected?.()?.platform || state.scope?.query?.().get('platform') || '').toLowerCase();
const isBigPlayerScope = () => selectedPlatform() === 'bigplayer_h5';
const bigPlayerDisplayType = item => pick(item, 'display_type', 'displayType') || contentType(item);
const selectedBigPlayerContentKind = () => $('#bigPlayerContentKindFilter')?.value || '';
function ensureBigPlayerContentKindFilter() {
  if ($('#bigPlayerContentKindFilter')) return;
  $('#analysisLevelFilter')?.insertAdjacentHTML('afterend', '<select class="input" id="bigPlayerContentKindFilter" hidden><option value="">全部类型</option><option value="post">帖子</option><option value="dynamic">动态</option></select>');
}
function updateBigPlayerContentKindFilter() {
  const filter = $('#bigPlayerContentKindFilter');
  if (!filter) return;
  filter.hidden = !isBigPlayerScope();
  if (!isBigPlayerScope()) filter.value = '';
}
function filterBigPlayerContentKinds(items) {
  const kind = selectedBigPlayerContentKind();
  return isBigPlayerScope() && kind ? items.filter(item => bigPlayerDisplayType(item) === kind) : items;
}
const contentId = item => String(item.id || '');
const commentCount = item => contentType(item) === 'post' ? Math.max(0, Number(pick(item, 'comment_count', 'commentCount')) || 0) : 0;
const rootId = item => pick(item, 'root_content_id', 'rootContentId');
const parentId = item => pick(item, 'parent_content_id', 'parentContentId');
const accountId = item => pick(item, 'account_id', 'accountId') || pick(item.account, 'id');
const authorName = item => pick(item, 'author_name', 'authorName', 'author') || '未知';
const authorPlatformId = item => pick(item, 'platform_author_id', 'platformAuthorId') || '-';
const publishedAt = item => window.formatBeijingTime?.(pick(item, 'published_at', 'publishedAt')) || '-';
const isDeleted = item => Boolean(pick(item, 'is_deleted', 'isDeleted'));
const isOverseas = item => pick(item, 'region_code', 'regionCode') === 'overseas';
const translationOf = item => item?.translation || {
  targetLanguage: pick(item, 'translation_target_language', 'translationTargetLanguage') || 'zh-CN',
  status: pick(item, 'translation_status', 'translationStatus') || 'not_requested',
  title: pick(item, 'translated_title', 'translatedTitle'),
  body: pick(item, 'translated_body', 'translatedBody')
};
function renderTranslation(item, { compact = false } = {}) {
  if (!isOverseas(item)) return '';
  const translation = translationOf(item); const status = translation.status || 'not_requested';
  const title = String(translation.title || '').trim(); const body = String(translation.body || '').trim();
  const text = status === 'completed' && (title || body)
    ? `${title ? `<div class="translation-title">${esc(title)}</div>` : ''}${body ? `<div class="translation-text">${esc(body)}</div>` : ''}`
    : `<div class="translation-state">${['pending', 'running', 'retryable'].includes(status) ? '中文翻译生成中' : status === 'failed' ? '中文翻译生成失败' : '暂无中文翻译'}</div>`;
  return `<div class="translation-block ${compact ? 'compact' : ''} ${esc(status)}"><div class="translation-label">中文翻译</div>${text}</div>`;
}
const engagementOf = item => { const raw = pick(item, 'engagement'); if (!raw) return {}; if (typeof raw === 'object') return raw; try { return JSON.parse(raw); } catch (_) { return {}; } };
function localDateString(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function yesterdayString() { const date = new Date(Date.now() - 24 * 60 * 60 * 1000); return localDateString(date); }
function dateDaysAgo(days) { return localDateString(new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000)); }
function nextDateString(value) { const [year, month, day] = String(value).split('-').map(Number); return localDateString(new Date(Date.UTC(year, month - 1, day, 16, 0, 0))); }
function validDateValue(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function validDateRange(range) { return Boolean(range && validDateValue(range.from) && validDateValue(range.to) && range.from <= range.to); }
function readSavedPublishedRange(storage = window.localStorage) {
  try { const saved = JSON.parse(storage.getItem(CONTENT_DATE_STORAGE_KEY) || 'null'); return validDateRange(saved) ? saved : null; } catch (_) { return null; }
}
function savePublishedRange(range, storage = window.localStorage) {
  try { if (validDateRange(range)) storage.setItem(CONTENT_DATE_STORAGE_KEY, JSON.stringify(range)); else storage.removeItem(CONTENT_DATE_STORAGE_KEY); } catch (_) { /* private mode must not block filtering */ }
}
function resolvePublishedRange(params, storage = window.localStorage) {
  const exact = exactPublishedRange(params);
  if (exact) return { from: exact.uiFrom, to: exact.uiTo, exact };
  const from = params.get('publishedFrom'); const to = params.get('publishedTo');
  if ((params.has('publishedFrom') || params.has('publishedTo')) && validDateRange({ from, to })) return { from, to, exact: null };
  const saved = readSavedPublishedRange(storage);
  return saved ? { ...saved, exact: null } : { from: localDateString(new Date()), to: localDateString(new Date()), exact: null };
}
function normalizedPublishedRange() { let from = $('#publishedFromFilter').value || ''; let to = $('#publishedToFilter').value || ''; if (from && to && from > to) { [from, to] = [to, from]; $('#publishedFromFilter').value = from; $('#publishedToFilter').value = to; } return { from, to }; }
function updateDatePresetState() { const { from, to } = normalizedPublishedRange(); const today = localDateString(new Date()); const yesterday = yesterdayString(); const active = from === today && to === today ? 'today' : from === yesterday && to === yesterday ? 'yesterday' : from === dateDaysAgo(6) && to === today ? '7d' : from === dateDaysAgo(29) && to === today ? '30d' : from || to ? 'custom' : 'clear'; document.querySelectorAll('[data-date-preset]').forEach(button => button.classList.toggle('active', button.dataset.datePreset === active)); }
function exactPublishedRange(params) {
  const from = params.get('publishedFrom'); const to = params.get('publishedTo');
  if (!from?.includes('T') || !to?.includes('T') || !Number.isFinite(Date.parse(from)) || Date.parse(to) <= Date.parse(from)) return null;
  return { from, to, uiFrom: localDateString(new Date(from)), uiTo: localDateString(new Date(Date.parse(to) - 1)) };
}
function applyPublishedRange(query) {
  const { from, to } = normalizedPublishedRange(); const exact = state.exactRange;
  if (exact && exact.uiFrom === from && exact.uiTo === to) { query.set('publishedFrom', exact.from); query.set('publishedTo', exact.to); }
  else { state.exactRange = null; if (from) query.set('publishedFrom', `${from}T00:00:00+08:00`); else query.delete('publishedFrom'); if (to) query.set('publishedTo', `${nextDateString(to)}T00:00:00+08:00`); else query.delete('publishedTo'); }
  updateDatePresetState();
}
async function api(path, options = {}) {
  return state.scope && window.PublicOpinionScope.withScope ? window.PublicOpinionScope.withScope(path, options, rawApi) : rawApi(path, options);
}
async function rawApi(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  let body = {};
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    const error = new Error('舆情服务返回了无法解析的响应');
    error.code = 'INVALID_RESPONSE';
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(body.error?.message || body.message || `请求失败 (${response.status})`);
    error.code = body.error?.code || body.code;
    error.status = response.status;
    throw error;
  }
  return body.data ?? body;
}
function renderSkeleton() {
  $('#tableContent').innerHTML = `<table class="table"><thead><tr><th>内容</th><th>类型</th><th>来源 / 账号</th><th>情感</th><th>分析状态 / 等级</th><th>风险等级</th><th>评论数</th><th>发布时间</th><th>操作</th></tr></thead><tbody>${Array.from({ length: 5 }).map(() => '<tr><td><div class="skeleton" style="width:240px"></div><div class="skeleton" style="width:180px"></div></td><td><div class="skeleton" style="width:45px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:45px"></div></td><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:55px"></div></td></tr>').join('')}</tbody></table>`;
}
function scopePath(item) {
  const selected = state.scope?.selected?.() || {};
  const regionCode = pick(item, 'region_code', 'regionCode');
  const region = pick(item, 'region_name', 'regionName') || (regionCode === 'domestic' ? '境内' : regionCode === 'overseas' ? '境外' : regionCode) || selected.regionLabel;
  return [region, pick(item, 'community_name', 'communityName') || selected.communityLabel].filter(value => value && !String(value).startsWith('全部')).join(' / ') || '-';
}
function emptyMessage() { return '暂无匹配内容'; }
const riskModeParams = mode => ({ riskMode: mode, severity: RiskModes.severityForRiskMode(mode) });
const modeConfig = { post: { label: '帖子内容', params: { contentType: 'post' } }, comment: { label: '评论内容', params: { contentType: 'comment' } }, negative: { label: '负面待处理', params: riskModeParams('negative') }, attention: { label: '关注级', params: riskModeParams('attention') } };
function updateContentMode() { document.querySelectorAll('[data-content-mode]').forEach(card => { const active = card.dataset.contentMode === state.contentMode; card.classList.toggle('active', active); card.setAttribute('aria-pressed', String(active)); }); const label = modeConfig[state.contentMode]?.label || '帖子内容'; const hint = $('#resultHint'); if (hint) hint.textContent = label; }
function applyContentMode(query) { Object.keys(modeConfig).forEach(mode => Object.keys(modeConfig[mode].params).forEach(key => query.delete(key))); const params = modeConfig[state.contentMode]?.params || modeConfig.post.params; if (params.riskMode) query.delete('sentiment'); Object.entries(params).forEach(([key, value]) => query.set(key, value)); }
function statsQuery(baseQuery, filters = {}) {
  const query = new URLSearchParams(baseQuery || new URLSearchParams());
  for (const [key, value] of Object.entries(filters)) { if (value) query.set(key, value); else query.delete(key); }
  query.delete('contentType'); query.delete('riskMode'); query.delete('severity');
  query.delete('sentiment');
  return query;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { localDateString, nextDateString, normalizedPublishedRange, applyPublishedRange, exactPublishedRange, statsQuery, hasRealTitle, bigPlayerDisplayType, typeLabel, validDateValue, validDateRange, resolvePublishedRange };
function renderTable(items) {
  const kindFiltered = isBigPlayerScope() && Boolean(selectedBigPlayerContentKind());
  if (!items.length) { $('#resultHint').textContent = kindFiltered ? '当前页 0 条（已按类型筛选）' : '共 0 条'; $('#tableContent').innerHTML = `<div class="empty">${esc(emptyMessage())}</div>`; return; }
  $('#resultHint').textContent = kindFiltered ? `当前页 ${items.length} 条（已按类型筛选）` : `共 ${Number(state.total || items.length).toLocaleString()} 条（当前页 ${items.length} 条）`;
  $('#tableContent').innerHTML = `<table class="table"><thead><tr><th>内容</th><th>帖子 ID</th><th>类型</th><th>来源 / 账号</th><th>情感</th><th>分析状态 / 等级</th><th>风险等级</th><th>评论数</th><th>发布时间</th><th>操作</th></tr></thead><tbody>${items.map(item => {
    const type = contentType(item);
    const displayType = bigPlayerDisplayType(item);
    const title = String(pick(item, 'title') ?? '').trim();
    const body = String(item.body ?? '');
    const primaryText = displayType === 'dynamic' ? (body.trim() || '(无内容)') : (title || (type === 'post' ? '(无标题)' : body || '(无内容)'));
    const secondaryText = displayType === 'dynamic' ? '' : body;
    const sentiment = item.sentiment || 'unclassified';
    const scoreValue = item.negative_score ?? item.negativeScore;
    const score = scoreValue == null ? NaN : Number(scoreValue);
    const source = sourceById(item.source_id || item.sourceId);
    const account = source?.account || source?.accounts?.find(value => String(value.id) === String(accountId(item))) || item.account || {};
    const accountName = pick(account, 'account_name', 'accountName', 'nickname', 'name');
    return `<tr><td><div class="content-title ${isDeleted(item) ? 'deleted' : ''}">${esc(primaryText)}</div>${secondaryText ? `<div class="content-body">${esc(secondaryText)}</div>` : ''}</td><td class="mono" title="${esc(item.external_id || '')}">${esc(item.external_id || '-')}</td><td><span class="type-pill">${esc(typeLabel(displayType))}</span></td><td><span class="source-pill">${esc(sourceName(item.source_id || item.sourceId || item.platform))}</span>${accountName ? `<div class="content-body">${esc(accountName)}</div>` : ''}<div class="content-body">${esc(scopePath(item))}</div></td><td class="sentiment ${esc(sentiment)}">${sentimentLabel(sentiment)}${Number.isFinite(score) ? ` · ${Math.round(score * 100)}%` : ''}</td><td><span class="analysis-status ${esc(analysisStatus(item))}">${esc(analysisStatusLabel(analysisStatus(item)))}</span><div><span class="analysis-level ${esc(analysisLevel(item) || '')}">${esc(analysisLevelLabel(analysisLevel(item)))}</span></div></td><td><span class="severity ${esc(item.severity || 'normal')}">${severityLabel(item.severity)}</span></td><td>${commentCount(item).toLocaleString()}</td><td>${esc(publishedAt(item))}</td><td><button class="row-action" data-content="${esc(contentId(item))}">查看详情</button></td></tr>`;
  }).join('')}</tbody></table>`;
  $('#tableContent').querySelectorAll('[data-content]').forEach(button => { button.onclick = () => openContent(button.dataset.content); });
}
function normalizeDetail(raw, fallback) {
  if (raw?.content) return { content: { ...fallback, ...raw.content }, comments: raw.comments || raw.children || [] };
  if (raw?.item) return { content: { ...fallback, ...raw.item }, comments: raw.comments || raw.children || [] };
  if (raw && !Array.isArray(raw)) return { content: { ...fallback, ...raw }, comments: raw.comments || raw.children || [] };
  return { content: fallback, comments: [] };
}
function flattenNodes(nodes, depth = 0, output = []) {
  (nodes || []).forEach(node => { output.push({ node, depth }); flattenNodes(node.replies || node.children || [], depth + 1, output); });
  return output;
}
function buildFlatTree(items, root) {
  const rootKey = contentId(root);
  const related = items.filter(item => String(rootId(item) || '') === rootKey || String(parentId(item) || '') === rootKey);
  const byParent = new Map();
  related.forEach(item => { const parent = String(parentId(item) || rootKey); if (!byParent.has(parent)) byParent.set(parent, []); byParent.get(parent).push(item); });
  const walk = (parent, depth, seen) => (byParent.get(String(parent)) || []).flatMap(item => { if (seen.has(contentId(item))) return []; const next = new Set(seen).add(contentId(item)); return [{ node: item, depth }, ...walk(contentId(item), depth + 1, next)]; });
  return walk(rootKey, 0, new Set());
}
function renderThread(item, depth) {
  return `<div class="thread depth-${Math.min(depth, 3)}"><div class="thread-head"><span class="thread-author">${esc(authorName(item))}</span><span>评论</span><span>${esc(publishedAt(item))}</span>${isDeleted(item) ? '<span class="severity attention">已删除 / 隐藏</span>' : ''}</div><div class="thread-body ${isDeleted(item) ? 'deleted' : ''}">${Detail.renderBodyWithImages(item.body || '(无内容)', esc)}</div>${renderTranslation(item, { compact: true })}<div class="thread-head">作者 ID：${esc(authorPlatformId(item))}</div></div>`;
}
function renderDetail(detail) {
  const item = detail.content;
  const nested = flattenNodes(detail.comments);
  const flat = nested.length ? nested : buildFlatTree(state.contents, item);
  const integrity = pick(item, 'completeness', 'integrity', 'capability') || pick(detail, 'completeness', 'integrity') || 'unknown';
  const integrityText = ({ full: '完整', authorized_scope: '授权范围', partial: '部分', unknown: '未声明' }[integrity] || integrity);
  const sourceUrl = item.source_url || item.sourceUrl || item.url;
  const status = analysisStatus(item);
  const canReanalyze = !['pending', 'running'].includes(status);
  const sentiment = ['positive', 'negative', 'neutral'].includes(item.sentiment) ? item.sentiment : 'unclassified';
  const commentsSyncStatus = pick(item, 'comments_sync_status', 'commentsSyncStatus');
  const declaredCommentCount = Number(pick(item, 'total_comment_count', 'totalCommentCount', 'comment_count', 'commentCount') || engagementOf(item).comments || engagementOf(item).comment || 0);
  const commentsEmptyText = ['pending', 'running', 'retryable'].includes(commentsSyncStatus) || declaredCommentCount > 0 ? '评论仍在同步中，请稍后刷新' : commentsSyncStatus === 'failed' ? '评论同步失败，请查看采集源进度' : commentsSyncStatus === 'unauthorized' ? '评论接口未授权' : '暂无评论';
  $('#drawerContent').innerHTML = `<h2>${esc(item.title || '(无标题)')}</h2><div class="content-body" style="max-width:none">${esc(scopePath(item))} · ${esc(sourceName(item.source_id || item.sourceId || item.platform))} · ${esc(publishedAt(item))}</div><div class="detail-block"><div class="detail-label"><span>原文内容</span><span class="integrity ${integrity === 'unknown' ? 'unknown' : ''}">${esc(integrityText)}</span></div><div class="detail-text ${isDeleted(item) ? 'deleted' : ''}">${Detail.renderBodyWithImages(item.body || '', esc)}</div>${renderTranslation(item)}</div><div class="detail-block"><div class="detail-label">来源信息</div><div class="meta-grid"><div><span>作者</span><br>${esc(authorName(item))}</div><div><span>平台作者 ID</span><br>${esc(authorPlatformId(item))}</div><div><span>内容状态</span><br>${isDeleted(item) ? '已删除 / 隐藏' : '正常'}</div><div><span>来源链接</span><br>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noreferrer">打开来源</a>` : '-'}</div></div></div><div class="detail-block"><div class="detail-label"><span>AI 分析</span><button class="btn" id="reanalyzeBtn" ${isDeleted(item) || !canReanalyze ? 'disabled' : ''}>重新分析</button></div><div class="sentiment-result"><span class="sentiment-badge ${esc(sentiment)}">${sentimentLabel(sentiment)}</span><div class="analysis-reason">${esc(analysisReasonText(item))}</div></div><div class="meta-grid"><div><span>风险等级</span><br><span class="severity ${esc(item.severity || 'normal')}">${severityLabel(item.severity)}</span></div><div><span>分析状态</span><br><span class="analysis-status ${esc(status)}">${esc(analysisStatusLabel(status))}</span></div></div></div><div class="detail-block"><div class="detail-label"><span>评论（包含评论内回复）</span><span>${flat.length} 条</span></div><div class="tree">${flat.length ? flat.map(({ node, depth }) => renderThread(node, depth)).join('') : `<div class="empty" style="padding:24px">${esc(commentsEmptyText)}</div>`}</div></div>`;
  if (bigPlayerDisplayType(item) === 'dynamic') $('#drawerContent h2').textContent = '动态';
  const button = $('#reanalyzeBtn');
  if (button && canReanalyze) button.onclick = async () => {
    button.disabled = true;
    try { const scope = state.scope?.query?.() || new URLSearchParams(); await api(`/contents/${encodeURIComponent(contentId(item))}/reanalyze?${scope}`, { method: 'POST' }); button.textContent = '已加入队列'; toast('已提交重新分析'); closeDrawer(); await load(); }
    catch (error) { button.disabled = false; button.textContent = '重新分析'; toast(`提交失败：${error.message}`); }
  };
}
async function openContent(id) {
  const fallback = state.contents.find(item => contentId(item) === String(id));
  $('#drawerContent').innerHTML = '<div class="empty">加载详情…</div>'; $('#drawerMask').classList.add('open'); updateUrl(id);
  try { const scope = state.scope?.query?.() || new URLSearchParams(); renderDetail(normalizeDetail(await api(`/contents/${encodeURIComponent(id)}?${scope}`), fallback || { id })); }
  catch (error) { if (error.name === 'AbortError') return; if (fallback) renderDetail({ content: fallback, comments: [] }); else { closeDrawer(); toast(error.status === 404 ? '舆情内容已删除或不存在' : `内容加载失败：${error.message}`); } }
}
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2400); }
function updateUrl(content = '', historyMode = 'replace') {
  const params = state.scope?.query?.() || new URLSearchParams();
  const range = normalizedPublishedRange();
  [['sentiment', '#sentimentFilter'], ['analysisStatus', '#analysisStatusFilter'], ['analysisLevel', '#analysisLevelFilter'], ['keyword', '#keywordFilter'], ['postId', '#postIdFilter']].forEach(([key, selector]) => { if ($(selector).value) params.set(key, $(selector).value); else params.delete(key); });
  const kind = selectedBigPlayerContentKind();
  if (isBigPlayerScope() && kind) params.set('bigPlayerContentKind', kind); else params.delete('bigPlayerContentKind');
  applyPublishedRange(params);
  if (!range.from && !range.to) { params.set('publishedFrom', ''); params.set('publishedTo', ''); }
  state.publishedFrom = range.from; state.publishedTo = range.to; savePublishedRange(range); updateDatePresetState();
  params.delete('contentMode'); params.delete('contentType'); params.delete('riskMode'); params.delete('sentiment'); params.delete('severity');
  Object.entries(modeConfig[state.contentMode]?.params || modeConfig.post.params).forEach(([key, value]) => params.set(key, value));
  params.set('contentMode', state.contentMode);
  if (state.page > 1) params.set('page', String(state.page)); if (state.pageSize !== 50) params.set('pageSize', String(state.pageSize)); if (content) params.set('contentId', content);
  history[historyMode === 'push' ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
}
function closeDrawer() { $('#drawerMask').classList.remove('open'); updateUrl(); }
function accountOptions() {
  const accounts = [];
}
async function loadFilters() {
  try {
    const scope = state.scope?.query?.() || new URLSearchParams(); const suffix = scope.toString() ? `?${scope}` : ''; const sources = await api(`/sources${suffix}`); state.sources = Array.isArray(sources) ? sources : sources.items || [];
  } catch (_) { /* list load still reports the service state */ }
}
async function load(resetPage = false) {
  if (resetPage) state.page = 1; const serial = ++state.requestSerial; renderSkeleton(); updateUrl();
  const lifecycle = state.scope?.beginRequest?.();
  if (lifecycle && !lifecycle.allowed) { state.contents = []; state.total = 0; $('#resultHint').textContent = '当前地区暂无可用社区'; $('#tableContent').innerHTML = '<div class="empty">当前地区暂无可用社区</div>'; $('#pageHint').textContent = '无可用社区'; return; }
  try {
    const query = state.scope?.query?.() || new URLSearchParams(); query.set('page', String(state.page)); query.set('pageSize', String(state.pageSize));
    [['sentiment', '#sentimentFilter'], ['analysisStatus', '#analysisStatusFilter'], ['analysisLevel', '#analysisLevelFilter'], ['keyword', '#keywordFilter'], ['postId', '#postIdFilter']].forEach(([key, selector]) => { if ($(selector).value) query.set(key, $(selector).value); else query.delete(key); });
    applyPublishedRange(query);
    applyContentMode(query);
    const response = await fetch(`${API}/contents?${query}`, { headers: { 'content-type': 'application/json' }, signal: lifecycle?.signal });
    let body = {};
    try {
      const text = await response.text();
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      const error = new Error('舆情服务返回了无法解析的响应');
      error.code = 'INVALID_RESPONSE';
      throw error;
    }
    if (!response.ok) throw new Error(body.error?.message || body.message || `请求失败 (${response.status})`); if (serial !== state.requestSerial || !lifecycle?.isCurrent?.()) return;
    const result = body.data ?? body; state.contents = Array.isArray(result) ? result : result.items || result.rows || []; state.total = Number(body.meta?.total ?? result.total ?? state.contents.length); renderTable(filterBigPlayerContentKinds(state.contents)); updateContentMode();
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize)); $('#pageHint').textContent = `第 ${state.page} / ${pages} 页，共 ${state.total} 条`; $('#prevPage').disabled = state.page <= 1; $('#nextPage').disabled = state.page >= pages; updateUrl();
  } catch (error) { if (error.name === 'AbortError' || serial !== state.requestSerial || !lifecycle?.isCurrent?.()) return; state.contents = []; state.total = 0; $('#resultHint').textContent = error.code === 'AI_ANALYSIS_NOT_CONFIGURED' ? 'AI 分析未配置' : '服务未连接'; $('#tableContent').innerHTML = `<div class="empty">${error.code === 'AI_ANALYSIS_NOT_CONFIGURED' ? 'AI 分析未配置，当前内容不会自动生成分析结果' : `服务不可用：${esc(error.message)}`}</div>`; $('#pageHint').textContent = '加载失败'; } finally { lifecycle?.release?.(); }
}
let progressTimer = null;
let progressSerial = 0;
function progressQuery() {
  const query = new URLSearchParams(state.scope?.query?.() || new URLSearchParams());
  [['sentiment', '#sentimentFilter'], ['analysisStatus', '#analysisStatusFilter'], ['analysisLevel', '#analysisLevelFilter'], ['keyword', '#keywordFilter'], ['postId', '#postIdFilter']].forEach(([key, selector]) => { if ($(selector).value) query.set(key, $(selector).value); else query.delete(key); });
  applyPublishedRange(query); applyContentMode(query); query.delete('platform'); query.delete('page'); query.delete('pageSize'); return query;
}
function renderAnalysisProgress(data) {
  const el = $('#analysisProgress'); if (!el) return;
  if (!data) { el.textContent = '暂无 AI 分析进度'; return; }
  const status = data.total === 0 ? '未开始' : data.pending + data.running + data.retryable ? '分析中' : data.failed ? '存在失败' : '已完成';
  el.innerHTML = `<div class="analysis-progress-head"><b>当前筛选范围 AI 分析 · ${status}</b><span>${Number(data.completionRate || 0).toFixed(1)}% · ${data.updatedAt ? esc(data.updatedAt) : '等待更新'}</span></div><div class="analysis-progress-bar"><span style="width:${Math.min(100, Number(data.completionRate || 0))}%"></span></div><div class="analysis-progress-stats"><span>完成 <b>${data.completed}/${data.total}</b></span><span>待分析 <b>${data.pending}</b></span><span>分析中 <b>${data.running}</b></span><span>待重试 <b>${data.retryable}</b></span><span>失败 <b>${data.failed}</b></span><span>有效积压 <b>${Number(data.queueDepth || 0)}</b></span><span>最老等待 <b>${Number(data.oldestWaitingSeconds || 0)} 秒</b></span><span>近 5 分钟完成 <b>${Number(data.completedLast5m || 0)}</b></span></div>${data.historicalStarvation ? '<div role="alert">历史任务等待已超过 7 天</div>' : ''}${Number(data.orphanAnalysisJobs || 0) ? `<div role="alert">孤儿任务（全局当前分析版本） <b>${Number(data.orphanAnalysisJobs)}</b> · 最早 ${esc(data.orphanOldestWaitingAt || '未知')} · 不计入有效积压</div>` : ''}`;
}
function stopProgressPolling() { if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; } }
async function pollProgress() {
  stopProgressPolling(); const serial = ++progressSerial;
  try { const response = await api(`/analysis/progress?scope=filters&${progressQuery()}`); if (serial !== progressSerial) return; renderAnalysisProgress(response); if (!response.terminal) progressTimer = setTimeout(pollProgress, 5000); }
  catch (error) { if (serial === progressSerial) { const el = $('#analysisProgress'); if (el) el.textContent = `AI 分析进度加载失败：${error.message}`; progressTimer = setTimeout(pollProgress, 5000); } }
}

function loadStats() {
  const serial = ++state.statsSerial;
  const lifecycle = state.scope?.beginRequest?.();
  if (lifecycle && !lifecycle.allowed) { ['#statPost', '#statComment', '#statNegative', '#statAttention'].forEach(selector => { const element = $(selector); if (element) element.textContent = '—'; }); return; }
  const query = statsQuery(state.scope?.query?.(), Object.fromEntries([['sentiment', '#sentimentFilter'], ['analysisStatus', '#analysisStatusFilter'], ['analysisLevel', '#analysisLevelFilter'], ['keyword', '#keywordFilter'], ['postId', '#postIdFilter']].map(([key, selector]) => [key, $(selector).value])));
  applyPublishedRange(query);
  const set = (selector, value) => { const element = $(selector); if (element) element.textContent = value == null ? '—' : Number(value).toLocaleString(); };
  ['#statPost', '#statComment', '#statNegative', '#statAttention'].forEach(selector => set(selector, null));
  fetch(`${API}/contents/stats?${query}`, { headers: { 'content-type': 'application/json' }, signal: lifecycle?.signal })
    .then(async response => {
      let body = {};
      try {
        const text = await response.text();
        body = text ? JSON.parse(text) : {};
      } catch (_) {
        const error = new Error('舆情服务返回了无法解析的响应');
        error.code = 'INVALID_RESPONSE';
        throw error;
      }
      if (!response.ok) throw new Error(body.error?.message || body.message || `请求失败 (${response.status})`);
      return body.data ?? body;
    })
    .then(stats => {
      if (serial !== state.statsSerial || !lifecycle?.isCurrent?.()) return;
      set('#statPost', stats.post); set('#statComment', stats.comment); set('#statNegative', stats.negative); set('#statAttention', stats.attention);
    })
    .catch(error => {
      if (error.name === 'AbortError' || serial !== state.statsSerial || !lifecycle?.isCurrent?.()) return;
      ['#statPost', '#statComment', '#statNegative', '#statAttention'].forEach(selector => { const element = $(selector); if (element) element.textContent = '加载失败'; });
      toast(`统计加载失败：${error.message}`);
    }).finally(() => lifecycle?.release?.());
  pollProgress();
}
function restoreUrl(params = new URLSearchParams(window.location.search)) {
  state.page = Math.max(1, Number(params.get('page') || 1)); state.pageSize = [20, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 50; $('#pageSize').value = String(state.pageSize);
  [['sentiment', '#sentimentFilter'], ['analysisStatus', '#analysisStatusFilter'], ['analysisLevel', '#analysisLevelFilter'], ['keyword', '#keywordFilter'], ['postId', '#postIdFilter']].forEach(([key, selector]) => { const value = params.get(key) || ''; const element = $(selector); element.value = (selector === '#keywordFilter' || selector === '#postIdFilter' || [...(element.options || [])].some(option => option.value === value)) ? value : ''; });
  updateBigPlayerContentKindFilter();
  const kind = params.get('bigPlayerContentKind'); const kindFilter = $('#bigPlayerContentKindFilter');
  if (isBigPlayerScope() && kind && [...(kindFilter?.options || [])].some(option => option.value === kind)) kindFilter.value = kind;
  const restoredRange = resolvePublishedRange(params); state.exactRange = restoredRange?.exact || null;
  $('#publishedFromFilter').value = restoredRange?.from || localDateString(new Date()); $('#publishedToFilter').value = restoredRange?.to || localDateString(new Date()); const range = normalizedPublishedRange(); state.publishedFrom = range.from; state.publishedTo = range.to; updateDatePresetState();
  const legacyMode = { post: 'post', comment: 'comment' }[params.get('contentType')]; const riskMode = RiskModes.normalizeRiskMode(params.get('riskMode')); state.contentMode = modeConfig[params.get('contentMode')] ? params.get('contentMode') : (riskMode || legacyMode || 'post'); updateContentMode();
  return params.get('contentId');
}
function bind() {
  ensureBigPlayerContentKindFilter();
  const query = () => { state.page = 1; normalizedPublishedRange(); updateUrl('', 'push'); load(); loadStats(); };
  const queryButton = $('#queryBtn'); if (queryButton) queryButton.onclick = query;
  document.querySelectorAll('[data-date-preset]').forEach(button => { button.onclick = () => { const today = localDateString(new Date()); const values = { today: [today, today], yesterday: [yesterdayString(), yesterdayString()], '7d': [dateDaysAgo(6), today], '30d': [dateDaysAgo(29), today], clear: ['', ''] }[button.dataset.datePreset]; if (!values) return; state.exactRange = null; $('#publishedFromFilter').value = values[0]; $('#publishedToFilter').value = values[1]; query(); }; });
  document.querySelectorAll('[data-content-mode]').forEach(card => { const activate = () => { const mode = card.dataset.contentMode; if (mode === state.contentMode) return; state.contentMode = mode; updateContentMode(); query(); }; card.onclick = activate; card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } }; });
  ['#sentimentFilter', '#analysisStatusFilter', '#analysisLevelFilter', '#bigPlayerContentKindFilter', '#publishedFromFilter', '#publishedToFilter'].forEach(selector => { $(selector).onchange = query; });
  $('#keywordFilter').onkeydown = event => { if (event.key === 'Enter') query(); }; $('#postIdFilter').onkeydown = event => { if (event.key === 'Enter') query(); };
  const paginate = delta => { state.page += delta; updateUrl('', 'push'); load(); };
  $('#prevPage').onclick = () => { if (state.page > 1) paginate(-1); }; $('#nextPage').onclick = () => paginate(1);
  $('#pageSize').onchange = () => { state.pageSize = Number($('#pageSize').value); query(); };
  $('#drawerClose').onclick = closeDrawer; $('#drawerMask').onclick = event => { if (event.target === $('#drawerMask')) closeDrawer(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  window.addEventListener('popstate', () => { state.restoringHistory = true; stopProgressPolling(); });
  window.addEventListener('pagehide', () => { state.requestSerial += 1; stopProgressPolling(); });
}
async function scopeChanged() { const params = new URLSearchParams(location.search); $('#drawerMask').classList.remove('open'); state.deepLinkOpened = ''; state.sources = []; const restoring = Boolean(state.restoringHistory); state.restoringHistory = false; if (restoring) restoreUrl(params); updateBigPlayerContentKindFilter(); const epoch = state.scope.epoch(); await loadFilters(); if (epoch !== state.scope.epoch()) return; loadStats(); await load(!restoring); if (restoring && params.get('contentId')) openContent(params.get('contentId')); }
if (typeof module === 'undefined' || !module.exports) { bind(); (async () => { state.scope = await PublicOpinionScope.init({ host: '[data-po-scope]', onChange: scopeChanged }); updateBigPlayerContentKindFilter(); await loadFilters(); const deepLink = restoreUrl(); loadStats(); await load(); if (deepLink) openContent(deepLink); })(); }
