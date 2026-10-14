(function () {
  'use strict';
  const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const state = { configured: false, busy: false, job: null, timer: null, open: true };
  const root = document.getElementById('apiConfigRoot');
  if (!root) return;
  const $ = id => root.querySelector(`#${id}`);
  const labels = { L0: '无需处理', L1: '关注级', L2: '负面待处理', L3: '紧急告警' };
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path === '/config' ? '/api-config/typesafe' : '/typesafe-test' + path}`, { ...options, headers: { 'content-type': 'application/json' } });
    let body;
    try { body = await response.json(); } catch { throw new Error('服务响应异常，请刷新后重试'); }
    if (!response.ok) throw new Error(body.error?.message || `请求失败 (${response.status})`);
    return body.data ?? null;
  }
  function message(text, error = false) { $('typesafeMessage').textContent = text; $('typesafeMessage').classList.toggle('error', error); }
  function buttons() {
    const running = ['queued', 'running'].includes(state.job?.status);
    $('typesafeSave').disabled = state.busy || running;
    $('typesafeRun').disabled = state.busy || running || !state.configured || Boolean($('typesafeKey').value);
    $('typesafeRefresh').disabled = state.busy;
  }
  function config(value) {
    state.configured = Boolean(value.configured);
    $('typesafeConfigState').textContent = state.configured ? `密钥已保存，不回显。最近检测：${new Date(value.checkedAt).toLocaleString()}。更换密钥可重新填写并检测保存。` : '尚未配置；先检测并保存，才能运行测试。';
    $('typesafeKey').placeholder = state.configured ? '已配置；留空保留原密钥' : '请输入冰川GPT API Key';
    if ($('typesafeUsage')) $('typesafeUsage').textContent = value.autoAnalysisEnabled ? '已接管自动分析：新增帖子、评论和未完成任务均使用全局 TypeSafe 配置；原分析实现保留停用。' : '目前仅用于 TypeSafe 测试，尚未替换系统自动分析。';
    buttons();
  }
  function showJob(job) {
    state.job = job;
    $('typesafeRows').innerHTML = (job?.rows || []).map(row => {
      const result = row.result; const level = result?.final_level;
      return `<tr><td>${row.contentType === 'post' ? '帖子' : '评论'}</td><td>${escape(row.text)}</td><td>${escape(labels[row.existingLevel] || '未分析')}</td><td class="typesafe-${escape(level?.toLowerCase())}">${escape(labels[level] || (row.error ? '调用失败' : '待分析'))}</td><td>${result ? `${Math.round(result.confidence * 100)}%` : '—'}</td><td>${escape(result ? result.status === 'manual_review' ? '需人工复核' : '自动判定' : row.error || '等待执行')}</td></tr>`;
    }).join('');
    if (job) {
      const names = { running: '分析中', queued: '排队中', completed: '测试完成', completed_with_errors: '测试完成（部分失败）', interrupted: '测试中断', failed: '测试失败' };
      const changes = (job.rows || []).filter(row => row.result && row.existingLevel && row.existingLevel !== row.result.final_level).length;
      message(`${names[job.status] || job.status}：${job.completed}/${job.total}；成功 ${job.succeeded}，失败 ${job.failed}；与已有等级不同 ${changes} 条。${job.error || ''}`, ['interrupted', 'failed'].includes(job.status));
    } else message('尚未运行测试。已有等级仅作对比，不代表人工标准答案。');
    buttons();
    clearTimeout(state.timer);
    if (state.open && ['queued', 'running'].includes(job?.status)) state.timer = setTimeout(refresh, 3000);
  }
  async function refresh() {
    try { showJob(await request('/runs/latest')); }
    catch (error) { message(error.message, true); clearTimeout(state.timer); }
  }
  $('typesafeKey').oninput = buttons;
  $('typesafeSave').onclick = async () => {
    if (!$('typesafeKey').value.trim()) return message('请输入 API Key；已保存的密钥无需重复填写。', true);
    state.busy = true; buttons(); message('正在检测授权，检测通过后保存…');
    try {
      const payload = JSON.stringify({ apiKey: $('typesafeKey').value.trim() });
      $('typesafeKey').value = '';
      config(await request('/config', { method: 'PUT', body: payload })); message('授权检测通过，全局配置已保存，所有社区共享。可以运行50条测试。');
    } catch (error) { message(error.message, true); }
    finally { state.busy = false; buttons(); }
  };
  $('typesafeRun').onclick = async () => {
    state.busy = true; buttons(); message('正在选取样本并启动测试…');
    try { await request('/runs', { method: 'POST', body: '{}' }); await refresh(); }
    catch (error) { message(error.message, true); }
    finally { state.busy = false; buttons(); }
  };
  $('typesafeRefresh').onclick = refresh;
  window.addEventListener('pagehide', () => { state.open = false; clearTimeout(state.timer); $('typesafeKey').value = ''; });
  window.PublicOpinionAuth?.ready?.then(async session => {
    if (!session?.identity?.roles?.includes('admin')) { root.hidden = true; return; }
    root.hidden = false;
    try { config(await request('/config')); await refresh(); }
    catch (error) { message(error.message, true); }
  }).catch(() => {});
})();
