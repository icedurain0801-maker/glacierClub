window.pages = window.pages || {};

const CHUNK_SIZE = 5 * 1024 * 1024;
const KB_LOCALE_OPTIONS = [
  { value: '', label: '自动' },
  { value: 'zh-CN', label: '中文' },
  { value: 'zh-TW', label: '繁中' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日语' },
  { value: 'ko-KR', label: '韩语' },
];

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 100) return 100;
  return numeric;
}

function computeUploadProgress(doneChunks, totalChunks) {
  const total = Number(totalChunks) || 0;
  if (total <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, doneChunks / total));
  return 8 + (ratio * 32);
}

function computeImportProgress(job) {
  if (!job) return 45;
  if (job.status === 'done') return 100;

  const total = Number(job.total) || 0;
  const processed = Number(job.processed) || 0;
  if (total > 0) {
    const ratio = Math.min(1, Math.max(0, processed / total));
    return 45 + (ratio * 55);
  }

  if (job.status === 'failed') return 45;
  return 52;
}

function getImportStageLabel(status) {
  switch (status) {
    case 'pending':
      return '排队中';
    case 'processing':
    case 'parsing':
      return '解析中';
    case 'done':
      return '导入完成';
    case 'failed':
      return '导入失败';
    default:
      return '处理中';
  }
}

