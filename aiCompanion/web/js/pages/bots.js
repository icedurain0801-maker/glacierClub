window.pages = window.pages || {};

window.pages.bots = async function (content) {
  content.innerHTML = '<div class="placeholder-box">加载中...</div>';

  let cfg;
  try {
    cfg = await window.api.apiFetch('/bot', { withVersion: true });
  } catch (err) {
    content.innerHTML = `<div class="placeholder-box">${escapeHtml(err.message)}</div>`;
    return;
  }

  const versionId = localStorage.getItem('currentVersionId');
  const avatarState = {
    previewUrl: cfg.avatarUrl || null,
    avatarPath: cfg.avatarPath || null,
    fileName: getFileName(cfg.avatarPath || cfg.avatarUrl),
  };

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">机器人管理</div>
        <div class="page-desc">编辑当前版本的机器人配置，保存后立即作用于 C 端对话。</div>
      </div>
      <a class="btn plain" style="text-decoration:none;" href="chat.html?versionId=${escapeHtml(versionId || '')}" target="_blank">打开 C 端对话</a>
    </div>

    <div class="card">
      <div class="card-title">基础人设</div>
      <table class="form-table">
        <tr>
          <th>头像</th>
          <td>
            <input id="bot-avatar-file" type="file" accept="image/*" hidden>
            <div id="bot-avatar-dropzone" class="bot-avatar-dropzone" tabindex="0" role="button" aria-label="上传机器人头像">
              <div id="bot-avatar-preview" class="bot-avatar-preview"></div>
              <div class="bot-avatar-copy">
                <div class="bot-avatar-copy__title">拖拽头像到这里，或点击上传图片</div>
                <div class="bot-avatar-copy__desc">不再压缩为 base64，图片会直接上传到服务端并按文件路径保存。</div>
                <div id="bot-avatar-meta" class="bot-avatar-copy__meta">当前未上传头像</div>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <th>名称</th>
          <td>
            <input id="bot-display-name" class="bot-name-input" type="text" maxlength="64" value="${escapeHtml(cfg.displayName || '陪玩助手')}">
            <div class="bot-field-help">用于 C 端聊天页标题，也会同步给模型作为角色名称。</div>
          </td>
        </tr>
        <tr>
          <th>具体设定</th>
          <td>
            <div class="bot-persona-toolbar">
              <div class="bot-persona-toolbar__desc">整体角色设定，作为 system prompt 的核心内容。</div>
              <div class="bot-persona-toolbar__actions">
                <button class="btn plain small" id="bot-polish-persona" type="button">AI 润色</button>
              </div>
            </div>
            <textarea id="bot-persona" class="bot-persona-textarea" rows="10">${escapeHtml(cfg.persona || '')}</textarea>
            <div class="bot-field-help bot-field-help--split">
              <span>点击 AI 润色后，会对当前“具体设定”的全部文本做一次整体润色。</span>
              <span id="bot-polish-status"></span>
            </div>
          </td>
        </tr>
        <tr>
          <th>欢迎语</th>
          <td>
            <input id="bot-welcome" type="text" style="width:100%;" value="${escapeHtml(cfg.welcome || '')}">
            <div class="bot-field-help">用户进入 C 端页面时展示的第一句问候。</div>
          </td>
        </tr>
      </table>
    </div>

    <div class="card">
      <div class="card-title">RAG 检索设置</div>
      <table class="form-table">
        <tr><th>启用 RAG</th>
            <td><label><input id="bot-rag" type="checkbox" ${cfg.ragEnabled ? 'checked' : ''}>回答前检索当前版本知识库</label></td></tr>
        <tr><th>检索条数</th>
            <td><input id="bot-topk" type="number" min="1" max="20" value="${cfg.ragTopK || 5}" style="width:100px;">
                <span style="color:var(--text-tertiary);margin-left:8px;font-size:13px;">1-20，建议 3-8</span></td></tr>
        <tr><th>历史轮数</th>
            <td><input id="bot-turns" type="number" min="1" max="50" value="${cfg.historyTurns || 10}" style="width:100px;">
                <span style="color:var(--text-tertiary);margin-left:8px;font-size:13px;">1-50，过大会占用上下文窗口</span></td></tr>
      </table>
    </div>

    <div class="card">
      <div class="card-title">高级</div>
      <table class="form-table">
        <tr><th>LLM 模型覆盖</th>
            <td><input id="bot-model" type="text" placeholder="留空使用 env 默认值" value="${escapeHtml(cfg.model || '')}" style="width:280px;">
                <div class="bot-field-help">例如 qwen-plus、gpt-4o-mini；留空则使用 LLM_MODEL 环境变量。</div></td></tr>
      </table>
    </div>

    <div class="card" style="display:flex;align-items:center;gap:12px;">
      <button class="btn large" id="bot-save">保存配置</button>
      <span id="bot-status" style="color:var(--text-secondary);font-size:13px;"></span>
    </div>`;

  const avatarDropzone = document.getElementById('bot-avatar-dropzone');
  const avatarFile = document.getElementById('bot-avatar-file');
  const displayNameInput = document.getElementById('bot-display-name');
  const personaInput = document.getElementById('bot-persona');
  const polishButton = document.getElementById('bot-polish-persona');
  const polishStatus = document.getElementById('bot-polish-status');
  const saveStatus = document.getElementById('bot-status');

  renderAvatarPreview();

  avatarDropzone.addEventListener('click', () => avatarFile.click());
  avatarDropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      avatarFile.click();
    }
  });

  avatarFile.addEventListener('change', async () => {
    const [file] = avatarFile.files || [];
    if (!file) return;
    await handleAvatarFile(file);
    avatarFile.value = '';
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    avatarDropzone.addEventListener(eventName, e => {
      e.preventDefault();
      avatarDropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'dragend'].forEach(eventName => {
    avatarDropzone.addEventListener(eventName, () => {
      avatarDropzone.classList.remove('is-dragover');
    });
  });
  avatarDropzone.addEventListener('drop', async e => {
    e.preventDefault();
    avatarDropzone.classList.remove('is-dragover');
    const [file] = Array.from(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
    if (!file) return;
    await handleAvatarFile(file);
  });

  displayNameInput.addEventListener('input', () => {
    if (!avatarState.previewUrl) renderAvatarPreview();
  });

  polishButton.addEventListener('click', async () => {
    const text = personaInput.value.trim();
    if (!text) {
      setPolishStatus('请先填写具体设定。', 'error');
      return;
    }

    setPolishStatus('AI 正在整体润色...', 'pending');
    polishButton.disabled = true;
    try {
      const result = await window.api.apiFetch('/bot/polish-persona', {
        method: 'POST',
        withVersion: true,
        body: { text },
      });
      personaInput.value = result.text || text;
      setPolishStatus('已完成整体润色。', 'success');
    } catch (err) {
      setPolishStatus(err.message, 'error');
    } finally {
      polishButton.disabled = false;
    }
  });

  document.getElementById('bot-save').addEventListener('click', async () => {
    saveStatus.textContent = '保存中...';
    saveStatus.style.color = 'var(--text-secondary)';
    try {
      await window.api.apiFetch('/bot', {
        method: 'PUT',
        withVersion: true,
        body: {
          displayName: displayNameInput.value.trim(),
          avatarUrl: avatarState.avatarPath,
          persona: personaInput.value.trim(),
          welcome: document.getElementById('bot-welcome').value.trim(),
          ragEnabled: document.getElementById('bot-rag').checked,
          ragTopK: parseInt(document.getElementById('bot-topk').value, 10),
          kgEnabled: cfg.kgEnabled,
          historyTurns: parseInt(document.getElementById('bot-turns').value, 10),
          model: document.getElementById('bot-model').value.trim() || null,
        },
      });
      saveStatus.textContent = '已保存';
      saveStatus.style.color = 'var(--success)';
    } catch (err) {
      saveStatus.textContent = err.message;
      saveStatus.style.color = 'var(--danger)';
    }
  });

  async function handleAvatarFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      saveStatus.textContent = '头像仅支持图片文件';
      saveStatus.style.color = 'var(--danger)';
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    avatarDropzone.classList.add('is-uploading');
    saveStatus.textContent = '头像上传中...';
    saveStatus.style.color = 'var(--text-secondary)';

    try {
      const result = await window.api.apiFetch('/bot/avatar', {
        method: 'POST',
        withVersion: true,
        body: formData,
      });
      avatarState.previewUrl = result.avatarUrl || null;
      avatarState.avatarPath = result.avatarPath || null;
      avatarState.fileName = result.fileName || file.name || getFileName(result.avatarPath);
      renderAvatarPreview();
      saveStatus.textContent = '头像已上传，点击保存后生效';
      saveStatus.style.color = 'var(--text-secondary)';
    } catch (err) {
      saveStatus.textContent = err.message || '头像上传失败';
      saveStatus.style.color = 'var(--danger)';
    } finally {
      avatarDropzone.classList.remove('is-uploading');
    }
  }

  function renderAvatarPreview() {
    const preview = document.getElementById('bot-avatar-preview');
    const meta = document.getElementById('bot-avatar-meta');
    const displayName = displayNameInput.value.trim() || cfg.displayName || '陪玩助手';

    if (avatarState.previewUrl) {
      preview.classList.add('has-image');
      preview.innerHTML = `<img src="${escapeAttr(avatarState.previewUrl)}" alt="机器人头像预览">`;
      meta.textContent = avatarState.fileName
        ? `${avatarState.fileName} · 保存后同步到 C 端`
        : '当前已配置头像，保存后同步到 C 端';
      return;
    }

    preview.classList.remove('has-image');
    preview.textContent = getInitial(displayName);
    meta.textContent = '当前未上传头像，支持点击上传或直接拖拽图片到这里';
  }

  function setPolishStatus(text, tone) {
    polishStatus.textContent = text || '';
    polishStatus.className = tone ? `bot-polish-status is-${tone}` : 'bot-polish-status';
  }

  function getInitial(name) {
    const trimmed = String(name || '').trim();
    return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'AI';
  }
};

function getFileName(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const clean = text.split('?')[0].split('#')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || null;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
