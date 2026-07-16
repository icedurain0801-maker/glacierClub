const API_ORIGIN = localStorage.getItem('apiBase') || 'http://localhost:3100';
const API_BASE = API_ORIGIN + '/api';

const params = new URLSearchParams(location.search);
const versionId = parseInt(params.get('versionId'), 10);

const bodyEl = document.getElementById('chat-body');
const emptyEl = document.getElementById('chat-empty');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const titleEl = document.getElementById('chat-title');
const avatarEl = document.getElementById('chat-avatar');
const backBtn = document.getElementById('chat-back');
const emojiBtn = document.getElementById('chat-emoji-btn');
const emojiPanel = document.getElementById('emoji-panel');
const imageBtn = document.getElementById('chat-image-btn');
const videoBtn = document.getElementById('chat-video-btn');
const fileImageEl = document.getElementById('chat-file-image');
const fileVideoEl = document.getElementById('chat-file-video');
const previewEl = document.getElementById('chat-input-preview');

const SESSION_SCHEMA_VERSION = '20260715_livefix_2';
const DEFAULT_BOT_NAME = '\u966a\u73a9\u52a9\u624b';

let botAvatarUrl = '';

if (!versionId) {
  emptyEl.textContent = '\u9700\u8981 versionId \u53c2\u6570(\u5982 chat.html?versionId=1)';
  sendBtn.disabled = true;
}

const legacySessionKeyStorage = `chat_sessionKey_v${versionId}`;
const sessionKeyStorage = `chat_sessionKey_${SESSION_SCHEMA_VERSION}_v${versionId}`;
if (versionId) {
  localStorage.removeItem(legacySessionKeyStorage);
}

