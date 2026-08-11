const AdminSidebar = {
  sections: [
    {
      label: 'SDK 管理',
      items: [
        { label: '工作台',   dir: 'schemeManagement', file: 'sdkSchemeManagement.html', icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
        { label: '方案管理', dir: 'schemeManagement', file: 'schemeList.html',          icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>' },
        { label: '特殊方案', dir: 'schemeManagement', file: 'specialScheme.html',        icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
        { label: '配置中心', dir: 'config',            file: 'configList.html',          icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' }
      ]
    }
  ],

  // 当前文件名（不含路径）
  _currentFile() {
    return location.pathname.split('/').pop() || '';
  },

  // 当前所在目录名（schemeManagement / config / ...）
  _currentDir() {
    const parts = location.pathname.split('/');
    return parts.length >= 2 ? parts[parts.length - 2] : '';
  },

  // 从当前目录指向 targetDir 的相对前缀
  _prefix(targetDir) {
    const cur = this._currentDir();
    if (cur === targetDir) return '';
    return `../${targetDir}/`;
  },

  // 判断某个菜单项是否是当前激活项
  _isActive(item) {
    const cur = this._currentFile();
    if (cur === item.file) return true;
    // configCreate / channelGroupCreate / channelGroupManagement 均归属配置中心
    const configPages = ['configCreate.html', 'channelGroupManagement.html', 'channelGroupCreate.html'];
    if (item.file === 'configList.html' && configPages.includes(cur)) return true;
    return false;
  },

  render() {
    let storedPending = false;
    try { storedPending = localStorage.getItem('sdkConfigAuditPending') === 'true'; } catch (e) {}
    const hasPendingAudit = Boolean(window.__configAuditPending || storedPending || document.querySelector('.ops .op-audit'));
    let html = '<nav class="sidebar">';
    this.sections.forEach((section, si) => {
      if (si > 0) html += '<div class="sb-divider"></div>';
      html += '<div class="sb-section">';
      html += `<div class="sb-section-label">${section.label}</div>`;
      section.items.forEach(item => {
        const href = this._prefix(item.dir) + item.file;
        const active = this._isActive(item) ? ' active' : '';
        const click = active ? '' : ` onclick="location.href='${href}'"`;
        html += `<div class="nav-item${active}"${click}>`;
        html += `<span class="icon"><svg viewBox="0 0 24 24">${item.icon}</svg></span>`;
        html += `<span>${item.label}</span>`;
        if (item.file === 'configList.html' && hasPendingAudit) html += '<i class="nav-audit-dot" aria-hidden="true"></i>';
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</nav>';
    return html;
  },

  inject() {
    // 替换已存在的硬编码 sidebar，或插入到 app-shell 开头
    const existing = document.querySelector('.app-shell nav.sidebar, nav.sidebar');
    if (existing) {
      existing.outerHTML = this.render();
    } else {
      const shell = document.querySelector('.app-shell');
      if (shell) shell.insertAdjacentHTML('afterbegin', this.render());
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AdminSidebar.inject();
});
