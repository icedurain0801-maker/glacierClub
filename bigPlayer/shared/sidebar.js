/**
 * 大玩家通用侧边导航渲染与交互。
 * 舆情分析工作台通过路径门禁使用独立的数据、样式和状态。
 */

function initSidebar({ root = '.', currentHref = '' } = {}) {
  const nav = document.getElementById('sidebar');
  if (!nav) return;

  function normPath(path) {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').toLowerCase();
  }

  const current = normPath(currentHref);
  const isPublicOpinionPage = path => normPath(path).startsWith('admin/publicopinion/');
  const isPublicOpinionWorkbench = isPublicOpinionPage(currentHref);

  if (isPublicOpinionWorkbench) {
    nav.classList.add('sidebar--public-opinion');
  } else {
    nav.classList.add('sidebar--fixed-left');
    document.body.classList.add('has-fixed-sidebar');
  }

  function publicOpinionScope() {
    return window.PublicOpinionScope?.selected?.() || null;
  }

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
    if (isPublicOpinionWorkbench && isPublicOpinionPage(node.href)) {
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

  const searchIndex = [];
  function collectItems(nodes, ancestors) {
    nodes.forEach(node => {
      if (node.type === 'item') {
        searchIndex.push({ node, breadcrumb: ancestors.join(' › ') });
      } else {
        if (node.type === 'dir' && node.href) {
          searchIndex.push({ node, breadcrumb: ancestors.join(' › ') });
        }
        if (node.children && node.children.length) {
          collectItems(node.children, node.type === 'group' ? ancestors : [...ancestors, node.label]);
        }
      }
    });
  }
  if (!isPublicOpinionWorkbench) collectItems(navigationData, []);

  const allItems = [];

  function isActiveNow(node) {
    if (normPath(node.href) !== current) return false;
    return (node.screenId || '') === location.hash.slice(1);
  }

  function updateActive() {
    allItems.forEach(({ el, node }) => {
      el.classList.toggle('active', isActiveNow(node));
    });
  }

  function containsCurrent(node) {
    if (node.type === 'item') return normPath(node.href) === current;
    if (node.type === 'dir' && node.href && normPath(node.href) === current) return true;
    return Boolean(node.children?.some(containsCurrent));
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

        if (node.children?.length) group.appendChild(buildTree(node.children, depth + 1));
        wrap.appendChild(group);
        return;
      }

      if (node.type === 'dir') {
        const dirEl = document.createElement('div');
        dirEl.className = 'nav-dir open';
        const hasActive = containsCurrent(node);

        const arrow = document.createElement('span');
        arrow.className = 'nav-dir-arrow';
        arrow.textContent = '▶';
        dirEl.appendChild(arrow);

        if (node.href) {
          const link = document.createElement('a');
          link.className = 'nav-dir-link';
          link.href = hrefFor(node);
          link.textContent = node.label;
          allItems.push({ el: link, node });
          dirEl.appendChild(link);

          if (node.version) {
            const version = document.createElement('span');
            version.className = 'nav-version';
            version.textContent = node.version;
            dirEl.appendChild(version);
          }
        } else {
          const text = document.createElement('span');
          text.textContent = node.label;
          dirEl.appendChild(text);
        }

        const childWrap = document.createElement('div');
        childWrap.className = 'nav-children';
        if (!hasActive) childWrap.style.display = '';
        if (node.children?.length) childWrap.appendChild(buildTree(node.children, depth + 1));

        dirEl.addEventListener('click', event => {
          if (event.target.classList.contains('nav-dir-link')) return;
          const isOpen = dirEl.classList.toggle('open');
          childWrap.style.display = isOpen ? '' : 'none';
        });

        wrap.appendChild(dirEl);
        wrap.appendChild(childWrap);
        return;
      }

      if (node.type === 'item') {
        const link = document.createElement('a');
        link.className = 'nav-item';
        link.href = hrefFor(node);

        let marker;
        if (isPublicOpinionWorkbench && node.icon) {
          marker = document.createElement('span');
          marker.className = 'nav-item-icon';
          marker.innerHTML = PUBLIC_OPINION_ICONS[node.icon] || PUBLIC_OPINION_ICONS.overview;
          marker.setAttribute('aria-hidden', 'true');
        } else {
          marker = document.createElement('span');
          marker.className = 'nav-item-dot';
        }

        const name = document.createElement('span');
        name.className = 'nav-item-name';
        name.textContent = node.label;

        const version = document.createElement('span');
        version.className = 'nav-version';
        version.textContent = node.version || '';

        link.append(marker, name, version);
        allItems.push({ el: link, node });
        wrap.appendChild(link);
      }
    });

    return wrap;
  }

  const logo = document.createElement('div');
  logo.className = 'sidebar-logo';
  logo.innerHTML = isPublicOpinionWorkbench
    ? '<span class="logo-main">舆情分析系统</span><span class="logo-sub">OPERATION CENTER</span>'
    : '<span class="logo-main">大玩家</span><span class="logo-tag">原型</span>';
  nav.appendChild(logo);

  let searchInput = null;
  let searchResults = null;
  if (!isPublicOpinionWorkbench) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'sidebar-search';
    searchWrap.innerHTML = '<input class="sidebar-search-input" placeholder="搜索页面…" autocomplete="off" spellcheck="false"><div class="sidebar-search-results"></div>';
    nav.appendChild(searchWrap);
    searchInput = searchWrap.querySelector('.sidebar-search-input');
    searchResults = searchWrap.querySelector('.sidebar-search-results');
  }

  const treeWrap = document.createElement('div');
  treeWrap.className = 'sidebar-tree';
  treeWrap.appendChild(buildTree(navigationData, 0));
  nav.appendChild(treeWrap);

  if (!isPublicOpinionWorkbench) {
    const SEARCH_KEY = 'bigPlayer.sidebar.searchQuery';
    const WINDOW_NAME_SEARCH_PREFIX = '__bigplayerSidebarSearch__=';

    function highlight(text, keyword) {
      if (!keyword) return document.createTextNode(text);
      const index = text.toLowerCase().indexOf(keyword.toLowerCase());
      if (index === -1) return document.createTextNode(text);

      const span = document.createElement('span');
      span.appendChild(document.createTextNode(text.slice(0, index)));
      const mark = document.createElement('em');
      mark.className = 'sidebar-search-hl';
      mark.textContent = text.slice(index, index + keyword.length);
      span.appendChild(mark);
      span.appendChild(document.createTextNode(text.slice(index + keyword.length)));
      return span;
    }

    function readWindowNameSearch() {
      try {
        const part = (window.name || '').split('|').find(item => item.startsWith(WINDOW_NAME_SEARCH_PREFIX));
        return part ? decodeURIComponent(part.slice(WINDOW_NAME_SEARCH_PREFIX.length)) : '';
      } catch (error) {
        return '';
      }
    }

    function persistWindowNameSearch(rawValue) {
      try {
        const parts = (window.name || '')
          .split('|')
          .filter(item => item && !item.startsWith(WINDOW_NAME_SEARCH_PREFIX));
        if (rawValue.trim()) parts.push(WINDOW_NAME_SEARCH_PREFIX + encodeURIComponent(rawValue));
        window.name = parts.join('|');
      } catch (error) {
        // window.name 不可用时仅依赖 sessionStorage。
      }
    }

    function persistSearch(rawValue) {
      try {
        if (rawValue.trim()) sessionStorage.setItem(SEARCH_KEY, rawValue);
        else sessionStorage.removeItem(SEARCH_KEY);
      } catch (error) {
        // 内嵌预览可能禁用 Web Storage，继续使用 window.name。
      }
      persistWindowNameSearch(rawValue);
    }

    function renderSearch(rawValue) {
      const keyword = rawValue.trim();
      if (!keyword) {
        searchResults.style.display = 'none';
        treeWrap.style.display = '';
        return;
      }

      treeWrap.style.display = 'none';
      searchResults.style.display = 'block';
      const lowerKeyword = keyword.toLowerCase();
      const matched = searchIndex.filter(({ node, breadcrumb }) =>
        node.label.toLowerCase().includes(lowerKeyword) ||
        breadcrumb.toLowerCase().includes(lowerKeyword) ||
        (node.version || '').toLowerCase().includes(lowerKeyword)
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
        const link = document.createElement('a');
        link.className = 'sidebar-search-item';
        link.href = hrefFor(node);

        const name = document.createElement('div');
        name.className = 'sidebar-search-item-name';
        name.appendChild(highlight(node.label, keyword));
        link.appendChild(name);

        if (breadcrumb) {
          const path = document.createElement('div');
          path.className = 'sidebar-search-item-path';
          path.appendChild(highlight(breadcrumb, keyword));
          link.appendChild(path);
        }
        searchResults.appendChild(link);
      });
    }

    searchInput.addEventListener('input', () => {
      persistSearch(searchInput.value);
      renderSearch(searchInput.value);
    });

    let savedSearch = '';
    try {
      savedSearch = sessionStorage.getItem(SEARCH_KEY) || '';
    } catch (error) {
      // 继续读取同页签 window.name 镜像。
    }
    savedSearch = savedSearch || readWindowNameSearch();
    if (savedSearch.trim()) {
      searchInput.value = savedSearch;
      renderSearch(savedSearch);
    }
  }

  updateActive();
  window.addEventListener('hashchange', updateActive);

  if (isPublicOpinionWorkbench) {
    window.addEventListener('public-opinion-scope-change', () => {
      allItems.forEach(({ el, node }) => { el.href = hrefFor(node); });
    });
  }

  const SCROLL_KEY = isPublicOpinionWorkbench
    ? 'publicOpinion.sidebar.scrollTop'
    : 'bigPlayer.sidebar.scrollTop';
  let lastUserScroll = 0;
  let restoring = false;
  let committed = false;

  function restoreScroll() {
    let saved = 0;
    try {
      saved = parseInt(sessionStorage.getItem(SCROLL_KEY), 10);
    } catch (error) {
      return;
    }
    if (Number.isNaN(saved) || saved <= 0) return;
    restoring = true;
    nav.scrollTop = saved;
    lastUserScroll = saved;
    requestAnimationFrame(() => { restoring = false; });
  }

  restoreScroll();
  requestAnimationFrame(restoreScroll);

  let scrollTimer = null;
  nav.addEventListener('scroll', () => {
    if (restoring || committed) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { lastUserScroll = nav.scrollTop; }, 80);
  });

  nav.addEventListener('click', event => {
    if (!event.target.closest('a[href]') || restoring || committed) return;
    try {
      sessionStorage.setItem(SCROLL_KEY, String(lastUserScroll));
    } catch (error) {
      // 存储失败不影响导航。
    }
    committed = true;
  }, true);

  window.addEventListener('pagehide', () => {
    if (committed || restoring) return;
    try {
      sessionStorage.setItem(SCROLL_KEY, String(lastUserScroll));
    } catch (error) {
      // 存储失败不影响页面关闭。
    }
  });
}