let sessionKey = localStorage.getItem(sessionKeyStorage);
if (!sessionKey && versionId) {
  sessionKey = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '_' + Math.random().toString(36).slice(2));
  localStorage.setItem(sessionKeyStorage, sessionKey);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char]));
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  const linked = escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(（>])((https?:\/\/|www\.)[^\s<]+)/g, (match, prefix, url) => {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

  return linked.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isTableSeparator(line) {
  const text = line.trim();
  return /^\|?[-:\s|]+\|?$/.test(text) && text.includes('-');
}

function renderMarkdown(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      html += '<hr>';
      index += 1;
      continue;
    }

    const headerMatch = /^#{1,6}\s+(.*)$/.exec(line);
    if (headerMatch) {
      html += `<div class="md-section">${renderInline(headerMatch[1])}</div>`;
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      html += `<blockquote>${quoteLines.map(renderInline).join('<br>')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      html += `<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
      continue;
    }

    if (/^\|.*\|$/.test(line.trim()) && isTableSeparator(lines[index + 1] || '')) {
      const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
        index += 1;
      }
      const theadHtml = `<tr>${headerCells.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr>`;
      const tbodyHtml = rows
        .map(cells => `<tr>${cells.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('');
      html += `<div class="md-table-scroll"><table>${theadHtml}${tbodyHtml}</table></div><div class="md-scroll-hint">⇔ 左右滑动查看完整表格</div>`;
      continue;
    }

    const paragraphLines = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^-{3,}$/.test(lines[index].trim()) &&
      !/^#{1,6}\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    if (paragraphLines.length) {
      html += `<p>${paragraphLines.map(renderInline).join('<br>')}</p>`;
    } else if (index < lines.length) {
      index += 1;
    }
  }

  return html;
}

function parseHeroCard(content) {
  const match = /```herocard\s*([\s\S]*?)```/.exec(content);
  if (!match) return { text: content, card: null };

  const leading = content.slice(0, match.index).trim();
  const trailing = content.slice(match.index + match[0].length).trim();
  const text = [leading, trailing].filter(Boolean).join('\n\n');

  try {
    const data = JSON.parse(match[1].trim());
    if (!data || typeof data.name !== 'string') return { text: content, card: null };
    return { text, card: data };
  } catch {
    return { text: content, card: null };
  }
}

const HERO_ICON_TAGS = [
  { key: 'faction', icon: '\ud83d\udee1\ufe0f' },
  { key: 'career', icon: '\ud83d\udca5' },
];

function renderHeroCard(card) {
  const name = escapeHtml(card.name || '');
  const title = escapeHtml(card.title || '');
  const faction = escapeHtml(card.faction || '');
  const career = escapeHtml(card.career || card.className || '');
  const careerIconUrl = buildImageUrl(card.careerIconUrl);
  const rarity = escapeHtml(card.rarity || '');
  const skills = (Array.isArray(card.skills) ? card.skills : []).slice(0, 4);
  const iconTagItems = [
    faction ? { icon: HERO_ICON_TAGS[0].icon, text: faction } : null,
    careerIconUrl
      ? {
          iconImageUrl: careerIconUrl,
          alt: career || `${card.name || ''}职业`,
        }
      : (career ? { icon: HERO_ICON_TAGS[1].icon, text: career } : null),
  ].filter(Boolean);
  const iconTagsHtml = iconTagItems.length
    ? `<div class="hero-icon-tags">${iconTagItems.map(item =>
        item.iconImageUrl
          ? `<div class="hero-icon-tag hero-icon-tag-image" title="${escapeHtml(item.alt || '')}">
              <span class="hero-icon-tag-ic hero-icon-tag-ic-image">
                <img src="${escapeHtml(item.iconImageUrl)}" alt="${escapeHtml(item.alt || '')}" loading="lazy">
              </span>
            </div>`
          : `<div class="hero-icon-tag"><span class="hero-icon-tag-ic">${item.icon}</span><span class="hero-icon-tag-tx">${item.text}</span></div>`
      ).join('')}</div>`
    : '';
  const avatarUrl = buildImageUrl(card.avatarUrl);
  const avatarFallback = escapeHtml((card.name || '').trim().slice(0, 1) || '\u89d2');

  const iconRowHtml = skills.map((skill, index) => {
    const skillIndex = parseInt(skill.index, 10) || index + 1;
    const skillName = escapeHtml(skill.name || skill.label || `\u6280\u80fd ${skillIndex}`);
    const skillImageUrl = buildImageUrl(skill.imageUrl);
    return `<button type="button" class="hero-skill-icon-btn ${index === 0 ? 'active' : ''}" data-skill-index="${index}">
      <span class="hero-skill-icon hero-media ${skillImageUrl ? 'has-image' : ''}">
        ${skillImageUrl ? `<img src="${escapeHtml(skillImageUrl)}" alt="${skillName}" loading="lazy">` : ''}
        <span class="hero-skill-fallback">${skillIndex}</span>
      </span>
      ${skill.isCore ? '<span class="hero-skill-core-dot"></span>' : ''}
    </button>`;
  }).join('');

  const detailsHtml = skills.map((skill, index) => {
    const skillIndex = parseInt(skill.index, 10) || index + 1;
    const skillLabel = escapeHtml(skill.label || `\u6280\u80fd ${skillIndex}`);
    const skillName = escapeHtml(skill.name || skill.label || `\u6280\u80fd ${skillIndex}`);
    const skillDesc = escapeHtml(skill.description || '').replace(/\n/g, '<br>');
    return `<div class="hero-skill-detail ${index === 0 ? 'active' : ''}" data-skill-index="${index}">
      <div class="hero-skill-detail-top">
        <span class="hero-skill-tag">${skillLabel}</span>
        ${skill.isCore ? '<span class="hero-skill-core">\u6838\u5fc3</span>' : ''}
      </div>
      <div class="hero-skill-name">${skillName}</div>
      ${skillDesc ? `<div class="hero-skill-desc">${skillDesc}</div>` : ''}
    </div>`;
  }).join('');

  const quote = card.quote
    ? `<div class="hero-quote">
      <div class="hero-section-title">\u82f1\u96c4\u53f0\u8bcd</div>
      <div class="hero-quote-text">${escapeHtml(card.quote).replace(/\n/g, '<br>')}</div>
    </div>`
    : '';

  return `<div class="hero-card">
    <div class="hero-card-inner">
      <div class="hero-card-header">
        ${rarity ? `<div class="hero-ribbon">${rarity}</div>` : ''}
        <div class="hero-avatar hero-media ${avatarUrl ? 'has-image' : ''}">
          ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${name}" loading="lazy">` : ''}
          <span class="hero-avatar-fallback">${avatarFallback}</span>
        </div>
        <div class="hero-card-summary">
          ${title ? `<div class="hero-title">${title}</div>` : ''}
          <div class="hero-name">${name}</div>
          ${iconTagsHtml}
        </div>
      </div>
      ${iconRowHtml ? `<div class="hero-skills">
        <div class="hero-section-title">\u6280\u80fd</div>
        <div class="hero-skill-icon-row">${iconRowHtml}</div>
        <div class="hero-skill-details">${detailsHtml}</div>
      </div>` : ''}
      ${quote}
    </div>
  </div>`;
}

function renderBotAvatarMarkup() {
  if (botAvatarUrl) {
    return `<img src="${escapeHtml(botAvatarUrl)}" alt="${escapeHtml(titleEl.textContent || 'AI')}">`;
  }
  return escapeHtml((titleEl.textContent || 'AI').slice(0, 1));
}

function fallbackAvatarMarkup(labelText) {
  const text = String(labelText || titleEl.textContent || 'AI').trim();
  return escapeHtml(text.slice(0, 1).toUpperCase() || 'AI');
}

function bindBotAvatarFallbacks(root) {
  root.querySelectorAll('.msg-avatar img').forEach(img => {
    img.addEventListener('error', () => {
      botAvatarUrl = '';
      const avatar = img.closest('.msg-avatar');
      if (!avatar) return;
      avatar.classList.remove('has-image');
      avatar.innerHTML = fallbackAvatarMarkup();
    }, { once: true });
  });
}

function buildImageUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized) || /^data:/i.test(normalized)) return normalized;
  return `${API_ORIGIN}${normalized}`;
}

function parseRefsPayload(rawValue) {
  if (!rawValue) return null;
  try {
    const refs = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return Array.isArray(refs) ? refs : null;
  } catch {
    return null;
  }
}

function bindRefImageFallbacks(root) {
  root.querySelectorAll('.ref-thumb').forEach(img => {
    img.addEventListener('error', () => {
      const wrapper = img.closest('.ref-images');
      img.remove();
      if (wrapper && !wrapper.querySelector('.ref-thumb')) {
        wrapper.remove();
      }
    }, { once: true });
  });
}

function bindHeroImageFallbacks(root) {
  root.querySelectorAll('.hero-media img').forEach(img => {
    img.addEventListener('error', () => {
      const wrapper = img.closest('.hero-media');
      if (!wrapper) return;
      wrapper.classList.remove('has-image');
      img.remove();
    }, { once: true });
  });
}


function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();

  const isBot = role === 'assistant';
  const line = document.createElement('div');
  line.className = `msg-line ${isBot ? 'bot' : 'user'}`;

  let refsHtml = '';
  let imagesHtml = '';
  if (Array.isArray(refs) && refs.length) {
    refsHtml = `<div class="refs">参考 ${refs.length} 条 ${refs.map(ref => `<span class="ref-item">#${ref.entryId} (${Number(ref.score || 0).toFixed(3)})</span>`).join('')}</div>`;
    const imgUrls = [...new Set(refs.flatMap(ref => Array.isArray(ref.images) ? ref.images : []))]
      .map(buildImageUrl)
      .filter(Boolean);
    if (imgUrls.length > 0) {
      imagesHtml = `<div class="ref-images">${imgUrls.map(url =>
        `<img class="ref-thumb" src="${escapeHtml(url)}" data-full="${escapeHtml(url)}" loading="lazy">`
      ).join('')}</div>`;
    }
  }

  const avatarHtml = isBot
    ? `<div class="msg-avatar ${botAvatarUrl ? 'has-image' : ''}">${renderBotAvatarMarkup()}</div>`
    : '';

  let bodyHtml;
  if (isBot) {
    const { text, card } = parseHeroCard(content);
    const textHtml = text ? `<div class="bubble md">${renderMarkdown(text)}</div>` : '';
    const cardHtml = card ? renderHeroCard(card) : '';
    bodyHtml = `<div class="msg bot">${textHtml}${cardHtml}${card ? '' : imagesHtml}${card ? '' : refsHtml}</div>`;
  } else {
    bodyHtml = `<div class="msg user"><div class="bubble">${escapeHtml(content)}</div></div>`;
  }

  line.innerHTML = avatarHtml + bodyHtml;
  bodyEl.appendChild(line);
  bindBotAvatarFallbacks(line);
  bindHeroImageFallbacks(line);
  bindRefImageFallbacks(line);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return line;
}

function renderBotHeader(bot) {
  const displayName = String(bot && bot.displayName ? bot.displayName : DEFAULT_BOT_NAME).trim() || DEFAULT_BOT_NAME;
  titleEl.textContent = displayName;
  botAvatarUrl = bot && bot.avatarUrl ? String(bot.avatarUrl) : '';

  if (botAvatarUrl) {
    avatarEl.classList.add('has-image');
    avatarEl.innerHTML = `<img src="${escapeHtml(botAvatarUrl)}" alt="${escapeHtml(displayName)}">`;
    const headerImg = avatarEl.querySelector('img');
    if (headerImg) {
      headerImg.addEventListener('error', () => {
        botAvatarUrl = '';
        avatarEl.classList.remove('has-image');
        avatarEl.textContent = fallbackAvatarMarkup(displayName);
      }, { once: true });
    }
    return;
  }

  avatarEl.classList.remove('has-image');
  avatarEl.textContent = fallbackAvatarMarkup(displayName);
}

// 阶段名 → 图标/文案。与后端 chatService.js 的 onStage('retrieving'/'thinking') 一一对应,
// 不是循环播放的假动画,而是随真实 SSE 事件切换。
const STAGE_MAP = {
  retrieving: { icon: '🔍', text: '查询资料中' },
  thinking:   { icon: '✍️', text: '梳理回答中' },
};

function closeImageOverlay() {
  const overlay = document.getElementById('img-overlay');
  if (overlay) overlay.remove();
  document.body.classList.remove('kb-image-overlay-open');
}

function showFullImage(url) {
  closeImageOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'img-overlay';
  overlay.className = 'img-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'img-overlay__dialog';
  dialog.addEventListener('click', event => event.stopPropagation());

  const img = document.createElement('img');
  img.src = url;
  img.alt = '知识库图片预览';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'img-overlay__close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭图片预览');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', event => {
    event.stopPropagation();
    closeImageOverlay();
  });

  dialog.appendChild(img);
  dialog.appendChild(closeBtn);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', closeImageOverlay);
  document.body.appendChild(overlay);
  document.body.classList.add('kb-image-overlay-open');
}

bodyEl.addEventListener('click', event => {
  if (event.target.classList.contains('ref-thumb')) {
    showFullImage(event.target.dataset.full);
  }

  const skillBtn = event.target.closest('.hero-skill-icon-btn');
  if (skillBtn) {
    const card = skillBtn.closest('.hero-card');
    if (card) {
      const idx = skillBtn.dataset.skillIndex;
      card.querySelectorAll('.hero-skill-icon-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.skillIndex === idx);
      });
      card.querySelectorAll('.hero-skill-detail').forEach(detail => {
        detail.classList.toggle('active', detail.dataset.skillIndex === idx);
      });
    }
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeImageOverlay();
});

function appendThinking() {
  const initial = STAGE_MAP.retrieving;
  const line = document.createElement('div');
  line.className = 'msg-line bot thinking';
  line.innerHTML =
    `<div class="msg-avatar ${botAvatarUrl ? 'has-image' : ''}">${renderBotAvatarMarkup()}</div>` +
    `<div class="msg bot thinking"><div class="bubble">` +
    `<span class="thinking-icon">${initial.icon}</span>` +
    `<span class="thinking-text">${initial.text}</span>` +
    `</div></div>`;
  bodyEl.appendChild(line);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return line;
}

// 按真实收到的 SSE stage 事件更新图标/文案(未知 stage 名忽略,保留当前显示)
function setThinkingStage(line, stage) {
  const s = STAGE_MAP[stage];
  if (!s) return;
  const iconEl = line.querySelector('.thinking-icon');
  const textEl = line.querySelector('.thinking-text');
  if (iconEl) iconEl.textContent = s.icon;
  if (textEl) textEl.textContent = s.text;
}

function removeThinking(line) {
  line.remove();
}

// 拆 "event: xxx\ndata: {...}" 帧为 {event, data}
function parseSSEFrame(frame) {
  let event = 'message';
  let dataStr = '';
  for (const rawLine of frame.split('\n')) {
    if (rawLine.startsWith('event:')) event = rawLine.slice(6).trim();
    else if (rawLine.startsWith('data:')) dataStr += rawLine.slice(5).trim();
  }
  let data = null;
  try { data = JSON.parse(dataStr); } catch { /* ignore malformed frame */ }
  return { event, data };
}

async function fetchJSON(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `\u8bf7\u6c42\u5931\u8d25(${res.status})`);
  return data;
}

async function boot() {
  if (!versionId) return;

  try {
    const [bot, history] = await Promise.all([
      fetchJSON(`/public/bot?versionId=${versionId}`),
      fetchJSON(`/public/history?versionId=${versionId}&sessionKey=${encodeURIComponent(sessionKey)}`),
    ]);

    renderBotHeader(bot);
    if (!history.messages.length) {
      appendMsg('assistant', bot.welcome);
      return;
    }

    for (const message of history.messages) {
      appendMsg(message.role, message.content, parseRefsPayload(message.refs_json));
    }
  } catch (err) {
    emptyEl.textContent = '\u52a0\u8f7d\u5931\u8d25: ' + err.message;
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sendBtn.disabled) return;

  inputEl.value = '';
  autoResize();
  appendMsg('user', text);
  clearPendingAttachment();
  sendBtn.disabled = true;
  const thinking = appendThinking();

  try {
    const res = await fetch(API_BASE + '/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ versionId, sessionKey, message: text }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || `请求失败(${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let settled = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!frame.trim()) continue;
        const { event, data } = parseSSEFrame(frame);
        if (event === 'stage' && data) {
          setThinkingStage(thinking, data.stage);
        } else if (event === 'done' && data) {
          settled = true;
          removeThinking(thinking);
          appendMsg('assistant', data.reply, data.refs);
        } else if (event === 'error' && data) {
          settled = true;
          removeThinking(thinking);
          appendMsg('assistant', '(出错: ' + data.error + ')');
        }
      }
    }
    if (!settled) throw new Error('连接中断,未收到完整回复');
  } catch (err) {
    if (thinking.parentNode) removeThinking(thinking);
    appendMsg('assistant', '(出错: ' + err.message + ')');
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
}

