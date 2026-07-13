window.pages = window.pages || {};
window.pages.users = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let users, versions;
  try {
    users = await window.api.apiFetch('/users');
    versions = await window.api.apiFetch('/versions');
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = users.map(u => {
    const tags = u.isSuperAdmin
      ? '<span class="tag primary">全部版本</span>'
      : (u.versions.map(v =>
          `<span class="tag">${v.displayName} · ${v.role}` +
          ` <a href="#" data-revoke="${u.id}:${v.versionId}" title="取消授权">×</a></span>`).join('') || '<span style="color:var(--text-tertiary);">—</span>');
    const grantBtn = u.isSuperAdmin ? '' :
      `<button class="btn small plain" data-grant="${u.id}">授权版本</button>`;
    const typeTag = u.isSuperAdmin
      ? '<span class="tag danger">超管</span>'
      : '<span class="tag">普通</span>';
    return `<tr>
      <td>${u.id}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.displayName}</td>
      <td>${typeTag}</td>
      <td>${tags}</td>
      <td>${grantBtn}</td>
    </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">用户权限管理</div>
        <div class="page-desc">账号全局共享，按版本分别授权。超管拥有所有版本权限。</div>
      </div>
      <button class="btn" id="add-user-btn">+ 新建用户</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:60px;">ID</th>
          <th style="width:140px;">用户名</th>
          <th style="width:140px;">显示名</th>
          <th style="width:90px;">类型</th>
          <th>已授权版本</th>
          <th style="width:120px;">操作</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:40px;">暂无用户</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('add-user-btn').addEventListener('click', async () => {
    const username = prompt('用户名（3–64 位）'); if (!username) return;
    const password = prompt('密码（至少 6 位）'); if (!password) return;
    const displayName = prompt('显示名（可空）') || username;
    try {
      await window.api.apiFetch('/users', { method: 'POST', body: { username, password, displayName } });
      window.pages.users(content);
    } catch (err) { alert(err.message); }
  });

  content.querySelectorAll('[data-grant]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.grant;
      const opts = versions.map(v => `${v.id}=${v.display_name}`).join('\n');
      const versionId = prompt('输入要授权的版本 ID：\n' + opts); if (!versionId) return;
      const role = prompt('角色 admin / operator', 'operator') || 'operator';
      try {
        await window.api.apiFetch(`/users/${userId}/grant`, { method: 'POST', body: { versionId: parseInt(versionId, 10), role } });
        window.pages.users(content);
      } catch (err) { alert(err.message); }
    });
  });

  content.querySelectorAll('[data-revoke]').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const [userId, versionId] = a.dataset.revoke.split(':');
      if (!confirm('确认取消该授权？')) return;
      try {
        await window.api.apiFetch(`/users/${userId}/grant/${versionId}`, { method: 'DELETE' });
        window.pages.users(content);
      } catch (err) { alert(err.message); }
    });
  });
};
