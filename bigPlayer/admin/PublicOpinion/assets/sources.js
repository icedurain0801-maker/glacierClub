const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const OVERSEAS_LAST_NIGHT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000102';
const OVERSEAS_LAST_NIGHT_BASE_URL = 'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2';
const FACEBOOK_DEFAULT_URL = 'https://www.facebook.com/LastLightSurvival';
const FACEBOOK_ALL_HISTORY_START = '1970-01-01T00:00:00.000Z';
const FACEBOOK_CAPABILITIES = [['page', '主页身份'], ['pageManagement', 'Page 管理授权'], ['moderate', 'MODERATE 能力'], ['posts', '帖子列表与分页'], ['comments', '评论列表与分页'], ['replies', '回复列表与分页']];
const FACEBOOK_FREQUENCIES = [[900, '15 分钟'], [1800, '30 分钟'], [3600, '60 分钟'], [7200, '2 小时'], [86400, '每天 1 次']];
const isOverseasLastNight = source => String(source?.community_id || source?.communityId) === OVERSEAS_LAST_NIGHT_COMMUNITY_ID;
const Status = window.SourceStatus;
const SyncProgress = window.SourceSyncProgress;
const state = { sources: [], scope: null, sourcesLoading: true, sourcesError: '', creating: false, syncingSourceId: '', activeSourceId: '', loginStatus: null, challenge: null, timer: null, poller: null, toastTimer: null, requestSerial: 0, sourcesRequestSerial: 0, syncRecoverySerial: 0, authSerial: 0, syncSerial: 0, h5AuthMode: 'token' };
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const pick = (object, ...keys) => keys.map(key => object?.[key]).find(value => value !== undefined && value !== null);
const PLATFORMS = Object.fromEntries(PublicOpinionScope.platforms.map(item => [item.value, item.label]));
const ACTIONABLE = new Set(['bigplayer_h5', 'taptap', 'douyin', 'xiaohongshu', 'discord', 'facebook']);
const STAGES = [['posts', '帖子'], ['comments', '评论（含评论内回复）']];
const normalizedPlatform = source => Status.normalizePlatform(source?.platform);
const platformLabel = platform => PLATFORMS[Status.normalizePlatform(platform)] || platform || '-';
const sourceTypeLabel = source => { const platform = normalizedPlatform(source); if (platform === 'taptap') return '关键词 + 账号'; if (platform === 'bigplayer_h5') return '社区动态'; if (Status.isSocialLoginPlatform(platform)) return '账号内容'; return '平台内容'; };
function defaultSourceName(platform, communityId) { const label = platformLabel(platform); const prefix = String(label || platform || '采集源').replace(/\s+/g, ''); const used = new Set(state.sources.filter(source => String(pick(source, 'community_id', 'communityId')) === String(communityId) && normalizedPlatform(source) === platform).map(source => String(pick(source, 'display_name', 'displayName') || '')).filter(Boolean)); for (let index = 1; index <= 999; index += 1) { const candidate = `${prefix}${String(index).padStart(3, '0')}`; if (!used.has(candidate)) return candidate; } return `${prefix}${Date.now()}`; }
const authLabel = status => Status.authLabel(status);
const stageLabel = status => ({ idle: '待同步', running: '同步中', paused: '已暂停', completed: '已完成', completed_full: '完整完成', completed_authorized_scope: '授权范围完成', partial: '部分完成', unsupported: '不支持', failed: '失败', unconfigured: '未检测', manual_verification: '待人工验证' }[status] || status || '待同步');

