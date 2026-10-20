(function () {
  'use strict';
  const API = window.PUBLIC_OPINION_API || '/api/public-opinion';
  const state = { busy: false };
  const root = document.getElementById('apiConfigRoot');
  if (!root) return;
  const $ = id => root.querySelector(`#${id}`);
  async function request(options = {}) {
    const response = await fetch(`${API}/api-config/typesafe`, { ...options, headers: { 'content-type': 'application/json' } });
    let body;
    try { body = await response.json(); } catch { throw new Error('服务响应异常，请刷新后重试'); }
    if (!response.ok) throw new Error(body.error?.message || `请求失败 (${response.status})`);
    return body.data ?? null;
  }
  function message(text, error = false) { $('typesafeMessage').textContent = text; $('typesafeMessage').classList.toggle('error', error); }
  function buttons() { $('typesafeSave').disabled = state.busy; }
  function config(value) {
    const configured = Boolean(value.configured);
    $('typesafeConfigState').textContent = configured ? `密钥已保存，不回显。最近检测：${new Date(value.checkedAt).toLocaleString()}。更换密钥可重新填写并检测保存。` : '尚未配置；请先检测并保存全局密钥。';
    $('typesafeKey').placeholder = configured ? '已配置；留空保留原密钥' : '请输入冰川GPT API Key';
    $('typesafeUsage').textContent = value.autoAnalysisEnabled ? '已接管自动分析：新增帖子、评论和未完成任务均使用全局 TypeSafe 配置；原分析实现保留停用。' : '尚未启用 TypeSafe 自动分析。';
    buttons();
  }
  $('typesafeSave').onclick = async () => {
    if (!$('typesafeKey').value.trim()) return message('请输入 API Key；已保存的密钥无需重复填写。', true);
    state.busy = true; buttons(); message('正在检测授权，检测通过后保存…');
    try {
      const payload = JSON.stringify({ apiKey: $('typesafeKey').value.trim() });
      $('typesafeKey').value = '';
      config(await request({ method: 'PUT', body: payload })); message('授权检测通过，全局配置已保存，所有社区共享。');
    } catch (error) { message(error.message, true); }
    finally { state.busy = false; buttons(); }
  };
  window.addEventListener('pagehide', () => { $('typesafeKey').value = ''; });
  window.PublicOpinionAuth?.ready?.then(async session => {
    if (!session?.identity?.roles?.includes('admin')) { root.hidden = true; return; }
    root.hidden = false;
    try { config(await request()); }
    catch (error) { message(error.message, true); }
  }).catch(() => {});
})();
