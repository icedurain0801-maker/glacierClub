const API_BASE = (localStorage.getItem('apiBase') || 'http://localhost:3100') + '/api';

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

function appendMsg(role, content, refs) {
  if (emptyEl.parentNode) emptyEl.remove();
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'assistant' ? 'bot' : 'user');
  let refsHtml = '';
  if (refs && refs.length) {
    refsHtml = `<div class="refs">参考自 ${refs.length} 条知识:${refs.map(r => `#${r.entryId}(${r.score.toFixed(3)})`).join(' ')}</div>`;
  }
  div.innerHTML = escapeHtml(content) + refsHtml;
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
}

function appendThinking() {
  const div = document.createElement('div');
  div.className = 'msg bot thinking';
  div.textContent = '思考中…';
  bodyEl.appendChild(div);
  bodyEl.scrollTop = bodyEl.scrollHeight;
  return div;
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
    const r = await fetchJSON('/public/chat', {
      method: 'POST',
      body: { versionId, sessionKey, message: text },
    });
    thinking.remove();
    appendMsg('assistant', r.reply, r.refs);
  } catch (err) {
    thinking.remove();
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
