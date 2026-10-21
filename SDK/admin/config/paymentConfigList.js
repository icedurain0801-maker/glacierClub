(() => {
  'use strict';
  const list = document.getElementById('payment-list-view');
  const formView = document.getElementById('payment-form-view');
  const rows = document.getElementById('payment-rows');
  const examples = [
    ['1001','T3默认方案（演示）','启用','Terminal3支付','已通过','—','2026-10-20 09:00:00','演示管理员'],
    ['1002','Xsolla默认方案（演示）','启用','Xsolla支付','已通过','—','2026-10-20 09:10:00','演示管理员'],
    ['1003','谷歌方案（演示）','停用','谷歌支付','已通过','com.example.demo','2026-10-20 09:20:00','演示管理员'],
    ['1004','T3版本方案（演示）','停用','Terminal3支付','待审核','—','2026-10-20 09:30:00','演示管理员'],
    ['1005','Razer版本方案（演示）','启用','Razer支付','待审核','—','2026-10-21 09:40:00','演示管理员'],
    ['1006','Xsolla版本方案（演示）','启用','Xsolla支付','待审核','—','2026-10-20 09:40:00','演示管理员'],
    ...['Adyen','PayerMax','Waffo','Checkout'].map((name,index) => [String(1007+index),`${name}默认方案（演示）`,'启用',`${name}支付`,'已通过','—','2026-10-20 10:00:00','演示管理员'])
  ];
  let activeTab = 'all';
  let filters = {};
  window.SDKPaymentPrototype.types.forEach(type => {
    const option = document.createElement('option'); option.value = type.label; option.textContent = type.label;
    document.getElementById('filter-type').append(option);
  });
  function render() {
    rows.replaceChildren();
    const visible = examples.filter(row => (activeTab !== 'pending' || row[4] === '待审核') && (!filters.type || row[3] === filters.type) && (!filters.audit || row[4] === filters.audit) && (!filters.enabled || row[2] === filters.enabled) && (!filters.name || row[1].includes(filters.name)) && (!filters.binding || (filters.bindingKey === 'PackageName' && row[3] === '谷歌支付' && row[5].includes(filters.binding))));
    visible.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((value,index) => { const td = document.createElement('td'); td.textContent = index === 1 ? value.replace('（演示）','') : value; tr.append(td); });
      const isDefault = ['1001','1002','1007','1008','1009','1010'].includes(row[0]);
      if (isDefault) {
        const icon = document.createElement('span'); icon.className = 'payment-default-icon'; icon.title = '默认方案（兜底）'; icon.setAttribute('role','img'); icon.setAttribute('aria-label','默认方案（兜底）');
        icon.textContent = '默认';
        tr.children[1].append(icon);
      }
      const actions = document.createElement('td');
      ['编辑',...(row[4] === '待审核' ? ['通过','驳回'] : [])].forEach(label => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = true; button.title = '仅展示，不执行操作'; actions.append(button);
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
  render();
})();
