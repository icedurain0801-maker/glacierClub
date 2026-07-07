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
      <td>${v.id}</td><td>${v.code}</td><td>${v.game_name}</td>
      <td>${v.region}</td><td>${v.display_name}</td><td>${v.status}</td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="toolbar">
      <button class="btn" id="add-version-btn">+ 新建版本</button>
    </div>
    <table>
      <thead><tr><th>ID</th><th>code</th><th>游戏</th><th>地区</th><th>显示名</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">暂无版本</td></tr>'}</tbody>
    </table>`;

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
