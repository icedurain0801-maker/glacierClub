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

  // 收集所有叶节点（用于搜索），breadcrumb 为祖先 label 组成的路径字符串
  const searchIndex = [];
  function collectItems(nodes, ancestors) {
    nodes.forEach(node => {
      if (node.type === 'item') {
        searchIndex.push({ node, breadcrumb: ancestors.join(' › ') });
      } else {
        // dir 节点若自带 href 也加入索引
        if (node.type === 'dir' && node.href) {
          searchIndex.push({ node, breadcrumb: ancestors.join(' › ') });
        }
        if (node.children && node.children.length) {
          collectItems(node.children, node.type === 'group' ? ancestors : [...ancestors, node.label]);
        }
      }
    });
  }
  collectItems(SIDEBAR_DATA, []);

  // 收集所有 item 链接，用于 hashchange 时动态更新高亮
  const allItems = []; // { el, node }

  function isActiveNow(node) {
    if (normPath(node.href) !== current) return false;
    return (node.screenId || '') === location.hash.slice(1);
  }

  function updateActive() {
    allItems.forEach(({ el, node }) => {
      el.classList.toggle('active', isActiveNow(node));
    });
  }

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

        // 默认全部展开
        const hasActive = containsCurrent(node, current, normPath);
        dirEl.classList.add('open');

        const arrow = document.createElement('span');
        arrow.className = 'nav-dir-arrow';
        arrow.textContent = '▶';
        dirEl.appendChild(arrow);

        if (node.href) {
          const a = document.createElement('a');
          a.className = 'nav-dir-link';
          a.href = root + '/' + node.href + (node.screenId ? '#' + node.screenId : '');
          a.textContent = node.label;
          allItems.push({ el: a, node });
          dirEl.appendChild(a);
          if (node.version) {
            const ver = document.createElement('span');
            ver.className = 'nav-version';
            ver.textContent = node.version;
            dirEl.appendChild(ver);
          }
        } else {
          const txt = document.createElement('span');
          txt.textContent = node.label;
          dirEl.appendChild(txt);
        }

        const childWrap = document.createElement('div');
        childWrap.className = 'nav-children';
        if (!hasActive) childWrap.style.display = '';

        if (node.children && node.children.length) {
          childWrap.appendChild(buildTree(node.children, depth + 1));
        }

        dirEl.addEventListener('click', e => {
          if (e.target.classList.contains('nav-dir-link')) return;
          const isOpen = dirEl.classList.toggle('open');
          childWrap.style.display = isOpen ? '' : 'none';
        });

        wrap.appendChild(dirEl);
        wrap.appendChild(childWrap);

      } else if (node.type === 'item') {
        const a = document.createElement('a');
        a.className = 'nav-item';
        a.href = root + '/' + node.href + (node.screenId ? '#' + node.screenId : '');

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

        allItems.push({ el: a, node });
        wrap.appendChild(a);
      }
    });

    return wrap;
  }

  function containsCurrent(node, current, norm) {
    if (node.type === 'item') {
      return norm(node.href) === current;
    }
    if (node.type === 'dir' && node.href && norm(node.href) === current) {
      return true;
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

  // 搜索框
  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search';
  searchWrap.innerHTML = '<input class="sidebar-search-input" placeholder="搜索页面…" autocomplete="off" spellcheck="false"><div class="sidebar-search-results"></div>';
  nav.appendChild(searchWrap);

  const searchInput = searchWrap.querySelector('.sidebar-search-input');
  const searchResults = searchWrap.querySelector('.sidebar-search-results');

  // 目录树容器（方便在搜索时隐藏）
  const treeWrap = document.createElement('div');
  treeWrap.className = 'sidebar-tree';
  treeWrap.appendChild(buildTree(SIDEBAR_DATA, 0));
  nav.appendChild(treeWrap);

  function highlight(text, kw) {
    if (!kw) return document.createTextNode(text);
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx === -1) return document.createTextNode(text);
    const span = document.createElement('span');
    span.appendChild(document.createTextNode(text.slice(0, idx)));
    const em = document.createElement('em');
    em.className = 'sidebar-search-hl';
    em.textContent = text.slice(idx, idx + kw.length);
    span.appendChild(em);
    span.appendChild(document.createTextNode(text.slice(idx + kw.length)));
    return span;
  }

  searchInput.addEventListener('input', () => {
    const kw = searchInput.value.trim();
    if (!kw) {
      searchResults.style.display = 'none';
      treeWrap.style.display = '';
      return;
    }
    treeWrap.style.display = 'none';
    searchResults.style.display = 'block';

    const kwLower = kw.toLowerCase();
    const matched = searchIndex.filter(({ node, breadcrumb }) =>
      node.label.toLowerCase().includes(kwLower) ||
      breadcrumb.toLowerCase().includes(kwLower) ||
      (node.version || '').toLowerCase().includes(kwLower)
    );

    searchResults.innerHTML = '';
    if (!matched.length) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-search-empty';
      empty.textContent = '无匹配结果';
      searchResults.appendChild(empty);
      return;
    }

    matched.forEach(({ node, breadcrumb }) => {
      const a = document.createElement('a');
      a.className = 'sidebar-search-item';
      a.href = root + '/' + node.href + (node.screenId ? '#' + node.screenId : '');

      const nameEl = document.createElement('div');
      nameEl.className = 'sidebar-search-item-name';
      nameEl.appendChild(highlight(node.label, kw));

      const pathEl = document.createElement('div');
      pathEl.className = 'sidebar-search-item-path';
      if (breadcrumb) pathEl.appendChild(highlight(breadcrumb, kw));

      a.appendChild(nameEl);
      if (breadcrumb) a.appendChild(pathEl);
      searchResults.appendChild(a);
    });
  });

  // 初始高亮 + hash 变化时更新高亮
  updateActive();
  window.addEventListener('hashchange', updateActive);
}
