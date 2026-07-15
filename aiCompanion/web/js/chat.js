const API_ORIGIN = localStorage.getItem('apiBase') || 'http://localhost:3100';
const API_BASE = API_ORIGIN + '/api';

const params = new URLSearchParams(location.search);
const versionId = parseInt(params.get('versionId'), 10);

const bodyEl = document.getElementById('chat-body');
const emptyEl = document.getElementById('chat-empty');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const titleEl = document.getElementById('chat-title');

if (!versionId) {
  emptyEl.textContent = '需要 versionId 参数(如 chat.html?versionId=1)';
  sendBtn.disabled = true;
}

// sessionKey:每个 versionId 独立一份,存 localStorage
const sessionKeyStorage = `chat_sessionKey_v${versionId}`;
let sessionKey = localStorage.getItem(sessionKeyStorage);
if (!sessionKey && versionId) {
  sessionKey = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '_' + Math.random().toString(36).slice(2));
  localStorage.setItem(sessionKeyStorage, sessionKey);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 行内 markdown(**粗体**) → 先转义 HTML 特殊字符,再包裹 <strong>,避免注入
function inlineMd(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isTableSeparator(line) {
  const t = line.trim();
  return /^\|?[-:\s|]+\|?$/.test(t) && t.includes('-');
}

// 轻量 markdown → 富文本渲染:标题变左侧蓝色竖条小标签、粗体高亮、引用保留左侧色条、
// 列表转绿色勾选、分隔线、表格转真表格(蓝底白字表头)。
// 不追求完整 CommonMark 覆盖,只覆盖 LLM 常见输出(标题/粗体/引用/列表/表格/分隔线)。
function renderMarkdown(raw) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^-{3,}$/.test(line.trim())) { html += '<hr>'; i++; continue; }

    const headerMatch = /^#{1,6}\s+(.*)$/.exec(line);
    if (headerMatch) { html += `<div class="md-section">${inlineMd(headerMatch[1])}</div>`; i++; continue; }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quoteLines.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += `<blockquote>${quoteLines.map(inlineMd).join('<br>')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      html += `<ul>${items.map(t => `<li>${inlineMd(t)}</li>`).join('')}</ul>`;
      continue;
    }

    if (/^\|.*\|$/.test(line.trim()) && isTableSeparator(lines[i + 1] || '')) {
      const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      i += 2; // 跳过表头行 + 分隔线行
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        i++;
      }
      const theadHtml = `<tr>${headerCells.map(c => `<th>${inlineMd(c)}</th>`).join('')}</tr>`;
      const tbodyHtml = rows.map(cells => `<tr>${cells.map(c => `<td>${inlineMd(c)}</td>`).join('')}</tr>`).join('');
      html += `<table>${theadHtml}${tbodyHtml}</table>`;
      continue;
    }

    // 段落:连续的普通文本行合并为一段(块级标记开头的行会中断合并)
    const paraLines = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^-{3,}$/.test(lines[i].trim()) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) html += `<p>${paraLines.map(inlineMd).join('<br>')}</p>`;
    else if (i < lines.length) { i++; } // 兜底避免死循环(理论上不会走到这里)
  }
  return html;
}

// 从 assistant 回复里剥出 ```herocard {...}``` 代码块,返回 {text, card}。
// 解析失败(JSON 不合法/缺字段)时 card 为 null,text 保持原文,由调用方兜底渲染纯文本。
function parseHeroCard(content) {
  const m = /```herocard\s*([\s\S]*?)```/.exec(content);
  if (!m) return { text: content, card: null };
  const text = content.slice(0, m.index).trim() + content.slice(m.index + m[0].length).trim();
  try {
    const data = JSON.parse(m[1].trim());
    if (!data || typeof data.name !== 'string') return { text: content, card: null };
    return { text, card: data };
  } catch {
    return { text: content, card: null };
  }
}

function renderHeroCard(card) {
  const name = escapeHtml(card.name || '');
  const faction = escapeHtml(card.faction || '');
  const rarity = Math.max(1, Math.min(5, parseInt(card.rarity, 10) || 0));
  const stars = rarity ? '★'.repeat(rarity) : '';
  const skills = Array.isArray(card.skills) ? card.skills : [];
  const skillsHtml = skills.map(s =>
    `<div class="hero-skill"><b>${escapeHtml(s.name || '')}</b>${s.enName ? ' ' + escapeHtml(s.enName) : ''}</div>`
  ).join('');
  const quote = card.quote ? `<div class="hero-quote">"${escapeHtml(card.quote)}"</div>` : '';
  const avatarInner = card.avatarUrl
    ? `<img src="${escapeHtml(card.avatarUrl)}" alt="${name}">`
    : escapeHtml(name.slice(0, 1));

  return `<div class="hero-card">
    <div class="hero-card-inner">
      <div class="hero-card-top">
        <div class="hero-avatar">${avatarInner}</div>
        <div>
          <div class="hero-name">${name}</div>
          ${stars ? `<div class="hero-stars">${stars}</div>` : ''}
          ${faction ? `<div class="hero-faction">${faction}</div>` : ''}
        </div>
      </div>
      ${skillsHtml ? `<div class="hero-skills">${skillsHtml}</div>` : ''}
      ${quote}
    </div>
  </div>`;
}

function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const isBot = role === 'assistant';
  const line = document.createElement('div');
  line.className = 'msg-line ' + (isBot ? 'bot' : 'user');
  let refsHtml = '';
  let imagesHtml = '';
  if (refs && refs.length) {
    refsHtml = `<div class="refs">参考 ${refs.length} 条: ${refs.map(r => `<span class="ref-item">#${r.entryId} (${r.score.toFixed(3)})</span>`).join('')}</div>`;
    const imgUrls = [...new Set(refs.flatMap(r => r.images || []))];
    if (imgUrls.length > 0) {
      imagesHtml = `<div class="ref-images">${imgUrls.map(url => {
        const full = API_ORIGIN + url;
        return `<img class="ref-thumb" src="${escapeHtml(full)}" data-full="${escapeHtml(full)}">`;
      }).join('')}</div>`;
    }
  }
  const avatarHtml = isBot ? `<div class="msg-avatar">${escapeHtml((titleEl.textContent || 'AI').slice(0, 1))}</div>` : '';

  let bodyHtml;
  if (isBot) {
    const { text, card } = parseHeroCard(content);
    const textHtml = text ? `<div class="bubble md">${renderMarkdown(text)}</div>` : '';
    const cardHtml = card ? renderHeroCard(card) : '';
    bodyHtml = `<div class="msg bot">${textHtml}${cardHtml}${imagesHtml}${refsHtml}</div>`;
  } else {
    bodyHtml = `<div class="msg user"><div class="bubble">${escapeHtml(content)}</div></div>`;
  }
  line.innerHTML = avatarHtml + bodyHtml;
  bodyEl.appendChild(line);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return line;
}

// 阶段名 → 图标/文案。与后端 chatService.js 的 onStage('retrieving'/'thinking') 一一对应,
// 不是循环播放的假动画,而是随真实 SSE 事件切换。
const STAGE_MAP = {
  retrieving: { icon: '🔍', text: '查询资料中' },
  thinking:   { icon: '✍️', text: '梳理回答中' },
};

// 全屏遮罩看原图,点遮罩关闭
function showFullImage(url) {
  const old = document.getElementById('img-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'img-overlay';
  overlay.className = 'img-overlay';
  const img = document.createElement('img');
  img.src = url;
  overlay.appendChild(img);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}
// 委托监听:缩略图点击放大(避免内联 onclick 的二次转义问题)
bodyEl.addEventListener('click', e => {
  if (e.target.classList.contains('ref-thumb')) showFullImage(e.target.dataset.full);
});

function appendThinking() {
  const initial = STAGE_MAP.retrieving;
  const line = document.createElement('div');
  line.className = 'msg-line bot thinking';
  line.innerHTML = `<div class="msg-avatar">${escapeHtml((titleEl.textContent || 'AI').slice(0, 1))}</div>` +
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
  if (!res.ok) throw new Error((data && data.error) || `请求失败(${res.status})`);
  return data;
}

async function boot() {
  if (!versionId) return;
  try {
    // 先取 welcome + 历史
    const [bot, history] = await Promise.all([
      fetchJSON(`/public/bot?versionId=${versionId}`),
      fetchJSON(`/public/history?versionId=${versionId}&sessionKey=${encodeURIComponent(sessionKey)}`),
    ]);
    if (history.messages.length === 0) {
      // 首次:显示欢迎语
      appendMsg('assistant', bot.welcome);
    } else {
      for (const m of history.messages) {
        const refs = m.refs_json ? (typeof m.refs_json === 'string' ? JSON.parse(m.refs_json) : m.refs_json) : null;
        appendMsg(m.role, m.content, refs);
      }
    }
  } catch (err) {
    emptyEl.textContent = '加载失败: ' + err.message;
  }
}

async function send() {
  const text = inputEl.value.trim();
  if (!text || sendBtn.disabled) return;
  inputEl.value = '';
  autoResize();
  appendMsg('user', text);
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
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
inputEl.addEventListener('input', autoResize);

boot();
