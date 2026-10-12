(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicOpinionContentHandling = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const methods = { notified: '已通知玩家', handled: '已处理', false_positive: '误判不予处理' };
  const isHandlingEligible = item => ['attention', 'negative', 'urgent'].includes(item.severity) && item.handling_eligible !== false;
  const selected = new Set();
  let options, pageIds = [], revision = 0, saving = false;
  const $ = selector => document.querySelector(selector);
  function shortenedNote(note) { const chars = [...String(note || '')]; return chars.length > 10 ? chars.slice(0, 10).join('') + '...' : chars.join(''); }
  function statusHtml(item, esc) {
    const processed = item.handling_status === 'processed';
    const eligible = isHandlingEligible(item);
    const note = String(item.handling_note || '');
    return `<span class="handling-status ${!eligible ? 'not-required' : processed ? 'processed' : 'pending'}"${processed && methods[item.handling_method] ? ` title="${esc(methods[item.handling_method])}"` : ''}>${!eligible ? '无需处理' : processed ? '已处理' : '待处理'}</span>${note ? `<div class="handling-note" title="${esc(note)}">${esc(shortenedNote(note))}</div>` : ''}`;
  }
  function checkboxHtml(item, esc) { const id = String(item.id), eligible = isHandlingEligible(item); return `<input type="checkbox" data-handling-id="${esc(id)}" aria-label="选择此条内容"${eligible ? (selected.has(id) ? ' checked' : '') : ' disabled title="无需处理"'}>`; }
  function updateSelection() {
    $('#batchHandleBtn').disabled = saving || selected.size === 0;
    $('#handlingSelectionCount').textContent = `已选择 ${selected.size} 条`;
    const all = $('#handlingSelectAll');
    if (all) { all.disabled = pageIds.length === 0; all.checked = pageIds.length > 0 && selected.size === pageIds.length; all.indeterminate = selected.size > 0 && selected.size < pageIds.length; }
  }
  function reset() {
    revision += 1; selected.clear(); pageIds = [];
    if ($('#batchHandlingDialog')?.open && !saving) $('#batchHandlingDialog').close();
    if (options) updateSelection();
  }
  function bindTable(items) {
    pageIds = items.filter(isHandlingEligible).map(item => String(item.id));
    for (const id of selected) if (!pageIds.includes(id)) selected.delete(id);
    $('#tableContent').querySelectorAll('[data-handling-id]').forEach(input => {
      input.onchange = () => { !input.disabled && pageIds.includes(input.dataset.handlingId) && input.checked ? selected.add(input.dataset.handlingId) : selected.delete(input.dataset.handlingId); if (input.disabled) input.checked = false; updateSelection(); };
    });
    const all = $('#handlingSelectAll');
    if (all) all.onchange = () => {
      selected.clear(); if (all.checked) pageIds.forEach(id => selected.add(id));
      $('#tableContent').querySelectorAll('[data-handling-id]').forEach(input => { input.checked = selected.has(input.dataset.handlingId); });
      updateSelection();
    };
    updateSelection();
  }
  function setBusy(value) {
    saving = value;
    ['#handlingSubmit', '#handlingCancel', '#handlingClose', '#handlingMethod', '#handlingNote'].forEach(selector => { $(selector).disabled = value; });
    $('#handlingSubmit').textContent = value ? '保存中…' : '确认处理';
    updateSelection();
  }
  function init(config) {
    options = config;
    $('.filterbar').insertAdjacentHTML('afterend', '<div class="batch-handling-bar"><button class="btn primary" type="button" id="batchHandleBtn" disabled>批量处理</button><span id="handlingSelectionCount">已选择 0 条</span></div>');
    document.body.insertAdjacentHTML('beforeend', `<dialog class="batch-handling-dialog" id="batchHandlingDialog" aria-labelledby="handlingDialogTitle"><form id="batchHandlingForm"><div class="handling-dialog-head"><h2 id="handlingDialogTitle">批量处理</h2><button type="button" id="handlingClose" aria-label="关闭批量处理弹窗">×</button></div><p id="handlingDialogCount"></p><label class="handling-field" for="handlingMethod"><span>处理方式 <b>*</b></span><select class="input" id="handlingMethod" required>${Object.entries(methods).map(([key, label]) => `<option value="${key}"${key === 'handled' ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label class="handling-field" for="handlingNote"><span>处理备注</span><textarea class="input" id="handlingNote" rows="4" placeholder="请输入处理备注（选填，最多 200 字符）"></textarea><small id="handlingNoteCount">0 / 200</small></label><div class="handling-form-error" id="handlingFormError" role="alert"></div><div class="handling-dialog-actions"><button type="button" class="btn" id="handlingCancel">取消</button><button type="submit" class="btn primary" id="handlingSubmit">确认处理</button></div></form></dialog>`);
    $('#batchHandleBtn').onclick = () => {
      if (!selected.size || saving) return;
      $('#handlingMethod').value = 'handled'; $('#handlingNote').value = ''; $('#handlingNoteCount').textContent = '0 / 200'; $('#handlingFormError').textContent = '';
      $('#handlingDialogCount').textContent = `将处理已勾选的 ${selected.size} 条内容`;
      $('#batchHandlingDialog').showModal();
    };
    const close = () => { if (!saving) $('#batchHandlingDialog').close(); };
    $('#handlingClose').onclick = close; $('#handlingCancel').onclick = close;
    $('#batchHandlingDialog').oncancel = event => { if (saving) event.preventDefault(); };
    $('#handlingNote').oninput = () => {
      const input = $('#handlingNote'), chars = [...input.value];
      if (chars.length > 200) input.value = chars.slice(0, 200).join('');
      $('#handlingNoteCount').textContent = `${[...input.value].length} / 200`;
    };
    $('#batchHandlingForm').onsubmit = async event => {
      event.preventDefault(); if (saving) return;
      const ids = [...selected], method = $('#handlingMethod').value, note = $('#handlingNote').value;
      if (!ids.length || !methods[method] || [...note].length > 200) { $('#handlingFormError').textContent = !ids.length ? '请先选择内容' : !methods[method] ? '请选择处理方式' : '处理备注最多 200 字符'; return; }
      const version = revision, query = options.state.scope?.query?.() || new URLSearchParams();
      $('#handlingFormError').textContent = ''; setBusy(true);
      try {
        const result = await options.api(`/contents/batch-handle?${query}`, { method: 'POST', body: JSON.stringify({ contentIds: ids, handlingMethod: method, handlingNote: note }) });
        $('#batchHandlingDialog').close();
        if (version === revision) { options.toast(`已处理 ${result.processedCount} 条内容`); await options.reload(); }
      } catch (error) {
        if (version === revision) $('#handlingFormError').textContent = `处理失败：${error.message}`;
        else $('#batchHandlingDialog').close();
      } finally { setBusy(false); }
    };
  }
  return { init, reset, bindTable, statusHtml, checkboxHtml, shortenedNote, isHandlingEligible };
});
