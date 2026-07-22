const MENU_TITLES = {
  sessions: '会话管理',
  knowledge: '知识库管理',
  quality: '对话质量评分',
  simulations: '脚本测试',
  communitySync: '社区同步',
  users: '用户权限管理',
  bots: '机器人管理',
  versions: '版本管理',
};

const PAGE_STORAGE_KEY = 'currentAdminPage';

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
  navigate(getInitialPage());
}

function renderVersionSwitcher() {
  const sel = document.getElementById('version-select');
  sel.innerHTML = currentUser.versions
    .map(v => `<option value="${v.id}">${v.display_name}</option>`)
    .join('');

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
  document.querySelectorAll('#menu a').forEach(anchor => {
    anchor.addEventListener('click', () => navigate(anchor.dataset.page));
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(PAGE_STORAGE_KEY);
    location.href = 'index.html';
  });
}

function getInitialPage() {
  const savedPage = localStorage.getItem(PAGE_STORAGE_KEY);
  if (savedPage && Object.prototype.hasOwnProperty.call(MENU_TITLES, savedPage)) {
    return savedPage;
  }
  return 'sessions';
}

function navigate(page) {
  const targetPage = Object.prototype.hasOwnProperty.call(MENU_TITLES, page) ? page : 'sessions';
  localStorage.setItem(PAGE_STORAGE_KEY, targetPage);

  document.querySelectorAll('#menu a').forEach(anchor => {
    anchor.classList.toggle('active', anchor.dataset.page === targetPage);
  });

  const content = document.getElementById('content');
  if (targetPage === 'versions' && window.pages.versions) return window.pages.versions(content);
  if (targetPage === 'users' && window.pages.users) return window.pages.users(content);
  if (targetPage === 'knowledge' && window.pages.knowledge) return window.pages.knowledge(content);
  if (targetPage === 'quality' && window.pages.quality) return window.pages.quality(content);
  if (targetPage === 'simulations' && window.pages.simulations) return window.pages.simulations(content);
  if (targetPage === 'communitySync' && window.pages.communitySync) return window.pages.communitySync(content);
  if (targetPage === 'bots' && window.pages.bots) return window.pages.bots(content);
  if (targetPage === 'sessions' && window.pages.sessions) return window.pages.sessions(content);

  content.innerHTML = window.pages.placeholder(MENU_TITLES[targetPage] || targetPage);
}

document.addEventListener('DOMContentLoaded', boot);
