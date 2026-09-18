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
  // 舆情 Scope 的唯一状态源在 PublicOpinionScope；侧栏只订阅快照并转发共享字段。
  function publicOpinionScope() { return window.PublicOpinionScope?.selected?.() || null; }
  const isPublicOpinionPage = path => normPath(path).startsWith('admin/publicopinion/');
  const isPublicOpinionWorkbench = isPublicOpinionPage(currentHref);
  if (isPublicOpinionWorkbench) nav.classList.add('sidebar--public-opinion');
  const PUBLIC_OPINION_ICONS = {
    overview: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/></svg>',
    content: '<svg viewBox="0 0 24 24" focusable="false"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>',
    alerts: '<svg viewBox="0 0 24 24" focusable="false"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    sources: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="8" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M16 7h5m-2.5-2.5v5M16 14h5M16 18h5"/></svg>',
    runs: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M8 3l-2 3M16 3l2 3"/></svg>',
    keywords: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M7 10h6M10 7v6"/></svg>'
  };
  const navigationData = isPublicOpinionWorkbench ? PUBLIC_OPINION_SIDEBAR_DATA : SIDEBAR_DATA;
  const initialScopeParams = new URLSearchParams(location.search);
  function hrefFor(node) {
    const params = new URLSearchParams();
    if (isPublicOpinionPage(currentHref) && isPublicOpinionPage(node.href)) {
      const scope = publicOpinionScope();
      const regionCode = scope?.regionCode || initialScopeParams.get('regionCode');
      const communityId = scope?.communityId || initialScopeParams.get('communityId');
      const platform = scope?.platform || initialScopeParams.get('platform');
      if (regionCode) params.set('regionCode', regionCode);
      if (communityId) params.set('communityId', communityId);
      if (platform) params.set('platform', platform);
    }
    const query = params.toString();
    return root + '/' + node.href + (query ? `?${query}` : '') + (node.screenId ? '#' + node.screenId : '');
  }

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
  collectItems(navigationData, []);

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
          a.href = hrefFor(node);
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
        a.href = hrefFor(node);

        let marker;
        if (isPublicOpinionWorkbench && node.icon) {
          const icon = document.createElement('span');
          icon.className = 'nav-item-icon';
          icon.innerHTML = PUBLIC_OPINION_ICONS[node.icon] || PUBLIC_OPINION_ICONS.overview;
          icon.setAttribute('aria-hidden', 'true');
          marker = icon;
        } else {
          const dot = document.createElement('span');
          dot.className = 'nav-item-dot';
          marker = dot;
        }

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        name.textContent = node.label;

        const ver = document.createElement('span');
        ver.className = 'nav-version';
        ver.textContent = node.version || '';

        a.appendChild(marker);
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
  logo.innerHTML = isPublicOpinionWorkbench
    ? '<span class="logo-main">舆情分析系统</span><span class="logo-sub">OPERATION CENTER</span>'
    : '<span class="logo-main">大玩家</span><span class="logo-tag">原型</span>';
  nav.appendChild(logo);

  // 搜索框
  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search';
  searchWrap.innerHTML = '<input class="sidebar-search-input" placeholder="搜索页面…" autocomplete="off" spellcheck="false"><div class="sidebar-search-results"></div>';
  if (!isPublicOpinionWorkbench) nav.appendChild(searchWrap);

  const searchInput = searchWrap.querySelector('.sidebar-search-input');
  const searchResults = searchWrap.querySelector('.sidebar-search-results');

  // 目录树容器（方便在搜索时隐藏）
  const treeWrap = document.createElement('div');
  treeWrap.className = 'sidebar-tree';
  treeWrap.appendChild(buildTree(navigationData, 0));
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
      a.href = hrefFor(node);

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
  function refreshPublicOpinionLinks() {
    allItems.forEach(({ el, node }) => { el.href = hrefFor(node); });
  }
  window.addEventListener('public-opinion-scope-change', refreshPublicOpinionLinks);

  // ── 侧边栏滚动位置记忆 ──
  // 多页面架构每次跳转都重建 sidebar DOM，浏览器会把滚动条复位到顶部。
  // 这里在跳转前把"用户最后稳定停留的 scrollTop"存入 sessionStorage，
  // 新页面 initSidebar 完成后再恢复，使侧边栏停在用户刚才的位置，不弹回顶部。
  // 关键：scroll 事件只更新内存值 lastUserScroll，不直接落盘——因为导航前
  // 浏览器/框架会 scrollIntoView 目标链接，那次 scroll 会把 nav.scrollTop 改成
  // "让链接可见"的值，若直接落盘会污染覆盖用户真实位置。真正落盘只在 click
  // 捕获阶段（先于导航）和 pagehide 兜底。
  const SCROLL_KEY = 'sidebar.scrollTop';
  let lastUserScroll = 0;          // 用户最后一次滚动稳定的位置（内存态）
  let restoring = false;           // 恢复期间触发的 scroll 不更新 lastUserScroll
  let committed = false;           // 已为本次导航落盘后，后续 scroll 一律忽略

  function restoreScroll() {
    const saved = parseInt(sessionStorage.getItem(SCROLL_KEY), 10);
    if (isNaN(saved) || saved <= 0) return;
    restoring = true;
    nav.scrollTop = saved;
    lastUserScroll = saved;
    requestAnimationFrame(() => { restoring = false; });
  }
  restoreScroll();
  requestAnimationFrame(restoreScroll); // 兜底：等 sticky 布局稳定后再恢复一次

  let scrollTimer = null;
  nav.addEventListener('scroll', () => {
    if (restoring || committed) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { lastUserScroll = nav.scrollTop; }, 80);
  });
  // 点击链接：捕获阶段（先于导航、先于框架 scrollIntoView）落盘内存里的真实位置，
  // 随后 committed=true 拦截导航卸载期间的一切 scroll 污染。
  nav.addEventListener('click', () => {
    if (restoring || committed) return;
    try { sessionStorage.setItem(SCROLL_KEY, String(lastUserScroll)); } catch (e) { /* ignore */ }
    committed = true;
  }, true);
  // pagehide 兜底：未点链接就关闭/刷新时也存一次
  window.addEventListener('pagehide', () => {
    if (committed || restoring) return;
    try { sessionStorage.setItem(SCROLL_KEY, String(lastUserScroll)); } catch (e) { /* ignore */ }
  });
}
