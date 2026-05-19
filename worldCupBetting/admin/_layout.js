// 公共布局、鉴权、API 工具，通过 <script src="_layout.js"> 引入
const API = 'http://localhost:3000/api';

function getToken() { return localStorage.getItem('wc_admin_token') || ''; }
function getUser()  { return JSON.parse(localStorage.getItem('wc_admin_user') || 'null'); }

function requireAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') { location.href = 'index.html'; throw 0; }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken(),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function logout() {
  localStorage.removeItem('wc_admin_token');
  localStorage.removeItem('wc_admin_user');
  location.href = 'index.html';
}

// 注入顶部导航
function injectNav(activePage) {
  const user = getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = `
    <div class="nav-inner">
      <div class="nav-brand">⚽ WC2026 管理</div>
      <div class="nav-links">
        <a href="dashboard.html" class="${activePage==='dashboard'?'active':''}">数据看板</a>
        <a href="matches.html"   class="${activePage==='matches'  ?'active':''}">赛程管理</a>
        <a href="users.html"     class="${activePage==='users'    ?'active':''}">用户管理</a>
      </div>
      <div class="nav-user">
        <span>${user ? user.nickname : ''}</span>
        <button onclick="logout()">退出</button>
      </div>
    </div>
  `;
}

// 通用表格分页
function renderPager(container, total, page, limit, onPage) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) { container.innerHTML = ''; return; }
  let html = `<div class="pager">`;
  if (page > 1)    html += `<button onclick="(${onPage.toString()})(${page-1})">‹</button>`;
  html += `<span>${page} / ${pages}</span>`;
  if (page < pages) html += `<button onclick="(${onPage.toString()})(${page+1})">›</button>`;
  html += `</div>`;
  container.innerHTML = html;
}