window.pages.knowledge = async function (content) {
  const pageToken = Symbol('knowledge-page-render');
  content.__knowledgePageToken = pageToken;
  const isCurrentKnowledgePage = () => content.__knowledgePageToken === pageToken;
  const previewState = { close: null };
  closePreviewImage();
  content.innerHTML = '<div class="placeholder-box">加载中...</div>';

  let docs = [];
  try {
    docs = await window.api.apiFetch('/kb/documents', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${escapeHtml(err.message)}</div>`;
    return;
  }

  const docsById = new Map(docs.map(doc => [String(doc.id), doc]));
  const uploadState = { busy: false };
  const docRows = docs.map(doc => `
    <tr>
      <td>${doc.id}</td>
      <td>
        <div style="font-weight:600;color:#111827;line-height:1.5;">${escapeHtml(doc.name)}</div>
        <div style="margin-top:4px;font-size:12px;color:#6b7280;">创建时间：${formatDate(doc.createdAt)}</div>
      </td>
      <td><span class="status ${doc.status}">${escapeHtml(doc.status)}</span></td>
      <td>${doc.rowCount || 0}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn small plain" data-preview="${doc.id}">预览</button>
        <button class="btn small plain" data-graph="${doc.id}" data-graph-name="${escapeHtml(doc.name)}">图谱</button>
        <button class="btn small danger plain" data-del="${doc.id}">删除</button>
      </td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">知识库管理</div>
        <div class="page-desc">上传 Excel/CSV 后自动切分入库、向量化、抽取图谱，并支持预览导入明细与图片。</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">上传文件</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="kb-file" accept=".xlsx,.xls,.csv" />
        <button class="btn" id="kb-upload">上传并导入</button>
        <span id="kb-progress" style="margin-left:8px;color:var(--text-secondary);font-size:13px;"></span>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#6b7280;line-height:1.6;">
        预览页会展示导入模式、工作表、Excel 行区间和关联图片，便于核对是否有内容被拆碎或遗漏。
      </div>
    </div>

    <div class="card" style="padding:0;">
      <div style="padding:16px 24px;font-size:15px;font-weight:600;">
        当前文档
        <span style="color:var(--text-tertiary);font-weight:400;font-size:13px;">共 ${docs.length} 份</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:60px;">ID</th>
            <th>文件名</th>
            <th style="width:110px;">状态</th>
            <th style="width:90px;">条目数</th>
            <th style="width:200px;">操作</th>
          </tr>
        </thead>
        <tbody>
          ${docRows || '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:40px;">暂无文档</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">检索测试</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="kb-q" type="text" placeholder="输入检索关键词..." style="flex:1;height:36px;" />
        <select id="kb-search-locale" style="width:110px;height:36px;">
          ${KB_LOCALE_OPTIONS.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
        </select>
        <button class="btn" id="kb-search">检索</button>
      </div>
      <div id="kb-hits" style="margin-top:16px;"></div>
    </div>

    <div id="kb-detail"></div>
  `;

  document.getElementById('kb-upload').addEventListener('click', uploadFile);
  renderUploadCard();
  document.getElementById('kb-search').addEventListener('click', doSearch);
  document.getElementById('kb-q').addEventListener('keydown', event => {
    if (event.key === 'Enter') doSearch();
  });

  content.querySelectorAll('[data-preview]').forEach(button => {
    button.addEventListener('click', () => previewDoc(button.dataset.preview));
  });
  content.querySelectorAll('[data-graph]').forEach(button => {
    button.addEventListener('click', () => openReadableGraph(button.dataset.graph, button.dataset.graphName));
  });
  content.querySelectorAll('[data-del]').forEach(button => {
    button.addEventListener('click', () => delDoc(button.dataset.del, content));
  });

  async function uploadFile() {
    const fileInput = document.getElementById('kb-file');
    const file = fileInput.files[0];
    if (!file) {
      alert('请选择文件');
      return;
    }

    const progress = document.getElementById('kb-progress');
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    progress.textContent = `准备上传（共 ${totalChunks} 片）`;

    let init;
    try {
      init = await window.api.apiFetch('/kb/uploads/init', {
        method: 'POST',
        withVersion: true,
        body: { name: file.name, size: file.size, totalChunks },
      });
    } catch (err) {
      progress.textContent = `初始化失败：${err.message}`;
      return;
    }

    for (let i = 0; i < totalChunks; i += 1) {
      const start = i * CHUNK_SIZE;
      const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      const formData = new FormData();
      formData.append('index', i);
      formData.append('chunk', chunk, `chunk-${i}`);
      const response = await fetch(
        `${localStorage.getItem('apiBase') || 'http://localhost:3100'}/api/kb/uploads/${init.uploadId}/chunk`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'X-Version-Id': localStorage.getItem('currentVersionId'),
          },
          body: formData,
        }
      );
      if (!response.ok) {
        progress.textContent = `第 ${i + 1} 片上传失败`;
        return;
      }
      progress.textContent = `上传中：${i + 1}/${totalChunks}`;
    }

    let done;
    try {
      done = await window.api.apiFetch(`/kb/uploads/${init.uploadId}/complete`, {
        method: 'POST',
        withVersion: true,
        body: {},
      });
    } catch (err) {
      progress.textContent = `合并失败：${err.message}`;
      return;
    }

    progress.textContent = '文件已合并，开始导入...';
    pollJob(done.jobId, progress);
  }

  async function pollJob(jobId, progress) {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!isCurrentKnowledgePage()) return;
      let job;
      try {
        job = await window.api.apiFetch(`/kb/jobs/${jobId}`, { withVersion: true });
      } catch (err) {
        progress.textContent = `进度查询失败：${err.message}`;
        return;
      }

      progress.textContent = `导入进度：${job.processed || 0}/${job.total || 0}（${job.status}）`;
      if (job.status === 'done') {
        window.pages.knowledge(content);
        return;
      }
      if (job.status === 'failed') {
        progress.textContent = `导入失败：${job.error || '未知错误'}`;
        return;
      }
    }
  }

  function enhanceUploadCard() {
    const originalInput = document.getElementById('kb-file');
    if (!originalInput) return;

    const uploadCard = originalInput.closest('.card');
    if (!uploadCard) return;

    uploadCard.innerHTML = `
      <div class="card-title">上传文件</div>
      <input type="file" id="kb-file" accept=".xlsx,.xls,.csv" hidden />
      <div class="kb-upload-dropzone" id="kb-dropzone" tabindex="0" role="button" aria-label="上传 Excel 或 CSV">
        <div class="kb-upload-dropzone__badge">Excel / CSV</div>
        <div class="kb-upload-dropzone__title">拖拽文件到这里，或点击选择文件</div>
        <div class="kb-upload-dropzone__desc">支持 .xlsx、.xls、.csv。选中文件后立即上传并开始解析，不再需要额外点一次导入。</div>
        <div class="kb-upload-dropzone__meta" id="kb-file-meta">当前未选择文件</div>
      </div>
      <div class="kb-upload-status">
        <div class="kb-upload-status__text" id="kb-progress">等待上传</div>
        <div class="kb-upload-status__tips">
          <span>支持拖拽</span>
          <span>自动解析</span>
          <span>保留图片预览</span>
        </div>
      </div>
    `;

    const fileInput = document.getElementById('kb-file');
    const dropzone = document.getElementById('kb-dropzone');
    const fileMeta = document.getElementById('kb-file-meta');
    const progress = document.getElementById('kb-progress');

    const setUploadStatus = ({ file, message, dragover, uploading, visible }) => {
      if (typeof dragover === 'boolean') {
        dropzone.classList.toggle('is-dragover', dragover);
      }
      if (typeof uploading === 'boolean') {
        dropzone.classList.toggle('is-uploading', uploading);
      }
      if (typeof file !== 'undefined') {
        fileMeta.textContent = file ? `${file.name} · ${formatFileSize(file.size)}` : '当前未选择文件';
      }
      if (typeof message === 'string') {
        progress.textContent = message;
      }
      if (typeof visible === 'boolean') {
        progress.dataset.visible = visible ? '1' : '0';
      }
    };

    const syncFileInput = file => {
      try {
        if (typeof DataTransfer === 'undefined') return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
      } catch (err) {
        console.warn('[knowledge] failed to sync dropped file into input:', err);
      }
    };

    const handleSelectedUpload = async file => {
      if (uploadState.busy) return;
      if (!file) {
        setUploadStatus({ file: null, message: '请选择 Excel 或 CSV 文件', visible: true });
        return;
      }
      if (!/\.(xlsx|xls|csv)$/i.test(file.name || '')) {
        setUploadStatus({ file: null, message: '仅支持 .xlsx、.xls、.csv 文件', uploading: false, visible: true });
        return;
      }

      uploadState.busy = true;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      setUploadStatus({
        file,
        message: `准备上传，共 ${totalChunks} 片`,
        dragover: false,
        uploading: true,
        visible: true,
      });

      let init;
      try {
        init = await window.api.apiFetch('/kb/uploads/init', {
          method: 'POST',
          withVersion: true,
          body: { name: file.name, size: file.size, totalChunks },
        });
      } catch (err) {
        uploadState.busy = false;
        setUploadStatus({ file, message: `初始化失败：${err.message}`, uploading: false, visible: true });
        return;
      }

      for (let i = 0; i < totalChunks; i += 1) {
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
        const formData = new FormData();
        formData.append('index', i);
        formData.append('chunk', chunk, `chunk-${i}`);
        const response = await fetch(
          `${localStorage.getItem('apiBase') || 'http://localhost:3100'}/api/kb/uploads/${init.uploadId}/chunk`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
              'X-Version-Id': localStorage.getItem('currentVersionId'),
            },
            body: formData,
          }
        );

        if (!response.ok) {
          uploadState.busy = false;
          setUploadStatus({ file, message: `第 ${i + 1} 片上传失败`, uploading: false, visible: true });
          return;
        }

        setUploadStatus({ file, message: `上传中：${i + 1}/${totalChunks}`, uploading: true, visible: true });
      }

      let done;
      try {
        done = await window.api.apiFetch(`/kb/uploads/${init.uploadId}/complete`, {
          method: 'POST',
          withVersion: true,
          body: {},
        });
      } catch (err) {
        uploadState.busy = false;
        setUploadStatus({ file, message: `合并失败：${err.message}`, uploading: false, visible: true });
        return;
      }

      setUploadStatus({ file, message: '文件已合并，开始解析…', uploading: true, visible: true });
      await pollUploadJob(done.jobId, file, setUploadStatus);
    };

    setUploadStatus({ file: null, message: '等待上传', dragover: false, uploading: false, visible: false });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleSelectedUpload(file);
    });

    dropzone.addEventListener('click', () => {
      if (uploadState.busy) return;
      fileInput.value = '';
      fileInput.click();
    });

    dropzone.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (uploadState.busy) return;
      fileInput.value = '';
      fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(type => {
      dropzone.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        if (uploadState.busy) return;
        setUploadStatus({ dragover: true });
      });
    });

    ['dragleave', 'dragend'].forEach(type => {
      dropzone.addEventListener(type, event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.relatedTarget && dropzone.contains(event.relatedTarget)) return;
        setUploadStatus({ dragover: false });
      });
    });

    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      setUploadStatus({ dragover: false });
      if (uploadState.busy) return;

      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;

      syncFileInput(file);
      handleSelectedUpload(file);
    });
  }

  function renderUploadCard() {
    enhanceUploadCard();

    const status = document.querySelector('.kb-upload-status');
    const progressText = document.getElementById('kb-progress');
    const dropzone = document.getElementById('kb-dropzone');
    if (!status || !progressText || !dropzone) return;
    if (status.querySelector('.kb-upload-progress')) return;

    const tips = status.querySelector('.kb-upload-status__tips');
    const progressBox = document.createElement('div');
    progressBox.className = 'kb-upload-progress';
    progressBox.innerHTML = `
      <div class="kb-upload-progress__track" aria-hidden="true">
        <div class="kb-upload-progress__fill"></div>
      </div>
      <div class="kb-upload-progress__meta">
        <span class="kb-upload-progress__stage">等待上传</span>
        <span class="kb-upload-progress__percent">0%</span>
      </div>
    `;

    if (tips) {
      status.insertBefore(progressBox, tips);
    } else {
      status.appendChild(progressBox);
    }

    const fill = progressBox.querySelector('.kb-upload-progress__fill');
    const stage = progressBox.querySelector('.kb-upload-progress__stage');
    const percent = progressBox.querySelector('.kb-upload-progress__percent');
    let lastPercent = 0;

    const applyProgress = next => {
      const safePercent = clampProgress(next.percent);
      lastPercent = safePercent;
      const visible = progressText.dataset.visible === '1';
      progressBox.classList.toggle('is-hidden', !visible);
      progressText.classList.toggle('is-hidden', !visible);
      if (!visible) return;
      progressBox.classList.toggle('is-indeterminate', Boolean(next.indeterminate));
      fill.style.width = `${safePercent}%`;
      stage.textContent = next.stage;
      percent.textContent = next.indeterminate ? '处理中' : `${Math.round(safePercent)}%`;
    };

    const readProgress = () => {
      const message = String(progressText.textContent || '').trim();
      const ratioMatch = message.match(/(\d+)\s*\/\s*(\d+)/);
      const statusMatch = message.match(/\b(pending|processing|parsing|done|failed)\b/);
      const isUploading = dropzone.classList.contains('is-uploading');

      if (statusMatch) {
        const nextStatus = statusMatch[1];
        const processed = ratioMatch ? Number(ratioMatch[1]) : 0;
        const total = ratioMatch ? Number(ratioMatch[2]) : 0;
        return {
          percent: computeImportProgress({ status: nextStatus, processed, total }),
          stage: getImportStageLabel(nextStatus),
          indeterminate: nextStatus !== 'done' && nextStatus !== 'failed' && total <= 0,
        };
      }

      if (ratioMatch && isUploading) {
        return {
          percent: computeUploadProgress(Number(ratioMatch[1]), Number(ratioMatch[2])),
          stage: '上传文件',
          indeterminate: false,
        };
      }

      if (isUploading) {
        const parsingStarted = lastPercent >= 40;
        return {
          percent: parsingStarted ? Math.max(lastPercent, 45) : Math.max(lastPercent, 8),
          stage: parsingStarted ? '准备解析' : '上传文件',
          indeterminate: parsingStarted,
        };
      }

      if (lastPercent >= 100) {
        return { percent: 100, stage: '导入完成', indeterminate: false };
      }

      if (lastPercent > 0) {
        return { percent: lastPercent, stage: '等待处理', indeterminate: false };
      }

      return { percent: 0, stage: '等待上传', indeterminate: false };
    };

    const syncProgress = () => {
      applyProgress(readProgress());
    };

    const observer = new MutationObserver(syncProgress);
    observer.observe(progressText, { childList: true, characterData: true, subtree: true });
    observer.observe(dropzone, { attributes: true, attributeFilter: ['class'] });
    syncProgress();
  }

  async function pollUploadJob(jobId, file, setUploadStatus) {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!isCurrentKnowledgePage()) return;
      let job;
      try {
        job = await window.api.apiFetch(`/kb/jobs/${jobId}`, { withVersion: true });
      } catch (err) {
        uploadState.busy = false;
        setUploadStatus({ file, message: `进度查询失败：${err.message}`, uploading: false, visible: true });
        return;
      }

      setUploadStatus({
        file,
        message: `解析进度：${job.processed || 0}/${job.total || 0} · ${job.status}`,
        uploading: true,
        visible: true,
      });
      if (job.status === 'done') {
        uploadState.busy = false;
        window.pages.knowledge(content);
        return;
      }
      if (job.status === 'failed') {
        uploadState.busy = false;
        setUploadStatus({ file, message: `导入失败：${job.error || '未知错误'}`, uploading: false, visible: true });
        return;
      }
    }
  }

  async function previewDoc(id) {
    const detail = document.getElementById('kb-detail');
    const doc = docsById.get(String(id));
    detail.innerHTML = '<div class="card">加载预览中...</div>';

    try {
      const entries = await loadPreviewEntries(id, doc && doc.rowCount);
      const apiOrigin = localStorage.getItem('apiBase') || 'http://localhost:3100';
      const totalRows = doc && Number.isFinite(Number(doc.rowCount)) ? Number(doc.rowCount) : entries.length;
      const totalImages = entries.reduce((sum, entry) => sum + ((entry.images && entry.images.length) || 0), 0);
      const heroPreviewCards = buildHeroPreviewCards(entries, apiOrigin);
      const previewItems = heroPreviewCards.length
        ? heroPreviewCards
        : entries.map((entry, index) => renderEntryCard(entry, index, apiOrigin));
      const previewSummary = heroPreviewCards.length
        ? `已导入 ${totalRows} 条，预览区已聚合展示 ${heroPreviewCards.length} 个英雄卡片，关联 ${totalImages} 张图片。`
        : `已导入 ${totalRows} 条，当前预览前 ${entries.length} 条，预览区共展示 ${totalImages} 张已挂载图片。`;

      detail.innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
            <div>
              <div class="card-title" style="margin-bottom:6px;">导入预览</div>
              <div style="font-size:16px;font-weight:600;color:#111827;line-height:1.5;">${escapeHtml((doc && doc.name) || `文档 #${id}`)}</div>
              <div style="margin-top:6px;font-size:13px;color:#6b7280;line-height:1.6;">
                已导入 ${totalRows} 条，当前预览前 ${entries.length} 条，预览区共展示 ${totalImages} 张已挂载图片。
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              ${renderMetaPill(`文档 ID ${id}`)}
              ${doc ? renderMetaPill(`状态 ${doc.status}`) : ''}
              ${doc ? renderMetaPill(`条目 ${doc.rowCount || 0}`) : ''}
            </div>
          </div>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px;">
            ${previewItems.length
              ? previewItems.join('')
              : '<div style="padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;color:#6b7280;">该文档暂时没有导入条目。</div>'}
          </div>
        </div>
      `;
      detail.querySelectorAll('[data-kb-full-image]').forEach(button => {
        button.addEventListener('click', () => {
          showPreviewImage(button.dataset.kbFullImage, button.dataset.kbImageLabel);
        });
      });
    } catch (err) {
      detail.innerHTML = `<div class="card">预览失败：${escapeHtml(err.message)}</div>`;
    }
  }

  async function delDoc(id, contentEl) {
    if (!confirm('确认删除该文档及其全部知识条目吗？')) return;

    try {
      await window.api.apiFetch(`/kb/documents/${id}`, { method: 'DELETE', withVersion: true });
      window.pages.knowledge(contentEl);
    } catch (err) {
      alert(`删除失败：${err.message}`);
    }
  }

  async function doSearch() {
    const query = document.getElementById('kb-q').value.trim();
    const locale = document.getElementById('kb-search-locale').value;
    const hits = document.getElementById('kb-hits');
    if (!query) return;

    hits.innerHTML = '<div style="color:#6b7280;">检索中...</div>';
    try {
      const localeParam = locale ? `&locale=${encodeURIComponent(locale)}` : '';
      const results = await window.api.apiFetch(`/kb/search?q=${encodeURIComponent(query)}&limit=10${localeParam}`, { withVersion: true });
      hits.innerHTML = results.length === 0
        ? '<div style="color:#6b7280;padding:20px;text-align:center;">没有匹配结果</div>'
        : results.map((hit, index) => `
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
                <span class="tag primary">#${index + 1}</span>
                <span style="color:#6b7280;font-size:12px;">相似度 ${Number(hit.score || 0).toFixed(4)}</span>
              </div>
              ${renderLocalizedSections(getLocalizedEntrySections(hit.entry), { compact: true })}
              ${!getLocalizedEntrySections(hit.entry).length ? `
                <div style="white-space:pre-wrap;font-size:14px;line-height:1.7;color:#111827;">${escapeHtml(((hit.entry && (hit.entry.display_content || hit.entry.content)) || ''))}</div>
              ` : ''}
            </div>
          `).join('');
    } catch (err) {
      hits.innerHTML = `<div style="color:var(--danger);">检索失败：${escapeHtml(err.message)}</div>`;
    }
  }

  function renderEntryCard(entry, index, apiOrigin) {
    const raw = safeParseJson(entry.raw_json);
    const fields = extractFields(raw);
    const localizedSections = getLocalizedEntrySections(entry, raw);
    const lines = localizedSections.length ? [] : normalizeContentLines(entry.content, raw);
    const chips = buildEntryChips(entry, raw);
    const images = Array.isArray(entry.images) ? entry.images : [];

    return `
      <div style="border:1px solid #dbe3ee;border-radius:12px;background:#f8fafc;padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            <div style="font-size:15px;font-weight:700;color:#111827;">条目 ${index + 1}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              ${chips.join('')}
            </div>
          </div>
          <div style="font-size:12px;color:#6b7280;">row_index ${entry.row_index}</div>
        </div>

        ${fields.length ? `
          <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
            ${fields.map(([label, value]) => `
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;">
                <div style="font-size:12px;color:#6b7280;line-height:1.5;">${escapeHtml(label)}</div>
                <div style="margin-top:4px;font-size:14px;line-height:1.65;color:#111827;word-break:break-word;">${escapeHtml(String(value))}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${renderLocalizedSections(localizedSections)}

        ${lines.length ? `
          <div style="margin-top:14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;">
            ${lines.map((line, lineIndex) => `
              <div style="font-size:14px;line-height:1.75;color:#111827;${lineIndex ? 'margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb;' : ''}">
                ${escapeHtml(line)}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${images.length ? `
          <div style="margin-top:14px;">
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">已关联图片</div>
            <div class="kb-preview-image-grid">
              ${images.map((url, imageIndex) => `
                <button
                  type="button"
                  class="kb-preview-image-card"
                  data-kb-full-image="${apiOrigin}${escapeHtml(url)}"
                  data-kb-image-label="entry-${entry.id}-image-${imageIndex + 1}"
                >
                  <img src="${apiOrigin}${escapeHtml(url)}" alt="entry-${entry.id}-image-${imageIndex + 1}" style="display:block;width:100%;height:118px;object-fit:cover;background:#f3f4f6;">
                  <div style="padding:8px 10px;font-size:12px;color:#4b5563;">图片 ${imageIndex + 1}</div>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  async function loadPreviewEntries(documentId, totalHint) {
    const batchSize = 200;
    const total = Number(totalHint) || batchSize;
    const maxEntries = Math.max(batchSize, Math.min(total, 2000));
    const entries = [];

    for (let offset = 0; offset < maxEntries; offset += batchSize) {
      const batch = await window.api.apiFetch(`/kb/entries?documentId=${documentId}&limit=${batchSize}&offset=${offset}`, { withVersion: true });
      entries.push(...batch);
      if (batch.length < batchSize) break;
    }

    return entries;
  }

  const HERO_BASE_FIELD_DEFS = [
    {
      key: '\u89d2\u8272\u9635\u8425',
      label: '\u9635\u8425',
      summaryKeys: ['\u9635\u8425'],
    },
    {
      key: '\u89d2\u8272\u804c\u4e1a',
      label: '\u804c\u4e1a',
      summaryKeys: ['\u804c\u4e1a'],
    },
    {
      key: '\u661f\u7ea7\uff08S+/S/A\uff09',
      label: '\u7a00\u6709\u5ea6',
      summaryKeys: ['\u82f1\u96c4\u7ea7\u522b'],
      aliases: ['\u661f\u7ea7'],
    },
    {
      key: '\u6ee1\u7ea7\u5c5e\u6027',
      label: '\u6ee1\u7ea7\u5c5e\u6027',
    },
  ];

  const HERO_STAT_FIELD_DEFS = [
    ['\u653b\u51fb', '\u653b\u51fb'],
    ['\u8840\u91cf', '\u8840\u91cf'],
    ['\u9632\u5fa1', '\u9632\u5fa1'],
    ['\u90e8\u961f\u6570\u91cf', '\u90e8\u961f\u6570\u91cf'],
  ];

  function buildHeroPreviewCards(entries, apiOrigin) {
    const parsedEntries = entries.map(entry => ({
      ...entry,
      _raw: safeParseJson(entry.raw_json),
    }));
    const summaryEntries = parsedEntries.filter(entry => isHeroSummaryEntry(entry._raw));
    if (!summaryEntries.length) return [];

    const entriesBySheet = new Map();
    parsedEntries.forEach(entry => {
      const sheetName = normalizeSheetName(entry._raw && entry._raw.__sheet);
      if (!sheetName) return;
      if (!entriesBySheet.has(sheetName)) entriesBySheet.set(sheetName, []);
      entriesBySheet.get(sheetName).push(entry);
    });

    return summaryEntries.map((entry, index) => {
      const raw = entry._raw || {};
      const targetSheet = normalizeSheetName(firstNonBlank(raw['跳转'], raw['sheet'], raw['详情sheet']));
      const relatedEntries = targetSheet ? (entriesBySheet.get(targetSheet) || []) : [];
      const skillEntries = relatedEntries.filter(item => isSkillEntry(item._raw));
      const heroBaseProfile = buildHeroBaseProfile(entry, relatedEntries, targetSheet);
      return renderHeroPreviewCard(entry, index, skillEntries, relatedEntries, apiOrigin, targetSheet, heroBaseProfile);
    });
  }

  function renderHeroPreviewCard(entry, index, skillEntries, relatedEntries, apiOrigin, targetSheet, heroBaseProfile) {
    const raw = entry._raw || safeParseJson(entry.raw_json);
    const heroName = firstNonBlank(raw['需求英雄'], raw['英雄名称'], raw['英雄'], targetSheet, `Hero ${index + 1}`);
    const heroTitle = firstNonBlank(heroBaseProfile && heroBaseProfile.title);
    const baseFields = heroBaseProfile && heroBaseProfile.baseFields ? heroBaseProfile.baseFields : [];
    const statFields = heroBaseProfile && heroBaseProfile.statFields ? heroBaseProfile.statFields : [];
    const quoteText = heroBaseProfile && heroBaseProfile.quoteText ? heroBaseProfile.quoteText : '';
    const noteText = heroBaseProfile && heroBaseProfile.noteText ? heroBaseProfile.noteText : '';
    const displayHeroName = firstNonBlank(
      heroBaseProfile && heroBaseProfile.displayName,
      raw['\u9700\u6c42\u82f1\u96c4'],
      raw['\u82f1\u96c4\u540d\u79f0'],
      raw['\u82f1\u96c4'],
      heroName
    );
    const fallbackInfoFields = (!baseFields.length && !statFields.length && !quoteText)
      ? extractHeroInfoFields(raw)
      : [];
    const skillGroups = groupSkillEntries(skillEntries);
    const images = collectEntryImages([entry, ...relatedEntries]);

    return `
      <div style="border:1px solid #cbd5e1;border-radius:14px;background:#ffffff;padding:18px 20px;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div>
            ${heroTitle ? `<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#64748b;text-transform:uppercase;">${escapeHtml(heroTitle)}</div>` : ''}
            <div style="font-size:18px;font-weight:700;color:#0f172a;line-height:1.5;">${escapeHtml(displayHeroName)}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              ${renderMetaPill(`预览卡 ${index + 1}`)}
              ${targetSheet ? renderMetaPill(`详情 Sheet ${targetSheet}`) : ''}
              ${renderMetaPill(`技能条目 ${skillEntries.length}`)}
              ${renderMetaPill(`图片 ${images.length}`)}
            </div>
          </div>
          <div style="font-size:12px;color:#6b7280;">row_index ${entry.row_index}</div>
        </div>

        ${baseFields.length ? `
          <div style="margin-top:18px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">基础信息</div>
            ${renderHeroInfoGrid(baseFields)}
          </div>
        ` : ''}

        ${statFields.length ? `
          <div style="margin-top:18px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">基础属性</div>
            ${renderHeroInfoGrid(statFields)}
          </div>
        ` : ''}

        ${quoteText ? `
          <div style="margin-top:18px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">英雄台词</div>
            ${renderHeroTextBlock(quoteText)}
          </div>
        ` : ''}

        ${noteText ? `
          <div style="margin-top:16px;padding:12px 14px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;">
            <div style="font-size:12px;color:#64748b;line-height:1.5;">属性备注</div>
            <div style="margin-top:6px;font-size:14px;line-height:1.75;color:#0f172a;white-space:pre-wrap;">${escapeHtml(noteText)}</div>
          </div>
        ` : ''}

        ${fallbackInfoFields.length ? `
          <div style="margin-top:18px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">表头信息</div>
            ${renderHeroInfoGrid(fallbackInfoFields)}
          </div>
        ` : ''}

        <div style="margin-top:18px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px;">技能信息</div>
          ${skillGroups.length
            ? `
              <div style="display:flex;flex-direction:column;gap:12px;">
                ${skillGroups.map(group => `
                  <div style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:12px 14px;">
                    <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px;">${escapeHtml(group.label)}</div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                      ${group.items.map(item => renderHeroSkillItem(item)).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            `
            : '<div style="padding:14px 16px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;font-size:13px;line-height:1.7;">这个英雄卡还没有在详情 sheet 里识别到可展示的技能条目，但数据已经导入。</div>'}
        </div>

        ${images.length ? `
          <div style="margin-top:16px;">
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">关联图片</div>
            <div class="kb-preview-image-grid">
              ${images.map((url, imageIndex) => `
                <button
                  type="button"
                  class="kb-preview-image-card"
                  data-kb-full-image="${apiOrigin}${escapeHtml(url)}"
                  data-kb-image-label="hero-${escapeHtml(displayHeroName)}-image-${imageIndex + 1}"
                >
                  <img src="${apiOrigin}${escapeHtml(url)}" alt="hero-${escapeHtml(displayHeroName)}-image-${imageIndex + 1}" style="display:block;width:100%;height:132px;object-fit:cover;background:#f3f4f6;">
                  <div style="padding:8px 10px;font-size:12px;color:#4b5563;">图片 ${imageIndex + 1}</div>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderHeroSkillItem(entry) {
    const raw = entry._raw || safeParseJson(entry.raw_json);
    const itemLabel = firstNonBlank(raw['项目'], raw['字段'], raw['类型'], '技能条目');
    const fields = extractSkillFields(raw);
    const localizedSections = getLocalizedEntrySections(entry, raw);
    const fallbackLines = (fields.length || localizedSections.length) ? [] : normalizeContentLines(entry.content, raw);

    return `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(itemLabel)}</div>
          <div style="font-size:12px;color:#6b7280;">row_index ${entry.row_index}</div>
        </div>
        ${fields.length ? `
          <div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
            ${fields.map(([label, value]) => `
              <div style="padding:10px 12px;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb;">
                <div style="font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(label)}</div>
                <div style="margin-top:4px;font-size:14px;line-height:1.7;color:#111827;word-break:break-word;white-space:pre-wrap;">${escapeHtml(String(value))}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${renderLocalizedSections(localizedSections, { compact: true })}
        ${fallbackLines.length ? `
          <div style="margin-top:10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;">
            ${fallbackLines.map((line, lineIndex) => `
              <div style="font-size:14px;line-height:1.75;color:#111827;${lineIndex ? 'margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb;' : ''}">
                ${escapeHtml(line)}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function isHeroSummaryEntry(raw) {
    if (!raw || typeof raw !== 'object') return false;
    return normalizeSheetName(raw.__sheet) === '英雄档案list' && !isBlank(firstNonBlank(raw['跳转'], raw['需求英雄']));
  }

  function isSkillEntry(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const position = String(firstNonBlank(raw['对应位置'], raw['位置'], '')).trim();
    const project = String(firstNonBlank(raw['项目'], raw['字段'], '')).trim();
    return position.includes('技能') || project.includes('技能');
  }

  function normalizeSheetName(value) {
    return String(value == null ? '' : value).trim();
  }

  function buildHeroBaseProfile(entry, relatedEntries, targetSheet) {
    const summaryRaw = entry._raw || safeParseJson(entry.raw_json);
    const detailMap = new Map();

    relatedEntries.forEach(item => {
      const raw = item._raw || safeParseJson(item.raw_json);
      const projectLabel = getHeroProjectLabel(raw);
      if (!projectLabel || isSkillEntry(raw)) return;

      const value = getHeroDetailValue(item, raw);
      if (isBlank(value) || detailMap.has(projectLabel)) return;
      detailMap.set(projectLabel, value);
    });

    const baseFields = HERO_BASE_FIELD_DEFS
      .map(field => {
        const aliases = Array.isArray(field.aliases) ? field.aliases : [];
        const summaryKeys = Array.isArray(field.summaryKeys) ? field.summaryKeys : [];
        const detailValue = firstNonBlank(detailMap.get(field.key), ...aliases.map(alias => detailMap.get(alias)));
        const summaryValue = firstNonBlank(...summaryKeys.map(key => summaryRaw[key]));
        const value = firstNonBlank(detailValue, summaryValue);
        if (isBlank(value)) return null;
        return [field.label, value];
      })
      .filter(Boolean);

    const statFields = HERO_STAT_FIELD_DEFS
      .map(([key, label]) => {
        const value = detailMap.get(key);
        if (isBlank(value)) return null;
        return [label, value];
      })
      .filter(Boolean);

    return {
      title: firstNonBlank(detailMap.get('\u89d2\u8272\u79f0\u53f7')),
      displayName: firstNonBlank(
        detailMap.get('\u89d2\u8272\u540d\u5b57'),
        summaryRaw['\u9700\u6c42\u82f1\u96c4'],
        summaryRaw['\u82f1\u96c4\u540d\u79f0'],
        targetSheet
      ),
      baseFields,
      statFields,
      quoteText: firstNonBlank(detailMap.get('\u82f1\u96c4\u53f0\u8bcd')),
      noteText: firstNonBlank(detailMap.get('\u5907\u6ce8\u4fe1\u606f')),
    };
  }

  function getHeroProjectLabel(raw) {
    return String(firstNonBlank(raw['\u9879\u76ee'], raw['\u5b57\u6bb5'], raw['\u7c7b\u578b'], '')).trim();
  }

  function getHeroDetailValue(entry, raw) {
    return firstNonBlank(
      raw['\u4e2d\u6587'],
      raw['\u7e41\u4e2d'],
      raw['\u82f1\u6587'],
      raw['\u65e5\u8bed'],
      raw['\u97e9\u8bed'],
      normalizeContentLines(entry.content, raw).join('\n')
    );
  }

  function renderHeroInfoGrid(fields) {
    if (!fields.length) return '';
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        ${fields.map(([label, value]) => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;">
            <div style="font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(label)}</div>
            <div style="margin-top:4px;font-size:14px;line-height:1.7;color:#0f172a;word-break:break-word;white-space:pre-wrap;">${escapeHtml(String(value))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderHeroTextBlock(text) {
    const content = String(text == null ? '' : text).trim();
    if (!content) return '';
    return `<div style="padding:12px 14px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:14px;line-height:1.8;color:#0f172a;white-space:pre-wrap;">${escapeHtml(content)}</div>`;
  }

  function extractHeroInfoFields(raw) {
    const hiddenKeys = new Set(['跳转']);
    return extractFields(raw).filter(([key]) => !hiddenKeys.has(key)).slice(0, 8);
  }

  function extractSkillFields(raw) {
    const hiddenKeys = new Set(['对应位置']);
    return extractFields(raw).filter(([key]) => !hiddenKeys.has(key));
  }

  function groupSkillEntries(entries) {
    const groups = [];
    const map = new Map();

    entries.forEach((entry, index) => {
      const raw = entry._raw || safeParseJson(entry.raw_json);
      const label = firstNonBlank(raw['对应位置'], raw['位置'], raw['项目'], `技能 ${index + 1}`);
      if (!map.has(label)) {
        const group = { label, items: [] };
        map.set(label, group);
        groups.push(group);
      }
      map.get(label).items.push(entry);
    });

    return groups;
  }

  function collectEntryImages(entries) {
    const seen = new Set();
    const images = [];

    entries.forEach(entry => {
      const urls = Array.isArray(entry && entry.images) ? entry.images : [];
      urls.forEach(url => {
        const normalized = String(url || '').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        images.push(normalized);
      });
    });

    return images;
  }

  function firstNonBlank(...values) {
    for (const value of values) {
      if (!isBlank(value)) return value;
    }
    return '';
  }

  function buildEntryChips(entry, raw) {
    const chips = [];
    const localeCount = getLocalizedEntrySections(entry, raw).length;
    if (raw.__sheet) chips.push(renderMetaPill(`工作表 ${raw.__sheet}`));
    if (raw.__excelRowStart && raw.__excelRowEnd) {
      chips.push(renderMetaPill(
        raw.__excelRowStart === raw.__excelRowEnd
          ? `Excel 第 ${raw.__excelRowStart} 行`
          : `Excel 第 ${raw.__excelRowStart}-${raw.__excelRowEnd} 行`
      ));
    } else if (raw.__excelRow) {
      chips.push(renderMetaPill(`Excel 第 ${raw.__excelRow} 行`));
    } else if (entry.row_index) {
      chips.push(renderMetaPill(`条目序号 ${entry.row_index}`));
    }
    if (raw.__parseMode) chips.push(renderMetaPill(raw.__parseMode === 'block' ? '区块导入' : '表格行导入'));
    if (localeCount) chips.push(renderMetaPill(`语种 ${localeCount}`));
    chips.push(renderMetaPill(`图片 ${(entry.images && entry.images.length) || 0}`));
    return chips;
  }

  function renderMetaPill(text) {
    return `<span style="display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:999px;background:#e8f1ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;white-space:nowrap;">${escapeHtml(text)}</span>`;
  }

  function normalizeLocaleCode(locale) {
    const normalized = String(locale || '').trim().replace(/_/g, '-').toLowerCase();
    if (!normalized) return '';
    if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-CN';
    if (normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-TW';
    if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb') return 'en-US';
    if (normalized === 'ja' || normalized === 'ja-jp') return 'ja-JP';
    if (normalized === 'ko' || normalized === 'ko-kr') return 'ko-KR';
    return locale;
  }

  function getLocaleFieldDefinitions() {
    return [
      { locale: 'zh-CN', label: '中文', keys: ['中文', '简中', '简体中文'] },
      { locale: 'en-US', label: '英文', keys: ['英文', '英语', 'English'] },
      { locale: 'zh-TW', label: '繁中', keys: ['繁中', '繁体', '繁体中文'] },
      { locale: 'ja-JP', label: '日语', keys: ['日语', '日文', 'Japanese'] },
      { locale: 'ko-KR', label: '韩语', keys: ['韩语', '韩文', 'Korean'] },
    ];
  }

  function isLocaleFieldKey(key) {
    const source = String(key || '').trim();
    return getLocaleFieldDefinitions().some(item => item.keys.includes(source));
  }

  function getLocalizedEntrySections(entry, rawValue) {
    const raw = rawValue && typeof rawValue === 'object' ? rawValue : safeParseJson(rawValue || (entry && entry.raw_json));
    const byLocale = new Map();

    (Array.isArray(entry && entry.locales) ? entry.locales : []).forEach((item) => {
      const locale = normalizeLocaleCode(item && item.locale);
      const content = String(item && item.content || '').trim();
      if (!locale || !content || byLocale.has(locale)) return;
      byLocale.set(locale, {
        locale,
        label: String(item && item.label || getLocaleFieldDefinitions().find(def => def.locale === locale)?.label || locale),
        content,
      });
    });

    getLocaleFieldDefinitions().forEach((item) => {
      if (byLocale.has(item.locale)) return;
      const matchedKey = item.keys.find(key => !isBlank(raw[key]));
      if (!matchedKey) return;
      byLocale.set(item.locale, {
        locale: item.locale,
        label: item.label,
        content: String(raw[matchedKey]).trim(),
      });
    });

    return getLocaleFieldDefinitions()
      .map(item => byLocale.get(item.locale))
      .filter(Boolean);
  }

  function renderLocalizedSections(sections, options = {}) {
    const items = Array.isArray(sections) ? sections.filter(item => !isBlank(item && item.content)) : [];
    if (!items.length) return '';

    const compact = !!options.compact;
    return `
      <div style="margin-top:${compact ? 10 : 14}px;display:grid;grid-template-columns:repeat(auto-fit,minmax(${compact ? 220 : 240}px,1fr));gap:10px;">
        ${items.map(item => `
          <div style="background:#fff;border:1px solid #dbe3ee;border-radius:10px;padding:${compact ? '10px 12px' : '12px 14px'};">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
              <div style="font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(item.label || item.locale)}</div>
              <span style="display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:11px;white-space:nowrap;">${escapeHtml(item.locale)}</span>
            </div>
            <div style="margin-top:6px;font-size:14px;line-height:1.75;color:#111827;white-space:pre-wrap;word-break:break-word;">${escapeHtml(item.content)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function extractFields(raw) {
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw).filter(([key, value]) => {
      if (key.startsWith('__')) return false;
      if (isLocaleFieldKey(key)) return false;
      return !isBlank(value);
    });
  }

  function normalizeContentLines(contentText, raw) {
    return String(contentText || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        if (raw && raw.__sheet && line === `Sheet: ${raw.__sheet}`) return false;
        if (raw && raw.__excelRowStart && raw.__excelRowEnd) {
          const rowLabel = raw.__excelRowStart === raw.__excelRowEnd
            ? `Row: ${raw.__excelRowStart}`
            : `Rows: ${raw.__excelRowStart}-${raw.__excelRowEnd}`;
          if (line === rowLabel) return false;
        }
        if (raw && raw.__excelRow && line === `Row: ${raw.__excelRow}`) return false;
        return true;
      });
  }

  function safeParseJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function isBlank(value) {
    return String(value == null ? '' : value).trim() === '';
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatFileSize(size) {
    const value = Number(size) || 0;
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, char => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
  }

  function showPreviewImage(url, label) {
    closePreviewImage();

    const overlay = document.createElement('div');
    overlay.id = 'kb-img-overlay';
    overlay.className = 'img-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', label || 'Image preview');

    const dialog = document.createElement('div');
    dialog.className = 'img-overlay__dialog';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'img-overlay__close';
    closeButton.setAttribute('aria-label', 'Close image preview');
    closeButton.title = 'Close';
    closeButton.textContent = 'x';

    const image = document.createElement('img');
    image.src = url;
    image.alt = label || 'Image preview';

    dialog.appendChild(closeButton);
    dialog.appendChild(image);
    overlay.appendChild(dialog);

    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('kb-image-overlay-open');
      overlay.remove();
      if (previewState.close === cleanup) previewState.close = null;
    };

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup();
      }
    };

    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      cleanup();
    });
    dialog.addEventListener('click', event => event.stopPropagation());
    overlay.addEventListener('click', event => {
      if (event.target === overlay) cleanup();
    });

    previewState.close = cleanup;
    document.body.classList.add('kb-image-overlay-open');
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    closeButton.focus();
  }

  function closePreviewImage() {
    if (previewState.close) {
      previewState.close();
      return;
    }

    const overlay = document.getElementById('kb-img-overlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('kb-image-overlay-open');
  }

  function loadVisNetwork() {
    if (window.vis && window.vis.Network) return Promise.resolve();
    if (window.__visLoading) return window.__visLoading;

    window.__visLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('vis-network 加载失败'));
      document.head.appendChild(script);
    });

    return window.__visLoading;
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  const GRAPH_NOISE_NAME_PATTERNS = [
    /^\d+$/,
    /^hero\s*profile/i,
    /技能图标|技能位置|核心技能/i,
    /icon[:：]?/i,
    /对应位置|位置顺序/i,
  ];

  function isLikelyNoiseEntityName(name) {
    const text = String(name == null ? '' : name).trim();
    if (!text) return true;
    return GRAPH_NOISE_NAME_PATTERNS.some(pattern => pattern.test(text));
  }

  function renderEntityGrid(stage, entities) {
    const cards = entities.map((entity, index) => `
      <div style="background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;box-shadow:0 1px 3px rgba(15,23,42,.06);min-height:56px;">
        <div style="flex:0 0 auto;width:24px;height:24px;border-radius:999px;background:#1677ff;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:1px;">${index + 1}</div>
        <div style="min-width:0;">
          <div style="font-size:14px;line-height:1.5;color:#1f2937;font-weight:600;word-break:break-word;">${escapeHtml(entity.name)}</div>
          <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6b7280;">已识别实体</div>
        </div>
      </div>
    `).join('');

    stage.innerHTML = `
      <div style="position:absolute;inset:0;overflow:auto;padding:20px 24px;background:#f8fafc;">
        <div style="margin-bottom:16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#475569;font-size:13px;line-height:1.6;">
          当前文档只识别到了实体，尚未抽取到实体之间的关系，因此按实体列表展示。
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;align-content:start;">
          ${cards}
        </div>
      </div>
    `;
  }

  function buildGraphViewModel(entities, relations) {
    const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
    const relationCards = relations
      .map(relation => {
        const from = entitiesById.get(relation.from_entity_id);
        const to = entitiesById.get(relation.to_entity_id);
        if (!from || !to) return null;
        const lowConfidence = isLikelyNoiseEntityName(from.name) || isLikelyNoiseEntityName(to.name);
        return {
          id: relation.id,
          relation: String(relation.relation || '').trim() || '关联',
          from,
          to,
          lowConfidence,
        };
      })
      .filter(Boolean);

    const connectedIds = new Set();
    relationCards.forEach(card => {
      connectedIds.add(card.from.id);
      connectedIds.add(card.to.id);
    });

    const connectedEntities = entities.filter(entity => connectedIds.has(entity.id));
    const isolatedEntities = entities.filter(entity => !connectedIds.has(entity.id));
    const featuredEntities = isolatedEntities.filter(entity => !isLikelyNoiseEntityName(entity.name));
    const noisyEntities = isolatedEntities.filter(entity => isLikelyNoiseEntityName(entity.name));
    const usefulRelationCards = relationCards.filter(card => !card.lowConfidence);
    const usefulConnectedIds = new Set();
    usefulRelationCards.forEach(card => {
      usefulConnectedIds.add(card.from.id);
      usefulConnectedIds.add(card.to.id);
    });
    const usefulConnectedEntities = connectedEntities.filter(entity => usefulConnectedIds.has(entity.id));

    return {
      entities,
      relations,
      relationCards,
      usefulRelationCards,
      connectedEntities,
      usefulConnectedEntities,
      isolatedEntities,
      featuredEntities,
      noisyEntities,
    };
  }

  function shouldPreferSummaryView(model) {
    if (!model.relationCards.length) return true;
    if (!model.usefulRelationCards.length) return true;
    if (model.usefulRelationCards.length <= 4) return true;
    return model.usefulConnectedEntities.length < Math.max(6, Math.ceil(model.entities.length * 0.35));
  }

  function renderGraphEntityChips(entities, tone) {
    if (!entities.length) return '<div style="font-size:13px;color:#94a3b8;line-height:1.7;">暂无</div>';
    const palette = tone === 'muted'
      ? { background: '#f8fafc', border: '#e2e8f0', color: '#475569' }
      : { background: '#eef4ff', border: '#c7d7fe', color: '#1d4ed8' };
    return `
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${entities.map(entity => `
          <span style="display:inline-flex;align-items:center;max-width:100%;padding:6px 10px;border-radius:999px;background:${palette.background};border:1px solid ${palette.border};color:${palette.color};font-size:12px;line-height:1.4;word-break:break-word;">
            ${escapeHtml(entity.name)}
          </span>
        `).join('')}
      </div>
    `;
  }

  function renderGraphSummary(stage, model) {
    const hasUsefulRelations = model.usefulRelationCards.length > 0;
    const relationCards = hasUsefulRelations ? model.usefulRelationCards : model.relationCards;
    const summaryTone = hasUsefulRelations
      ? {
          border: '#dbeafe',
          background: '#eff6ff',
          color: '#1d4ed8',
          text: `当前文档抽取到 ${relationCards.length} 条可读关系，默认按结构化摘要展示，避免低密度图谱散成一屏孤点。`,
        }
      : {
          border: '#fde68a',
          background: '#fffbeb',
          color: '#b45309',
          text: `当前文档仅抽取到 ${model.relationCards.length} 条低置信关系，暂时不适合直接看节点图。下面优先展示关系摘要和已识别英雄实体。`,
        };

    stage.innerHTML = `
      <div style="position:absolute;inset:0;overflow:auto;padding:20px 24px;background:#f8fafc;">
        <div style="padding:14px 16px;border:1px solid ${summaryTone.border};border-radius:12px;background:${summaryTone.background};color:${summaryTone.color};font-size:13px;line-height:1.7;">
          ${escapeHtml(summaryTone.text)}
        </div>

        <div style="margin-top:16px;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:16px;align-items:start;">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                <div style="font-size:15px;font-weight:700;color:#0f172a;">关系摘要</div>
                <div style="font-size:12px;color:#64748b;">${hasUsefulRelations ? '已过滤低置信关系' : '当前全部关系均为低置信结果'}</div>
              </div>
              <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px;">
                ${relationCards.length
                  ? relationCards.map(card => `
                    <div style="border:1px solid ${card.lowConfidence ? '#fde68a' : '#dbeafe'};background:${card.lowConfidence ? '#fffbeb' : '#f8fbff'};border-radius:12px;padding:14px;">
                      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#1d4ed8;color:#fff;font-size:12px;font-weight:600;">${escapeHtml(card.from.name)}</span>
                        <span style="font-size:12px;color:#64748b;">${escapeHtml(card.relation)}</span>
                        <span style="font-size:14px;color:#94a3b8;">→</span>
                        <span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:600;">${escapeHtml(card.to.name)}</span>
                      </div>
                      ${card.lowConfidence ? '<div style="margin-top:8px;font-size:12px;color:#b45309;line-height:1.6;">这条关系来自说明性节点或格式字段，建议作为低置信线索看待。</div>' : ''}
                    </div>
                  `).join('')
                  : '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:13px;line-height:1.7;">当前文档还没有抽取到可展示的实体关系。</div>'}
              </div>
            </div>

            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">已识别英雄实体</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.6;">这些实体已从文档中识别出来，但当前大多还没有和其他实体建立稳定关系。</div>
              <div style="margin-top:14px;">
                ${renderGraphEntityChips(model.featuredEntities.length ? model.featuredEntities : model.isolatedEntities, 'default')}
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">图谱状态</div>
              <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                ${[
                  ['实体数', model.entities.length],
                  ['关系数', model.relationCards.length],
                  ['已连通实体', model.connectedEntities.length],
                  ['未连通实体', model.isolatedEntities.length],
                ].map(([label, value]) => `
                  <div style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:12px;">
                    <div style="font-size:12px;color:#64748b;">${label}</div>
                    <div style="margin-top:4px;font-size:22px;font-weight:700;color:#0f172a;">${value}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">未入图的噪音节点</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.6;">像“技能图标”“Hero Profile”“6”这类格式节点会干扰阅读，默认不作为重点展示。</div>
              <div style="margin-top:14px;">
                ${renderGraphEntityChips(model.noisyEntities, 'muted')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function openGraph(id, name) {
    const oldModal = document.getElementById('kb-graph-modal');
    if (oldModal) oldModal.remove();

    let network = null;
    const modal = document.createElement('div');
    modal.id = 'kb-graph-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,21,41,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:40px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:100%;max-width:1200px;height:100%;max-height:800px;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border-secondary,#f0f0f0);display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="font-size:15px;font-weight:600;">知识图谱 · ${escapeHtml(name || `#${id}`)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span id="kb-graph-stat" style="color:var(--text-tertiary,#8c8c8c);font-size:12px;"></span>
            <button class="btn small plain" id="kb-graph-close">关闭</button>
          </div>
        </div>
        <div id="kb-graph-canvas" style="flex:1;min-height:480px;background:#fafafa;position:relative;">
          <div id="kb-graph-stage" style="position:absolute;inset:0;"></div>
          <div id="kb-graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary,#8c8c8c);">加载中...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
      if (network && typeof network.destroy === 'function') network.destroy();
      modal.remove();
    };

    document.getElementById('kb-graph-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    const stage = document.getElementById('kb-graph-stage');
    const stat = document.getElementById('kb-graph-stat');
    const loading = document.getElementById('kb-graph-loading');

    try {
      const data = await window.api.apiFetch(`/kb/graph?documentId=${id}`, { withVersion: true });
      const entities = data.entities || [];
      const relations = data.relations || [];
      stat.textContent = `实体 ${entities.length} · 关系 ${relations.length}`;

      if (entities.length === 0) {
        loading.remove();
        stage.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary,#8c8c8c);">该文档暂时没有抽取到实体</div>';
        return;
      }

      if (relations.length === 0) {
        loading.remove();
        renderEntityGrid(stage, entities);
        return;
      }

      await loadVisNetwork();
      loading.remove();
      await nextFrame();

      const typeColor = {
        primary: { background: '#1677ff', border: '#0958d9', font: '#ffffff' },
        entity: { background: '#e6f4ff', border: '#91caff', font: '#001529' },
      };

      const nodes = new vis.DataSet(entities.map(entity => {
        const color = typeColor[entity.type] || typeColor.entity;
        return {
          id: entity.id,
          label: entity.name,
          shape: 'dot',
          size: entity.type === 'primary' ? 18 : 12,
          color: { background: color.background, border: color.border },
          font: { color: color.font, size: 13, face: 'inherit' },
        };
      }));

      const edges = new vis.DataSet(relations.map(relation => ({
        id: relation.id,
        from: relation.from_entity_id,
        to: relation.to_entity_id,
        label: relation.relation || '',
        arrows: 'to',
        color: { color: '#d9d9d9', highlight: '#1677ff' },
        font: { size: 11, color: '#8c8c8c', strokeWidth: 0, align: 'middle' },
        smooth: { type: 'continuous' },
      })));

      network = new vis.Network(stage, { nodes, edges }, {
        physics: {
          stabilization: { iterations: 150 },
          barnesHut: { gravitationalConstant: -3000, springLength: 120 },
        },
        interaction: { hover: true, tooltipDelay: 200, navigationButtons: false, keyboard: false },
        nodes: { borderWidth: 1.5 },
        edges: { width: 1 },
      });

      setTimeout(() => {
        if (!network || !document.body.contains(stage)) return;
        try {
          network.fit({ animation: false });
        } catch (err) {
          console.error('[knowledge] graph fit failed:', err);
        }
      }, 0);
    } catch (err) {
      loading.textContent = `加载失败：${err.message}`;
    }
  }
  const READABLE_GRAPH_NOISE_PATTERNS = [
    /^\d+$/,
    /^icon[:：]?\s*$/i,
    /^hero\s*profile(?:\s*[|｜].*)?$/i,
    /技能图标|技能icon|skill\s*icon/i,
    /对应位置|位置顺序|position/i,
    /核心技能提示|core\s*skill/i,
  ];

  function isReadableGraphNoise(name) {
    const text = String(name == null ? '' : name).trim();
    if (!text) return true;
    if (text.length <= 1) return true;
    return READABLE_GRAPH_NOISE_PATTERNS.some(pattern => pattern.test(text));
  }

  function wrapReadableGraphLabel(text, chunkSize = 10) {
    const value = String(text == null ? '' : text).trim();
    if (!value || value.length <= chunkSize) return value;
    const lines = [];
    for (let i = 0; i < value.length; i += chunkSize) {
      lines.push(value.slice(i, i + chunkSize));
    }
    return lines.join('\n');
  }

  function buildReadableGraphModel(entities, relations) {
    const entityMap = new Map(entities.map(entity => [entity.id, entity]));
    const relationCards = relations
      .map(relation => {
        const from = entityMap.get(relation.from_entity_id);
        const to = entityMap.get(relation.to_entity_id);
        if (!from || !to) return null;
        const lowConfidence = isReadableGraphNoise(from.name) || isReadableGraphNoise(to.name);
        return {
          id: relation.id,
          relation: String(relation.relation || '').trim() || '关联',
          from,
          to,
          lowConfidence,
        };
      })
      .filter(Boolean);

    const connectedIds = new Set();
    relationCards.forEach(card => {
      connectedIds.add(card.from.id);
      connectedIds.add(card.to.id);
    });

    const connectedEntities = entities.filter(entity => connectedIds.has(entity.id));
    const isolatedEntities = entities.filter(entity => !connectedIds.has(entity.id));
    const usefulRelationCards = relationCards.filter(card => !card.lowConfidence);
    const usefulConnectedIds = new Set();
    usefulRelationCards.forEach(card => {
      usefulConnectedIds.add(card.from.id);
      usefulConnectedIds.add(card.to.id);
    });

    return {
      entities,
      relationCards,
      usefulRelationCards,
      connectedEntities,
      usefulConnectedEntities: connectedEntities.filter(entity => usefulConnectedIds.has(entity.id)),
      isolatedEntities,
      featuredEntities: isolatedEntities.filter(entity => !isReadableGraphNoise(entity.name)),
      noisyEntities: isolatedEntities.filter(entity => isReadableGraphNoise(entity.name)),
    };
  }

  function shouldPreferReadableGraphSummary(model) {
    if (!model.relationCards.length) return true;
    if (!model.usefulRelationCards.length) return true;
    if (model.usefulRelationCards.length <= 4) return true;
    return model.usefulConnectedEntities.length < Math.max(6, Math.ceil(model.entities.length * 0.35));
  }

  function renderReadableGraphChips(entities, tone = 'default') {
    if (!entities.length) {
      return '<div style="font-size:13px;color:#94a3b8;line-height:1.7;">暂无</div>';
    }

    const palette = tone === 'muted'
      ? { background: '#f8fafc', border: '#e2e8f0', color: '#475569' }
      : { background: '#eef4ff', border: '#c7d7fe', color: '#1d4ed8' };

    return `
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${entities.map(entity => `
          <span style="display:inline-flex;align-items:center;max-width:100%;padding:6px 10px;border-radius:999px;background:${palette.background};border:1px solid ${palette.border};color:${palette.color};font-size:12px;line-height:1.4;word-break:break-word;">
            ${escapeHtml(entity.name)}
          </span>
        `).join('')}
      </div>
    `;
  }

  function renderReadableGraphEntityOnly(stage, entities) {
    stage.innerHTML = `
      <div style="position:absolute;inset:0;overflow:auto;padding:20px 24px;background:#f8fafc;">
        <div style="margin-bottom:16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#475569;font-size:13px;line-height:1.6;">
          当前文档只识别到了实体，尚未抽取到实体之间的关系，因此先按实体列表展示。
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;align-content:start;">
          ${entities.map((entity, index) => `
            <div style="background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start;box-shadow:0 1px 3px rgba(15,23,42,.06);min-height:56px;">
              <div style="flex:0 0 auto;width:24px;height:24px;border-radius:999px;background:#1677ff;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:1px;">${index + 1}</div>
              <div style="min-width:0;">
                <div style="font-size:14px;line-height:1.5;color:#1f2937;font-weight:600;word-break:break-word;">${escapeHtml(entity.name)}</div>
                <div style="margin-top:4px;font-size:12px;line-height:1.4;color:#6b7280;">已识别实体</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderReadableGraphSummary(stage, model) {
    const relationCards = model.usefulRelationCards.length ? model.usefulRelationCards : model.relationCards;
    const focusEntities = model.featuredEntities.length ? model.featuredEntities : model.isolatedEntities;
    const summaryText = model.usefulRelationCards.length
      ? `当前文档共抽取到 ${model.relationCards.length} 条关系，其中 ${model.usefulRelationCards.length} 条可读性较好。默认先展示关系摘要，避免低密度图谱散成一屏孤点。`
      : `当前文档虽然识别到 ${model.entities.length} 个实体，但只抽取到 ${model.relationCards.length} 条低置信度关系，直接展示节点图会误导阅读，因此默认改为摘要视图。`;

    stage.innerHTML = `
      <div style="position:absolute;inset:0;overflow:auto;padding:20px 24px;background:#f8fafc;">
        <div style="padding:14px 16px;border:1px solid ${model.usefulRelationCards.length ? '#dbeafe' : '#fde68a'};border-radius:12px;background:${model.usefulRelationCards.length ? '#eff6ff' : '#fffbeb'};color:${model.usefulRelationCards.length ? '#1d4ed8' : '#b45309'};font-size:13px;line-height:1.7;">
          ${escapeHtml(summaryText)}
        </div>

        <div style="margin-top:16px;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:16px;align-items:start;">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                <div style="font-size:15px;font-weight:700;color:#0f172a;">关系摘要</div>
                <div style="font-size:12px;color:#64748b;">${model.usefulRelationCards.length ? '已过滤低置信度关系' : '当前关系全部偏低置信度'}</div>
              </div>
              <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px;">
                ${relationCards.length ? relationCards.map(card => `
                  <div style="border:1px solid ${card.lowConfidence ? '#fde68a' : '#dbeafe'};background:${card.lowConfidence ? '#fffbeb' : '#f8fbff'};border-radius:12px;padding:14px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                      <span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#1d4ed8;color:#fff;font-size:12px;font-weight:600;">${escapeHtml(card.from.name)}</span>
                      <span style="font-size:12px;color:#64748b;">${escapeHtml(card.relation)}</span>
                      <span style="font-size:14px;color:#94a3b8;">&rarr;</span>
                      <span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:600;">${escapeHtml(card.to.name)}</span>
                    </div>
                    ${card.lowConfidence ? '<div style="margin-top:8px;font-size:12px;color:#b45309;line-height:1.6;">这条关系更像说明性字段或版式标签，建议只作为弱线索参考。</div>' : ''}
                  </div>
                `).join('') : '<div style="padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;color:#64748b;font-size:13px;line-height:1.7;">当前文档还没有抽取到可展示的实体关系。</div>'}
              </div>
            </div>

            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">已识别实体</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.6;">这些内容已经从文档中识别出来，但目前多数还没有和其它实体建立稳定关系。</div>
              <div style="margin-top:14px;">
                ${renderReadableGraphChips(focusEntities, 'default')}
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">图谱状态</div>
              <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                ${[
                  ['实体数', model.entities.length],
                  ['关系数', model.relationCards.length],
                  ['已连通实体', model.connectedEntities.length],
                  ['未连通实体', model.isolatedEntities.length],
                ].map(([label, value]) => `
                  <div style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;padding:12px;">
                    <div style="font-size:12px;color:#64748b;">${label}</div>
                    <div style="margin-top:4px;font-size:22px;font-weight:700;color:#0f172a;">${value}</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
              <div style="font-size:15px;font-weight:700;color:#0f172a;">已降噪节点</div>
              <div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.6;">像“技能图标”“Hero Profile”“6”这类版式或位置字段会干扰阅读，所以默认不作为重点展示。</div>
              <div style="margin-top:14px;">
                ${renderReadableGraphChips(model.noisyEntities, 'muted')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function openReadableGraph(id, name) {
    const oldModal = document.getElementById('kb-graph-modal');
    if (oldModal) oldModal.remove();

    let network = null;
    let model = null;
    let canRenderGraph = false;
    let graphEntities = [];
    let graphRelationCards = [];

    const modal = document.createElement('div');
    modal.id = 'kb-graph-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,21,41,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:40px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:100%;max-width:1200px;height:100%;max-height:800px;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border-secondary,#f0f0f0);display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="display:flex;align-items:center;gap:14px;min-width:0;">
            <div style="font-size:15px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">知识图谱 · ${escapeHtml(name || `#${id}`)}</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="kb-graph-tab-summary" style="height:32px;padding:0 12px;border-radius:999px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:600;cursor:pointer;">关系摘要</button>
              <button id="kb-graph-tab-network" style="height:32px;padding:0 12px;border-radius:999px;border:1px solid #d0d7de;background:#fff;color:#475569;font-size:12px;font-weight:600;cursor:pointer;">图形视图</button>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
            <span id="kb-graph-stat" style="color:var(--text-tertiary,#8c8c8c);font-size:12px;"></span>
            <button class="btn small plain" id="kb-graph-close">关闭</button>
          </div>
        </div>
        <div style="flex:1;min-height:480px;background:#fafafa;position:relative;">
          <div id="kb-graph-stage" style="position:absolute;inset:0;"></div>
          <div id="kb-graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary,#8c8c8c);">加载中...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const summaryTab = document.getElementById('kb-graph-tab-summary');
    const networkTab = document.getElementById('kb-graph-tab-network');
    const stage = document.getElementById('kb-graph-stage');
    const stat = document.getElementById('kb-graph-stat');
    const loading = document.getElementById('kb-graph-loading');

    const destroyNetwork = () => {
      if (network && typeof network.destroy === 'function') network.destroy();
      network = null;
    };

    const setActiveTab = view => {
      [
        [summaryTab, view === 'summary'],
        [networkTab, view === 'network'],
      ].forEach(([button, active]) => {
        button.style.background = active ? '#eff6ff' : '#fff';
        button.style.borderColor = active ? '#bfdbfe' : '#d0d7de';
        button.style.color = active ? '#1d4ed8' : '#475569';
      });

      networkTab.disabled = !canRenderGraph;
      networkTab.style.opacity = canRenderGraph ? '1' : '.45';
      networkTab.style.cursor = canRenderGraph ? 'pointer' : 'not-allowed';
      networkTab.title = canRenderGraph ? '' : '当前图谱关系过少，已切换为摘要视图';
    };

    const closeModal = () => {
      destroyNetwork();
      modal.remove();
    };

    const setLoading = text => {
      loading.textContent = text;
      loading.style.display = 'flex';
    };

    const hideLoading = () => {
      loading.style.display = 'none';
    };

    const renderSummary = () => {
      destroyNetwork();
      hideLoading();
      if (model) renderReadableGraphSummary(stage, model);
      setActiveTab('summary');
    };

    const renderNetwork = async () => {
      if (!canRenderGraph || !model) {
        renderSummary();
        return;
      }

      destroyNetwork();
      stage.innerHTML = '';
      setLoading('加载图谱中...');

      await loadVisNetwork();
      await nextFrame();

      const visLib = window.vis;
      const nodeColors = {
        primary: { background: '#1677ff', border: '#0958d9', font: '#ffffff' },
        entity: { background: '#eff6ff', border: '#93c5fd', font: '#0f172a' },
      };

      const nodes = new visLib.DataSet(graphEntities.map(entity => {
        const color = nodeColors[entity.type] || nodeColors.entity;
        return {
          id: entity.id,
          label: wrapReadableGraphLabel(entity.name, 10),
          title: escapeHtml(entity.name),
          shape: 'box',
          color: { background: color.background, border: color.border },
          font: { color: color.font, size: 13, face: 'inherit', multi: false },
          margin: 12,
          widthConstraint: { maximum: 220 },
        };
      }));

      const edges = new visLib.DataSet(graphRelationCards.map(card => ({
        id: card.id,
        from: card.from.id,
        to: card.to.id,
        label: card.relation,
        arrows: 'to',
        color: { color: card.lowConfidence ? '#f59e0b' : '#94a3b8', highlight: '#1677ff' },
        font: { size: 11, color: '#64748b', strokeWidth: 0, align: 'middle' },
        smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.24 },
      })));

      hideLoading();
      network = new visLib.Network(stage, { nodes, edges }, {
        autoResize: true,
        physics: false,
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'LR',
            sortMethod: 'directed',
            levelSeparation: 180,
            nodeSpacing: 120,
            treeSpacing: 180,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
          },
        },
        interaction: {
          hover: true,
          tooltipDelay: 120,
          navigationButtons: true,
          keyboard: false,
          dragNodes: false,
        },
        nodes: {
          borderWidth: 1.5,
          shape: 'box',
          margin: 12,
        },
        edges: {
          width: 1.5,
          smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.24 },
        },
      });

      setActiveTab('network');
      setTimeout(() => {
        if (!network || !document.body.contains(stage)) return;
        try {
          network.fit({ animation: false, maxZoomLevel: 1.05 });
        } catch (err) {
          console.error('[knowledge] graph fit failed:', err);
        }
      }, 0);
    };

    document.getElementById('kb-graph-close').addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    summaryTab.addEventListener('click', renderSummary);
    networkTab.addEventListener('click', () => {
      if (!canRenderGraph) return;
      renderNetwork().catch(err => setLoading(`加载失败：${err.message}`));
    });

    try {
      const data = await window.api.apiFetch(`/kb/graph?documentId=${id}`, { withVersion: true });
      const entities = Array.isArray(data.entities) ? data.entities : [];
      const relations = Array.isArray(data.relations) ? data.relations : [];
      stat.textContent = `实体 ${entities.length} · 关系 ${relations.length}`;

      if (!entities.length) {
        hideLoading();
        stage.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary,#8c8c8c);">该文档暂时没有抽取到实体</div>';
        setActiveTab('summary');
        return;
      }

      if (!relations.length) {
        hideLoading();
        renderReadableGraphEntityOnly(stage, entities);
        setActiveTab('summary');
        return;
      }

      model = buildReadableGraphModel(entities, relations);
      graphEntities = model.usefulConnectedEntities.length ? model.usefulConnectedEntities : model.connectedEntities;
      const graphEntityIds = new Set(graphEntities.map(entity => entity.id));
      graphRelationCards = (model.usefulRelationCards.length ? model.usefulRelationCards : model.relationCards)
        .filter(card => graphEntityIds.has(card.from.id) && graphEntityIds.has(card.to.id));
      canRenderGraph = graphEntities.length > 1 && graphRelationCards.length > 0;

      if (shouldPreferReadableGraphSummary(model) || !canRenderGraph) {
        renderSummary();
      } else {
        await renderNetwork();
      }
    } catch (err) {
      setLoading(`加载失败：${err.message}`);
      setActiveTab('summary');
    }
  }
};
