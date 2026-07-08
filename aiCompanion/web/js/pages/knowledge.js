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
      <td>${d.name}</td>
      <td>${d.status}</td>
      <td>${d.rowCount}</td>
      <td>
        <button class="btn small" data-preview="${d.id}">预览</button>
        <button class="btn small plain" data-del="${d.id}">删除</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="toolbar">
      <input type="file" id="kb-file" accept=".xlsx,.xls,.csv" />
      <button class="btn" id="kb-upload">上传</button>
      <span id="kb-progress"></span>
    </div>
    <table>
      <thead><tr><th>ID</th><th>文件名</th><th>状态</th><th>行数</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">暂无文档</td></tr>'}</tbody>
    </table>

    <h3 style="margin-top:24px;">检索测试</h3>
    <div class="toolbar">
      <input id="kb-q" type="text" placeholder="输入检索词" style="flex:1;height:34px;padding:0 10px;border:1px solid #dcdfe6;border-radius:6px;" />
      <button class="btn" id="kb-search">检索</button>
    </div>
    <div id="kb-hits"></div>
    <div id="kb-detail"></div>`;

  document.getElementById('kb-upload').addEventListener('click', uploadFile);
  document.getElementById('kb-search').addEventListener('click', doSearch);
  content.querySelectorAll('[data-preview]').forEach(b =>
    b.addEventListener('click', () => previewDoc(b.dataset.preview)));
  content.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => delDoc(b.dataset.del, content)));

  async function uploadFile() {
    const file = document.getElementById('kb-file').files[0];
    if (!file) return alert('请选择文件');
    const progress = document.getElementById('kb-progress');
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    progress.textContent = `准备上传（${totalChunks} 片）…`;

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
      progress.textContent = `已上传 ${i + 1}/${totalChunks} 片`;
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
    for (let n = 0; n < 600; n++) {  // 最多轮询 10 分钟
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
    detail.innerHTML = '加载中…';
    try {
      const entries = await window.api.apiFetch(`/kb/entries?documentId=${id}&limit=20`, { withVersion: true });
      detail.innerHTML = '<h4>条目预览(前20)</h4>' +
        entries.map(e => `<div class="placeholder-box" style="padding:12px;text-align:left;white-space:pre-wrap;">${escapeHtml(e.content)}</div>`).join('');
    } catch (err) { detail.innerHTML = '失败: ' + err.message; }
  }

  async function delDoc(id, contentEl) {
    if (!confirm('确认删除该文档？')) return;
    try {
      await window.api.apiFetch(`/kb/documents/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.knowledge(contentEl);
    } catch (err) { alert('删除失败: ' + err.message); }
  }

  async function doSearch() {
    const q = document.getElementById('kb-q').value.trim();
    const hits = document.getElementById('kb-hits');
    if (!q) return;
    hits.innerHTML = '检索中…';
    try {
      const rs = await window.api.apiFetch(`/kb/search?q=${encodeURIComponent(q)}&limit=10`, { withVersion: true });
      hits.innerHTML = '<h4>检索结果</h4>' + (rs.length === 0 ? '(无匹配)' :
        rs.map(h => `<div class="placeholder-box" style="padding:12px;text-align:left;">
          <div style="color:#909399;font-size:12px;">score: ${h.score.toFixed(4)}</div>
          <div style="white-space:pre-wrap;">${escapeHtml((h.entry && h.entry.content) || '')}</div>
        </div>`).join(''));
    } catch (err) { hits.innerHTML = '检索失败: ' + err.message; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
};
