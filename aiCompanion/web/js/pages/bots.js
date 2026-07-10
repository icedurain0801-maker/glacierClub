window.pages = window.pages || {};

window.pages.bots = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let cfg;
  try {
    cfg = await window.api.apiFetch('/bot', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  content.innerHTML = `
    <h3>当前版本机器人配置</h3>
    <div class="hint">每个版本一个机器人。人设、开关、检索参数在此配置。</div>
    <table style="margin-top:12px;">
      <tr><th style="width:120px;">人设(persona)</th>
          <td><textarea id="bot-persona" rows="6" style="width:100%;padding:8px;border:1px solid #dcdfe6;border-radius:6px;font:inherit;">${escapeHtml(cfg.persona || '')}</textarea></td></tr>
      <tr><th>欢迎语(welcome)</th>
          <td><input id="bot-welcome" type="text" style="width:100%;height:34px;padding:0 10px;border:1px solid #dcdfe6;border-radius:6px;" value="${escapeHtml(cfg.welcome || '')}"></td></tr>
      <tr><th>启用 RAG</th>
          <td><label><input id="bot-rag" type="checkbox" ${cfg.ragEnabled ? 'checked' : ''}> 回答前检索知识库</label></td></tr>
      <tr><th>RAG 条数</th>
          <td><input id="bot-topk" type="number" min="1" max="20" value="${cfg.ragTopK || 5}" style="width:80px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"> (1-20)</td></tr>
      <tr><th>历史轮数</th>
          <td><input id="bot-turns" type="number" min="1" max="50" value="${cfg.historyTurns || 10}" style="width:80px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"> (1-50)</td></tr>
      <tr><th>LLM model 覆盖</th>
          <td><input id="bot-model" type="text" placeholder="留空使用 env 默认" value="${escapeHtml(cfg.model || '')}" style="width:240px;height:30px;padding:0 8px;border:1px solid #dcdfe6;border-radius:6px;"></td></tr>
    </table>
    <div class="toolbar" style="margin-top:16px;">
      <button class="btn" id="bot-save">保存</button>
      <a class="btn plain" style="text-decoration:none;line-height:34px;padding:0 14px;" href="chat.html?versionId=${localStorage.getItem('currentVersionId')}" target="_blank">打开 C 端对话</a>
      <span id="bot-status" style="margin-left:12px;color:#909399;font-size:12px;"></span>
    </div>`;

  document.getElementById('bot-save').addEventListener('click', async () => {
    const status = document.getElementById('bot-status');
    status.textContent = '保存中…';
    try {
      await window.api.apiFetch('/bot', {
        method: 'PUT', withVersion: true,
        body: {
          persona: document.getElementById('bot-persona').value.trim(),
          welcome: document.getElementById('bot-welcome').value.trim(),
          ragEnabled: document.getElementById('bot-rag').checked,
          ragTopK: parseInt(document.getElementById('bot-topk').value, 10),
          historyTurns: parseInt(document.getElementById('bot-turns').value, 10),
          model: document.getElementById('bot-model').value.trim() || null,
        },
      });
      status.textContent = '✓ 已保存';
    } catch (err) { status.textContent = '保存失败: ' + err.message; }
  });

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
