window.pages = window.pages || {};
window.pages.versions = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let list;
  try {
    list = await window.api.apiFetch('/versions');
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = list.map(v => `
    <tr>
      <td>${v.id}</td>
      <td><code>${v.code}</code></td>
      <td>${v.game_name}</td>
      <td>${v.region}</td>
      <td>${v.display_name}</td>
      <td><span class="status ${v.status}">${v.status}</span></td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">版本管理</div>
        <div class="page-desc">游戏×地区多租户，每个版本一套独立的会话、知识库、机器人。</div>
      </div>
      <button class="btn" id="add-version-btn">+ 新建版本</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th style="width:60px;">ID</th><th>Code</th><th>游戏</th><th>地区</th><th>显示名</th><th style="width:100px;">状态</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:40px;">暂无版本</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('add-version-btn').addEventListener('click', async () => {
    const gameName = prompt('游戏名（如：灯塔）'); if (!gameName) return;
    const region = prompt('地区（如：国内/海外）'); if (!region) return;
    const code = prompt('唯一 code（如：lighthouse_cn）'); if (!code) return;
    try {
      await window.api.apiFetch('/versions', { method: 'POST', body: { code, gameName, region } });
      window.pages.versions(content);
    } catch (err) { alert(err.message); }
  });
};
