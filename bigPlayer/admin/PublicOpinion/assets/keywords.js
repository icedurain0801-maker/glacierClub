'use strict';
const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
const $ = selector => document.querySelector(selector);
const levels = [['L0', '正常'], ['L1', '关注级'], ['L2', '紧急告警'], ['L3', '紧急告警·严重']];
let scope, loadedId = '', generation = 0, saving = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function raw(path, options = {}) {
  const response = await fetch(API + path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw Error(body.error?.message || body.message || `请求失败 (${response.status})`);
  return body.data ?? body;
}
const api = (path, options = {}) => scope?.withScope ? scope.withScope(path, options, raw) : raw(path, options);
const current = () => scope?.selected?.() || {};
const url = c => `/ai-analysis-policy?${new URLSearchParams({ regionCode: c.regionCode, communityId: c.communityId })}`;
function render(policy) {
  $('#policyRows').innerHTML = levels.map(([key, label]) => {
    const item = policy.levels[key];
    return `<tr data-level="${key}"><td><div class="level ${key === 'L2' || key === 'L3' ? 'l2' : ''}">${key}<small>${label}</small></div></td><td><select class="intensity" data-field="intensity" aria-label="${key}分析强度"><option value="off" ${item.intensity === 'off' ? 'selected' : ''}>关闭分析</option><option value="light" ${item.intensity === 'light' ? 'selected' : ''}>轻量分析</option><option value="deep" ${item.intensity === 'deep' ? 'selected' : ''}>深度分析</option></select></td><td><div class="ranges"><label><input type="checkbox" data-range="post" ${item.ranges.includes('post') ? 'checked' : ''}>帖子/动态</label><label><input type="checkbox" data-range="comment" ${item.ranges.includes('comment') ? 'checked' : ''}>评论</label></div></td><td><textarea class="rule" data-field="rule" aria-label="${key}判定规则" maxlength="2000">${esc(item.rule)}</textarea></td></tr>`;
  }).join('');
  const q = policy.quality || { enabled: true, ranges: ['post', 'comment'], minScore: 0.7, minBodyLength: 50, rule: '事实清晰、原创有用，包含具体游戏经验、可操作攻略或有依据的深入讨论。简短签到、空泛赞美、广告和无信息晒卡不推荐。' };
  $('#qualityPolicy').innerHTML = `<div class="card-head"><h2>优质内容</h2><label><input id="qualityEnabled" type="checkbox" ${q.enabled ? 'checked' : ''}> 启用优质内容筛选</label></div><div class="quality-fields"><label>最低 AI 质量评分<input id="qualityMinScore" aria-label="最低AI质量评分" type="number" min="0" max="1" step="0.01" value="${esc(q.minScore)}"></label><label>最低有效正文长度（字）<input id="qualityMinBodyLength" aria-label="最低有效正文长度" type="number" min="1" max="10000" step="1" value="${esc(q.minBodyLength)}"></label><div>筛选范围<div class="ranges">${[['post', '帖子/动态'], ['comment', '评论']].map(([key, label]) => `<label><input type="checkbox" data-quality-range="${key}" ${q.ranges.includes(key) ? 'checked' : ''}>${label}</label>`).join('')}</div></div><label class="quality-rule">优质内容判定规则<textarea id="qualityRule" class="rule" aria-label="优质内容判定规则" maxlength="2000">${esc(q.rule)}</textarea></label></div><p class="quality-note">剔除图片链接、普通 URL、HTML 标签后统计有效正文。固定排除负面内容，须有 AI 推荐标记才进入候选；不会自动采纳、置顶或加精。关闭筛选不影响舆情风险分析。新规则用于新分析和手动重判，历史候选不批量修改。</p>`;
}
function read() {
  const policy = { version: 1, levels: {} };
  document.querySelectorAll('tr[data-level]').forEach(row => {
    policy.levels[row.dataset.level] = {
      intensity: row.querySelector('[data-field="intensity"]').value,
      ranges: [...row.querySelectorAll('[data-range]:checked')].map(element => element.dataset.range),
      rule: row.querySelector('[data-field="rule"]').value.trim()
    };
  });
  policy.quality = {
    enabled: $('#qualityEnabled').checked,
    ranges: [...document.querySelectorAll('[data-quality-range]:checked')].map(element => element.dataset.qualityRange),
    minScore: $('#qualityMinScore').value === '' ? null : Number($('#qualityMinScore').value),
    minBodyLength: $('#qualityMinBodyLength').value === '' ? null : Number($('#qualityMinBodyLength').value),
    rule: $('#qualityRule').value.trim()
  };
  return policy;
}
async function load() {
  const c = current(), token = ++generation;
  loadedId = '';
  $('#savePolicy').disabled = true;
  $('#policyState').textContent = '读取中…';
  $('#policyMessage').textContent = '';
  $('#policyRows').innerHTML = '';
  $('#qualityPolicy').innerHTML = '';
  if (!c.communityId || !c.available) {
    $('#policyState').textContent = '暂无策略';
    $('#policyRows').innerHTML = '<tr><td colspan="4" style="padding:40px;text-align:center;color:#98a2b3">当前区域暂无可用社区</td></tr>';
    return;
  }
  try {
    const policy = await api(url(c));
    if (token !== generation || current().communityId !== c.communityId) return;
    render(policy);
    loadedId = c.communityId;
    $('#policyState').textContent = '当前线上策略';
    $('#savePolicy').disabled = saving;
  } catch (error) {
    if (token !== generation) return;
    $('#policyState').textContent = '读取失败';
    $('#policyMessage').textContent = error.message;
    $('#policyMessage').className = 'status err';
  }
}
async function save() {
  if (saving) return;
  const c = current(), token = generation;
  if (!loadedId || loadedId !== c.communityId) return;
  const policy = read();
  if (Object.values(policy.levels).some(item => !item.ranges.length || !item.rule)) return toast('每个等级至少选择一个范围，并填写判定规则', 'error');
  const q = policy.quality;
  if (!q.ranges.length || !q.rule || q.minScore === null || !Number.isFinite(q.minScore) || q.minScore < 0 || q.minScore > 1 || !Number.isInteger(q.minBodyLength) || q.minBodyLength < 1 || q.minBodyLength > 10000) return toast('请检查优质内容：至少一个范围、完整规则、0～1评分及1～10000整数正文长度', 'error');
  saving = true;
  $('#savePolicy').disabled = true;
  $('#policyMessage').textContent = '保存中…';
  try {
    await api(url(c), { method: 'PUT', body: JSON.stringify(policy) });
    if (token !== generation) return;
    $('#policyMessage').textContent = '已保存，下一次采集任务或手动重判时生效，历史候选不批量修改。';
    $('#policyMessage').className = 'status ok';
    toast('AI分析策略已保存');
  } catch (error) {
    if (token !== generation) return;
    $('#policyMessage').textContent = error.message;
    $('#policyMessage').className = 'status err';
    toast('保存失败：' + error.message, 'error');
  } finally {
    saving = false;
    $('#savePolicy').disabled = !loadedId;
  }
}
function toast(text, type) {
  const element = $('#toast');
  element.textContent = text;
  element.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { element.className = 'toast'; }, 3000);
}
(async () => { scope = await PublicOpinionScope.init({ host: '[data-po-scope]', onChange: load }); await load(); })();
$('#savePolicy').onclick = save;

window.PublicOpinionAIAnalysis = { read, current, api, ready: () => Boolean(loadedId && loadedId === current().communityId) };
