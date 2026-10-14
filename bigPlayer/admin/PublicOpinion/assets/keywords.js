const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const state = {
  groups: [], scope: null, editIndex: -1, draft: null, step: 0,
  demoMode: false, loadToken: 0, rulesLoadToken: 0,
  loadedCommunityId: null, loadedPlatform: null, rulesLoading: false, saving: false,
  wizardCommunityId: null
};
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEMO_STORAGE_KEY = 'public-opinion.keyword-rules.demo';
const platLabel = k => k ? PublicOpinionScope.platformLabel(k) : '社区级默认';
const platShort = k => k === null ? '社区级默认' : platLabel(k);
const winText = s => { const n = Number(s) || 0; return n % 3600 === 0 ? `${n / 3600} 小时` : `${Math.round(n / 60)} 分钟`; };

async function api(path, options = {}) {
  return state.scope && PublicOpinionScope.withScope ? PublicOpinionScope.withScope(path, options, rawApi) : rawApi(path, options);
}
async function rawApi(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'content-type': 'application/json' }, ...options });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) {
    const error = new Error('舆情服务返回了无法解析的响应');
    error.code = 'INVALID_RESPONSE';
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
let toastTimer = null;
function toast(message, type) {
  const el = $('#toast');
  const feedbackType = type || (/失败|无法|禁止|变化|须|请|至少|暂无社区/.test(message) ? 'error' : 'success');
  el.textContent = message;
  el.className = `toast show ${feedbackType}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function newDraft() {
  return { groupName: '', platform: currentScope().platform || 'bigplayer_h5', severity: 'attention', triggerMode: 'aggregate', windowSeconds: 1800, thresholdCount: 5, keywords: [] };
}
function normalize(g) {
  return { groupName: g.groupName || '', platform: g.platform === 'xhs' ? 'xiaohongshu' : (g.platform || currentScope().platform || 'bigplayer_h5'), severity: g.severity || 'attention', triggerMode: g.triggerMode || 'aggregate', windowSeconds: g.windowSeconds || 1800, thresholdCount: g.thresholdCount || 1, keywords: Array.isArray(g.keywords) ? g.keywords : [] };
}
function currentScope() { return state.scope?.selected?.() || {}; }
function currentCommunityId() { return currentScope().communityId || ''; }
function wizardOpen() { return $('#wizard').classList.contains('show'); }
function updateControls() {
  const selected = currentScope();
  const blocked = state.rulesLoading || state.saving || state.loadedCommunityId !== currentCommunityId() || !currentCommunityId() || selected.communityStatus !== 'enabled';
  $('#newRuleBtn').disabled = blocked;
  $('#saveAll').disabled = blocked;
  $('#refreshBtn').disabled = state.rulesLoading || state.saving;
}

/* ============ 列表 ============ */
function renderList() {
  const list = $('#ruleList');
  $('#ruleCount').textContent = `共 ${state.groups.length} 条`;
  const items = state.groups.map((g, idx) => {
    const trig = g.triggerMode === 'immediate' ? '<span class="tag imm">单条即报</span>' : '<span class="tag agg">滑窗聚合</span>';
    const sev = g.severity === 'urgent' ? '<span class="tag urgent">紧急</span>' : '<span class="tag attention">关注</span>';
    const plat = g.platform ? `<span class="tag plat">${esc(platShort(g.platform))}</span>` : '<span class="tag plat default">社区级默认</span>';
    const kws = g.keywords.slice(0, 5).map(k => `<span class="c">${esc(k)}</span>`).join('');
    const more = g.keywords.length > 5 ? `<span class="more">+${g.keywords.length - 5}</span>` : '';
    return `<div class="rule-item" data-idx="${idx}" role="button" tabindex="0" aria-label="编辑规则 ${esc(g.groupName || '未命名分组')}">
      <div class="ri-head"><span class="ri-name">${esc(g.groupName || '未命名分组')}</span><span class="ri-sub">${g.keywords.length} 个关键词</span></div>
      <div class="ri-tags">${trig}${sev}${plat}</div>
      <div class="ri-kws">${kws}${more || (g.keywords.length ? '' : '<span class="more">暂无关键词</span>')}</div>
      <button class="ri-del" data-del="${idx}" title="删除规则" aria-label="删除规则">×</button>
    </div>`;
  }).join('');
  list.innerHTML = state.rulesLoading
    ? '<div class="empty">正在加载关键词规则…</div>'
    : (state.scope && !state.scope.available() ? '<div class="empty">当前地区暂无可用社区</div>' : state.groups.length ? items : '<div class="empty">暂无关键词规则，点击右上「+ 新建规则」开始配置。</div>');
  $$('.rule-item').forEach(it => {
    it.onclick = e => { if (e.target.dataset.del !== undefined) return; openWizard(Number(it.dataset.idx)); };
    it.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === it) { e.preventDefault(); openWizard(Number(it.dataset.idx)); } };
  });
  $$('[data-del]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (state.saving) return;
      const i = Number(btn.dataset.del);
      state.groups.splice(i, 1);
      renderList();
      toast('已移除，点击「保存全部规则」写入');
    };
  });
  updateControls();
}

/* ============ 向导 ============ */
function openWizard(idx) {
  if (state.rulesLoading) return toast('规则正在加载，请稍候');
  if (!currentCommunityId() || currentScope().communityStatus !== 'enabled' || state.loadedCommunityId !== currentCommunityId()) return toast(currentScope().communityStatus === 'disabled' ? '当前社区已停用，仅可查看历史规则' : '请选择已启用社区后重载规则');
  state.editIndex = idx;
  state.draft = idx >= 0 ? clone(state.groups[idx]) : newDraft();
  state.wizardCommunityId = currentCommunityId();
  state.step = 0;
  $('#wizTitle').textContent = idx >= 0 ? '编辑规则' : '新建规则';
  renderPlatGrid();
  syncDraftToForm();
  renderStep();
  $('#wizMask').classList.add('show');
  $('#wizard').classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#wizClose').focus(), 0);
}
function closeWizard() {
  if (state.saving) return;
  $('#wizMask').classList.remove('show');
  $('#wizard').classList.remove('show');
  document.body.style.overflow = '';
  state.draft = null;
  state.editIndex = -1;
  state.wizardCommunityId = null;
}
function discardWizardForContextChange() {
  if (!wizardOpen()) return;
  $('#wizMask').classList.remove('show');
  $('#wizard').classList.remove('show');
  document.body.style.overflow = '';
  state.draft = null;
  state.editIndex = -1;
  state.wizardCommunityId = null;
  toast('社区已切换，未保存的规则草稿已取消');
}

function renderPlatGrid() {
  const platform = currentScope().platform || 'bigplayer_h5';
  state.draft.platform = platform;
  $('#platGrid').innerHTML = `<span class="tag plat">${esc(platShort(platform))}</span>`;
}
function syncDraftToForm() {
  const d = state.draft;
  renderKwBox();
  $('#fGroupName').value = d.groupName;
  $('#fWindow').value = String(d.windowSeconds || 1800);
  $('#fThreshold').value = d.thresholdCount || 5;
  $('#fSeverity').value = d.severity;
  updateTrigChoice();
}
function renderKwBox() {
  const box = $('#kwBox');
  box.innerHTML = state.draft.keywords.length
    ? state.draft.keywords.map(k => `<span class="chip">${esc(k)} <b data-kw="${esc(k)}">×</b></span>`).join('')
    : '<span class="ph">还没有关键词，在下面输入</span>';
  box.querySelectorAll('b[data-kw]').forEach(b => { b.onclick = () => { state.draft.keywords = state.draft.keywords.filter(k => k !== b.dataset.kw); renderKwBox(); renderPreview(); }; });
}
function addKeywords(raw) {
  const parts = String(raw).split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
  let added = 0;
  for (const p of parts) if (!state.draft.keywords.includes(p)) { state.draft.keywords.push(p); added++; }
  if (added) { renderKwBox(); renderPreview(); }
}
function updateTrigChoice() {
  const isImm = state.draft.triggerMode === 'immediate';
  $('#choiceImm').classList.toggle('on', isImm);
  $('#choiceAgg').classList.toggle('on', !isImm);
  $('#aggExtra').style.display = isImm ? 'none' : 'block';
  $('#sevWrap').style.display = isImm ? 'none' : 'block';
  $('#aggNote').innerHTML = `当前设置：<b>${winText(state.draft.windowSeconds)}</b>内命中 <b>≥${state.draft.thresholdCount || 1} 条</b> 时，合并推送<b>一次</b>钉钉告警；不足阈值不推送。`;
}
function renderStep() {
  for (let i = 0; i < 4; i++) {
    $('#pane' + i).classList.toggle('on', i === state.step);
    const s = $('#st' + i); s.classList.remove('on', 'done');
    if (i < state.step) s.classList.add('done'); else if (i === state.step) s.classList.add('on');
  }
  $('#wizPrev').style.visibility = state.step === 0 ? 'hidden' : 'visible';
  $('#wizNext').textContent = state.saving ? '保存中…' : (state.step === 3 ? '保存规则' : '下一步 →');
  $('#wizNext').disabled = state.saving;
  $('#wizPrev').disabled = state.saving;
  $('#wizCancel').disabled = state.saving;
  if (state.step === 2) $('#platNote').innerHTML = `当前规则归属 <b>${esc(platShort(state.draft.platform))}</b>，仅影响当前平台。`;
  if (state.step === 3) renderConfirm();
  renderPreview();
}
function renderConfirm() {
  const d = state.draft;
  const sev = d.triggerMode === 'immediate' ? '紧急' : (d.severity === 'urgent' ? '紧急' : '关注');
  const cond = d.triggerMode === 'immediate'
    ? `一旦命中任一关键词，<b>立即</b>推一次钉钉 <b>${sev}</b> 告警`
    : `当 <b>${winText(d.windowSeconds)}</b>内命中关键词累计 <b>≥${d.thresholdCount} 条</b>，合并推一次钉钉 <b>${sev}</b> 告警`;
  $('#confirmNote').innerHTML = `分组「<b>${esc(d.groupName || '未命名')}</b>」将在 <b>${esc(platShort(d.platform))}</b> 生效：<br>${cond}。`;
}
function renderPreview() {
  const d = state.draft;
  const isImm = d.triggerMode === 'immediate';
  const sev = isImm ? 'urgent' : d.severity;
  const sevLabel = sev === 'urgent' ? '紧急' : '关注';
  const pill = sev === 'urgent' ? 'u' : 'a';
  const kws = d.keywords.length ? d.keywords.map(k => `<span class="c">${esc(k)}</span>`).join('') : '<span class="c" style="opacity:.5">待添加</span>';
  const community = currentScope().community;
  const sum = isImm
    ? `只要 <span class="em">${esc(platShort(d.platform))}</span> 的帖子命中上面任一关键词，系统<span class="em">立即</span>推一次钉钉<span class="em">${sevLabel}</span>告警。`
    : `当 <span class="em">${winText(d.windowSeconds)}</span>内，${esc(platShort(d.platform))}帖子命中上面任一关键词累计 <span class="em">≥${d.thresholdCount} 条</span>，系统合并推一次钉钉<span class="em">${sevLabel}</span>告警，不重复打扰。`;
  $('#pvBody').innerHTML = `<div class="pvcard"><div class="bar">钉钉告警预览</div><div class="bd">
    <div class="pvline">社区：<b>${esc(community?.name || currentScope().communityLabel || '—')}</b></div>
    <div class="pvline">平台：<b>${esc(platShort(d.platform))}</b></div>
    <div class="pvline">分组：<b>${esc(d.groupName || '未命名')}</b></div>
    <div class="pvline">口径：<b>${isImm ? '单条即报' : '滑窗聚合'}</b></div>
    <div class="pvline">严重度：<span class="pvpill ${pill}">${sevLabel}</span></div>
    <div class="pvkw">${kws}</div></div></div><div class="pvsum">${sum}</div>`;
}
function validateStep() {
  const d = state.draft;
  if (state.step === 0) {
    if (!d.groupName.trim()) return '请给这组词起个名';
    if (!d.keywords.length) return '至少添加一个关键词';
  }
  if (state.step === 1 && d.triggerMode === 'aggregate') {
    if (!Number.isInteger(Number(d.thresholdCount)) || Number(d.thresholdCount) <= 0) return '阈值须为正整数';
    if (!Number.isInteger(Number(d.windowSeconds)) || Number(d.windowSeconds) <= 0) return '时间窗须为正整数';
  }
  return null;
}

/* ============ 数据与持久化 ============ */
function readDemoRules() {
  try {
    const value = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.map(normalize) : [];
  } catch (_) { return []; }
}
function leaveDemoMode() {
  state.demoMode = false;
  $('#modeBadge').classList.remove('show');
}
async function loadRules() {
  discardWizardForContextChange();
  const communityId = currentCommunityId();
  const token = ++state.rulesLoadToken;
  state.rulesLoading = true;
  const platform = currentScope().platform || 'bigplayer_h5';
  state.loadedCommunityId = null;
  state.loadedPlatform = null;
  state.groups = [];
  renderList();
  if (!communityId || !state.scope?.available()) {
    state.rulesLoading = false;
    renderList();
    return;
  }
  try {
    const data = await api(`/keyword-rules?${new URLSearchParams({ regionCode: currentScope().regionCode, communityId, platform })}`);
    if (token !== state.rulesLoadToken || currentCommunityId() !== communityId || currentScope().platform !== platform) return;
    leaveDemoMode();
    state.groups = (data || []).map(normalize);
    state.loadedCommunityId = communityId;
    state.loadedPlatform = platform;
    state.rulesLoading = false;
    renderList();
  } catch (e) {
    if (e.name === 'AbortError' || token !== state.rulesLoadToken || currentCommunityId() !== communityId) return;
    leaveDemoMode();
    state.groups = [];
    state.loadedCommunityId = null;
    state.rulesLoading = false;
    renderList();
    toast(`规则加载失败：${e.message}，已禁止保存`);
  }
}
function validateGroups(groups) {
  for (const g of groups) {
    if (!g.groupName.trim()) return '存在分组名称为空';
    if (!g.keywords.length) return `分组「${g.groupName}」至少需要一个关键词`;
    if (g.triggerMode === 'aggregate') {
      if (!Number.isInteger(Number(g.thresholdCount)) || Number(g.thresholdCount) <= 0) return `分组「${g.groupName}」阈值须为正整数`;
      if (!Number.isInteger(Number(g.windowSeconds)) || Number(g.windowSeconds) <= 0) return `分组「${g.groupName}」时间窗须为正整数`;
    }
  }
  return null;
}
async function persistGroups(groups) {
  const err = validateGroups(groups);
  if (err) throw new Error(err);
  const communityId = currentCommunityId();
  const platform = currentScope().platform || 'bigplayer_h5';
  if (!communityId || currentScope().communityStatus !== 'enabled' || state.loadedCommunityId !== communityId || state.loadedPlatform !== platform) throw new Error('社区或平台上下文已变化，请重新加载规则');
  const body = await api('/keyword-rules', { method: 'PUT', body: JSON.stringify({ regionCode: currentScope().regionCode, communityId, platform, groups: groups.map(group => ({ ...group, platform })) }) });
  return body.map(normalize);
}
async function commitDraft() {
  if (state.saving) return;
  if (!currentCommunityId() || currentScope().communityStatus !== 'enabled' || state.wizardCommunityId !== currentCommunityId() || state.loadedCommunityId !== currentCommunityId()) {
    return toast('社区上下文已变化，请关闭向导后重新操作');
  }
  const draft = clone(state.draft);
  if (draft.triggerMode === 'immediate') draft.severity = 'urgent';
  const nextGroups = state.groups.map(clone);
  if (state.editIndex >= 0) nextGroups[state.editIndex] = draft; else nextGroups.push(draft);
  state.saving = true;
  updateControls();
  renderStep();
  try {
    const saved = await persistGroups(nextGroups);
    state.groups = saved;
    state.saving = false;
    renderList();
    closeWizard();
    toast('规则已保存到数据库');
  } catch (e) {
    state.saving = false;
    updateControls();
    renderStep();
    toast(`保存失败：${e.message}`);
  }
}
async function saveAll() {
  if (state.saving) return;
  const communityId = currentCommunityId();
  if (!communityId || currentScope().communityStatus !== 'enabled' || state.loadedCommunityId !== communityId) return toast('当前社区规则尚未加载，无法保存');
  state.saving = true;
  updateControls();
  try {
    state.groups = await persistGroups(state.groups);
    renderList();
    toast('全部规则已保存到数据库');
  } catch (e) {
    toast(`保存失败：${e.message}`);
  } finally {
    state.saving = false;
    updateControls();
  }
}

/* ============ 绑定 ============ */
function bind() {
  $('#refreshBtn').onclick = loadRules;
  $('#saveAll').onclick = saveAll;
  $('#newRuleBtn').onclick = () => openWizard(-1);
  $('#wizClose').onclick = closeWizard;
  $('#wizCancel').onclick = closeWizard;
  $('#wizMask').onclick = closeWizard;
  $('#wizPrev').onclick = () => { if (!state.saving && state.step > 0) { state.step--; renderStep(); } };
  $('#wizNext').onclick = async () => {
    if (state.saving) return;
    const err = validateStep();
    if (err) return toast(err);
    if (state.step === 3) return commitDraft();
    state.step++;
    renderStep();
  };
  $('#kwAdd').onclick = () => { addKeywords($('#kwInput').value); $('#kwInput').value = ''; };
  $('#kwInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addKeywords($('#kwInput').value); $('#kwInput').value = ''; } };
  $('#kwInput').onpaste = e => { const t = (e.clipboardData || window.clipboardData).getData('text'); if (/[,，\n]/.test(t)) { e.preventDefault(); addKeywords(t); $('#kwInput').value = ''; } };
  $('#fGroupName').oninput = e => { state.draft.groupName = e.target.value; renderPreview(); };
  $('#choiceImm').onclick = () => { state.draft.triggerMode = 'immediate'; updateTrigChoice(); renderPreview(); };
  $('#choiceAgg').onclick = () => { state.draft.triggerMode = 'aggregate'; updateTrigChoice(); renderPreview(); };
  $$('.choice').forEach(choice => { choice.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choice.click(); } }; });
  $('#fWindow').onchange = e => { state.draft.windowSeconds = Number(e.target.value); updateTrigChoice(); renderPreview(); };
  $('#fThreshold').oninput = e => { state.draft.thresholdCount = Number(e.target.value); updateTrigChoice(); renderPreview(); };
  $('#fSeverity').onchange = e => { state.draft.severity = e.target.value; renderPreview(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && wizardOpen()) closeWizard(); });
}
bind();
renderList();
(async () => { state.scope = await PublicOpinionScope.init({ host: '[data-po-scope]', onChange: loadRules }); await loadRules(); })();
