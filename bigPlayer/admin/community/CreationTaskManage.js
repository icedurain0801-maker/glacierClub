(function () {
  document.head.insertAdjacentHTML('beforeend', [
    '<style id="creation-task-page-style">',
    '.task-drawer.drawer{width:880px;max-width:calc(100vw - 48px);right:-920px}.task-drawer.drawer.open{right:0}',
    '.task-form{display:flex;flex-direction:column;gap:20px}.task-form-row{display:grid;grid-template-columns:132px minmax(0,1fr);align-items:center;gap:12px}.task-form-label{text-align:right;color:#262626;white-space:nowrap}.task-required{color:#ff4d4f;margin-right:4px}',
    '.task-readonly-tag{display:inline-flex;width:fit-content;align-items:center;min-height:30px;padding:0 10px;border:1px solid #87e8de;border-radius:4px;background:#e6fffb;color:#13c2c2}.task-form-input{width:280px;height:34px;padding:0 10px;border:1px solid #d9d9d9;border-radius:2px;outline:none}.task-form-input:focus{border-color:#40a9ff;box-shadow:0 0 0 2px rgba(24,144,255,.12)}',
    '.task-setting-wrap{margin-left:144px;width:calc(100% - 144px);border:1px solid #f0f0f0}.task-setting-table{width:100%;border-collapse:collapse;table-layout:fixed}.task-setting-table th,.task-setting-table td{height:54px;padding:8px 10px;border-right:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:400}.task-setting-table th{height:40px;background:#fafafa;color:#262626;white-space:nowrap}.task-setting-table th:last-child,.task-setting-table td:last-child{border-right:0}.task-setting-table tbody tr:last-child td{border-bottom:0}',
    '.task-drag{color:#8c8c8c;font-size:18px;cursor:grab;user-select:none}.task-select,.task-number{width:100%;height:32px;padding:0 8px;border:1px solid #d9d9d9;border-radius:2px;background:#fff}.task-number-wrap{display:flex;align-items:center;gap:6px}.task-setting-remove{color:#ff4d4f;border:0;background:transparent;cursor:pointer}.task-add-row{display:flex;justify-content:center;align-items:center;height:42px;color:#262626;cursor:pointer;background:#fff}.task-add-row:hover{color:#1890ff;background:#f0f7ff}.task-drawer-footer{display:flex;justify-content:flex-end;align-items:center;height:56px;padding:0 20px;border-top:1px solid #f0f0f0}.task-submit{min-width:72px;height:32px;border:0;border-radius:2px;color:#fff;background:#1890ff;cursor:pointer}',
    '.task-setting-wrap{margin-left:0;width:100%}.task-setting-table th,.task-setting-table td{padding:8px 8px}.task-setting-table th{color:#344054;font-weight:600}.task-reward-cell{min-width:0!important;text-align:left!important}.task-reward-editor{min-width:0}.task-reward-controls{display:flex;align-items:center;gap:6px;min-width:0}.task-reward-controls .task-select{min-width:0;height:34px;color:#344054}.task-reward-type{flex:0 0 96px}.task-reward-item{flex:1 1 auto}.task-reward-quantity{flex:0 0 70px}.task-reward-add,.task-reward-clear{height:34px;border-radius:2px;padding:0 10px;white-space:nowrap;cursor:pointer}.task-reward-add{flex:0 0 54px;border:1px solid #1890ff;background:#1890ff;color:#fff}.task-reward-clear{flex:0 0 54px;border:1px solid #ff4d4f;background:#fff;color:#ff4d4f}.task-reward-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.task-reward-tag{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 8px;border:0;border-radius:2px;background:#29b6f6;color:#fff;font-size:12px;cursor:pointer}.task-reward-tag-icon{display:block;width:20px;height:20px;flex:0 0 20px;border-radius:2px;object-fit:cover;background:#eaf5ff}.task-reward-tag-icon.is-fallback{background:#f5f5f5}.task-reward-tag-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.task-reward-tag-close{font-size:15px;line-height:1}.task-reward-empty{margin-top:7px;color:#98a2b3;font-size:12px}.task-reward-editor .task-number{height:34px}.task-reward-editor .task-number-wrap{flex:1;min-width:0}.task-reward-editor .task-number-wrap span{color:#667085;white-space:nowrap}',
    '.task-status-ended{color:#f5222d}.task-status-pending{color:#fa8c16}.task-switch{position:relative;display:inline-flex;align-items:center;width:44px;height:22px;padding:2px;border:0;border-radius:12px;color:#fff;background:#1890ff;cursor:pointer;font-size:10px}.task-switch:after{content:"";width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transform:translateX(20px);transition:transform .16s}.task-switch.is-off{justify-content:flex-end;background:#bfbfbf}.task-switch.is-off:after{transform:translateX(-20px)}.task-detail{line-height:1.7;color:#262626;white-space:pre-line}.task-action-link{margin-right:10px;border:0;padding:0;color:#1890ff;background:transparent;cursor:pointer}.task-action-link.disabled{color:#bfbfbf;cursor:not-allowed}.task-empty-audit{padding:48px 0;color:#8c8c8c;text-align:center}.task-help-summary{margin:0 0 16px;color:#475467;font-size:12px;line-height:1.8}.task-help-section{margin:0 0 18px}.task-help-section:last-child{margin-bottom:0}.task-help-section-title{margin:0 0 8px;padding-left:8px;border-left:3px solid #1890ff;color:#262626;font-size:13px;font-weight:600;line-height:1.35}.task-help-section p,.task-help-section li{color:#475467;font-size:12px;line-height:1.8}.task-help-section ul{margin:0;padding-left:18px}.task-help-table-wrap{overflow-x:auto;border:1px solid #e5e7eb;border-radius:4px}.task-help-table{width:100%;min-width:430px;border-collapse:collapse;font-size:12px}.task-help-table th,.task-help-table td{padding:8px 9px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;color:#475467;line-height:1.55}.task-help-table th{background:#f8fafc;color:#344054;font-weight:600;white-space:nowrap}.task-help-table th:last-child,.task-help-table td:last-child{border-right:0}.task-help-table tbody tr:last-child td{border-bottom:0}.task-help-note{margin:0;padding:10px 12px;border-radius:4px;background:#fff7e6;color:#8c5a00;font-size:12px;line-height:1.75}',
    '.task-lang-bar{display:flex;align-items:center;gap:8px;min-height:48px;padding:8px 20px;background:#fafafa;border-bottom:1px solid #e8e8e8;overflow-x:auto}.task-lang-tab{height:30px;padding:0 14px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;color:#595959;cursor:pointer;font-size:13px;white-space:nowrap}.task-lang-tab.active{position:relative;border-color:#1677ff;background:#e6f4ff;color:#1677ff;font-weight:600}.task-lang-tab.active:after{content:"";position:absolute;right:0;bottom:-9px;left:0;height:2px;background:#1677ff}.task-lang-add{height:30px;padding:0 12px;border:1px dashed #b7c4d6;border-radius:4px;background:transparent;color:#1677ff;cursor:pointer;font-size:13px;white-space:nowrap}.task-lang-add:hover{border-color:#1677ff;background:#f5faff}.task-lang-modal{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}.task-lang-modal.open{display:flex}.task-lang-dialog{width:360px;padding:20px;border-radius:4px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.18)}.task-lang-dialog h3{margin:0 0 14px;font-size:16px}.task-lang-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.task-lang-option{height:36px;border:1px solid #d9d9d9;border-radius:2px;background:#fff;color:#344054;cursor:pointer}.task-lang-option:hover{border-color:#1890ff;color:#1890ff}.task-lang-dialog-footer{display:flex;justify-content:flex-end;margin-top:16px}',
    '@media(max-width:900px){.task-drawer.drawer{width:100vw;max-width:100vw;right:-100vw}.task-drawer.drawer.open{right:0}.task-form-row{grid-template-columns:100px minmax(0,1fr)}.task-setting-wrap{margin-left:0!important;width:100%!important;overflow-x:auto}.task-setting-table{min-width:760px}}',
    '</style>'
  ].join(''));

  document.title = '创作任务管理 - 大玩家后台';
  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML = '';
    initSidebar({ root: '../..', currentHref: 'admin/community/CreationTaskManage.html' });
  }

  ['help-fab', 'help-panel-overlay', 'help-panel'].forEach(function (id) {
    var node = document.getElementById(id);
    if (node) node.remove();
  });
  ['add-overlay', 'add-drawer', 'detail-overlay', 'detail-drawer', 'lang-picker', 'lang-picker-overlay'].forEach(function (id) {
    var node = document.getElementById(id);
    if (node) node.remove();
  });

  var page = document.getElementById('admin-main');
  page.innerHTML = [
    '<div class="page-card">',
      '<div class="tab-bar"><div class="tab-item active" id="task-tab-list">任务列表</div><div class="tab-item" id="task-tab-audit">审核列表</div></div>',
      '<div id="task-panel-list">',
        '<div class="filter-bar">',
          '<div class="filter-item"><span>所属版块：</span><select class="filter-select" id="task-board"><optgroup label="境内"><option value="境内/圣魂纷争" selected>圣魂纷争</option><option value="境内/吸血鬼手游">吸血鬼手游</option><option value="境内/天境传说手游">天境传说手游</option><option value="境内/逍遥情缘">逍遥情缘</option><option value="境内/太初界">太初界</option><option value="境内/钓鱼世界">钓鱼世界</option><option value="境内/泰坦降临">泰坦降临</option></optgroup><optgroup label="境外"><option value="境外/Last Light">Last Light</option><option value="境外/X-clash">X-clash</option></optgroup><option value="">不限</option></select></div>',
          '<div class="filter-item"><span>状态：</span><select class="filter-select" id="task-status"><option value="">不限</option><option value="待审核">待审核</option><option value="进行中">进行中</option><option value="已结束">已结束</option></select></div>',
          '<div class="filter-item"><select class="filter-select" id="task-key-type" style="min-width:112px;"><option value="id">任务ID</option><option value="name">任务名称</option></select><input class="filter-input" id="task-keyword" placeholder="请输入"></div>',
          '<button class="btn-query" id="task-query">查询</button>',
        '</div>',
        '<div class="action-bar"><div class="action-bar-left"><button class="btn-add" id="task-add">新增</button></div><div class="toolbar-icons"><div class="toolbar-icon" title="列设置">⊟</div><div class="toolbar-icon" title="刷新" id="task-refresh">↺</div><div class="toolbar-icon" title="全屏">⛶</div></div></div>',
        '<div class="table-wrap"><table><thead><tr><th></th><th>排序</th><th>任务ID</th><th>启用状态</th><th>任务名称</th><th>任务详情</th><th>状态</th><th>任务时间</th><th>备注</th><th>审核人</th><th>审核时间</th><th>操作</th></tr></thead><tbody id="task-table-body"></tbody></table></div>',
        '<div class="pagination"><span class="page-total" id="task-total">共1条</span><div class="page-btn disabled">‹</div><div class="page-btn active">1</div><div class="page-btn">›</div><select class="page-size-select"><option>10条/页</option><option>20条/页</option></select></div>',
      '</div>',
      '<div id="task-panel-audit" style="display:none;"><div class="filter-bar"><div class="filter-item"><span><span class="filter-required">*</span> 所属版块：</span><select class="filter-select"><option>超能世界</option></select></div><div class="filter-item"><span>任务名称：</span><input class="filter-input" placeholder="请输入任务名称"></div><button class="btn-query">查询</button></div><div class="task-empty-audit">暂无待审核创作任务</div></div>',
    '</div>',
    '<div class="drawer-overlay" id="task-overlay"></div>',
    '<div class="drawer task-drawer" id="task-drawer"><div class="drawer-header"><span class="drawer-title">新增创作任务</span><button class="drawer-close" id="task-close">×</button></div><div class="task-lang-bar" id="task-lang-bar" style="display:none;"></div><div class="drawer-body"><div class="task-form">',
      '<div class="task-form-row"><label class="task-form-label" for="task-name"><span class="task-required">*</span>任务名称：</label><input class="task-form-input" id="task-name" maxlength="30" placeholder="输入任务名称"></div>',
      '<div class="task-form-row"><label class="task-form-label" for="task-start"><span class="task-required">*</span>开始时间：</label><input class="task-form-input" id="task-start" type="datetime-local"></div>',
      '<div class="task-form-row"><label class="task-form-label" for="task-end"><span class="task-required">*</span>结束时间：</label><input class="task-form-input" id="task-end" type="datetime-local"></div>',
      '<div class="task-form-row"><div class="task-form-label"><span class="task-required">*</span>任务设置：</div><div></div></div>',
      '<div class="task-setting-wrap"><table class="task-setting-table"><thead><tr><th style="width:52px;">排序</th><th style="width:128px;">任务类型</th><th style="width:118px;">达成要求</th><th>奖励</th><th style="width:58px;">操作</th></tr></thead><tbody id="task-setting-body"></tbody></table><div class="task-add-row" id="task-add-row">⊕&nbsp; 添加任务</div></div>',
    '</div></div><div class="task-drawer-footer"><button class="task-submit" id="task-submit">提交</button></div></div>',
    '<div class="task-lang-modal" id="task-lang-modal"><div class="task-lang-dialog"><h3>添加语种</h3><div class="task-lang-options" id="task-lang-options"></div><div class="task-lang-dialog-footer"><button type="button" class="btn-copy" id="task-lang-cancel">取消</button></div></div></div>'
  ].join('');

  document.body.insertAdjacentHTML('beforeend', [
    '<div class="help-fab" id="task-help-fab"><div class="help-fab-icon">📋</div><div class="help-fab-text">需求说明</div></div>',
    '<div class="help-panel-overlay" id="task-help-overlay"></div>',
    '<div class="help-panel" id="task-help-panel"><div class="help-panel-header"><div class="help-panel-title">创作任务管理 v3.1.4 — 需求说明</div><button class="help-panel-close" id="task-help-close">×</button></div><div class="help-panel-body">',
      '<p class="task-help-summary">本次仅扩展「任务设置」中的奖励配置：奖品类型由原有的经验值扩展为经验值、游戏道具和个性装扮。</p>',
      '<section class="task-help-section"><h3 class="task-help-section-title">海外版块语种配置（v3.1.4）</h3><ul>',
        '<li>列表所属版块选择海外版块时，新增创作任务抽屉显示语种配置；选择国内版块时隐藏。</li>',
        '<li>切换不同语种时，已选择的游戏道具名称按当前语种同步切换展示；道具数量、奖励类型和已选道具配置保持不变。</li>',
      '</ul></section>',
      '<section class="task-help-section"><h3 class="task-help-section-title">本次新增字段</h3><div class="task-help-table-wrap"><table class="task-help-table"><thead><tr><th>奖品类型</th><th>新增字段</th><th>规则</th></tr></thead><tbody>',
        '<tr><td>经验值（默认）</td><td>经验值数量</td><td>必填，整数范围 1～999999。</td></tr>',
        '<tr><td>游戏道具</td><td>道具 ICON、道具选择、道具数量</td><td>道具 ICON 随所选道具读取；道具选择和数量均必填，数量为 1～999999。点击「添加」后生成「道具 ICON + 名称 + 数量」标签，可继续添加多个道具；单个标签可删除，也可一键清空。</td></tr>',
        '<tr><td>个性装扮</td><td>装扮类型、装扮选择</td><td>装扮类型为「头像框」或「个性背景」；先选类型，再选择对应装扮项。点击「添加」后生成标签，支持多个装扮、单项删除和一键清空。</td></tr>',
      '</tbody></table></div></section>',
      '<section class="task-help-section"><h3 class="task-help-section-title">交互与校验规则</h3><ul>',
        '<li>单项任务设置只能选择 1 种奖品类型：经验值、游戏道具、个性装扮三者互斥，不支持混合配置。</li>',
        '<li>奖品类型默认选中「经验值」，可切换为「游戏道具」或「个性装扮」；已添加游戏道具或个性装扮后，需先清空当前奖励，才可切换类型。</li>',
        '<li>游戏道具未选择道具或数量为空、非正数时，不允许添加，并提示填写正确数量。</li>',
        '<li>道具 ICON：随所选道具读取并以 20px 图标展示；无 ICON、ICON 地址为空或图片加载失败时，统一展示裂图 ICON 占位，标签仍保留道具名称与数量。</li>',
        '<li>提交时再次校验奖励：经验值数量不能为空；游戏道具和个性装扮至少需添加 1 个已确认标签。</li>',
      '</ul></section>',
    '</div></div>'
  ].join(''));

  var tasks = [{
    sort: 1, id: 3, enabled: true, board: '境内/圣魂纷争', name: '6月创作者任务',
    detail: '发帖达10次+100经验值\n评论达60次+300经验值\n获赞达100次+200经验值',
    status: '已结束', time: '2026-06-09 12:00:00~2026-06-30 23:59:59',
    note: '通过', reviewer: '梁仓', reviewTime: '2026-06-30 23:59:59'
  }];

  var languages = [
    { code: 'en', label: '英文' },
    { code: 'zh', label: '中文' }
  ];
  var languageOptions = [
    { code: 'ja', label: '日文' },
    { code: 'ko', label: '韩文' },
    { code: 'es', label: '西班牙文' },
    { code: 'pt', label: '葡萄牙文' },
    { code: 'de', label: '德文' },
    { code: 'fr', label: '法文' }
  ];
  var activeLanguage = 'en';
  var localizedTaskNames = { en: '', zh: '' };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function createItemIcon(svg) {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  var brokenItemIcon = createItemIcon('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#f5f5f5"/><path d="M5 7h22v18H5z" fill="none" stroke="#bfbfbf" stroke-width="2"/><path d="m7 22 6-6 4 4 3-3 5 5M10 11h.1" fill="none" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m20 6-4 7 4 1-4 8" fill="none" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  var gameItemIcons = {
    '金币（品质:3）': createItemIcon('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#f5b63e"/><circle cx="16" cy="16" r="9" fill="#ffd86b"/><path d="M16 9v14M12 12c1-2 7-2 8 1s-7 3-8 6 7 4 8 1" fill="none" stroke="#9a6500" stroke-width="2" stroke-linecap="round"/></svg>'),
    '位面星钻（品质:3）': createItemIcon('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="m16 3 11 10-11 16L5 13z" fill="#7b61ff"/><path d="m16 3 3 10-3 16-3-16z" fill="#b5a9ff"/><path d="m5 13 11 3 11-3" fill="none" stroke="#5140bb" stroke-width="2"/></svg>'),
    '强化石（品质:2）': createItemIcon('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="m9 4 13 2 6 11-7 11-13-2-4-12z" fill="#63b67b"/><path d="m9 4 4 11-5 11M22 6l-9 9 8 13M4 14l9 1 15 2" fill="none" stroke="#347447" stroke-width="2"/></svg>')
  };

  function renderTasks() {
    var keyword = document.getElementById('task-keyword').value.trim();
    var keyType = document.getElementById('task-key-type').value;
    var status = document.getElementById('task-status').value;
    var board = document.getElementById('task-board').value;
    var visible = tasks.filter(function (task) {
      var target = keyType === 'id' ? task.id : task.name;
      return (!keyword || String(target).indexOf(keyword) !== -1) && (!status || task.status === status) && (!board || task.board === board);
    });
    document.getElementById('task-table-body').innerHTML = visible.map(function (task) {
      var statusClass = task.status === '已结束' ? 'task-status-ended' : 'task-status-pending';
      var switchClass = task.enabled ? '' : ' is-off';
      return '<tr><td><span class="drag-handle">≡</span></td><td>' + task.sort + '</td><td>' + task.id + '</td><td><button class="task-switch' + switchClass + '" data-toggle="' + task.id + '" aria-label="切换启用状态"></button></td><td>' + escapeHtml(task.name) + '</td><td><div class="task-detail">' + escapeHtml(task.detail) + '</div></td><td><span class="' + statusClass + '">' + task.status + '</span></td><td>' + task.time + '</td><td>' + task.note + '</td><td>' + task.reviewer + '</td><td>' + task.reviewTime + '</td><td><button class="task-action-link" data-copy="' + task.id + '">复制</button><button class="task-action-link disabled" disabled>删除</button></td></tr>';
    }).join('');
    document.getElementById('task-total').textContent = '共' + visible.length + '条';
  }

  function addSettingRow() {
    var row = document.createElement('tr');
    var rewardState = {
      type: 'experience',
      experience: '',
      dressType: 'avatarFrame',
      entries: []
    };
    row._rewardState = rewardState;
    row.innerHTML = '<td><span class="task-drag">☰</span></td><td><select class="task-select"><option value="">请选择</option><option>发帖</option><option>评论</option><option>获赞</option></select></td><td><div class="task-number-wrap"><input class="task-number" min="1" type="number"><span>次</span></div></td><td class="task-reward-cell"><div class="task-reward-editor"></div></td><td><button class="task-setting-remove" type="button">删除</button></td>';
    var rewardEditor = row.querySelector('.task-reward-editor');

    function option(value, label, selected) {
      return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
    }

    function renderTags() {
      if (!rewardState.entries.length) return '';
      return '<div class="task-reward-tags">' + rewardState.entries.map(function (entry, index) {
        var isItem = entry.type === 'item';
        var icon = entry.icon || brokenItemIcon;
        var iconClass = entry.icon ? '' : ' is-fallback';
        var iconHtml = isItem
          ? '<img class="task-reward-tag-icon' + iconClass + '" src="' + escapeHtml(icon) + '" data-fallback="' + escapeHtml(brokenItemIcon) + '" alt="道具图标" onerror="this.onerror=null;this.src=this.dataset.fallback;this.classList.add(\'is-fallback\');">'
          : '';
        return '<button type="button" class="task-reward-tag" data-reward-remove="' + index + '">' + iconHtml + '<span class="task-reward-tag-text">' + escapeHtml(entry.label) + '</span><span class="task-reward-tag-close">×</span></button>';
      }).join('') + '</div>';
    }

    function rewardTypeSelect() {
      var locked = rewardState.entries.length ? ' disabled' : '';
      return '<select class="task-select task-reward-type" data-reward-type' + locked + '>' +
        option('experience', '经验值', rewardState.type === 'experience') +
        option('item', '游戏道具', rewardState.type === 'item') +
        option('dress', '个性装扮', rewardState.type === 'dress') +
      '</select>';
    }

    function renderRewardEditor() {
      var content = '';
      if (rewardState.type === 'experience') {
        content = '<div class="task-reward-controls">' + rewardTypeSelect() +
          '<div class="task-number-wrap"><input class="task-number task-reward-item" data-experience min="1" max="999999" required type="number" placeholder="输入经验值数量" value="' + escapeHtml(rewardState.experience) + '"><span>经验值</span></div>' +
        '</div>';
      } else if (rewardState.type === 'item') {
        content = '<div class="task-reward-controls">' + rewardTypeSelect() +
          '<select class="task-select task-reward-item" data-reward-item><option value="">请选择道具</option><option value="金币（品质:3）">金币（品质:3）</option><option value="位面星钻（品质:3）">位面星钻（品质:3）</option><option value="强化石（品质:2）">强化石（品质:2）</option></select>' +
          '<input class="task-number task-reward-quantity" data-reward-quantity min="1" max="999999" required type="number" placeholder="数量">' +
          '<button type="button" class="task-reward-add" data-reward-add>添加</button><button type="button" class="task-reward-clear" data-reward-clear>清空</button>' +
        '</div>' + renderTags();
      } else {
        var dressOptions = rewardState.dressType === 'avatarFrame'
          ? '<option value="">请选择装扮项</option><option value="璀璨荣耀头像框">璀璨荣耀头像框</option><option value="星耀之环头像框">星耀之环头像框</option>'
          : '<option value="">请选择装扮项</option><option value="星河之境个性背景">星河之境个性背景</option><option value="幻海流光个性背景">幻海流光个性背景</option>';
        content = '<div class="task-reward-controls">' + rewardTypeSelect() +
          '<select class="task-select" style="flex:0 0 88px;" data-dress-type>' + option('avatarFrame', '头像框', rewardState.dressType === 'avatarFrame') + option('background', '个性背景', rewardState.dressType === 'background') + '</select>' +
          '<select class="task-select task-reward-item" data-dress-item>' + dressOptions + '</select>' +
          '<button type="button" class="task-reward-add" data-dress-add>添加</button><button type="button" class="task-reward-clear" data-reward-clear>清空</button>' +
        '</div>' + renderTags();
      }
      rewardEditor.innerHTML = content;
    }

    rewardEditor.addEventListener('change', function (event) {
      if (event.target.hasAttribute('data-reward-type')) {
        rewardState.type = event.target.value;
        rewardState.experience = '';
        rewardState.entries = [];
        renderRewardEditor();
      } else if (event.target.hasAttribute('data-dress-type')) {
        rewardState.dressType = event.target.value;
        renderRewardEditor();
      } else if (event.target.hasAttribute('data-experience')) {
        rewardState.experience = event.target.value;
      }
    });
    rewardEditor.addEventListener('click', function (event) {
      var removeButton = event.target.closest('[data-reward-remove]');
      if (removeButton) {
        rewardState.entries.splice(Number(removeButton.dataset.rewardRemove), 1);
        renderRewardEditor();
        return;
      }
      if (event.target.closest('[data-reward-clear]')) {
        rewardState.entries = [];
        renderRewardEditor();
        return;
      }
      if (event.target.closest('[data-reward-add]')) {
        var item = rewardEditor.querySelector('[data-reward-item]').value;
        var quantity = rewardEditor.querySelector('[data-reward-quantity]').value;
        if (!item || !quantity || Number(quantity) < 1) {
          alert('请选择道具并填写正确数量');
          return;
        }
        rewardState.entries.push({ type: 'item', icon: gameItemIcons[item] || '', label: item + '；数量：' + quantity });
        renderRewardEditor();
        return;
      }
      if (event.target.closest('[data-dress-add]')) {
        var dressType = rewardEditor.querySelector('[data-dress-type]');
        var dressItem = rewardEditor.querySelector('[data-dress-item]').value;
        if (!dressItem) {
          alert('请选择装扮项');
          return;
        }
        rewardState.entries.push({ label: dressType.options[dressType.selectedIndex].text + '：' + dressItem });
        renderRewardEditor();
      }
    });
    renderRewardEditor();
    row.querySelector('.task-setting-remove').addEventListener('click', function () {
      if (document.querySelectorAll('#task-setting-body tr').length === 1) {
        alert('至少保留一项任务设置');
        return;
      }
      row.remove();
    });
    document.getElementById('task-setting-body').appendChild(row);
  }

  function saveActiveLanguageName() {
    var input = document.getElementById('task-name');
    if (input) localizedTaskNames[activeLanguage] = input.value;
  }

  function languageLabel(code) {
    var language = languages.find(function (item) { return item.code === code; });
    return language ? language.label : '';
  }

  function switchTaskLanguage(code) {
    saveActiveLanguageName();
    activeLanguage = code;
    var input = document.getElementById('task-name');
    if (input) {
      input.value = localizedTaskNames[code] || '';
      input.placeholder = code === 'en' ? '输入英文任务名称' : code === 'zh' ? '输入中文任务名称' : '输入' + languageLabel(code) + '任务名称';
    }
    document.querySelectorAll('#task-lang-bar .task-lang-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.lang === code);
    });
  }

  function renderTaskLanguageTabs() {
    var bar = document.getElementById('task-lang-bar');
    if (!bar) return;
    var overseas = isOverseasBoard(document.getElementById('task-board').value);
    bar.style.display = overseas ? 'flex' : 'none';
    if (!overseas) return;
    bar.innerHTML = languages.map(function (language) {
      return '<button type="button" class="task-lang-tab' + (language.code === activeLanguage ? ' active' : '') + '" data-lang="' + language.code + '">' + language.label + '</button>';
    }).join('') + '<button type="button" class="task-lang-add" id="task-lang-add">+ 添加语种</button>';
    document.getElementById('task-lang-add').addEventListener('click', openLanguageModal);
  }

  function openLanguageModal() {
    var options = document.getElementById('task-lang-options');
    options.innerHTML = languageOptions.filter(function (item) {
      return !languages.some(function (language) { return language.code === item.code; });
    }).map(function (item) {
      return '<button type="button" class="task-lang-option" data-add-lang="' + item.code + '">' + item.label + '</button>';
    }).join('') || '<div style="grid-column:1/-1;color:#98a2b3;font-size:12px;">暂无可添加语种</div>';
    document.getElementById('task-lang-modal').classList.add('open');
  }

  function addTaskLanguage(code) {
    var item = languageOptions.find(function (language) { return language.code === code; });
    if (!item || languages.some(function (language) { return language.code === code; })) return;
    saveActiveLanguageName();
    languages.push(item);
    localizedTaskNames[code] = '';
    document.getElementById('task-lang-modal').classList.remove('open');
    renderTaskLanguageTabs();
    switchTaskLanguage(code);
  }

  function isOverseasBoard(value) {
    return String(value || '').indexOf('境外/') === 0;
  }

  function resetTaskLanguages(overseas) {
    languages = overseas
      ? [{ code: 'en', label: '英文' }, { code: 'zh', label: '中文' }]
      : [{ code: 'en', label: '英文' }];
    activeLanguage = 'en';
    localizedTaskNames = { en: '', zh: '' };
    renderTaskLanguageTabs();
    var input = document.getElementById('task-name');
    if (input) {
      input.value = '';
      input.placeholder = '输入任务名称';
    }
  }

  function openDrawer() {
    resetTaskLanguages(isOverseasBoard(document.getElementById('task-board').value));
    document.getElementById('task-overlay').classList.add('open');
    document.getElementById('task-drawer').classList.add('open');
  }
  function closeDrawer() {
    document.getElementById('task-overlay').classList.remove('open');
    document.getElementById('task-drawer').classList.remove('open');
  }
  function switchPanel(panel) {
    var isList = panel === 'list';
    document.getElementById('task-tab-list').classList.toggle('active', isList);
    document.getElementById('task-tab-audit').classList.toggle('active', !isList);
    document.getElementById('task-panel-list').style.display = isList ? '' : 'none';
    document.getElementById('task-panel-audit').style.display = isList ? 'none' : '';
  }

  document.getElementById('task-query').addEventListener('click', renderTasks);
  document.getElementById('task-board').addEventListener('change', function () {
    if (document.getElementById('task-drawer').classList.contains('open')) {
      resetTaskLanguages(isOverseasBoard(this.value));
    }
  });
  document.getElementById('task-refresh').addEventListener('click', function () {
    document.getElementById('task-status').value = '';
    document.getElementById('task-keyword').value = '';
    document.getElementById('task-board').value = '境内/圣魂纷争';
    renderTasks();
  });
  document.getElementById('task-tab-list').addEventListener('click', function () { switchPanel('list'); });
  document.getElementById('task-tab-audit').addEventListener('click', function () { switchPanel('audit'); });
  document.getElementById('task-add').addEventListener('click', openDrawer);
  document.getElementById('task-close').addEventListener('click', closeDrawer);
  document.getElementById('task-overlay').addEventListener('click', closeDrawer);
  document.getElementById('task-add-row').addEventListener('click', addSettingRow);
  document.getElementById('task-lang-modal').addEventListener('click', function (event) {
    if (event.target === this) {
      this.classList.remove('open');
      return;
    }
    var addButton = event.target.closest('[data-add-lang]');
    if (addButton) addTaskLanguage(addButton.dataset.addLang);
  });
  document.getElementById('task-lang-cancel').addEventListener('click', function () {
    document.getElementById('task-lang-modal').classList.remove('open');
  });
  document.getElementById('task-table-body').addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      var task = tasks.find(function (item) { return String(item.id) === toggle.dataset.toggle; });
      task.enabled = !task.enabled;
      renderTasks();
    }
    var copy = event.target.closest('[data-copy]');
    if (copy) alert('已复制任务 ' + copy.dataset.copy);
  });
  document.getElementById('task-submit').addEventListener('click', function () {
    saveActiveLanguageName();
    var localizedNames = languages.reduce(function (result, language) {
      result[language.code] = String(localizedTaskNames[language.code] || '').trim();
      return result;
    }, {});
    var hasAnyName = languages.some(function (language) {
      return localizedNames[language.code];
    });
    var name = localizedNames.zh || localizedNames.en || localizedNames[languages[0].code] || '';
    var start = document.getElementById('task-start').value;
    var end = document.getElementById('task-end').value;
    var board = document.getElementById('task-board').value || '境内/圣魂纷争';
    if (!hasAnyName || !start || !end) {
      alert('请至少填写一种语言的任务名称、开始时间和结束时间');
      return;
    }
    if (start >= end) {
      alert('结束时间必须晚于开始时间');
      return;
    }
    var rewardRows = Array.prototype.slice.call(document.querySelectorAll('#task-setting-body tr'));
    for (var index = 0; index < rewardRows.length; index += 1) {
      var rewardState = rewardRows[index]._rewardState;
      if (!rewardState) continue;
      if (rewardState.type === 'experience' && (!rewardState.experience || Number(rewardState.experience) < 1)) {
        alert('请填写第' + (index + 1) + '项任务的经验值数量');
        return;
      }
      if (rewardState.type === 'item' && !rewardState.entries.length) {
        alert('请至少添加一个游戏道具');
        return;
      }
      if (rewardState.type === 'dress' && !rewardState.entries.length) {
        alert('请至少添加一个个性装扮');
        return;
      }
    }
    tasks.unshift({ sort: tasks.length + 1, id: tasks.length + 3, enabled: true, board: board, name: name, localizedNames: localizedNames, detail: '待补充任务设置', status: '待审核', time: start.replace('T', ' ') + '~' + end.replace('T', ' '), note: '-', reviewer: '-', reviewTime: '-' });
    closeDrawer();
    renderTasks();
    alert('创作任务已提交，等待审核');
  });
  addSettingRow();
  renderTasks();

  var helpPanel = document.getElementById('task-help-panel');
  var helpOverlay = document.getElementById('task-help-overlay');
  function closeHelp() {
    helpPanel.classList.remove('open');
    helpOverlay.classList.remove('open');
  }
  document.getElementById('task-help-fab').addEventListener('click', function () {
    helpPanel.classList.add('open');
    helpOverlay.classList.add('open');
  });
  document.getElementById('task-help-close').addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', closeHelp);
}());
