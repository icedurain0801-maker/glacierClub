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
const statusEl = document.getElementById('chat-input-status');

const DEFAULT_BOT_NAME = '陪玩助手';
const SESSION_SCHEMA_VERSION = '20260717_contextfix_1';
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const STAGE_MAP = {
  retrieving: { icon: '📚', text: '正在查询资料...' },
  thinking: { icon: '✨', text: '正在整理回答...' },
};
const EMOJIS = ['😀', '😂', '😊', '😍', '🥰', '😎', '🤔', '😅', '😭', '😡', '👍', '👎', '❤️', '🔥', '🎉', '✨', '🙏', '💪', '🎮', '🌟', '😴', '🤗'];

let botAvatarUrl = '';
let pendingAttachment = null;
let composerLayoutTick = 0;

if (!versionId) {
  emptyEl.textContent = '需要 versionId 参数，例如 chat.html?versionId=1';
  sendBtn.disabled = true;
}

const legacySessionKeyStorage = `chat_sessionKey_v${versionId}`;
const sessionKeyStorage = `chat_sessionKey_${SESSION_SCHEMA_VERSION}_v${versionId}`;
if (versionId) localStorage.removeItem(legacySessionKeyStorage);

let sessionKey = localStorage.getItem(sessionKeyStorage);
if (!sessionKey && versionId) {
  sessionKey = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '_' + Math.random().toString(36).slice(2));
  localStorage.setItem(sessionKeyStorage, sessionKey);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  const linked = escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(^|[\s(])((https?:\/\/|www\.)[^\s<]+)/g, (match, prefix, url) => {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  return linked.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isTableSeparator(line) {
  const text = String(line || '').trim();
  return /^\|?[-:\s|]+\|?$/.test(text) && text.includes('-');
}

// 【方框标题】按关键词分配强调色(游戏 wiki 风):时间类蓝、条件类绿、规则类橙、奖励类金,
// 未命中关键词的兜底用蓝(与 ## 标题卡片同色系保持一致)。
const BRACKET_TITLE_COLOR_RULES = [
  { re: /时间|开启|周期|日期|赛程|阶段/, cls: 'c-time' },
  { re: /条件|参与|资格|要求|门槛/, cls: 'c-cond' },
  { re: /规则|机制|玩法|流程|说明/, cls: 'c-rule' },
  { re: /奖励|奖品|结算|收益|积分/, cls: 'c-reward' },
];
function bracketTitleColorClass(title) {
  const hit = BRACKET_TITLE_COLOR_RULES.find(rule => rule.re.test(title));
  return hit ? hit.cls : 'c-time';
}

function renderMarkdown(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let index = 0;
  let sectionOpen = false; // 是否有未收口的 ## 分段卡片
  let panelOpen = false; // 是否有未收口的【】强调色面板(c-panel div)
  let panelListOpen = false; // 面板内的 .c-list <ul> 是否处于未收口状态
  // 面板内先收口 <ul>(它不能直接包 <p>),再决定是否连面板 div 一起收口
  const closePanelList = () => { if (panelListOpen) { html += '</ul>'; panelListOpen = false; } };
  const closeSection = () => { if (sectionOpen) { html += '</div>'; sectionOpen = false; } };
  const closePanel = () => { closePanelList(); if (panelOpen) { html += '</div>'; panelOpen = false; } };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      closeSection(); closePanel();
      html += '<hr>';
      index += 1;
      continue;
    }

    // ## 标题:先收口上一张卡片,再开一张新卡,后续正文/列表流入本卡直到下个标题或分隔线或结尾
    const headerMatch = /^#{1,6}\s+(.*)$/.exec(line);
    if (headerMatch) {
      closeSection(); closePanel();
      html += `<div class="md-section-card"><div class="md-section">${renderInline(headerMatch[1])}</div>`;
      sectionOpen = true;
      index += 1;
      continue;
    }

    // 【方框标题】:独占一行,按关键词分配强调色,开一张信息面板,后续数字列表/续写段落流入面板直到下个标题/分隔线/结尾
    const bracketMatch = /^【(.+)】$/.exec(line.trim());
    if (bracketMatch) {
      closeSection(); closePanel();
      const colorCls = bracketTitleColorClass(bracketMatch[1]);
      html += `<div class="c-panel ${colorCls}"><div class="c-title">${renderInline(bracketMatch[1])}</div>`;
      panelOpen = true;
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closePanelList();
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      html += `<blockquote>${quoteLines.map(renderInline).join('<br>')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      closePanelList(); // 无序列表是独立的 <ul>,不能嵌进面板还未收口的 <ul> 里
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      html += `<ul>${items.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
      continue;
    }

    // 数字列表(1.xxx / 1、xxx):面板打开时把 <li> 流入面板的 .c-list(缺失则现开一个),否则包一层普通 <ul>
    const numberedMatch = /^\d+[.、]\s*(.*)$/.exec(line);
    if (numberedMatch) {
      const items = [];
      while (index < lines.length) {
        const m = /^\d+[.、]\s*(.*)$/.exec(lines[index]);
        if (!m) break;
        items.push(m[1]);
        index += 1;
      }
      const itemsHtml = items.map(item => `<li>${renderInline(item)}</li>`).join('');
      if (panelOpen) {
        if (!panelListOpen) { html += '<ul class="c-list">'; panelListOpen = true; }
        html += itemsHtml;
      } else {
        html += `<ul>${itemsHtml}</ul>`;
      }
      continue;
    }

    if (/^\|.*\|$/.test(line.trim()) && isTableSeparator(lines[index + 1] || '')) {
      closePanelList();
      const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
        rows.push(lines[index].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
        index += 1;
      }
      const theadHtml = `<tr>${headerCells.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr>`;
      const tbodyHtml = rows.map(cells => `<tr>${cells.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('');
      html += `<div class="md-table-scroll"><table>${theadHtml}${tbodyHtml}</table></div><div class="md-scroll-hint">左右滑动查看完整表格</div>`;
      continue;
    }

    // 段落(含面板内数字列表后的续写文字):先收口面板里未闭合的 <ul>,<p> 作为面板 div 内的兄弟节点插入
    closePanelList();
    const paragraphLines = [];
    while (
      index < lines.length && lines[index].trim() &&
      !/^-{3,}$/.test(lines[index].trim()) &&
      !/^#{1,6}\s+/.test(lines[index]) &&
      !/^【(.+)】$/.test(lines[index].trim()) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+[.、]\s*/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    html += `<p>${paragraphLines.map(renderInline).join('<br>')}</p>`;
  }

  closeSection(); // 收口最后一张未闭合的 ## 分段卡片
  closePanel(); // 收口最后一张未闭合的【】强调色面板(含面板内未闭合的 <ul>)
  return html;
}

function buildImageUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized) || /^data:/i.test(normalized)) return normalized;
  return `${API_ORIGIN}${normalized}`;
}

function normalizeImageCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const x = Number(crop.x);
  const y = Number(crop.y);
  const width = Number(crop.width);
  const height = Number(crop.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || width >= 1 || height >= 1) return null;
  if (x < 0 || y < 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

function parseHeroCard(content) {
  const match = /```herocard\s*([\s\S]*?)```/.exec(String(content || ''));
  if (!match) return { text: String(content || ''), card: null };
  const leading = String(content || '').slice(0, match.index).trim();
  const trailing = String(content || '').slice(match.index + match[0].length).trim();
  const text = [leading, trailing].filter(Boolean).join('\n\n');
  try {
    const card = JSON.parse(match[1].trim());
    return card && typeof card.name === 'string' ? { text, card } : { text: String(content || ''), card: null };
  } catch {
    return { text: String(content || ''), card: null };
  }
}

function renderHeroCard(card) {
  const name = escapeHtml(card.name || '');
  const title = escapeHtml(card.title || '');
  const faction = escapeHtml(card.faction || '');
  const career = escapeHtml(card.career || card.className || '');
  const rarity = escapeHtml(card.rarity || '');
  const avatarUrl = buildImageUrl(card.avatarUrl);
  const factionIconUrl = buildImageUrl(card.factionIconUrl);
  const careerIconUrl = buildImageUrl(card.careerIconUrl);
  const quote = escapeHtml(card.quote || '').replace(/\n/g, '<br>');
  const skills = (Array.isArray(card.skills) ? card.skills : []).slice(0, 4);
  const tags = [
    faction ? `<div class="hero-icon-tag ${factionIconUrl ? 'hero-icon-tag-image' : ''}"><span class="hero-icon-tag-ic ${factionIconUrl ? 'hero-icon-tag-ic-image' : ''}">${factionIconUrl ? `<img src="${escapeHtml(factionIconUrl)}" alt="${faction}" loading="lazy">` : '🛡️'}</span><span class="hero-icon-tag-tx">${faction}</span></div>` : '',
    career ? `<div class="hero-icon-tag ${careerIconUrl ? 'hero-icon-tag-image' : ''}"><span class="hero-icon-tag-ic ${careerIconUrl ? 'hero-icon-tag-ic-image' : ''}">${careerIconUrl ? `<img src="${escapeHtml(careerIconUrl)}" alt="${career}" loading="lazy">` : '💥'}</span><span class="hero-icon-tag-tx">${career}</span></div>` : '',
  ].filter(Boolean).join('');

  const skillIcons = skills.map((skill, index) => {
    const skillIndex = parseInt(skill.index, 10) || index + 1;
    const skillName = escapeHtml(skill.name || skill.label || `技能${skillIndex}`);
    const skillImageUrl = buildImageUrl(skill.imageUrl);
    const skillImageCrop = normalizeImageCrop(skill.imageCrop);
    const cropStyle = skillImageCrop
      ? ` style="--crop-x:${skillImageCrop.x};--crop-y:${skillImageCrop.y};--crop-w:${skillImageCrop.width};--crop-h:${skillImageCrop.height};"`
      : '';
    const imageMarkup = skillImageUrl
      ? `<img src="${escapeHtml(skillImageUrl)}" alt="${skillName}" loading="lazy"${cropStyle}>`
      : '';
    return `<button type="button" class="hero-skill-icon-btn ${index === 0 ? 'active' : ''}" data-skill-index="${index}"><span class="hero-skill-icon hero-media ${skillImageUrl ? 'has-image' : ''} ${skillImageCrop ? 'is-cropped' : ''}">${imageMarkup}<span class="hero-skill-fallback">${skillIndex}</span></span>${skill.isCore ? '<span class="hero-skill-core-dot"></span>' : ''}</button>`;
  }).join('');

  const skillDetails = skills.map((skill, index) => {
    const skillIndex = parseInt(skill.index, 10) || index + 1;
    const skillLabel = escapeHtml(skill.label || `技能${skillIndex}`);
    const skillName = escapeHtml(skill.name || skill.label || `技能${skillIndex}`);
    const skillDesc = escapeHtml(skill.description || '').replace(/\n/g, '<br>');
    return `<div class="hero-skill-detail ${index === 0 ? 'active' : ''}" data-skill-index="${index}"><div class="hero-skill-detail-top"><span class="hero-skill-tag">${skillLabel}</span>${skill.isCore ? '<span class="hero-skill-core">核心</span>' : ''}</div><div class="hero-skill-name">${skillName}</div>${skillDesc ? `<div class="hero-skill-desc">${skillDesc}</div>` : ''}</div>`;
  }).join('');

  return `<div class="hero-card"><div class="hero-card-inner"><div class="hero-card-header">${rarity ? `<div class="hero-ribbon">${rarity}</div>` : ''}<div class="hero-avatar hero-media ${avatarUrl ? 'has-image' : ''}">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="${name}" loading="lazy">` : ''}<span class="hero-avatar-fallback">${escapeHtml((card.name || '角').trim().slice(0, 1) || '角')}</span></div><div class="hero-card-summary">${title ? `<div class="hero-title">${title}</div>` : ''}<div class="hero-name">${name}</div>${tags ? `<div class="hero-icon-tags">${tags}</div>` : ''}</div></div>${skillIcons ? `<div class="hero-skills"><div class="hero-section-title">技能</div><div class="hero-skill-icon-row">${skillIcons}</div><div class="hero-skill-details">${skillDetails}</div></div>` : ''}${quote ? `<div class="hero-quote"><div class="hero-section-title">英雄台词</div><div class="hero-quote-text">${quote}</div></div>` : ''}</div></div>`;
}

function fallbackAvatarMarkup(labelText) {
  const text = String(labelText || titleEl.textContent || 'AI').trim();
  return escapeHtml(text.slice(0, 1).toUpperCase() || 'AI');
}

function renderBotAvatarMarkup() {
  if (botAvatarUrl) return `<img src="${escapeHtml(botAvatarUrl)}" alt="${escapeHtml(titleEl.textContent || 'AI')}">`;
  return fallbackAvatarMarkup();
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

function bindRefImageFallbacks(root) {
  root.querySelectorAll('.ref-thumb').forEach(img => {
    img.addEventListener('error', () => {
      const wrapper = img.closest('.ref-images');
      img.remove();
      if (wrapper && !wrapper.querySelector('.ref-thumb')) wrapper.remove();
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

function parseRefsPayload(rawValue) {
  if (!rawValue) return null;
  try {
    const refs = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    return Array.isArray(refs) ? refs : null;
  } catch {
    return null;
  }
}

function shouldRenderRefImages({ card, refs, text }) {
  if (card) return false;
  if (!Array.isArray(refs) || refs.length === 0) return false;

  const visibleText = String(text || '').trim();
  if (!visibleText) return false;

  const explicitImageIntent = /(?:见图|看图|如下图|配图|图片如下|如图所示|参考图片|上传的图片|你发的图片|视频截图|截图里|图里)/u.test(visibleText);
  const narrowSingleRef = refs.length === 1 && Number(refs[0]?.score || 0) >= 0.72;
  return explicitImageIntent || narrowSingleRef;
}

function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const isBot = role === 'assistant';
  const line = document.createElement('div');
  line.className = `msg-line ${isBot ? 'bot' : 'user'}`;

  const avatarHtml = isBot ? `<div class="msg-avatar ${botAvatarUrl ? 'has-image' : ''}">${renderBotAvatarMarkup()}</div>` : '';
  let bodyHtml = '';

  if (isBot) {
    const { text, card } = parseHeroCard(content);
    const refImages = shouldRenderRefImages({ card, refs, text })
      ? [...new Set(refs.flatMap(ref => Array.isArray(ref.images) ? ref.images : []))].map(buildImageUrl).filter(Boolean)
      : [];
    const imagesHtml = refImages.length ? `<div class="ref-images">${refImages.map(url => `<img class="ref-thumb" src="${escapeHtml(url)}" data-full="${escapeHtml(url)}" loading="lazy">`).join('')}</div>` : '';
    const textHtml = text ? `<div class="bubble md">${renderMarkdown(text)}</div>` : '';
    const cardHtml = card ? renderHeroCard(card) : '';
    bodyHtml = `<div class="msg bot">${textHtml}${cardHtml}${card ? '' : imagesHtml}</div>`;
  } else {
    bodyHtml = `<div class="msg user"><div class="bubble">${escapeHtml(content)}</div></div>`;
  }

  line.innerHTML = avatarHtml + bodyHtml;
  bodyEl.appendChild(line);
  bindBotAvatarFallbacks(line);
  bindRefImageFallbacks(line);
  bindHeroImageFallbacks(line);
  scrollChatToBottom();
  return line;
}

function scrollChatToBottom() {
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

function scheduleComposerLayoutSync() {
  const tick = ++composerLayoutTick;
  requestAnimationFrame(() => {
    if (tick !== composerLayoutTick) return;
    scrollChatToBottom();
  });
}

function renderBotHeader(bot) {
  const displayName = String(bot && bot.displayName ? bot.displayName : DEFAULT_BOT_NAME).trim() || DEFAULT_BOT_NAME;
  titleEl.textContent = displayName;
  botAvatarUrl = bot && bot.avatarUrl ? String(bot.avatarUrl) : '';

  if (botAvatarUrl) {
    avatarEl.classList.add('has-image');
    avatarEl.innerHTML = `<img src="${escapeHtml(botAvatarUrl)}" alt="${escapeHtml(displayName)}">`;
    const img = avatarEl.querySelector('img');
    if (img) {
      img.addEventListener('error', () => {
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
  overlay.innerHTML = `<div class="img-overlay__dialog"><img src="${escapeHtml(url)}" alt="知识库图片预览"><button class="img-overlay__close" type="button" aria-label="关闭图片预览">×</button></div>`;
  overlay.addEventListener('click', closeImageOverlay);
  overlay.querySelector('.img-overlay__dialog').addEventListener('click', event => event.stopPropagation());
  overlay.querySelector('.img-overlay__close').addEventListener('click', event => {
    event.stopPropagation();
    closeImageOverlay();
  });
  document.body.appendChild(overlay);
  document.body.classList.add('kb-image-overlay-open');
}

bodyEl.addEventListener('click', event => {
  if (event.target.classList.contains('ref-thumb')) showFullImage(event.target.dataset.full);
  const skillBtn = event.target.closest('.hero-skill-icon-btn');
  if (!skillBtn) return;
  const card = skillBtn.closest('.hero-card');
  if (!card) return;
  const idx = skillBtn.dataset.skillIndex;
  card.querySelectorAll('.hero-skill-icon-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.skillIndex === idx));
  card.querySelectorAll('.hero-skill-detail').forEach(detail => detail.classList.toggle('active', detail.dataset.skillIndex === idx));
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeImageOverlay();
});

function appendThinking() {
  const initial = STAGE_MAP.retrieving;
  const line = document.createElement('div');
  line.className = 'msg-line bot thinking';
  line.innerHTML = `<div class="msg-avatar ${botAvatarUrl ? 'has-image' : ''}">${renderBotAvatarMarkup()}</div><div class="msg bot thinking"><div class="bubble"><span class="thinking-icon">${initial.icon}</span><span class="thinking-text">${initial.text}</span></div></div>`;
  bodyEl.appendChild(line);
  scheduleComposerLayoutSync();
  return line;
}

function setThinkingStage(line, stage) {
  const current = STAGE_MAP[stage];
  if (!current) return;
  const iconEl = line.querySelector('.thinking-icon');
  const textEl = line.querySelector('.thinking-text');
  if (iconEl) iconEl.textContent = current.icon;
  if (textEl) textEl.textContent = current.text;
}

function removeThinking(line) {
  if (line && line.parentNode) line.remove();
}

function parseSSEFrame(frame) {
  let event = 'message';
  let dataStr = '';
  for (const rawLine of frame.split('\n')) {
    if (rawLine.startsWith('event:')) event = rawLine.slice(6).trim();
    if (rawLine.startsWith('data:')) dataStr += rawLine.slice(5).trim();
  }
  let data = null;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = null;
  }
  return { event, data };
}

async function fetchJSON(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `请求失败(${res.status})`);
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
    emptyEl.textContent = '加载失败: ' + err.message;
  }
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
  scheduleComposerLayoutSync();
}

function setComposerBusy(isBusy) {
  sendBtn.disabled = !!isBusy;
  inputEl.disabled = !!isBusy;
  if (emojiBtn) emojiBtn.disabled = !!isBusy;
  if (imageBtn) imageBtn.disabled = !!isBusy;
  if (videoBtn) videoBtn.disabled = !!isBusy;
}

function setComposerStatus(text, tone = '') {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.className = 'chat-input-status';
  if (tone === 'busy') statusEl.classList.add('is-busy');
  if (tone === 'error') statusEl.classList.add('is-error');
  scheduleComposerLayoutSync();
}

function validateAttachment(kind, file) {
  if (!file) return '';
  const type = String(file.type || '').toLowerCase();
  if (kind === 'image') {
    if (!IMAGE_MIME_TYPES.has(type)) return '图片仅支持 PNG/JPG/WEBP/GIF';
    if (file.size > IMAGE_MAX_BYTES) return '图片不能超过 10MB';
    return '';
  }
  if (!VIDEO_MIME_TYPES.has(type)) return '视频仅支持 MP4/WEBM/MOV';
  if (file.size > VIDEO_MAX_BYTES) return '视频不能超过 25MB';
  return '';
}

async function buildVideoPreviewDataUrl(file) {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('视频预览帧生成失败')), { once: true });
    });
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    if (!width || !height) throw new Error('视频预览帧生成失败');
    const maxEdge = 960;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('视频预览帧生成失败');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute('src');
    video.load();
  }
}

function clearPendingAttachment() {
  if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
  pendingAttachment = null;
  if (previewEl) previewEl.innerHTML = '';
  setComposerStatus('', '');
  scheduleComposerLayoutSync();
}

function shortenAttachmentName(name) {
  const value = String(name || '').trim();
  if (!value || value.length <= 18) return value || '附件';
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex >= value.length - 1) return `${value.slice(0, 15)}...`;
  const ext = value.slice(dotIndex);
  const base = value.slice(0, dotIndex);
  return `${base.slice(0, Math.max(8, 15 - ext.length))}...${ext}`;
}

function setPendingAttachment(kind, file) {
  if (!previewEl) return;
  const validationError = validateAttachment(kind, file);
  if (validationError) {
    setComposerStatus(validationError, 'error');
    return;
  }
  if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
  const url = URL.createObjectURL(file);
  pendingAttachment = { kind, file, url };
  const thumb = kind === 'image' ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(file.name || '图片附件')}">` : '🎬';
  previewEl.innerHTML = `<span class="chip-preview"><span class="thumb">${thumb}</span><span class="chip-label">${escapeHtml(shortenAttachmentName(file.name))}</span><button type="button" class="rm" data-clear-attachment aria-label="移除附件">×</button></span>`;
  setComposerStatus('', '');
  scheduleComposerLayoutSync();
}

async function send() {
  const text = inputEl.value.trim();
  if ((!text && !pendingAttachment) || sendBtn.disabled) return;
  if (pendingAttachment && !text) {
    setComposerStatus('请先输入问题文字，再和附件一起发送。', 'error');
    inputEl.focus();
    return;
  }

  inputEl.value = '';
  autoResize();
  appendMsg('user', text);
  setComposerStatus('', '');
  setComposerBusy(true);
  const thinking = appendThinking();

  try {
    let res;
    if (pendingAttachment) {
      const form = new FormData();
      form.append('versionId', String(versionId));
      form.append('sessionKey', sessionKey);
      form.append('message', text);
      form.append('attachment', pendingAttachment.file);
      if (pendingAttachment.kind === 'video') {
        setComposerStatus('正在生成视频预览帧...', 'busy');
        form.append('attachmentPreviewDataUrl', await buildVideoPreviewDataUrl(pendingAttachment.file));
      }
      setComposerStatus('正在上传并解析附件...', 'busy');
      res = await fetch(API_BASE + '/public/chat', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: form,
      });
    } else {
      res = await fetch(API_BASE + '/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ versionId, sessionKey, message: text }),
      });
    }

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || `请求失败(${res.status})`);
    }

    setComposerStatus('正在生成回复...', 'busy');
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
          clearPendingAttachment();
          setComposerStatus('', '');
        } else if (event === 'error' && data) {
          settled = true;
          removeThinking(thinking);
          const errorMessage = String(data.error || '请求失败');
          setComposerStatus(errorMessage, 'error');
          appendMsg('assistant', `(出错: ${errorMessage})`);
        }
      }
    }

    if (!settled) throw new Error('连接中断，未收到完整回复');
  } catch (err) {
    removeThinking(thinking);
    setComposerStatus(err.message, 'error');
    appendMsg('assistant', `(出错: ${err.message})`);
  } finally {
    setComposerBusy(false);
    inputEl.focus();
  }
}

if (emojiPanel) {
  emojiPanel.innerHTML = EMOJIS.map(emoji => `<span>${escapeHtml(emoji)}</span>`).join('');
}

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

if (previewEl) {
  previewEl.addEventListener('click', event => {
    const clearBtn = event.target.closest('[data-clear-attachment]');
    if (!clearBtn || sendBtn.disabled) return;
    clearPendingAttachment();
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
