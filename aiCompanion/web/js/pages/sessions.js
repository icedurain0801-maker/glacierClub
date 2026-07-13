window.pages = window.pages || {};

window.pages.sessions = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let list;
  try {
    list = await window.api.apiFetch('/sessions', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = list.map(s => `
    <tr>
      <td>${s.id}</td>
      <td><strong>${escapeHtml(s.title || '(无标题)')}</strong></td>
      <td><span class="tag primary">${s.message_count} 条</span></td>
      <td style="color:var(--text-secondary);font-size:13px;">${new Date(s.updated_at).toLocaleString()}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn small plain" data-view="${s.id}">查看</button>
        <button class="btn small danger plain" data-del="${s.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">会话管理</div>
        <div class="page-desc">C 端匿名用户的对话记录,按 sessionKey 关联。</div>
      </div>
    </div>

    <div class="card" style="padding:0;">
      <div style="padding:16px 24px;font-size:15px;font-weight:600;">
        当前版本会话 <span style="color:var(--text-tertiary);font-weight:400;font-size:13px;">共 ${list.length} 个</span>
      </div>
      <table>
        <thead><tr>
          <th style="width:60px;">ID</th>
          <th>标题</th>
          <th style="width:100px;">消息数</th>
          <th style="width:180px;">最近活动</th>
          <th style="width:160px;">操作</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:40px;">暂无会话</td></tr>'}</tbody>
      </table>
    </div>

    <div id="sess-detail" style="margin-top:16px;"></div>`;

  content.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => viewSession(b.dataset.view)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delSession(b.dataset.del)));

  async function viewSession(id) {
    const detail = document.getElementById('sess-detail');
    detail.innerHTML = '<div class="card">加载中…</div>';
    try {
      const data = await window.api.apiFetch(`/sessions/${id}`, { withVersion: true });
      const msgs = data.messages.map(m => {
        const cls = m.role === 'assistant' ? 'bot' : 'user';
        let refsHtml = '';
        if (m.refs_json) {
          try {
            const refs = typeof m.refs_json === 'string' ? JSON.parse(m.refs_json) : m.refs_json;
            if (refs && refs.length) refsHtml = `<div class="refs">参考: ${refs.map(r => `<span class="ref-item">#${r.entryId} (${r.score.toFixed(3)})</span>`).join('')}</div>`;
          } catch { /* ignore */ }
        }
        return `<div class="msg ${cls}"><div class="bubble">${escapeHtml(m.content)}</div>${refsHtml}</div>`;
      }).join('');
      detail.innerHTML = `
        <div class="card" style="padding:0;">
          <div style="padding:16px 24px;font-size:15px;font-weight:600;border-bottom:1px solid var(--border-secondary);">
            📃 会话 #${id} · ${escapeHtml(data.session.title || '(无标题)')}
          </div>
          <div class="chat-body inline" style="margin:16px;">${msgs || '<div style="color:var(--text-tertiary);text-align:center;padding:20px;">无消息</div>'}</div>
        </div>`;
    } catch (err) { detail.innerHTML = `<div class="card">失败: ${err.message}</div>`; }
  }

  async function delSession(id) {
    if (!confirm('确认删除该会话及全部消息?')) return;
    try {
      await window.api.apiFetch(`/sessions/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.sessions(content);
    } catch (err) { alert('删除失败: ' + err.message); }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
