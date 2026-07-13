window.pages = window.pages || {};

const CHUNK_SIZE = 5 * 1024 * 1024;

window.pages.knowledge = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中…</div>';
  let docs = [];
  try {
    docs = await window.api.apiFetch('/kb/documents', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${err.message}</div>`;
    return;
  }

  const rows = docs.map(d => `
    <tr>
      <td>${d.id}</td>
      <td><strong>${escapeHtml(d.name)}</strong></td>
      <td><span class="status ${d.status}">${escapeHtml(d.status)}</span></td>
      <td>${d.rowCount}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn small plain" data-preview="${d.id}">预览</button>
        <button class="btn small danger plain" data-del="${d.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">知识库管理</div>
        <div class="page-desc">上传 Excel/CSV,自动切分入库、向量化并抽取实体关系;C 端对话前自动检索。</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">上传文件</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="kb-file" accept=".xlsx,.xls,.csv" />
        <button class="btn" id="kb-upload">📤 上传并摄取</button>
        <span id="kb-progress" style="margin-left:8px;color:var(--text-secondary);font-size:13px;"></span>
      </div>
    </div>

    <div class="card" style="padding:0;">
      <div style="padding:16px 24px;font-size:15px;font-weight:600;">当前版本文档 <span style="color:var(--text-tertiary);font-weight:400;font-size:13px;">共 ${docs.length} 份</span></div>
      <table>
        <thead><tr>
          <th style="width:60px;">ID</th>
          <th>文件名</th>
          <th style="width:110px;">状态</th>
          <th style="width:80px;">行数</th>
          <th style="width:180px;">操作</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:40px;">暂无文档</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">🔍 检索测试</div>
      <div style="display:flex;gap:8px;">
        <input id="kb-q" type="text" placeholder="输入检索关键词..." style="flex:1;height:36px;" />
        <button class="btn" id="kb-search">检索</button>
      </div>
      <div id="kb-hits" style="margin-top:16px;"></div>
    </div>

    <div id="kb-detail"></div>`;

  document.getElementById('kb-upload').addEventListener('click', uploadFile);
  document.getElementById('kb-search').addEventListener('click', doSearch);
  document.getElementById('kb-q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  content.querySelectorAll('[data-preview]').forEach(b =>
    b.addEventListener('click', () => previewDoc(b.dataset.preview)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delDoc(b.dataset.del, content)));

  async function uploadFile() {
    const file = document.getElementById('kb-file').files[0];
    if (!file) return alert('请选择文件');
    const progress = document.getElementById('kb-progress');
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    progress.textContent = `准备上传 (${totalChunks} 片)…`;

    let init;
    try {
      init = await window.api.apiFetch('/kb/uploads/init', {
        method: 'POST', withVersion: true,
        body: { name: file.name, size: file.size, totalChunks },
      });
    } catch (err) { progress.textContent = '初始化失败: ' + err.message; return; }

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      const fd = new FormData();
      fd.append('index', i);
      fd.append('chunk', chunk, 'chunk' + i);
      const res = await fetch(
        (localStorage.getItem('apiBase') || 'http://localhost:3100') + `/api/kb/uploads/${init.uploadId}/chunk`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('token'),
            'X-Version-Id': localStorage.getItem('currentVersionId'),
          },
          body: fd,
        }
      );
      if (!res.ok) { progress.textContent = `分片 ${i} 上传失败`; return; }
      progress.textContent = `上传中 ${i + 1}/${totalChunks} 片`;
    }

    let done;
    try {
      done = await window.api.apiFetch(`/kb/uploads/${init.uploadId}/complete`, {
        method: 'POST', withVersion: true, body: {},
      });
    } catch (err) { progress.textContent = 'complete 失败: ' + err.message; return; }

    progress.textContent = '合并完成，摄取中…';
    pollJob(done.jobId, progress);
  }

  async function pollJob(jobId, progress) {
    for (let n = 0; n < 600; n++) {
      await new Promise(r => setTimeout(r, 1000));
      let j;
      try { j = await window.api.apiFetch(`/kb/jobs/${jobId}`, { withVersion: true }); }
      catch (err) { progress.textContent = '进度查询失败: ' + err.message; return; }
      progress.textContent = `摄取 ${j.processed}/${j.total} (${j.status})`;
      if (j.status === 'done') { window.pages.knowledge(content); return; }
      if (j.status === 'failed') { progress.textContent = '失败: ' + j.error; return; }
    }
    progress.textContent = '超时未完成';
  }

  async function previewDoc(id) {
    const detail = document.getElementById('kb-detail');
    detail.innerHTML = '<div class="card">加载中…</div>';
    try {
      const entries = await window.api.apiFetch(`/kb/entries?documentId=${id}&limit=20`, { withVersion: true });
      detail.innerHTML = `
        <div class="card">
          <div class="card-title">📄 条目预览 (前 20 条)</div>
          ${entries.map(e => `
            <div style="background:#fafafa;border:1px solid var(--border-secondary);border-radius:6px;padding:12px 14px;margin-bottom:8px;white-space:pre-wrap;font-size:13px;color:var(--text-secondary);">${escapeHtml(e.content)}</div>
          `).join('')}
        </div>`;
    } catch (err) { detail.innerHTML = `<div class="card">失败: ${err.message}</div>`; }
  }

  async function delDoc(id, contentEl) {
    if (!confirm('确认删除该文档及其全部知识条目？')) return;
    try {
      await window.api.apiFetch(`/kb/documents/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.knowledge(contentEl);
    } catch (err) { alert('删除失败: ' + err.message); }
  }

  async function doSearch() {
    const q = document.getElementById('kb-q').value.trim();
    const hits = document.getElementById('kb-hits');
    if (!q) return;
    hits.innerHTML = '<div style="color:var(--text-tertiary);">检索中…</div>';
    try {
      const rs = await window.api.apiFetch(`/kb/search?q=${encodeURIComponent(q)}&limit=10`, { withVersion: true });
      hits.innerHTML = rs.length === 0
        ? '<div style="color:var(--text-tertiary);padding:20px;text-align:center;">无匹配结果</div>'
        : rs.map((h, i) => `
            <div style="background:#fafafa;border:1px solid var(--border-secondary);border-radius:6px;padding:12px 14px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span class="tag primary">#${i + 1}</span>
                <span style="color:var(--text-tertiary);font-size:12px;">相似度 ${h.score.toFixed(4)}</span>
              </div>
              <div style="white-space:pre-wrap;font-size:13px;color:var(--text-secondary);">${escapeHtml((h.entry && h.entry.content) || '')}</div>
            </div>`).join('');
    } catch (err) { hits.innerHTML = `<div style="color:var(--danger);">检索失败: ${err.message}</div>`; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