// ===== 表情面板:点击图标切换显示,点击表情插入到输入框 =====
const EMOJIS = ['\u{1F600}','\u{1F602}','\u{1F60A}','\u{1F60D}','\u{1F970}','\u{1F60E}','\u{1F914}','\u{1F605}','\u{1F62D}','\u{1F621}','\u{1F44D}','\u{1F44E}','❤️','\u{1F525}','\u{1F389}','✨','\u{1F64F}','\u{1F4AA}','\u{1F3AE}','\u{1F31F}','\u{1F634}','\u{1F917}'];
if (emojiPanel) emojiPanel.innerHTML = EMOJIS.map(e => `<span>${escapeHtml(e)}</span>`).join('');

if (emojiBtn && emojiPanel) {
  emojiBtn.addEventListener('click', event => {
    event.stopPropagation();
    emojiPanel.classList.toggle('show');
  });
  emojiPanel.addEventListener('click', event => {
    if (event.target.tagName !== 'SPAN') return;
    inputEl.value += event.target.textContent;
    emojiPanel.classList.remove('show');
    inputEl.focus();
    autoResize();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('#emoji-panel') && !event.target.closest('#chat-emoji-btn')) {
      emojiPanel.classList.remove('show');
    }
  });
}

// ===== 图片/视频选择:调起系统文件框,选中后显示可删除的预览标签 =====
// 说明:当前 C 端聊天协议只支持纯文本消息,选中的图片/视频仅作为待发送附件展示预览,
// 尚未接入随消息一起上传发送的后端能力(需要后续扩展支持附件)。
let pendingAttachment = null;

