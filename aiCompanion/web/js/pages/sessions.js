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
      <td>${escapeHtml(s.title || '(无标题)')}</td>
      <td>${s.message_count}</td>
      <td>${new Date(s.updated_at).toLocaleString()}</td>
      <td>
        <button class="btn small" data-view="${s.id}">查看</button>
        <button class="btn small plain" data-del="${s.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="hint">当前版本会话列表(匿名会话,由前端 sessionKey 关联)。</div>
    <table>
      <thead><tr><th>ID</th><th>标题</th><th>消息数</th><th>最近活动</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无会话</td></tr>'}</tbody>
    </table>
    <div id="sess-detail" style="margin-top:20px;"></div>`;

  content.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => viewSession(b.dataset.view)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delSession(b.dataset.del)));

  async function viewSession(id) {
    const detail = document.getElementById('sess-detail');
    detail.innerHTML = '加载中…';
    try {
      const data = await window.api.apiFetch(`/sessions/${id}`, { withVersion: true });
      const msgs = data.messages.map(m => {
        const cls = m.role === 'assistant' ? 'bot' : 'user';
        const who = m.role === 'assistant' ? '机器人' : '用户';
        let refsHtml = '';
        if (m.refs_json) {
          try {
            const refs = typeof m.refs_json === 'string' ? JSON.parse(m.refs_json) : m.refs_json;
            if (refs && refs.length) refsHtml = `<div style="margin-top:6px;font-size:11px;color:#909399;">参考: ${refs.map(r => `#${r.entryId}(${r.score.toFixed(3)})`).join(' ')}</div>`;
          } catch { /* ignore */ }
        }
        return `<div class="msg ${cls}"><b>${who}:</b><br>${escapeHtml(m.content)}${refsHtml}</div>`;
      }).join('');
      detail.innerHTML = `<h4>会话 #${id} 详情</h4><div class="chat-body" style="max-width:100%;border:1px solid #ebeef5;border-radius:8px;">${msgs}</div>`;
    } catch (err) { detail.innerHTML = '失败: ' + err.message; }
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
