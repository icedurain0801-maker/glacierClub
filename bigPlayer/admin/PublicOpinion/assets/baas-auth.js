(function () {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  async function resilientRead(input, init = {}, attempts = 3) {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') return nativeFetch(input, init);
    const callerSignal = init.signal || (input instanceof Request ? input.signal : undefined);
    const pathname = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
    const aggregate = /\/(?:overview|overview-trend|contents|quality-contents)$/.test(pathname);
    // A cold aggregate may exceed 10s. Keep one total budget across retries,
    // rather than abandoning it and multiplying still-running database work.
    const budget = aggregate ? AbortSignal.timeout(25000) : null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      callerSignal?.throwIfAborted();
      budget?.throwIfAborted();
      try {
        const timeout = budget || AbortSignal.timeout(10000);
        const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
        const response = await nativeFetch(input instanceof Request ? input.clone() : input, { ...init, signal });
        if (![500, 502, 503, 504].includes(response.status) || (aggregate && response.status === 504) || attempt === attempts - 1) return response;
        await response.body?.cancel();
      } catch (error) {
        if (callerSignal?.aborted || budget?.aborted || attempt === attempts - 1 || !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) throw error;
      }
      await new Promise((resolve, reject) => {
        const cleanup = () => { callerSignal?.removeEventListener('abort', cancel); budget?.removeEventListener('abort', cancel); };
        const finish = () => { cleanup(); resolve(); };
        const timer = setTimeout(finish, [500, 1500, 3000][attempt] || 3000);
        const cancel = () => { clearTimeout(timer); cleanup(); reject(callerSignal?.aborted ? callerSignal.reason : budget.reason); };
        callerSignal?.addEventListener('abort', cancel, { once: true });
        budget?.addEventListener('abort', cancel, { once: true });
        if (callerSignal?.aborted || budget?.aborted) cancel();
      });
    }
  }
  const API = new URL(window.PUBLIC_OPINION_API || '/api/public-opinion', location.href);
  API.pathname = API.pathname.replace(/\/+$/, '');
  const protectedPath = path => path === API.pathname || path.startsWith(`${API.pathname}/`);
  function showCloudCoverage(response) {
    if (response.headers.get('x-data-source') !== 'baas' || document.querySelector('[data-po-cloud-coverage]')) return response;
    const main = document.querySelector('.admin-main');
    if (main) {
      const note = document.createElement('p'); note.dataset.poCloudCoverage = 'true';
      note.textContent = 'BaaS 数据：已迁移 10/12 起的内容；更早日期尚未迁入。';
      note.style.cssText = 'margin:0 0 12px;color:#667085;font-size:12px;line-height:1.6';
      main.prepend(note);
    }
    return response;
  }
  let app;
  let identity;
  const loginRecoveryKey = 'public-opinion:sso-login-recovery';
  const networkFailure = error => error?.name === 'TypeError' || error?.name === 'TimeoutError' || error?.name === 'AbortError';
  let loginStage = 'config';
  const logoutKey = 'public-opinion:manual-logout';
  let signedOut = localStorage.getItem(logoutKey) === '1';
  const loginRequired = () => new Response(JSON.stringify({ error: { code: 'BAAS_LOGIN_REQUIRED', message: '已退出登录，请重新登录' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  async function showSignedOut() {
    identity = null;
    document.documentElement.dataset.poReview = 'false';
    document.documentElement.dataset.poManage = 'false';
    document.querySelectorAll('.po-auth-user').forEach(element => element.remove());
    await show('已退出舆情系统');
    const button = document.createElement('button'); button.textContent = '重新登录';
    button.onclick = () => { localStorage.removeItem(logoutKey); location.reload(); };
    panel.append(button);
  }
  function signOut() {
    signedOut = true;
    localStorage.setItem(logoutKey, '1');
    try { app?.auth.logout(); } finally { void showSignedOut(); }
  }
  window.addEventListener('storage', event => {
    if (event.key === logoutKey && event.newValue === '1') signOut();
  });
  const style = document.createElement('style');
  style.textContent = '.po-auth-panel{position:fixed;inset:0;z-index:10000;display:grid;place-content:center;gap:12px;background:#f7f9fc;color:#344054;padding:32px;text-align:center}.po-auth-panel button{padding:8px 16px;cursor:pointer}.po-auth-user{position:fixed;right:16px;bottom:12px;z-index:50;display:flex;align-items:center;gap:10px;background:white;border:1px solid #d0d5dd;border-radius:6px;padding:8px 12px;font-size:12px}html[data-po-review="false"] :is([data-quality-action],#saveAlert,.batch-handling-bar,.single-handling-footer,[data-handling-id]){display:none!important}html[data-po-manage="false"] #reanalyzeBtn{display:none!important}html[data-po-manage="false"] a:is([href*="sources.html"],[href*="keywords.html"],[href*="collection-runs.html"],[href*="single-post-analysis.html"]){display:none!important}';
  style.textContent += '.command-bar{background:linear-gradient(120deg,#142f57,#1c477e 58%,#285d96)!important;color:#fff!important;border-color:rgba(255,255,255,.12)!important}.command-bar .eyebrow{color:#9fceff!important}.command-bar h1{color:#fff!important}.command-bar p{color:rgba(255,255,255,.78)!important}.command-bar .po-auth-tools{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:100%;min-width:0}.command-bar .po-auth-tools>.top-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;max-width:100%}.command-bar [data-po-scope] .select,.command-bar select{background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.26)!important;color:#fff!important}.command-bar select option{color:#1a2b45}.po-auth-user{position:static;right:auto;bottom:auto;z-index:auto;display:block;max-width:100%;padding:0;border:0;background:transparent;color:#fff}.po-auth-user-menu{position:relative}.po-auth-user-menu>summary{list-style:none}.po-auth-user-menu>summary::-webkit-details-marker{display:none}.po-auth-user-trigger{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 11px 4px 4px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.09);color:#fff;cursor:pointer;user-select:none}.po-auth-user-trigger:hover,.po-auth-user-menu[open] .po-auth-user-trigger{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3)}.po-auth-user-trigger:focus-visible{outline:2px solid #b9dcff;outline-offset:2px}.po-auth-avatar{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;border-radius:50%;background:#eef5ff;color:#1d5fbf;font-size:14px;font-weight:700}.po-auth-identity{display:flex;align-items:center;gap:7px;min-width:0;text-align:left}.po-auth-name{max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;color:#fff}.po-auth-role{display:inline-flex;align-items:center;min-height:20px;padding:1px 6px;border:1px solid rgba(255,255,255,.28);border-radius:4px;color:rgba(255,255,255,.9);font-size:11px;line-height:1.2;white-space:nowrap}.po-auth-chevron{color:rgba(255,255,255,.82);font-size:14px;transition:transform .15s ease}.po-auth-user-menu[open] .po-auth-chevron{transform:rotate(180deg)}.po-auth-popover{position:absolute;right:0;top:calc(100% + 8px);z-index:120;width:218px;padding:6px;border:1px solid #eaecf0;border-radius:8px;background:#fff;box-shadow:0 12px 24px rgba(16,24,40,.16)}.po-auth-menu-head{padding:8px 9px 10px}.po-auth-menu-head strong,.po-auth-menu-head span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.po-auth-menu-head strong{font-size:12px;color:#182230}.po-auth-menu-head span{margin-top:3px;color:#667085;font-size:11px}.po-auth-menu-status{color:#027a48!important}.po-auth-menu-separator{height:1px;margin:4px 0;background:#eaecf0}.po-auth-menu-item{display:flex;align-items:center;width:100%;min-height:34px;border:0;border-radius:4px;background:transparent;padding:0 9px;color:#344054;font-size:12px;text-align:left;cursor:pointer}.po-auth-menu-item:hover{background:#f2f4f7}.po-auth-menu-item.danger{color:#b42318}.po-auth-menu-item.danger:hover{background:#fff1f0}@media(max-width:800px){.command-bar .po-auth-tools{width:100%;margin-top:12px}.po-auth-user-menu{align-self:flex-end}}';
  // Keep every account element on the same center line; draw the chevron independently of font metrics.
  style.textContent += '.po-auth-user-trigger{box-sizing:border-box;height:40px;line-height:1}.po-auth-avatar{line-height:1}.po-auth-identity{align-self:center;align-items:center;line-height:1}.po-auth-name{display:inline-flex;align-items:center;height:20px;line-height:20px}.po-auth-role{box-sizing:border-box;height:20px;min-height:20px;justify-content:center;line-height:1}.po-auth-chevron{display:inline-flex;align-items:center;justify-content:center;align-self:center;flex:0 0 12px;width:12px;height:20px;font-size:0;line-height:1}.po-auth-chevron::before{content:"";display:block;width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-1.5px) rotate(45deg)}';
  document.head.append(style);
  let panel;
  let userMenuListenersBound = false;
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
  function bindUserMenuClose() {
    if (userMenuListenersBound) return;
    userMenuListenersBound = true;
    document.addEventListener('click', event => {
      document.querySelectorAll('.po-auth-user-menu[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.removeAttribute('open');
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.po-auth-user-menu[open]').forEach(menu => menu.removeAttribute('open'));
    });
  }
  function userInitial(name) {
    return Array.from(String(name || '').trim())[0] || '冰';
  }
  async function show(message, retry = false) {
    await domReady;
    if (!panel || !panel.isConnected) { panel = document.createElement('section'); panel.className = 'po-auth-panel'; panel.setAttribute('role', 'alert'); document.body.append(panel); }
    panel.replaceChildren();
    const text = document.createElement('div'); text.textContent = message; panel.append(text);
    if (retry) {
      const button = document.createElement('button'); button.textContent = '重试连接'; button.onclick = () => location.reload(); panel.append(button);
      if (app?.auth.gotoLogin) {
        const login = document.createElement('button'); login.textContent = '打开冰川登录页'; login.onclick = () => app.auth.gotoLogin(); panel.append(login);
      }
    }
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
  async function signIn() {
    loginStage = 'sso';
    if (location.hostname !== 'q1.com' && !location.hostname.endsWith('.q1.com')) throw new Error('请通过配置好的 q1.com 舆情访问地址登录；当前域名无法完成冰川 SSO');
    let timer;
    try {
      await Promise.race([
        app.auth.sso({ redirectOnGuest: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new DOMException('SSO timeout', 'TimeoutError')), 15000); }),
      ]);
    } catch (error) {
      if (!networkFailure(error)) throw error;
      // A top-level login works independently of cross-origin fetch. Allow one
      // automatic recovery per five minutes, so an outage cannot cause a loop.
      let recovered = true;
      try {
        recovered = Date.now() - Number(sessionStorage.getItem(loginRecoveryKey) || 0) < 300000;
        if (!recovered) sessionStorage.setItem(loginRecoveryKey, String(Date.now()));
      } catch (_) { /* Without storage, require the explicit login button. */ }
      if (!recovered && app.auth.gotoLogin) {
        await show('登录连接失败，正在转到冰川登录页…');
        app.auth.gotoLogin();
        return new Promise(() => {});
      }
      throw new Error('无法连接冰川登录服务。请点击“打开冰川登录页”完成登录后重试；若仍失败，请检查公司网络或 VPN。');
    } finally { clearTimeout(timer); }
  }
  async function readSession() {
    loginStage = 'session';
    return nativeFetch(`${API.href}/auth/session`, { headers: { Authorization: bearer() }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  }
  const ready = (async () => {
    let response;
    try {
      response = await resilientRead(`${API.href}/auth/config`, { cache: 'no-store' }, 4);
    } catch (error) {
      if (window.PUBLIC_OPINION_REQUIRE_SSO === true) throw new Error('无法连接电脑上的舆情服务。请保持电脑服务运行并连接公司网络；若浏览器提示访问局域网，请允许后重试。');
      throw error;
    }
    if (!response.ok) throw new Error('无法读取登录配置');
    const config = (await response.json()).data;
    if (!config.enabled) return { enabled: false };
    if (config.publicReadOnly && window.PUBLIC_OPINION_REQUIRE_SSO !== true) {
      identity = config.identity;
      document.documentElement.dataset.poReview = 'false';
      document.documentElement.dataset.poManage = 'false';
      if (/\/(?:sources|keywords|collection-runs|single-post-analysis|api-config)\.html$/.test(location.pathname)) {
        location.replace('index.html'); return new Promise(() => {});
      }
      await domReady;
      const bar = document.createElement('div'); bar.className = 'po-auth-user';
      bar.textContent = '免登录查看 · 只读'; mountUserBar(bar);
      return { enabled: true, publicReadOnly: true, identity };
    }
    if (signedOut) { await showSignedOut(); return { enabled: true, signedOut: true }; }
    await show('正在验证冰川登录身份…');
    await loadScript(config.sdkUrl);
    app = window.GlacierBaaS.init({ appKey: config.appKey, baseUrl: config.baseUrl });
    if (!app.auth.isLoggedIn()) {
      await signIn();
    }
    if (signedOut) { app.auth.logout(); await showSignedOut(); return { enabled: true, signedOut: true }; }
    let session = await readSession();
    if (session.status === 401 && !signedOut) {
      app.auth.logout();
      await signIn();
      session = await readSession();
    }
    const result = await session.json();
    if (!session.ok) throw new Error(result.error?.message || '无法验证舆情访问权限');
    if (signedOut) { app.auth.logout(); await showSignedOut(); return { enabled: true, signedOut: true }; }
    identity = result.data.identity;
    try { sessionStorage.removeItem(loginRecoveryKey); } catch (_) {}
    if (/\/api-config\.html$/.test(location.pathname) && !identity.roles?.includes('admin')) {
      location.replace('index.html'); return new Promise(() => {});
    }
    document.documentElement.dataset.poReview = String(identity.permissions.review);
    document.documentElement.dataset.poManage = String(identity.permissions.manage);
    if (!identity.permissions.manage && /\/(?:sources|keywords|collection-runs|single-post-analysis|api-config)\.html$/.test(location.pathname)) {
      location.replace('index.html'); return new Promise(() => {});
    }
    await domReady;
    panel?.remove();
    const displayName = identity.displayName || '冰川用户';
    const roleLabel = identity.roles.map(role => ({ admin: '管理员', reviewer: '审核员' }[role] || role)).join(' / ') || '成员';
    const bar = document.createElement('details'); bar.className = 'po-auth-user po-auth-user-menu';
    const trigger = document.createElement('summary'); trigger.className = 'po-auth-user-trigger'; trigger.setAttribute('aria-label', '打开账号菜单');
    const avatar = document.createElement('span'); avatar.className = 'po-auth-avatar'; avatar.textContent = userInitial(displayName); trigger.append(avatar);
    const identityText = document.createElement('span'); identityText.className = 'po-auth-identity';
    const name = document.createElement('span'); name.className = 'po-auth-name'; name.textContent = displayName; identityText.append(name);
    const role = document.createElement('span'); role.className = 'po-auth-role'; role.textContent = roleLabel; identityText.append(role); trigger.append(identityText);
    const chevron = document.createElement('span'); chevron.className = 'po-auth-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄'; trigger.append(chevron);
    bar.append(trigger);
    const popover = document.createElement('div'); popover.className = 'po-auth-popover';
    const menuHead = document.createElement('div'); menuHead.className = 'po-auth-menu-head';
    const menuName = document.createElement('strong'); menuName.textContent = displayName; menuHead.append(menuName);
    const menuRole = document.createElement('span'); menuRole.textContent = roleLabel; menuHead.append(menuRole);
    const menuStatus = document.createElement('span'); menuStatus.className = 'po-auth-menu-status'; menuStatus.textContent = '已登录'; menuHead.append(menuStatus);
    popover.append(menuHead);
    if (identity.permissions.manage) {
      const separator = document.createElement('div'); separator.className = 'po-auth-menu-separator'; popover.append(separator);
      const manage = document.createElement('button'); manage.className = 'po-auth-menu-item'; manage.textContent = '成员与权限';
      manage.onclick = async () => { try { if (!app.admin.openManager) await loadScript(`${config.baseUrl}/glacier-baas-admin-ui.js`); app.admin.openManager(); } catch (error) { await show(error.message, true); } }; popover.append(manage);
    }
    const logout = document.createElement('button'); logout.className = 'po-auth-menu-item danger'; logout.textContent = '退出登录'; logout.onclick = signOut; popover.append(logout);
    bar.append(popover); bindUserMenuClose(); mountUserBar(bar);
    return { enabled: true, identity };
  })();
  ready.catch(error => {
    if (signedOut) return showSignedOut();
    const message = networkFailure(error)
      ? (loginStage === 'session' ? '无法连接舆情权限服务，请检查公司网络或 VPN 后重试。当前登录状态已保留。' : '无法连接舆情登录配置服务，请检查公司网络或 VPN 后重试。')
      : error.message || '冰川登录失败';
    return show(message, true);
  });
  window.PublicOpinionAuth = Object.freeze({ ready, currentUser: () => identity || null });
  window.fetch = async function (input, init) {
    const target = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (target.origin !== API.origin || !protectedPath(target.pathname) || target.pathname === `${API.pathname}/auth/config`) return nativeFetch(input, init);
    if (signedOut) return loginRequired();
    const state = await ready;
    if (signedOut) return loginRequired();
    if (!state.enabled) return resilientRead(input, init);
    if (state.publicReadOnly) {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method !== 'GET') return new Response(JSON.stringify({ error: { code: 'BAAS_LOGIN_REQUIRED', message: '当前入口仅供查看，请使用 SSO 登录入口执行操作' } }), { status: 401, headers: { 'content-type': 'application/json' } });
      return showCloudCoverage(await resilientRead(input, init));
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', bearer());
    headers.delete('x-admin-user');
    const response = await resilientRead(input, { ...init, headers });
    if (signedOut) return loginRequired();
    if (response.status === 401) { app.auth.logout(); await show('登录已失效，请重新登录', true); }
    return showCloudCoverage(response);
  };
})();
