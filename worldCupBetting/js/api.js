// 后端 API 封装
const WC_API = (function () {
  const BASE = 'http://localhost:3000/api';

  function getToken() {
    return localStorage.getItem('wc_token') || '';
  }

  async function request(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { 'Authorization': 'Bearer ' + getToken() } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  return {
    // 鉴权
    login:    (username, password) => request('/auth/login',    { method: 'POST', body: { username, password } }),
    register: (username, password, nickname) =>
                request('/auth/register', { method: 'POST', body: { username, password, nickname } }),
    me:       () => request('/auth/me'),

    // 赛程
    getMatches: (date, stage) => {
      const q = new URLSearchParams();
      if (date)  q.set('date', date);
      if (stage) q.set('stage', stage);
      return request('/matches?' + q);
    },
    getMatchDates: (stage) => request('/matches/dates?stage=' + (stage || 'group')),

    // 投注
    submitPick: (match_id, side, amount) =>
                  request('/picks', { method: 'POST', body: { match_id, side, amount } }),
    myPicks:    (status, page) => {
      const q = new URLSearchParams({ page: page || 1 });
      if (status && status !== 'all') q.set('status', status);
      return request('/picks/me?' + q);
    },

    // 排行榜
    ranking: (range) => request('/records/ranking?range=' + (range || 'all')),

    // 本地 token 管理
    saveSession: (token, user) => {
      localStorage.setItem('wc_token', token);
      localStorage.setItem('wc_user', JSON.stringify(user));
    },
    loadUser: () => {
      try { return JSON.parse(localStorage.getItem('wc_user') || 'null'); } catch { return null; }
    },
    clearSession: () => {
      localStorage.removeItem('wc_token');
      localStorage.removeItem('wc_user');
    },
    isLoggedIn: () => !!localStorage.getItem('wc_token'),
  };
})();
