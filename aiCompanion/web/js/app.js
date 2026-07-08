const MENU_TITLES = {
  sessions: '会话管理', knowledge: '知识库管理',
  users: '用户权限管理', bots: '机器人管理', versions: '版本管理',
};

let currentUser = null;

async function boot() {
  try {
    currentUser = await window.api.apiFetch('/auth/me');
  } catch {
    location.href = 'index.html';
    return;
  }
  document.getElementById('user-name').textContent =
    currentUser.displayName + (currentUser.isSuperAdmin ? '（超管）' : '');

  renderVersionSwitcher();
  bindMenu();
  bindLogout();

  // 超管默认可见版本管理/用户管理；普通用户默认进会话
  navigate(currentUser.isSuperAdmin ? 'versions' : 'sessions');
}

function renderVersionSwitcher() {
  const sel = document.getElementById('version-select');
  sel.innerHTML = currentUser.versions
    .map(v => `<option value="${v.id}">${v.display_name}</option>`).join('');
  const saved = localStorage.getItem('currentVersionId');
  if (saved && currentUser.versions.some(v => String(v.id) === saved)) {
    sel.value = saved;
  } else if (currentUser.versions[0]) {
    localStorage.setItem('currentVersionId', currentUser.versions[0].id);
  }
  sel.addEventListener('change', () => {
    localStorage.setItem('currentVersionId', sel.value);
    const active = document.querySelector('#menu a.active');
    if (active) navigate(active.dataset.page);
  });
}

function bindMenu() {
  document.querySelectorAll('#menu a').forEach(a => {
    a.addEventListener('click', () => navigate(a.dataset.page));
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = 'index.html';
  });
}

function navigate(page) {
  document.querySelectorAll('#menu a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
  const content = document.getElementById('content');

  if (page === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (page === 'users' && window.pages.users) return window.pages.users(content);
  if (page === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  content.innerHTML = window.pages.placeholder(MENU_TITLES[page] || page);
}

document.addEventListener('DOMContentLoaded', boot);