function clearPendingAttachment() {
  if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
  pendingAttachment = null;
  if (previewEl) previewEl.innerHTML = '';
}

function setPendingAttachment(kind, file) {
  if (!previewEl) return;
  if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
  const url = URL.createObjectURL(file);
  pendingAttachment = { kind, file, url };
  const label = file.name.length > 16 ? `${file.name.slice(0, 14)}…` : file.name;
  const thumbInner = kind === 'image' ? `<img src="${escapeHtml(url)}" alt="">` : '\u{1F3AC}';
  previewEl.innerHTML = `<span class="chip-preview"><span class="thumb">${thumbInner}</span>${escapeHtml(label)}<span class="rm" data-clear-attachment>✕</span></span>`;
}

if (previewEl) {
  previewEl.addEventListener('click', event => {
    if (event.target.dataset.clearAttachment !== undefined) clearPendingAttachment();
  });
}

if (imageBtn && fileImageEl) {
  imageBtn.addEventListener('click', () => fileImageEl.click());
  fileImageEl.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) setPendingAttachment('image', file);
    event.target.value = '';
  });
}
if (videoBtn && fileVideoEl) {
  videoBtn.addEventListener('click', () => fileVideoEl.click());
  fileVideoEl.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) setPendingAttachment('video', file);
    event.target.value = '';
  });
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});
inputEl.addEventListener('input', autoResize);

