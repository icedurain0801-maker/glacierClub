(function (global) {
  'use strict';
  function open({ source = {}, selected = {}, api, esc, close, saved, canManage = true }) {
    let current = source; let busy = false; let creationUnknown = false; let creationSubmitted = false; let challenge = null; let generation = 0; let externalPolling = false;
    const host = document.querySelector('#drawerContent');
    const q = selector => host.querySelector(selector);
    const creating = !source.id;
    const config = typeof source.config === 'string' ? JSON.parse(source.config || '{}') : source.config || {};
    const account = source.account || {};
    host.innerHTML = `<div class="drawer-header drawer-header--facebook"><h2>${creating ? '新增 Facebook 采集源' : 'Facebook 账号与采集配置'}</h2><div class="drawer-header-subtitle">${esc(source.community_name || selected.communityLabel || '当前境外社区')} · 网页登录采集</div></div>
      <form class="facebook-source-form" id="facebookBrowserForm"><div class="drawer-body">
      <section class="detail-block"><h3 class="detail-label">采集配置</h3>
      <div class="field"><label for="fbBrowserName">采集源名称</label><input class="input" id="fbBrowserName" maxlength="100" required value="${esc(source.display_name || (selected.communityLabel || '') + ' Facebook')}"></div>
      <div class="field"><label for="fbBrowserUrl">采集网页</label><input class="input" id="fbBrowserUrl" type="url" required value="${esc(config.baseUrl || '')}" placeholder="https://www.facebook.com/主页或groups/群组ID"></div>
      <div class="subline">仅抓取该账号有权查看的 Facebook 主页或群组内容，各社区独立配置。</div>
      <div class="field"><label for="fbBrowserFrequency">采集频率</label><select class="input" id="fbBrowserFrequency">${[[3600,'每小时'],[21600,'每6小时'],[86400,'每天']].map(([value,label]) => `<option value="${value}" ${Number(source.frequency_seconds || 21600) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></section>
      <section class="detail-block"><h3 class="detail-label">本社区登录账号</h3>
      <div class="field"><label for="fbBrowserAccount">登录账号</label><input class="input" id="fbBrowserAccount" autocomplete="username" maxlength="256" ${creating || !account.hasAccountPassword ? 'required' : ''} placeholder="${esc(account.maskedAccount ? '已配置：' + account.maskedAccount + '；留空不修改' : '邮箱、手机号或用户名')}"></div>
      <div class="field"><label for="fbBrowserPassword">登录密码</label><input class="input" id="fbBrowserPassword" type="password" autocomplete="new-password" maxlength="512" ${creating || !account.hasAccountPassword ? 'required' : ''} placeholder="${account.hasAccountPassword ? '已配置；留空不修改' : '请输入密码'}"></div>
      <div class="sensitive-note">账密加密保存，不回显。修改账号或采集网页后来源停用，需要重新登录；历史内容保留。</div></section>
      ${creating ? '' : `<section class="detail-block"><h3 class="detail-label">登录与人工验证</h3><div id="fbBrowserLoginStatus" role="status">${esc(statusLabel(account.auth_status))}</div><div class="action-row"><button type="button" class="btn primary" id="fbBrowserExternalLogin">打开真实浏览器登录</button><button type="button" class="btn" id="fbBrowserLogin">内嵌登录验证</button><button type="button" class="btn" id="fbBrowserRefresh">刷新登录状态</button></div><div id="fbBrowserChallenge"></div></section>`}
      <div class="facebook-error" id="fbBrowserError" role="alert"></div></div>
      <div class="drawer-footer"><button type="button" class="btn" id="fbBrowserClose">关闭</button><button type="submit" class="btn primary" id="fbBrowserSave">${creating ? '保存采集源' : '保存配置'}</button></div></form>`;
    const form = q('#facebookBrowserForm');
    form.dataset.sourceId = source.id || '';
    if (!canManage) form.querySelectorAll('input,select,button:not(#fbBrowserClose)').forEach(el => { el.disabled = true; });
    document.querySelector('#drawerMask').classList.add('open');
    q('#fbBrowserClose').onclick = close;
    const alive = () => form.isConnected && document.querySelector('#drawerMask').classList.contains('open');
    function dirty() { return ['#fbBrowserAccount','#fbBrowserPassword'].some(id => q(id).value) || q('#fbBrowserUrl').value !== (config.baseUrl || '') || q('#fbBrowserName').value !== (source.display_name || '') || Number(q('#fbBrowserFrequency').value) !== Number(source.frequency_seconds || 21600); }
    async function run(operation) {
      if (busy || !canManage || creationUnknown) return; busy = true; const serial = ++generation;
      q('#fbBrowserError').textContent = ''; form.querySelectorAll('input,select,button:not(#fbBrowserClose)').forEach(el => { el.disabled = true; });
      try { await operation(serial); } catch (error) { if (creating && creationSubmitted && (!error.status || error.status >= 500)) creationUnknown = true;
        if (alive() && q('#fbBrowserLoginStatus')?.textContent.startsWith('正在登录')) q('#fbBrowserLoginStatus').textContent = '登录未完成，请刷新状态确认'; if (alive() && serial === generation) q('#fbBrowserError').textContent = (error.name === 'TimeoutError' ? '操作响应超时，请关闭并刷新采集源列表确认结果，勿重复创建' : error.message) || '操作失败，请重试'; }
      finally { busy = false; if (alive() && serial === generation) form.querySelectorAll('input,select,button:not(#fbBrowserClose)').forEach(el => { el.disabled = creationUnknown; }); }
    }
    async function request(action, options) { return api(`/sources/${encodeURIComponent(current.id)}/browser${action ? '/' + action : ''}`, { signal: AbortSignal.timeout(90000), ...options }); }
    form.onsubmit = event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      return run(async () => {
        const password = q('#fbBrowserPassword').value; const login = q('#fbBrowserAccount').value.trim();
        if (Boolean(login) !== Boolean(password)) throw new Error('修改账密时请同时填写登录账号和密码');
        const payload = { displayName: q('#fbBrowserName').value.trim(), baseUrl: q('#fbBrowserUrl').value.trim(), frequencySeconds: Number(q('#fbBrowserFrequency').value), ...(login ? { account: login, password } : {}) };
        creationSubmitted = creating;
        const response = creating ? await api('/sources', { method: 'POST', signal: AbortSignal.timeout(15000), body: JSON.stringify({ ...payload, platform: 'facebook', collectionMode: 'browser', communityId: selected.communityId }) }) : await request('', { method: 'PATCH', body: JSON.stringify(payload) });
        if (!alive()) return;
        ['#fbBrowserAccount','#fbBrowserPassword'].forEach(id => { q(id).value = ''; });
        current = response; saved(response); open({ source: response, selected, api, esc, close, saved, canManage });
        if (response.warning) document.querySelector('#fbBrowserError').textContent = response.warning;
      });
    };
    function showStatus(result) {
      if (!alive()) return;
      q('#fbBrowserLoginStatus').textContent = statusLabel(result.status) + (result.failureCode ? '：' + failureLabel(result.failureCode) : '');
      challenge = result.challenge || challenge;
      if (result.status === 'active') request('', { method: 'GET' }).then(value => { if (alive()) saved(value); }).catch(() => {});
      const area = q('#fbBrowserChallenge'); area.replaceChildren();
      if (result.status !== 'manual_verification' || !challenge) return;
      const text = document.createElement('p'); text.textContent = challenge.instruction || '请完成 Facebook 要求的验证'; area.append(text);
      if (challenge.type === 'external_browser') { if (!externalPolling) { externalPolling = true; const deadline = Date.now() + 300000; const poll = async () => { if (!alive() || Date.now() >= deadline) { externalPolling = false; return; } if (!busy) await run(async () => { const next = await request('status', { method:'GET' }); showStatus(next); if (next.status !== 'manual_verification') externalPolling = false; }); if (externalPolling) setTimeout(poll, 3000); }; setTimeout(poll, 3000); } return; }
      if (challenge.allowsTextSubmission) {
        const input = document.createElement('input'); input.className = 'input'; input.autocomplete = 'one-time-code'; input.id = 'fbBrowserCode'; input.setAttribute('aria-label','Facebook 验证码'); area.append(input);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = challenge.allowsTextSubmission ? '提交验证码' : '检查验证结果';
      button.onclick = () => run(async () => showStatus(await request('challenge', { method:'POST', body:JSON.stringify({ challengeId:challenge.id, poll:!challenge.allowsTextSubmission, answer:q('#fbBrowserCode')?.value || '' }) })));
      area.append(button);
      const view = document.createElement('button'); view.type = 'button'; view.className = 'btn'; view.textContent = '打开人工验证画面';
      const frame = document.createElement('div');
      async function showFrame(action = 'view', x, y) {
        const result = await request('challenge-view', { method: 'POST', body: JSON.stringify({ challengeId: challenge.id, action, x, y }) });
        if (!alive()) return;
        frame.replaceChildren();
        if (result.approved) { showStatus(result); return; }
        if (result.loading) { const message = document.createElement('p'); message.setAttribute('role', 'status'); message.textContent = result.message || 'Facebook 验证页面仍在加载，请稍后刷新画面。'; frame.append(message); }
        const image = document.createElement('img'); image.src = 'data:image/jpeg;base64,' + result.imageBase64; image.alt = 'Facebook 人工安全验证画面，点击对应位置进行操作'; image.style.cssText = 'width:100%;height:auto;border:1px solid #ddd;cursor:crosshair';
        image.onclick = event => { const rect = image.getBoundingClientRect(); run(() => showFrame('click', (event.clientX - rect.left) * result.width / rect.width, (event.clientY - rect.top) * result.height / rect.height)); };
        if (!result.loading) frame.append(image);
        for (const [label, action] of [['刷新画面', 'view'], ['重新加载验证页', 'reload'], ['向下滚动', 'scroll']]) { const control = document.createElement('button'); control.type = 'button'; control.className = 'btn'; control.textContent = label; control.onclick = () => run(() => showFrame(action)); frame.append(control); }
      }
      view.onclick = () => run(() => showFrame()); area.append(view, frame);
    }
    if (!creating) {
      q('#fbBrowserExternalLogin').onclick = () => run(async () => {
        if (dirty()) throw new Error('请先保存配置，再登录验证');
        q('#fbBrowserLoginStatus').textContent = '正在登录，打开真实浏览器…';
        showStatus(await request('external-login', { method:'POST', body:'{}' }));
      });
      q('#fbBrowserLogin').onclick = () => run(async () => {
        if (dirty()) throw new Error('请先保存配置，再登录验证');
        q('#fbBrowserLoginStatus').textContent = '正在登录，请稍候…';
        const result = await request('login', { method:'POST', body:'{}' }); showStatus(result);
        if (result.status === 'active') saved(await request('', { method:'GET' }));
      });
      q('#fbBrowserRefresh').onclick = () => run(async () => showStatus(await request('status', { method:'GET' })));
    }
  }
  function statusLabel(status) { return ({ active:'已登录', authorized:'已登录', pending_verification:'待登录验证', manual_verification:'待人工验证', awaiting_manual_verification:'待人工验证', invalid_credentials:'账密错误', unauthorized:'未登录', session_expired:'会话已失效', expired:'会话已失效', revoked:'会话已撤销' })[status] || '待登录验证'; }
  function failureLabel(code) { return ({ FACEBOOK_LOGIN_CONTROL_UNAVAILABLE:'Facebook 登录按钮未能响应，请稍后重试', FACEBOOK_LOGIN_RESPONSE_TIMEOUT:'Facebook 未及时返回登录结果，请稍后确认状态', FACEBOOK_LOGIN_PAGE_TIMEOUT:'Facebook 登录页面加载超时，请稍后重试', LOGIN_FAILED:'上次登录执行失败，请重新登录验证', INVALID_CREDENTIALS:'请检查保存的账号和密码', FACEBOOK_PAGE_UNAVAILABLE:'登录后无法访问配置的采集网页' })[code] || code; }
  global.FacebookBrowserAdmin = { open, statusLabel };
})(window);
