(function () {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const API = new URL(window.PUBLIC_OPINION_API || '/api/public-opinion', location.href);
  API.pathname = API.pathname.replace(/\/+$/, '');
  const protectedPath = path => path === API.pathname || path.startsWith(`${API.pathname}/`);
  let app;
  let identity;
  const style = document.createElement('style');
  style.textContent = '.po-auth-panel{position:fixed;inset:0;z-index:10000;display:grid;place-content:center;gap:12px;background:#f7f9fc;color:#344054;padding:32px;text-align:center}.po-auth-panel button{padding:8px 16px;cursor:pointer}.po-auth-user{position:fixed;right:16px;bottom:12px;z-index:50;display:flex;align-items:center;gap:10px;background:white;border:1px solid #d0d5dd;border-radius:6px;padding:8px 12px;font-size:12px}html[data-po-review="false"] :is([data-quality-action],#saveAlert,.batch-handling-bar,.single-handling-footer,[data-handling-id]){display:none!important}html[data-po-manage="false"] #reanalyzeBtn{display:none!important}html[data-po-manage="false"] a:is([href*="sources.html"],[href*="keywords.html"],[href*="collection-runs.html"]){display:none!important}';
  style.textContent += '.command-bar .po-auth-tools{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:100%;min-width:0}.command-bar .po-auth-tools>.top-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:100%}.po-auth-user{position:static;right:auto;bottom:auto;z-index:auto;flex-wrap:wrap;justify-content:flex-end;max-width:100%;color:#344054}.po-auth-user button{min-height:28px;cursor:pointer}@media(max-width:800px){.command-bar .po-auth-tools{width:100%;margin-top:12px}.po-auth-user{gap:8px}}';
  document.head.append(style);
  let panel;
  const domReady = document.readyState === 'loading' ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
  function mountUserBar(bar) {
    const header = document.querySelector('.command-bar');
    if (!header) { document.body.prepend(bar); return; }
    const scope = header.querySelector('[data-po-scope]');
    const tools = document.createElement('div'); tools.className = 'po-auth-tools';
    tools.append(bar);
    if (scope) tools.append(scope);
    header.append(tools);
  }
  async function show(message, retry = false) {
    await domReady;
    if (!panel) { panel = document.createElement('section'); panel.className = 'po-auth-panel'; panel.setAttribute('role', 'alert'); document.body.append(panel); }
    panel.replaceChildren();
    const text = document.createElement('div'); text.textContent = message; panel.append(text);
    if (retry) { const button = document.createElement('button'); button.textContent = '重新验证登录与权限'; button.onclick = () => { app?.auth.logout(); location.reload(); }; panel.append(button); }
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(new Error('冰川登录组件加载超时')); }, 15000);
      script.src = src;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('冰川登录组件加载失败')); };
      document.head.append(script);
    });
  }
  // The SDK currently exposes no public token getter. Keep this compatibility access isolated.
  function bearer() { if (!app?._token) throw new Error('未取得冰川登录凭证'); return `Bearer ${app._token}`; }
  const ready = (async () => {
    const response = await nativeFetch(`${API.href}/auth/config`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('无法读取登录配置');
    const config = (await response.json()).data;
    if (!config.enabled) return { enabled: false };
    await show('正在验证冰川登录身份…');
    await loadScript(config.sdkUrl);
    app = window.GlacierBaaS.init({ appKey: config.appKey, baseUrl: config.baseUrl });
    if (!app.auth.isLoggedIn()) {
      // q1op.com cannot obtain q1.com SameSite cookies. Do not create a redirect loop.
      if (location.hostname !== 'q1.com' && !location.hostname.endsWith('.q1.com')) throw new Error('请通过配置好的 q1.com 舆情访问地址登录；当前域名无法完成冰川 SSO');
      await app.auth.sso({ redirectOnGuest: true });
    }
    const session = await nativeFetch(`${API.href}/auth/session`, { headers: { Authorization: bearer() }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const result = await session.json();
    if (!session.ok) throw new Error(result.error?.message || '无法验证舆情访问权限');
    identity = result.data.identity;
    document.documentElement.dataset.poReview = String(identity.permissions.review);
    document.documentElement.dataset.poManage = String(identity.permissions.manage);
    if (!identity.permissions.manage && /\/(?:sources|keywords|collection-runs)\.html$/.test(location.pathname)) {
      location.replace('index.html'); return new Promise(() => {});
    }
    await domReady;
    panel?.remove();
    const bar = document.createElement('div'); bar.className = 'po-auth-user';
    const name = document.createElement('span'); name.textContent = `${identity.displayName || '冰川用户'} · ${identity.roles.join(' / ')}`; bar.append(name);
    if (identity.permissions.manage) {
      const manage = document.createElement('button'); manage.textContent = '成员与权限';
      manage.onclick = async () => { try { if (!app.admin.openManager) await loadScript(`${config.baseUrl}/glacier-baas-admin-ui.js`); app.admin.openManager(); } catch (error) { await show(error.message, true); } }; bar.append(manage);
    }
    const logout = document.createElement('button'); logout.textContent = '退出'; logout.onclick = () => { app.auth.logout(); location.reload(); }; bar.append(logout);
    mountUserBar(bar);
    return { enabled: true, identity };
  })();
  ready.catch(error => show(error.message || '冰川登录失败', true));
  window.PublicOpinionAuth = Object.freeze({ ready, currentUser: () => identity || null });
  window.fetch = async function (input, init) {
    const target = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (target.origin !== API.origin || !protectedPath(target.pathname) || target.pathname === `${API.pathname}/auth/config`) return nativeFetch(input, init);
    const state = await ready;
    if (!state.enabled) return nativeFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', bearer());
    headers.delete('x-admin-user');
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401) { app.auth.logout(); await show('登录已失效，请重新登录', true); }
    return response;
  };
})();
