const API_BASE = (localStorage.getItem('apiBase') || 'http://localhost:3100') + '/api';

function getToken() { return localStorage.getItem('token'); }
function getVersionId() { return localStorage.getItem('currentVersionId'); }

async function apiFetch(path, { method = 'GET', body, withVersion = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (withVersion) {
    const vid = getVersionId();
    if (vid) headers['X-Version-Id'] = vid;
  }
  const res = await fetch(API_BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/') {
      location.href = 'index.html';
    }
    throw new Error('未登录');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 403) alert((data && data.error) || '无权限访问该版本');
    throw new Error((data && data.error) || `请求失败(${res.status})`);
  }
  return data;
}

window.api = { apiFetch, getToken, getVersionId };
