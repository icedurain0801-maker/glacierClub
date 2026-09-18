(function () {
  const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
  const DEFAULT_REGION = 'domestic'; const DEFAULT_PLATFORM = 'bigplayer_h5'; const DEFAULT_DOMESTIC_EXTERNAL_ID = '2'; const STORAGE_KEY = 'publicOpinionScope';
  const PLATFORM_GROUPS = {
    domestic: [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }, { value: 'taptap', label: 'TapTap' }, { value: 'bilibili', label: '哔哩哔哩' }, { value: 'weibo', label: '微博' }, { value: 'xiaohongshu', label: '小红书' }],
    overseas: [{ value: 'bigplayer_h5', label: 'BigPlayer社区' }, { value: 'discord', label: 'Discord' }, { value: 'facebook', label: 'Facebook' }, { value: 'x', label: 'X' }, { value: 'lounge', label: 'Lounge' }]
  };
  const ALL_PLATFORMS = [...new Map(Object.values(PLATFORM_GROUPS).flat().map(item => [item.value, item])).values()];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalizePlatform = value => String(value || '').trim().toLowerCase() === 'xhs' ? 'xiaohongshu' : String(value || '').trim().toLowerCase();
  const state = { regionCode: DEFAULT_REGION, communityId: '', platform: DEFAULT_PLATFORM, communities: [], controls: null, platformControl: null, epoch: 0, controller: null, activeRequests: new Set(), loadError: '', onChange: null, initialized: false };

  window.formatBeijingTime = function formatBeijingTime(value) {
    if (!value) return '-';
    const input = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(value.trim()) ? `${value.trim().replace(' ', 'T')}Z` : value;
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date).replace(/\//g, '-');
  };
  function platformsForRegion(regionCode) { return PLATFORM_GROUPS[regionCode] || PLATFORM_GROUPS[DEFAULT_REGION]; }
  function platformLabel(value) { return ALL_PLATFORMS.find(item => item.value === normalizePlatform(value))?.label || value || '-'; }
  function validRegion(value) { return PLATFORM_GROUPS[value] ? value : DEFAULT_REGION; }
  function validPlatform(regionCode, value) { const normalized = normalizePlatform(value); return platformsForRegion(regionCode).some(item => item.value === normalized) ? normalized : DEFAULT_PLATFORM; }
  function isEnabled(item) { return String(item?.status || 'enabled').toLowerCase() !== 'disabled'; }
  function communityMatches(item, preferred) { if (preferred == null || String(preferred).trim() === '') return false; return [item?.id, item?.externalId, item?.external_id, item?.name].some(value => String(value ?? '') === String(preferred)); }
  function defaultCommunity(regionCode, preferred) {
    const enabled = state.communities.filter(isEnabled); const preferences = Array.isArray(preferred) ? preferred : [preferred]; const matched = preferences.map(value => enabled.find(item => communityMatches(item, value))).find(Boolean);
    if (matched) return matched;
    if (regionCode === DEFAULT_REGION) return enabled.find(item => String(item.externalId ?? item.external_id ?? '') === DEFAULT_DOMESTIC_EXTERNAL_ID) || enabled.find(item => item.name === '超能世界') || enabled[0];
    return enabled[0];
  }
  function readSession() { try { const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); return { regionCode: validRegion(value.regionCode), communityId: value.communityId || '' }; } catch (_) { return {}; } }
  function persistShared() { if (state.loadError) return; try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ regionCode: state.regionCode, communityId: state.communityId })); } catch (_) {} }
  function selected() {
    const community = state.communities.find(item => String(item.id) === String(state.communityId)) || null; const available = Boolean(community && isEnabled(community));
    return Object.freeze({ regionCode: state.regionCode, regionLabel: state.regionCode === 'overseas' ? '境外' : '境内', communityId: state.communityId, communityLabel: community?.name || '暂无可用社区', communityStatus: community?.status || '', platform: state.platform, platformLabel: platformLabel(state.platform), community, hasCommunities: state.communities.some(isEnabled), available, epoch: state.epoch, canManage: community?.canManage ?? community?.permissions?.canManage, canEdit: community?.canEdit ?? community?.permissions?.canEdit, canWrite: community?.canWrite ?? community?.permissions?.canWrite });
  }
  function query() { const current = selected(); const params = new URLSearchParams(); if (current.regionCode) params.set('regionCode', current.regionCode); if (current.communityId) params.set('communityId', current.communityId); params.set('platform', current.platform); return params; }
  function label() { const current = selected(); return [current.platformLabel, current.regionLabel, current.communityLabel].filter(Boolean).join(' / '); }
  async function request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase(); const headers = { ...(options.headers || {}) };
    if (method !== 'GET' && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(`${API}${path}`, { ...options, headers }); const text = await response.text(); let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { const error = new Error('舆情服务返回了无法解析的响应'); error.code = 'INVALID_RESPONSE'; error.status = response.status; throw error; }
    if (!response.ok) { const error = new Error(body.error?.message || body.message || `请求失败 (${response.status})`); error.code = body.error?.code || body.code; error.status = response.status; throw error; }
    return body.data ?? body;
  }
  function advanceEpoch(clearCommunity) {
    state.epoch += 1; state.controller?.abort(); state.controller = null;
    state.activeRequests.forEach(controller => controller.abort()); state.activeRequests.clear();
    if (clearCommunity) { state.communities = []; state.communityId = ''; state.loadError = ''; }
    return state.epoch;
  }
  function beginRequest() {
    const epoch = state.epoch; const controller = new AbortController(); const allowed = selected().available;
    if (allowed) state.activeRequests.add(controller); else controller.abort();
    const release = () => state.activeRequests.delete(controller);
    return Object.freeze({ epoch, allowed, signal: controller.signal, abort: () => { controller.abort(); release(); }, release, isCurrent: () => allowed && state.epoch === epoch && !controller.signal.aborted });
  }
  async function withScope(path, options = {}, transport) {
    const snapshot = selected();
    const url = new URL(path, 'http://scope.local');
    ['regionCode', 'communityId'].forEach(key => { if (snapshot[key]) url.searchParams.set(key, snapshot[key]); else url.searchParams.delete(key); });
    const work = beginRequest();
    const aborted = () => { const error = new Error('Scope request superseded'); error.name = 'AbortError'; return error; };
    const cancel = () => work.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      if (!work.allowed || work.signal.aborted) throw aborted();
      // Mutations keep their original scope and are not cancelled after submission.
      const read = String(options.method || 'GET').toUpperCase() === 'GET';
      const result = await transport(`${url.pathname}${url.search}`, { ...options, signal: read ? work.signal : options.signal });
      if (!work.isCurrent()) throw aborted();
      return result;
    } catch (error) { if (!work.isCurrent()) throw aborted(); throw error; }
    finally { options.signal?.removeEventListener('abort', cancel); work.release(); }
  }
  function controls() { return { region: state.controls?.querySelector('[data-po-region]'), community: state.controls?.querySelector('[data-po-community]'), platform: state.platformControl }; }
  function renderControls() {
    const { region, community, platform } = controls();
    if (region) region.value = state.regionCode;
    if (community) { community.innerHTML = state.communities.length ? state.communities.map(item => `<option value="${esc(item.id)}" ${isEnabled(item) ? '' : 'disabled'}>${esc(item.name)}${isEnabled(item) ? '' : '（已停用，不可选）'}</option>`).join('') : `<option value="">${state.loadError ? '社区加载失败，请重试' : '暂无可用社区'}</option>`; community.value = state.communityId; community.disabled = !selected().hasCommunities; }
    if (platform) { platform.innerHTML = platformsForRegion(state.regionCode).map(item => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join(''); platform.value = state.platform; platform.disabled = !selected().available; }
  }
  function syncUrl(mode) {
    const params = new URLSearchParams(location.search); ['regionCode', 'gameId', 'communityId', 'platform'].forEach(key => params.delete(key)); query().forEach((value, key) => params.set(key, value));
    const next = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
    if (mode === 'push') history.pushState(null, '', next); else history.replaceState(null, '', next);
  }
  function notify(reason) {
    const snapshot = selected(); const snapshotQuery = query(); persistShared();
    window.dispatchEvent(new CustomEvent('public-opinion-scope-change', { detail: Object.freeze({ reason, epoch: state.epoch, selected: snapshot, query: new URLSearchParams(snapshotQuery) }) }));
    state.onChange?.(new URLSearchParams(snapshotQuery), snapshot);
  }
  async function loadCommunities(preferred, expectedEpoch = null) {
    const epoch = expectedEpoch ?? advanceEpoch(true); state.controller?.abort(); state.controller = new AbortController();
    const result = await request(`/communities?regionCode=${encodeURIComponent(state.regionCode)}`, { signal: state.controller.signal });
    if (epoch !== state.epoch || state.controller.signal.aborted) return [];
    state.communities = Array.isArray(result) ? result : result.items || []; state.communityId = String(defaultCommunity(state.regionCode, preferred)?.id || '');
    return state.communities;
  }
  async function normalize({ preferredRegion, preferredCommunity, preferredPlatform, reason, urlMode, notifyChange }) {
    const epoch = advanceEpoch(true); state.regionCode = validRegion(preferredRegion || readSession().regionCode || DEFAULT_REGION); state.platform = validPlatform(state.regionCode, preferredPlatform || DEFAULT_PLATFORM); renderControls();
    try { await loadCommunities(preferredCommunity, epoch); } catch (error) {
      if (error.name === 'AbortError' || epoch !== state.epoch) return null;
      state.loadError = error.message; renderControls(); if (notifyChange) notify('unavailable'); return selected();
    }
    if (epoch !== state.epoch || state.controller?.signal.aborted) return null;
    renderControls(); if (urlMode !== 'preserve') syncUrl(urlMode); if (notifyChange) notify(reason); return selected();
  }
  async function init(options = {}) {
    const host = document.querySelector(options.host || '[data-po-scope]'); if (!host) return null;
    state.controls = host; state.onChange = options.onChange || null; host.querySelector('[data-po-game]')?.remove();
    if (!host.querySelector('[data-po-region]')) host.insertAdjacentHTML('afterbegin', '<span data-po-scope-selectors style="display:contents"><select class="select" data-po-region aria-label="区域"><option value="domestic">境内</option><option value="overseas">境外</option></select><select class="select" data-po-community aria-label="社区" disabled></select></span>');
    const platformHost = document.querySelector('[data-po-platform-scope]') || host;
    if (!platformHost.querySelector('[data-po-platform-select]')) platformHost.insertAdjacentHTML('afterbegin', '<select class="select" data-po-platform-select aria-label="数据平台"></select>');
    state.platformControl = platformHost.querySelector('[data-po-platform-select]');
    const url = new URLSearchParams(location.search); const saved = readSession(); const urlRegion = url.get('regionCode');
    const initial = await normalize({ preferredRegion: PLATFORM_GROUPS[urlRegion] ? urlRegion : saved.regionCode, preferredCommunity: [url.get('communityId'), saved.communityId, DEFAULT_DOMESTIC_EXTERNAL_ID], preferredPlatform: url.get('platform') || DEFAULT_PLATFORM, reason: 'init', urlMode: 'replace', notifyChange: false });
    if (!initial) return null;
    const { region, community, platform } = controls();
    region.onchange = async () => { await normalize({ preferredRegion: region.value, preferredCommunity: region.value === DEFAULT_REGION ? DEFAULT_DOMESTIC_EXTERNAL_ID : '', preferredPlatform: state.platform, reason: 'region', urlMode: 'push', notifyChange: true }); };
    community.onchange = () => { advanceEpoch(false); state.communityId = community.value; syncUrl('push'); notify('community'); };
    platform.onchange = () => { if (!selected().available) { renderControls(); return; } advanceEpoch(false); state.platform = validPlatform(state.regionCode, platform.value); syncUrl('push'); notify('platform'); };
    if (!state.initialized) { window.addEventListener('popstate', async () => { const currentUrl = new URLSearchParams(location.search); const currentSession = readSession(); const requestedRegion = currentUrl.get('regionCode'); await normalize({ preferredRegion: PLATFORM_GROUPS[requestedRegion] ? requestedRegion : currentSession.regionCode, preferredCommunity: [currentUrl.get('communityId'), currentSession.communityId], preferredPlatform: currentUrl.get('platform') || DEFAULT_PLATFORM, reason: 'popstate', urlMode: 'preserve', notifyChange: true }); }); state.initialized = true; }
    options.onReady?.(query(), initial);
    persistShared(); window.dispatchEvent(new CustomEvent('public-opinion-scope-change', { detail: Object.freeze({ reason: 'init', epoch: state.epoch, selected: initial, query: new URLSearchParams(query()) }) }));
    return { query, selected, label, reload: async () => { await normalize({ preferredRegion: state.regionCode, preferredCommunity: state.communityId, preferredPlatform: state.platform, reason: 'reload', urlMode: 'replace', notifyChange: false }); return selected(); }, available: () => selected().available, epoch: () => state.epoch, beginRequest };
  }
  const style = document.createElement('style');
  style.textContent = '.content-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;background:#fff;border:1px solid #e4e7ec;border-radius:6px}.content-controls [data-po-scope]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.content-controls .select{min-width:120px}.period-control{display:flex;align-items:center;gap:8px;color:#667085;font-size:12px;white-space:nowrap}.period-control .select{min-width:104px}.top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.top-actions [data-po-scope]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.top-actions .select{min-width:120px}.po-platform-tabs,.po-platform-tab{display:none!important}@media(max-width:1200px){.command-bar .top-actions{max-width:60%}}@media(max-width:720px){.command-bar .top-actions{width:100%;max-width:none;justify-content:flex-start}.top-actions [data-po-scope],.period-control{width:100%}.top-actions [data-po-scope] .select,.period-control .select{flex:1;min-width:0}}';
  document.head.appendChild(style);
  const mobileStyle = document.createElement('style');
  mobileStyle.textContent = '@media(max-width:560px){body{display:block!important}.admin-main{margin-left:0!important;min-width:0;width:100%;box-sizing:border-box}.command-bar{min-width:0;flex-wrap:wrap}.filterbar,.top-actions{min-width:0;max-width:100%}}';
  document.head.appendChild(mobileStyle);
  window.PublicOpinionScope = { init, query, selected, request, loadCommunities, beginRequest, withScope, platforms: ALL_PLATFORMS, platformsForRegion, platformLabel, available: () => selected().available, epoch: () => state.epoch };
})();
