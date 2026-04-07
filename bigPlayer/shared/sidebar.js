/**
 * 大玩家 — 通用侧边导航渲染 & 交互
 *
 * 使用方式：
 *   1. 在 HTML 的 <head> 引入 sidebar.css
 *   2. 在 </body> 前依次引入 sidebar-data.js、sidebar.js
 *   3. 在页面中放置 <nav id="sidebar"></nav>
 *   4. 调用 initSidebar({ root, currentHref })
 *      - root: bigPlayer 根目录相对于当前页面的路径，如 '../../..'
 *      - currentHref: 当前页面相对于 bigPlayer 根目录的路径，如 'client/profile/personalization/Badge.html'
 */

function initSidebar({ root = '.', currentHref = '' } = {}) {
  const nav = document.getElementById('sidebar');
  if (!nav) return;

  // 标准化路径比较（去掉多余斜杠、忽略大小写）
  function normPath(p) {
    return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').toLowerCase();
  }
  const current = normPath(currentHref);

  function buildTree(nodes, depth) {
    const wrap = document.createElement('div');

    nodes.forEach(node => {
      if (node.type === 'group') {
        const group = document.createElement('div');
        group.className = 'nav-group';

        const label = document.createElement('div');
        label.className = 'nav-group-label';
        label.textContent = node.label;
        group.appendChild(label);

        if (node.children && node.children.length) {
          group.appendChild(buildTree(node.children, depth + 1));
        }
        wrap.appendChild(group);

      } else if (node.type === 'dir') {
        const dirEl = document.createElement('div');
        dirEl.className = 'nav-dir';

        // 检查子树是否包含当前页面 → 决定默认展开
        const hasActive = containsCurrent(node, current, normPath);
        if (hasActive) dirEl.classList.add('open');

        const arrow = document.createElement('span');
        arrow.className = 'nav-dir-arrow';
        arrow.textContent = '▶';
        dirEl.appendChild(arrow);

        const txt = document.createElement('span');
        txt.textContent = node.label;
        dirEl.appendChild(txt);

        const childWrap = document.createElement('div');
        childWrap.className = 'nav-children';
        if (!hasActive) childWrap.style.display = 'none';

        if (node.children && node.children.length) {
          childWrap.appendChild(buildTree(node.children, depth + 1));
        }

        dirEl.addEventListener('click', () => {
          const isOpen = dirEl.classList.toggle('open');
          childWrap.style.display = isOpen ? '' : 'none';
        });

        wrap.appendChild(dirEl);
        wrap.appendChild(childWrap);

      } else if (node.type === 'item') {
        const a = document.createElement('a');
        a.className = 'nav-item';
        a.href = root + '/' + node.href;

        const dot = document.createElement('span');
        dot.className = 'nav-item-dot';

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        name.textContent = node.label;

        const ver = document.createElement('span');
        ver.className = 'nav-version';
        ver.textContent = node.version || '';

        a.appendChild(dot);
        a.appendChild(name);
        a.appendChild(ver);

        if (normPath(node.href) === current) {
          a.classList.add('active');
        }

        wrap.appendChild(a);
      }
    });

    return wrap;
  }

  function containsCurrent(node, current, norm) {
    if (node.type === 'item') {
      return norm(node.href) === current;
    }
    if (node.children) {
      return node.children.some(c => containsCurrent(c, current, norm));
    }
    return false;
  }

  // Logo
  const logo = document.createElement('div');
  logo.className = 'sidebar-logo';
  logo.innerHTML = '<span class="logo-main">大玩家</span><span class="logo-tag">原型</span>';
  nav.appendChild(logo);

  // 渲染目录树
  nav.appendChild(buildTree(SIDEBAR_DATA, 0));
}
