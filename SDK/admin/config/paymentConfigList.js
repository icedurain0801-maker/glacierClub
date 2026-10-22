(() => {
  'use strict';
  const list = document.getElementById('payment-list-view');
  const formView = document.getElementById('payment-form-view');
  const rows = document.getElementById('payment-rows');
  const examples = [
    ['1003','谷歌方案（演示）','停用','谷歌支付','已通过','com.example.demo','2026-10-20 09:20:00','演示管理员'],
    ['1004','T3版本方案（演示）','停用','Terminal3支付','待审核','—','2026-10-20 09:30:00','演示管理员'],
    ['1005','Razer版本方案（演示）','启用','Razer支付','待审核','—','2026-10-21 09:40:00','演示管理员'],
    ['1006','Xsolla版本方案（演示）','启用','Xsolla支付','待审核','—','2026-10-20 09:40:00','演示管理员'],
  ];
  const records = new Map(examples.map(row => [row[0],{id:row[0],type:window.SDKPaymentPrototype.types.find(type => type.label === row[3]).id,name:row[1].replace('（演示）',''),enabled:row[2] === '启用',gameVersion:row[3] === '谷歌支付' ? '' : '超能世界-国内',binding:row[5] === '—' ? '' : row[5],values:row[3] === '谷歌支付' ? {} : Object.fromEntries((row[3] === 'Terminal3支付' ? ['publicKey','privateKey'] : row[3] === 'Razer支付' ? ['applicationCode','secretKey'] : ['projectId','apiKey','notifyKey']).map(key => [key,'demo-only-not-a-real-key']))}]));
  records.forEach(record => { record.region = 'overseas'; });
  // 境内单独提供演示记录，不把境外渠道挪入境内。
  ['apple','huawei','huaweiQuick','harmony'].forEach((typeId,index) => {
    const type = window.SDKPaymentPrototype.types.find(item => item.id === typeId);
    const id = String(2001 + index);
    const binding = typeId === 'apple' ? 'com.example.domestic.apple' : `com.example.domestic.${typeId}`;
    const values = Object.fromEntries(type.fields.map(({key}) => [key,['PackageName','ApplicationId','BundleId'].includes(key) ? binding : 'demo-only-not-a-real-key']));
    records.set(id,{id,type:typeId,region:'domestic',name:`${type.label}方案`,enabled:true,gameVersion:'',binding,values});
    examples.push([id,`${type.label}方案`,'启用',type.label,index === 0 ? '待审核' : '已通过',binding,'2026-10-22 10:00:00','演示管理员']);
  });
  const regionPicker = document.getElementById('payment-region');
  window.SDKPaymentPrototype.isDuplicate = candidate => [...records.values()].some(record => record.id !== candidate.id && record.region === candidate.region && record.type === candidate.type && record.gameVersion === candidate.gameVersion);
  let activeTab = 'all';
  let filters = {};
  const detail = document.createElement('dialog');
  detail.className = 'payment-detail';
  detail.setAttribute('aria-labelledby','payment-detail-title');
  detail.innerHTML = '<header><h2 id="payment-detail-title">支付配置详情</h2><button class="btn" type="button" autofocus>关闭</button></header><div class="payment-detail-body"></div>';
  document.body.append(detail);
  detail.querySelector('button').addEventListener('click',() => detail.close());
  let detailTrigger = null;
  detail.addEventListener('close',() => { detail.querySelector('.payment-detail-body').replaceChildren(); detailTrigger?.focus(); });
  function masked(value) {
    if (value == null || value === '') return '—';
    const chars = Array.from(String(value));
    return chars.length > 8 ? chars.slice(0,4).join('') + '***' + chars.slice(-4).join('') : '***';
  }
  function showDetails(record,button) {
    detailTrigger = button;
    const type = window.SDKPaymentPrototype.types.find(item => item.id === record.type);
    const body = detail.querySelector('.payment-detail-body');
    body.replaceChildren();
    const table = document.createElement('table'); table.className = 'req-table';
    const addRow = (label,value) => { const row = document.createElement('tr'); const key = document.createElement('th'); key.scope = 'row'; key.textContent = label; const cell = document.createElement('td'); cell.textContent = value; row.append(key,cell); table.append(row); };
    [['方案名称',record.name],['方案类型',type.label],['启用状态',record.enabled ? '启用' : '停用'],['游戏版本',record.gameVersion || '不指定游戏版本']].forEach(([key,value]) => addRow(key,value));
    type.fields.forEach(({key,name}) => addRow(name,masked(record.values?.[key] ?? (['PackageName','ApplicationId','BundleId'].includes(key) ? record.binding : undefined))));
    body.append(table); detail.showModal();
  }
  function refreshTypeFilter() {
    const select = document.getElementById('filter-type');
    select.replaceChildren(new Option('请选择',''));
    window.SDKPaymentPrototype.allowedTypes().forEach(type => {
    const option = document.createElement('option'); option.value = type.label; option.textContent = type.label;
    document.getElementById('filter-type').append(option);
  });
  }
  refreshTypeFilter();
  function render() {
    rows.replaceChildren();
    const visible = examples.filter(row => records.get(row[0]).region === regionPicker.value && window.SDKPaymentPrototype.allowedTypes().some(type => type.label === row[3]) && (activeTab !== 'pending' || row[4] === '待审核') && (!filters.type || row[3] === filters.type) && (!filters.audit || row[4] === filters.audit) && (!filters.enabled || row[2] === filters.enabled) && (!filters.name || row[1].includes(filters.name)) && (!filters.binding || (filters.bindingKey === 'PackageName' && row[3] === '谷歌支付' && row[5].includes(filters.binding))));
    visible.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((value,index) => { const td = document.createElement('td'); td.textContent = index === 1 ? value.replace('（演示）','') : value; tr.append(td); });
      const actions = document.createElement('td');
      ['详情','编辑',...(row[4] === '待审核' ? ['通过','驳回'] : [])].forEach(label => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = !['详情','编辑'].includes(label); button.title = label === '详情' ? '查看脱敏详情' : label === '编辑' ? '编辑演示配置' : '仅展示，不执行操作';
        if (label === '详情') button.addEventListener('click',() => showDetails(records.get(row[0]),button));
        if (label === '编辑') button.addEventListener('click',() => { window.SDKPaymentPrototype.open(records.get(row[0])); list.hidden = true; formView.hidden = false; });
        actions.append(button);
      });
      tr.append(actions); rows.append(tr);
    });
    if (!visible.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 9; td.className = 'payment-empty'; td.textContent = '暂无数据'; tr.append(td); rows.append(tr); }
    document.getElementById('payment-count').textContent = `共 ${visible.length} 条演示数据`;
  }
  document.querySelectorAll('[data-list-tab]').forEach(button => button.addEventListener('click',() => {
    activeTab = button.dataset.listTab;
    document.querySelectorAll('[data-list-tab]').forEach(item => item.setAttribute('aria-selected',String(item === button)));
    document.getElementById('payment-list-panel').setAttribute('aria-labelledby',button.id); render();
  }));
  document.getElementById('payment-filters').addEventListener('submit',event => {
    event.preventDefault();
    filters = Object.fromEntries(['type','audit','enabled','name','binding'].map(key => [key,document.getElementById(`filter-${key}`).value.trim()]));
    filters.bindingKey = document.getElementById('filter-binding-key').value; render();
  });
  document.getElementById('payment-add').addEventListener('click',() => {
    window.SDKPaymentPrototype.open(); list.hidden = true; formView.hidden = false; document.getElementById('scheme-type').focus();
  });
  document.addEventListener('payment-prototype-cancel',() => { formView.hidden = true; list.hidden = false; document.getElementById('payment-add').focus(); });
  document.addEventListener('payment-region-changed',() => {
    if (detail.open) detail.close();
    formView.hidden = true; list.hidden = false; filters = {}; activeTab = 'all';
    document.getElementById('payment-filters').reset(); refreshTypeFilter();
    document.querySelectorAll('[data-list-tab]').forEach(button => button.setAttribute('aria-selected',String(button.dataset.listTab === 'all')));
    document.getElementById('payment-list-panel').setAttribute('aria-labelledby','list-tab');
    render(); regionPicker.focus();
  });
  document.addEventListener('payment-prototype-save-record',event => {
    const record = event.detail;
    record.id = record.id || String(Math.max(1010,...records.keys()) + 1);
    records.set(record.id,record);
    const label = window.SDKPaymentPrototype.types.find(type => type.id === record.type).label;
    const row = [record.id,record.name,record.enabled ? '启用' : '停用',label,'待审核',record.values.PackageName || record.values.ApplicationId || record.binding || '—',new Date().toLocaleString('sv-SE'),'演示管理员'];
    const index = examples.findIndex(item => item[0] === record.id);
    if (index < 0) examples.push(row); else examples[index] = row;
    render(); formView.hidden = true; list.hidden = false;
  });
  render();
})();