async function api(path, options = {}) {
  let response;
  try { response = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json' }, ...options }); }
  catch (_) { throw new Error(`无法连接舆情服务 ${API}，请检查后端服务和跨域配置`); }
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
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }
  return body.data ?? body;
}
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => element.classList.remove('show'), 2600); }
function clearToast() { const element = $('#toast'); clearTimeout(state.toastTimer); state.toastTimer = null; element.textContent = ''; element.classList.remove('show'); }
function parseObject(raw) { if (!raw) return {}; if (typeof raw === 'object') return raw; try { return JSON.parse(raw); } catch (_) { return {}; } }
function accountOf(source) { return source.account || source.platform_account || source.platformAccount || source.accounts?.[0] || {}; }
function configOf(source) { return parseObject(source.config); }
// Facebook 只接收 Page 地址与采集策略；官方凭据仅由服务端部署级安全配置提供。
function facebookCanManage(source = {}) {
  const permission = source.permissions || source.permission || {};
  return !['canManage', 'canEdit', 'canWrite'].some(key => source[key] === false || permission[key] === false);
}
function facebookScopeAllowed(source = {}) {
  const selected = state.scope?.selected?.() || {};
  return isOverseasLastNight(source) && (pick(source, 'region_code', 'regionCode') || selected.regionCode) === 'overseas';
}
function parseFacebookPageUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch (_) { return { error: '请输入有效的 Facebook 主页 HTTPS 地址' }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return { error: '采集地址须使用 HTTPS，且不能含账号、密码、fragment 或非标准端口' };
  if (!['facebook.com', 'www.facebook.com'].includes(url.hostname.toLowerCase())) return { error: '仅支持 facebook.com 或 www.facebook.com 官方主页地址' };
  const tracking = new Set(['fbclid', 'ref', 'refsrc', 'mibextid']);
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_') || tracking.has(key.toLowerCase())) url.searchParams.delete(key);
  if ([...url.searchParams.keys()].length) return { error: 'Facebook 主页地址不能包含非跟踪查询参数' };
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part)); } catch (_) { return { error: '请输入有效的 Facebook 主页地址' }; }
  const reserved = new Set(['business', 'events', 'gaming', 'groups', 'help', 'login', 'marketplace', 'pages', 'people', 'photo', 'profile.php', 'reel', 'settings', 'share', 'watch']);
  if (parts.length !== 1 || reserved.has(parts[0].toLowerCase()) || !/^[A-Za-z0-9._-]{2,100}$/.test(parts[0])) return { error: '请输入单个 Facebook 主页首页地址，不支持帖子、群组或个人资料地址' };
  return { url: `https://www.facebook.com/${encodeURIComponent(parts[0])}` };
}
function facebookUrlOf(source) { return parseFacebookPageUrl(configValue(source, 'baseUrl', 'base_url')).url || ''; }
function facebookPageId(source) { const id = pick(accountOf(source), 'platform_account_id', 'platformAccountId') || ''; return /^\d+$/.test(String(id)) ? String(id) : ''; }
function facebookSystemCredentialStatus(source) { return pick(source?._facebookCheck, 'systemCredentialStatus', 'system_credential_status') || pick(source, 'systemCredentialStatus', 'system_credential_status') || pick(accountOf(source), 'systemCredentialStatus', 'system_credential_status') || 'not_configured'; }
function facebookSystemCredentialReady(source) { return ['configured', 'valid', 'available', 'authorized'].includes(facebookSystemCredentialStatus(source)); }
function facebookReady(source) { return !source._facebookCheck?.error && facebookSystemCredentialReady(source) && sourceAuth(source) === 'authorized' && FACEBOOK_CAPABILITIES.every(([key]) => capabilityState(source, key) === 'authorized_scope'); }
function facebookSystemCredentialLabel(source) {
  return { configured: '可用', valid: '可用', available: '可用', authorized: '可用', invalid: '无效', expired: '已过期', not_configured: '未配置', unconfigured: '未配置' }[facebookSystemCredentialStatus(source)] || '待检测';
}
function facebookAuthLabel(source) {
  return { authorized: '已授权', unauthorized: '权限不足', expired: '已过期', failed: '检测失败', error: '检测失败', configured_unverified: '待检测', configured_pending_verification: '待检测', unconfigured: '待检测' }[sourceAuth(source)] || '待检测';
}
function facebookMissingCapabilities(source) { return FACEBOOK_CAPABILITIES.filter(([key]) => capabilityState(source, key) !== 'authorized_scope').map(([, label]) => label); }
function facebookUnavailableReason(source) {
  if (!facebookCanManage(source)) return '当前账号仅有查看权限';
  if (!facebookScopeAllowed(source)) return 'Facebook 采集源仅支持境外 Last Night 社区';
  if (source._facebookCheck?.error) return source._facebookCheck.error;
  if (!facebookSystemCredentialReady(source)) return '系统 Facebook 官方采集凭据尚未通过检测';
  if (sourceAuth(source) !== 'authorized') return '请先完成 Facebook 官方能力检测';
  const missing = facebookMissingCapabilities(source);
  if (missing.length) return `尚未通过：${missing.join('、')}`;
  return '';
}
function facebookInitialSync(source) {
  if (sourceMode(source) !== 'backfill') return 'incremental';
  const start = historyStartOf(source);
  return !start || new Date(start).getTime() === 0 ? 'all' : 'since';
}
function facebookInitialSyncLabel(source) { return { all: '回溯授权范围内全部历史', since: '从指定日期开始', incremental: '仅从现在开始增量' }[facebookInitialSync(source)]; }
function facebookToday() { return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function facebookDateOf(value) { const time = new Date(value).getTime(); return Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : ''; }
function facebookErrorMessage(error) {
  const code = typeof error === 'string' ? error : error?.code;
  return {
    FACEBOOK_URL_INVALID: '请输入有效的 Facebook 主页 HTTPS 地址',
    FACEBOOK_SCOPE_MISMATCH: 'Facebook 采集源仅支持境外 Last Night 社区',
    FACEBOOK_PAGE_NOT_FOUND: '未识别到可访问的 Facebook 主页',
    FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED: '系统尚未配置 Facebook 官方采集凭据',
    FACEBOOK_SYSTEM_CREDENTIAL_INVALID: '系统 Facebook 官方采集凭据无效',
    FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED: '系统 Facebook 官方采集凭据已过期',
    FACEBOOK_PAGE_MANAGEMENT_REQUIRED: '目标主页尚未完成管理授权',
    FACEBOOK_MODERATE_CAPABILITY_REQUIRED: '目标主页缺少 MODERATE 能力，无法保证完整评论和回复',
    FACEBOOK_CAPABILITY_MISSING: '无法完整读取主页、帖子、评论或回复',
    FACEBOOK_CAPABILITY_UNVERIFIED: '采集能力尚未验证，请完成六项能力检测',
    FACEBOOK_RATE_LIMITED: 'Facebook 接口限流，请稍后重试',
    FACEBOOK_API_UNAVAILABLE: 'Facebook 接口暂时不可用，请稍后重试',
    FACEBOOK_PAGING_INCOMPLETE: '本次采集未完成，已保存进度并等待续跑',
    SOURCE_AUTH_UNCONFIGURED: '系统 Facebook 官方采集凭据尚未通过检测',
    SOURCE_ALREADY_EXISTS: '同名采集源已存在，请在列表中点击“管理”',
    SOURCE_DISABLED: '请先启用并保存采集源',
    FORBIDDEN: '当前账号没有采集源管理权限',
    UNAUTHORIZED: '授权无效或已失效，请重新检测授权',
    SYNC_ALREADY_RUNNING: '该采集源已有同步任务，请等待当前任务完成'
  }[code] || '操作未完成，请检查服务状态后重试；采集源保持停用时不会进入调度';
}
function facebookCapabilityDetail(source, key) {
  const checked = source?._facebookCheck?.capabilities?.[key];
  const persisted = (source?.capabilities || accountOf(source).capabilities || {})[key];
  const raw = checked ?? persisted;
  const detail = raw && typeof raw === 'object' ? { ...raw } : { status: raw };
  const credentialStatus = facebookSystemCredentialStatus(source);
  if (!detail.status && !facebookSystemCredentialReady(source)) detail.status = 'unavailable';
  if (!detail.errorCode) {
    detail.errorCode = {
      not_configured: 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
      unconfigured: 'FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED',
      invalid: 'FACEBOOK_SYSTEM_CREDENTIAL_INVALID',
      expired: 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED'
    }[credentialStatus] || '';
  }
  return detail;
}
function facebookCapabilityAdvice(key, detail) {
  const code = detail?.errorCode || '';
  const byCode = {
    FACEBOOK_SYSTEM_CREDENTIAL_NOT_CONFIGURED: '请联系运维在服务端配置 Facebook 官方采集凭据后重新检测。',
    FACEBOOK_SYSTEM_CREDENTIAL_INVALID: '请联系运维更新服务端 Facebook 官方采集凭据后重新检测。',
    FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED: '请联系运维续期服务端 Facebook 官方采集凭据后重新检测。',
    FACEBOOK_PAGE_MANAGEMENT_REQUIRED: '请由主页管理员为系统应用授予 Page 管理权限后重新检测。',
    FACEBOOK_MODERATE_CAPABILITY_REQUIRED: '请由主页管理员补充 MODERATE 权限后重新检测。',
    FACEBOOK_CAPABILITY_MISSING: '请确认主页授权范围包含该能力后重新检测。',
    FACEBOOK_RATE_LIMITED: '请稍后重新检测，来源保持停用且不会进入调度。',
    FACEBOOK_API_UNAVAILABLE: '请检查 Facebook 服务状态后重新检测。'
  };
  if (byCode[code]) return byCode[code];
  if (detail?.status === 'authorized_scope' || detail?.status === 'available') return '检测通过。';
  return key === 'pageManagement'
    ? '请完成 Page 管理授权后重新检测。'
    : key === 'moderate'
      ? '请完成 MODERATE 授权后重新检测。'
      : '请重新检测该项能力；未通过前来源保持停用。';
}
function facebookStatusFields(source, creating) {
  const meta = source._facebookCheck || {};
  const checkedAt = meta.checkedAt ? formatTime(meta.checkedAt) : creating ? '未检测' : '平台未返回';
  const systemReady = facebookSystemCredentialReady(source);
  return `<div class="field"><label>部署级官方凭据</label><div><span class="pill ${systemReady ? 'authorized' : 'unavailable'}" id="facebookSystemCredentialStatus">${esc(facebookSystemCredentialLabel(source))}</span><div class="subline">由服务端安全配置，管理员无需填写。</div></div></div><div class="field"><label>采集准入</label><div><span class="pill ${sourceAuth(source) === 'authorized' ? 'authorized' : 'unavailable'}" id="facebookAuthStatus">${esc(facebookAuthLabel(source))}</span><div class="subline">最近检测：${esc(checkedAt)}</div></div></div><div class="facebook-capabilities" aria-label="Facebook 能力检测">${FACEBOOK_CAPABILITIES.map(([key, label]) => { const detail = facebookCapabilityDetail(source, key); const status = detail.status === 'available' ? 'authorized_scope' : detail.status; const safeStatus = Object.hasOwn(CAPABILITY_LABELS, status) ? status : 'untested'; const code = detail.errorCode || ''; return `<div class="facebook-capability"><span>${label}</span><span class="pill ${safeStatus}" data-facebook-capability="${key}">${esc(capabilityLabel(safeStatus))}</span><div class="subline" data-facebook-capability-detail="${key}">${code ? `<code>${esc(code)}</code> · ` : ''}${esc(facebookCapabilityAdvice(key, { ...detail, status: safeStatus }))}</div></div>`; }).join('')}</div>${meta.error ? `<div class="facebook-error" role="status">${esc(meta.error)}</div>` : ''}`;
}
function facebookForm(source, creating) {
  const writable = facebookCanManage(source); const ready = facebookReady(source); const selected = state.scope?.selected?.() || {};
  const scopeLabel = [pick(source, 'region_name', 'regionName') || selected.regionLabel || '境外', pick(source, 'community_name', 'communityName') || selected.communityLabel || 'Last Night'].join(' / ');
  const initial = facebookInitialSync(source); const frequency = Number(pick(source, 'frequency_seconds', 'frequencySeconds') || 3600);
  const nextRun = pick(source, 'next_scheduled_at', 'nextScheduledAt');
  return `<form id="facebookSourceForm" class="facebook-source-form" novalidate><div class="drawer-body">
    ${!writable ? '<div class="notice">当前账号仅有查看权限，可查看脱敏配置和检测结果。</div>' : ''}
    <section class="detail-block"><h3 class="detail-label">基础信息</h3>
      <div class="field"><label>归属范围</label><input class="input" value="${esc(scopeLabel)}" readonly></div>
      <div class="field"><label>平台</label><input class="input" value="Facebook" readonly></div>
      <div class="field"><label for="cfgName">采集源名称<span class="required">*</span></label><input class="input" id="cfgName" maxlength="100" value="${esc(pick(source, 'display_name', 'displayName') || 'Last Night Facebook')}" ${writable ? '' : 'disabled'}></div>
      <div class="field"><label for="cfgBaseUrl">采集地址<span class="required">*</span></label><input class="input" id="cfgBaseUrl" type="url" value="${esc(facebookUrlOf(source) || (creating ? FACEBOOK_DEFAULT_URL : ''))}" ${writable ? '' : 'disabled'}><div class="subline">仅支持 Facebook 官方主页 HTTPS 地址，保存时移除跟踪参数。</div></div>
      <div class="field"><label for="facebookPageId">Facebook Page ID</label><input class="input" id="facebookPageId" value="${esc(facebookPageId(source) || '授权检测后自动识别')}" readonly></div>
      <div class="notice" id="facebookChangeNotice" hidden>地址变更保存后，旧 Page ID、六项能力、同步断点和下次采集失效，来源保持停用；历史内容保留。请重新检测当前主页。</div>
    </section>
    <section class="detail-block"><h3 class="detail-label">采集范围</h3><div class="facebook-fixed-scope">${['主页帖子', '帖子评论', '评论回复'].map(label => `<label><input type="checkbox" checked disabled> ${label}<span class="subline">固定采集</span></label>`).join('')}</div><div class="sensitive-note">“全部”指官方 Graph API 在当前主页授权范围内可返回的全部内容。</div></section>
    <section class="detail-block"><h3 class="detail-label">官方能力</h3>
      <div class="field"><label>采集方式</label><input class="input" value="系统受控官方凭据（管理员无需填写）" readonly></div>
      ${facebookStatusFields(source, creating)}
      ${creating ? '<div class="subline">保存停用来源后检测授权与能力。</div>' : `<div class="action-row"><button type="button" class="btn" id="btnFacebookAuth" ${writable ? '' : 'disabled'}>检测授权与能力</button><button type="button" class="btn" id="btnFacebookCapabilities" ${writable ? '' : 'disabled'}>重新检测能力</button></div>`}
    </section>
    <section class="detail-block"><h3 class="detail-label">历史与调度</h3>
      <div class="field"><label for="cfgFacebookInitialSync">首次同步</label><select class="input" id="cfgFacebookInitialSync" ${writable ? '' : 'disabled'}>${[['all', '回溯授权范围内全部历史'], ['since', '从指定日期开始'], ['incremental', '仅从现在开始增量']].map(([value, label]) => `<option value="${value}" ${value === initial ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field" id="facebookHistoryField" ${initial === 'since' ? '' : 'hidden'}><label for="cfgHistoryStart">历史起始日期<span class="required">*</span></label><input class="input" id="cfgHistoryStart" type="date" max="${facebookToday()}" value="${initial === 'since' ? esc(facebookDateOf(historyStartOf(source))) : ''}" ${writable && initial === 'since' ? '' : 'disabled'}><div class="subline">以北京时间零点为起点，不得晚于今天。</div></div>
      <div class="field"><label for="cfgFreq">采集频率</label><select class="input" id="cfgFreq" ${writable ? '' : 'disabled'}>${FACEBOOK_FREQUENCIES.map(([value, label]) => `<option value="${value}" ${value === frequency ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label>调度时区</label><input class="input" value="北京时间（Asia/Shanghai）" readonly></div>
      <div class="field"><label>每日锚点</label><input class="input" value="02:00" readonly></div>
      <div class="field"><label for="facebookNextRun">下次采集</label><input class="input" id="facebookNextRun" value="${esc(source.enabled && ready && nextRun ? formatTime(nextRun) : source.enabled && ready ? '服务端未返回' : '授权并启用后计算')}" readonly></div>
    </section>
    ${creating ? '' : `<section class="detail-block"><h3 class="detail-label">同步控制</h3><button type="button" class="btn primary" id="btnFacebookSync" ${syncUnavailableReason(source) ? 'disabled' : ''}>开始同步</button><div class="subline" id="facebookSyncReason">${esc(syncUnavailableReason(source) || '按已保存的同步策略执行，同来源任务不会并发。')}</div></section>`}
    <div class="facebook-error" id="facebookFormError" role="alert"></div>
    </div><div class="drawer-footer"><button type="submit" class="btn primary" id="btnFacebookSave" ${writable ? '' : 'disabled'}>${creating ? '保存并检测授权' : '保存配置'}</button><button type="button" class="btn" id="btnCancel">${creating ? '取消' : '关闭'}</button></div></form>`;
}
function facebookFormChanged(source) {
  const parsed = parseFacebookPageUrl($('#cfgBaseUrl')?.value);
  return Boolean(parsed.error) || parsed.url !== facebookUrlOf(source);
}
function bindFacebookForm(source, creating) {
  const form = $('#facebookSourceForm');
  form.onsubmit = event => { event.preventDefault(); submitFacebookSource(source, creating); };
  $('#btnCancel').onclick = closeDrawer;
  $('#cfgFacebookInitialSync').onchange = () => { const since = $('#cfgFacebookInitialSync').value === 'since'; $('#facebookHistoryField').hidden = !since; $('#cfgHistoryStart').disabled = !since || !facebookCanManage(source); };
  const update = () => {
    const changed = facebookFormChanged(source);
    const parsed = parseFacebookPageUrl($('#cfgBaseUrl').value);
    const urlChanged = Boolean(parsed.error) || parsed.url !== facebookUrlOf(source);
    $('#facebookChangeNotice').hidden = creating || !changed;
    $('#facebookChangeNotice').textContent = urlChanged ? '地址变更保存后，旧 Page ID、六项能力、同步断点和下次采集失效，来源保持停用；历史内容保留。请重新检测当前主页。' : '';
    if (!creating) {
      for (const id of ['btnFacebookAuth', 'btnFacebookCapabilities']) $(`#${id}`).disabled = !facebookCanManage(source) || changed;
      $('#btnFacebookSync').disabled = Boolean(syncUnavailableReason(source)) || changed;
      $('#facebookSyncReason').textContent = changed ? '请先保存变更并重新检测授权与能力' : syncUnavailableReason(source) || '按已保存策略同步并自动启用，同来源任务不会并发。';
    }
  };
  $('#cfgBaseUrl').addEventListener('input', update);
  if (!creating) {
    $('#btnFacebookAuth').onclick = () => checkFacebookSource(source);
    $('#btnFacebookCapabilities').onclick = () => checkFacebookSource(source, true);
    $('#btnFacebookSync').onclick = event => { if (facebookFormChanged(source)) return toast('请先保存变更并重新检测'); startSync(source, event.currentTarget); };
  }
}
function renderFacebookDetail(source, creating = false) {
  $('#drawerContent').innerHTML = `<div class="drawer-header drawer-header--facebook"><h2>${creating ? '新增 Facebook 采集源' : esc(pick(source, 'display_name', 'displayName') || 'Facebook 采集源')}</h2><div class="drawer-header-subtitle">境外 / Last Night · 官方主页授权范围采集</div></div>${facebookForm(source, creating)}`;
  bindFacebookForm(source, creating);
}
function facebookFormError(message, selector) { const target = $('#facebookFormError'); if (target) target.textContent = message; if (selector) $(selector)?.focus(); return null; }
function facebookFormPayload(source, creating) {
  if (!facebookCanManage(source)) return facebookFormError('当前账号仅有查看权限');
  if (!facebookScopeAllowed(source)) return facebookFormError('Facebook 采集源仅支持境外 Last Night 社区');
  const displayName = $('#cfgName').value.trim(); if (!displayName || displayName.length > 100) return facebookFormError('采集源名称为 1–100 字', '#cfgName');
  const parsed = parseFacebookPageUrl($('#cfgBaseUrl').value); if (parsed.error) return facebookFormError(parsed.error, '#cfgBaseUrl');
  const initial = $('#cfgFacebookInitialSync').value; const date = $('#cfgHistoryStart').value;
  if (!['all', 'since', 'incremental'].includes(initial)) return facebookFormError('请选择有效的首次同步模式', '#cfgFacebookInitialSync');
  if (initial === 'since' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date).getTime()) || new Date(date).toISOString().slice(0, 10) !== date || date > facebookToday())) return facebookFormError('请选择不晚于当前北京时间日期的有效历史起始日期', '#cfgHistoryStart');
  const frequencySeconds = Number($('#cfgFreq').value); if (!FACEBOOK_FREQUENCIES.some(([value]) => value === frequencySeconds)) return facebookFormError('请选择有效的采集频率', '#cfgFreq');
  const changed = parsed.url !== facebookUrlOf(source);
  const payload = { displayName, baseUrl: parsed.url, frequencySeconds, syncMode: initial === 'incremental' ? 'incremental' : 'backfill', historyStart: initial === 'all' ? FACEBOOK_ALL_HISTORY_START : initial === 'since' ? `${date}T00:00:00+08:00` : '' };
  if (creating) Object.assign(payload, { communityId: pick(source, 'community_id', 'communityId'), platform: 'facebook' });
  return { payload, changed };
}
function rememberFacebookSource(source, next) {
  const merged = { ...source, ...next };
  const index = state.sources.findIndex(item => String(item.id) === String(merged.id));
  if (index >= 0) state.sources[index] = merged; else state.sources.push(merged);
  renderRows(); return merged;
}
function setFacebookBusy(busy) {
  state.facebookBusy = busy;
  const form = $('#facebookSourceForm'); if (form) form.inert = busy;
  const button = $('#btnFacebookSave'); if (button && busy) { button.disabled = true; button.textContent = '处理中…'; }
}
async function submitFacebookSource(source, creating) {
  if (state.facebookBusy) return;
  const result = facebookFormPayload(source, creating); if (!result) return;
  const serial = state.requestSerial; const { payload, changed } = result; setFacebookBusy(true);
  let saved;
  try {
    const response = await api(creating ? '/sources' : `/sources/${encodeURIComponent(source.id)}/configuration`, { method: creating ? 'POST' : 'PATCH', body: JSON.stringify(payload) });
    saved = rememberFacebookSource(source, response.source || response);
    if (creating || changed) saved._facebookCheck = {};
    if (serial === state.requestSerial) { state.activeSourceId = String(saved.id); renderFacebookDetail(saved); updateDeepLink(saved.id, $('#statusFilter')?.value || ''); }
    toast(creating || changed ? '已保存停用来源，正在检测授权与能力' : '配置已保存');
  } catch (error) { if (serial === state.requestSerial) facebookFormError(facebookErrorMessage(error)); }
  finally {
    setFacebookBusy(false);
    if (!saved && $('#btnFacebookSave')) { $('#btnFacebookSave').disabled = !facebookCanManage(source); $('#btnFacebookSave').textContent = creating ? '保存并检测授权' : '保存配置'; }
  }
  if (saved && (creating || changed)) await checkFacebookSource(saved, false, { fromSave: true });
}
async function checkFacebookSource(source, capabilitiesOnly = false, options = {}) {
  if (state.facebookBusy || !facebookCanManage(source)) return;
  if (!options.fromSave && facebookFormChanged(source)) return facebookFormError('请先保存地址变更');
  const serial = state.requestSerial; const meta = { ...(source._facebookCheck || {}) }; setFacebookBusy(true);
  let next = source;
  try {
    let auth;
    if (!capabilitiesOnly) {
      auth = await api(`/sources/${encodeURIComponent(source.id)}/check-auth`, { method: 'POST', body: '{}' });
      meta.systemCredentialStatus = auth.systemCredentialStatus || auth.system_credential_status || meta.systemCredentialStatus;
      if (auth.capabilities) meta.capabilities = { ...(meta.capabilities || {}), ...auth.capabilities };
      next = { ...next, auth_status: auth.authStatus, capabilities: { ...(next.capabilities || {}), ...(auth.capabilities || {}) }, account: { ...accountOf(next), auth_status: auth.authStatus } };
      if (auth.authStatus !== 'authorized') meta.error = facebookErrorMessage(auth.errorCode || auth.reason);
    }
    const capabilities = await api(`/sources/${encodeURIComponent(source.id)}/check-capabilities`, { method: 'POST', body: '{}' });
    meta.systemCredentialStatus = capabilities.systemCredentialStatus || capabilities.system_credential_status || meta.systemCredentialStatus;
    meta.capabilities = { ...(meta.capabilities || {}), ...(capabilities.capabilities || {}) };
    next = { ...next, systemCredentialStatus: meta.systemCredentialStatus, capabilities: { ...(next.capabilities || {}), ...(capabilities.capabilities || {}) } };
    const missing = facebookMissingCapabilities({ ...next, _facebookCheck: meta });
    const resultCode = capabilities.errorCode || capabilities.reason || auth?.errorCode || auth?.reason;
    meta.error = missing.length || capabilities.authorized === false ? `尚未通过：${missing.join('、') || '主页授权'}。${facebookErrorMessage(resultCode)}` : '';
    // 仅消费服务端脱敏来源，检测时间不使用客户端时钟伪造。
    const refreshed = await api(`/sources/${encodeURIComponent(source.id)}`);
    next = { ...next, ...(refreshed.source || refreshed), _facebookCheck: meta };
    next = rememberFacebookSource(source, next);
    if (serial === state.requestSerial && state.activeSourceId === String(source.id)) renderFacebookDetail(next);
    toast(meta.error || (facebookReady(next) ? '部署级凭据与六项能力已通过，可启用并保存' : '检测已完成，请查看逐项结果'));
  } catch (error) {
    meta.systemCredentialStatus = error.details?.systemCredentialStatus || meta.systemCredentialStatus;
    if (error.details?.capabilities) meta.capabilities = { ...(meta.capabilities || {}), ...error.details.capabilities };
    meta.error = facebookErrorMessage(error); next = rememberFacebookSource(source, { ...next, systemCredentialStatus: meta.systemCredentialStatus || facebookSystemCredentialStatus(next), capabilities: { ...(next.capabilities || {}), ...(meta.capabilities || {}) }, _facebookCheck: meta });
    if (serial === state.requestSerial && state.activeSourceId === String(source.id)) renderFacebookDetail(next);
    toast(meta.error);
  } finally { setFacebookBusy(false); }
}
// TapTap 监控账号 ID：逗号/换行分隔的多值输入 → 去重后的数字 ID 数组。
function parseAccountIds(value) { return [...new Set(String(value || '').split(/[,，\n\r]+/).map(item => item.trim()).filter(item => /^\d+$/.test(item)))]; }
function checkpointsOf(source) { return source.checkpoints || source.sync_checkpoints || source.syncCheckpoints || accountOf(source).checkpoints || []; }
function checkpointsFor(source, scope) { const all = checkpointsOf(source); if (!Array.isArray(all)) return all[scope] ? [all[scope]] : []; return all.filter(item => (item.sync_scope || item.syncScope || item.scope) === scope); }
function checkpointOf(source, scope) { return checkpointsFor(source, scope)[0] || {}; }
function stageState(source, scope) {
  const states = checkpointsFor(source, scope).map(item => pick(item, 'status', 'sync_status', 'syncStatus')).filter(Boolean);
  const rank = ['awaiting_manual_verification', 'failed', 'running', 'partial', 'idle', 'paused', 'unsupported', 'completed'];
  return rank.find(status => states.includes(status)) || states[0] || pick(source, `${scope}_status`, `${scope}Status`) || 'idle';
}
function stageCount(source, scope) {
  const checkpoints = checkpointsFor(source, scope);
  if (checkpoints.length) return checkpoints.reduce((total, item) => total + Number(pick(item, 'items_fetched', 'itemsFetched', 'count') || 0), 0).toLocaleString();
  const value = pick(source, `${scope}_count`, `${scope}Count`); return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '-';
}
function accountIdentity(source) { const account = accountOf(source); return { account, name: pick(account, 'account_name', 'accountName', 'nickname', 'name', 'masked_phone', 'maskedPhone') || pick(source, 'account_name', 'accountName', 'masked_phone', 'maskedPhone') || '未绑定账号', id: pick(account, 'platform_account_id', 'platformAccountId', 'tenant_id', 'tenantId', 'uid', 'id') || pick(source, 'platform_account_id', 'platformAccountId') || '' }; }
function sourceAuth(source) { return pick(accountOf(source), 'auth_status', 'authStatus') || pick(source, 'auth_status', 'authStatus') || 'unconfigured'; }
function sourceAuthDisplay(source) { const auth = sourceAuth(source); return auth === 'unconfigured' && credentialConfigured(source) ? 'configured_pending_verification' : auth; }
function authDisplayLabel(source) { if (normalizedPlatform(source) === 'facebook') return facebookAuthLabel(source); const status = sourceAuthDisplay(source); return status === 'configured_pending_verification' ? '已配置，待验证' : authLabel(status); }
function capabilityState(source, scope) { const value = (source.capabilities || accountOf(source).capabilities || {})[scope]; return typeof value === 'object' ? pick(value, 'status', 'capability') : value; }
function capabilityStatuses(source) { const values = Object.values(source.capabilities || accountOf(source).capabilities || {}); return values.map(value => typeof value === 'object' ? pick(value, 'status', 'capability') : value).filter(Boolean); }
const CAPABILITY_LABELS = { full: '完整', authorized_scope: '授权范围', available: '可用', supported: '可用', configured: '已配置，未测试', untested: '未测试', limited: '受限', unsupported: '不支持', unavailable: '不可用', unauthorized: '未授权', unconfigured: '未配置' };
function capabilityLabel(status) { return CAPABILITY_LABELS[status] || status || '未检测'; }
function sourceLoginMeta(source) { return Status.loginMeta(state.loginStatus && state.activeSourceId === String(source.id) ? state.loginStatus : source); }
// TapTap 已配置的监控目标：账号 ID（accountIds）或版块/小组 ID（groupIds）任一非空即视为可同步。
// 实际数据里两种形态并存——按账号抓 owned_content 的用 accountIds，按版块抓讨论的用 groupIds。
function taptapTargetsConfigured(source) { const config = configOf(source); return Boolean((config.accountIds || []).length || (config.groupIds || []).length); }
function canSchedule(source) { const platform = normalizedPlatform(source); if (platform === 'facebook') return facebookReady(source); if (platform === 'taptap') return taptapTargetsConfigured(source) && ['full', 'authorized_scope', 'supported'].includes(capabilityState(source, 'posts')); if (platform === 'discord') return sourceAuth(source) === 'authorized' && ['full', 'authorized_scope', 'supported'].includes(capabilityState(source, 'posts')); const authorized = platform === 'bigplayer_h5' ? sourceLoginMeta(source).state === 'healthy' || sourceAuth(source) === 'authorized' : sourceLoginMeta(source).state === 'healthy'; return ACTIONABLE.has(platform) && authorized && ['full', 'authorized_scope', 'supported'].includes(capabilityState(source, 'posts')); }
function sourceCommunity(source) { const id = pick(source, 'community_id', 'communityId'); return state.scope?.selected?.().community?.id && String(state.scope.selected().community.id) === String(id) ? state.scope.selected().community : { id, name: pick(source, 'community_name', 'communityName'), status: pick(source, 'community_status', 'communityStatus') }; }
function syncUnavailableReason(source) { const community = sourceCommunity(source); const platform = normalizedPlatform(source); if (community.status === 'disabled') return `社区「${community.name || community.id || '当前社区'}」已停用，仅可查看历史数据，不能新增同步`; if (platform === 'facebook') return facebookUnavailableReason(source); if (!ACTIONABLE.has(platform)) return '该平台连接器暂不可用'; if (platform === 'taptap') return taptapTargetsConfigured(source) ? '' : '请先配置 TapTap 监控账号 ID 或版块 ID'; const authorized = platform === 'discord' ? sourceAuth(source) === 'authorized' : platform === 'bigplayer_h5' ? sourceLoginMeta(source).state === 'healthy' || sourceAuth(source) === 'authorized' : sourceLoginMeta(source).state === 'healthy'; if (!authorized) return platform === 'discord' ? '请先完成 Discord Bot 授权检测' : '请先完成账号授权检测'; if (!['full', 'authorized_scope', 'supported'].includes(capabilityState(source, 'posts'))) return '请先检测帖子同步能力'; return ''; }
function syncActionLabel(source, detail = false) { const backfill = sourceMode(source) === 'backfill'; if (detail) return backfill ? '开始同步（授权范围回溯）' : '开始同步（增量）'; return backfill ? '开始授权范围回溯' : '开始同步'; }
function formatTime(value) { return (value && window.formatBeijingTime) ? window.formatBeijingTime(value) : (value ? String(value).replace('T', ' ').replace(/\.\d{3}Z$/, '') : '-'); }
function sourceMode(source) { return pick(source, 'sync_mode', 'syncMode') || pick(configOf(source), 'syncMode', 'sync_mode') || pick(parseObject(accountOf(source).metadata), 'syncMode', 'sync_mode') || 'incremental'; }
function historyStartOf(source) { return pick(configOf(source), 'historyStart', 'history_start') || pick(parseObject(accountOf(source).metadata), 'historyStart', 'history_start') || ''; }
function syncModeLabel(mode) { return mode === 'backfill' ? '授权范围回溯' : '增量同步'; }
function credentialConfigured(source) { const summary = h5Credential(source); const explicit = Status.explicitCredentialState?.(source); const explicitObjects = [source?.account, source?.platform_account, source?.platformAccount, source].filter(Boolean); const summaryObjects = [source?.credentialSummary, source?.credential_summary].filter(Boolean); const summaryFlag = [...summaryObjects, ...explicitObjects].map(item => pick(item, 'hasCredential', 'has_credential', 'credentialConfigured', 'credential_configured', 'hasToken', 'has_token')).find(value => typeof value === 'boolean'); return Boolean(explicit === false ? false : explicit ?? summaryFlag ?? summary.hasCredential ?? summary.hasToken); }
function isCredentialMask(value) { const normalized = String(value || '').trim(); return Boolean(normalized) && /^[*•]+$/.test(normalized); }
function configValue(source, ...keys) { return pick(configOf(source), ...keys) || pick(source, ...keys) || ''; }
function challengeOf(value) { return pick(value, 'challenge', 'currentChallenge', 'current_challenge') || (pick(value, 'challengeId', 'challenge_id') || pick(value, 'type', 'challengeType', 'challenge_type') ? value : null); }
function cacheLoginStatus(source, value) { state.loginStatus = value || {}; source.loginStatus = state.loginStatus; }

function stageSummary(source, scope) {
  const checkpoints = checkpointsFor(source, scope);
  if (!checkpoints.length) {
    const value = pick(source, `${scope}_count`, `${scope}Count`);
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '-';
  }
  const processed = checkpoints.reduce((total, item) => total + Number(pick(item, 'items_fetched', 'itemsFetched', 'count') || 0), 0);
  const pending = checkpoints.filter(item => ['idle', 'queued', 'pending', 'running'].includes(String(pick(item, 'status', 'sync_status', 'syncStatus') || '').toLowerCase())).length;
  if (!pending) return `${processed.toLocaleString()} 已写入`;
  return `${processed.toLocaleString()} 已写入 / ${pending.toLocaleString()} 待处理`;
}
function renderStageStack(source) {
  return `<div class="stage-stack">${STAGES.map(([scope, label]) => { const status = stageState(source, scope); return `<div class="stage-line"><b>${label}</b><span class="pill ${esc(status)}">${esc(stageLabel(status))}</span><span>${esc(stageSummary(source, scope))}</span></div>`; }).join('')}</div>`;
}
function syncStatusLabel(status) { return ({ queued: '等待执行', running: '同步中', pending: '等待执行', completed: '已完成', completed_full: '完整完成', completed_authorized_scope: '授权范围完成', partial: '部分完成', awaiting_manual_verification: '待人工验证', done: '已完成', failed: '同步失败', cancelled: '已取消', canceled: '已取消' }[status] || status || '同步中'); }
function syncProgressState(progress) {
  const status = String(progress.status || progress.run?.status || '').toLowerCase();
  const terminal = SyncProgress.isTerminal(status);
  const fetched = Number(pick(progress.run, 'fetched', 'fetchedCount', 'fetched_count', 'itemsFetched', 'items_fetched', 'processed') || 0);
  const total = Number(pick(progress.run, 'discovered', 'discoveredCount', 'discovered_count', 'itemsDiscovered', 'items_discovered', 'itemsFound', 'items_found', 'total', 'totalItems', 'total_items', 'itemsTotal', 'items_total') || 0);
  if (terminal) return { label: '已完成', detail: status === 'partial' ? '部分完成' : status === 'awaiting_manual_verification' ? '待人工验证' : ['failed', 'cancelled', 'canceled'].includes(status) ? syncStatusLabel(status) : '', percent: 100, indeterminate: false, fetched, total };
  if (total > 0) return { label: '抓取中', detail: '', percent: Math.min(99, Math.max(0, Math.round((fetched / total) * 100))), indeterminate: false, fetched, total };
  return { label: '抓取中', detail: '', percent: 0, indeterminate: true, fetched, total };
}
function syncItemValue(item, ...keys) { return pick(item, ...keys) || '-'; }
function renderSyncPanel() {
  const progress = syncController.snapshot(); const run = progress.run || {};
  const rows = progress.items.slice(0, progress.visibleLimit).map(item => {
    const authorId = syncItemValue(item, 'authorId', 'author_id', 'platformAuthorId', 'platform_author_id');
    const nickname = syncItemValue(item, 'authorNickname', 'author_nickname', 'nickname', 'authorName', 'author_name');
    const change = syncItemValue(item, 'change', 'changeType', 'change_type', 'action');
    return `<tr><td>${esc(SyncProgress.sequenceOf(item) || '-')}</td><td><b>${esc(syncItemValue(item, 'title'))}</b><div class="sync-body">${esc(syncItemValue(item, 'body', 'content', 'text'))}</div></td><td>${esc(platformLabel(syncItemValue(item, 'platform')))}</td><td>${esc(authorId)}<div class="subline">${esc(nickname)}</div></td><td>${esc(formatTime(syncItemValue(item, 'publishedAt', 'published_at')))}</td><td>${esc(syncItemValue(item, 'commentCount', 'comment_count', 'commentsCount', 'comments_count'))}</td><td><span class="pill ${esc(change)}">${esc(change)}</span></td></tr>`;
  }).join('');
  const canLoadMore = progress.items.length > progress.visibleLimit || progress.hasMore;
  const actualPosts = pick(run, 'postCount', 'post_count', 'posts', 'fetched') || 0;
  const actualComments = pick(run, 'actualCommentCount', 'actual_comment_count', 'commentsFetched', 'comments_fetched') || 0;
  const actualReplies = pick(run, 'replyCount', 'reply_count', 'repliesFetched', 'replies_fetched') || 0;
  const advertisedComments = pick(run, 'advertisedCommentCount', 'advertised_comment_count', 'comments') || 0;
  const progressState = syncProgressState(progress);
  if (progressState.percent === 100 && !progress.error && !run.message) clearToast();
  const progressValue = progressState.total > 0 ? `${progressState.fetched} / ${progressState.total}` : `${progressState.fetched} 个`;
  const progressBar = `<div class="sync-progress-meta"><div><span class="sync-progress-status ${progressState.indeterminate ? 'is-running' : progressState.percent === 100 ? 'is-complete' : 'is-running'}">${progressState.label}</span>${progressState.detail ? `<span class="subline sync-progress-detail">${esc(progressState.detail)}</span>` : ''}</div><span class="sync-progress-value">${esc(progressValue)}${progressState.indeterminate ? '' : ` · ${progressState.percent}%`}</span></div><div class="sync-progress-bar${progressState.indeterminate ? ' indeterminate' : ''}" role="progressbar" aria-label="当前抓取进度" aria-valuemin="0" aria-valuemax="100"${progressState.indeterminate ? '' : ` aria-valuenow="${progressState.percent}"`}><span class="sync-progress-fill" style="width:${progressState.indeterminate ? '35' : progressState.percent}%"></span></div>`;
  const facebook = normalizedPlatform(state.sources.find(source => String(source.id) === String(progress.sourceId))) === 'facebook';
  return `<tr class="sync-progress-row"><td colspan="8"><section class="sync-progress"><header><div><b>实时同步进度</b><span class="pill ${esc(run.status)}">${esc(syncStatusLabel(run.status))}</span><span class="subline sync-run-id">运行 #${esc(progress.runId)}</span></div><button class="sync-close" data-collapse-sync title="收起同步进度">×</button></header>${progressBar}<div class="sync-counts"><span>帖子 <b>${esc(actualPosts)}</b></span><span>顶层评论 <b>${esc(actualComments)}</b></span><span>回复 <b>${esc(actualReplies)}</b></span><span>帖子声明评论总数 <b>${esc(advertisedComments)}</b></span><span>新增 <b>${esc(run.created || 0)}</b></span><span>变更 <b>${esc(run.updated || 0)}</b></span><span>未变化 <b>${esc(run.unchanged || 0)}</b></span></div>${progress.error ? `<div class="sync-error">连接暂时中断：${esc(facebook ? facebookErrorMessage(progress.error) : progress.error)}，${esc([3, 5, 10][Math.min(Math.max(progress.retryCount - 1, 0), 2)])} 秒后重试</div>` : ''}${run.message ? `<div class="sync-error">${esc(facebook ? facebookErrorMessage(run.errorCode || run.error_code) : run.message)}</div>` : ''}<div class="sync-limit">${facebook ? '仅采集 Facebook 官方授权范围内的帖子、顶层评论和回复；分页未完成时显示部分完成。' : '同步范围包含首页、资讯页、玩家圈全部动态 Tab。该站点当前仅提供评论数量，评论内容接口暂不支持。未完成入口会明确显示为部分完成。'}</div><div class="sync-content-wrap"><table class="sync-content-table"><thead><tr><th>序号</th><th>标题 / 正文</th><th>平台</th><th>发帖人 ID / 昵称</th><th>发布时间</th><th>声明评论数</th><th>变化</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="sync-empty">${progress.loading ? '正在读取本次同步内容…' : '本次同步暂未产生内容'}</td></tr>`}</tbody></table></div>${canLoadMore ? `<button class="row-action sync-more" data-sync-load-more ${progress.loading ? 'disabled' : ''}>加载更多（每次最多 100 条）</button>` : ''}</section></td></tr>`;
}
function bindSyncPanelActions() { const collapse = $('[data-collapse-sync]'); if (collapse) collapse.onclick = collapseSyncPanel; const more = $('[data-sync-load-more]'); if (more) more.onclick = () => syncController.loadMore(); }

function sourceCollectionSummary(source) { const platform = normalizedPlatform(source); const config = configOf(source); const account = accountOf(source); if (platform === 'discord') { const channels = pick(config, 'channelIds', 'channel_ids') || []; const scope = pick(config, 'channelScope', 'channel_scope') === 'all_accessible'; return `Guild：${pick(config, 'guildId', 'guild_id') || '未配置'} · ${scope ? '范围：全频道（Bot 可访问的文字/公告频道）' : `频道：${Array.isArray(channels) ? channels.join('、') : String(channels || '未配置')}`}`; } if (platform === 'taptap') { const ids = config.accountIds || config.account_ids || []; const groups = config.groupIds || config.group_ids || []; const keywords = config.keywords || config.keyword || source.keywords || account.keywords || []; const targetText = ids.length || groups.length ? [ids.length ? `${ids.length} 个账号` : '', groups.length ? `${groups.length} 个版块` : ''].filter(Boolean).join(' + ') : '未配置监控目标'; const keywordText = Array.isArray(keywords) ? keywords.length ? `${keywords.length} 个关键词` : '未配置关键词' : String(keywords || '未配置关键词'); return `${keywordText} · ${targetText}`; } return accountIdentity(source).name; }
function sourceEnableToggle(source, disabled, reason = '') { const enabled = Boolean(source.enabled); const title = reason || (enabled ? '停用采集源不会中断当前同步任务' : '启用后进入周期调度，不会立即发起同步'); return `<label class="toggle source-enable-toggle" title="${esc(title)}"><input type="checkbox" data-toggle-source="${esc(source.id)}" ${enabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span><span>${enabled ? '已启用' : '已停用'}</span></label>`; }
async function toggleSource(source, checkbox) {
  if (!source || !checkbox) return;
  const enabled = Boolean(checkbox.checked); const previous = Boolean(source.enabled);
  if (enabled === previous) return;
  checkbox.disabled = true;
  try {
    const updated = await api(`/sources/${encodeURIComponent(source.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    const next = updated?.source || updated;
    const index = state.sources.findIndex(item => String(item.id) === String(source.id));
    if (index >= 0) state.sources[index] = { ...state.sources[index], ...next };
    toast(enabled ? '采集源已启用' : '采集源已停用');
  } catch (error) {
    checkbox.checked = previous;
    toast(`启用状态更新失败：${error.message}`);
  } finally { renderRows(); }
}
function renderFacebookRow(source) {
  const identity = accountIdentity(source); const reason = syncUnavailableReason(source); const syncing = String(state.syncingSourceId) === String(source.id);
  const lastSync = pick(identity.account, 'last_incremental_sync_at', 'lastIncrementalSyncAt', 'last_full_sync_at', 'lastFullSyncAt') || pick(source, 'last_success_at', 'lastSuccessAt', 'last_run_at', 'lastRunAt');
  const missing = facebookMissingCapabilities(source); const frequency = Number(pick(source, 'frequency_seconds', 'frequencySeconds') || 3600);
  const errorCode = checkpointsOf(source).find?.(item => pick(item, 'error_code', 'errorCode'));
  const error = source._facebookCheck?.error || (errorCode ? facebookErrorMessage(pick(errorCode, 'error_code', 'errorCode')) : '');
  return `<tr><td data-label="采集源 / 账号"><div class="source-name">${esc(pick(source, 'display_name', 'displayName') || 'Facebook')}<span class="source-type">官方主页</span></div><div class="subline facebook-source-url">${esc(facebookUrlOf(source) || '主页地址待配置')}</div><div class="subline">Page ID：${esc(facebookPageId(source) || '待识别')}</div></td><td data-label="归属范围">境外 / ${esc(pick(source, 'community_name', 'communityName') || 'Last Night')}</td><td data-label="平台">Facebook</td><td data-label="授权状态"><span class="pill ${facebookReady(source) ? 'authorized' : 'unconfigured'}">${esc(facebookAuthLabel(source))}</span><div class="subline">部署级官方凭据：${esc(facebookSystemCredentialLabel(source))}</div><div class="subline">${esc(missing.length ? `未通过：${missing.join('、')}` : '六项能力已通过')}</div><div class="subline">最近检测：平台未返回</div></td><td data-label="同步进度">${renderStageStack(source)}</td><td data-label="同步策略">${esc(facebookInitialSyncLabel(source))}<div class="subline">${sourceEnableToggle(source, !facebookCanManage(source) || (!source.enabled && !facebookReady(source)), !facebookCanManage(source) ? '当前账号仅有查看权限' : !source.enabled && !facebookReady(source) ? '部署级凭据与六项能力通过后才能启用' : '')} · ${esc(FACEBOOK_FREQUENCIES.find(([value]) => value === frequency)?.[1] || `${frequency} 秒`)}</div></td><td data-label="最近同步">${esc(formatTime(lastSync))}${error ? `<div class="subline">${esc(error)}</div>` : ''}</td><td data-label="操作"><div class="row-actions"><button class="row-action primary" data-sync-source="${esc(source.id)}" title="${esc(reason || '开始同步并自动启用采集源')}" ${reason || syncing ? 'disabled' : ''}>${syncing ? '提交中…' : '开始同步'}</button><button class="row-action" data-manage-source="${esc(source.id)}">${facebookCanManage(source) ? '管理' : '查看'}</button></div>${reason ? `<div class="subline action-reason">${esc(reason)}</div>` : ''}</td></tr>${String(syncController.state.sourceId) === String(source.id) ? renderSyncPanel() : ''}`;
}
function renderRows() {
  const scope = state.scope?.query?.() || new URLSearchParams();
  const communityId = scope.get('communityId') || '';
  const scopePlatform = Status.normalizePlatform(scope.get('platform') || state.scope?.selected?.().platform || '');
  const filterPlatform = Status.normalizePlatform($('#platformFilter').value || '');
  const platform = filterPlatform || scopePlatform;
  const status = $('#statusFilter').value;
  if (state.sourcesLoading) { $('#resultHint').textContent = '正在加载'; $('#rows').innerHTML = '<tr><td colspan="8" class="empty">正在加载采集源...</td></tr>'; return; }
  if (state.sourcesError) { $('#resultHint').textContent = '采集源加载失败'; $('#rows').innerHTML = `<tr><td colspan="8" class="empty">${esc(state.sourcesError)}，请检查服务后点击刷新</td></tr>`; return; }
  const filtered = state.sources.filter(source => (!communityId || String(source.community_id || source.communityId) === communityId) && (!platform || normalizedPlatform(source) === platform) && Status.matchesStatus(source, status));
  $('#resultHint').textContent = `共 ${filtered.length} 个账号源`;
  $('#rows').innerHTML = filtered.length ? filtered.map(source => {
    if (normalizedPlatform(source) === 'facebook') return renderFacebookRow(source);
    const identity = accountIdentity(source); const social = Status.isSocialLoginPlatform(source.platform); const login = Status.loginMeta(source); const auth = sourceAuthDisplay(source);
    const error = STAGES.flatMap(([scope]) => checkpointsFor(source, scope)).map(item => pick(item, 'error_message', 'errorMessage')).find(Boolean) || pick(source, 'last_error', 'lastError');
    const lastSync = pick(identity.account, 'last_incremental_sync_at', 'lastIncrementalSyncAt', 'last_full_sync_at', 'lastFullSyncAt') || pick(source, 'last_success_at', 'lastSuccessAt', 'last_run_at', 'lastRunAt');
    const syncReason = syncUnavailableReason(source); const syncing = String(state.syncingSourceId) === String(source.id);
    const regionCode = pick(source, 'region_code', 'regionCode'); const regionName = pick(source, 'region_name', 'regionName') || (regionCode === 'domestic' ? '境内' : regionCode === 'overseas' ? '境外' : regionCode) || state.scope?.selected?.().regionLabel;
    return `<tr><td data-label="采集源 / 账号"><div class="source-with-dot">${Status.needsAttention(source) ? '<span class="attention-dot" title="需要处理"></span>' : ''}<div><div class="source-name">${esc(source.display_name || source.displayName || platformLabel(source.platform))}<span class="source-type">${esc(sourceTypeLabel(source))}</span></div><div class="subline">${esc(sourceCollectionSummary(source))}${identity.id && !String(identity.id).startsWith('pending:') && normalizedPlatform(source) !== 'taptap' ? ` · ${esc(identity.id)}` : ''}</div></div></div></td><td data-label="归属范围">${esc([regionName, pick(source, 'community_name', 'communityName') || sourceCommunity(source).name].filter(Boolean).join(' / '))}</td><td data-label="平台">${esc(platformLabel(source.platform))}</td><td data-label="授权状态"><span class="pill ${social ? login.tone : esc(auth)}">${esc(social ? login.label : authDisplayLabel(source))}</span></td><td data-label="同步进度">${renderStageStack(source)}</td><td data-label="同步策略">${esc(syncModeLabel(sourceMode(source)))}<div class="subline">${sourceEnableToggle(source, !ACTIONABLE.has(normalizedPlatform(source)) || (!source.enabled && !canSchedule(source)))} </div></td><td data-label="最近同步">${esc(formatTime(lastSync))}${error ? `<div class="subline" title="${esc(error)}">${esc(error)}</div>` : ''}</td><td data-label="操作"><div class="row-actions"><button class="row-action primary" data-sync-source="${esc(source.id)}" title="${esc(syncReason || `${syncActionLabel(source)}并自动启用采集源`)}" ${syncReason || syncing ? 'disabled' : ''}>${syncing ? '提交中…' : esc(syncActionLabel(source))}</button><button class="row-action" data-manage-source="${esc(source.id)}">管理</button></div>${syncReason ? `<div class="subline action-reason">${esc(syncReason)}</div>` : ''}</td></tr>${String(syncController.state.sourceId) === String(source.id) ? renderSyncPanel() : ''}`;
  }).join('') : '<tr><td colspan="8" class="empty">暂无符合条件的采集源</td></tr>';
  bindSyncPanelActions();
}
function capabilityPanel(source) {
  const capabilities = source.capabilities || accountOf(source).capabilities || {};
  return `<div class="detail-block"><div class="detail-label">同步能力</div><div class="cap-grid">${STAGES.map(([scope, label]) => { const value = capabilities[scope]; const status = (typeof value === 'object' ? pick(value, 'status', 'capability') : value) || 'unconfigured'; return `<div class="cap-item"><div class="cap-name">${label}</div><span class="pill ${esc(status)}">${esc(capabilityLabel(status))}</span></div>`; }).join('')}</div></div>`;
}
function h5Credential(source) { return Status.h5CredentialMeta(source); }
function h5AuthMode(source) { return state.h5AuthMode || (h5Credential(source).hasToken ? 'token' : 'account_password'); }
function h5CredentialFields(source, creating) {
  const summary = h5Credential(source); const mode = h5AuthMode(source); const account = pick(source, 'masked_account', 'maskedAccount', 'login_account_masked', 'loginAccountMasked') || summary.account;
  const panel = mode === 'token' ? `<div class="field"><label for="cfgToken">已有 Token${creating && !summary.hasToken ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgToken" type="password" autocomplete="new-password" placeholder="${summary.hasToken ? '已配置；留空保持不变' : '请输入已有 Token'}"></div><div class="sensitive-note">Token 用于接口授权，不需要登录会话验证。只在提交时发送，不回显、不写入 URL 或浏览器存储。</div>` : `<div class="field"><label for="cfgH5Account">登录账号${creating && !summary.hasPassword ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgH5Account" autocomplete="username" value="" placeholder="${account ? `已配置：${esc(account)}` : '请输入登录账号'}"></div><div class="field"><label for="cfgH5Password">登录密码${creating && !summary.hasPassword ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgH5Password" type="password" autocomplete="new-password" placeholder="${summary.hasPassword ? '已配置；留空保持不变' : '请输入登录密码'}"></div><div class="field"><label for="cfgH5PasswordConfirm">确认密码${creating && !summary.hasPassword ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgH5PasswordConfirm" type="password" autocomplete="new-password" placeholder="再次输入登录密码"></div><div class="sensitive-note">账号仅显示脱敏状态；密码不回显、不写入 URL 或浏览器存储。账密模式保存后才进行登录会话验证。</div>`;
  return `<div class="detail-block"><div class="detail-label">授权方式</div><div class="auth-mode-tabs" role="tablist" aria-label="H5 授权方式"><button type="button" class="btn ${mode === 'token' ? 'primary' : ''}" id="h5AuthToken" role="tab" aria-controls="h5AuthPanel" aria-selected="${mode === 'token'}">Token</button><button type="button" class="btn ${mode === 'account_password' ? 'primary' : ''}" id="h5AuthPassword" role="tab" aria-controls="h5AuthPanel" aria-selected="${mode === 'account_password'}">账号密码</button></div><div class="auth-mode-panel" id="h5AuthPanel" role="tabpanel">${panel}</div></div>`;
}
function bindDiscordChannelScope() {
  const apply = scope => {
    const allAccessible = scope === 'all_accessible';
    if ($('#cfgChannelScope')) $('#cfgChannelScope').value = allAccessible ? 'all_accessible' : 'selected';
    if ($('#cfgChannelIdsField')) $('#cfgChannelIdsField').style.display = allAccessible ? 'none' : '';
    if ($('#cfgAllChannelsNote')) $('#cfgAllChannelsNote').style.display = allAccessible ? '' : 'none';
    document.querySelectorAll('[data-discord-channel-scope]').forEach(button => {
      const active = button.dataset.discordChannelScope === (allAccessible ? 'all_accessible' : 'selected');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  document.querySelectorAll('[data-discord-channel-scope]').forEach(button => { button.onclick = () => apply(button.dataset.discordChannelScope); });
}
function bindH5CredentialMode(source, creating) {
  const switchMode = mode => { state.h5AuthMode = mode; const baseUrl = $('#cfgBaseUrl')?.value || ''; const name = $('#cfgName')?.value || ''; const frequency = $('#cfgFreq')?.value || ''; source.base_url = baseUrl; source.display_name = name; source.frequency_seconds = Number(frequency || 3600); renderDetail(source); };
  if ($('#h5AuthToken')) $('#h5AuthToken').onclick = () => switchMode('token');
  if ($('#h5AuthPassword')) $('#h5AuthPassword').onclick = () => switchMode('account_password');
}
function platformPanel(source, creating = false) {
  const platform = normalizedPlatform(source); const configured = credentialConfigured(source); const identity = accountIdentity(source);
  if (platform === 'bigplayer_h5') return `<div class="detail-block"><div class="detail-label">大玩家 H5 站点</div><div class="field"><label>站点地址<span class="required">*</span></label><input class="input" id="cfgBaseUrl" type="url" value="${esc(isOverseasLastNight(source) ? OVERSEAS_LAST_NIGHT_BASE_URL : configValue(source, 'baseUrl', 'base_url'))}" placeholder="https://community.example.com/" ${isOverseasLastNight(source) ? 'readonly' : ''}></div>${isOverseasLastNight(source) ? '<div class="field"><label>起始路径</label><input class="input" value="/" readonly></div><div class="sensitive-note">欧美版可在凭据、授权和帖子同步能力检测通过后启用；若保存时被拒绝，将显示后端门禁原因。</div>' : ''}${h5CredentialFields(source, creating)}${creating ? '' : '<div class="action-row" style="margin-top:12px"><button class="btn" id="btnCheckAuth">检测授权</button><button class="btn" id="btnCheckCapabilities">检测能力</button></div>'}</div>${capabilityPanel(source)}`;
  if (Status.isSocialLoginPlatform(platform)) return `<div class="detail-block"><div class="detail-label">平台登录凭据</div><div class="field"><label>国家/地区代码</label><input class="input" value="+86" readonly></div><div class="field"><label>手机号${creating ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgPhone" inputmode="numeric" maxlength="11" autocomplete="off" value="${creating ? '' : esc(pick(identity.account, 'masked_phone', 'maskedPhone') || pick(source, 'masked_phone', 'maskedPhone') || '')}" placeholder="11 位中国大陆手机号" ${creating ? '' : 'readonly'}></div><div class="field"><label>登录密码${creating ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgPassword" type="password" autocomplete="new-password" placeholder="${configured ? '凭据已配置；留空不修改' : '请输入登录密码'}"></div><div class="field"><label>确认密码${creating ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgPasswordConfirm" type="password" autocomplete="new-password" placeholder="再次输入登录密码"></div><div class="sensitive-note">创建后为“待验证”，不会自动登录。密码不回显、不写入 URL 或浏览器存储。</div></div>${creating ? '' : capabilityPanel(source)}`;
  if (platform === 'discord') {
    const discordConfig = configOf(source);
    const channels = pick(discordConfig, 'channelIds', 'channel_ids') || [];
    const guildId = pick(discordConfig, 'guildId', 'guild_id') || '';
    const allAccessible = pick(discordConfig, 'channelScope', 'channel_scope') === 'all_accessible';
    return `<section class="discord-source-form">
      <div class="detail-block discord-scope-block">
        <div class="detail-label">采集范围</div>
        <div class="discord-scope-options" role="group" aria-label="Discord 采集范围">
          <button class="discord-scope-option ${allAccessible ? '' : 'active'}" type="button" data-discord-channel-scope="selected" aria-pressed="${allAccessible ? 'false' : 'true'}"><span class="discord-scope-title">指定频道</span><span class="discord-scope-mark" aria-hidden="true">${allAccessible ? '○' : '●'}</span><span class="discord-scope-desc">仅采集手动填写的频道 ID 白名单。</span></button>
          <button class="discord-scope-option ${allAccessible ? 'active' : ''}" type="button" data-discord-channel-scope="all_accessible" aria-pressed="${allAccessible ? 'true' : 'false'}"><span class="discord-scope-title">全频道</span><span class="discord-scope-mark" aria-hidden="true">${allAccessible ? '●' : '○'}</span><span class="discord-scope-desc">自动识别 Bot 可访问的文字与公告频道。</span></button>
        </div>
        <div class="field discord-channel-field" id="cfgChannelIdsField"${allAccessible ? ' style="display:none"' : ''}><label>频道 ID<span class="required">*</span></label><textarea class="input" id="cfgChannelIds" rows="3" placeholder="多个频道 ID 用逗号或换行分隔，最多 50 个">${esc(Array.isArray(channels) ? channels.join('\n') : channels)}</textarea></div>
        <div class="discord-all-channels-note" id="cfgAllChannelsNote"${allAccessible ? '' : ' style="display:none"'}>只采集该 Guild 中 Bot 已授权可见的文字与公告频道；不采集分类、语音、舞台、论坛、媒体、私密或无权限频道。</div>
        <input type="hidden" id="cfgChannelScope" value="${allAccessible ? 'all_accessible' : 'selected'}">
      </div>
      <div class="detail-block discord-source-info-block">
        <div class="detail-label">来源信息</div>
        <div class="field"><label>Guild ID<span class="required">*</span></label><input class="input" id="cfgGuildId" inputmode="numeric" value="${esc(guildId)}" placeholder="服务器 ID"></div>
      </div>
      <div class="detail-block discord-security-block">
        <div class="detail-label">授权与同步</div>
        <div class="field"><label>Bot Token${creating ? '<span class="required">*</span>' : ''}</label><input class="input" id="cfgDiscordToken" type="password" autocomplete="new-password" placeholder="${creating ? '请输入 Bot Token' : configured ? '已配置；留空保持不变' : '请输入 Bot Token'}"></div>
        <div class="discord-toggle-list">
          <label class="toggle"><input type="checkbox" id="cfgIncludeThreads" ${pick(discordConfig, 'includeThreads', 'include_threads') ? 'checked' : ''}><span class="track"></span><span>采集线程消息</span></label>
          <label class="toggle"><input type="checkbox" id="cfgIncludeReplies" ${pick(discordConfig, 'includeReplies', 'include_replies') !== false ? 'checked' : ''}><span class="track"></span><span>采集回复消息</span></label>
          <label class="toggle"><input type="checkbox" id="cfgHistorySyncEnabled" ${pick(discordConfig, 'historySyncEnabled', 'history_sync_enabled') !== false ? 'checked' : ''}><span class="track"></span><span>启用历史消息同步</span></label>
          <label class="toggle"><input type="checkbox" id="cfgAnonymizeAuthors" ${pick(discordConfig, 'anonymizeAuthors', 'anonymize_authors') ? 'checked' : ''}><span class="track"></span><span>匿名化作者</span></label>
        </div>
        <div class="field discord-retention-field"><label>保留天数</label><input class="input" id="cfgRetentionDays" type="number" min="0" max="3650" value="${esc(pick(discordConfig, 'retentionDays', 'retention_days') ?? 0)}"></div>
        <div class="sensitive-note">仅采集服务器管理员明确授权的 Guild 和范围。Token 只在提交时发送，编辑时不回显、不写入 URL 或浏览器存储；系统仅使用 Discord 官方 Bot REST API。</div>
        ${creating ? '' : '<div class="action-row" style="margin-top:12px"><button class="btn" id="btnCheckAuth">检测授权</button><button class="btn" id="btnCheckCapabilities">检测能力</button></div>'}
      </div>
      ${capabilityPanel(source)}
    </section>`;
  }
  return `<div class="detail-block"><div class="detail-label">平台账号</div><div class="field"><label>账号标识</label><input class="input" id="cfgAccountId" value="${esc(identity.id)}"></div><div class="notice">平台权限待审核 / 连接器未接入</div></div>`;
}
// 采集频率档位：TapTap 免登采集有 800ms/页自限流 + 聚合告警滑窗语义，最低 2 小时、默认 6 小时；其他平台保持原档位。
const TAPTAP_FREQ_OPTIONS = [[7200, '2 小时'], [21600, '6 小时（推荐）'], [43200, '12 小时'], [86400, '每天 1 次']];
const DEFAULT_FREQ_OPTIONS = [[900, '15 分钟'], [1800, '30 分钟'], [3600, '60 分钟'], [7200, '2 小时'], [86400, '1 天']];
function isTaptapSource(source) { return normalizedPlatform(source) === 'taptap'; }
function scheduleTimeOf(source) { return configOf(source).scheduleTime || '03:00'; }
function scheduleTimeField(source) {
  const freq = Number(source.frequency_seconds || source.frequencySeconds || 0);
  const hidden = freq !== 86400 ? ' style="display:none"' : '';
  return `<div class="field" id="scheduleTimeField"${hidden}><label>每日执行时刻（北京时间）</label><input class="input" id="cfgScheduleTime" type="time" value="${esc(scheduleTimeOf(source))}"><div class="subline" id="scheduleTimeHint"${hidden}>每天只抓取 1 次，聚合告警最多延迟 24 小时；默认 03:00 与大玩家日报任务错峰。</div></div>`;
}
function bindFrequencyControls(source) {
  const freq = $('#cfgFreq'); if (!freq || !isTaptapSource(source)) return;
  const toggle = () => { const daily = Number(freq.value) === 86400; if ($('#scheduleTimeField')) $('#scheduleTimeField').style.display = daily ? '' : 'none'; if ($('#scheduleTimeHint')) $('#scheduleTimeHint').style.display = daily ? '' : 'none'; };
  freq.addEventListener('change', toggle); toggle();
}
function frequencySelect(source) {
  const taptap = isTaptapSource(source);
  const options = taptap ? TAPTAP_FREQ_OPTIONS : DEFAULT_FREQ_OPTIONS;
  const current = Number(source.frequency_seconds || source.frequencySeconds || (taptap ? 21600 : 3600));
  const inList = options.some(([value]) => value === current);
  return `<select class="input" id="cfgFreq">${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}${!inList && current > 0 ? `<option value="${current}">当前 ${current} 秒（建议调整为 2 小时以上）</option>` : ''}</select>`;
}
function commonFields(source, creating) {
  const platform = normalizedPlatform(source);
  const selected = state.scope?.selected?.() || {};
  return `<div class="detail-block"><div class="detail-label">基础配置</div>${creating ? `<div class="field"><label>归属范围</label><input class="input" value="${esc([selected.regionLabel, selected.communityLabel].join(' / '))}" readonly></div><input type="hidden" id="cfgCommunity" value="${esc(selected.communityId)}"><input type="hidden" id="cfgPlatform" value="${esc(platform)}"><div class="field"><label>平台</label><input class="input" value="${esc(platformLabel(platform))}" readonly></div>` : ''}<div class="field"><label>采集源名称<span class="required">*</span></label><input class="input" id="cfgName" value="${esc(source.display_name || source.displayName || '')}"></div><div class="field"><label>${isTaptapSource(source) ? '抓取频率' : '采集频率'}</label>${frequencySelect(source)}</div>${isTaptapSource(source) ? scheduleTimeField(source) : ''}</div>`;
}
function syncControls(source) { const available = ACTIONABLE.has(normalizedPlatform(source)); const running = STAGES.some(([scope]) => stageState(source, scope) === 'running'); const paused = STAGES.some(([scope]) => stageState(source, scope) === 'paused'); const reason = syncUnavailableReason(source); const syncAllowed = !reason; return `<div class="detail-block"><div class="detail-label">同步控制</div><div class="action-row"><button class="btn primary" id="btnRunSync" title="${esc(reason || '提交任务并自动启用采集源')}" ${syncAllowed ? '' : 'disabled'}>${esc(syncActionLabel(source, true))}</button><button class="btn" id="btnPauseSync" ${syncAllowed && available && running ? '' : 'disabled'}>暂停</button><button class="btn" id="btnResumeSync" ${syncAllowed && available && paused ? '' : 'disabled'}>继续</button><button class="btn danger" id="btnResetSync" ${syncAllowed && canSchedule(source) ? '' : 'disabled'}>授权范围全量回溯</button></div>${reason ? `<div class="subline action-reason">${esc(reason)}</div>` : '<div class="subline">开始同步后将自动启用该采集源，并进入周期调度。</div>'}</div>`; }

  function setCommonValues(source) { $('#cfgFreq').value = String(source.frequency_seconds || source.frequencySeconds || (isTaptapSource(source) ? 21600 : 3600)); if ($('#cfgScheduleTime')) $('#cfgScheduleTime').value = scheduleTimeOf(source); if ($('#cfgSyncMode')) $('#cfgSyncMode').value = sourceMode(source); if ($('#cfgHistoryStart')) $('#cfgHistoryStart').value = historyStartOf(source); bindFrequencyControls(source); }
function openCreateDrawer() {
  const selected = state.scope?.selected?.() || {};
  const platform = Status.normalizePlatform($('[data-po-platform-select]')?.value || $('#platformFilter')?.value || selected.platform || 'bigplayer_h5');
  if (platform !== 'taptap' && !selected.communityId) return toast('新增采集源前请选择具体社区');
  if (platform !== 'taptap' && selected.communityStatus !== 'enabled') return toast(selected.communityStatus === 'disabled' ? `社区「${selected.communityLabel}」已停用，不能新增采集源` : '请选择已启用社区');
  if (platform === 'facebook') {
    const facebookSource = { community_id: selected.communityId, region_code: selected.regionCode, platform, display_name: 'Last Night Facebook', enabled: false, frequency_seconds: 3600, config: { baseUrl: FACEBOOK_DEFAULT_URL, syncMode: 'backfill', historyStart: FACEBOOK_ALL_HISTORY_START }, canManage: selected.canManage, canEdit: selected.canEdit, canWrite: selected.canWrite };
    if (!facebookScopeAllowed(facebookSource)) return toast('Facebook 采集源仅支持境外 Last Night 社区');
    if (!facebookCanManage(facebookSource)) return toast('当前账号仅有查看权限');
    stopValidationWork({ clearSource: true }); renderFacebookDetail(facebookSource, true); $('#drawerMask').classList.add('open'); return;
  }
  const source = { community_id: selected.communityId, platform, display_name: defaultSourceName(platform, selected.communityId), enabled: true, frequency_seconds: platform === 'taptap' ? 21600 : 3600, sync_mode: 'incremental', history_start: '' };
  if (platform === 'bigplayer_h5' && selected.regionCode === 'overseas' && String(selected.communityId) === OVERSEAS_LAST_NIGHT_COMMUNITY_ID) { source.base_url = OVERSEAS_LAST_NIGHT_BASE_URL; source.start_paths = ['/']; state.h5AuthMode = 'token'; }
  const captureNonSensitive = () => { source.community_id = $('#cfgCommunity')?.value || source.community_id; source.display_name = $('#cfgName')?.value || ''; source.frequency_seconds = Number($('#cfgFreq')?.value || 3600); source.base_url = $('#cfgBaseUrl')?.value || ''; source.platform_account_id = $('#cfgAccountId')?.value || ''; };
  const render = () => {
    const isDiscord = platform === 'discord';
    $('#drawerContent').innerHTML = `<div class="drawer-header${isDiscord ? ' drawer-header--discord' : ''}"><div><h2>新增采集源</h2>${isDiscord ? '<div class="drawer-header-subtitle">先设定采集边界，再填写连接凭据。</div>' : ''}</div></div><div class="drawer-body${isDiscord ? ' drawer-body--discord' : ''}">${isDiscord ? `${platformPanel(source, true)}${commonFields(source, true)}` : `${commonFields(source, true)}${platformPanel(source, true)}`}</div><div class="drawer-footer"><button class="btn primary" id="btnCreate">创建</button><button class="btn" id="btnCancel">取消</button></div>`;
    setCommonValues(source); if ($('#cfgBaseUrl')) $('#cfgBaseUrl').value = source.base_url || source.baseUrl || ''; if ($('#cfgAccountId')) $('#cfgAccountId').value = source.platform_account_id || ''; bindH5CredentialMode(source, true); bindDiscordChannelScope(); $('#btnCancel').onclick = closeDrawer; $('#btnCreate').onclick = createSource;
  };
  stopValidationWork(); render(); $('#drawerMask').classList.add('open');
}
function validateSocialCredentials(required) { const phone = $('#cfgPhone')?.value.trim() || ''; const password = $('#cfgPassword')?.value || ''; const confirmation = $('#cfgPasswordConfirm')?.value || ''; if (required && !/^1[3-9]\d{9}$/.test(phone)) return { error: '请填写有效的 +86 中国大陆手机号' }; if (required && !password) return { error: '请填写登录密码' }; if (password !== confirmation) return { error: '两次输入的密码不一致' }; return { phone: required ? phone : '', password }; }
async function createSource() {
  if (state.creating) return; const selected = state.scope?.selected?.() || {}; const platform = Status.normalizePlatform($('#cfgPlatform').value); const selectedScope = state.scope?.selected?.() || {}; const payload = { communityId: $('#cfgCommunity').value || selectedScope.communityId, platform, displayName: $('#cfgName').value.trim(), enabled: true, frequencySeconds: Number($('#cfgFreq').value), syncMode: $('#cfgSyncMode')?.value || 'incremental', historyStart: $('#cfgHistoryStart')?.value || '' }; if (platform === 'taptap' && payload.frequencySeconds === 86400) payload.scheduleTime = $('#cfgScheduleTime')?.value || '03:00';
  if (!payload.communityId) return toast('请选择具体且已启用的社区');
  if (selected.communityStatus && selected.communityStatus !== 'enabled') return toast(`社区「${selected.communityLabel}」已停用，不能新增采集源`); if (!payload.displayName) return toast('请填写采集源名称'); if (!Number.isInteger(payload.frequencySeconds) || payload.frequencySeconds <= 0) return toast('请选择有效的采集频率');
  if (platform === 'bigplayer_h5') {
  const sourceIsOverseas = isOverseasLastNight({ community_id: payload.communityId, platform });
    payload.baseUrl = sourceIsOverseas ? OVERSEAS_LAST_NIGHT_BASE_URL : $('#cfgBaseUrl').value.trim(); if (!payload.baseUrl) return toast('请填写站点地址');
    if (state.h5AuthMode === 'token') { payload.apiToken = $('#cfgToken')?.value || ''; }
    else { const account = $('#cfgH5Account')?.value.trim() || ''; const password = $('#cfgH5Password')?.value || ''; const confirmPassword = $('#cfgH5PasswordConfirm')?.value || ''; const validation = Status.validateH5CredentialUpdate({ account, password, confirmPassword, creating: true }); if (validation.error) return toast(validation.error); payload.account = validation.credential.account; payload.password = validation.credential.password; payload.confirmPassword = validation.credential.confirmPassword; }
  }
  else if (platform === 'discord') {
    const guildId = $('#cfgGuildId')?.value.trim() || '';
    const channelScope = $('#cfgChannelScope')?.value || 'selected';
    const channelIds = channelScope === 'all_accessible' ? [] : parseAccountIds($('#cfgChannelIds')?.value || '');
    const token = $('#cfgDiscordToken')?.value.trim() || '';
    if (!/^\d{15,22}$/.test(guildId)) return toast('请填写有效的 Discord Guild ID');
    if (channelScope !== 'all_accessible' && !channelIds.length) return toast('请填写至少一个 Discord 频道 ID，或切换为全频道');
    if (channelIds.length > 50 || channelIds.some(id => !/^\d{15,22}$/.test(id))) return toast('Discord 频道 ID 必须为 15–22 位数字，最多 50 个');
    if (!token) return toast('请填写 Discord Bot Token');
    Object.assign(payload, { guildId, channelScope, channelIds, apiToken: token, includeThreads: Boolean($('#cfgIncludeThreads')?.checked), includeReplies: Boolean($('#cfgIncludeReplies')?.checked), historySyncEnabled: Boolean($('#cfgHistorySyncEnabled')?.checked), anonymizeAuthors: Boolean($('#cfgAnonymizeAuthors')?.checked), retentionDays: Number($('#cfgRetentionDays')?.value || 0) });
  }
  else { payload.platformAccountId = $('#cfgAccountId').value.trim(); if (!payload.platformAccountId) return toast('请填写平台账号标识'); }
  const button = $('#btnCreate'); state.creating = true; button.disabled = true; button.textContent = '创建中...';
  try { const created = await api('/sources', { method: 'POST', body: JSON.stringify(payload) }); if (platform === 'taptap' && (payload.keywords || []).length) await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ communityId: payload.communityId, platform, groups: [{ name: 'TapTap 采集关键词', keywords: payload.keywords }] }) }); const index = state.sources.findIndex(item => String(item.id) === String(created.id)); if (index >= 0) state.sources[index] = created; else state.sources.push(created); renderRows(); toast(Status.isSocialLoginPlatform(platform) ? '采集源已创建，等待登录验证' : index >= 0 ? '已有采集源已完成配置' : '采集源已创建'); closeDrawer(); await load(); }
  catch (error) { toast(error.code === 'SOURCE_ALREADY_EXISTS' ? '同名采集源已存在，请在列表中点击“管理”进行配置' : `创建失败：${error.message}`); }
  finally { state.creating = false; if (button?.isConnected) { button.disabled = false; button.textContent = '创建'; } }
}
function detailHeader(source) { const meta = sourceLoginMeta(source); const auth = sourceAuthDisplay(source); const isH5 = normalizedPlatform(source.platform) === 'bigplayer_h5'; const displayStatus = isH5 && auth === 'configured_pending_verification' ? authDisplayLabel(source) : meta.label; return `<h2>${esc(source.display_name || source.displayName || platformLabel(source.platform))}</h2><div class="subline" style="margin-bottom:8px">${esc(platformLabel(source.platform))} · ${esc(pick(source, 'community_name', 'communityName') || sourceCommunity(source).name || '-')}${Status.isSocialLoginPlatform(source.platform) || isH5 ? ` · <span class="pill ${isH5 ? esc(auth) : meta.tone}">${esc(displayStatus)}</span>` : ` · <span class="pill ${esc(auth)}">${esc(authDisplayLabel(source))}</span>`}</div>`; }
function validationPanel(source) {
  const isH5 = normalizedPlatform(source.platform) === 'bigplayer_h5';
  const needsLoginValidation = Status.needsLoginValidation(source, h5AuthMode(source));
  if (!needsLoginValidation) return '<div class="validation-empty">Token 授权无需登录会话验证，可直接检测接口授权和同步能力。</div>';
  const meta = Status.loginMeta(state.loginStatus || source); const status = state.loginStatus || {}; const checkedAt = pick(status, 'checkedAt', 'checked_at', 'updatedAt', 'updated_at');
  return `<div class="detail-label">${isH5 ? 'H5 授权验证工作区' : '登录验证工作区'}</div><div class="status-summary"><div class="status-cell"><div class="subline">当前状态</div><b><span class="pill ${meta.tone}">${meta.label}</span></b></div><div class="status-cell"><div class="subline">最近检测</div><b>${esc(formatTime(checkedAt))}</b></div></div><div class="challenge-message">${esc(pick(status, 'message', 'instruction') || (meta.state === 'healthy' ? '授权状态正常，可执行能力检测和采集。' : '点击“检测授权”检查凭据和会话。'))}</div><div id="challengeArea">${renderChallenge()}</div><div class="action-row" style="margin-top:14px"><button class="btn primary" id="btnCheckLogin">检测授权</button>${meta.state === 'healthy' ? '<button class="btn danger" id="btnLogout">注销会话</button>' : ''}</div>`;
}
function renderChallenge() {
  const challenge = state.challenge; if (!challenge) return '<div class="validation-empty" style="min-height:180px;margin-top:14px">暂无进行中的验证挑战</div>';
  const meta = Status.challengeMeta(challenge); const imageUrl = pick(challenge, 'imageUrl', 'image_url', 'qrCodeUrl', 'qr_code_url', 'assetUrl', 'asset_url', 'displayRef'); const expiresAt = pick(challenge, 'expiresAt', 'expires_at'); const remaining = Status.secondsRemaining(expiresAt);
  return `<div class="detail-block"><div class="source-with-dot"><b>${esc(meta.label)}</b><span class="countdown" id="challengeCountdown">${Status.formatCountdown(remaining)}</span></div><div class="challenge-message">${esc(pick(challenge, 'instruction', 'message') || '请按平台提示完成验证。')}</div>${imageUrl ? `<img class="challenge-media" src="${esc(imageUrl)}" alt="${esc(meta.label)}">` : ''}${meta.acceptsCode ? '<input class="input challenge-code" id="challengeCode" autocomplete="one-time-code" placeholder="请输入验证码">' : ''}<div class="action-row">${meta.acceptsCode ? '<button class="btn primary" id="btnSubmitChallenge">提交验证</button>' : ''}<button class="btn danger" id="btnCancelChallenge">取消验证</button></div></div>`;
}
async function openDrawer(id) {
  const source = state.sources.find(item => String(item.id) === String(id)); if (!source) return; stopValidationWork(); state.activeSourceId = String(id); state.loginStatus = null; state.challenge = null; const serial = ++state.requestSerial;
  let detail = null;
  try {
    const response = await api(`/sources/${encodeURIComponent(id)}`);
    detail = Array.isArray(response) ? response[0] : response?.source || response;
  } catch (_) { /* Keep the list record usable when detail is unavailable. */ }
  if (serial !== state.requestSerial || state.activeSourceId !== String(id)) return;
  const editingSource = detail && String(detail.id) === String(id) ? Object.assign(source, detail, { platform: Status.normalizePlatform(detail.platform || source.platform) }) : source;
  const credential = h5Credential(editingSource); state.h5AuthMode = normalizedPlatform(editingSource.platform) === 'bigplayer_h5' && credential.hasPassword ? 'account_password' : 'token';
  const requiresStatus = Status.isSocialLoginPlatform(editingSource.platform) || (normalizedPlatform(editingSource.platform) === 'bigplayer_h5' && h5AuthMode(editingSource) === 'account_password');
  if (requiresStatus) { try { cacheLoginStatus(editingSource, await api(`/sources/${editingSource.id}/login-status`)); if (serial !== state.requestSerial || state.activeSourceId !== String(id)) return; const challenge = challengeOf(state.loginStatus); if (challenge) state.challenge = challenge; else if (Status.loginMeta(state.loginStatus).state === 'manual_verification') { try { state.challenge = await api(`/sources/${editingSource.id}/login/challenge`); } catch (_) { /* Status remains visible while challenge retrieval retries. */ } } } catch (error) { if (serial !== state.requestSerial) return; cacheLoginStatus(editingSource, { status: Status.loginStateOf(editingSource), message: error.message }); } }
  if (serial !== state.requestSerial) return; renderDetail(editingSource); $('#drawerMask').classList.add('open'); updateDeepLink(editingSource.id, $('#statusFilter')?.value || ''); startChallengeWork(editingSource);
}
function renderDetail(source) {
  if (normalizedPlatform(source) === 'facebook') return renderFacebookDetail(source);
  const isDiscord = normalizedPlatform(source) === 'discord';
  const content = isDiscord
    ? `<div class="drawer-header drawer-header--discord">${detailHeader(source)}</div><div class="drawer-body drawer-body--discord">${platformPanel(source)}${commonFields(source, false)}${syncControls(source)}</div>`
    : `<div class="drawer-header">${detailHeader(source)}</div><div class="drawer-body"><div class="detail-grid"><div class="detail-column">${commonFields(source, false)}${platformPanel(source)}${syncControls(source)}</div><div class="detail-column validation-column"><div class="validation-workspace">${validationPanel(source)}</div></div></div></div>`;
  $('#drawerContent').innerHTML = `${content}<div class="drawer-footer"><button class="btn primary" id="btnSaveSource">保存配置</button><button class="btn" id="btnCancel">关闭</button></div>`;
  setCommonValues(source); bindH5CredentialMode(source, false); bindDiscordChannelScope(); $('#btnSaveSource').onclick = () => saveSource(source); $('#btnCancel').onclick = closeDrawer; bindPlatformActions(source); bindSyncActions(source); bindValidationActions(source);
}
async function saveSource(source) {
  if (normalizedPlatform(source) === 'facebook') return submitFacebookSource(source, false);
  const patch = { displayName: $('#cfgName').value.trim(), frequencySeconds: Number($('#cfgFreq').value) }; if (normalizedPlatform(source) === 'taptap') patch.scheduleTime = patch.frequencySeconds === 86400 ? ($('#cfgScheduleTime')?.value || '03:00') : null;
  let credential;
  if (!patch.displayName) return toast('请填写采集源名称'); if (!Number.isInteger(patch.frequencySeconds) || patch.frequencySeconds <= 0) return toast('请选择有效的采集频率');
  if (normalizedPlatform(source) === 'bigplayer_h5') {
    patch.baseUrl = isOverseasLastNight(source) ? OVERSEAS_LAST_NIGHT_BASE_URL : $('#cfgBaseUrl').value.trim(); if (!patch.baseUrl) return toast('请填写站点地址');
    const sourceIsOverseas = isOverseasLastNight(source);
    if (h5AuthMode(source) === 'token') {
      const token = ($('#cfgToken')?.value || '').trim();
      const configured = credentialConfigured(source);
      if (token && !isCredentialMask(token)) credential = { credentialType: 'api_token', secret: token };
      else if (configured) credential = {};
      else if (token) return toast('请输入有效 Token，不能使用脱敏占位符');
      else return toast('请先在编辑页配置 Token');
    }
    else { const account = $('#cfgH5Account')?.value.trim() || ''; const password = $('#cfgH5Password')?.value || ''; const confirmPassword = $('#cfgH5PasswordConfirm')?.value || ''; const validation = Status.validateH5CredentialUpdate({ account, password, confirmPassword }); if (validation.error) return toast(validation.error); credential = validation.credential || {}; }
  }
  else if (normalizedPlatform(source) === 'discord') {
    const guildId = $('#cfgGuildId')?.value.trim() || '';
    const channelScope = $('#cfgChannelScope')?.value || 'selected';
    const channelIds = channelScope === 'all_accessible' ? [] : parseAccountIds($('#cfgChannelIds')?.value || '');
    if (!/^\d{15,22}$/.test(guildId)) return toast('请填写有效的 Discord Guild ID');
    if (channelScope !== 'all_accessible' && (!channelIds.length || channelIds.length > 50 || channelIds.some(id => !/^\d{15,22}$/.test(id)))) return toast('请填写有效的 Discord 频道 ID，最多 50 个，或切换为全频道');
    patch.guildId = guildId; patch.channelScope = channelScope; patch.channelIds = channelIds; patch.includeThreads = Boolean($('#cfgIncludeThreads')?.checked); patch.includeReplies = Boolean($('#cfgIncludeReplies')?.checked); patch.historySyncEnabled = Boolean($('#cfgHistorySyncEnabled')?.checked); patch.anonymizeAuthors = Boolean($('#cfgAnonymizeAuthors')?.checked); patch.retentionDays = Number($('#cfgRetentionDays')?.value || 0);
    const token = ($('#cfgDiscordToken')?.value || '').trim();
    if (token && !isCredentialMask(token)) credential = { credentialType: 'api_token', secret: token };
    else if (!credentialConfigured(source)) return toast('请先配置 Discord Bot Token');
  }
  else if (!ACTIONABLE.has(normalizedPlatform(source))) patch.platformAccountId = $('#cfgAccountId').value.trim();
  if ((normalizedPlatform(source) === 'bigplayer_h5' || normalizedPlatform(source) === 'discord') && credential && Object.keys(credential).length) patch.credential = credential;
  try {
    if (normalizedPlatform(source) === 'bigplayer_h5' || normalizedPlatform(source) === 'taptap' || normalizedPlatform(source) === 'discord') {
      try { await api(`/sources/${source.id}/configuration`, { method: 'PATCH', body: JSON.stringify(patch) }); }
      catch (error) { throw new Error(`基础配置保存失败：${error.message}`); }
      if (normalizedPlatform(source) === 'taptap') { const keywords = [...new Set(String($('#cfgKeywords')?.value || '').split(/[,，\n\r]+/).map(item => item.trim()).filter(Boolean))]; await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ communityId: source.community_id || source.communityId, platform: 'taptap', groups: [{ groupName: 'TapTap 采集关键词', keywords }] }) }); }
    } else {
      await api(`/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    }
    toast('配置已保存'); closeDrawer(); await load();
  } catch (error) { toast(`保存失败：${error.message}`); }
}
function sourceActionReason(reason) {
  return {
    DISCORD_TOKEN_INVALID: 'Discord Bot Token 无效、已撤销或已过期，请在 Discord 开发者后台重新生成后保存',
    DISCORD_SCOPE_FORBIDDEN: 'Discord Bot 无权访问配置的服务器或频道，请检查 Bot 是否已加入服务器及权限',
    DISCORD_SCOPE_NOT_FOUND: 'Discord Guild 或频道不存在，或当前 Bot 无法访问该资源',
    DISCORD_NO_ACCESSIBLE_CHANNELS: 'Discord Guild 中没有可访问的文本频道或公告频道',
    DISCORD_RATE_LIMITED: 'Discord API 当前限流，请稍后重试'
  }[reason] || reason;
}

function bindPlatformActions(source) { if ($('#btnCheckAuth')) $('#btnCheckAuth').onclick = event => runSourceAction(source, 'check-auth', '授权检测完成', {}, { keepOpen: true, button: event.currentTarget }); if ($('#btnCheckCapabilities')) $('#btnCheckCapabilities').onclick = event => runSourceAction(source, 'check-capabilities', '能力检测完成', {}, { keepOpen: true, button: event.currentTarget }); }
function bindSyncActions(source) { const actions = { btnPauseSync: ['sync/pause', {}, '同步已暂停'], btnResumeSync: ['sync/resume', {}, '同步已继续'] }; if ($('#btnRunSync')) $('#btnRunSync').onclick = event => startSync(source, event.currentTarget, sourceMode(source)); Object.entries(actions).forEach(([id, [path, body, message]]) => { if ($(`#${id}`)) $(`#${id}`).onclick = () => runSourceAction(source, path, message, body); }); if ($('#btnResetSync')) $('#btnResetSync').onclick = () => { if (confirm('确认从历史起点重新抓取授权范围内的全部 Feed、帖子、评论和回复？当前运行会保留为审计记录。')) runSourceAction(source, 'sync/reset', '授权范围全量回溯已提交', {}); }; }
function bindValidationActions(source) { if ($('#btnCheckLogin')) $('#btnCheckLogin').onclick = () => checkLogin(source); if ($('#btnLogout')) $('#btnLogout').onclick = () => logout(source); if ($('#btnSubmitChallenge')) $('#btnSubmitChallenge').onclick = () => submitChallenge(source); if ($('#btnCancelChallenge')) $('#btnCancelChallenge').onclick = () => cancelChallenge(source); }
async function checkLogin(source) { const serial = ++state.authSerial; try { cacheLoginStatus(source, await api(`/sources/${source.id}/login/check`, { method: 'POST', body: '{}' })); if (serial !== state.authSerial || state.activeSourceId !== String(source.id)) return; state.challenge = challengeOf(state.loginStatus); if (!state.challenge && Status.loginMeta(state.loginStatus).state === 'manual_verification') state.challenge = await api(`/sources/${source.id}/login/challenge`); if (serial !== state.authSerial || state.activeSourceId !== String(source.id)) return; renderDetail(source); startChallengeWork(source); renderRows(); toast(Status.loginMeta(state.loginStatus).state === 'healthy' ? '授权验证通过' : '授权检测已完成'); } catch (error) { if (serial === state.authSerial) toast(`授权检测失败：${error.message}`); } }
async function submitChallenge(source) { const code = $('#challengeCode')?.value.trim(); if (!code) return toast('请输入验证码'); const serial = ++state.authSerial; try { const result = await api(`/sources/${source.id}/login/challenge/submit`, { method: 'POST', body: JSON.stringify({ challengeId: pick(state.challenge, 'id', 'challengeId', 'challenge_id'), code }) }); if (serial !== state.authSerial || state.activeSourceId !== String(source.id)) return; cacheLoginStatus(source, result.loginStatus || result.login_status || result); state.challenge = challengeOf(result); renderDetail(source); startChallengeWork(source); renderRows(); toast('验证信息已提交'); } catch (error) { if (serial === state.authSerial) toast(`提交失败：${error.message}`); } }
async function pollChallenge(source) { if (!state.challenge || state.activeSourceId !== String(source.id)) return; const serial = ++state.authSerial; try { const result = await api(`/sources/${source.id}/login/challenge/poll`, { method: 'POST', body: JSON.stringify({ challengeId: pick(state.challenge, 'id', 'challengeId', 'challenge_id') }) }); if (serial !== state.authSerial || state.activeSourceId !== String(source.id)) return; cacheLoginStatus(source, result.loginStatus || result.login_status || state.loginStatus); state.challenge = challengeOf(result) || (Status.loginMeta(state.loginStatus).state === 'manual_verification' ? state.challenge : null); renderDetail(source); startChallengeWork(source); renderRows(); } catch (error) { if (serial === state.authSerial) { stopChallengeTimers(); toast(`验证状态刷新失败：${error.message}`); } } }
async function cancelChallenge(source) { try { await api(`/sources/${source.id}/login/challenge/cancel`, { method: 'POST', body: JSON.stringify({ challengeId: pick(state.challenge, 'id', 'challengeId', 'challenge_id') }) }); state.challenge = null; stopChallengeTimers(); renderDetail(source); toast('验证已取消'); } catch (error) { toast(`取消失败：${error.message}`); } }
async function logout(source) { if (!confirm('确认注销该采集源的当前登录会话？')) return; try { await api(`/sources/${source.id}/logout`, { method: 'POST', body: '{}' }); cacheLoginStatus(source, { status: 'pending_verification', message: '会话已注销，请重新检测登录。' }); state.challenge = null; renderDetail(source); renderRows(); toast('登录会话已注销'); } catch (error) { toast(`注销失败：${error.message}`); } }
function startChallengeWork(source) { stopChallengeTimers(); if (!state.challenge) return; const meta = Status.challengeMeta(state.challenge); const expiresAt = pick(state.challenge, 'expiresAt', 'expires_at'); const tick = () => { const remaining = Status.secondsRemaining(expiresAt); const element = $('#challengeCountdown'); if (element) element.textContent = Status.formatCountdown(remaining); if (!remaining) { stopChallengeTimers(); state.challenge = null; if ($('#challengeArea')) $('#challengeArea').innerHTML = '<div class="validation-empty" style="min-height:180px;margin-top:14px">验证已超时，请重新检测登录。</div>'; } }; tick(); state.timer = setInterval(tick, 1000); if (meta.polls) state.poller = setInterval(() => pollChallenge(source), 3000); }
function stopChallengeTimers() { if (state.timer) clearInterval(state.timer); if (state.poller) clearInterval(state.poller); state.timer = null; state.poller = null; }
function stopValidationWork({ clearSource = false } = {}) { stopChallengeTimers(); state.requestSerial += 1; state.authSerial += 1; if (clearSource) { state.activeSourceId = ''; state.loginStatus = null; state.challenge = null; } }
const syncController = SyncProgress.createController({
  request: async (kind, args) => {
    if (kind === 'run') return api(`/sync-runs/${encodeURIComponent(args.runId)}`);
    const params = new URLSearchParams({ scope: 'posts', after: String(args.after || 0), limit: String(args.limit || 50) });
    return api(`/sync-runs/${encodeURIComponent(args.runId)}/contents?${params}`);
  },
  onChange: renderRows,
  onTerminal: async () => { await loadSources(); }
});
function updateSyncDeepLink(sourceId, runId) { const params = new URLSearchParams(window.location.search); if (sourceId) params.set('syncSourceId', sourceId); else params.delete('syncSourceId'); if (runId) params.set('syncRunId', runId); else params.delete('syncRunId'); history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`); }
function openSyncPanel(sourceId, runId, status) { if (!sourceId || !runId) return; syncController.open(sourceId, runId, status); updateSyncDeepLink(sourceId, runId); }
function collapseSyncPanel() { state.syncRecoverySerial += 1; syncController.stop(); updateSyncDeepLink('', ''); renderRows(); }
async function recoverSyncPanel() {
  const params = new URLSearchParams(window.location.search); const sourceId = params.get('syncSourceId'); if (!sourceId || syncController.state.sourceId) return;
  const serial = ++state.syncRecoverySerial; let runId = params.get('syncRunId'); let run;
  try {
    if (runId) {
      run = await api(`/sync-runs/${encodeURIComponent(runId)}`);
      const latest = await api(`/sources/${encodeURIComponent(sourceId)}/sync-runs/latest`);
      const latestRun = latest?.run || latest;
      const latestId = pick(latestRun, 'id', 'runId', 'run_id');
      if (latestId && String(latestId) !== String(runId)) {
        run = latest;
        runId = latestId;
      }
    } else {
      run = await api(`/sources/${encodeURIComponent(sourceId)}/sync-runs/latest`); runId = pick(run?.run || run, 'id', 'runId', 'run_id');
    }
    if (serial !== state.syncRecoverySerial || !runId) return;
    openSyncPanel(sourceId, runId, pick(run?.run || run, 'status', 'state', 'syncStatus', 'sync_status'));
  } catch (error) {
    if (serial === state.syncRecoverySerial) { updateSyncDeepLink('', ''); toast(`同步进度恢复失败：${error.message}`); }
  }
}

async function startSync(source, button, mode = source && sourceMode(source)) {
  if (!source || state.syncingSourceId) return;
  const reason = syncUnavailableReason(source); if (reason) return toast(reason);
  const serial = ++state.syncSerial; state.syncingSourceId = String(source.id); clearToast(); const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = '提交中…'; }
  try { const result = await api(`/sources/${source.id}/sync`, { method: 'POST', body: JSON.stringify({ mode: mode === 'backfill' ? 'backfill' : 'incremental' }) }); if (serial !== state.syncSerial) return; const run = result.run || result.syncRun || result.sync_run || result; const runId = pick(run, 'id', 'runId', 'run_id'); const status = pick(run, 'status', 'state', 'syncStatus', 'sync_status') || 'running'; if (!runId) throw new Error('同步服务未返回 runId'); closeDrawer(); openSyncPanel(source.id, runId, status); toast('同步任务已提交，采集源已启用'); }
  catch (error) { if (serial !== state.syncSerial) return; clearToast(); if (normalizedPlatform(source) === 'facebook') { toast(facebookErrorMessage(error)); return; } try { const latest = await api(`/sources/${encodeURIComponent(source.id)}/sync-runs/latest`); if (serial !== state.syncSerial) return; const run = latest?.run || latest; const latestId = pick(run, 'id', 'runId', 'run_id'); if (latestId) { openSyncPanel(source.id, latestId, pick(run, 'status', 'state', 'syncStatus', 'sync_status')); toast('同步任务已提交，正在读取最新进度'); return; } } catch (_) { /* Keep the original error when no run can be recovered. */ } toast(`同步失败：${error.message}`); }
  finally { if (serial === state.syncSerial) { state.syncingSourceId = ''; if (button?.isConnected) { button.disabled = false; button.textContent = originalText; } renderRows(); } }
}
async function runSourceAction(source, path, message, body = {}, options = {}) {
  if (normalizedPlatform(source) === 'facebook' && !facebookCanManage(source)) return toast('当前账号仅有查看权限');
  const keepOpen = Boolean(options.keepOpen);
  const button = options.button;
  const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = '检测中…'; }
  try {
    const result = await api(`/sources/${source.id}/${path}`, { method: 'POST', body: JSON.stringify(body) });
    const failed = path === 'check-auth'
      ? result?.authStatus !== 'authorized'
      : path === 'check-capabilities'
        ? result?.authorized === false || capabilityStatuses(result).includes('unauthorized')
        : false;
    if (failed) {
      const reason = result?.reason || Object.entries(result?.capabilities || {}).filter(([, value]) => { const status = typeof value === 'object' ? pick(value, 'status', 'capability') : value; return status === 'unauthorized'; }).map(([key, value]) => `${key}: ${typeof value === 'object' ? pick(value, 'status', 'capability') : value}`).join('，');
      toast(`检测未通过：${sourceActionReason(reason || '当前账号未授权')}`);
    } else {
      toast(message);
    }
    if (keepOpen) {
      const params = exactSourceParams(source);
      const refreshed = await api(`/sources?${params}`);
      const next = sourceItems(refreshed).find(item => String(item.id) === String(source.id));
      const index = state.sources.findIndex(item => String(item.id) === String(source.id));
      if (index >= 0 && next && String(next.id) === String(state.sources[index].id)) state.sources[index] = { ...state.sources[index], ...next, platform: Status.normalizePlatform(next.platform || state.sources[index].platform) };
      if (next && state.activeSourceId === String(source.id)) renderDetail(state.sources[index] || next);
      renderRows();
    } else {
      closeDrawer();
      await load();
    }
  } catch (error) {
    toast(`操作失败：${error.message}`);
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = originalText; }
  }
}
function updateDeepLink(sourceId, status) { const params = new URLSearchParams(window.location.search); if (sourceId) params.set('sourceId', sourceId); else params.delete('sourceId'); if (status) params.set('status', status); else params.delete('status'); history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`); }
function closeDrawer() { stopValidationWork({ clearSource: true }); $('#drawerMask').classList.remove('open'); updateDeepLink('', $('#statusFilter')?.value || ''); }
function sourceItems(response) {
  const value = response?.data ?? response;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
}
function exactSourceParams(source) {
  const scope = state.scope?.query?.() || new URLSearchParams();
  const params = new URLSearchParams();
  const values = {
    sourceId: source?.id || state.activeSourceId || new URLSearchParams(window.location.search).get('sourceId'),
    regionCode: scope.get('regionCode') || pick(source, 'region_code', 'regionCode'),
    communityId: scope.get('communityId') || pick(source, 'community_id', 'communityId'),
    platform: Status.normalizePlatform(scope.get('platform') || source?.platform)
  };
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
  return params;
}
async function loadSources() {
  const serial = ++state.sourcesRequestSerial;
  state.sourcesLoading = true;
  state.sourcesError = '';
  $('#rows').innerHTML = '<tr><td colspan="8" class="empty">正在加载采集源...</td></tr>';
  try {
    const params = state.scope?.query?.() || new URLSearchParams();
    const response = await api(`/sources${params.toString() ? `?${params}` : ''}`);
    if (serial !== state.sourcesRequestSerial) return;
    state.sources = sourceItems(response).map(source => ({ ...source, platform: Status.normalizePlatform(source.platform) }));
  } catch (error) {
    if (serial !== state.sourcesRequestSerial) return;
    state.sources = [];
    state.sourcesError = error.message;
  } finally {
    if (serial !== state.sourcesRequestSerial) return;
    state.sourcesLoading = false;
    renderRows();
  }
}
async function load() { await loadSources(); openDeepLink(); await recoverSyncPanel(); }
function openDeepLink() { const params = new URLSearchParams(window.location.search); const status = params.get('status'); if (status && $('#statusFilter')) { $('#statusFilter').value = [...$('#statusFilter').options].some(option => option.value === status) ? status : ''; renderRows(); } const sourceId = params.get('sourceId'); if (sourceId && !state.sourcesLoading && !state.activeSourceId && state.sources.some(source => String(source.id) === sourceId)) openDrawer(sourceId); }
function updateAddButton() { const selected = state.scope?.selected?.() || {}; const platform = Status.normalizePlatform($('[data-po-platform-select]')?.value || $('#platformFilter')?.value || selected.platform || 'bigplayer_h5'); const tapTapReady = platform === 'taptap'; let enabled = tapTapReady || Boolean(selected.communityId && selected.communityStatus === 'enabled'); if (platform === 'facebook') enabled = enabled && facebookCanManage(selected) && facebookScopeAllowed({ community_id: selected.communityId, region_code: selected.regionCode }); $('#addBtn').disabled = !enabled; $('#addBtn').textContent = tapTapReady ? '+ 配置 TapTap' : '+ 新增采集源'; $('#addBtn').title = enabled ? tapTapReady ? '配置 TapTap 关键词和监控账号' : '在当前社区新增采集源' : platform === 'facebook' ? '仅具备管理权限时可在已启用的境外 Last Night 社区新增' : selected.communityStatus === 'disabled' ? `社区「${selected.communityLabel}」已停用` : '请先选择已启用社区'; }
function syncPlatformFilter() { const current = $('#platformFilter').value; const region = state.scope?.selected?.().regionCode || 'domestic'; const items = PublicOpinionScope.platformsForRegion(region); $('#platformFilter').innerHTML = '<option value="">全部平台</option>' + items.map(item => `<option value="${item.value}">${item.label}</option>`).join(''); $('#platformFilter').value = items.some(item => item.value === current) ? current : ''; }
function bind() { $('#refreshBtn').onclick = load; $('#addBtn').onclick = openCreateDrawer; $('#addBtn').disabled = true; $('#platformFilter').onchange = renderRows; $('#statusFilter').onchange = () => { renderRows(); updateDeepLink('', $('#statusFilter').value); }; $('#rows').onclick = event => { const manage = event.target.closest('[data-manage-source]'); if (manage) return openDrawer(manage.dataset.manageSource); const sync = event.target.closest('[data-sync-source]'); if (sync) return startSync(state.sources.find(source => String(source.id) === String(sync.dataset.syncSource)), sync); }; $('#rows').onchange = event => { const checkbox = event.target.closest('[data-toggle-source]'); if (checkbox) toggleSource(state.sources.find(source => String(source.id) === String(checkbox.dataset.toggleSource)), checkbox); }; $('#drawerClose').onclick = closeDrawer; $('#drawerMask').onclick = event => { if (event.target === $('#drawerMask')) closeDrawer(); }; document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); }); window.addEventListener('pagehide', () => { stopValidationWork(); state.syncRecoverySerial += 1; syncController.stop(false); }); }
bind(); (async () => { state.scope = await PublicOpinionScope.init({ host: '[data-po-scope]', onChange: async () => { closeDrawer(); syncPlatformFilter(); updateAddButton(); await loadSources(); openDeepLink(); } }); syncPlatformFilter(); updateAddButton(); await load(); })();
if (typeof globalThis !== 'undefined' && globalThis.__PUBLIC_OPINION_TEST__) Object.assign(globalThis.__PUBLIC_OPINION_TEST__, { sourceAuthDisplay, authDisplayLabel, detailHeader, renderRows, h5CredentialFields, credentialConfigured, isCredentialMask, runSourceAction, toggleSource, sourceItems, exactSourceParams, loadSources, openDeepLink, state });
if (typeof globalThis !== 'undefined' && globalThis.__PUBLIC_OPINION_TEST__) Object.assign(globalThis.__PUBLIC_OPINION_TEST__, { parseFacebookPageUrl, facebookCanManage, facebookReady, facebookUnavailableReason, facebookErrorMessage, facebookCapabilityDetail, facebookCapabilityAdvice, facebookStatusFields, facebookInitialSync, facebookForm, facebookFormPayload, facebookFormChanged, renderFacebookDetail, submitFacebookSource, checkFacebookSource, startSync, canSchedule, syncUnavailableReason });