if (backBtn) {
  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
  });
}

boot();

// ===== 页面背景:深空粒子星域动效(缓慢漂浮光点 + 邻近连线) =====
(function initPageBg() {
  const canvas = document.getElementById('chat-page-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const DENSITY = 9000; // 每 9000 平方像素一个粒子
  const MAX_PARTICLES = 90;
  const LINK_DIST = 110;
  let particles = [];
  let rafId = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function initParticles() {
    const w = canvas.width;
    const h = canvas.height;
    const count = Math.min(MAX_PARTICLES, Math.round((w * h) / (DENSITY * dpr * dpr)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      vy: (Math.random() - 0.5) * 0.12 * dpr,
      r: (Math.random() * 1.2 + 0.6) * dpr,
    }));
  }

  function frame() {
    const w = canvas.width;
    const h = canvas.height;
    const linkDist = LINK_DIST * dpr;
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < linkDist) {
          ctx.strokeStyle = `rgba(0,132,255,${(1 - dist / linkDist) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150,200,255,0.85)';
      ctx.fill();
    });

    rafId = requestAnimationFrame(frame);
  }

  resize();
  initParticles();

  if (!prefersReducedMotion) {
    frame();
  } else {
    // 尊重"减少动态效果"系统偏好:只画一帧静态粒子,不做逐帧动画
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150,200,255,0.85)';
      ctx.fill();
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      initParticles();
    }, 200);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!prefersReducedMotion && !rafId) {
      frame();
    }
  });
})();
