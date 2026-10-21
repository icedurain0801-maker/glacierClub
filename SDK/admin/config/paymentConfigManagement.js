(() => {
  'use strict';

  // 与截图逐项对应；不把表单凭据写入 localStorage / sessionStorage 或日志。
  const types = [
    { id:'callback', label:'支付成功回调地址', identity:[], credentials:[['PayCallbackUrl','PayCallbackUrl']], enabled:false },
    { id:'google', label:'谷歌支付', identity:[['PackageName','PackageName（包名）']], credentials:[['ClientId','ClientId（应用ID）'],['ClientSecret','ClientSecret（应用密钥）',true],['RefreshToken','RefreshToken（刷新Token）',true],['PublicKey','PublicKey（公钥）']], enabled:true },
    { id:'apple', label:'苹果支付', identity:[['BundleId','BundleId（包ID）']], credentials:[['IssuerId','IssuerId（发行者ID）'],['Audience','Audience（密钥名称）'],['AudienceKeyId','AudienceKeyId（密钥标识）'],['AudiencePrivateKey','AudiencePrivateKey（私钥）',true],['AudiencePublicKey','AudiencePublicKey（公钥）']], enabled:true },
    { id:'huawei', label:'华为支付', identity:[['PackageName','PackageName（包名）']], credentials:[['ClientId','ClientId（应用ID）'],['ClientSecret','ClientSecret（应用密钥）',true],['PublicKey','PublicKey（公钥）']], enabled:true },
    { id:'huaweiQuick', label:'华为快游戏支付', identity:[['ApplicationId','ApplicationId（应用ID）']], credentials:[['ClientSecret','ClientSecret（应用密钥）',true],['PublicKey','PublicKey（公钥）']], enabled:true },
    { id:'harmony', label:'鸿蒙支付', identity:[['ApplicationId','ApplicationId（应用ID）']], credentials:[['IssuerId','IssuerId（发行者ID）'],['PrivateKey','PrivateKey（私钥）',true],['PrivateKeyId','PrivateKeyId（私钥ID）']], enabled:true },
    { id:'terminal3', label:'Terminal3支付', identity:[], credentials:[['publicKey','publicKey（公钥）'],['privateKey','privateKey（私钥）',true],['sandBox','sandBox（沙盒支付）',false,'boolean']], enabled:true },
    { id:'razer', label:'Razer支付', identity:[], credentials:[['applicationCode','applicationCode（应用编码）'],['secretKey','secretKey（密钥）',true]], enabled:true },
    { id:'xsolla', label:'Xsolla支付', identity:[['projectId','projectId（项目ID）']], credentials:[['apiKey','apiKey（API密钥）',true],['notifyKey','notifyKey（通知密钥）',true],['sandBox','sandBox（沙盒支付）',false,'boolean']], enabled:true },
    { id:'adyen', label:'Adyen支付', identity:[['merchantAccount','merchantAccount（商户账号）']], credentials:[['apiKey','apiKey（API密钥）',true],['signKey','signKey（签名密钥）',true],['storePaymentMethodMode','storePaymentMethodMode（支付方式保存模式）'],['recurringProcessingModel','recurringProcessingModel（重复支付处理模式）']], enabled:true },
    { id:'payermax', label:'PayerMax支付', identity:[['appId','appId（应用ID）']], credentials:[['privateKey','privateKey（私钥）',true],['publicKey','publicKey（公钥）']], enabled:true },
    { id:'waffo', label:'Waffo支付', identity:[['merchantId','merchantId（商户ID）']], credentials:[['apiKey','apiKey（API密钥）',true],['privateKey','privateKey（私钥）',true],['publicKey','publicKey（公钥）']], enabled:true },
    { id:'checkout', label:'Checkout支付', identity:[], credentials:[['apiKey','apiKey（API密钥）',true],['processingChannelId','processingChannelId（处理渠道ID）'],['authorizationKey','authorizationKey（授权密钥）',true],['webHookSignKey','webHookSignKey（Webhook签名密钥）',true]], enabled:true }
  ];
  const versionTypes = ['terminal3','razer','xsolla','adyen','payermax','waffo','checkout'];
  const form = document.getElementById('payment-form');
  const trigger = document.getElementById('scheme-type');
  const menu = document.getElementById('type-menu');
  const search = document.getElementById('type-search');
  const options = document.getElementById('type-options');
  const toggle = document.getElementById('enabled-switch');
  const requirementsButton = document.getElementById('requirements-button');
  const requirementsDrawer = document.getElementById('requirements-drawer');
  const drafts = Object.create(null);
  let current = types[0];
  let tags = [];
  let scope = 'server';
  let enabled = true;
  let feedbackTimer;

  function fieldRow([id, label, secret, control]) {
    const keyHint = current.id === 'terminal3' ? ({publicKey:'对应Project Key',privateKey:'对应Secret Key'})[id] : '';
    const checkoutHelp = current.id === 'checkout' ? ({apiKey:['checkout-api-key.png','API 密钥获取位置'],processingChannelId:['checkout-processing-channel-id.png','处理渠道 ID 获取位置'],authorizationKey:['checkout-authorization-key.png','授权密钥获取位置'],webHookSignKey:['checkout-webhook-sign-key.png','Webhook 签名密钥获取位置']})[id] : null;
    const waffoHelp = current.id === 'waffo' ? ({merchantId:['waffo-merchant-id.png','商户ID获取位置'],apiKey:['waffo-api-key.png','API密钥获取位置'],privateKey:['waffo-private-key.png','需要用支付宝小工具转成PKCS1 （PS：openssl工具生成的就是pkcs1的）'],publicKey:['waffo-public-key.png','Waffo Public Key获取位置']})[id] : null;
    const imageHelp = checkoutHelp || waffoHelp;
    const help = imageHelp ? `<span class="key-help" tabindex="0" role="img" aria-label="${imageHelp[1]}">?<span class="key-help-tip key-help-image" role="tooltip"><span>${imageHelp[1]}</span><img src="assets/${imageHelp[0]}" alt="${imageHelp[1]}（密钥已脱敏）"></span></span>` : keyHint ? `<span class="key-help" tabindex="0" role="img" aria-label="${keyHint}">?<span class="key-help-tip" role="tooltip">${keyHint}</span></span>` : '';
    const lengthLimit = versionTypes.includes(current.id) && control !== 'boolean' ? ' maxlength="99999999"' : '';
    const input = control === 'boolean'
      ? `<select class="text-input" id="${id}" name="${id}" required aria-describedby="error-${id}"><option value="">请选择</option><option value="true">是（沙盒环境）</option><option value="false">否（正式环境）</option></select>`
      : `<input class="text-input" id="${id}" name="${id}" type="${secret ? 'password' : 'text'}"${lengthLimit} placeholder="请输入" required autocomplete="off" spellcheck="false" aria-describedby="error-${id}">`;
    return `<div class="form-row" data-field="${id}"><label class="form-label" for="${id}"><span class="required">*</span>${label}${help}：</label><div class="form-control">${input}<p class="field-error" id="error-${id}" hidden></p></div></div>`;
  }

  function tagRow(id, label, placeholder, hideLabel = false) {
    const labelContent = hideLabel ? `<span class="sr-only">${label}</span>` : `<span class="required">*</span>${label}：`;
    return `<div class="form-row" data-field="${id}"><label class="form-label" for="${id}">${labelContent}</label><div class="form-control"><div class="tag-input" id="tag-box"><span class="tag-list" id="tag-list"></span><input id="${id}" name="${id}" placeholder="${placeholder}" autocomplete="off" aria-required="true" aria-describedby="error-${id}"></div><p class="field-error" id="error-${id}" hidden></p></div></div>`;
  }

  function saveDraft() {
    const values = {};
    form.querySelectorAll('input[name]:not([type=radio]),select[name]').forEach(input => { values[input.name] = input.value; });
    drafts[current.id] = { ...drafts[current.id], values, tags:[...tags], scope, enabled };
  }

  function renderType(type, preserve = true) {
    if (preserve) saveDraft();
    clearTimeout(feedbackTimer);
    document.getElementById('feedback').hidden = true;
    current = type;
    const draft = drafts[type.id] || { values:{}, tags:[], scope:'server', enabled:true };
    tags = [...draft.tags];
    scope = draft.scope;
    enabled = draft.enabled;
    document.getElementById('type-value').textContent = type.label;
    document.getElementById('game-version-fields').innerHTML = versionTypes.includes(type.id)
      ? '<div class="form-row" data-field="gameVersion"><label class="form-label" for="gameVersion"><span class="required">*</span>游戏版本：</label><div class="form-control"><select class="text-input" id="gameVersion" name="gameVersion" required aria-describedby="error-gameVersion"><option value="超能世界-国内">超能世界-国内</option><option value="超能世界-国内海岛2">超能世界-国内海岛2</option><option value="超能世界-国内审核">超能世界-国内审核</option><option value="超能世界-国内先遣">超能世界-国内先遣</option></select><p class="field-error" id="error-gameVersion" hidden></p></div></div>' : '';
    document.getElementById('identity-fields').innerHTML = type.id === 'callback'
      ? `<div class="form-row"><span class="form-label" id="scope-label"><span class="required">*</span>游戏配置：</span><div class="form-control"><div class="scope-options" role="radiogroup" aria-labelledby="scope-label"><label><input type="radio" name="scope" value="server" ${scope === 'server' ? 'checked' : ''}>按区服</label><label><input type="radio" name="scope" value="pid" ${scope === 'pid' ? 'checked' : ''}>按Pid</label></div></div></div>${tagRow('scopeRange','配置范围','输入范围，如: 1,2,3,4-5，按回车键提交',true)}`
      : type.identity.map(field => field[0] === 'BundleId' ? tagRow('BundleId',field[1],'请输入bundleId,按回车添加，多个使用英文逗号分隔') : fieldRow(field)).join('');
    document.getElementById('credential-fields').innerHTML = (type.id === 'terminal3' ? '<p class="terminal3-key-note">从Terminal3管理后台获取 项目的Project Key 和 Secret Key</p>' : '') + type.credentials.map(fieldRow).join('');
    const divider = form.querySelector('.group-divider');
    const identityFields = document.getElementById('identity-fields');
    if (type.id === 'xsolla') identityFields.insertAdjacentHTML('afterbegin','<p class="terminal3-key-note">从Xsolla后台获取到 项目ID、Webhook通知秘钥和API秘钥</p>');
    if (type.id === 'checkout') identityFields.insertAdjacentHTML('afterbegin','<p class="terminal3-key-note">Webhook通知需要单独配置充值成功通知和退款通知，两个通知的authorizationKey可共用同一个授权密钥，webHookSignKey可共用同一个签名密钥。</p>');
    const credentialFields = document.getElementById('credential-fields');
    identityFields.parentNode.insertBefore(divider,['xsolla','adyen','payermax','waffo','checkout'].includes(type.id) ? identityFields : credentialFields);
    form.querySelectorAll('input[name]:not([type=radio]),select[name]').forEach(input => { input.value = draft.values[input.name] ?? (input.name === 'sandBox' ? 'false' : input.name === 'gameVersion' ? '超能世界-国内' : ''); });
    document.getElementById('enabled-row').hidden = !type.enabled;
    clearErrors();
    renderTags();
    renderSwitch();
    renderOptions();
    renderRequirements();
  }

  function renderRequirements() {
    document.getElementById('requirements-type').textContent = current.label;
    const fields = current.id === 'callback'
      ? [['游戏配置','必选：按区服（默认）或按Pid'],['配置范围','必填，按回车添加整数或递增区间'],['PayCallbackUrl','必填，完整的 http:// 或 https:// 地址']]
      : [...current.identity,...current.credentials].map(([id,label]) => [label,id === 'BundleId' ? '必填，按回车添加；多个值用逗号分隔' : id === 'sandBox' ? '默认否（false，正式环境）；可选是（true，沙盒环境）' : '必填']);
    if (versionTypes.includes(current.id)) {
      fields.unshift(['游戏版本','必填，下拉单选，默认超能世界-国内']);
      fields.push(['gameId','配置归属维度，无需手填']);
    }
    if (current.enabled) fields.push(['启用状态','默认启用，可切换为停用']);
    const table = document.getElementById('requirements-fields');
    table.replaceChildren();
    fields.forEach(([label,rule]) => {
      const row = document.createElement('tr');
      const descriptions = { publicKey:'Terminal3 Project Key，用于识别渠道项目', privateKey:'Terminal3 Secret Key，支付鉴权凭据', projectId:'Xsolla 项目标识，不等同于游戏ID', apiKey:'Xsolla API 请求鉴权密钥', notifyKey:'Xsolla Webhook 支付通知校验密钥', sandBox:'选择渠道支付环境', gameId:'配置归属于对应游戏ID，不同游戏参数隔离' };
      const fieldId = [...current.identity,...current.credentials].find(field => field[1] === label)?.[0] || label;
      const channelDescriptions = {applicationCode:'Razer应用编码',secretKey:'Razer渠道密钥',merchantAccount:'Adyen商户账号',signKey:'渠道签名校验密钥',storePaymentMethodMode:'支付方式保存模式参数',recurringProcessingModel:'重复支付处理模式参数',appId:'PayerMax应用标识',merchantId:'Waffo商户标识',processingChannelId:'Checkout处理渠道标识',authorizationKey:'Checkout授权密钥',webHookSignKey:'Checkout Webhook签名校验密钥'};
      const description = channelDescriptions[fieldId] || (fieldId === 'publicKey' && current.id !== 'terminal3' ? '渠道公钥' : fieldId === 'privateKey' && current.id !== 'terminal3' ? '渠道私钥' : fieldId === 'apiKey' ? '渠道API请求鉴权密钥' : descriptions[fieldId]) || (label === '游戏版本' ? '选择当前游戏下的版本；原型选项为演示数据' : label === '启用状态' ? '标识方案是否启用' : '当前支付类型的配置参数');
      if (versionTypes.includes(current.id) && [...current.identity,...current.credentials].some(field => field[0] === fieldId && field[3] !== 'boolean')) rule += '；最大长度99999999字符，格式不限';
      [label,rule,description].forEach(text => { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); });
      table.append(row);
    });
  }

  function renderOptions() {
    const filtered = types.filter(type => type.label.toLowerCase().includes(search.value.trim().toLowerCase()));
    options.replaceChildren();
    filtered.forEach(type => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'type-option';
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(type.id === current.id));
      button.textContent = type.label;
      button.dataset.type = type.id;
      options.append(button);
    });
    document.getElementById('type-empty').hidden = filtered.length > 0;
  }

  function setMenu(open, focusTrigger = false) {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded',String(open));
    if (open) { search.value = ''; renderOptions(); search.focus(); }
    else if (focusTrigger) trigger.focus();
  }

  function renderSwitch() {
    toggle.setAttribute('aria-checked',String(enabled));
    toggle.querySelector('.switch-text').textContent = enabled ? '启用' : '停用';
  }

  function tagField() { return document.getElementById(current.id === 'callback' ? 'scopeRange' : 'BundleId'); }

  function renderTags() {
    const list = document.getElementById('tag-list');
    if (!list) return;
    list.replaceChildren();
    tags.forEach((value, index) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      const text = document.createElement('span');
      text.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.setAttribute('aria-label',`移除 ${value}`);
      remove.textContent = '×';
      remove.addEventListener('click',() => { tags.splice(index,1); renderTags(); tagField().focus(); });
      tag.append(text,remove);
      list.append(tag);
    });
  }

  function setError(id, message) {
    const input = document.getElementById(id);
    const error = document.getElementById(`error-${id}`);
    if (!input || !error) return;
    input.setAttribute('aria-invalid',message ? 'true' : 'false');
    error.textContent = message;
    error.hidden = !message;
    if (input.closest('.tag-input')) input.closest('.tag-input').classList.toggle('invalid',Boolean(message));
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach(error => { error.textContent = ''; error.hidden = true; });
    form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    form.querySelectorAll('.tag-input').forEach(box => box.classList.remove('invalid'));
  }

  function commitTags() {
    const input = tagField();
    if (!input || !input.value.trim()) return true;
    const values = input.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
    const invalidRange = value => {
      const match = /^(\d+)(?:-(\d+))?$/.exec(value);
      return !match || !Number.isSafeInteger(Number(match[1])) || (match[2] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) < Number(match[1])));
    };
    if (!values.length) { setError(input.id,'请输入有效内容'); return false; }
    if (current.id === 'callback' && values.some(invalidRange)) {
      setError(input.id,'请输入整数或递增范围，如 1,2,3,4-5'); return false;
    }
    if (current.id === 'apple' && values.some(value => /\s/.test(value))) {
      setError(input.id,'BundleId 不能包含空格，多个值请用英文逗号分隔'); return false;
    }
    const next = [...new Set([...tags,...values])];
    if (next.length > 100 || values.some(value => value.length > 200)) {
      setError(input.id,'最多添加 100 项，每项不能超过 200 个字符'); return false;
    }
    tags = next;
    input.value = '';
    setError(input.id,'');
    renderTags();
    return true;
  }

  function showFeedback(message) {
    const feedback = document.getElementById('feedback');
    clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.hidden = false;
    feedbackTimer = setTimeout(() => { feedback.hidden = true; },5000);
  }

  trigger.addEventListener('click',() => setMenu(menu.hidden));
  trigger.addEventListener('keydown',event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setMenu(true); }
  });
  search.addEventListener('input',renderOptions);
  options.addEventListener('click',event => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    renderType(types.find(type => type.id === button.dataset.type));
    setMenu(false,true);
  });
  document.getElementById('type-picker').addEventListener('keydown',event => {
    if (menu.hidden) return;
    const buttons = [...options.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); setMenu(false,true); }
    if (event.key === 'ArrowDown' && buttons.length) { event.preventDefault(); buttons[(index + 1) % buttons.length].focus(); }
    if (event.key === 'ArrowUp' && buttons.length) { event.preventDefault(); buttons[index <= 0 ? buttons.length - 1 : index - 1].focus(); }
    if (event.key === 'Enter' && event.target === search) { event.preventDefault(); buttons[0]?.click(); }
  });
  document.addEventListener('click',event => { if (!event.target.closest('#type-picker')) setMenu(false); });
  document.getElementById('type-picker').addEventListener('focusout',event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false);
  });
  toggle.addEventListener('click',() => { enabled = !enabled; renderSwitch(); });
  form.addEventListener('input',event => { if (event.target.id) setError(event.target.id,''); });
  form.addEventListener('keydown',event => {
    if (event.isComposing) return;
    if (event.key === 'Enter' && event.target === tagField()) { event.preventDefault(); commitTags(); }
  });
  form.addEventListener('change',event => {
    if (event.target.name !== 'scope') return;
    // 两种范围单独保留，避免把区服号误当成 Pid。
    const draft = drafts.callback || {};
    draft.scopeDrafts = draft.scopeDrafts || {};
    draft.scopeDrafts[scope] = { tags:[...tags], pending:tagField().value };
    scope = event.target.value;
    const restored = draft.scopeDrafts[scope] || { tags:[], pending:'' };
    tags = [...restored.tags];
    tagField().value = restored.pending;
    drafts.callback = draft;
    setError('scopeRange','');
    renderTags();
  });
  form.addEventListener('submit',event => {
    event.preventDefault();
    clearErrors();
    let valid = commitTags();
    form.querySelectorAll('input[required],select[required]').forEach(input => {
      if (!input.value.trim()) { setError(input.id,'请填写此项'); valid = false; }
    });
    const tagInput = tagField();
    if (tagInput && !tags.length && !tagInput.value.trim()) {
      setError(tagInput.id,current.id === 'apple' ? '请添加至少一个 BundleId' : '请添加至少一个配置范围'); valid = false;
    }
    if (current.id === 'callback') {
      const input = document.getElementById('PayCallbackUrl');
      if (input.value.trim()) {
        try {
          const url = new URL(input.value.trim());
          if (!['http:','https:'].includes(url.protocol)) throw new Error('invalid protocol');
        } catch (_) { setError(input.id,'请输入完整的 http:// 或 https:// 回调地址'); valid = false; }
      }
    }
    if (!valid) { form.querySelector('[aria-invalid=true]')?.focus(); return; }
    saveDraft();
    showFeedback('校验通过。当前为静态原型，未提交到支付服务。');
    document.dispatchEvent(new CustomEvent('payment-prototype-saved',{detail:{type:current.id,name:document.getElementById('schemeName').value.trim(),enabled,binding:tags.join(',') || document.getElementById('PackageName')?.value || document.getElementById('ApplicationId')?.value || '',projectId:document.getElementById('projectId')?.value || ''}}));
  });
  document.getElementById('cancel-button').addEventListener('click',() => {
    // 离开表单，不持久化凭据。
    document.dispatchEvent(new Event('payment-prototype-cancel'));
  });
  const shell = document.querySelector('.app-shell');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const mobileQuery = window.matchMedia('(max-width:600px)');
  function syncSidebarToggle() {
    const open = mobileQuery.matches ? shell.classList.contains('mobile-nav-open') : !shell.classList.contains('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded',String(open));
    sidebarToggle.setAttribute('aria-label',open ? '收起导航' : '展开导航');
  }
  sidebarToggle.addEventListener('click',() => { shell.classList.toggle(mobileQuery.matches ? 'mobile-nav-open' : 'sidebar-collapsed'); syncSidebarToggle(); });
  mobileQuery.addEventListener('change',syncSidebarToggle);
  requirementsButton.addEventListener('click',() => {
    setMenu(false);
    requirementsDrawer.showModal();
    requirementsButton.setAttribute('aria-expanded','true');
    document.body.classList.add('requirements-open');
  });
  document.getElementById('requirements-close').addEventListener('click',() => requirementsDrawer.close());
  requirementsDrawer.addEventListener('keydown',event => {
    if (event.key !== 'Tab') return;
    const focusable = [...requirementsDrawer.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(element => !element.disabled && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !requirementsDrawer.contains(document.activeElement))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
  requirementsDrawer.addEventListener('click',event => {
    if (event.target !== requirementsDrawer) return;
    const bounds = requirementsDrawer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requirementsDrawer.close();
  });
  requirementsDrawer.addEventListener('close',() => {
    requirementsButton.setAttribute('aria-expanded','false');
    document.body.classList.remove('requirements-open');
    requirementsButton.focus({preventScroll:true});
  });
  renderType(types[0],false);
  window.SDKPaymentPrototype = {
    types:types.map(({id,label}) => ({id,label})),
    open(record) {
      Object.keys(drafts).forEach(key => delete drafts[key]);
      renderType(types.find(type => type.id === record?.type) || types[0],false);
      document.getElementById('schemeName').value = record?.name || '';
      if (record) {
        enabled = record.enabled; renderSwitch();
        if (tagField()) { tags = record.binding ? record.binding.split(',') : []; renderTags(); }
        const bindingInput = document.getElementById('PackageName') || document.getElementById('ApplicationId');
        if (bindingInput) bindingInput.value = record.binding || '';
        if (document.getElementById('projectId')) document.getElementById('projectId').value = record.projectId || '';
      }
      document.querySelector('#payment-form-view .panel-title').textContent = record ? '编辑支付配置' : '新增支付配置';
    }
  };
  syncSidebarToggle();
})();
