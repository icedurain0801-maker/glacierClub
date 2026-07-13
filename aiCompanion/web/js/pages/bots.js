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

  const versionId = localStorage.getItem('currentVersionId');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">机器人管理</div>
        <div class="page-desc">当前版本的机器人配置。修改后立即生效于 C 端对话。</div>
      </div>
      <a class="btn plain" style="text-decoration:none;" href="chat.html?versionId=${versionId}" target="_blank">🚀 打开 C 端对话</a>
    </div>

    <div class="card">
      <div class="card-title">🤖 基础人设</div>
      <table class="form-table">
        <tr><th>人设 (persona)</th>
            <td><textarea id="bot-persona" rows="6" style="width:100%;font-family:inherit;">${escapeHtml(cfg.persona || '')}</textarea>
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">机器人角色和风格的核心设定,作为 system prompt</div></td></tr>
        <tr><th>欢迎语 (welcome)</th>
            <td><input id="bot-welcome" type="text" style="width:100%;" value="${escapeHtml(cfg.welcome || '')}">
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">用户进入 C 端页面时的第一句问候</div></td></tr>
      </table>
    </div>

    <div class="card">
      <div class="card-title">📚 RAG 检索设置</div>
      <table class="form-table">
        <tr><th>启用 RAG</th>
            <td><label><input id="bot-rag" type="checkbox" ${cfg.ragEnabled ? 'checked' : ''}>回答前检索当前版本知识库</label></td></tr>
        <tr><th>检索条数</th>
            <td><input id="bot-topk" type="number" min="1" max="20" value="${cfg.ragTopK || 5}" style="width:100px;">
                <span style="color:var(--text-tertiary);margin-left:8px;font-size:13px;">1-20,建议 3-8</span></td></tr>
        <tr><th>历史轮数</th>
            <td><input id="bot-turns" type="number" min="1" max="50" value="${cfg.historyTurns || 10}" style="width:100px;">
                <span style="color:var(--text-tertiary);margin-left:8px;font-size:13px;">1-50,过大会占用上下文窗口</span></td></tr>
      </table>
    </div>

    <div class="card">
      <div class="card-title">⚙️ 高级</div>
      <table class="form-table">
        <tr><th>LLM 模型覆盖</th>
            <td><input id="bot-model" type="text" placeholder="留空使用 env 默认" value="${escapeHtml(cfg.model || '')}" style="width:280px;">
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">如 qwen-plus、gpt-4o-mini 等;留空则使用 LLM_MODEL 环境变量</div></td></tr>
      </table>
    </div>

    <div class="card" style="display:flex;align-items:center;gap:12px;">
      <button class="btn large" id="bot-save">💾 保存配置</button>
      <span id="bot-status" style="color:var(--text-secondary);font-size:13px;"></span>
    </div>`;

  document.getElementById('bot-save').addEventListener('click', async () => {
    const status = document.getElementById('bot-status');
    status.textContent = '保存中…';
    status.style.color = 'var(--text-secondary)';
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
      status.style.color = 'var(--success)';
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.style.color = 'var(--danger)';
    }
  });

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
